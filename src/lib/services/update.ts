import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import { ServiceActionNotAllowedError, ServiceNotFoundError, ServiceNameAlreadyExistsError } from "./errors";
import type { ServiceRow, ServiceStatus } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function updateService(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    serviceId: number;
    fields: Partial<{ name: string; description: string; status: ServiceStatus }>;
  },
): Promise<ServiceRow> {
  if (input.actorRole !== "SUPER_ADMIN") {
    throw new ServiceActionNotAllowedError(`${input.actorRole} cannot edit services`);
  }

  const fields = input.fields;
  const columns: string[] = [];
  const params: unknown[] = [];
  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }
  if (fields.name !== undefined) set("name", fields.name);
  if (fields.description !== undefined) set("description", fields.description);
  if (fields.status !== undefined) set("status", fields.status);

  if (columns.length === 0) {
    const { rows } = await pool.query<ServiceRow>("SELECT * FROM services WHERE id = $1", [input.serviceId]);
    if (!rows[0]) throw new ServiceNotFoundError(`No service with id ${input.serviceId}`);
    return rows[0];
  }

  params.push(input.serviceId);

  let service: ServiceRow;
  try {
    const { rows } = await pool.query<ServiceRow>(
      `UPDATE services SET ${columns.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows[0]) throw new ServiceNotFoundError(`No service with id ${input.serviceId}`);
    service = rows[0];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new ServiceNameAlreadyExistsError(`A service named "${fields.name}" already exists`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "service.updated",
    targetTable: "services",
    targetId: service.id,
    details: fields,
  });

  return service;
}
