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
import { ensureSearchIndex, localSearchProducts, SearchResultItem } from './searchIndex';
import { runSync } from './sync';
import { ChecklistItemModel, Product, ProductCategory, SafetyAlert, SavedCheck } from '../types';

export type { SearchResultItem };

export const repository = {
  async ensureInitialized(): Promise<void> {
    const count = await db.products.count();
    if (count === 0) {
      // Trigger background sync
      runSync().catch((err) => console.warn('Initial sync failed', err));
    } else {
      // Warm up in-memory search index in background
      ensureSearchIndex().catch((err) => console.warn('Search index warmup failed', err));
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

    await this.ensureInitialized();

    const localCount = await db.products.count();
    if (localCount > 0) {
      // 1. Local-first search: instant response (<5ms), fuzzy matching & ranking via MiniSearch
      return localSearchProducts(q, category, limit);
    }

    // 2. Fallback to API ONLY when local copy is empty (first run / sync pending)
    try {
      const apiRes = await api.search(q, category as ApiUiCategory, limit);
      if (apiRes && apiRes.items) {
        return apiRes.items.map((item) => ({
          ...mapApiProductToModel(item),
          match_type: item.match_type,
        }));
      }
    } catch {
      // Network failed while local catalog is empty
    }

    return [];
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
    // 1. Local-first: instant resolution from IndexedDB (<2ms)
    const local = await db.products.get(id);
    if (local) {
      // Attach local alerts and checklist from IndexedDB
      const alerts = await db.alerts.where('nafdac_reg_num').equals(local.nafdac_reg_num).toArray();
      const checklist = await this.resolveChecklist(
        local.category,
        local.pack_type,
        local.nafdac_reg_num,
        local.product_name
      );

      const productModel: Product = {
        ...local,
        alerts,
        checklist,
      };

      // 2. Non-blocking background refresh if online (updates local cache silently)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        api.getProduct(id)
          .then(async (freshDetail) => {
            if (freshDetail) {
              const freshModel = mapApiProductDetailToModel(freshDetail);
              await db.products.put(freshModel);
            }
          })
          .catch(() => {});
      }

      return productModel;
    }

    // 3. Fallback to API only if not found locally (first run before sync or direct deep link)
    try {
      const detail = await api.getProduct(id);
      if (detail) {
        const mapped = mapApiProductDetailToModel(detail);
        await db.products.put(mapped);
        return mapped;
      }
    } catch {
      // Network failed or offline
    }

    return null;
  },

  async listAlerts(limit = 20): Promise<SafetyAlert[]> {
    const local = await db.alerts.toArray();
    if (local.length > 0) {
      return local
        .sort((a, b) => new Date(b.issued_date || 0).getTime() - new Date(a.issued_date || 0).getTime())
        .slice(0, limit);
    }

    try {
      const apiAlerts = await api.listAlerts(true, limit);
      const mapped = apiAlerts.map(mapApiAlertToModel);
      return mapped
        .sort((a, b) => new Date(b.issued_date || 0).getTime() - new Date(a.issued_date || 0).getTime())
        .slice(0, limit);
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
    lastSyncedShort: string;
    disclaimer: string;
    coverage: string[];
  }> {
    // Refresh latest catalog metadata from live API when online
    try {
      const meta = await api.getMeta();
      if (meta) {
        if (typeof meta.product_count === 'number') {
          await db.settings.put({ key: 'totalCatalogCount', value: meta.product_count });
        }
        if (meta.last_synced_at) {
          await db.settings.put({ key: 'lastSynced', value: meta.last_synced_at });
        }
        if (meta.disclaimer) {
          await db.settings.put({ key: 'disclaimer', value: meta.disclaimer });
        }
        if (meta.coverage) {
          await db.settings.put({ key: 'coverage', value: meta.coverage });
        }
      }
    } catch {
      // Offline fallback: use local Dexie settings and cached records
    }

    const countSetting = await db.settings.get('totalCatalogCount');
    const syncedSetting = await db.settings.get('lastSynced');
    const disclaimerSetting = await db.settings.get('disclaimer');
    const coverageSetting = await db.settings.get('coverage');

    const localDbCount = await db.products.count();
    const totalCount = countSetting?.value ?? localDbCount ?? 0;

    let lastSynced = '';
    let lastSyncedShort = '';
    if (syncedSetting?.value) {
      const dateObj = new Date(syncedSetting.value);
      if (!isNaN(dateObj.getTime())) {
        lastSynced = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        lastSyncedShort = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }
    }

    return {
      count: totalCount,
      lastSynced,
      lastSyncedShort,
      disclaimer:
        disclaimerSetting?.value ||
        'CheckAm reports what the NAFDAC public registry shows. It does not decide whether a product is genuine. Inspect the pack yourself and contact NAFDAC directly for enforcement.',
      coverage: coverageSetting?.value || ['Food', 'Drinks', 'Meds'],
    };
  },
};
