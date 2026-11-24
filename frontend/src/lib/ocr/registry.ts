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

  /**
   * Registry numbers within two edits of `code`, closest first, for tap-to-pick suggestions.
   * A look-alike swap (O for 0, L for 1) costs half an edit; any other change, insertion or
   * deletion costs one. Returns nothing for very short input. Suggestions only: the user still
   * has to tap one, and nothing is looked up automatically.
   */
  closest(code: string, limit = 3): string[] {
    const q = normalizeReg(code);
    if (q.length < 5) return [];
    const MAX_COST = 2;
    const hits: { reg: string; cost: number }[] = [];
    for (const [norm, reg] of this.display) {
      if (Math.abs(norm.length - q.length) > MAX_COST) continue;
      const cost = editCost(q, norm, MAX_COST);
      if (cost <= MAX_COST) hits.push({ reg, cost });
    }
    hits.sort((a, b) => a.cost - b.cost || a.reg.length - b.reg.length || a.reg.localeCompare(b.reg));
    return hits.slice(0, limit).map((h) => h.reg);
  }
}

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  return LOOKALIKES[a]?.includes(b) ? 0.5 : 1;
}

/** Edit distance with half-cost look-alike swaps; gives up early once it exceeds `max`. */
function editCost(a: string, b: string, max: number): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(a[i - 1], b[j - 1]));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
