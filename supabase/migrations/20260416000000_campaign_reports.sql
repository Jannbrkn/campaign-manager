-- Campaign Reports: historical snapshots of Mailchimp stats per campaign.
-- Motivation: /reports/{id} values change over time as late opens/clicks
-- trickle in. Freeze snapshots locally so trends don't wiggle and we can
-- build per-manufacturer trend charts without hitting the API on every load.
--
-- Write policy (see /api/performance/refresh):
-- - Refresh job writes a NEW row per campaign on each run
-- - After 30 days since send_time, refresh stops and snapshot is "final"
-- - latest snapshot values also mirrored to campaigns.performance_stats
--   for cheap dashboard page loads

create table if not exists public.campaign_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  mailchimp_campaign_id text not null,

  -- Snapshot metadata
  snapshot_date timestamptz not null default now(),
  is_final boolean not null default false,

  -- Delivery
  emails_sent integer,
  hard_bounces integer,
  soft_bounces integer,

  -- Opens (MPP-raw + MPP-filtered when available)
  opens_total integer,
  unique_opens integer,
  open_rate numeric(6,5),                    -- raw, includes Apple MPP prefetch
  proxy_excluded_opens integer,
  proxy_excluded_unique_opens integer,
  proxy_excluded_open_rate numeric(6,5),     -- matches Mailchimp UI (preferred)

  -- Clicks (no MPP filter needed — clicks are not prefetched)
  clicks_total integer,
  unique_clicks integer,
  unique_subscriber_clicks integer,
  click_rate numeric(6,5),

  -- Other engagement
  unsubscribed integer,
  abuse_reports integer,

  -- Industry benchmark (Mailchimp computes per audience industry_type)
  industry_type text,
  industry_open_rate numeric(6,5),
  industry_click_rate numeric(6,5),
  industry_bounce_rate numeric(6,5),
  industry_unsub_rate numeric(6,5),

  -- Full API payload for future feature development
  raw_report jsonb,

  created_at timestamptz not null default now()
);

-- Indexes for trend queries (group by campaign, latest-snapshot-first, etc.)
create index if not exists idx_campaign_reports_campaign_id on public.campaign_reports(campaign_id);
create index if not exists idx_campaign_reports_snapshot_date on public.campaign_reports(snapshot_date desc);
create index if not exists idx_campaign_reports_campaign_snapshot on public.campaign_reports(campaign_id, snapshot_date desc);

-- RLS: same model as campaigns — only authenticated users can read/write
alter table public.campaign_reports enable row level security;

create policy "campaign_reports_select" on public.campaign_reports
  for select to authenticated using (true);

create policy "campaign_reports_insert" on public.campaign_reports
  for insert to authenticated with check (true);

create policy "campaign_reports_update" on public.campaign_reports
  for update to authenticated using (true);
