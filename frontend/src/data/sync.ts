import { api, CheckAmApiError } from '../api/client';
import { db } from '../db';
import { mapApiAlertToModel, mapApiProductToModel } from './mappers';
import { rebuildSearchIndex } from './searchIndex';

export interface SyncStatus {
  state: 'idle' | 'checking' | 'downloading' | 'applying' | 'done' | 'error';
  progress?: number;
  message?: string;
  error?: string;
}

export type SyncListener = (status: SyncStatus) => void;
const listeners = new Set<SyncListener>();

let currentStatus: SyncStatus = { state: 'idle' };

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => {
    listeners.delete(listener);
  };
}

function notify(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((l) => l(status));
}

export async function runSync(force = false): Promise<boolean> {
  if (currentStatus.state !== 'idle' && currentStatus.state !== 'done' && currentStatus.state !== 'error') {
    return false;
  }

  notify({ state: 'checking', message: 'Checking for registry updates...' });

  try {
    const etagSetting = await db.settings.get('syncEtag');
    const storedEtag = force ? null : etagSetting?.value;

    const manifest = await api.getSyncManifest(storedEtag);
    if (!manifest) {
      // 304 Not Modified
      notify({ state: 'done', message: 'Registry is up to date' });
      return false;
    }

    notify({
      state: 'downloading',
      message: `Downloading registry bundle (${(manifest.bytes / 1024).toFixed(0)} KB)...`,
    });

    const bundle = await api.getSyncBundle(storedEtag);
    if (!bundle) {
      notify({ state: 'done', message: 'Registry is up to date' });
      return false;
    }

    notify({
      state: 'applying',
      message: `Applying ${bundle.product_count} products and ${bundle.alert_count} safety alerts...`,
    });

    const mappedProducts = bundle.products.map(mapApiProductToModel);
    const mappedAlerts = bundle.alerts.map(mapApiAlertToModel);
    const mappedChecklists = bundle.checklists.map((c) => ({
      category: c.category,
      variant: c.variant,
      inspection_points: c.inspection_points,
      expected_reg_prefix: c.expected_reg_prefix,
    }));

    await db.transaction('rw', [db.products, db.alerts, db.checklists, db.settings], async () => {
      // Clear out old records atomically
      await db.products.clear();
      await db.alerts.clear();
      await db.checklists.clear();

      // Bulk add new records
      await db.products.bulkAdd(mappedProducts);
      await db.alerts.bulkAdd(mappedAlerts);
      await db.checklists.bulkAdd(mappedChecklists);

      // Update settings
      await db.settings.put({ key: 'lastSynced', value: new Date().toISOString() });
      await db.settings.put({ key: 'totalCatalogCount', value: bundle.product_count });
      await db.settings.put({ key: 'syncEtag', value: manifest.sha256 });
      if (bundle.meta?.disclaimer) {
        await db.settings.put({ key: 'disclaimer', value: bundle.meta.disclaimer });
      }
      if (bundle.meta?.coverage) {
        await db.settings.put({ key: 'coverage', value: bundle.meta.coverage });
      }
    });

    // Rebuild in-memory search index with the newly synced products
    rebuildSearchIndex().catch((err) => console.warn('Failed to rebuild search index after sync', err));

    notify({
      state: 'done',
      message: `Synced ${mappedProducts.length} verified products`,
    });
    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof CheckAmApiError ? err.message : 'Registry sync failed';
    notify({ state: 'error', error: errorMsg, message: errorMsg });
    return false;
  }
}
