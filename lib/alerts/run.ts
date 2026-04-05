// lib/alerts/run.ts
// Shared alert execution logic used by both the cron endpoint and the test endpoint.

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { collectAlerts, recordAlertsSent } from '@/lib/alerts'
import { buildDailyEmail, buildWeeklyEmail } from '@/lib/alerts/email'
import { runAutoSend } from '@/lib/auto-send'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
const DAILY_TO = 'marketing@collezioni.eu'
const WEEKLY_EXTRA_TO = 'brunken.jann@gmail.com'

export async function runAlerts(overrideIsMonday?: boolean) {
  try {
    const result = await collectAlerts()
    const { todayStr, isMonday: detectedMonday, kw, alerts, upcoming14Days, completedLastWeek } =
      result
    const isMonday = overrideIsMonday ?? detectedMonday

    const sent: string[] = []

    // Daily alert — only send if there are active alerts
    if (alerts.length > 0) {
      const { subject, html } = buildDailyEmail(alerts, todayStr, kw)
      const { error } = await resend.emails.send({ from: FROM, to: DAILY_TO, subject, html })
      if (error) {
        console.error('Resend daily error:', error)
      } else {
        sent.push('daily')
        await recordAlertsSent(alerts)
      }
    }

    // Monday weekly summary — sent to both recipients
    if (isMonday && (upcoming14Days.length > 0 || completedLastWeek.length > 0)) {
      const { subject, html } = buildWeeklyEmail(upcoming14Days, completedLastWeek, alerts, kw)
      const { error } = await resend.emails.send({
        from: FROM,
        to: [DAILY_TO, WEEKLY_EXTRA_TO],
        subject,
        html,
      })
      if (error) {
        console.error('Resend weekly error:', error)
      } else {
        sent.push('weekly')
      }
    }

    // Monday auto-send: reports with review_approved=true
    let autoSendResult = null
    if (isMonday) {
      autoSendResult = await runAutoSend()
      if (autoSendResult.errors.length > 0) {
        console.error('Auto-send errors:', autoSendResult.errors)
      }
    }

    return NextResponse.json({
      ok: true,
      date: todayStr,
      kw,
      isMonday,
      alertCount: alerts.length,
      sent,
      autoSend: autoSendResult,
    })
  } catch (err: any) {
    console.error('Campaign alerts cron error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
