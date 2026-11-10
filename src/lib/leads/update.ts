import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { LeadActionNotAllowedError } from "./errors";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";
import { setLeadServices } from "./services";
import type { LeadPriority, LeadBudgetType } from "./types";

export async function updateLead(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    fields: Partial<{
      companyName: string;
      contactPerson: string;
      designation: string;
      phone: string;
      email: string;
      website: string;
      industry: string;
      businessType: string;
      location: string;
      address: string;
      state: string;
      pincode: string;
      country: string;
      serviceRequirements: string;
      serviceIds: number[];
      estimatedBudget: number;
      budgetType: LeadBudgetType;
      priority: LeadPriority;
      nextFollowUpAt: Date;
      notes: string;
      whatsappNumber: string;
      remarks: string;
      youtubeUrl: string;
      facebookUrl: string;
      instagramUrl: string;
      linkedinUrl: string;
      // One-way: setting true archives the lead. There is no false/unset
      // path to unarchive — req.md §5.2 names only "archive," not
      // "unarchive" (see this plan's Global Constraints).
      archived: true;
    }>;
  },
): Promise<void> {
  if (input.actorRole === "SALESPERSON" || input.actorRole === "HR") {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot edit lead fields`);
  }

  await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);

  const fields = input.fields;
  const columns: string[] = [];
  const params: unknown[] = [];

  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }

  if (fields.companyName !== undefined) {
    set("company_name", fields.companyName);
    set("company_name_normalized", normalizeCompanyName(fields.companyName));
  }
  if (fields.contactPerson !== undefined) set("contact_person", fields.contactPerson);
  if (fields.designation !== undefined) set("designation", fields.designation);
  if (fields.phone !== undefined) {
    set("phone", fields.phone);
    set("phone_normalized", normalizePhone(fields.phone));
  }
  if (fields.email !== undefined) set("email", fields.email);
  if (fields.website !== undefined) {
    set("website", fields.website);
    set("website_domain", extractDomain(fields.website));
  }
  if (fields.industry !== undefined) set("industry", fields.industry);
  if (fields.businessType !== undefined) set("business_type", fields.businessType);
  if (fields.location !== undefined) set("location", fields.location);
  if (fields.address !== undefined) set("address", fields.address);
  if (fields.state !== undefined) set("state", fields.state);
  if (fields.pincode !== undefined) set("pincode", fields.pincode);
  if (fields.country !== undefined) set("country", fields.country);
  if (fields.serviceRequirements !== undefined) set("service_requirements", fields.serviceRequirements);
  if (fields.estimatedBudget !== undefined) set("estimated_budget", fields.estimatedBudget);
  if (fields.budgetType !== undefined) set("budget_type", fields.budgetType);
  if (fields.priority !== undefined) set("priority", fields.priority);
  if (fields.nextFollowUpAt !== undefined) set("next_follow_up_at", fields.nextFollowUpAt);
  if (fields.notes !== undefined) set("notes", fields.notes);
  if (fields.whatsappNumber !== undefined) set("whatsapp_number", fields.whatsappNumber);
  if (fields.remarks !== undefined) set("remarks", fields.remarks);
  if (fields.youtubeUrl !== undefined) set("youtube_url", fields.youtubeUrl);
  if (fields.facebookUrl !== undefined) set("facebook_url", fields.facebookUrl);
  if (fields.instagramUrl !== undefined) set("instagram_url", fields.instagramUrl);
  if (fields.linkedinUrl !== undefined) set("linkedin_url", fields.linkedinUrl);
  if (fields.archived) set("archived_at", new Date());

  if (columns.length > 0) {
    params.push(input.leadId);
    await pool.query(`UPDATE leads SET ${columns.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
  }

  if (fields.serviceIds !== undefined) {
    await setLeadServices(pool, { leadId: input.leadId, serviceIds: fields.serviceIds });
  }
}
