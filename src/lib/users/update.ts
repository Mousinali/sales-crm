import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import { revokeAllSessions } from "@/lib/auth/session";
import { assertManageable } from "./guard";
import { EmailAlreadyExistsError, UserActionNotAllowedError } from "./errors";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function updateUserProfile(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    targetId: number;
    name?: string;
    email?: string;
    employeeId?: string;
    phone?: string;
    whatsappNumber?: string;
    designation?: string;
  },
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
  if (input.employeeId !== undefined) {
    params.push(input.employeeId || null);
    fields.push(`employee_id = $${params.length}`);
  }
  if (input.phone !== undefined) {
    params.push(input.phone || null);
    fields.push(`phone = $${params.length}`);
  }
  if (input.whatsappNumber !== undefined) {
    params.push(input.whatsappNumber || null);
    fields.push(`whatsapp_number = $${params.length}`);
  }
  if (input.designation !== undefined) {
    params.push(input.designation || null);
    fields.push(`designation = $${params.length}`);
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

// Self-service only (no `assertManageable` check): a user sets their own
// photo, never someone else's, so there's no role-hierarchy question here
// the way there is for `updateUserProfile`.
export async function updateOwnAvatar(pool: Pool, userId: number, avatarUrl: string | null): Promise<void> {
  await pool.query(`UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2`, [avatarUrl, userId]);
}

// Self-service only, same reasoning as `updateOwnAvatar` — and deliberately
// narrower than `updateUserProfile`: a user can correct their own contact
// number, but name/email/employee ID/designation stay admin-managed via Team.
export async function updateOwnContactDetails(
  pool: Pool,
  userId: number,
  input: { phone?: string; whatsappNumber?: string },
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.phone !== undefined) {
    params.push(input.phone || null);
    fields.push(`phone = $${params.length}`);
  }
  if (input.whatsappNumber !== undefined) {
    params.push(input.whatsappNumber || null);
    fields.push(`whatsapp_number = $${params.length}`);
  }
  if (fields.length === 0) return;

  params.push(userId);
  await pool.query(`UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
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

// "Deleting" a user is a soft archive (like a lead's — see
// lib/leads/update.ts), not a hard DELETE: their history (audit logs,
// authored leads/tasks/etc.) stays intact, they just stop showing up
// anywhere a user is picked or listed. Requires the account to already be
// INACTIVE, so "delete" is always a deliberate second step after
// deactivating, never a one-click removal of someone still active.
export async function archiveUser(pool: Pool, input: { actorId: number; actorRole: Role; targetId: number }): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const { rows } = await pool.query<{ name: string; status: "ACTIVE" | "INACTIVE"; archived_at: Date | null }>(
    "SELECT name, status, archived_at FROM users WHERE id = $1",
    [input.targetId],
  );
  const target = rows[0];
  if (!target || target.archived_at) return;
  if (target.status !== "INACTIVE") {
    throw new UserActionNotAllowedError("Deactivate the account before deleting it");
  }

  await pool.query("UPDATE users SET archived_at = now(), updated_at = now() WHERE id = $1", [input.targetId]);
  await revokeAllSessions(input.targetId);

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.archived",
    targetTable: "users",
    targetId: input.targetId,
    details: { name: target.name },
  });
}

// Restores an archived user back into every list/picker — the mirror of
// archiveUser above. Their status stays INACTIVE (restoring is just
// "unhide," not "reactivate"); re-enabling login is still the separate
// setUserStatus step.
export async function restoreUser(pool: Pool, input: { actorId: number; actorRole: Role; targetId: number }): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const { rows } = await pool.query<{ name: string; archived_at: Date | null }>("SELECT name, archived_at FROM users WHERE id = $1", [input.targetId]);
  const target = rows[0];
  if (!target || !target.archived_at) return;

  await pool.query("UPDATE users SET archived_at = NULL, updated_at = now() WHERE id = $1", [input.targetId]);

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.restored",
    targetTable: "users",
    targetId: input.targetId,
    details: { name: target.name },
  });
}
