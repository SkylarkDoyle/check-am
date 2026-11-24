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
  // Derived for display icons ('tin' | 'bottle' | 'sachet' | 'tube' | 'jar' | 'capsule')
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube' | 'jar' | 'capsule';
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

/** Person's answer for one pack check: tick = matches the registry record, cross = does not match. */
export type ChecklistState = 'todo' | 'match' | 'nomatch';

export interface ChecklistItemModel {
  key: string;
  label: string;
  detail: string;
  kind: 'common' | 'variant';
  state?: ChecklistState;
}

export interface SavedCheck {
  id?: number;
  productId: string;
  productName: string;
  maker: string;
  regNumber: string;
  status: ProductStatus;
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube' | 'jar' | 'capsule';
  savedAt: string;
}

export interface ChecklistProgressRecord {
  productId: string;
  pointKey: string;
  /** 'done' and 'flag' are legacy values written before the tick/cross design. */
  state: ChecklistState | 'done' | 'flag';
  updatedAt: string;
}
