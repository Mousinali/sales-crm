import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";
import { LeadActionNotAllowedError } from "./errors";
import { setLeadServices } from "./services";
import type { LeadRow, LeadSource, LeadPriority, LeadBudgetType } from "./types";

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
  businessType?: string;
  location?: string;
  address?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstNumber?: string;
  serviceRequirements?: string;
  serviceIds?: number[];
  estimatedBudget?: number;
  budgetType?: LeadBudgetType;
  leadSource: LeadSource;
  priority?: LeadPriority;
  notes?: string;
  whatsappNumber?: string;
  remarks?: string;
  youtubeUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
}): Promise<LeadRow> {
  if (
    input.creatorRole !== "PRE_SALES" &&
    input.creatorRole !== "MARKETING_HEAD" &&
    input.creatorRole !== "SALESPERSON"
  ) {
    throw new LeadActionNotAllowedError(`${input.creatorRole} cannot create leads`);
  }

  const preSalesOwnerId = input.creatorRole === "PRE_SALES" ? input.creatorId : null;
  // A Salesperson has no Pre-sales owner to assign them, so the Salesperson's own
  // leads list (filtered by salesperson_owner_id, see listLeadsWhere) must own it
  // directly, or a lead they create would be invisible to them.
  const salespersonOwnerId = input.creatorRole === "SALESPERSON" ? input.creatorId : null;

  const { rows } = await pool.query<LeadRow>(
    `INSERT INTO leads (
       company_name, company_name_normalized, contact_person, designation,
       phone, phone_normalized, email, website, website_domain,
       industry, business_type, location, address, state, pincode, country, gst_number,
       service_requirements, estimated_budget, budget_type,
       lead_source, priority, pre_sales_owner_id, salesperson_owner_id, notes, whatsapp_number, remarks,
       youtube_url, facebook_url, instagram_url, linkedin_url, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
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
      input.businessType ?? null,
      input.location ?? null,
      input.address ?? null,
      input.state ?? null,
      input.pincode ?? null,
      input.country ?? "India",
      input.gstNumber ?? null,
      input.serviceRequirements ?? null,
      input.estimatedBudget ?? null,
      input.budgetType ?? null,
      input.leadSource,
      input.priority ?? "MEDIUM",
      preSalesOwnerId,
      salespersonOwnerId,
      input.notes ?? null,
      input.whatsappNumber ?? null,
      input.remarks ?? null,
      input.youtubeUrl ?? null,
      input.facebookUrl ?? null,
      input.instagramUrl ?? null,
      input.linkedinUrl ?? null,
      input.creatorId,
    ],
  );

  const lead = rows[0];
  if (input.serviceIds && input.serviceIds.length > 0) {
    await setLeadServices(pool, { leadId: lead.id, serviceIds: input.serviceIds });
  }

  return lead;
}
