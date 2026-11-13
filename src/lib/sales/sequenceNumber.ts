import type { PoolClient } from "pg";

// Indian financial year runs Apr-Mar, written as the two 2-digit year
// halves (FY2026-27 -> "2627") to match the "TS252601"-style IDs.
export function financialYearCode(date: Date): string {
  const startYear = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${String(startYear % 100).padStart(2, "0")}${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Shared by sale numbers (TS...) and payment numbers (PY...): must run
// inside a transaction already holding pg_advisory_xact_lock for this
// prefix+FY, so two concurrent inserts can't compute the same sequence.
// shortcut: sequence is a row count, not a dedicated counter table - fine
// for this volume; move to a sequence table if rows ever get deleted and
// re-used numbers become a problem.
export async function nextSequenceNumber(client: PoolClient, table: "sales" | "sale_payments", column: string, prefix: string, date: Date): Promise<string> {
  const fullPrefix = `${prefix}${financialYearCode(date)}`;
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*) FROM ${table} WHERE ${column} LIKE $1`,
    [`${fullPrefix}%`],
  );
  const seq = Number(rows[0].count) + 1;
  return `${fullPrefix}${String(seq).padStart(2, "0")}`;
}
