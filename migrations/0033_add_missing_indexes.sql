-- Every leads/companies list query filters on this (archived vs active
-- view), same hot-path pattern as the other owner/status columns indexed
-- in 0006 — this one was missed when archived_at was added.
CREATE INDEX idx_leads_archived_at ON leads(archived_at);

-- getSuperAdminPeriodSummary filters sale_payments by payment_date
-- (period-scoped "Total payment received" tile); only sale_id was
-- indexed in 0024, before payment_date was queried directly.
CREATE INDEX idx_sale_payments_payment_date ON sale_payments(payment_date);
