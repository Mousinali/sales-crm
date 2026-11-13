import type { Pool } from "pg";
import { recordAuditLog } from "@/lib/audit/log";
import { CompanyNotFoundError } from "./errors";

// A "company" is just the set of leads sharing a normalized name (see
// types.ts) — there's no company row to delete, so "deleting" a company
// archives every one of its leads at once.
export async function archiveCompany(pool: Pool, actorId: number, companyNameNormalized: string): Promise<number> {
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
  if (rowCount) {
    await recordAuditLog(pool, { actorUserId: actorId, action: "company.archived", details: { name: companyNameNormalized } });
  }
  return rowCount ?? 0;
}

// Restores every archived lead for this company at once — the mirror of
// archiveCompany above.
export async function restoreCompany(pool: Pool, actorId: number, companyNameNormalized: string): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE leads SET archived_at = NULL, updated_at = now() WHERE company_name_normalized = $1 AND archived_at IS NOT NULL",
    [companyNameNormalized],
  );
  if (!rowCount) {
    const { rows } = await pool.query("SELECT 1 FROM leads WHERE company_name_normalized = $1 LIMIT 1", [companyNameNormalized]);
    if (rows.length === 0) {
      throw new CompanyNotFoundError(`No company "${companyNameNormalized}"`);
    }
    // Every lead was already active — a harmless no-op, not an error.
  }
  if (rowCount) {
    await recordAuditLog(pool, { actorUserId: actorId, action: "company.restored", details: { name: companyNameNormalized } });
  }
  return rowCount ?? 0;
}
