// lib/mailchimp.ts — Shared Mailchimp API v3 client used by send and refresh routes
const MC_API_KEY = process.env.MAILCHIMP_API_KEY ?? ''
export const MC_SERVER = MC_API_KEY.split('-').at(-1) || 'us19'
export const MC_BASE = `https://${MC_SERVER}.api.mailchimp.com/3.0`

function mcAuthHeader() {
  return `Basic ${Buffer.from(`anystring:${MC_API_KEY}`).toString('base64')}`
}

export async function mcFetch(path: string, method: string, body?: object) {
  const res = await fetch(`${MC_BASE}${path}`, {
    method,
    headers: {
      Authorization: mcAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.detail ?? json.title ?? `Mailchimp error ${res.status}`)
  return json
}

export function mcConfigured() {
  return MC_API_KEY.length > 0
}

/** Fetch all campaigns from Mailchimp (paginated), optionally filtered to status=sent. */
export async function fetchAllMcCampaigns(opts: { onlySent?: boolean } = {}): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  const count = 200
  while (true) {
    const res = await mcFetch(
      `/campaigns?count=${count}&offset=${offset}&fields=campaigns.id,campaigns.web_id,campaigns.settings,campaigns.send_time,campaigns.status`,
      'GET'
    )
    const batch = res.campaigns ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return opts.onlySent ? all.filter((c) => c.status === 'sent') : all
}
