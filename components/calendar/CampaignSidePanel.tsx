'use client'

import { useState, useRef, useTransition, useEffect, useCallback } from 'react'
import { X, Upload, FileText, ImageIcon, Loader2, ChevronLeft, ExternalLink, Trash2, Link2 } from 'lucide-react'
import { uploadCampaignAsset, deleteCampaignAsset, updateCampaignStatus } from '@/app/(app)/calendar/actions'
import type { CampaignWithManufacturer, CampaignAsset, CampaignStatus, CampaignType } from '@/lib/supabase/types'

interface Props {
  campaigns: CampaignWithManufacturer[]
  selectedDate: string
  onClose: () => void
  onRefresh: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CampaignType, string> = {
  postcard: 'Postkarte',
  newsletter: 'Newsletter',
  report_internal: 'Report Intern',
  report_external: 'Report Extern',
}

const TYPE_DOT: Record<CampaignType, string> = {
  postcard: 'bg-accent-gold',
  newsletter: 'bg-accent-warm',
  report_internal: 'bg-text-secondary',
  report_external: 'bg-text-secondary',
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  planned: 'Geplant',
  assets_pending: 'Assets ausstehend',
  assets_complete: 'Assets vollständig',
  generating: 'In Generierung',
  review: 'Zur Prüfung',
  approved: 'Freigegeben',
  sent: 'Versendet',
}

const STATUS_COLORS: Record<CampaignStatus, string> = {
  planned:         'text-text-secondary border-text-secondary/30 bg-text-secondary/5',
  assets_pending:  'text-warning border-warning/30 bg-warning/5',
  assets_complete: 'text-accent-warm border-accent-warm/30 bg-accent-warm/5',
  generating:      'text-accent-gold border-accent-gold/30 bg-accent-gold/5',
  review:          'text-accent-gold border-accent-gold/30 bg-accent-gold/5',
  approved:        'text-success border-success/30 bg-success/5',
  sent:            'text-success border-success/30 bg-success/5',
}

const STATUS_ORDER: CampaignStatus[] = [
  'planned', 'assets_pending', 'assets_complete', 'generating', 'review', 'approved', 'sent',
]

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Linked campaigns ────────────────────────────────────────────────────────

interface LinkedCampaign {
  id: string
  title: string
  type: CampaignType
  scheduled_date: string
}

async function fetchLinkedCampaigns(campaign: CampaignWithManufacturer): Promise<LinkedCampaign[]> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const results: LinkedCampaign[] = []

  if (campaign.type === 'postcard') {
    // Newsletter linked to this postcard
    const { data } = await supabase
      .from('campaigns')
      .select('id, title, type, scheduled_date')
      .eq('linked_postcard_id', campaign.id)
    if (data) results.push(...(data as LinkedCampaign[]))
  } else if (campaign.type === 'newsletter') {
    // Postcard this newsletter links to
    if (campaign.linked_postcard_id) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date')
        .eq('id', campaign.linked_postcard_id)
        .single()
      if (data) results.push(data as LinkedCampaign)
    }
    // Reports linked to this newsletter
    const { data: reports } = await supabase
      .from('campaigns')
      .select('id, title, type, scheduled_date')
      .eq('linked_newsletter_id', campaign.id)
    if (reports) results.push(...(reports as LinkedCampaign[]))
  } else {
    // Reports: linked newsletter
    if (campaign.linked_newsletter_id) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date')
        .eq('id', campaign.linked_newsletter_id)
        .single()
      if (data) results.push(data as LinkedCampaign)
    }
  }

  return results
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({
  campaignId,
  status,
  onChanged,
}: {
  campaignId: string
  status: CampaignStatus
  onChanged: (s: CampaignStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(s: CampaignStatus) {
    setOpen(false)
    onChanged(s) // optimistic
    startTransition(async () => {
      await updateCampaignStatus(campaignId, s)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 border rounded-sm transition-colors ${STATUS_COLORS[status]}`}
      >
        {pending ? <Loader2 size={10} className="animate-spin" /> : null}
        {STATUS_LABELS[status]}
        <span className="opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface border border-border rounded-sm shadow-xl overflow-hidden">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => select(s)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5 flex items-center gap-2
                ${s === status ? 'bg-white/5' : ''}
              `}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[s].split(' ')[0].replace('text-', 'bg-')}`} />
              <span className={s === status ? 'text-text-primary' : 'text-text-secondary'}>{STATUS_LABELS[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campaign Detail ─────────────────────────────────────────────────────────

interface CampaignDetailProps {
  campaign: CampaignWithManufacturer
  onBack: () => void
  onRefresh: () => void
}

function CampaignDetail({ campaign, onBack, onRefresh }: CampaignDetailProps) {
  const [status, setStatus] = useState<CampaignStatus>(campaign.status)
  const [assets, setAssets] = useState<CampaignAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [linked, setLinked] = useState<LinkedCampaign[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const isLoadingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAssets = useCallback(async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoadingAssets(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
    setAssets((data as CampaignAsset[]) ?? [])
    setLoadingAssets(false)
    isLoadingRef.current = false
  }, [campaign.id])

  useEffect(() => {
    loadAssets()
    fetchLinkedCampaigns(campaign).then(setLinked)
  }, [campaign.id])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    Array.from(e.dataTransfer.files).forEach(uploadFile)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(uploadFile)
    e.target.value = ''
  }

  function uploadFile(file: File) {
    setUploadError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('campaign_id', campaign.id)
    // fire-and-forget with manual reload
    uploadCampaignAsset(fd)
      .then(() => {
        isLoadingRef.current = false
        loadAssets()
        onRefresh()
      })
      .catch((err) => setUploadError(err.message))
  }

  async function handleDelete(asset: CampaignAsset) {
    setDeletingId(asset.id)
    try {
      await deleteCampaignAsset(asset.id, asset.file_url)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      onRefresh()
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const mfg = campaign.manufacturers
  const agency = mfg?.agencies

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors shrink-0">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[campaign.type]}`} />
          <span className="text-sm text-text-primary truncate">{campaign.title}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Meta + Status */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Typ</span>
            <span className="text-xs text-text-primary">{TYPE_LABELS[campaign.type]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Status</span>
            <StatusDropdown
              campaignId={campaign.id}
              status={status}
              onChanged={(s) => { setStatus(s); onRefresh() }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Datum</span>
            <span className="text-xs text-text-primary">
              {new Date(campaign.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', {
                weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Hersteller</span>
            <span className="text-xs text-text-primary">{mfg?.name}</span>
          </div>
          {agency && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Agentur</span>
              <span className="text-xs text-text-secondary">{agency.name}</span>
            </div>
          )}
          {campaign.notes && (
            <div className="pt-1">
              <p className="text-xs text-text-secondary mb-1">Notizen</p>
              <p className="text-xs text-text-primary bg-background rounded-sm px-3 py-2 border border-border">{campaign.notes}</p>
            </div>
          )}
        </div>

        {/* Linked campaigns */}
        {linked.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2.5">Verknüpfte Kampagnen</p>
              <div className="space-y-1.5">
                {linked.map((lc) => (
                  <div
                    key={lc.id}
                    className="flex items-center gap-2.5 px-3 py-2 bg-background border border-border rounded-sm"
                  >
                    <Link2 size={11} className="text-text-secondary shrink-0" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[lc.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{lc.title}</p>
                      <p className="text-[10px] text-text-secondary">
                        {TYPE_LABELS[lc.type]} · {new Date(lc.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="border-t border-border" />

        {/* Assets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Assets</span>
            {loadingAssets && <Loader2 size={12} className="animate-spin text-text-secondary" />}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-sm px-4 py-5 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-accent-warm/50 bg-accent-warm/5'
                : 'border-border hover:border-text-secondary/40'
            }`}
          >
            <Upload size={16} className="mx-auto text-text-secondary mb-1.5" />
            <p className="text-xs text-text-secondary">
              Ziehen oder{' '}
              <span className="text-accent-warm">auswählen</span>
            </p>
            <p className="text-[10px] text-text-secondary/40 mt-0.5">PDF · PNG · JPEG · XLSX · CSV · ZIP</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.zip"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {uploadError && (
            <p className="text-xs text-warning mt-2">{uploadError}</p>
          )}

          {/* Asset list */}
          {assets.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {assets.map((asset) => {
                const isImage = asset.file_type.startsWith('image/')
                const isDeleting = deletingId === asset.id

                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2.5 bg-background border border-border rounded-sm overflow-hidden group hover:border-text-secondary/30 transition-colors"
                  >
                    {/* Thumbnail or icon */}
                    {isImage ? (
                      <div className="w-10 h-10 shrink-0 bg-border overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.file_url}
                          alt={asset.file_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-border/30">
                        <FileText size={14} className="text-text-secondary" />
                      </div>
                    )}

                    {/* Name + size */}
                    <div className="flex-1 min-w-0 py-2">
                      <p className="text-xs text-text-primary truncate leading-tight">{asset.file_name}</p>
                      {asset.file_size && (
                        <p className="text-[10px] text-text-secondary mt-0.5">{formatBytes(asset.file_size)}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 pr-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={asset.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <ExternalLink size={11} />
                      </a>
                      <button
                        onClick={() => handleDelete(asset)}
                        disabled={isDeleting}
                        className="p-1.5 text-text-secondary hover:text-warning transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loadingAssets && assets.length === 0 && (
            <p className="text-xs text-text-secondary text-center mt-3 py-2">Noch keine Assets</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Day campaign list ───────────────────────────────────────────────────────

export default function CampaignSidePanel({ campaigns, selectedDate, onClose, onRefresh }: Props) {
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithManufacturer | null>(null)

  // Reset selection when date changes
  useEffect(() => { setSelectedCampaign(null) }, [selectedDate])

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (selectedCampaign) {
    return (
      <div className="flex flex-col h-full">
        <CampaignDetail
          campaign={selectedCampaign}
          onBack={() => setSelectedCampaign(null)}
          onRefresh={onRefresh}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <p className="text-sm text-text-primary capitalize">{formattedDate}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Campaign list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {campaigns.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-8">Keine Kampagnen an diesem Tag</p>
        ) : (
          campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCampaign(c)}
              className="w-full text-left bg-background border border-border rounded-sm px-4 py-3 hover:border-text-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[c.type]}`} />
                <span className="text-xs text-text-primary font-medium truncate">{c.title}</span>
              </div>
              <div className="flex items-center justify-between pl-[18px]">
                <span className="text-xs text-text-secondary">{c.manufacturers?.name}</span>
                <span className={`text-xs px-1.5 py-0.5 border rounded-sm ${STATUS_COLORS[c.status]}`}>
                  {STATUS_LABELS[c.status]}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
