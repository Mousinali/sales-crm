CREATE TABLE client_visits (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  salesperson_id BIGINT NOT NULL REFERENCES users(id),
  visit_date DATE NOT NULL,
  start_time TIME NOT NULL,
  expected_duration_minutes INTEGER,
  location TEXT,
  objective TEXT NOT NULL,
  preparation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','RESCHEDULED','CANCELLED','MISSED')),
  outcome_notes TEXT,
  next_action TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_visits_salesperson_date ON client_visits(salesperson_id, visit_date, start_time);
CREATE INDEX idx_client_visits_lead_id ON client_visits(lead_id);
