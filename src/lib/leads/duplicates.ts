import type { Pool } from "pg";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";
import type { LeadRow } from "./types";

// A normalized value this short carries no real signal — matching on it
// would flag unrelated leads as duplicates of each other (e.g. two leads
// whose company name is "N/A" or "---", or a phone field left as a
// placeholder). Each predicate below is only added when its normalized
// value clears this bar; a query where nothing clears it returns no rows
// rather than falling back to an unfiltered (and therefore unsafe) scan.
const MIN_PHONE_DIGITS = 7;

export async function findPotentialDuplicates(pool: Pool, input: {
  companyName: string;
  phone?: string;
  email?: string;
  website?: string;
}): Promise<LeadRow[]> {
  const normalizedCompanyName = normalizeCompanyName(input.companyName);
  const normalizedPhone = normalizePhone(input.phone ?? "");
  const domain = extractDomain(input.website);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (normalizedCompanyName.length > 0) {
    params.push(normalizedCompanyName);
    conditions.push(`company_name_normalized = $${params.length}`);
  }
  if (normalizedPhone.length >= MIN_PHONE_DIGITS) {
    params.push(normalizedPhone);
    conditions.push(`phone_normalized = $${params.length}`);
  }
  if (domain) {
    params.push(domain);
    conditions.push(`website_domain = $${params.length}`);
  }
  if (input.email) {
    params.push(input.email);
    conditions.push(`lower(email) = lower($${params.length})`);
  }

  if (conditions.length === 0) return [];

  const { rows } = await pool.query<LeadRow>(
    `SELECT * FROM leads WHERE ${conditions.join(" OR ")} ORDER BY created_at DESC LIMIT 10`,
    params,
  );
  return rows;
}
