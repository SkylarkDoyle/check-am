import { api } from '../api/client';
import { ApiUiCategory } from '../api/types';
import { db } from '../db';
import {
  deriveKindFromPackType,
  mapApiAlertToModel,
  mapApiChecklistPointToModel,
  mapApiProductDetailToModel,
  mapApiProductToModel,
} from './mappers';
import { runSync } from './sync';
import { ChecklistItemModel, Product, ProductCategory, SafetyAlert, SavedCheck } from '../types';

export interface SearchResultItem extends Product {
  match_type?: 'reg_exact' | 'reg_prefix' | 'name' | 'maker';
}

export const repository = {
  async ensureInitialized(): Promise<void> {
    const count = await db.products.count();
    if (count === 0) {
      // Trigger background sync
      runSync().catch((err) => console.warn('Initial sync failed', err));
    }
  },

  async listProducts(category?: ProductCategory | null, limit = 20, offset = 0): Promise<Product[]> {
    await this.ensureInitialized();

    let collection = db.products.toCollection();
    if (category) {
      collection = db.products.where('category').equals(category);
    }

    const items = await collection.offset(offset).limit(limit).toArray();
    if (items.length > 0) {
      return items;
    }

    // Fallback to API if Dexie is currently empty
    try {
      const feed = await api.getProductsFeed(category as ApiUiCategory, limit);
      return feed.items.map(mapApiProductToModel);
    } catch {
      return [];
    }
  },

  async searchProducts(
    query: string,
    category?: ProductCategory | null,
    limit = 20
  ): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];

    // 1. Try online search for ranking and match_type
    try {
      const apiRes = await api.search(q, category as ApiUiCategory, limit);
      if (apiRes && apiRes.items) {
        return apiRes.items.map((item) => ({
          ...mapApiProductToModel(item),
          match_type: item.match_type,
        }));
      }
    } catch {
      // Fallback to local Dexie search when offline
    }

    // 2. Offline fallback search in Dexie
    const norm = q.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const isNum = /\d/.test(norm);
    const qLower = q.toLowerCase();

    let matches: Product[] = [];
    if (isNum && norm.length >= 2) {
      matches = await db.products
        .filter((p) => p.normalized_reg_num.includes(norm))
        .limit(limit)
        .toArray();
      if (matches.length > 0) {
        return matches.map((m) => ({
          ...m,
          match_type: m.normalized_reg_num === norm ? 'reg_exact' : 'reg_prefix',
        }));
      }
    }

    // Name or manufacturer match
    matches = await db.products
      .filter((p) => {
        if (category && p.category !== category) return false;
        return (
          p.product_name.toLowerCase().includes(qLower) ||
          p.manufacturer.toLowerCase().includes(qLower)
        );
      })
      .limit(limit)
      .toArray();

    return matches.map((m) => ({
      ...m,
      match_type: m.product_name.toLowerCase().includes(qLower) ? 'name' : 'maker',
    }));
  },

  async lookupReg(rawReg: string): Promise<{ result: 'match' | 'multiple' | 'not_found'; products: Product[] }> {
    const norm = rawReg.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!norm) return { result: 'not_found', products: [] };

    // 1. Try local Dexie first for instant response
    const local = await db.products.where('normalized_reg_num').equals(norm).toArray();
    if (local.length === 1) {
      return { result: 'match', products: local };
    }
    if (local.length > 1) {
      return { result: 'multiple', products: local };
    }

    // 2. Query API if not found locally
    try {
      const apiRes = await api.lookupReg(rawReg);
      const mapped = apiRes.products.map(mapApiProductToModel);
      return {
        result: apiRes.result,
        products: mapped,
      };
    } catch {
      return { result: 'not_found', products: [] };
    }
  },

  async getProduct(id: string): Promise<Product | null> {
    // 1. Try API first for freshest alert joins and checklists
    try {
      const detail = await api.getProduct(id);
      if (detail) {
        return mapApiProductDetailToModel(detail);
      }
    } catch {
      // Fall through to offline cache
    }

    // 2. Load from Dexie
    const local = await db.products.get(id);
    if (!local) return null;

    // Attach local alerts and checklist
    const alerts = await db.alerts.where('nafdac_reg_num').equals(local.nafdac_reg_num).toArray();
    const checklist = await this.resolveChecklist(local.category, local.pack_type, local.nafdac_reg_num, local.product_name);

    return {
      ...local,
      alerts,
      checklist,
    };
  },

  async listAlerts(limit = 20): Promise<SafetyAlert[]> {
    const local = await db.alerts.limit(limit).toArray();
    if (local.length > 0) return local;

    try {
      const apiAlerts = await api.listAlerts(true, limit);
      return apiAlerts.map(mapApiAlertToModel);
    } catch {
      return [];
    }
  },

  async resolveChecklist(
    category: string,
    packType?: string | null,
    regNumber?: string | null,
    productName?: string | null
  ): Promise<ChecklistItemModel[]> {
    // Try resolving from local Dexie checklists table
    const variantKey = packType?.toLowerCase() || '';
    let record = await db.checklists.get([category, variantKey]);
    if (!record && variantKey) {
      // Fallback to default variant ""
      record = await db.checklists.get([category, '']);
    }

    let points: ChecklistItemModel[] = [];
    if (record && record.inspection_points && record.inspection_points.length > 0) {
      points = record.inspection_points.map(mapApiChecklistPointToModel);
    } else {
      // Try resolving via API
      try {
        const apiPoints = await api.resolveChecklist(category, packType, regNumber);
        points = apiPoints.map(mapApiChecklistPointToModel);
      } catch {
        // Built-in fallback points
        points = [
          {
            key: 'reg_number',
            label: 'NAFDAC number on pack',
            detail: `Printed clearly, matches ${regNumber || 'the registered number'}.`,
            kind: 'common',
            state: 'todo',
          },
          {
            key: 'seal_intact',
            label: 'Seal intact',
            detail: 'No gaps, glue marks or re-taping.',
            kind: 'common',
            state: 'todo',
          },
          {
            key: 'expiry_format',
            label: 'Expiry date format',
            detail: 'One consistent style, for example 14 Mar 2028.',
            kind: 'common',
            state: 'todo',
          },
        ];
      }
    }

    // Token substitutions
    const cleanReg = regNumber || 'the registered number';
    const cleanName = productName || 'the product';
    return points.map((p) => ({
      ...p,
      detail: p.detail
        .replace(/{reg_number}/g, cleanReg)
        .replace(/{product_name}/g, cleanName)
        .replace(/{expiry_example}/g, '14 Mar 2028'),
    }));
  },

  async getChecklistProgress(productId: string): Promise<Record<string, 'todo' | 'done' | 'flag'>> {
    const records = await db.checklist_progress.where('productId').equals(productId).toArray();
    const result: Record<string, 'todo' | 'done' | 'flag'> = {};
    for (const r of records) {
      result[r.pointKey] = r.state;
    }
    return result;
  },

  async setChecklistProgress(
    productId: string,
    pointKey: string,
    state: 'todo' | 'done' | 'flag'
  ): Promise<void> {
    await db.checklist_progress.put({
      productId,
      pointKey,
      state,
      updatedAt: new Date().toISOString(),
    });
  },

  async listSavedChecks(): Promise<SavedCheck[]> {
    return db.saved.reverse().toArray();
  },

  async saveCheck(product: Product): Promise<number> {
    const existing = await db.saved.where('productId').equals(product.id).first();
    if (existing && existing.id) {
      return existing.id;
    }

    return db.saved.add({
      productId: product.id,
      productName: product.product_name,
      maker: product.manufacturer,
      regNumber: product.nafdac_reg_num,
      status: product.status,
      kind: product.kind || deriveKindFromPackType(product.pack_type, product.category),
      savedAt: 'Today, ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    });
  },

  async removeSavedCheck(id: number): Promise<void> {
    await db.saved.delete(id);
  },

  async clearSavedChecks(): Promise<void> {
    await db.saved.clear();
  },

  async getCatalogMeta(): Promise<{
    count: number;
    lastSynced: string;
    disclaimer: string;
    coverage: string[];
  }> {
    const countSetting = await db.settings.get('totalCatalogCount');
    const syncedSetting = await db.settings.get('lastSynced');
    const disclaimerSetting = await db.settings.get('disclaimer');
    const coverageSetting = await db.settings.get('coverage');

    const totalCount = countSetting?.value || (await db.products.count()) || 3618;
    const lastSynced = syncedSetting?.value
      ? new Date(syncedSetting.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '18 Nov';

    return {
      count: totalCount,
      lastSynced,
      disclaimer:
        disclaimerSetting?.value ||
        'CheckAm reports what the NAFDAC public registry shows. It does not decide whether a product is genuine. Inspect the pack yourself and contact NAFDAC directly for enforcement.',
      coverage: coverageSetting?.value || ['Food', 'Drinks', 'Meds'],
    };
  },
};
