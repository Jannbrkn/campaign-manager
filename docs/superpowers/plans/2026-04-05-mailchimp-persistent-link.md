# Mailchimp Persistent Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the Mailchimp campaign URL in the database so the "In Mailchimp ansehen" button survives panel close/reopen and never offers to re-create an already-existing campaign.

**Architecture:** Add a `mailchimp_url` column to the `campaigns` table. Save it in the API route alongside the existing `mailchimp_campaign_id`. Initialize `mailchimpUrl` local state from the campaign object so the button is visible immediately on panel open.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/006_mailchimp_url.sql` | Create — new migration adding `mailchimp_url` column |
| `lib/supabase/types.ts` | Modify — add `mailchimp_url: string \| null` to `Campaign` interface |
| `app/api/send/mailchimp/route.ts` | Modify — save `mailchimp_url` in the `.update()` call |
| `components/calendar/CampaignSidePanel.tsx` | Modify — init state from campaign, gate creation form on null URL |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/006_mailchimp_url.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Run this in Supabase SQL Editor
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_url text DEFAULT NULL;
```

Save to `supabase/migrations/006_mailchimp_url.sql`.

- [ ] **Step 2: Run the migration in Supabase**

Go to the Supabase dashboard → SQL Editor → paste and run the file contents. Verify the column appears in Table Editor under `campaigns`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_mailchimp_url.sql
git commit -m "feat: add mailchimp_url column to campaigns"
```

---

### Task 2: Update TypeScript Type

**Files:**
- Modify: `lib/supabase/types.ts`

Current `Campaign` interface (around line 74) has:
```ts
mailchimp_campaign_id: string | null
performance_stats: PerformanceStats | null
```

- [ ] **Step 1: Add `mailchimp_url` to the `Campaign` interface**

In `lib/supabase/types.ts`, add the new field directly after `mailchimp_campaign_id`:

```ts
mailchimp_campaign_id: string | null
mailchimp_url: string | null
performance_stats: PerformanceStats | null
```

No changes needed to the `Database` type — `mailchimp_url` is already covered by the `Partial<Omit<Campaign, 'id' | 'created_at' | 'updated_at'>>` Update shape.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: add mailchimp_url to Campaign type"
```

---

### Task 3: Save URL in API Route

**Files:**
- Modify: `app/api/send/mailchimp/route.ts`

The current save (line 78) is:
```ts
await admin.from('campaigns').update({ mailchimp_campaign_id: created.id }).eq('id', campaign_id)
```

- [ ] **Step 1: Update the `.update()` call to also save `mailchimp_url`**

Replace that line with:
```ts
await admin.from('campaigns').update({
  mailchimp_campaign_id: created.id,
  mailchimp_url: editUrl,
}).eq('id', campaign_id)
```

Note: `editUrl` is already defined on line 80 as:
```ts
const editUrl = `https://us19.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`
```
Move the `editUrl` declaration to above the `.update()` call so it can be referenced there. The final order should be:

```ts
const editUrl = `https://us19.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`

await admin.from('campaigns').update({
  mailchimp_campaign_id: created.id,
  mailchimp_url: editUrl,
}).eq('id', campaign_id)

return NextResponse.json({ success: true, campaignId: created.id, editUrl })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/send/mailchimp/route.ts
git commit -m "feat: persist mailchimp_url when creating mailchimp campaign"
```

---

### Task 4: Update CampaignSidePanel

**Files:**
- Modify: `components/calendar/CampaignSidePanel.tsx`

Three small edits in `CampaignDetail`:

**Edit 1 — Initialize state from campaign prop**

Current (line 233):
```ts
const [mailchimpUrl, setMailchimpUrl] = useState<string | null>(null)
```

Replace with:
```ts
const [mailchimpUrl, setMailchimpUrl] = useState<string | null>(campaign.mailchimp_url ?? null)
```

**Edit 2 — Reset on campaign navigation**

The `useEffect` around line 277 resets state when `campaign.id` changes. Add `mailchimpUrl` reset to it:

Current:
```ts
useEffect(() => {
  setBriefing(campaign.briefing ?? {})
  briefingInitialized.current = false
  setReviewApproved(campaign.review_approved)
  setAutoSendEmails(campaign.auto_send_emails ?? [])
  setNewEmail('')
}, [campaign.id])
```

Replace with:
```ts
useEffect(() => {
  setBriefing(campaign.briefing ?? {})
  briefingInitialized.current = false
  setReviewApproved(campaign.review_approved)
  setAutoSendEmails(campaign.auto_send_emails ?? [])
  setNewEmail('')
  setMailchimpUrl(campaign.mailchimp_url ?? null)
}, [campaign.id])
```

**Edit 3 — Gate creation form on null URL**

The Mailchimp section (lines 737–776) currently shows the creation form until `mailchimpUrl` local state is set. The outer condition is already correct (`assets.some((a) => a.is_output)`). Only the inner logic changes.

Current inner content (lines 742–774):
```tsx
{mailchimpUrl ? (
  <a
    href={mailchimpUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[#2E7D32] border border-[#2E7D32]/40 bg-[#2E7D32]/8 rounded-sm hover:bg-[#2E7D32]/15 transition-colors"
  >
    <ExternalLink size={12} />
    In Mailchimp öffnen
  </a>
) : (
  <>
    <input
      type="text"
      value={mailchimpSubject}
      onChange={(e) => setMailchimpSubject(e.target.value)}
      placeholder="Betreff der E-Mail…"
      disabled={sendingMailchimp}
      className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 disabled:opacity-50"
    />
    <button
      onClick={handleSendToMailchimp}
      disabled={sendingMailchimp || !mailchimpSubject.trim()}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-40"
    >
      {sendingMailchimp && <Loader2 size={12} className="animate-spin" />}
      {sendingMailchimp ? 'Wird erstellt…' : 'Kampagne in Mailchimp erstellen'}
    </button>
    {mailchimpError && <p className="text-xs text-[#E65100]">{mailchimpError}</p>}
  </>
)}
```

Replace the link label only — change `In Mailchimp öffnen` to `In Mailchimp ansehen` to match the user-facing button label requested. Everything else stays identical:

```tsx
{mailchimpUrl ? (
  <a
    href={mailchimpUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[#2E7D32] border border-[#2E7D32]/40 bg-[#2E7D32]/8 rounded-sm hover:bg-[#2E7D32]/15 transition-colors"
  >
    <ExternalLink size={12} />
    In Mailchimp ansehen
  </a>
) : (
  <>
    <input
      type="text"
      value={mailchimpSubject}
      onChange={(e) => setMailchimpSubject(e.target.value)}
      placeholder="Betreff der E-Mail…"
      disabled={sendingMailchimp}
      className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 disabled:opacity-50"
    />
    <button
      onClick={handleSendToMailchimp}
      disabled={sendingMailchimp || !mailchimpSubject.trim()}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-40"
    >
      {sendingMailchimp && <Loader2 size={12} className="animate-spin" />}
      {sendingMailchimp ? 'Wird erstellt…' : 'Kampagne in Mailchimp erstellen'}
    </button>
    {mailchimpError && <p className="text-xs text-[#E65100]">{mailchimpError}</p>}
  </>
)}
```

- [ ] **Step 1: Apply Edit 1** — change `mailchimpUrl` initial state (line 233)
- [ ] **Step 2: Apply Edit 2** — add `setMailchimpUrl` reset to the navigation useEffect (line ~277)
- [ ] **Step 3: Apply Edit 3** — change button label from `In Mailchimp öffnen` to `In Mailchimp ansehen`
- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Open the app, navigate to Calendar.
2. Click a newsletter campaign that already has output generated.
3. Scroll to the Mailchimp section — should show the creation form (URL is null).
4. Enter a subject and click "Kampagne in Mailchimp erstellen".
5. After success: button changes to "In Mailchimp ansehen" — click it, confirm it opens the correct Mailchimp campaign.
6. Close the side panel (click another date or press X).
7. Re-click the same campaign — Mailchimp section should show "In Mailchimp ansehen" button immediately, no creation form.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/CampaignSidePanel.tsx
git commit -m "feat: show persistent mailchimp link in campaign side panel"
```
