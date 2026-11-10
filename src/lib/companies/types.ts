// A "company" isn't its own table — it's the set of leads that share a
// normalized company name (the same dedup key leads/duplicates.ts already
// uses). This is a read-only rollup over leads, not a record with its own
// lifecycle.
export type CompanySummary = {
  company_name_normalized: string;
  company_name: string;
  industry: string | null;
  business_type: string | null;
  location: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lead_count: number;
  latest_lead_at: Date;
};
