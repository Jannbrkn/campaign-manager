'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { X, Upload, FileText, ImageIcon, Loader2, ChevronLeft, ExternalLink } from 'lucide-react'
import { uploadCampaignAsset } from '@/app/(app)/calendar/actions'
import type { CampaignWithManufacturer, CampaignAsset, CampaignStatus, CampaignType } from '@/lib/supabase/types'

interface Props {
  campaigns: CampaignWithManufacturer[]
  selectedDate: string
  onClose: () => void
  onRefresh: () => void
}

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

const STATUS_LABELS: Record<CampaignStatus, string> = {
  planned: 'Geplant',
  assets_pending: 'Assets ausstehend',
  assets_complete: 'Assets vollständig',
  generating: 'Wird generiert',
  review: 'In Prüfung',
  approved: 'Freigegeben',
  sent: 'Gesendet',
}

const STATUS_COLORS: Record<CampaignStatus, string> = {
  planned: 'text-text-secondary border-text-secondary/30',
  assets_pending: 'text-warning border-warning/30',
  assets_complete: 'text-accent-warm border-accent-warm/30',
  generating: 'text-accent-gold border-accent-gold/30',
  review: 'text-accent-gold border-accent-gold/30',
  approved: 'text-success border-success/30',
  sent: 'text-success border-success/30',
}

interface CampaignDetailProps {
  campaign: CampaignWithManufacturer
  onBack: () => void
  onRefresh: () => void
}

function CampaignDetail({ campaign, onBack, onRefresh }: CampaignDetailProps) {
  const [assets, setAssets] = useState<CampaignAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadPending, startUpload] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadAssets() {
    if (assetsLoaded) return
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
    setAssetsLoaded(true)
  }

  // Load assets on mount
  useEffect(() => { loadAssets() }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(uploadFile)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach(uploadFile)
    e.target.value = ''
  }

  function uploadFile(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('campaign_id', campaign.id)
    startUpload(async () => {
      try {
        await uploadCampaignAsset(fd)
        // Refresh asset list
        setAssetsLoaded(false)
        await loadAssets()
        onRefresh()
      } catch (err) {
        console.error('Upload failed:', err)
      }
    })
  }

  const mfg = campaign.manufacturers
  const agency = mfg?.agencies

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[campaign.type]}`} />
          <span className="text-sm text-text-primary truncate">{campaign.title}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Typ</span>
            <span className="text-xs text-text-primary">{TYPE_LABELS[campaign.type]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Status</span>
            <span className={`text-xs px-2 py-0.5 border rounded-sm ${STATUS_COLORS[campaign.status]}`}>
              {STATUS_LABELS[campaign.status]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Datum</span>
            <span className="text-xs text-text-primary">
              {new Date(campaign.scheduled_date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
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
              <span className="text-xs text-text-secondary block mb-1">Notizen</span>
              <p className="text-xs text-text-primary bg-background rounded-sm px-3 py-2 border border-border">{campaign.notes}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Asset Upload */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Assets</span>
            {uploadPending && <Loader2 size={12} className="animate-spin text-text-secondary" />}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-sm px-4 py-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-accent-warm/50 bg-accent-warm/5'
                : 'border-border hover:border-text-secondary/40'
            }`}
          >
            <Upload size={18} className="mx-auto text-text-secondary mb-2" />
            <p className="text-xs text-text-secondary">
              Dateien hierher ziehen oder{' '}
              <span className="text-accent-warm">auswählen</span>
            </p>
            <p className="text-xs text-text-secondary/50 mt-1">PDF, PNG, JPEG, XLSX, CSV, ZIP</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.zip"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* Asset list */}
          {loadingAssets ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-text-secondary" />
            </div>
          ) : assets.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {assets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-sm hover:border-text-secondary/30 transition-colors group"
                >
                  {asset.file_type.startsWith('image/') ? (
                    <ImageIcon size={14} className="text-text-secondary shrink-0" />
                  ) : (
                    <FileText size={14} className="text-text-secondary shrink-0" />
                  )}
                  <span className="text-xs text-text-primary flex-1 truncate">{asset.file_name}</span>
                  <ExternalLink size={12} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-secondary text-center mt-3">Noch keine Assets</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CampaignSidePanel({ campaigns, selectedDate, onClose, onRefresh }: Props) {
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithManufacturer | null>(null)

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="flex flex-col h-full">
      {selectedCampaign ? (
        <CampaignDetail
          campaign={selectedCampaign}
          onBack={() => setSelectedCampaign(null)}
          onRefresh={onRefresh}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <p className="text-sm text-text-primary capitalize">{formattedDate}</p>
              <p className="text-xs text-text-secondary mt-0.5">{campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}</p>
            </div>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Campaign list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {campaigns.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-8">Keine Kampagnen</p>
            ) : (
              campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c)}
                  className="w-full text-left bg-background border border-border rounded-sm px-4 py-3 hover:border-text-secondary/30 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[c.type]}`} />
                    <span className="text-xs text-text-primary font-medium truncate">{c.title}</span>
                  </div>
                  <div className="flex items-center justify-between pl-4.5">
                    <span className="text-xs text-text-secondary">{c.manufacturers?.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 border rounded-sm ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
