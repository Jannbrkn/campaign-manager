// app/api/cron/performance-refresh/route.ts
// Nightly cron (07:00 UTC): refresh Mailchimp stats for all linked campaigns,
// write fresh snapshots, attempt auto-matching of newly-sent unlinked campaigns.
//
// Auth: CRON_SECRET bearer (Vercel) OR logged-in user (for manual trigger).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mcConfigured } from '@/lib/mailchimp'
import { runPerformanceRefresh } from '@/lib/performance/refresh'

export const maxDuration = 120

export async function GET(req: NextRequest) {
  // Accept CRON_SECRET (for external/Vercel triggers) OR logged-in user
  const auth = req.headers.get('authorization')
  const cronOk = auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const start = Date.now()
  const result = await runPerformanceRefresh()
  const durationMs = Date.now() - start

  console.log(
    `[cron:performance-refresh] linked=${result.linked} updated=${result.updated} ` +
    `snapshots=${result.snapshotsWritten} errors=${result.errors.length} duration=${durationMs}ms`
  )

  return NextResponse.json({ ...result, durationMs })
}
