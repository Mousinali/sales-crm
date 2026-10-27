ALTER TABLE lead_activities DROP CONSTRAINT lead_activities_type_check;
ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_type_check CHECK (type IN ('NOTE','CALL','MEETING','OTHER','STATUS_CHANGE','ASSIGNMENT','TRANSFER','CLIENT_VISIT'));

CREATE TABLE lead_transfer_history (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  previous_pre_sales_owner_id BIGINT REFERENCES users(id),
  previous_salesperson_owner_id BIGINT REFERENCES users(id),
  new_pre_sales_owner_id BIGINT REFERENCES users(id),
  new_salesperson_owner_id BIGINT REFERENCES users(id),
  transferred_by BIGINT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_transfer_history_lead_id ON lead_transfer_history(lead_id);
