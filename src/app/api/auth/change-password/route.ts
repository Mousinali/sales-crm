import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { getCurrentUserFromRequest, sessionTokenFromRequest } from "../../../../lib/auth/rbac";
import { changePassword } from "../../../../lib/auth/changePassword";
import { verifyPassword } from "../../../../lib/auth/passwords";
import { revokeOtherSessions } from "../../../../lib/auth/session";

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
  }

  await changePassword(pool, { userId: user.id, newPassword: parsed.data.password });

  const currentToken = sessionTokenFromRequest(request);
  if (currentToken) {
    await revokeOtherSessions(user.id, currentToken);
  }

  return NextResponse.json({ ok: true });
}
