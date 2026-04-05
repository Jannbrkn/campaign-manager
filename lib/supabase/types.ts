export type CampaignType = 'postcard' | 'newsletter' | 'report_internal' | 'report_external'
export type CampaignStatus = 'planned' | 'assets_pending' | 'assets_complete' | 'generating' | 'review' | 'approved' | 'sent'
export type AssetCategory = 'image' | 'text' | 'logo' | 'cta' | 'link' | 'csv_export' | 'postcard_pdf' | 'newsletter_zip' | 'report_xlsx' | 'newsletter_preview'
export type AlertType = 'prep_reminder_6w' | 'assets_missing' | 'output_ready' | 'review_needed' | 'auto_send_scheduled'

export interface Agency {
  id: string
  name: string
  cost_center: string | null
  ident_number: string | null
  order_email: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
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
  additional_report_email: string | null
  dropbox_link: string | null
  postcard_tags: string | null
  newsletter_tags: string | null
  extra_tags: string | null
  print_run: number | null
  created_at: string
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
}

// Joined types
export interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

export interface CampaignWithManufacturer extends Campaign {
  manufacturers: ManufacturerWithAgency
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
