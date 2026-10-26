CREATE TABLE leads (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_name_normalized TEXT NOT NULL,
  contact_person TEXT,
  designation TEXT,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  website TEXT,
  website_domain TEXT,
  industry TEXT,
  location TEXT,
  service_requirements TEXT NOT NULL,
  estimated_budget NUMERIC,
  lead_source TEXT NOT NULL CHECK (lead_source IN ('WEBSITE_ENQUIRY','REFERRAL','COLD_OUTREACH','EXISTING_CLIENT','OTHER')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('NEW','PENDING_REVIEW','MORE_INFO_REQUIRED','QUALIFIED','CONVERTED','REJECTED','ON_HOLD','CLOSED_WON','CLOSED_LOST')),
  status_reason TEXT,
  pre_sales_owner_id BIGINT REFERENCES users(id),
  salesperson_owner_id BIGINT REFERENCES users(id),
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_pre_sales_owner ON leads(pre_sales_owner_id);
CREATE INDEX idx_leads_salesperson_owner ON leads(salesperson_owner_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_company_name_normalized ON leads(company_name_normalized);
CREATE INDEX idx_leads_phone_normalized ON leads(phone_normalized);
CREATE INDEX idx_leads_website_domain ON leads(website_domain);
