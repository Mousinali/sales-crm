export const LEAD_SOURCES = ["WEBSITE_ENQUIRY", "REFERRAL", "COLD_OUTREACH", "EXISTING_CLIENT", "OTHER"] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type LeadPriority = typeof LEAD_PRIORITIES[number];

export const LEAD_STATUSES = [
  "NEW", "PENDING_REVIEW", "MORE_INFO_REQUIRED", "QUALIFIED",
  "CONVERTED", "REJECTED", "ON_HOLD", "CLOSED_WON", "CLOSED_LOST",
] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export type LeadRow = {
  id: number;
  company_name: string;
  company_name_normalized: string;
  contact_person: string | null;
  designation: string | null;
  phone: string;
  phone_normalized: string;
  email: string | null;
  website: string | null;
  website_domain: string | null;
  industry: string | null;
  business_type: string | null;
  location: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  service_requirements: string;
  estimated_budget: string | null;
  lead_source: LeadSource;
  priority: LeadPriority;
  status: LeadStatus;
  status_reason: string | null;
  pre_sales_owner_id: number | null;
  salesperson_owner_id: number | null;
  next_follow_up_at: Date | null;
  notes: string | null;
  whatsapp_number: string | null;
  remarks: string | null;
  archived_at: Date | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};
