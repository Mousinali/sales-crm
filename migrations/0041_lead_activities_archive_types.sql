-- Archiving/restoring a lead (or deleting/restoring its company) now records a
-- lead_activities row so it shows on the lead's activity timeline.
ALTER TABLE lead_activities DROP CONSTRAINT lead_activities_type_check;
ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_type_check
  CHECK (type IN ('NOTE','CALL','MEETING','OTHER','STATUS_CHANGE','ASSIGNMENT','TRANSFER','CLIENT_VISIT','ARCHIVED','RESTORED'));
