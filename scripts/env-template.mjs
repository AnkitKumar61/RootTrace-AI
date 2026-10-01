import { randomBytes } from "node:crypto";
export function populateSecrets(contents) {
  for (const name of ["JWT_SECRET", "AI_SERVICE_SECRET"]) {
    const pattern = new RegExp(`^${name}=[ \t]*\r?$`, "m");
    if (pattern.test(contents))
      contents = contents.replace(
        pattern,
        `${name}=${randomBytes(48).toString("base64url")}`,
      );
  }
  return contents;
}
