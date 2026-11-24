import {
  ApiAlertSummary,
  ApiChecklistPoint,
  ApiProductDetail,
  ApiProductSummary,
} from '../api/types';
import { ChecklistItemModel, Product, ProductCategory, SafetyAlert } from '../types';

export type PackKind = 'tin' | 'bottle' | 'sachet' | 'tube' | 'jar' | 'capsule';

export function deriveKindFromPackType(packType?: string | null, category?: string | null): PackKind {
  if (!packType) {
    if (category === 'Drinks') return 'bottle';
    if (category === 'Care') return 'jar';
    if (category === 'Meds') return 'capsule';
    return 'sachet';
  }
  const pt = packType.toLowerCase();
  if (pt.includes('tablet') || pt.includes('capsule') || pt.includes('blister') || pt.includes('pill')) {
    return 'capsule';
  }
  if (pt.includes('tube') || pt.includes('paste')) {
    return 'tube';
  }
  if (pt.includes('cream') || pt.includes('lotion') || pt.includes('jelly') || pt.includes('ointment') || (pt.includes('jar') && category === 'Care')) {
    return 'jar';
  }
  if (pt.includes('bottle') || pt.includes('jar') || pt.includes('syrup') || pt.includes('suspension')) {
    return 'bottle';
  }
  if (pt.includes('tin') || pt.includes('can')) {
    return 'tin';
  }
  return 'sachet';
}

export function mapApiProductToModel(apiProd: ApiProductSummary): Product {
  const kind = deriveKindFromPackType(apiProd.pack_type, apiProd.category);

  return {
    id: apiProd.id,
    nafdac_reg_num: apiProd.reg_number,
    normalized_reg_num: apiProd.reg_normalized,
    product_name: apiProd.name,
    brand_name: apiProd.brand || apiProd.name,
    category: apiProd.category as ProductCategory,
    category_raw: apiProd.category_raw,
    manufacturer: apiProd.manufacturer,
    status: apiProd.status,
    pack_type: apiProd.pack_type,
    pack_size: apiProd.pack_size,
    dosage_form: apiProd.dosage_form,
    registered_on: apiProd.registered_on,
    expires_on: apiProd.expires_on,
    external_image_url: apiProd.image_url,
    source_portal: apiProd.source,
    last_synced_at: apiProd.last_synced_at,
    kind,
    valid_until: apiProd.expires_on ? formatDisplayDate(apiProd.expires_on) : 'Not listed',
    sync_date: apiProd.last_synced_at ? formatDisplayDate(apiProd.last_synced_at) : undefined,
  };
}

export function mapApiProductDetailToModel(detail: ApiProductDetail): Product {
  const base = mapApiProductToModel(detail);
  base.alerts = (detail.alerts || []).map(mapApiAlertToModel);
  base.checklist = (detail.checklist || []).map(mapApiChecklistPointToModel);

  if (base.alerts.length > 0) {
    const topAlert = base.alerts[0];
    base.alert_id = topAlert.id;
    base.alert_title = topAlert.title || topAlert.product_name;
    base.alert_meta = `Issued ${formatDisplayDate(topAlert.issued_date)}, NAFDAC`;
  }

  return base;
}

export function mapApiAlertToModel(apiAlert: ApiAlertSummary): SafetyAlert {
  return {
    id: apiAlert.id,
    alert_reference_no: apiAlert.alert_reference_no,
    title: apiAlert.title,
    nafdac_reg_num: null,
    product_name: apiAlert.product_name,
    batch_numbers: apiAlert.batch_numbers,
    summary: apiAlert.summary,
    issued_date: apiAlert.issued_date,
    official_source_url: apiAlert.official_source_url,
    is_active: apiAlert.is_active,
  };
}

export function mapApiChecklistPointToModel(point: ApiChecklistPoint): ChecklistItemModel {
  return {
    key: point.key,
    label: point.label,
    detail: point.detail,
    kind: point.kind,
    state: 'todo',
  };
}

export function formatDisplayDate(isoDateString?: string | null): string {
  if (!isoDateString) return '';
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDateString;
  }
}
