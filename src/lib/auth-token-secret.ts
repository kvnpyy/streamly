import { createHash, randomBytes } from "node:crypto";

export function hashAuthToken(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

export function generateAuthTokenPlain(): string {
  return randomBytes(32).toString("base64url");
}
