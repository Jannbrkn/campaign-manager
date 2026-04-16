// app/api/performance/refresh/route.ts
// UI-triggered refresh. Shared logic lives in lib/performance/refresh.ts
// (also reused by the nightly cron at /api/cron/performance-refresh).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mcConfigured } from '@/lib/mailchimp'
import { runPerformanceRefresh } from '@/lib/performance/refresh'

export const maxDuration = 120

export async function POST(_req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runPerformanceRefresh()
  return NextResponse.json(result)
}
