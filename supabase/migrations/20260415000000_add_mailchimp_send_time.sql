-- Add mailchimp_send_time to campaigns for auto-report scheduling
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS mailchimp_send_time timestamptz DEFAULT NULL;

-- Index for cron query: find newsletters with mailchimp data that need reports
CREATE INDEX idx_campaigns_auto_report
  ON campaigns (mailchimp_campaign_id, type)
  WHERE mailchimp_campaign_id IS NOT NULL AND type = 'newsletter';
