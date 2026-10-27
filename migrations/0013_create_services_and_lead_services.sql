CREATE TABLE services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lead_services (
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  PRIMARY KEY (lead_id, service_id)
);

CREATE INDEX idx_lead_services_service_id ON lead_services(service_id);

-- The old free-text field is superseded by the services multiselect below;
-- kept nullable (not dropped) so any pre-existing lead's text survives.
ALTER TABLE leads ALTER COLUMN service_requirements DROP NOT NULL;

INSERT INTO services (name, description) VALUES
  ('Web Development', NULL),
  ('Ecommerce Development', NULL),
  ('App Development', NULL),
  ('UI/UX Design', NULL),
  ('Digital Marketing', NULL),
  ('Graphic Design', NULL),
  ('Bulk SMS', 'Reach thousands in seconds'),
  ('RCS', 'Next-gen messaging beyond SMS'),
  ('Business WhatsApp API', 'Business WhatsApp API'),
  ('WhatsApp Marketing', NULL),
  ('Voice Call', 'Connect instantly with just one call'),
  ('IVR', 'Smart automation for smarter conversations'),
  ('Cloud BPO Solutions', 'Smart, flexible & cost-effective cloud BPO'),
  ('Contact Center', 'Clear conversations. Faster resolutions.'),
  ('CRM Softwares', NULL),
  ('Other SaaS Solution', NULL);
