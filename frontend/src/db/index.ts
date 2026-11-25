import Dexie, { Table } from 'dexie';
import { ApiChecklistResponse } from '../api/types';
import { ChecklistProgressRecord, Product, SafetyAlert, SavedCheck } from '../types';
import type { SavedAiAnswer } from '../lib/aiSaved';

export interface ChecklistRecord {
  category: string;
  variant: string;
  inspection_points: ApiChecklistResponse['inspection_points'];
  expected_reg_prefix?: string | null;
}

export class CheckAmDatabase extends Dexie {
  products!: Table<Product, string>;
  alerts!: Table<SafetyAlert, string>;
  checklists!: Table<ChecklistRecord, [string, string]>;
  checklist_progress!: Table<ChecklistProgressRecord, [string, string]>;
  saved!: Table<SavedCheck, number>;
  settings!: Table<{ key: string; value: any }, string>;
  ai_saved!: Table<SavedAiAnswer, number>;

  constructor() {
    super('checkam_db');

    // Schema v1 (legacy)
    this.version(1).stores({
      products: 'id, nafdac_reg_num, normalized_reg_num, product_name, brand_name, category, status',
      alerts: 'id, alert_reference_no, nafdac_reg_num',
      saved: '++id, productId, status, savedAt',
      settings: 'key',
    });

    // Schema v2: upgrade to real data, drop fabricated seed items
    this.version(2)
      .stores({
        products: 'id, nafdac_reg_num, normalized_reg_num, product_name, brand_name, category, status, manufacturer',
        alerts: 'id, alert_reference_no, nafdac_reg_num, is_active, issued_date',
        checklists: '[category+variant], category, variant',
        checklist_progress: '[productId+pointKey], productId',
        saved: '++id, productId, status, savedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        // Delete all fake seed products and alerts
        await tx.table('products').filter((p) => String(p.id).startsWith('prod-')).delete();
        await tx.table('alerts').filter((a) => String(a.id).startsWith('alert-')).delete();
      });

    // Schema v3: AI summaries the person saved (stays on this phone)
    this.version(3).stores({
      ai_saved: '++id, key, savedAt',
    });
  }
}

export const db = new CheckAmDatabase();

export async function initDatabase(): Promise<void> {
  await db.open();

  // Clean out any lingering fake mock data if present
  const hasMockProducts = await db.products.filter((p) => String(p.id).startsWith('prod-')).count();
  if (hasMockProducts > 0) {
    await db.products.filter((p) => String(p.id).startsWith('prod-')).delete();
    await db.alerts.filter((a) => String(a.id).startsWith('alert-')).delete();
  }

  // Ensure default settings exist
  const autoUpdate = await db.settings.get('autoUpdate');
  if (!autoUpdate) {
    await db.settings.put({ key: 'autoUpdate', value: true });
  }
}
