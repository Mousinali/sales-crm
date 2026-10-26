import crypto from "node:crypto";
import { pool } from "@/lib/db";
import type { Role } from "./roles";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME!;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a new session for `userId`, returning the raw token (to be set in
 * a cookie by the caller) and its expiry. Only the token's SHA-256 hash is
 * persisted — the raw token is never stored.
 */
export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_HOURS) * 3600_000);

  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return { token, expiresAt };
}

/**
 * Resolves a raw session token to its owning user, but only when the
 * session is neither revoked nor expired AND the user is still ACTIVE.
 * All three checks happen in the SQL WHERE clause so a revoked/expired
 * session or a deactivated user's session is rejected by the database
 * itself, not by filtering the result afterward.
 */
export async function getSessionUser(
  token: string,
): Promise<{ id: number; role: Role; name: string; email: string; status: "ACTIVE" | "INACTIVE"; must_change_password: boolean } | null> {
  const tokenHash = hashToken(token);

  const { rows } = await pool.query<{
    id: number;
    role: Role;
    name: string;
    email: string;
    status: "ACTIVE" | "INACTIVE";
    must_change_password: boolean;
  }>(
    `SELECT u.id, u.role, u.name, u.email, u.status, u.must_change_password
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'ACTIVE'`,
    [tokenHash],
  );

  return rows[0] ?? null;
}

/** Marks a session as revoked so it immediately stops resolving. */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
}

/** Revokes every session for `userId` except the one named by `keepToken` — used after a password change to cut off any other active sessions (e.g. one held by an attacker) while leaving the caller's own session intact. */
export async function revokeOtherSessions(userId: number, keepToken: string): Promise<void> {
  const keepTokenHash = hashToken(keepToken);

  await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
    [userId, keepTokenHash],
  );
}

/**
 * Revokes every active session for `userId`, with no exception — used when
 * an admin resets a user's access or deactivates the account, so a session
 * obtained before that change (e.g. by an attacker) cannot survive it.
 */
export async function revokeAllSessions(userId: number): Promise<void> {
  await pool.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
