-- Budget type (one-time/monthly/part payment/advance) now applies to a
-- lead's estimated budget too, not just a sale's.
ALTER TABLE leads ADD COLUMN budget_type TEXT CHECK (budget_type IN ('ONE_TIME', 'MONTHLY', 'PART_PAYMENT', 'ADVANCE'));

ALTER TABLE sales DROP CONSTRAINT sales_budget_type_check;
ALTER TABLE sales ADD CONSTRAINT sales_budget_type_check CHECK (budget_type IN ('ONE_TIME', 'MONTHLY', 'PART_PAYMENT', 'ADVANCE'));

-- Services interested, same shape as lead_services.
CREATE TABLE sale_services (
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  PRIMARY KEY (sale_id, service_id)
);

CREATE INDEX idx_sale_services_service_id ON sale_services(service_id);

-- Transaction history: every payment received against a sale, so the total
-- budget can be reconciled against what's actually been paid and what's
-- still outstanding.
CREATE TABLE sale_payments (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  recorded_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_payments_sale_id ON sale_payments(sale_id);
