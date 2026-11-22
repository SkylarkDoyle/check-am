import { useCallback, useEffect, useRef, useState } from 'react';
import { api, CheckAmApiError } from '../api/client';
import { AiLookupResult, AiLookupState } from '../components/ai/types';
import { getLocalAnswer, saveLocalAnswer } from '../lib/aiLocalCache';
import { getDeviceId } from '../lib/deviceId';
import { haptic } from '../lib/haptics';

/**
 * The AI lookup, end to end: asks the backend (which holds the SerpApi key, the answer cache and
 * the daily limit), remembers answers on the phone, and maps every outcome to a sheet state.
 *
 * VITE_AI_FIXTURES=1 swaps the network for canned answers so the design can be reviewed offline
 * (open the Search screen with ?ai=loading|result|nothing|limit to see a state directly).
 */
export const AI_FIXTURES = import.meta.env.VITE_AI_FIXTURES === '1';
const DEFAULT_LIMIT = 5;

function fixtureResult(query: string, remaining: number): AiLookupResult {
  return {
    query,
    result: 'ok',
    cached: false,
    blocks: [
      { type: 'heading', text: 'What the genuine pack looks like' },
      {
        type: 'list',
        items: [
          { text: 'NAFDAC number printed clearly on the carton and tube' },
          { text: 'Sharp print, correct spelling and even colors' },
          { text: 'Maker and address match the brand' },
        ],
      },
      { type: 'heading', text: 'Common signs of a counterfeit' },
      {
        type: 'list',
        items: [
          { text: 'Spelling mistakes in the brand name or address' },
          { text: 'Faded colors, blurry print or loose seals' },
          { text: 'A size the brand does not sell' },
        ],
      },
    ],
    sources: [
      { title: 'Colgate-Palmolive', source: 'Colgate-Palmolive', url: 'https://www.colgatepalmolive.com/' },
      { title: 'NAFDAC', source: 'NAFDAC', url: 'https://nafdac.gov.ng/' },
    ],
    usage: { limit: DEFAULT_LIMIT, remaining, resets_at: '' },
    disclaimer: 'AI responses may include mistakes.',
  };
}

/** Which sheet state a failed request should show. */
export function stateForError(err: unknown): AiLookupState {
  if (err instanceof CheckAmApiError) {
    if (err.code === 'AI_LIMIT_REACHED') return { status: 'limit' };
    if (err.code === 'INVALID_QUERY') return { status: 'none' };
  }
  return { status: 'error' };
}

export function useAiLookup() {
  const [state, setState] = useState<AiLookupState>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_LIMIT);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [enabled, setEnabled] = useState(AI_FIXTURES);
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stopWork = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
  };

  useEffect(() => stopWork, []);

  /** Ask the server whether the feature is on and how many lookups are left. Free. */
  const refreshUsage = useCallback(async () => {
    if (AI_FIXTURES) {
      setEnabled(true);
      return;
    }
    try {
      const usage = await api.aiLookupUsage(await getDeviceId());
      setEnabled(usage.enabled);
      setRemaining(usage.remaining);
      setLimit(usage.limit);
    } catch (err) {
      // Hidden on purpose when the API is unreachable, but say why so it is easy to diagnose
      // (for example: the backend is not running, so the dev proxy answers 500).
      console.warn('AI lookup hidden: the usage check failed.', err);
      setEnabled(false);
    }
  }, []);

  const runFixture = useCallback(
    (q: string) => {
      if (remaining <= 0) {
        setState({ status: 'limit' });
        return;
      }
      setState({ status: 'loading' });
      timer.current = setTimeout(() => {
        if (q.trim().length < 4 || /^[^aeiou\d]+$/i.test(q.trim())) {
          setState({ status: 'none' });
          return;
        }
        const left = remaining - 1;
        setRemaining(left);
        setState({ status: 'result', data: fixtureResult(q, left) });
        haptic('aiDone');
      }, 2200);
    },
    [remaining]
  );

  const run = useCallback(
    async (q: string) => {
      stopWork();
      setQuery(q);
      setOpen(true);
      if (AI_FIXTURES) {
        runFixture(q);
        return;
      }

      // An answer we already hold costs no lookup and needs no network.
      const local = await getLocalAnswer(q);
      if (local) {
        setState({ status: 'result', data: local });
        return;
      }

      if (remaining <= 0) {
        setState({ status: 'limit' });
        return;
      }
      setState({ status: 'loading' });
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await api.aiLookup(q, await getDeviceId(), controller.signal);
        if (controller.signal.aborted) return;
        setRemaining(res.usage.remaining);
        setLimit(res.usage.limit);
        if (res.result === 'ok') {
          setState({ status: 'result', data: res });
          saveLocalAnswer(q, res);
          haptic('aiDone');
        } else {
          setState({ status: 'none' });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const next = stateForError(err);
        if (next.status === 'limit') setRemaining(0);
        setState(next);
      }
    },
    [remaining, runFixture]
  );

  const close = useCallback(() => {
    stopWork();
    setOpen(false);
    setState({ status: 'idle' });
  }, []);

  /** QA helper for fixtures mode. */
  const preview = useCallback((which: string, q: string) => {
    stopWork();
    setQuery(q);
    setOpen(true);
    if (which === 'loading') setState({ status: 'loading' });
    else if (which === 'nothing') setState({ status: 'none' });
    else if (which === 'limit') {
      setRemaining(0);
      setState({ status: 'limit' });
    } else {
      setRemaining(4);
      setState({ status: 'result', data: fixtureResult(q, 4) });
    }
  }, []);

  return { state, open, remaining, limit, enabled, query, run, close, preview, refreshUsage };
}
