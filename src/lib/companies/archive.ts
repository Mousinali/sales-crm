import type { Pool } from "pg";
import { recordAuditLog } from "@/lib/audit/log";
import { CompanyNotFoundError } from "./errors";

// A "company" is just the set of leads sharing a normalized name (see
// types.ts) — there's no company row to delete, so "deleting" a company
// archives every one of its leads at once.
export async function archiveCompany(pool: Pool, actorId: number, companyNameNormalized: string): Promise<number> {
  const { rows: archived } = await pool.query<{ id: number }>(
    "UPDATE leads SET archived_at = now(), updated_at = now() WHERE company_name_normalized = $1 AND archived_at IS NULL RETURNING id",
    [companyNameNormalized],
  );
  const rowCount = archived.length;
  if (!rowCount) {
    const { rows } = await pool.query("SELECT 1 FROM leads WHERE company_name_normalized = $1 LIMIT 1", [companyNameNormalized]);
    if (rows.length === 0) {
      throw new CompanyNotFoundError(`No company "${companyNameNormalized}"`);
    }
    // Every lead was already archived — a harmless no-op, not an error.
  }
  if (rowCount) {
    // One timeline entry per archived lead, so each lead's own activity shows it.
    await pool.query(
      "INSERT INTO lead_activities (lead_id, actor_user_id, type) SELECT unnest($1::bigint[]), $2, 'ARCHIVED'",
      [archived.map((r) => r.id), actorId],
    );
    await recordAuditLog(pool, { actorUserId: actorId, action: "company.archived", details: { name: companyNameNormalized } });
  }
  return rowCount;
}

// Restores every archived lead for this company at once — the mirror of
// archiveCompany above.
export async function restoreCompany(pool: Pool, actorId: number, companyNameNormalized: string): Promise<number> {
  const { rows: restored } = await pool.query<{ id: number }>(
    "UPDATE leads SET archived_at = NULL, updated_at = now() WHERE company_name_normalized = $1 AND archived_at IS NOT NULL RETURNING id",
    [companyNameNormalized],
  );
  const rowCount = restored.length;
  if (!rowCount) {
    const { rows } = await pool.query("SELECT 1 FROM leads WHERE company_name_normalized = $1 LIMIT 1", [companyNameNormalized]);
    if (rows.length === 0) {
      throw new CompanyNotFoundError(`No company "${companyNameNormalized}"`);
    }
    // Every lead was already active — a harmless no-op, not an error.
  }
  if (rowCount) {
    await pool.query(
      "INSERT INTO lead_activities (lead_id, actor_user_id, type) SELECT unnest($1::bigint[]), $2, 'RESTORED'",
      [restored.map((r) => r.id), actorId],
    );
    await recordAuditLog(pool, { actorUserId: actorId, action: "company.restored", details: { name: companyNameNormalized } });
  }
  return rowCount;
}
