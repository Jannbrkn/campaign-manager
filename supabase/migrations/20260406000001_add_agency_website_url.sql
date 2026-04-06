-- supabase/migrations/20260406000001_add_agency_website_url.sql

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS website_url text;
