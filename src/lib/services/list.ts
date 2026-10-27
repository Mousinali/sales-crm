import type { Pool } from "pg";
import type { ServiceRow, ServiceStatus } from "./types";

export async function listServices(pool: Pool, filters?: { status?: ServiceStatus }): Promise<ServiceRow[]> {
  const { rows } = await pool.query<ServiceRow>(
    `SELECT * FROM services ${filters?.status ? "WHERE status = $1" : ""} ORDER BY name`,
    filters?.status ? [filters.status] : [],
  );
  return rows;
}
