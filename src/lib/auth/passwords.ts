import crypto from "node:crypto";
import * as argon2 from "argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** A one-time, server-generated temporary password: 9 random bytes as base64url (12 chars). */
export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}
