-- The companies list collapses leads to one row per company_name_normalized
-- (DISTINCT ON ... ORDER BY company_name_normalized, created_at DESC); this
-- lets Postgres read them pre-sorted instead of sorting every active lead.
CREATE INDEX idx_leads_company_latest ON leads (company_name_normalized, created_at DESC) WHERE archived_at IS NULL;
