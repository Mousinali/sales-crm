CREATE TABLE lead_assignments (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  pre_sales_owner_id BIGINT REFERENCES users(id),
  salesperson_owner_id BIGINT REFERENCES users(id),
  changed_by BIGINT NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_assignments_lead_id ON lead_assignments(lead_id);
