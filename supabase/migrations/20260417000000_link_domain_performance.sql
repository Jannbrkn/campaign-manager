-- Adds per-link click details and per-domain performance to campaign_reports.
-- Motivation:
-- - click_details: per-URL clicks (which CTAs work?) — from GET /reports/{id}/click-details
-- - domain_performance: engagement by recipient email domain (gmx, t-online, gmail, etc.)
--   — from GET /reports/{id}/domain-performance
-- Both are stored as jsonb for flexibility; shape matches Mailchimp's response.

alter table public.campaign_reports
  add column if not exists click_details jsonb,
  add column if not exists domain_performance jsonb;

-- click_details example:
-- [
--   { "url": "https://...", "total_clicks": 12, "unique_clicks": 8, "click_percentage": 0.66 },
--   ...
-- ]

-- domain_performance example:
-- [
--   { "domain": "t-online.de", "emails_sent": 245, "opens": 112, "clicks": 23, "bounces": 2, "unsubs": 1 },
--   ...
-- ]
