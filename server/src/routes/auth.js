import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { User } from "../models/User.js";
import { authenticate } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { AppError, asyncRoute } from "../utils/errors.js";
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase().trim());
const credentials = z.object({ email, password: z.string().min(10).max(72) });
const register = credentials.extend({ name: z.string().trim().min(2).max(80) });
const cookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/api",
  maxAge: 3600000,
};
const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
});
export function authRoutes() {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === "test" ? 1000 : 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication requests. Please retry later.",
        },
      },
      skip: (req) => req.method === "GET",
    }),
  );
  router.post(
    "/register",
    asyncRoute(async (req, res) => {
      const input = register.parse(req.body);
      if (Buffer.byteLength(input.password, "utf8") > 72)
        throw new AppError(
          400,
          "INVALID_PASSWORD",
          "Use a password of at most 72 UTF-8 bytes.",
        );
      const user = await User.create({
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
      });
      res.status(201).json({ user: publicUser(user) });
    }),
  );
  router.post(
    "/login",
    asyncRoute(async (req, res) => {
      const input = credentials.parse(req.body);
      const user = await User.findOne({ email: input.email }).select(
        "+passwordHash",
      );
      if (!user || !(await bcrypt.compare(input.password, user.passwordHash)))
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "The email or password is incorrect.",
        );
      const token = jwt.sign({ ver: user.sessionVersion }, env.JWT_SECRET, {
        subject: String(user._id),
        issuer: "roottrace",
        expiresIn: "1h",
        algorithm: "HS256",
      });
      res.cookie("session", token, cookie).json({ user: publicUser(user) });
    }),
  );
  router.get("/me", authenticate, (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  router.post(
    "/logout",
    authenticate,
    asyncRoute(async (req, res) => {
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { sessionVersion: 1 } },
      );
      res
        .clearCookie("session", { ...cookie, maxAge: undefined })
        .status(204)
        .end();
    }),
  );
  return router;
}
