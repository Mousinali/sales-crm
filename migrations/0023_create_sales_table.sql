CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  budget_amount NUMERIC NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('ONE_TIME', 'MONTHLY', 'PART_PAYMENT')),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sold_by_type TEXT NOT NULL CHECK (sold_by_type IN ('SELF', 'CUSTOM', 'PRE_SALES', 'SALESPERSON')),
  sold_by_user_id BIGINT REFERENCES users(id),
  sold_by_custom_name TEXT,
  notes TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_lead_id ON sales(lead_id);
CREATE INDEX idx_sales_created_by ON sales(created_by);
CREATE INDEX idx_sales_sold_by_user_id ON sales(sold_by_user_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
