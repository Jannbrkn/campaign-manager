// lib/mailchimp/fetch-report-data.ts
// Fetches email activity + list members from Mailchimp API v3
// and returns CSV-formatted strings compatible with generateReports().

import { mcFetch } from '@/lib/mailchimp'

export interface MailchimpReportData {
  recipientsCsv: string
  campaignCsv: string
  sendTime: string
  listId: string
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function buildCsvString(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  return lines.join('\n')
}

// ─── Mailchimp API fetchers ──────────────────────────────────────────────────

interface EmailActivity {
  email_address: string
  activity: Array<{ action: string; timestamp: string }>
}

async function fetchAllEmailActivity(campaignId: string): Promise<EmailActivity[]> {
  const all: EmailActivity[] = []
  let offset = 0
  const count = 500
  while (true) {
    const res = await mcFetch(
      `/reports/${campaignId}/email-activity?count=${count}&offset=${offset}`,
      'GET'
    )
    const batch: EmailActivity[] = res.emails ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return all
}

interface McListMember {
  email_address: string
  merge_fields: Record<string, string>
  status: string
}

async function fetchAllListMembers(listId: string): Promise<McListMember[]> {
  const all: McListMember[] = []
  let offset = 0
  const count = 500
  while (true) {
    const res = await mcFetch(
      `/lists/${listId}/members?count=${count}&offset=${offset}&fields=members.email_address,members.merge_fields,members.status`,
      'GET'
    )
    const batch: McListMember[] = res.members ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return all.filter((m) => m.status === 'subscribed')
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface AggregatedActivity {
  email: string
  opens: number
  clicks: number
}

export function aggregateActivity(activities: EmailActivity[]): AggregatedActivity[] {
  const map = new Map<string, { opens: number; clicks: number }>()

  for (const entry of activities) {
    const email = entry.email_address.toLowerCase()
    const existing = map.get(email) ?? { opens: 0, clicks: 0 }
    for (const act of entry.activity ?? []) {
      if (act.action === 'open') existing.opens++
      else if (act.action === 'click') existing.clicks++
    }
    map.set(email, existing)
  }

  return Array.from(map.entries()).map(([email, stats]) => ({
    email,
    opens: stats.opens,
    clicks: stats.clicks,
  }))
}

// Phone merge field can have different names across audiences
const PHONE_FIELDS = ['PHONE', 'MMERGE5', 'MMERGE4', 'PHONE_NUMBER']

function findPhone(mergeFields: Record<string, string>): string {
  for (const key of PHONE_FIELDS) {
    const val = mergeFields[key]
    if (val && val.trim()) return val.trim()
  }
  // Fallback: search all merge fields for phone-like values
  for (const [key, val] of Object.entries(mergeFields)) {
    if (key.toLowerCase().includes('phone') && val && val.trim()) return val.trim()
  }
  return ''
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchMailchimpReportData(
  mailchimpCampaignId: string,
  knownListId?: string
): Promise<MailchimpReportData> {
  // Step 1: Get campaign metadata (skip if listId already known)
  let listId = knownListId ?? ''
  let sendTime = ''

  const campaignMeta = await mcFetch(`/campaigns/${mailchimpCampaignId}`, 'GET')
  sendTime = campaignMeta.send_time ?? ''
  if (!listId) listId = campaignMeta.recipients?.list_id ?? ''

  if (!listId) {
    throw new Error('MAILCHIMP_NO_LIST_ID: Campaign has no associated audience/list')
  }
  if (!sendTime) {
    throw new Error('MAILCHIMP_NOT_SENT: Campaign has no send_time — may not be sent yet')
  }

  // Step 2: Fetch email activity (engagement data)
  const rawActivity = await fetchAllEmailActivity(mailchimpCampaignId)
  if (rawActivity.length === 0) {
    throw new Error('MAILCHIMP_NO_ACTIVITY: No email activity found for this campaign')
  }
  const aggregated = aggregateActivity(rawActivity)

  // Step 3: Fetch list members (contact data)
  const members = await fetchAllListMembers(listId)

  // Build member lookup for names
  const memberMap = new Map<string, McListMember>()
  for (const m of members) {
    memberMap.set(m.email_address.toLowerCase(), m)
  }

  // Step 4: Build campaign CSV (engagement data)
  const campaignRows: string[][] = []
  for (const act of aggregated) {
    const member = memberMap.get(act.email)
    campaignRows.push([
      act.email,
      member?.merge_fields?.FNAME ?? '',
      member?.merge_fields?.LNAME ?? '',
      String(act.opens),
      String(act.clicks),
    ])
  }
  const campaignCsv = buildCsvString(
    ['Email Address', 'First Name', 'Last Name', 'Opens', 'Clicks'],
    campaignRows
  )

  // Step 5: Build recipients CSV (contact data)
  const recipientRows: string[][] = []
  for (const m of members) {
    recipientRows.push([
      m.email_address,
      m.merge_fields?.FNAME ?? '',
      m.merge_fields?.LNAME ?? '',
      findPhone(m.merge_fields),
    ])
  }
  const recipientsCsv = buildCsvString(
    ['Email Address', 'First Name', 'Last Name', 'Phone Number'],
    recipientRows
  )

  return { recipientsCsv, campaignCsv, sendTime, listId }
}
