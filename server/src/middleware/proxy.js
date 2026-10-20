import { timingSafeEqual } from "node:crypto";

// Only the Vercel proxy knows this value. User authentication still applies.
export function proxyAccess(secret) {
  const expected = Buffer.from(secret);
  return (req, res, next) => {
    // Render's liveness probe must work without access to private configuration.
    if (
      !secret ||
      (["GET", "HEAD"].includes(req.method) && /^\/health\/?$/.test(req.path))
    )
      return next();
    const supplied = Buffer.from(req.get("X-RootTrace-Proxy") || "");
    if (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    )
      return next();
    return res.status(403).json({
      error: {
        code: "PROXY_REQUIRED",
        message: "Access this service through the application.",
      },
    });
  };
}
