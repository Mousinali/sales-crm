import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { hashPassword, generateTempPassword } from "../auth/passwords";
import { recordAuditLog } from "../audit/log";
import { assertManageable } from "./guard";

export async function resetUserAccess(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number },
): Promise<{ tempPassword: string }> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now() WHERE id = $2`,
    [passwordHash, input.targetId],
  );

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.access_reset",
    targetTable: "users",
    targetId: input.targetId,
  });

  return { tempPassword };
}
