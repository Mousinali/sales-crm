import type { Pool } from "pg";
import { hashPassword } from "./passwords";
import { recordAuditLog } from "@/lib/audit/log";

export async function changePassword(pool: Pool, input: { userId: number; newPassword: string }): Promise<void> {
  const passwordHash = await hashPassword(input.newPassword);

  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2`,
    [passwordHash, input.userId],
  );

  await recordAuditLog(pool, { actorUserId: input.userId, action: "user.password_changed", targetTable: "users", targetId: input.userId });
}
