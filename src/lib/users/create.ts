import type { Pool } from "pg";
import { hashPassword, generateTempPassword } from "@/lib/auth/passwords";
import { canManage, type Role } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import { RoleNotManageableError, EmailAlreadyExistsError } from "./errors";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function createUser(
  pool: Pool,
  input: {
    creatorId: number;
    creatorRole: Role;
    role: Role;
    name: string;
    email: string;
    employeeId?: string;
    phone?: string;
    whatsappNumber?: string;
    designation?: string;
  },
): Promise<{ id: number; email: string; tempPassword: string }> {
  if (!canManage(input.creatorRole, input.role)) {
    throw new RoleNotManageableError(`${input.creatorRole} cannot create ${input.role} accounts`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  let id: number;
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (role, name, email, password_hash, status, created_by, must_change_password, employee_id, phone, whatsapp_number, designation)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, true, $6, $7, $8, $9)
       RETURNING id`,
      [input.role, input.name, input.email, passwordHash, input.creatorId, input.employeeId ?? null, input.phone ?? null, input.whatsappNumber ?? null, input.designation ?? null],
    );
    id = rows[0].id;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new EmailAlreadyExistsError(`${input.email} is already in use`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.creatorId,
    action: "user.created",
    targetTable: "users",
    targetId: id,
    details: { role: input.role, email: input.email },
  });

  return { id, email: input.email, tempPassword };
}
