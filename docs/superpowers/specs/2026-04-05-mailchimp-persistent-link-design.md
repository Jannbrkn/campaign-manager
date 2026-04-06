# Mailchimp Persistent Link — Design Spec

**Date:** 2026-04-05  
**Status:** Approved

## Problem

When a newsletter campaign is pushed to Mailchimp via the side panel, the resulting Mailchimp edit URL is stored only in local React state. Closing and reopening the side panel loses the URL, making it impossible to navigate back to the existing Mailchimp campaign. Re-opening the creation form risks creating a duplicate.

## Solution

Persist the Mailchimp edit URL in the `campaigns` table. Gate the creation form on whether a Mailchimp campaign already exists — if it does, show only a direct link button.

## Changes

### 1. DB Migration
Add column to `campaigns` table:
```sql
ALTER TABLE campaigns ADD COLUMN mailchimp_url text DEFAULT NULL;
```

### 2. TypeScript Type (`lib/supabase/types.ts`)
Add to `Campaign` interface:
```ts
mailchimp_url: string | null
```
Also add to the `Database` type's `Update` shape (already covered by `Partial<Omit<...>>`).

### 3. API Route (`app/api/send/mailchimp/route.ts`)
In the existing `.update()` call that saves `mailchimp_campaign_id`, also save `mailchimp_url`:
```ts
await admin.from('campaigns')
  .update({ mailchimp_campaign_id: created.id, mailchimp_url: editUrl })
  .eq('id', campaign_id)
```

### 4. CampaignSidePanel (`components/calendar/CampaignSidePanel.tsx`)

**State initialization:** Change `mailchimpUrl` initial value from `null` to `campaign.mailchimp_url ?? null`.

**Reset on navigation:** In the `useEffect` that resets state on `campaign.id` change, reset `mailchimpUrl` to `campaign.mailchimp_url ?? null`.

**Section logic:** The Mailchimp section (shown for newsletter campaigns with output assets) changes from:
- Always show creation form until `mailchimpUrl` local state is set

To:
- If `mailchimpUrl` is set (from DB or just created) → show "In Mailchimp ansehen" button only
- If `mailchimpUrl` is null → show subject input + "Kampagne in Mailchimp erstellen" button

## Behaviour After Change

| Scenario | Before | After |
|----------|--------|-------|
| First time pushing to Mailchimp | Creation form shown | Same |
| Reopen panel after pushing to Mailchimp | Creation form shown again | Direct link button shown |
| Open panel for campaign never pushed | Creation form shown | Same |

## Out of Scope
- Backfilling URLs for campaigns already in Mailchimp (mailchimp_campaign_id set, mailchimp_url null) — those will still show the creation form until pushed again. This is acceptable since creation is idempotent from a UI perspective; the user just won't accidentally create a duplicate as long as they are aware.
