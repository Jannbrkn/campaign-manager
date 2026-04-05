-- Run this in Supabase SQL Editor
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_campaign_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS performance_stats jsonb DEFAULT NULL;
