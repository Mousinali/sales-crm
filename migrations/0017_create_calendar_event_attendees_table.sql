CREATE TABLE calendar_event_attendees (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_calendar_event_attendees_event ON calendar_event_attendees(event_id);
CREATE INDEX idx_calendar_event_attendees_user ON calendar_event_attendees(user_id);
