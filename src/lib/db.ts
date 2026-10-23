import { Pool, type QueryResult, type QueryResultRow } from "pg";

// One pool for the whole process. Next.js dev server reuses modules across
// requests, so this module-level pool is created once and shared.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
