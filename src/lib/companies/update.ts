import type { Pool } from "pg";
import { recordAuditLog } from "@/lib/audit/log";
import { normalizeCompanyName, extractDomain } from "@/lib/leads/normalize";
import { CompanyNotFoundError, CompanyNameTakenError, InvalidCompanyNameError } from "./errors";

// Company-wide attributes only. Phone, email and GST stay per lead: they
// belong to each lead's contact person, so one edit must not overwrite them all.
export type CompanyEdit = {
  companyName?: string;
  industry?: string | null;
  businessType?: string | null;
  location?: string | null;
  address?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  website?: string | null;
};

// A company is the set of leads sharing a normalized name (see types.ts), so
// editing it rewrites those columns on every one of its leads, archived or
// not. Returns the company's (possibly new) normalized name, which is its URL.
export async function updateCompany(pool: Pool, actorId: number, currentNormalized: string, edit: CompanyEdit): Promise<string> {
  const columns: string[] = [];
  const params: unknown[] = [currentNormalized];
  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }

  let newNormalized = currentNormalized;
  let newName: string | undefined;
  let oldName = "";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query<{ company_name: string }>("SELECT company_name FROM leads WHERE company_name_normalized = $1 ORDER BY created_at DESC LIMIT 1", [currentNormalized]);
    if (existing.length === 0) throw new CompanyNotFoundError(`No company "${currentNormalized}"`);
    oldName = existing[0].company_name;

    if (edit.companyName !== undefined) {
      newName = edit.companyName.trim();
      newNormalized = normalizeCompanyName(newName);
      if (!newNormalized) throw new InvalidCompanyNameError("Company name needs at least one letter or number");
      if (newNormalized !== currentNormalized) {
        // Two renames to the same name at once must not both pass the check below.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`company:${newNormalized}`]);
        const { rows: taken } = await client.query("SELECT 1 FROM leads WHERE company_name_normalized = $1 LIMIT 1", [newNormalized]);
        if (taken.length > 0) throw new CompanyNameTakenError(`Another company already uses the name "${newName}"`);
      }
      set("company_name", newName);
      set("company_name_normalized", newNormalized);
    }
    if (edit.industry !== undefined) set("industry", edit.industry);
    if (edit.businessType !== undefined) set("business_type", edit.businessType);
    if (edit.location !== undefined) set("location", edit.location);
    if (edit.address !== undefined) set("address", edit.address);
    if (edit.state !== undefined) set("state", edit.state);
    if (edit.pincode !== undefined) set("pincode", edit.pincode);
    if (edit.country !== undefined) set("country", edit.country);
    if (edit.website !== undefined) {
      set("website", edit.website);
      set("website_domain", extractDomain(edit.website));
    }

    if (columns.length > 0) {
      await client.query(`UPDATE leads SET ${columns.join(", ")}, updated_at = now() WHERE company_name_normalized = $1`, params);
      // Sales keep their own copy of the name; keep it in step with the company.
      if (newName !== undefined) {
        await client.query("UPDATE sales SET company_name = $1 WHERE lead_id IN (SELECT id FROM leads WHERE company_name_normalized = $2)", [newName, newNormalized]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (columns.length > 0) {
    const fields = (Object.keys(edit) as (keyof CompanyEdit)[]).filter((key) => edit[key] !== undefined);
    await recordAuditLog(pool, {
      actorUserId: actorId,
      action: "company.updated",
      details: { name: newName ?? oldName, ...(newName !== undefined && newName !== oldName && { renamedFrom: oldName }), fields },
    });
  }
  return newNormalized;
}
