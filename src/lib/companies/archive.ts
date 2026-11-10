import type { Pool } from "pg";
import { CompanyNotFoundError } from "./errors";

// A "company" is just the set of leads sharing a normalized name (see
// types.ts) — there's no company row to delete, so "deleting" a company
// archives every one of its leads at once. One-way, same as archiving a
// single lead (lib/leads/update.ts) — there is no unarchive path.
export async function archiveCompany(pool: Pool, companyNameNormalized: string): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE leads SET archived_at = now(), updated_at = now() WHERE company_name_normalized = $1 AND archived_at IS NULL",
    [companyNameNormalized],
  );
  if (!rowCount) {
    const { rows } = await pool.query("SELECT 1 FROM leads WHERE company_name_normalized = $1 LIMIT 1", [companyNameNormalized]);
    if (rows.length === 0) {
      throw new CompanyNotFoundError(`No company "${companyNameNormalized}"`);
    }
    // Every lead was already archived — a harmless no-op, not an error.
  }
  return rowCount ?? 0;
}
