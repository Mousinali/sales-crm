import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest, sessionTokenFromRequest } from "@/lib/auth/rbac";
import { changePassword } from "@/lib/auth/changePassword";
import { verifyPassword } from "@/lib/auth/passwords";
import { revokeOtherSessions } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rateLimit";

const CHANGE_PASSWORD_RATE_LIMIT = 5;
const CHANGE_PASSWORD_RATE_WINDOW_MS = 15 * 60_000;

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  password: z.string().min(8),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // A user who still has a forced temp password already proved they know it
  // by using it to establish this very session, so the current-password
  // check only applies once that forced flow is no longer in effect —
  // otherwise any hijacked session could set a new password with no
  // verification at all, turning a stolen cookie into permanent account
  // takeover.
  if (!user.mustChangePassword) {
    // req.md §13 "rate-limit login and sensitive operations": without this,
    // a stolen session cookie turns into a password oracle — unlimited
    // currentPassword guesses with no account lockout. Keyed by the
    // session's own verified user id, not a client-supplied value.
    if (!checkRateLimit(`change-password:${user.id}`, CHANGE_PASSWORD_RATE_LIMIT, CHANGE_PASSWORD_RATE_WINDOW_MS)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    const currentPasswordHash = rows[0]?.password_hash;
    const verified =
      !!parsed.data.currentPassword &&
      !!currentPasswordHash &&
      (await verifyPassword(currentPasswordHash, parsed.data.currentPassword));

    if (!verified) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    resetRateLimit(`change-password:${user.id}`);
  }

  await changePassword(pool, { userId: user.id, newPassword: parsed.data.password });

  const currentToken = sessionTokenFromRequest(request);
  if (currentToken) {
    await revokeOtherSessions(user.id, currentToken);
  }

  return NextResponse.json({ ok: true });
}
