import { RegCandidate, extractRegCandidates } from './extract';
import { RegistryIndex } from './registry';

export type DecisionHow = 'registry' | 'repaired' | 'repeated';

export interface ScanDecision {
  /** What to look up and show, for example B4-6953. */
  code: string;
  norm: string;
  how: DecisionHow;
}

/**
 * Decides when a stream of noisy OCR reads is trustworthy enough to act on. No taps involved.
 *
 * Every outcome needs the same reading `repeatsNeeded` times (default 2), including a number
 * that matches the registry: a single misread digit can land on a different registered product,
 * and showing a false "Registry match" is the worst mistake this screen can make.
 *
 *  - registry:  the read equals a registry number.
 *  - repaired:  the read is one look-alike character (O/0, B/8, S/5...) from exactly one registry
 *               number.
 *  - repeated:  a well-formed number that is not in the registry; the result will be "No match".
 */
export class ScanSession {
  private seen = new Map<string, number>();
  private emptyFrames = 0;

  constructor(
    private readonly index: RegistryIndex | null,
    private readonly repeatsNeeded = 2
  ) {}

  reset(): void {
    this.seen.clear();
    this.emptyFrames = 0;
  }

  /** Feed the text of one read (or one pass over the same picture). */
  ingest(text: string): ScanDecision | null {
    const cands = extractRegCandidates(text);
    if (cands.length === 0) {
      // Forget stale partial reads after a few empty frames.
      if (++this.emptyFrames >= 3) this.seen.clear();
      return null;
    }
    this.emptyFrames = 0;

    // Each distinct outcome counts once per read, however many spellings of it the read offered.
    const outcomes = new Map<string, ScanDecision>();
    for (const c of cands) {
      const decision = this.classify(c);
      const key = `${decision.how}:${decision.norm}`;
      if (!outcomes.has(key)) outcomes.set(key, decision);
    }

    // Registry matches are preferred over repairs, repairs over unknown numbers.
    const order: DecisionHow[] = ['registry', 'repaired', 'repeated'];
    for (const how of order) {
      for (const [key, decision] of outcomes) {
        if (decision.how !== how) continue;
        const n = (this.seen.get(key) ?? 0) + 1;
        this.seen.set(key, n);
        if (n >= this.repeatsNeeded) return decision;
      }
    }
    return null;
  }

  private classify(c: RegCandidate): ScanDecision {
    if (this.index) {
      if (this.index.has(c.norm)) {
        return { code: this.index.displayFor(c.norm) ?? c.code, norm: c.norm, how: 'registry' };
      }
      const target = this.index.nearest(c.norm);
      if (target) {
        return { code: this.index.displayFor(target) ?? c.code, norm: target, how: 'repaired' };
      }
    }
    return { code: c.code, norm: c.norm, how: 'repeated' };
  }
}
