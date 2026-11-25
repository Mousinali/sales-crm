-- The leads and sales list search boxes match several columns with
-- ILIKE '%q%' (company_name OR phone OR email OR website on leads;
-- company_name OR sale_number OR contact_person on sales). A leading
-- wildcard can't use a btree, and with the OR every branch had to be
-- indexed or the whole query fell to a sequential scan over 300k+ rows.
--
-- Instead of one trigram index per column, index a single concatenation of
-- those columns and have the query match that same expression — one index
-- serves the whole search box. The expression must be IMMUTABLE, so it uses
-- coalesce + || (concat_ws is only STABLE and can't be indexed). The query
-- strings in leads/list.ts and sales/list.ts must stay byte-identical to
-- these expressions or the planner won't use the index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_leads_search_trgm ON leads USING gin (
  (coalesce(company_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '') || ' ' || coalesce(website, '')) gin_trgm_ops
);

CREATE INDEX idx_sales_search_trgm ON sales USING gin (
  (coalesce(company_name, '') || ' ' || coalesce(sale_number, '') || ' ' || coalesce(contact_person, '')) gin_trgm_ops
);
