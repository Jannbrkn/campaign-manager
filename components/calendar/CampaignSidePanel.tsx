'use client'

import { useState, useRef, useTransition, useEffect, useCallback } from 'react'
import { X, Upload, FileText, ImageIcon, Loader2, ChevronLeft, ExternalLink, Trash2, Pencil, Link2, ChevronRight, Plus, Maximize2, Mail, CheckCircle2 } from 'lucide-react'
import { uploadCampaignAsset, deleteCampaignAsset, updateCampaignStatus, deleteCampaign, updateCampaignBriefing, updateReviewApproved, updateAutoSendEmails } from '@/app/(app)/calendar/actions'
import type { CampaignWithManufacturer, CampaignAsset, CampaignStatus, CampaignType, NewsletterBriefing } from '@/lib/supabase/types'
import EditCampaignModal from './EditCampaignModal'
import { generateReportEmailDraft } from '@/lib/emails/report-draft'

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
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [emailDraft, setEmailDraft] = useState<{ to: string; subject: string; body: string } | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [reviewApproved, setReviewApproved] = useState(campaign.review_approved)
  const [autoSendEmails, setAutoSendEmails] = useState<string[]>(campaign.auto_send_emails ?? [])
  const [newEmail, setNewEmail] = useState('')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [briefing, setBriefing] = useState<NewsletterBriefing>(
    () => campaign.briefing ?? {}
  )
  const [briefingSaving, setBriefingSaving] = useState(false)
  const isLoadingRef = useRef(false)
  const [mailchimpSubject, setMailchimpSubject] = useState(campaign.mailchimp_subject ?? '')
  const [mailchimpPreviewText, setMailchimpPreviewText] = useState(campaign.mailchimp_preview_text ?? '')
  const [sendingMailchimp, setSendingMailchimp] = useState(false)
  const [mailchimpError, setMailchimpError] = useState<string | null>(null)
  const [mailchimpUrl, setMailchimpUrl] = useState<string | null>(campaign.mailchimp_url ?? null)
  const [checkingMailchimp, setCheckingMailchimp] = useState(false)
  const [sizeWarnings, setSizeWarnings] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const briefingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const briefingInitialized = useRef(false)

  const loadAssets = useCallback(async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoadingAssets(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('campaign_assets').select('*')
      .eq('campaign_id', campaign.id)
      .order('is_output', { ascending: false })
      .order('created_at', { ascending: false })
    const raw = (data as CampaignAsset[]) ?? []
    // Sign all asset URLs (bucket is private)
    const marker = '/campaign-assets/'
    const signed = await Promise.all(
      raw.map(async (asset) => {
        const idx = asset.file_url.indexOf(marker)
        if (idx === -1) return asset
        const path = decodeURIComponent(asset.file_url.slice(idx + marker.length).split('?')[0])
        const { data: s } = await supabase.storage
          .from('campaign-assets')
          .createSignedUrl(path, 3600)
        return s?.signedUrl ? { ...asset, file_url: s.signedUrl } : asset
      })
    )
    setAssets(signed)
    setLoadingAssets(false)
    isLoadingRef.current = false
  }, [campaign.id])

  useEffect(() => {
    loadAssets()
    loadLinkedCampaigns(campaign).then(setLinked)
  }, [campaign.id])

  // Reset status when campaign prop changes (navigation)
  useEffect(() => { setStatus(campaign.status) }, [campaign.id])

  // Reset briefing when campaign changes (navigation)
  useEffect(() => {
    setBriefing(campaign.briefing ?? {})
    briefingInitialized.current = false
    setReviewApproved(campaign.review_approved)
    setAutoSendEmails(campaign.auto_send_emails ?? [])
    setNewEmail('')
    setMailchimpUrl(campaign.mailchimp_url ?? null)
    setMailchimpSubject(campaign.mailchimp_subject ?? '')
    setMailchimpPreviewText(campaign.mailchimp_preview_text ?? '')
    setSizeWarnings([])
  }, [campaign.id])

  // Autosave briefing with 800ms debounce (newsletter campaigns only)
  useEffect(() => {
    if (campaign.type !== 'newsletter') return
    if (!briefingInitialized.current) {
      briefingInitialized.current = true
      return
    }
    if (briefingSaveTimer.current) clearTimeout(briefingSaveTimer.current)
    briefingSaveTimer.current = setTimeout(async () => {
      setBriefingSaving(true)
      try {
        await updateCampaignBriefing(campaign.id, briefing)
      } finally {
        setBriefingSaving(false)
      }
    }, 800)
    return () => {
      if (briefingSaveTimer.current) clearTimeout(briefingSaveTimer.current)
    }
  }, [briefing])

  // Load newsletter preview as Blob URL for the iframe
  useEffect(() => {
    const previewAsset = assets.find(
      (a) => a.asset_category === 'newsletter_preview' && a.is_output
    )
    if (!previewAsset) {
      setPreviewSrc(null)
      return
    }
    let blobUrl: string
    fetch(previewAsset.file_url)
      .then((r) => r.text())
      .then((html) => {
        const blob = new Blob([html], { type: 'text/html' })
        blobUrl = URL.createObjectURL(blob)
        setPreviewSrc(blobUrl)
      })
      .catch(() => setPreviewSrc(null))
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [assets])

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

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      const endpoint =
        campaign.type === 'newsletter'
          ? '/api/generate/newsletter'
          : '/api/generate/report'
      const body: Record<string, string> = { campaign_id: campaign.id }
      if (campaign.type === 'newsletter' && feedback.trim()) {
        body.feedback = feedback.trim()
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let json: any
      try {
        json = await res.json()
      } catch {
        throw new Error(
          res.status === 504 || res.status === 502
            ? 'Generierung hat zu lange gedauert (Timeout). Bitte erneut versuchen.'
            : `Server-Fehler (${res.status}) — bitte erneut versuchen.`
        )
      }
      if (!res.ok) throw new Error(json.error ?? 'Generierung fehlgeschlagen')
      isLoadingRef.current = false
      await loadAssets()
      onRefresh()
      setFeedback('')

      // After successful report generation: offer to email if manufacturer has contact
      if (
        (campaign.type === 'report_internal' || campaign.type === 'report_external') &&
        mfg?.contact_email
      ) {
        const draft = generateReportEmailDraft({
          contactPerson: mfg.contact_person ?? null,
          manufacturerName: mfg.name ?? '',
          campaignTitle: campaign.title,
        })
        setEmailDraft({ to: mfg.contact_email, ...draft })
        setEmailSent(false)
        setEmailError(null)
      }
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSendToMailchimp() {
    if (!mailchimpSubject.trim()) return
    setSendingMailchimp(true)
    setMailchimpError(null)
    setMailchimpUrl(null)
    try {
      const res = await fetch('/api/send/mailchimp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id, subject: mailchimpSubject.trim(), preview_text: mailchimpPreviewText.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Erstellen')
      setMailchimpUrl(json.editUrl)
      setSizeWarnings(json.warnings ?? [])
    } catch (e: any) {
      setMailchimpError(e.message)
    } finally {
      setSendingMailchimp(false)
    }
  }

  async function handleOpenMailchimp() {
    setCheckingMailchimp(true)
    setMailchimpError(null)
    try {
      const checkRes = await fetch(`/api/send/mailchimp/check?campaign_id=${campaign.id}`)
      const checkJson = await checkRes.json()
      if (!checkRes.ok) throw new Error(checkJson.error ?? 'Fehler beim Prüfen')

      if (checkJson.exists) {
        window.open(checkJson.editUrl, '_blank', 'noopener,noreferrer')
        return
      }

      // Campaign gone — recreate automatically using the campaign title as subject
      setMailchimpUrl(null)
      const subject = mailchimpSubject.trim() || campaign.title
      const createRes = await fetch('/api/send/mailchimp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id, subject, preview_text: mailchimpPreviewText.trim() }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson.error ?? 'Fehler beim Erstellen')
      setMailchimpUrl(createJson.editUrl)
      setSizeWarnings(createJson.warnings ?? [])
      window.open(createJson.editUrl, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setMailchimpError(e.message)
    } finally {
      setCheckingMailchimp(false)
    }
  }

  async function handleSendEmail() {
    if (!emailDraft) return
    setEmailSending(true)
    setEmailError(null)
    try {
      const res = await fetch('/api/send/report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id, ...emailDraft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Senden')
      setEmailSent(true)
    } catch (e: any) {
      setEmailError(e.message)
    } finally {
      setEmailSending(false)
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

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-sm shadow-2xl w-80 p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-[#E65100]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 size={14} className="text-[#E65100]" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Kampagne löschen?</p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  <span className="text-text-primary">{campaign.title}</span> wird dauerhaft gelöscht — inklusive aller hochgeladenen Assets. Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary border border-border rounded-sm hover:bg-white/5 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteCampaign}
                disabled={deletingCampaign}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-white bg-[#E65100] rounded-sm hover:bg-[#E65100]/90 transition-colors disabled:opacity-50"
              >
                {deletingCampaign && <Loader2 size={11} className="animate-spin" />}
                Endgültig löschen
              </button>
            </div>
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

        {/* Briefing form — newsletter only */}
        {campaign.type === 'newsletter' && (
          <>
            <div className="border-t border-border" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-text-secondary uppercase tracking-wider">Briefing</p>
                {briefingSaving && <Loader2 size={11} className="animate-spin text-text-secondary" />}
              </div>
              <div className="space-y-3">

                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Produkt / Thema</label>
                  <input
                    type="text"
                    value={briefing.product ?? ''}
                    onChange={(e) => setBriefing((b) => ({ ...b, product: e.target.value }))}
                    placeholder="z.B. Boffi Küchen Frühjahr 2026"
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Textentwurf</label>
                  <textarea
                    value={briefing.draft ?? ''}
                    onChange={(e) => setBriefing((b) => ({ ...b, draft: e.target.value }))}
                    placeholder="Rohentwurf oder Stichpunkte für den Newsletter-Text…"
                    rows={5}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-text-secondary mb-1">CTA-Text</label>
                    <input
                      type="text"
                      value={briefing.cta_text ?? ''}
                      onChange={(e) => setBriefing((b) => ({ ...b, cta_text: e.target.value }))}
                      placeholder="Einladung bestätigen"
                      className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-text-secondary mb-1">CTA-Link</label>
                    <input
                      type="url"
                      value={briefing.cta_link ?? ''}
                      onChange={(e) => setBriefing((b) => ({ ...b, cta_link: e.target.value }))}
                      placeholder="https://…"
                      className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Weitere Links</label>
                  <div className="space-y-1.5">
                    {(briefing.extra_links ?? []).map((link, i) => (
                      <div key={i} className="flex gap-1.5">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => {
                            const updated = [...(briefing.extra_links ?? [])]
                            updated[i] = { ...updated[i], label: e.target.value }
                            setBriefing((b) => ({ ...b, extra_links: updated }))
                          }}
                          placeholder="Label"
                          className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => {
                            const updated = [...(briefing.extra_links ?? [])]
                            updated[i] = { ...updated[i], url: e.target.value }
                            setBriefing((b) => ({ ...b, extra_links: updated }))
                          }}
                          placeholder="https://…"
                          className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
                        />
                        <button
                          onClick={() => {
                            const updated = (briefing.extra_links ?? []).filter((_, j) => j !== i)
                            setBriefing((b) => ({ ...b, extra_links: updated }))
                          }}
                          className="p-1.5 text-text-secondary hover:text-[#E65100] transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setBriefing((b) => ({
                        ...b,
                        extra_links: [...(b.extra_links ?? []), { label: '', url: '' }],
                      }))}
                      className="text-[10px] text-text-secondary hover:text-accent-warm transition-colors flex items-center gap-1"
                    >
                      <Plus size={10} />
                      Link hinzufügen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Extra-Hinweise</label>
                  <textarea
                    value={briefing.hints ?? ''}
                    onChange={(e) => setBriefing((b) => ({ ...b, hints: e.target.value }))}
                    placeholder="z.B. Messe-Einladung, förmlicher Ton, Termin: 23. April"
                    rows={2}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 resize-none"
                  />
                </div>

              </div>
            </div>
          </>
        )}

        {/* Generation */}
        {(campaign.type === 'newsletter' ||
          campaign.type === 'report_internal' ||
          campaign.type === 'report_external') && (
          <>
            <div className="border-t border-border" />
            <div>
              {campaign.type === 'newsletter' && assets.some((a) => a.is_output) ? (
                <>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback zur vorherigen Version (optional)…"
                    rows={2}
                    disabled={generating}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 resize-none mb-2 disabled:opacity-50"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
                  >
                    {generating && <Loader2 size={12} className="animate-spin" />}
                    {generating ? 'Wird generiert…' : 'Neu generieren'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
                >
                  {generating && <Loader2 size={12} className="animate-spin" />}
                  {generating
                    ? 'Wird generiert…'
                    : campaign.type === 'newsletter'
                    ? 'Newsletter generieren'
                    : 'Report generieren'}
                </button>
              )}
              {genError && <p className="text-xs text-[#E65100] mt-2">{genError}</p>}
            </div>
          </>
        )}

        {/* Mailchimp — newsletter campaigns with output only */}
        {campaign.type === 'newsletter' && assets.some((a) => a.is_output) && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs text-text-secondary uppercase tracking-wider">Mailchimp</p>
              {mailchimpUrl ? (
                <>
                  <button
                    onClick={handleOpenMailchimp}
                    disabled={checkingMailchimp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[#2E7D32] border border-[#2E7D32]/40 bg-[#2E7D32]/8 rounded-sm hover:bg-[#2E7D32]/15 transition-colors disabled:opacity-50"
                  >
                    {checkingMailchimp ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                    {checkingMailchimp ? 'Wird geprüft…' : 'In Mailchimp ansehen'}
                  </button>
                  {mailchimpError && <p className="text-xs text-[#E65100]">{mailchimpError}</p>}
                  {sizeWarnings.length > 0 && (
                    <div className="space-y-1">
                      {sizeWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-[#C4A87C]">{w}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={mailchimpSubject}
                    onChange={(e) => setMailchimpSubject(e.target.value)}
                    placeholder="Betreff der E-Mail…"
                    disabled={sendingMailchimp}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={mailchimpPreviewText}
                    onChange={(e) => setMailchimpPreviewText(e.target.value)}
                    placeholder="Preview-Text (erscheint nach dem Betreff)…"
                    disabled={sendingMailchimp}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSendToMailchimp}
                    disabled={sendingMailchimp || !mailchimpSubject.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-40"
                  >
                    {sendingMailchimp && <Loader2 size={12} className="animate-spin" />}
                    {sendingMailchimp ? 'Wird erstellt…' : 'Kampagne in Mailchimp erstellen'}
                  </button>
                  {mailchimpError && <p className="text-xs text-[#E65100]">{mailchimpError}</p>}
                </>
              )}
            </div>
          </>
        )}

        {/* Freigabe & Auto-Send — report campaigns only */}
        {(campaign.type === 'report_internal' || campaign.type === 'report_external') && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-3">
              <p className="text-xs text-text-secondary uppercase tracking-wider">Freigabe & Auto-Send</p>

              {/* review_approved toggle */}
              <button
                onClick={async () => {
                  const next = !reviewApproved
                  setReviewApproved(next)
                  await updateReviewApproved(campaign.id, next)
                  onRefresh()
                }}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-sm transition-colors ${
                  reviewApproved
                    ? 'border-[#2E7D32]/50 bg-[#2E7D32]/8'
                    : 'border-border bg-background hover:border-text-secondary/30'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                    reviewApproved ? 'bg-[#2E7D32] border-[#2E7D32]' : 'border-border'
                  }`}>
                    {reviewApproved && <CheckCircle2 size={11} className="text-white" />}
                  </div>
                  <span className="text-xs text-text-primary">Report freigegeben</span>
                </div>
                <span className={`text-[10px] ${reviewApproved ? 'text-[#2E7D32]' : 'text-text-secondary/50'}`}>
                  {reviewApproved ? 'Wird montags versendet' : 'Kein Auto-Send'}
                </span>
              </button>

              {/* auto_send_emails */}
              <div>
                <p className="text-[10px] text-text-secondary/70 mb-2">Empfänger (Montags-Auto-Send)</p>
                <div className="space-y-1.5">
                  {autoSendEmails.map((email) => (
                    <div key={email} className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-sm">
                      <Mail size={10} className="text-text-secondary/50 shrink-0" />
                      <span className="text-xs text-text-primary flex-1 truncate">{email}</span>
                      <button
                        onClick={async () => {
                          const next = autoSendEmails.filter((e) => e !== email)
                          setAutoSendEmails(next)
                          await updateAutoSendEmails(campaign.id, next)
                        }}
                        className="text-text-secondary/40 hover:text-[#E65100] transition-colors shrink-0"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newEmail.trim()) {
                          const next = [...autoSendEmails, newEmail.trim()]
                          setAutoSendEmails(next)
                          setNewEmail('')
                          await updateAutoSendEmails(campaign.id, next)
                        }
                      }}
                      placeholder="mail@beispiel.de + Enter"
                      className="flex-1 bg-background border border-border rounded-sm px-3 py-1.5 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 transition-colors"
                    />
                    <button
                      onClick={async () => {
                        if (!newEmail.trim()) return
                        const next = [...autoSendEmails, newEmail.trim()]
                        setAutoSendEmails(next)
                        setNewEmail('')
                        await updateAutoSendEmails(campaign.id, next)
                      }}
                      className="px-2.5 py-1.5 text-xs border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary/40 rounded-sm transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Email suggestion — shown after successful report generation */}
        {emailDraft && (campaign.type === 'report_internal' || campaign.type === 'report_external') && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary uppercase tracking-wider">Report per Mail senden</p>
                <button
                  onClick={() => setEmailDraft(null)}
                  className="text-text-secondary/50 hover:text-text-secondary transition-colors"
                >
                  <X size={12} />
                </button>
              </div>

              {emailSent ? (
                <div className="flex items-center gap-2 px-3 py-3 bg-[#2E7D32]/10 border border-[#2E7D32]/30 rounded-sm">
                  <CheckCircle2 size={13} className="text-[#2E7D32] shrink-0" />
                  <p className="text-xs text-[#2E7D32]">Mail wurde gesendet an {emailDraft.to}</p>
                </div>
              ) : (
                <>
                  {/* To */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-sm">
                    <Mail size={11} className="text-text-secondary/50 shrink-0" />
                    <span className="text-xs text-text-secondary">An:</span>
                    <span className="text-xs text-text-primary">{emailDraft.to}</span>
                  </div>

                  {/* Subject */}
                  <input
                    type="text"
                    value={emailDraft.subject}
                    onChange={(e) => setEmailDraft((d) => d ? { ...d, subject: e.target.value } : d)}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 transition-colors"
                    placeholder="Betreff"
                  />

                  {/* Body */}
                  <textarea
                    value={emailDraft.body}
                    onChange={(e) => setEmailDraft((d) => d ? { ...d, body: e.target.value } : d)}
                    rows={9}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 resize-none transition-colors leading-relaxed"
                  />

                  {emailError && (
                    <p className="text-xs text-[#E65100]">{emailError}</p>
                  )}

                  <button
                    onClick={handleSendEmail}
                    disabled={emailSending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
                  >
                    {emailSending ? (
                      <><Loader2 size={12} className="animate-spin" /> Wird gesendet…</>
                    ) : (
                      <><Mail size={12} /> Mail mit Anhängen senden</>
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}

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

        {/* Newsletter preview */}
        {previewSrc && campaign.type === 'newsletter' && (
          <>
            <div className="border-t border-border" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-text-secondary uppercase tracking-wider">Newsletter-Vorschau</p>
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="flex items-center gap-1.5 text-[10px] text-text-secondary hover:text-accent-warm transition-colors px-2 py-1 border border-border hover:border-accent-warm/40 rounded-sm"
                >
                  <Maximize2 size={11} />
                  Vollbild
                </button>
              </div>
              <iframe
                src={previewSrc}
                className="w-full rounded-sm border border-border"
                style={{ height: '400px' }}
                title="Newsletter Vorschau"
                sandbox="allow-same-origin"
              />
            </div>
          </>
        )}

        {/* Preview modal */}
        {showPreviewModal && previewSrc && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8"
            onClick={() => setShowPreviewModal(false)}
          >
            <div
              className="relative flex flex-col"
              style={{ width: 680 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal toolbar */}
              <div className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-t-sm">
                <p className="text-sm text-text-primary">{campaign.title}</p>
                <div className="flex items-center gap-2">
                  <a
                    href={previewSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border px-2.5 py-1 rounded-sm transition-colors"
                  >
                    <ExternalLink size={12} />
                    Im Browser öffnen
                  </a>
                  <button
                    onClick={() => setShowPreviewModal(false)}
                    className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {/* Full iframe */}
              <iframe
                src={previewSrc}
                className="w-full border-x border-b border-border rounded-b-sm bg-white"
                style={{ height: '90vh' }}
                title="Newsletter Vorschau Vollbild"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
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
                    className={`flex items-center gap-2.5 bg-background border rounded-sm overflow-hidden group transition-colors ${
                      asset.is_output
                        ? 'border-accent-warm/30 hover:border-accent-warm/60'
                        : 'border-border hover:border-text-secondary/30'
                    }`}
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
