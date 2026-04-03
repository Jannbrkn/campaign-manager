'use client'

import { useState, useRef, useTransition, useEffect, useCallback } from 'react'
import { X, Upload, FileText, ImageIcon, Loader2, ChevronLeft, ExternalLink, Trash2, Pencil, Link2, ChevronRight } from 'lucide-react'
import { uploadCampaignAsset, deleteCampaignAsset, updateCampaignStatus, deleteCampaign } from '@/app/(app)/calendar/actions'
import type { CampaignWithManufacturer, CampaignAsset, CampaignStatus, CampaignType } from '@/lib/supabase/types'
import EditCampaignModal from './EditCampaignModal'

// ─── Status & type constants ──────────────────────────────────────────────────

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  planned:         'Geplant',
  assets_pending:  'Assets ausstehend',
  assets_complete: 'Assets vollständig',
  generating:      'In Generierung',
  review:          'Zur Prüfung',
  approved:        'Freigegeben',
  sent:            'Versendet',
}

// badge = full badge classes; dot = dot bg class
export const STATUS_STYLE: Record<CampaignStatus, { badge: string; dot: string }> = {
  planned:         { badge: 'text-[#999999] border-[#999999]/40 bg-[#999999]/8',      dot: 'bg-[#999999]' },
  assets_pending:  { badge: 'text-[#E65100] border-[#E65100]/40 bg-[#E65100]/8',      dot: 'bg-[#E65100]' },
  assets_complete: { badge: 'text-[#C4A87C] border-[#C4A87C]/40 bg-[#C4A87C]/8',      dot: 'bg-[#C4A87C]' },
  generating:      { badge: 'text-[#4A6FA5] border-[#4A6FA5]/40 bg-[#4A6FA5]/8',      dot: 'bg-[#4A6FA5]' },
  review:          { badge: 'text-[#EDE8E3] border-[#EDE8E3]/40 bg-[#EDE8E3]/8',      dot: 'bg-[#EDE8E3]' },
  approved:        { badge: 'text-[#2E7D32] border-[#2E7D32]/40 bg-[#2E7D32]/8',      dot: 'bg-[#2E7D32]' },
  sent:            { badge: 'text-white border-[#2E7D32] bg-[#2E7D32]',               dot: 'bg-[#2E7D32]' },
}

const STATUS_ORDER: CampaignStatus[] = [
  'planned', 'assets_pending', 'assets_complete', 'generating', 'review', 'approved', 'sent',
]

const TYPE_LABELS: Record<CampaignType, string> = {
  postcard:        'Postkarte',
  newsletter:      'Newsletter',
  report_internal: 'Report Intern',
  report_external: 'Report Extern',
}

const TYPE_DOT: Record<CampaignType, string> = {
  postcard:        'bg-[#C4A87C]',
  newsletter:      'bg-[#EDE8E3]',
  report_internal: 'bg-[#999999]',
  report_external: 'bg-[#999999]',
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Linked campaign helpers ──────────────────────────────────────────────────

interface LinkedCampaign {
  id: string
  title: string
  type: CampaignType
  scheduled_date: string
}

async function loadLinkedCampaigns(campaign: CampaignWithManufacturer): Promise<LinkedCampaign[]> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const results: LinkedCampaign[] = []

  if (campaign.type === 'postcard') {
    // Newsletter(s) that link to this postcard
    const { data } = await supabase
      .from('campaigns')
      .select('id, title, type, scheduled_date')
      .eq('linked_postcard_id', campaign.id)
    if (data) results.push(...(data as LinkedCampaign[]))
    // Also get reports linked via those newsletters
    for (const nl of results.filter((c) => c.type === 'newsletter')) {
      const { data: reports } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date')
        .eq('linked_newsletter_id', nl.id)
      if (reports) results.push(...(reports as LinkedCampaign[]))
    }
  } else if (campaign.type === 'newsletter') {
    if (campaign.linked_postcard_id) {
      const { data } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date')
        .eq('id', campaign.linked_postcard_id)
        .single()
      if (data) results.push(data as LinkedCampaign)
    }
    const { data: reports } = await supabase
      .from('campaigns')
      .select('id, title, type, scheduled_date')
      .eq('linked_newsletter_id', campaign.id)
    if (reports) results.push(...(reports as LinkedCampaign[]))
  } else {
    // report_internal / report_external
    if (campaign.linked_newsletter_id) {
      const { data: nl } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date, linked_postcard_id')
        .eq('id', campaign.linked_newsletter_id)
        .single()
      if (nl) {
        results.push(nl as unknown as LinkedCampaign)
        if ((nl as any).linked_postcard_id) {
          const { data: pc } = await supabase
            .from('campaigns')
            .select('id, title, type, scheduled_date')
            .eq('id', (nl as any).linked_postcard_id)
            .single()
          if (pc) results.push(pc as LinkedCampaign)
        }
      }
    }
  }

  return results
}

async function fetchFullCampaign(id: string): Promise<CampaignWithManufacturer | null> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', id)
    .single()
  return data as CampaignWithManufacturer | null
}

// ─── Status Dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({ campaignId, status, onChanged }: {
  campaignId: string; status: CampaignStatus; onChanged: (s: CampaignStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  function select(s: CampaignStatus) {
    setOpen(false)
    onChanged(s)
    startTransition(async () => { await updateCampaignStatus(campaignId, s) })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 border rounded-sm transition-colors ${STATUS_STYLE[status].badge}`}
      >
        {pending && <Loader2 size={10} className="animate-spin" />}
        {STATUS_LABELS[status]}
        <span className="opacity-40 ml-0.5">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-surface border border-border rounded-sm shadow-xl overflow-hidden">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => select(s)}
              className={`w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors hover:bg-white/5 ${s === status ? 'bg-white/5' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[s].dot}`} />
              <span className={s === status ? 'text-text-primary' : 'text-text-secondary'}>
                {STATUS_LABELS[s]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campaign Detail ──────────────────────────────────────────────────────────

interface CampaignDetailProps {
  campaign: CampaignWithManufacturer
  onBack: () => void
  onRefresh: () => void
  onNavigate: (c: CampaignWithManufacturer) => void
}

function CampaignDetail({ campaign, onBack, onRefresh, onNavigate }: CampaignDetailProps) {
  const [status, setStatus] = useState<CampaignStatus>(campaign.status)
  const [assets, setAssets] = useState<CampaignAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [linked, setLinked] = useState<LinkedCampaign[]>([])
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingCampaign, setDeletingCampaign] = useState(false)
  const isLoadingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAssets = useCallback(async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoadingAssets(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('campaign_assets').select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
    setAssets((data as CampaignAsset[]) ?? [])
    setLoadingAssets(false)
    isLoadingRef.current = false
  }, [campaign.id])

  useEffect(() => {
    loadAssets()
    loadLinkedCampaigns(campaign).then(setLinked)
  }, [campaign.id])

  // Reset status when campaign prop changes (navigation)
  useEffect(() => { setStatus(campaign.status) }, [campaign.id])

  async function handleNavigate(linkedId: string) {
    setNavigatingId(linkedId)
    const full = await fetchFullCampaign(linkedId)
    setNavigatingId(null)
    if (full) onNavigate(full)
  }

  function uploadFile(file: File) {
    setUploadError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('campaign_id', campaign.id)
    uploadCampaignAsset(fd)
      .then(() => { isLoadingRef.current = false; loadAssets(); onRefresh() })
      .catch((err) => setUploadError(err.message))
  }

  async function handleDeleteAsset(asset: CampaignAsset) {
    setDeletingAssetId(asset.id)
    try {
      await deleteCampaignAsset(asset.id, asset.file_url)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setDeletingAssetId(null)
    }
  }

  async function handleDeleteCampaign() {
    setDeletingCampaign(true)
    try {
      await deleteCampaign(campaign.id)
      onRefresh()
      onBack()
    } catch {
      setDeletingCampaign(false)
      setConfirmDelete(false)
    }
  }

  const mfg = campaign.manufacturers
  const agency = mfg?.agencies

  // Linked section label per type
  const linkedLabel =
    campaign.type === 'postcard' ? 'Verknüpfte Kampagnen' :
    campaign.type === 'newsletter' ? 'Postkarte & Reports' :
    'Newsletter & Postkarte'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors shrink-0">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[campaign.type]}`} />
          <span className="text-sm text-text-primary truncate">{campaign.title}</span>
        </div>
        <button onClick={() => setShowEdit(true)} className="p-1.5 text-text-secondary hover:text-text-primary transition-colors shrink-0">
          <Pencil size={13} />
        </button>
        <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-text-secondary hover:text-[#E65100] transition-colors shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Delete confirmation bar */}
      {confirmDelete && (
        <div className="flex items-center justify-between px-5 py-3 bg-[#E65100]/5 border-b border-[#E65100]/20 shrink-0">
          <p className="text-xs text-[#E65100]">Kampagne wirklich löschen?</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
              Abbrechen
            </button>
            <button
              onClick={handleDeleteCampaign}
              disabled={deletingCampaign}
              className="flex items-center gap-1.5 text-xs px-3 py-1 border border-[#E65100]/40 text-[#E65100] rounded-sm hover:bg-[#E65100]/10 transition-colors disabled:opacity-50"
            >
              {deletingCampaign && <Loader2 size={11} className="animate-spin" />}
              Löschen
            </button>
          </div>
        </div>
      )}

      {showEdit && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onRefresh() }}
        />
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Meta */}
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
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2.5">{linkedLabel}</p>
              <div className="space-y-1.5">
                {linked.map((lc) => (
                  <button
                    key={lc.id}
                    onClick={() => handleNavigate(lc.id)}
                    disabled={navigatingId === lc.id}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-background border border-border rounded-sm hover:border-text-secondary/40 transition-colors group text-left"
                  >
                    <Link2 size={11} className="text-text-secondary shrink-0" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[lc.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{lc.title}</p>
                      <p className="text-[10px] text-text-secondary">
                        {TYPE_LABELS[lc.type]} · {new Date(lc.scheduled_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    {navigatingId === lc.id
                      ? <Loader2 size={12} className="shrink-0 text-text-secondary animate-spin" />
                      : <ChevronRight size={12} className="shrink-0 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    }
                  </button>
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

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); Array.from(e.dataTransfer.files).forEach(uploadFile) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-sm px-4 py-5 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-accent-warm/50 bg-accent-warm/5' : 'border-border hover:border-text-secondary/40'
            }`}
          >
            <Upload size={16} className="mx-auto text-text-secondary mb-1.5" />
            <p className="text-xs text-text-secondary">
              Ziehen oder <span className="text-accent-warm">auswählen</span>
            </p>
            <p className="text-[10px] text-text-secondary/40 mt-0.5">PDF · PNG · JPEG · XLSX · CSV · ZIP</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.zip"
              onChange={(e) => { Array.from(e.target.files ?? []).forEach(uploadFile); e.target.value = '' }}
              className="hidden"
            />
          </div>

          {uploadError && <p className="text-xs text-[#E65100] mt-2">{uploadError}</p>}

          {assets.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {assets.map((asset) => {
                const isImage = asset.file_type.startsWith('image/')
                const isDeleting = deletingAssetId === asset.id
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2.5 bg-background border border-border rounded-sm overflow-hidden group hover:border-text-secondary/30 transition-colors"
                  >
                    {isImage ? (
                      <div className="w-10 h-10 shrink-0 bg-border overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.file_url} alt={asset.file_name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-border/30">
                        <FileText size={14} className="text-text-secondary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 py-2">
                      <p className="text-xs text-text-primary truncate leading-tight">{asset.file_name}</p>
                      {asset.file_size && (
                        <p className="text-[10px] text-text-secondary mt-0.5">{formatBytes(asset.file_size)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 pr-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={asset.file_url} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <ExternalLink size={11} />
                      </a>
                      <button
                        onClick={() => handleDeleteAsset(asset)}
                        disabled={isDeleting}
                        className="p-1.5 text-text-secondary hover:text-[#E65100] transition-colors disabled:opacity-50"
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

// ─── Main panel (navigation stack) ───────────────────────────────────────────

interface Props {
  campaigns: CampaignWithManufacturer[]
  selectedDate: string
  onClose: () => void
  onRefresh: () => void
}

export default function CampaignSidePanel({ campaigns, selectedDate, onClose, onRefresh }: Props) {
  const [stack, setStack] = useState<CampaignWithManufacturer[]>([])

  useEffect(() => { setStack([]) }, [selectedDate])

  const activeCampaign = stack.length > 0 ? stack[stack.length - 1] : null

  function push(c: CampaignWithManufacturer) {
    setStack((s) => [...s, c])
  }

  function pop() {
    setStack((s) => s.slice(0, -1))
  }

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (activeCampaign) {
    return (
      <div className="flex flex-col h-full">
        <CampaignDetail
          campaign={activeCampaign}
          onBack={pop}
          onRefresh={onRefresh}
          onNavigate={push}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {campaigns.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-8">Keine Kampagnen an diesem Tag</p>
        ) : (
          campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => push(c)}
              className="w-full text-left bg-background border border-border rounded-sm px-4 py-3 hover:border-text-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[c.status].dot}`} />
                <span className="text-xs text-text-primary font-medium truncate">{c.title}</span>
              </div>
              <div className="flex items-center justify-between pl-[18px]">
                <span className="text-xs text-text-secondary">{c.manufacturers?.name}</span>
                <span className={`text-xs px-1.5 py-0.5 border rounded-sm ${STATUS_STYLE[c.status].badge}`}>
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
