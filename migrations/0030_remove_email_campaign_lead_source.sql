-- No lead should actually have this value yet (added and removed in the
-- same session), but reassign defensively before tightening the constraint
-- so this migration can never fail on existing data.
UPDATE leads SET lead_source = 'OTHER' WHERE lead_source = 'EMAIL_CAMPAIGN';

ALTER TABLE leads DROP CONSTRAINT leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check CHECK (lead_source IN (
  'WEBSITE_ENQUIRY',
  'GOOGLE_SEARCH',
  'GOOGLE_ADS',
  'GOOGLE_MAPS',
  'FACEBOOK',
  'INSTAGRAM',
  'LINKEDIN',
  'YOUTUBE',
  'SMS_CAMPAIGN',
  'REFERRAL',
  'COLD_OUTREACH',
  'WALK_IN',
  'EXISTING_CLIENT',
  'OTHER'
));
