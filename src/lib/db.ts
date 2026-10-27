import { Pool, types, type QueryResult, type QueryResultRow } from "pg";

// By default node-postgres returns BIGINT (OID 20) columns as strings, since
// a bigint can exceed Number.MAX_SAFE_INTEGER. Our BIGSERIAL ids/counters
// will never approach 2^53, so parsing them as numbers here is safe and
// keeps every id a real `number` at every call site, not a string.
types.setTypeParser(20, (val) => parseInt(val, 10));

// DATE (OID 1082) defaults to a JS Date parsed in local time, which shifts
// a plain calendar date like '2026-11-10' to the previous day in any
// timezone behind UTC. Our DATE columns (e.g. client_visits.visit_date)
// are plain dates with no time component, so keep them as the raw string.
types.setTypeParser(1082, (val) => val);

// One pool for the whole process. Next.js dev server reuses modules across
// requests, so this module-level pool is created once and shared.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
