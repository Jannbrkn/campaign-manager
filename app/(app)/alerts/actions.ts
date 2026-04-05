'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ActiveAlert {
  id: string
  campaign_id: string
  alert_type: string
  sent_at: string
  campaign_title: string
  manufacturer_name: string
  scheduled_date: string
}

export async function getActiveAlerts(): Promise<ActiveAlert[]> {
  const supabase = await createClient()

  // Alerts sent in the last 30 days, not yet acknowledged
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const { data } = await supabase
    .from('campaign_alerts')
    .select('id, campaign_id, alert_type, sent_at, campaigns(title, scheduled_date, manufacturers(name))')
    .eq('sent', true)
    .is('acknowledged_at', null)
    .gte('sent_at', cutoff.toISOString())
    .order('sent_at', { ascending: false })

  if (!data) return []

  return data.map((row: any) => ({
    id:                row.id,
    campaign_id:       row.campaign_id,
    alert_type:        row.alert_type,
    sent_at:           row.sent_at,
    campaign_title:    row.campaigns?.title ?? '',
    manufacturer_name: row.campaigns?.manufacturers?.name ?? '',
    scheduled_date:    row.campaigns?.scheduled_date ?? '',
  }))
}

export async function acknowledgeAlert(alertId: string) {
  const supabase = await createClient()
  await supabase
    .from('campaign_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', alertId)
  revalidatePath('/', 'layout')
}

export async function acknowledgeAllAlerts() {
  const supabase = await createClient()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  await supabase
    .from('campaign_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('sent', true)
    .is('acknowledged_at', null)
    .gte('sent_at', cutoff.toISOString())
  revalidatePath('/', 'layout')
}
