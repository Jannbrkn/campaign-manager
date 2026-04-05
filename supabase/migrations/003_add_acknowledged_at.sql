-- Add acknowledged_at to campaign_alerts
-- Allows users to dismiss alerts in the UI after reading them

ALTER TABLE campaign_alerts
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz DEFAULT NULL;
