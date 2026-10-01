import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { AppError, asyncRoute } from "../utils/errors.js";
export const authenticate = asyncRoute(async (req, _res, next) => {
  let claims;
  try {
    claims = jwt.verify(req.cookies.session || "", env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "roottrace",
    });
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
  }
  const user = await User.findById(claims.sub);
  if (!user || user.sessionVersion !== claims.ver)
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "Your session has expired. Please log in again.",
    );
  req.user = user;
  next();
});
export function checkOrigin(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if ((origin && origin !== env.CLIENT_URL) || (req.cookies.session && !origin))
    return next(
      new AppError(
        403,
        "INVALID_ORIGIN",
        "This request origin is not allowed.",
      ),
    );
  next();
}
