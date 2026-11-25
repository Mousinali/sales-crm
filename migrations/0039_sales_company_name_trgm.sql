-- The payments list filters by company with company_name ILIKE '%q%'. A
-- leading-wildcard match can't use a btree, so it fell to a sequential scan
-- over all sales. A trigram GIN index serves the substring match directly.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_sales_company_name_trgm ON sales USING gin (company_name gin_trgm_ops);
