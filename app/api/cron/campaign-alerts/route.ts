// app/api/cron/campaign-alerts/route.ts
// Daily cron endpoint (08:00 UTC via Vercel Cron)
// Secured with CRON_SECRET bearer token

import { NextRequest, NextResponse } from 'next/server'
import { runAlerts } from '@/lib/alerts/run'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runAlerts()
}
