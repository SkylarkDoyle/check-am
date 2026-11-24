import { extractRegCandidates } from './extract';
import { RegistryIndex } from './registry';
import { ScanDecision, ScanSession } from './session';

/**
 * Why a number is offered for the user to check instead of being opened automatically.
 *  - not-in-registry: well-formed, read twice, but not a registered number on this phone.
 *  - repaired:        one look-alike character away from exactly one registered number.
 *  - single-read:     seen once (or never repeated); the best guess so far.
 */
export type SuggestReason = 'not-in-registry' | 'repaired' | 'single-read' | 'registry-match' | 'nothing-read';

export type ConfirmOutcome =
  /** Exact registry match seen twice: continue to the result without a tap. */
  | { action: 'auto'; code: string }
  /** Show the editable "Got it!" bubble prefilled with `code`. The user taps Check. */
  | { action: 'suggest'; code: string; reason: SuggestReason }
  | { action: 'none' };

export function decisionToOutcome(decision: ScanDecision): ConfirmOutcome {
  if (decision.how === 'registry') return { action: 'auto', code: decision.code };
  return {
    action: 'suggest',
    code: decision.code,
    reason: decision.how === 'repaired' ? 'repaired' : 'not-in-registry',
  };
}

export interface ConfirmStep {
  outcome: ConfirmOutcome;
  /** Display forms of every candidate found in this read, best first. */
  candidates: string[];
  /** The candidate that exists in the registry, if any. */
  matched: string | null;
}

/**
 * Hybrid confirm rule on top of the unchanged two-read ScanSession: only an exact registry match
 * that repeats continues automatically. Everything else becomes a suggestion for the user to
 * check, and a typed correction is never submitted by this class.
 */
export class ScanConfirmer {
  private session: ScanSession;
  private best: { code: string; norm: string; count: number; confidence: number } | null = null;

  constructor(
    private readonly index: RegistryIndex | null,
    repeatsNeeded = 2
  ) {
    this.session = new ScanSession(index, repeatsNeeded);
  }

  reset(): void {
    this.session.reset();
    this.best = null;
  }

  ingest(text: string, confidence = 0): ConfirmStep {
    const cands = extractRegCandidates(text);
    const candidates = cands.map((c) => c.code);
    const hit = cands.find((c) => this.index?.has(c.norm));
    const matched = hit ? this.index?.displayFor(hit.norm) ?? hit.code : null;

    if (cands.length > 0) {
      const top = hit ?? cands[0];
      if (this.best && this.best.norm === top.norm) {
        this.best.count++;
        this.best.confidence = Math.max(this.best.confidence, confidence);
      } else if (!this.best || this.best.count < 2 || !!hit) {
        this.best = { code: matched ?? top.code, norm: top.norm, count: 1, confidence };
      }
    }

    const decision = this.session.ingest(text);
    return { outcome: decision ? decisionToOutcome(decision) : { action: 'none' }, candidates, matched };
  }

  /** The best number seen so far, for when the scan times out without a confirmed one. */
  bestGuess(): ConfirmOutcome {
    if (!this.best) return { action: 'none' };
    return { action: 'suggest', code: this.best.code, reason: 'single-read' };
  }
}
