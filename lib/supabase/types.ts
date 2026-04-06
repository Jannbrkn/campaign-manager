export type CampaignType = 'postcard' | 'newsletter' | 'report_internal' | 'report_external'
export type CampaignStatus = 'planned' | 'assets_pending' | 'assets_complete' | 'generating' | 'review' | 'approved' | 'sent'
export type AssetCategory = 'image' | 'text' | 'logo' | 'cta' | 'link' | 'csv_export' | 'postcard_pdf' | 'newsletter_zip' | 'report_xlsx' | 'newsletter_preview'
export type AlertType =
  | 'six_week_notice'
  | 'briefing_missing'
  | 'assets_missing'
  | 'chain_blocked'
  | 'overdue'
  // Legacy values (kept for DB compatibility)
  | 'prep_reminder_6w'
  | 'output_ready'
  | 'review_needed'
  | 'auto_send_scheduled'

export interface Agency {
  id: string
  name: string
  cost_center: string | null
  ident_number: string | null
  order_email: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
  contact_email: string | null
  website_url: string | null
  created_at: string
}

export interface Manufacturer {
  id: string
  agency_id: string
  name: string
  category: string | null
  contact_person: string | null
  postcard_frequency: string | null
  postcard_months: string | null
  postcard_format: string | null
  newsletter_frequency: string | null
  images_source: string | null
  texts_source: string | null
  own_creatives: boolean
  own_texts: boolean
  logo_url: string | null
  contact_email: string | null
  website_url: string | null
  additional_report_email: string | null
  dropbox_link: string | null
  postcard_tags: string | null
  newsletter_tags: string | null
  extra_tags: string | null
  print_run: number | null
  created_at: string
}

export interface NewsletterBriefing {
  product?: string
  draft?: string
  cta_text?: string
  cta_link?: string
  extra_links?: { label: string; url: string }[]
  hints?: string
}

/**
 * All rates are stored as fractions 0–1 (e.g. 0.46 = 46%).
 * Never store percentages (e.g. 46) — use rate / 100 if needed.
 */
export interface PerformanceStats {
  open_rate: number    // fraction 0–1, e.g. 0.46 = 46%
  click_rate: number   // fraction 0–1
  emails_sent: number
  unsubscribes: number | null  // null when not available (e.g. CSV exports)
  source: 'api' | 'csv'
}

export interface Campaign {
  id: string
  manufacturer_id: string
  type: CampaignType
  title: string
  status: CampaignStatus
  scheduled_date: string
  linked_postcard_id: string | null
  linked_newsletter_id: string | null
  notes: string | null
  review_approved: boolean
  auto_send_emails: string[] | null
  briefing: NewsletterBriefing | null
  mailchimp_campaign_id: string | null
  mailchimp_url: string | null
  mailchimp_subject: string | null
  mailchimp_preview_text: string | null
  performance_stats: PerformanceStats | null
  created_at: string
  updated_at: string
}

export interface CampaignAsset {
  id: string
  campaign_id: string
  file_name: string
  file_type: string
  file_url: string
  file_size: number | null
  asset_category: AssetCategory
  is_output: boolean
  created_at: string
}

export interface CampaignAlert {
  id: string
  campaign_id: string
  alert_type: AlertType
  scheduled_for: string
  sent: boolean
  sent_at: string | null
  acknowledged_at: string | null
}

// Joined types
export interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

export interface CampaignWithManufacturer extends Campaign {
  manufacturers: ManufacturerWithAgency
}

export interface ManufacturerGroup {
  manufacturer: ManufacturerWithAgency
  campaigns: CampaignWithManufacturer[]
  avgOpenRate: number | null
  avgClickRate: number | null
  totalSent: number
  totalUnsubscribes: number
  sources: ('api' | 'csv')[]
}

export type Database = {
  public: {
    Tables: {
      agencies: { Row: Agency; Insert: Omit<Agency, 'id' | 'created_at'>; Update: Partial<Omit<Agency, 'id' | 'created_at'>> }
      manufacturers: { Row: Manufacturer; Insert: Omit<Manufacturer, 'id' | 'created_at'>; Update: Partial<Omit<Manufacturer, 'id' | 'created_at'>> }
      campaigns: { Row: Campaign; Insert: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Campaign, 'id' | 'created_at' | 'updated_at'>> }
      campaign_assets: { Row: CampaignAsset; Insert: Omit<CampaignAsset, 'id' | 'created_at'> & { file_size?: number | null }; Update: Partial<Omit<CampaignAsset, 'id' | 'created_at'>> }
      campaign_alerts: { Row: CampaignAlert; Insert: Omit<CampaignAlert, 'id'>; Update: Partial<Omit<CampaignAlert, 'id'>> }
    }
  }
}
