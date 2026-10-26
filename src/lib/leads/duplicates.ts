import type { Pool } from "pg";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";
import type { LeadRow } from "./types";

export async function findPotentialDuplicates(pool: Pool, input: {
  companyName: string;
  phone: string;
  email?: string;
  website?: string;
}): Promise<LeadRow[]> {
  const { rows } = await pool.query<LeadRow>(
    `SELECT * FROM leads
     WHERE company_name_normalized = $1
        OR phone_normalized = $2
        OR (website_domain IS NOT NULL AND website_domain = $3)
        OR (email IS NOT NULL AND lower(email) = lower($4))
     ORDER BY created_at DESC
     LIMIT 10`,
    [
      normalizeCompanyName(input.companyName),
      normalizePhone(input.phone),
      extractDomain(input.website),
      input.email ?? null,
    ],
  );
  return rows;
}
