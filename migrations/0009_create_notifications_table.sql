CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('LEAD_ASSIGNED','LEAD_TRANSFERRED','VISIT_SCHEDULED','VISIT_RESCHEDULED','VISIT_CANCELLED')),
  lead_id BIGINT REFERENCES leads(id),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_user_id, read_at);
