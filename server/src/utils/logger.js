import pino from "pino";
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "secret",
      "apiKey",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});
