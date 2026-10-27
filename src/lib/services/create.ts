import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import { ServiceActionNotAllowedError, ServiceNameAlreadyExistsError } from "./errors";
import type { ServiceRow } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function createService(
  pool: Pool,
  input: { actorId: number; actorRole: Role; name: string; description?: string },
): Promise<ServiceRow> {
  if (input.actorRole !== "SUPER_ADMIN") {
    throw new ServiceActionNotAllowedError(`${input.actorRole} cannot create services`);
  }

  let service: ServiceRow;
  try {
    const { rows } = await pool.query<ServiceRow>(
      `INSERT INTO services (name, description) VALUES ($1, $2) RETURNING *`,
      [input.name, input.description ?? null],
    );
    service = rows[0];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new ServiceNameAlreadyExistsError(`A service named "${input.name}" already exists`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "service.created",
    targetTable: "services",
    targetId: service.id,
    details: { name: input.name },
  });

  return service;
}
