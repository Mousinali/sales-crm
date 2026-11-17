-- The service catalogue leads pick from under "Service interested".
-- A migration rather than a seed script so every environment gets the same
-- list on its next deploy; ON CONFLICT keeps it safe to re-run and leaves any
-- service that already exists (and its status) untouched.
INSERT INTO services (name) VALUES
  ('Bulk SMS'),
  ('WhatsApp Business API'),
  ('RCS Messaging'),
  ('Voice Call & IVR'),
  ('Toll-Free Numbers'),
  ('Custom ERP Solutions'),
  ('Custom CRM Solutions'),
  ('BioMax'),
  ('SaaS Solutions'),
  ('CRM Software'),
  ('Billing Software (BillTrack)'),
  ('Website Development'),
  ('Mobile App Development'),
  ('Custom Software Development'),
  ('Digital Marketing'),
  ('SEO Services'),
  ('Google Ads & PPC'),
  ('Social Media Marketing'),
  ('Graphic Design'),
  ('UI/UX Design'),
  ('IT Solutions'),
  ('Cloud BPO Solutions'),
  ('Education Technology Solutions'),
  ('Messaging API Integration'),
  ('Marketing Automation'),
  ('Annual Maintenance & Support (AMC)')
ON CONFLICT (name) DO NOTHING;
