-- Run this in Supabase SQL Editor
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_url text DEFAULT NULL;
