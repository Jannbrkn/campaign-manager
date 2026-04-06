ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_subject text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mailchimp_preview_text text DEFAULT NULL;
