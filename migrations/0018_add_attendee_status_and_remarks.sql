ALTER TABLE calendar_event_attendees ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED'));
ALTER TABLE calendar_event_attendees ADD COLUMN remarks TEXT;
