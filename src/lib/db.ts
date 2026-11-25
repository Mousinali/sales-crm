import { Client, Pool, types, type QueryResult, type QueryResultRow } from "pg";

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

// Postgres text can't hold a NUL character, so one pasted into any field or
// search box would fail the whole query. Dropped here, once, for every query.
export function stripNul(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("\0", "");
  return Array.isArray(value) ? value.map(stripNul) : value;
}

class NulSafeClient extends Client {
  // `never`: query() is heavily overloaded, and everything but the values array passes straight through.
  query(...args: unknown[]): never {
    if (Array.isArray(args[1])) args[1] = args[1].map(stripNul);
    return (super.query as (...a: unknown[]) => unknown).apply(this, args) as never;
  }
}

// One pool for the whole process. Next.js dev server reuses modules across
// requests, so this module-level pool is created once and shared.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, Client: NulSafeClient });

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
