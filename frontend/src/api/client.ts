import {
  ApiAlertSummary,
  ApiChecklistPoint,
  ApiChecklistResponse,
  ApiLookupResponse,
  ApiMetaResponse,
  ApiProductDetail,
  ApiProductsFeedResponse,
  ApiSearchResponse,
  ApiSyncBundle,
  ApiSyncManifest,
  ApiUiCategory,
} from './types';
import type { AiLookupResult, AiUsage } from '../components/ai/types';

export type FeedbackKind = 'bug' | 'wrong_data' | 'idea' | 'other' | 'helpful_yes' | 'helpful_no';

export interface FeedbackPayload {
  kind: FeedbackKind;
  message?: string | null;
  contact?: string | null;
  context?: { screen?: string | null; reg_number?: string | null; query?: string | null; app_version?: string | null } | null;
  /** Honeypot: real people leave it empty. */
  website?: string | null;
}

export class CheckAmApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'API_ERROR', status = 500) {
    super(message);
    this.name = 'CheckAmApiError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').trim();
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

async function fetchWithTimeout<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal
    ? (options.signal as AbortSignal)
    : controller.signal;

  try {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(id);

    if (response.status === 304) {
      return null as T;
    }

    if (!response.ok) {
      let errBody: { error?: { code?: string; message?: string } } = {};
      try {
        errBody = await response.json();
      } catch {
        // Fallback for non-JSON errors
      }
      const code = errBody.error?.code || `HTTP_${response.status}`;
      const msg = errBody.error?.message || `Request failed with status ${response.status}`;
      throw new CheckAmApiError(msg, code, response.status);
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    clearTimeout(id);
    if (err instanceof CheckAmApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new CheckAmApiError('Request timed out', 'TIMEOUT', 408);
    }
    const message = err instanceof Error ? err.message : 'Network request failed';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:network-error'));
    }
    throw new CheckAmApiError(message, 'NETWORK_ERROR', 0);
  }
}

export const api = {
  async getProductsFeed(
    category?: ApiUiCategory | null,
    limit = 20,
    cursor?: string | null,
    signal?: AbortSignal
  ): Promise<ApiProductsFeedResponse> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const qs = params.toString();
    return fetchWithTimeout<ApiProductsFeedResponse>(`/products${qs ? `?${qs}` : ''}`, { signal });
  },

  async getProduct(id: string, signal?: AbortSignal): Promise<ApiProductDetail> {
    return fetchWithTimeout<ApiProductDetail>(`/products/${id}`, { signal });
  },

  async lookupReg(reg: string, signal?: AbortSignal): Promise<ApiLookupResponse> {
    const params = new URLSearchParams({ reg });
    return fetchWithTimeout<ApiLookupResponse>(`/products/lookup?${params.toString()}`, { signal });
  },

  async search(
    query: string,
    category?: ApiUiCategory | null,
    limit = 20,
    signal?: AbortSignal
  ): Promise<ApiSearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (category) params.set('category', category);
    return fetchWithTimeout<ApiSearchResponse>(`/search?${params.toString()}`, { signal });
  },

  async listAlerts(active = true, limit = 20, signal?: AbortSignal): Promise<ApiAlertSummary[]> {
    const params = new URLSearchParams({ active: String(active), limit: String(limit) });
    return fetchWithTimeout<ApiAlertSummary[]>(`/alerts?${params.toString()}`, { signal });
  },

  async listChecklists(signal?: AbortSignal): Promise<ApiChecklistResponse[]> {
    return fetchWithTimeout<ApiChecklistResponse[]>('/checklists', { signal });
  },

  async resolveChecklist(
    category: string,
    packType?: string | null,
    regNumber?: string | null,
    signal?: AbortSignal
  ): Promise<ApiChecklistPoint[]> {
    const params = new URLSearchParams({ category });
    if (packType) params.set('pack_type', packType);
    if (regNumber) params.set('reg_number', regNumber);
    return fetchWithTimeout<ApiChecklistPoint[]>(`/checklists/resolve?${params.toString()}`, { signal });
  },

  async getSyncManifest(etag?: string | null, signal?: AbortSignal): Promise<ApiSyncManifest | null> {
    const headers: Record<string, string> = {};
    if (etag) headers['If-None-Match'] = etag;
    return fetchWithTimeout<ApiSyncManifest>('/sync/manifest', { headers, signal });
  },

  async getSyncBundle(etag?: string | null, signal?: AbortSignal): Promise<ApiSyncBundle | null> {
    const headers: Record<string, string> = {};
    if (etag) headers['If-None-Match'] = etag;
    return fetchWithTimeout<ApiSyncBundle>('/sync-bundle', { credentials: 'omit', headers, signal }, 30000);
  },

  async getMeta(signal?: AbortSignal): Promise<ApiMetaResponse> {
    return fetchWithTimeout<ApiMetaResponse>('/meta', { signal });
  },

  /** How many AI lookups this device has left today. Costs nothing. */
  async aiLookupUsage(deviceId: string, signal?: AbortSignal): Promise<AiUsage & { enabled: boolean }> {
    return fetchWithTimeout<AiUsage & { enabled: boolean }>('/ai-lookup/usage', {
      headers: { 'X-Device-Id': deviceId },
      signal,
    });
  },

  /** The AI lookup. The server holds the key, the cache and the daily limit. */
  async aiLookup(query: string, deviceId: string, signal?: AbortSignal): Promise<AiLookupResult> {
    return fetchWithTimeout<AiLookupResult>(
      '/ai-lookup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify({ q: query }),
        signal,
      },
      45000
    );
  },

  /** Send feedback. Stored on the server; no account, rate limited per device. */
  async sendFeedback(payload: FeedbackPayload, deviceId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
    return fetchWithTimeout<{ ok: boolean }>(
      '/feedback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify(payload),
        signal,
      },
      15000
    );
  },
};
