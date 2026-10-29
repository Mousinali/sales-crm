CREATE TABLE calendar_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'MEETING' CHECK (type IN ('MEETING','FOLLOW_UP','OTHER')),
  starts_at TIMESTAMPTZ NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_starts_at ON calendar_events(starts_at);

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('LEAD_ASSIGNED','LEAD_TRANSFERRED','VISIT_SCHEDULED','VISIT_RESCHEDULED','VISIT_CANCELLED','CALENDAR_EVENT'));

-- Calendar events notify every active user, so a notification can now
-- reference a user who is later removed; cascade instead of blocking that
-- deletion on a stale notification row.
ALTER TABLE notifications DROP CONSTRAINT notifications_recipient_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE;
