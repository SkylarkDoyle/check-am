export type ProductStatus = 'match' | 'lapsed' | 'alert';

export type ProductCategory = 'Food' | 'Drinks' | 'Care' | 'Meds';

export interface Product {
  id: string;
  nafdac_reg_num: string;
  normalized_reg_num: string;
  product_name: string;
  brand_name?: string | null;
  category: ProductCategory;
  category_raw?: string;
  manufacturer: string;
  status: ProductStatus;
  pack_type?: string | null;
  pack_size?: string | null;
  dosage_form?: string | null;
  registered_on?: string | null;
  expires_on?: string | null;
  external_image_url?: string | null;
  source_portal?: string;
  last_synced_at?: string;
  // Derived for display icons ('tin' | 'bottle' | 'sachet' | 'tube')
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube';
  // Alerts and checklist attached when loaded in detail
  alerts?: SafetyAlert[];
  checklist?: ChecklistItemModel[];
  // Backwards compatibility legacy fields
  valid_until?: string;
  sync_date?: string;
  alert_id?: string;
  alert_title?: string;
  alert_meta?: string;
}

export interface SafetyAlert {
  id: string;
  alert_reference_no: string;
  title?: string | null;
  nafdac_reg_num?: string | null;
  product_name: string;
  batch_numbers?: string | null;
  summary: string;
  issued_date: string;
  official_source_url: string;
  is_active?: boolean;
}

export interface ChecklistItemModel {
  key: string;
  label: string;
  detail: string;
  kind: 'common' | 'variant';
  state?: 'todo' | 'done' | 'flag';
}

export interface SavedCheck {
  id?: number;
  productId: string;
  productName: string;
  maker: string;
  regNumber: string;
  status: ProductStatus;
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube';
  savedAt: string;
}

export interface ChecklistProgressRecord {
  productId: string;
  pointKey: string;
  state: 'todo' | 'done' | 'flag';
  updatedAt: string;
}
