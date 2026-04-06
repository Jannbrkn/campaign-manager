-- supabase/migrations/20260406000000_add_website_contact_email.sql

ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS contact_email text;
