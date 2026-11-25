import type { AiLookupResult } from '../components/ai/types';
import { db } from '../db';
import { localKey } from './aiLocalCache';

/**
 * AI summaries the person chose to keep. They live only on this phone (IndexedDB), like saved
 * checks, and are never sent anywhere. Unlike the 25-entry answer cache, they are never dropped
 * automatically.
 */
export interface SavedAiAnswer {
  id?: number;
  /** Normalised question, so saving the same question twice keeps one row. */
  key: string;
  query: string;
  result: AiLookupResult;
  savedAt: string;
}

const CHANGED = 'app:saved-checks-updated';
const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED));
};

export async function isAiSaved(query: string): Promise<boolean> {
  try {
    return (await db.ai_saved.where('key').equals(localKey(query)).count()) > 0;
  } catch {
    return false;
  }
}

export async function saveAiAnswer(query: string, result: AiLookupResult): Promise<boolean> {
  try {
    const key = localKey(query);
    const existing = await db.ai_saved.where('key').equals(key).first();
    if (existing) return true;
    await db.ai_saved.add({ key, query, result, savedAt: new Date().toISOString() });
    notify();
    return true;
  } catch {
    return false;
  }
}

export async function removeAiAnswer(query: string): Promise<void> {
  try {
    await db.ai_saved.where('key').equals(localKey(query)).delete();
    notify();
  } catch {
    /* nothing to remove */
  }
}

export async function listAiSaved(): Promise<SavedAiAnswer[]> {
  try {
    return await db.ai_saved.orderBy('savedAt').reverse().toArray();
  } catch {
    return [];
  }
}

export async function clearAiSaved(): Promise<void> {
  try {
    await db.ai_saved.clear();
    notify();
  } catch {
    /* nothing to clear */
  }
}
