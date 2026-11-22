import { db } from '../db';

/**
 * An anonymous, random id for this browser. It is only used to count AI lookups per day
 * (see the backend's ai_limits). It is not tied to a person, an account, or anything else, and
 * clearing site data makes a new one. Kept in localStorage with a copy in IndexedDB, so clearing
 * only one of the two does not reset it by accident.
 */
const STORAGE_KEY = 'checkam_device_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Very old browsers: build a version 4 UUID from random bytes.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readLocal(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isValidDeviceId(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private mode: the IndexedDB copy still keeps it for this browser
  }
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = readLocal();
  if (!id) {
    try {
      const row = await db.settings.get(STORAGE_KEY);
      if (row && isValidDeviceId(row.value)) id = row.value;
    } catch {
      // IndexedDB unavailable
    }
  }
  if (!id) id = newId();
  writeLocal(id);
  try {
    await db.settings.put({ key: STORAGE_KEY, value: id });
  } catch {
    // fine: localStorage has it
  }
  cached = id;
  return id;
}

/** Test helper: forget the in-memory copy. */
export function resetDeviceIdCache(): void {
  cached = null;
}
