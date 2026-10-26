import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { recordAuditLog } from "../audit/log";
import { revokeAllSessions } from "../auth/session";
import { assertManageable } from "./guard";
import { EmailAlreadyExistsError } from "./errors";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function updateUserProfile(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number; name?: string; email?: string },
): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    fields.push(`name = $${params.length}`);
  }
  if (input.email !== undefined) {
    params.push(input.email);
    fields.push(`email = $${params.length}`);
  }
  if (fields.length === 0) return;

  params.push(input.targetId);
  try {
    await pool.query(`UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new EmailAlreadyExistsError(`${input.email} is already in use`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.updated",
    targetTable: "users",
    targetId: input.targetId,
    details: { name: input.name, email: input.email },
  });
}

export async function setUserStatus(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number; status: "ACTIVE" | "INACTIVE" },
): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  await pool.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [input.status, input.targetId]);

  // Deactivating must also cut off any session already issued, so a
  // reactivation later doesn't silently resurrect old logins.
  if (input.status === "INACTIVE") {
    await revokeAllSessions(input.targetId);
  }

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: input.status === "ACTIVE" ? "user.activated" : "user.deactivated",
    targetTable: "users",
    targetId: input.targetId,
  });
}
