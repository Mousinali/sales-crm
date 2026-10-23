import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { canManage } from "../auth/roles";
import { RoleNotManageableError, UserNotFoundError } from "./errors";

/** Resolves `targetId`'s role and throws unless `actorRole` may manage it. Returns the target's role on success. */
export async function assertManageable(pool: Pool, actorRole: Role, targetId: number): Promise<Role> {
  const { rows } = await pool.query<{ role: Role }>("SELECT role FROM users WHERE id = $1", [targetId]);
  const target = rows[0];
  if (!target) {
    throw new UserNotFoundError(`No user with id ${targetId}`);
  }
  if (!canManage(actorRole, target.role)) {
    throw new RoleNotManageableError(`${actorRole} cannot manage ${target.role} accounts`);
  }
  return target.role;
}
