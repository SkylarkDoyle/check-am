import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('../db', () => ({
  db: {
    settings: {
      get: vi.fn(async (key: string) => (store.has(key) ? { key, value: store.get(key) } : undefined)),
      put: vi.fn(async (row: { key: string; value: unknown }) => {
        store.set(row.key, row.value);
      }),
      toArray: vi.fn(async () => [...store.entries()].map(([key, value]) => ({ key, value }))),
      bulkDelete: vi.fn(async (keys: string[]) => keys.forEach((k) => store.delete(k))),
    },
  },
}));

import { CheckAmApiError } from '../api/client';
import { stateForError } from '../hooks/useAiLookup';
import { getLocalAnswer, localKey, saveLocalAnswer } from './aiLocalCache';
import { getDeviceId, isValidDeviceId, resetDeviceIdCache } from './deviceId';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

beforeEach(() => {
  store.clear();
  resetDeviceIdCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('device id', () => {
  it('creates a valid random id once and keeps it in both places', async () => {
    const ls = stubLocalStorage();
    const id = await getDeviceId();
    expect(isValidDeviceId(id)).toBe(true);
    expect(ls.get('checkam_device_id')).toBe(id);
    expect(store.get('checkam_device_id')).toBe(id);
    resetDeviceIdCache();
    expect(await getDeviceId()).toBe(id);
  });

  it('restores from IndexedDB when localStorage was cleared', async () => {
    const existing = '11111111-2222-4333-8444-555555555555';
    store.set('checkam_device_id', existing);
    const ls = stubLocalStorage();
    expect(await getDeviceId()).toBe(existing);
    expect(ls.get('checkam_device_id')).toBe(existing);
  });

  it('replaces a corrupt stored value', async () => {
    stubLocalStorage({ checkam_device_id: 'not-a-uuid' });
    expect(isValidDeviceId(await getDeviceId())).toBe(true);
  });

  it('still works when localStorage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isValidDeviceId(await getDeviceId())).toBe(true);
  });
});

describe('local answer cache', () => {
  const answer = {
    query: 'Colgate toothpaste',
    result: 'ok' as const,
    cached: false,
    blocks: [],
    sources: [],
    usage: { limit: 5, remaining: 4, resets_at: '' },
    disclaimer: 'AI responses may include mistakes.',
  };

  it('uses the same normalisation as the server', () => {
    expect(localKey('Colgate  Toothpaste!')).toBe(localKey('colgate toothpaste'));
    expect(localKey('colgate toothpaste')).toBe('ai:colgate toothpaste');
  });

  it('remembers an answer and returns it for the same question in any casing', async () => {
    await saveLocalAnswer('Colgate toothpaste', answer);
    expect(await getLocalAnswer('COLGATE TOOTHPASTE')).toEqual(answer);
    expect(await getLocalAnswer('something else')).toBeNull();
  });

  it('ignores an answer older than 30 days', async () => {
    store.set(localKey('old one'), { savedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, data: answer });
    expect(await getLocalAnswer('old one')).toBeNull();
  });

  it('keeps at most 25 answers', async () => {
    for (let i = 0; i < 30; i++) {
      await saveLocalAnswer(`question ${i}`, { ...answer, query: `question ${i}` });
    }
    expect([...store.keys()].filter((k) => k.startsWith('ai:')).length).toBeLessThanOrEqual(25);
  });
});

describe('error to sheet state', () => {
  it('maps the limit and bad-input errors, and everything else to a plain error', () => {
    expect(stateForError(new CheckAmApiError('x', 'AI_LIMIT_REACHED', 429))).toEqual({ status: 'limit' });
    expect(stateForError(new CheckAmApiError('x', 'INVALID_QUERY', 422))).toEqual({ status: 'none' });
    expect(stateForError(new CheckAmApiError('x', 'AI_UNAVAILABLE', 503))).toEqual({ status: 'error' });
    expect(stateForError(new CheckAmApiError('x', 'AI_BUSY', 503))).toEqual({ status: 'error' });
    expect(stateForError(new CheckAmApiError('x', 'NETWORK_ERROR', 0))).toEqual({ status: 'error' });
    expect(stateForError(new Error('boom'))).toEqual({ status: 'error' });
  });
});
