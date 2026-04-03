-- ============================================================
-- Campaign Manager — Initial Schema
-- ============================================================

-- ENUMs
CREATE TYPE campaign_type AS ENUM (
  'postcard',
  'newsletter',
  'report_internal',
  'report_external'
);

CREATE TYPE campaign_status AS ENUM (
  'planned',
  'assets_pending',
  'assets_complete',
  'generating',
  'review',
  'approved',
  'sent'
);

CREATE TYPE asset_category AS ENUM (
  'image',
  'text',
  'logo',
  'cta',
  'link',
  'csv_export',
  'postcard_pdf',
  'newsletter_zip',
  'report_xlsx'
);

CREATE TYPE alert_type AS ENUM (
  'prep_reminder_6w',
  'assets_missing',
  'output_ready',
  'review_needed',
  'auto_send_scheduled'
);

-- ============================================================
-- agencies
-- ============================================================
CREATE TABLE agencies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  cost_center  text,
  ident_number text,
  order_email  text,
  logo_url     text,
  address      text,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON agencies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- manufacturers
-- ============================================================
CREATE TABLE manufacturers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  category                text,
  contact_person          text,
  postcard_frequency      text,
  postcard_months         text,
  postcard_format         text,
  newsletter_frequency    text,
  images_source           text,
  texts_source            text,
  own_creatives           boolean NOT NULL DEFAULT false,
  own_texts               boolean NOT NULL DEFAULT false,
  additional_report_email text,
  dropbox_link            text,
  postcard_tags           text,
  newsletter_tags         text,
  extra_tags              text,
  print_run               integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON manufacturers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX manufacturers_agency_id_idx ON manufacturers(agency_id);

-- ============================================================
-- campaigns
-- ============================================================
CREATE TABLE campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id     uuid NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  type                campaign_type NOT NULL,
  title               text NOT NULL,
  status              campaign_status NOT NULL DEFAULT 'planned',
  scheduled_date      date NOT NULL,
  linked_postcard_id  uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  linked_newsletter_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  notes               text,
  review_approved     boolean NOT NULL DEFAULT false,
  auto_send_emails    jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX campaigns_manufacturer_id_idx ON campaigns(manufacturer_id);
CREATE INDEX campaigns_scheduled_date_idx ON campaigns(scheduled_date);
CREATE INDEX campaigns_status_idx ON campaigns(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- campaign_assets
-- ============================================================
CREATE TABLE campaign_assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  file_type      text NOT NULL,
  file_url       text NOT NULL,
  asset_category asset_category NOT NULL,
  is_output      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON campaign_assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX campaign_assets_campaign_id_idx ON campaign_assets(campaign_id);

-- ============================================================
-- campaign_alerts
-- ============================================================
CREATE TABLE campaign_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  alert_type     alert_type NOT NULL,
  scheduled_for  timestamptz NOT NULL,
  sent           boolean NOT NULL DEFAULT false,
  sent_at        timestamptz
);

ALTER TABLE campaign_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON campaign_alerts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX campaign_alerts_campaign_id_idx ON campaign_alerts(campaign_id);
CREATE INDEX campaign_alerts_scheduled_for_idx ON campaign_alerts(scheduled_for) WHERE sent = false;

-- ============================================================
-- Storage bucket: campaign-assets
-- Run this in Supabase Dashboard → Storage → New Bucket
-- Name: campaign-assets, Public: false
-- Or via SQL:
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-assets', 'campaign-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campaign-assets');

CREATE POLICY "Authenticated read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'campaign-assets');

CREATE POLICY "Authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'campaign-assets');
