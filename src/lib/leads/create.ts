import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";
import { LeadActionNotAllowedError } from "./errors";
import type { LeadRow, LeadSource, LeadPriority } from "./types";

export async function createLead(pool: Pool, input: {
  creatorId: number;
  creatorRole: Role;
  companyName: string;
  contactPerson?: string;
  designation?: string;
  phone: string;
  email?: string;
  website?: string;
  industry?: string;
  location?: string;
  serviceRequirements: string;
  estimatedBudget?: number;
  leadSource: LeadSource;
  priority?: LeadPriority;
  notes?: string;
}): Promise<LeadRow> {
  if (input.creatorRole !== "PRE_SALES" && input.creatorRole !== "MARKETING_HEAD") {
    throw new LeadActionNotAllowedError(`${input.creatorRole} cannot create leads`);
  }

  const preSalesOwnerId = input.creatorRole === "PRE_SALES" ? input.creatorId : null;

  const { rows } = await pool.query<LeadRow>(
    `INSERT INTO leads (
       company_name, company_name_normalized, contact_person, designation,
       phone, phone_normalized, email, website, website_domain,
       industry, location, service_requirements, estimated_budget,
       lead_source, priority, pre_sales_owner_id, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      input.companyName,
      normalizeCompanyName(input.companyName),
      input.contactPerson ?? null,
      input.designation ?? null,
      input.phone,
      normalizePhone(input.phone),
      input.email ?? null,
      input.website ?? null,
      extractDomain(input.website),
      input.industry ?? null,
      input.location ?? null,
      input.serviceRequirements,
      input.estimatedBudget ?? null,
      input.leadSource,
      input.priority ?? "MEDIUM",
      preSalesOwnerId,
      input.notes ?? null,
      input.creatorId,
    ],
  );

  return rows[0];
}
