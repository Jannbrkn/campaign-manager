-- Add file_size column to campaign_assets
ALTER TABLE campaign_assets ADD COLUMN IF NOT EXISTS file_size bigint;
