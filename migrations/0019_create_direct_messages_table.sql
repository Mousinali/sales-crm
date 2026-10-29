CREATE TABLE direct_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  recipient_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id != recipient_id)
);

CREATE INDEX idx_direct_messages_sender ON direct_messages(sender_id, created_at);
CREATE INDEX idx_direct_messages_recipient ON direct_messages(recipient_id, created_at);

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('LEAD_ASSIGNED','LEAD_TRANSFERRED','VISIT_SCHEDULED','VISIT_RESCHEDULED','VISIT_CANCELLED','CALENDAR_EVENT','CHAT_MESSAGE'));
