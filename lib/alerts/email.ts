// lib/alerts/email.ts
// HTML email templates for daily alerts and Monday weekly summary

import type { CampaignAlertInfo } from './index'

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  postcard: 'Postkarte',
  newsletter: 'Newsletter',
  report_internal: 'Report Intern',
  report_external: 'Report Extern',
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Geplant',
  assets_pending: 'Assets ausstehend',
  assets_complete: 'Assets vollständig',
  generating: 'Wird generiert',
  review: 'In Prüfung',
  approved: 'Freigegeben',
  sent: 'Versendet',
}

function fmt(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function calendarLink(dateStr: string): string {
  return `${APP_URL}/calendar?date=${dateStr}`
}

// ─── Shared HTML frame ────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:Inter,Arial,sans-serif;color:#FFFFFF;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0A0A0A;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <!-- Header -->
      <tr><td style="background:#1A1A1A;border:1px solid #2A2A2A;border-radius:4px 4px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999999;">Campaign Manager</p>
        <h1 style="margin:8px 0 0;font-size:20px;font-weight:300;color:#EDE8E3;">${title}</h1>
      </td></tr>
      <!-- Body -->
      <tr><td style="background:#111111;border:1px solid #2A2A2A;border-top:none;border-radius:0 0 4px 4px;padding:24px 32px;">
        ${body}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 0 0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#555555;">Campaign Manager · Collezioni Design Syndicate</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ─── Campaign row ─────────────────────────────────────────────────────────────

function campaignRow(c: CampaignAlertInfo, showStatus = true): string {
  const warningBadges = c.warnings
    .map(
      (w) =>
        `<span style="display:inline-block;margin-right:6px;padding:2px 8px;background:#E6510020;border:1px solid #E6510060;border-radius:2px;font-size:10px;color:#E65100;">⚠ ${w}</span>`
    )
    .join('')

  const typeLabel = TYPE_LABEL[c.type] ?? c.type
  const statusLabel = STATUS_LABEL[c.status] ?? c.status

  return `
<tr>
  <td style="padding:10px 0;border-bottom:1px solid #1E1E1E;">
    <a href="${calendarLink(c.scheduled_date)}" style="text-decoration:none;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:13px;font-weight:500;color:#FFFFFF;">${c.manufacturer}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#999999;">${typeLabel} · ${c.agency}</p>
            ${warningBadges ? `<div style="margin-top:6px;">${warningBadges}</div>` : ''}
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:16px;">
            <p style="margin:0;font-size:13px;color:#EDE8E3;">${fmt(c.scheduled_date)}</p>
            ${showStatus ? `<p style="margin:2px 0 0;font-size:11px;color:#666666;">${statusLabel}</p>` : ''}
          </td>
        </tr>
      </table>
    </a>
  </td>
</tr>`
}

// ─── Section block ────────────────────────────────────────────────────────────

function section(emoji: string, title: string, rows: string): string {
  if (!rows) return ''
  return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
  <tr><td style="padding-bottom:10px;border-bottom:2px solid #2A2A2A;">
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">${emoji}&nbsp; ${title}</p>
  </td></tr>
  ${rows}
</table>`
}

// ─── Daily alert email ────────────────────────────────────────────────────────

export function buildDailyEmail(
  alerts: CampaignAlertInfo[],
  todayStr: string,
  kw: number
): { subject: string; html: string } {
  const overdue = alerts.filter((a) => a.days_until < 0)
  const thisWeek = alerts.filter((a) => a.days_until >= 0 && a.days_until <= 7)
  const nextWeek = alerts.filter((a) => a.days_until >= 8 && a.days_until <= 14)
  const preview = alerts.filter((a) => a.days_until >= 15 && a.days_until <= 42)

  const overdueRows = overdue.map((c) => campaignRow(c)).join('')
  const thisWeekRows = thisWeek.map((c) => campaignRow(c)).join('')
  const nextWeekRows = nextWeek.map((c) => campaignRow(c)).join('')
  const previewRows = preview.map((c) => campaignRow(c, false)).join('')

  const body = [
    section('🔴', 'Überfällig', overdueRows),
    section('🟡', 'Diese Woche (0–7 Tage)', thisWeekRows),
    section('📋', 'Nächste Woche (8–14 Tage)', nextWeekRows),
    section('📅', 'Vorschau (15–42 Tage)', previewRows),
    `<p style="margin:24px 0 0;font-size:11px;color:#555555;text-align:center;">
      <a href="${APP_URL}/calendar" style="color:#EDE8E3;">Zum Kalender →</a>
    </p>`,
  ]
    .filter(Boolean)
    .join('')

  const subject = `Campaign Manager — ${alerts.length} Aufgabe${alerts.length !== 1 ? 'n' : ''} offen | KW ${kw}`

  return { subject, html: wrapHtml(subject, body) }
}

// ─── Monday weekly summary email ──────────────────────────────────────────────

export function buildWeeklyEmail(
  upcoming: CampaignAlertInfo[],
  completedLastWeek: CampaignAlertInfo[],
  alerts: CampaignAlertInfo[],
  kw: number
): { subject: string; html: string } {
  const thisWeekCampaigns = upcoming.filter((c) => c.days_until <= 7)
  const nextWeekCampaigns = upcoming.filter((c) => c.days_until > 7)

  const thisWeekRows = thisWeekCampaigns.map((c) => campaignRow(c)).join('')
  const nextWeekRows = nextWeekCampaigns.map((c) => campaignRow(c, false)).join('')
  const completedRows = completedLastWeek
    .map(
      (c) => `
<tr>
  <td style="padding:10px 0;border-bottom:1px solid #1E1E1E;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td>
          <p style="margin:0;font-size:13px;color:#666666;text-decoration:line-through;">${c.manufacturer}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#555555;">${TYPE_LABEL[c.type] ?? c.type}</p>
        </td>
        <td style="text-align:right;white-space:nowrap;padding-left:16px;">
          <p style="margin:0;font-size:12px;color:#2E7D32;">✓ Versendet</p>
          <p style="margin:2px 0 0;font-size:11px;color:#555555;">${fmt(c.scheduled_date)}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`
    )
    .join('')

  const openAlertRows = alerts
    .slice(0, 10)
    .map(
      (c) => `
<tr>
  <td style="padding:8px 0;border-bottom:1px solid #1E1E1E;">
    <a href="${calendarLink(c.scheduled_date)}" style="text-decoration:none;color:#FFFFFF;">
      <span style="font-size:12px;color:#EDE8E3;">${c.manufacturer}</span>
      <span style="font-size:11px;color:#666666;margin-left:8px;">${c.warnings.join(' · ') || c.alert_types.join(' · ')}</span>
      <span style="font-size:11px;color:#999999;float:right;">${fmt(c.scheduled_date)}</span>
    </a>
  </td>
</tr>`
    )
    .join('')

  const body = [
    thisWeekCampaigns.length > 0
      ? section('📅', `Diese Woche — ${thisWeekCampaigns.length} Kampagnen`, thisWeekRows)
      : '',
    nextWeekCampaigns.length > 0
      ? section('📋', `Nächste Woche — ${nextWeekCampaigns.length} Kampagnen`, nextWeekRows)
      : '',
    completedLastWeek.length > 0
      ? section('✅', 'Letzte Woche erledigt', completedRows)
      : '',
    alerts.length > 0 ? section('⚠️', 'Offene Alerts', openAlertRows) : '',
    `<p style="margin:24px 0 0;font-size:11px;color:#555555;text-align:center;">
      <a href="${APP_URL}/calendar" style="color:#EDE8E3;">Zum Kalender →</a>
    </p>`,
  ]
    .filter(Boolean)
    .join('')

  const subject = `📋 Wochenplanung KW ${kw} — ${upcoming.length} Kampagnen`

  return { subject, html: wrapHtml(subject, body) }
}
