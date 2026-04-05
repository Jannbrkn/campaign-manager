// app/api/cron/campaign-alerts/test/route.ts
// Manual test endpoint — no auth required, development only
// Returns email preview JSON without sending; pass ?send=1 to actually send, ?monday=1 to force weekly

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { collectAlerts, recordAlertsSent } from '@/lib/alerts'
import { buildDailyEmail, buildWeeklyEmail } from '@/lib/alerts/email'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Test endpoint disabled in production' }, { status: 403 })
  }

  const shouldSend = req.nextUrl.searchParams.get('send') === '1'
  const forceMonday = req.nextUrl.searchParams.get('monday') === '1'

  const result = await collectAlerts()
  const { todayStr, kw, alerts, upcoming14Days, completedLastWeek } = result
  const isMonday = forceMonday || result.isMonday

  const daily = buildDailyEmail(alerts, todayStr, kw)
  const weekly = buildWeeklyEmail(upcoming14Days, completedLastWeek, alerts, kw)

  if (shouldSend) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
    const TEST_TO = 'brunken.jann@gmail.com'

    const results: any[] = []

    if (alerts.length > 0) {
      const { error, data } = await resend.emails.send({
        from: FROM,
        to: TEST_TO,
        subject: `[TEST] ${daily.subject}`,
        html: daily.html,
      })
      results.push({ type: 'daily', error, id: data?.id })
      if (!error) await recordAlertsSent(alerts)
    }

    if (isMonday) {
      const { error, data } = await resend.emails.send({
        from: FROM,
        to: TEST_TO,
        subject: `[TEST] ${weekly.subject}`,
        html: weekly.html,
      })
      results.push({ type: 'weekly', error, id: data?.id })
    }

    return NextResponse.json({ ok: true, date: todayStr, kw, isMonday, alertCount: alerts.length, results })
  }

  return NextResponse.json({
    ok: true,
    date: todayStr,
    kw,
    isMonday,
    alertCount: alerts.length,
    upcoming14DaysCount: upcoming14Days.length,
    completedLastWeekCount: completedLastWeek.length,
    alerts: alerts.map((a) => ({
      manufacturer: a.manufacturer,
      type: a.type,
      scheduled_date: a.scheduled_date,
      days_until: a.days_until,
      alert_types: a.alert_types,
      warnings: a.warnings,
    })),
    daily: { subject: daily.subject, htmlLength: daily.html.length },
    weekly: { subject: weekly.subject, htmlLength: weekly.html.length },
    hint: 'Add ?send=1 to send test emails to brunken.jann@gmail.com. Add ?monday=1 to force weekly email.',
  })
}
