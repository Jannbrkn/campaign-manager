'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { deleteCampaign } from '@/app/(app)/calendar/actions'
import EditCampaignModal from '@/components/calendar/EditCampaignModal'
import type { Campaign, Manufacturer, Agency } from '@/lib/supabase/types'

interface CampaignRow extends Campaign {
  manufacturers: (Manufacturer & { agencies: Agency }) | null
}

const STATUS_LABELS: Record<string, string> = {
  planned:         'Geplant',
  assets_pending:  'Assets ausstehend',
  assets_complete: 'Assets vollständig',
  generating:      'In Generierung',
  review:          'Zur Prüfung',
  approved:        'Freigegeben',
  sent:            'Versendet',
}

const TYPE_LABELS: Record<string, string> = {
  postcard:        'Postkarte',
  newsletter:      'Newsletter',
  report_internal: 'Report Intern',
  report_external: 'Report Extern',
}

const TYPE_DOT: Record<string, string> = {
  postcard:        'bg-accent-gold',
  newsletter:      'bg-accent-warm',
  report_internal: 'bg-text-secondary',
  report_external: 'bg-text-secondary',
}

interface Props {
  campaigns: CampaignRow[]
}

export default function CampaignList({ campaigns }: Props) {
  const router = useRouter()
  const [editingCampaign, setEditingCampaign] = useState<CampaignRow | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteCampaign(id)
      router.refresh()
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  if (campaigns.length === 0) {
    return (
      <p className="px-6 py-8 text-text-secondary text-sm text-center">
        Noch keine Kampagnen geplant
      </p>
    )
  }

  return (
    <>
      {campaigns.map((campaign) => {
        const isConfirming = confirmDeleteId === campaign.id
        const isDeleting = deletingId === campaign.id

        return (
          <div
            key={campaign.id}
            className="px-6 py-4 flex items-center justify-between gap-4 group"
          >
            {/* Left: title + meta */}
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[campaign.type] ?? 'bg-text-secondary'}`} />
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{campaign.title}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {campaign.manufacturers?.name}
                  {campaign.manufacturers?.agencies?.name && (
                    <> · {campaign.manufacturers.agencies.name}</>
                  )}
                </p>
              </div>
            </div>

            {/* Right: meta + actions */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-text-secondary hidden sm:block">
                {TYPE_LABELS[campaign.type] ?? campaign.type}
              </span>
              <span className="text-xs text-text-secondary hidden md:block tabular-nums">
                {new Date(campaign.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
              <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-accent-warm whitespace-nowrap">
                {STATUS_LABELS[campaign.status] ?? campaign.status}
              </span>

              {/* Actions — visible on hover or confirming */}
              {isConfirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning whitespace-nowrap">Löschen?</span>
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    disabled={isDeleting}
                    className="flex items-center gap-1 text-xs px-2 py-1 border border-warning/40 text-warning rounded-sm hover:bg-warning/10 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 size={10} className="animate-spin" /> : null}
                    Ja
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Nein
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingCampaign(campaign)}
                    className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded-sm"
                    title="Bearbeiten"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(campaign.id)}
                    className="p-1.5 text-text-secondary hover:text-warning transition-colors rounded-sm"
                    title="Löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onSaved={() => { setEditingCampaign(null); router.refresh() }}
        />
      )}
    </>
  )
}
