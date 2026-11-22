import type { AiLookupResult } from '../components/ai/types';
import { db } from '../db';

/**
 * The last AI answers, kept on the phone so re-opening a question is instant, free (it does not
 * use a daily lookup) and works offline. Same normalisation as the server's cache key.
 */
const PREFIX = 'ai:';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 25;

export function localKey(query: string): string {
  return PREFIX + query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function getLocalAnswer(query: string): Promise<AiLookupResult | null> {
  try {
    const row = await db.settings.get(localKey(query));
    if (!row?.value) return null;
    const { savedAt, data } = row.value as { savedAt: number; data: AiLookupResult };
    if (!data || Date.now() - savedAt > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveLocalAnswer(query: string, data: AiLookupResult): Promise<void> {
  try {
    await db.settings.put({ key: localKey(query), value: { savedAt: Date.now(), data } });
    // Keep the store small: drop the oldest answers beyond the limit.
    const all = (await db.settings.toArray()).filter((r) => r.key.startsWith(PREFIX));
    if (all.length > MAX_ENTRIES) {
      all.sort((a, b) => (a.value?.savedAt ?? 0) - (b.value?.savedAt ?? 0));
      await db.settings.bulkDelete(all.slice(0, all.length - MAX_ENTRIES).map((r) => r.key));
    }
  } catch {
    // not being able to remember an answer is fine
  }
}
