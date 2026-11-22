/** Normalised AI lookup response (see IMPLEMENTATION_4.1-4.6_UI_SCAN_AI_LOOKUP.md section 4.3). */
export interface AiListItem {
  text: string;
  items?: AiListItem[];
}

export type AiBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: AiListItem[] };

export interface AiSource {
  title: string;
  source: string;
  url: string;
  icon?: string;
}

export interface AiUsage {
  limit: number;
  remaining: number;
  resets_at: string;
}

export interface AiLookupResult {
  query: string;
  result: 'ok' | 'none';
  cached: boolean;
  generated_at?: string;
  blocks: AiBlock[];
  sources: AiSource[];
  usage: AiUsage;
  disclaimer: string;
}

export type AiLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'result'; data: AiLookupResult }
  | { status: 'none' }
  | { status: 'limit' }
  | { status: 'error' };

export const AI_DISCLAIMER = 'AI responses may include mistakes.';
