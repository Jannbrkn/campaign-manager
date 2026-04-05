import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

async function getAlertCount(): Promise<number> {
  const supabase = await createClient()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const { count } = await supabase
    .from('campaign_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .is('acknowledged_at', null)
    .gte('sent_at', cutoff.toISOString())
  return count ?? 0
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const alertCount = await getAlertCount()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar alertCount={alertCount} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </main>
    </div>
  )
}
