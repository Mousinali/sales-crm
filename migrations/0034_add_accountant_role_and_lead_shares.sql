ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','HR','MARKETING_HEAD','PRE_SALES','SALESPERSON','ACCOUNTANT'));

-- A lead's owner can grant another user read-only access to it.
CREATE TABLE lead_shares (
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  shared_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

CREATE INDEX idx_lead_shares_user_id ON lead_shares(user_id);
