export type ApiProductStatus = 'match' | 'lapsed' | 'alert';
export type ApiUiCategory = 'Food' | 'Drinks' | 'Care' | 'Meds';

export interface ApiAlertSummary {
  id: string;
  alert_reference_no: string;
  title?: string | null;
  product_name: string;
  batch_numbers?: string | null;
  summary: string;
  official_source_url: string;
  issued_date: string;
  is_active: boolean;
}

export interface ApiChecklistPoint {
  key: string;
  label: string;
  detail: string;
  kind: 'common' | 'variant';
}

export interface ApiProductSummary {
  id: string;
  reg_number: string;
  reg_normalized: string;
  name: string;
  brand?: string | null;
  category: ApiUiCategory;
  category_raw: string;
  pack_type?: string | null;
  pack_size?: string | null;
  dosage_form?: string | null;
  manufacturer: string;
  status: ApiProductStatus;
  registered_on?: string | null;
  expires_on?: string | null;
  image_url?: string | null;
  source: string;
  last_synced_at: string;
}

export interface ApiProductDetail extends ApiProductSummary {
  alerts: ApiAlertSummary[];
  checklist: ApiChecklistPoint[];
}

export interface ApiProductSearchResult extends ApiProductSummary {
  match_type: 'reg_exact' | 'reg_prefix' | 'name' | 'maker';
  similarity?: number | null;
}

export interface ApiSearchResponse {
  items: ApiProductSearchResult[];
  total: number;
}

export interface ApiLookupResponse {
  result: 'match' | 'multiple' | 'not_found';
  products: ApiProductSummary[];
}

export interface ApiProductsFeedResponse {
  items: ApiProductSummary[];
  next_cursor?: string | null;
  has_more: boolean;
}

export interface ApiChecklistResponse {
  category: string;
  variant: string;
  inspection_points: ApiChecklistPoint[];
  expected_reg_prefix?: string | null;
}

export interface ApiSyncManifest {
  version: string;
  generated_at: string;
  product_count: number;
  alert_count: number;
  bytes: number;
  sha256: string;
}

export interface ApiSyncBundle {
  version: string;
  generated_at: string;
  product_count: number;
  alert_count: number;
  products: ApiProductSummary[];
  alerts: ApiAlertSummary[];
  checklists: ApiChecklistResponse[];
  meta: ApiMetaResponse;
}

export interface ApiMetaResponse {
  ai_lookup_enabled?: boolean;
  disclaimer: string;
  coverage: string[];
  product_count: number;
  alert_count: number;
  last_synced_at: string;
  version: string;
}
