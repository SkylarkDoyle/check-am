import { normalizeReg } from './extract';

/**
 * Characters OCR genuinely mixes up. A scan is only "repaired" by swapping one character for one
 * of its look-alikes. Any other single-character difference (a 6 read as 0, say) is a different
 * number, and must never be treated as a typo: it could be a different registered product.
 */
const LOOKALIKES: Record<string, string> = {
  '0': 'ODQ', O: '0DQ', D: '0OQ', Q: '0OD',
  '1': 'IL', I: '1L', L: '1I',
  '5': 'S', S: '5',
  '8': 'B', B: '8',
  '2': 'Z', Z: '2',
  '6': 'G', G: '6',
  '4': 'A', A: '4',
};

/**
 * The registry's registration numbers held in memory (a few thousand strings).
 * A scan matches when it equals a registry number, or when swapping exactly one character for a
 * look-alike gives exactly one registry number.
 */
export class RegistryIndex {
  private display = new Map<string, string>();

  constructor(regs: Iterable<string>) {
    for (const reg of regs) {
      const norm = normalizeReg(reg);
      if (norm) this.display.set(norm, reg);
    }
  }

  get size(): number {
    return this.display.size;
  }

  has(norm: string): boolean {
    return this.display.has(norm);
  }

  /** The registry's own spelling of a number, for example "A4-2260". */
  displayFor(norm: string): string | undefined {
    return this.display.get(norm);
  }

  /** The single registry number one look-alike swap away from `norm`, or null if none or several. */
  nearest(norm: string): string | null {
    if (this.display.has(norm)) return norm;
    const hits = new Set<string>();
    for (let i = 0; i < norm.length; i++) {
      const alternatives = LOOKALIKES[norm[i]];
      if (!alternatives) continue;
      for (const alt of alternatives) {
        const candidate = norm.slice(0, i) + alt + norm.slice(i + 1);
        if (this.display.has(candidate)) hits.add(candidate);
      }
    }
    return hits.size === 1 ? [...hits][0] : null;
  }
}
