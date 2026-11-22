/**
 * Finds NAFDAC registration numbers in OCR text.
 *
 * Real shapes in the registry: 01-4721, 04-0023L, A4-2260, B4-6953, A8-101168L, A11-1222.
 * That is: a prefix (two digits, or one letter and one or two digits), a hyphen, three to six
 * digits, and sometimes a trailing letter. OCR confuses look-alike characters, so each match is
 * also offered in a repaired form (O to 0, I or L to 1, S to 5, B to 8, Z to 2, G to 6).
 * Dates such as 07/2021 are never mistaken for a number: slash-separated matches count only
 * right after a NAFDAC, REG or NRN label.
 */

export interface RegCandidate {
  /** Display form, for example B4-6953. */
  code: string;
  /** Letters and digits only, upper case, for registry lookups. */
  norm: string;
  /** Found right after a "NAFDAC Reg. No." style label. */
  labeled: boolean;
  /** True when look-alike characters were swapped to reach this form. */
  repaired: boolean;
}

export function normalizeReg(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const DASHES = /[‐-―−﹘﹣－~_]/g;
const TO_DIGIT: Record<string, string> = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8', Z: '2', G: '6',
};
const VALID_PREFIX = /^(\d{2}|[A-Z]\d{1,2})$/;

function toDigits(s: string): string {
  return s.replace(/[A-Z|]/g, (c) => TO_DIGIT[c] ?? c);
}

/** Possible readings of a prefix, most literal first. */
function prefixVariants(raw: string): { value: string; repaired: boolean }[] {
  const out: { value: string; repaired: boolean }[] = [];
  const add = (value: string, repaired: boolean) => {
    if (VALID_PREFIX.test(value) && !out.some((o) => o.value === value)) out.push({ value, repaired });
  };
  add(raw, false);
  // Letter then digits: only the digit positions are repaired.
  if (/^[A-Z]/.test(raw)) add(raw[0] + toDigits(raw.slice(1)), raw.slice(1) !== toDigits(raw.slice(1)));
  // All digits, for example O1 read for 01.
  add(toDigits(raw), toDigits(raw) !== raw);
  // A stray extra character in front or behind (BA4 read for B4): try the two-character cores.
  if (raw.length === 3) {
    add(raw.slice(1), true);
    add(raw[0] + raw[2], true);
    add(raw.slice(0, 2), true);
  }
  return out;
}

const SHAPE = /(?<![A-Z0-9])([A-Z0-9|]{2,3})\s?([-/.\s])\s?([A-Z0-9|]{3,6})(?:-?([A-Z]))?(?![A-Z0-9])/y;
const LABELED = /(?:NAFDAC|NRN|REG)\.?\s*(?:REG\.?)?\s*(?:NO|NUMBER)?\.?\s*[:\-.]?\s*([A-Z0-9|]{2,3}\s?[-/.\s]\s?[A-Z0-9|]{3,6}(?:-?[A-Z])?)(?![A-Z0-9])/g;

function build(prefix: string, digits: string, suffix: string | undefined, labeled: boolean, repaired: boolean): RegCandidate {
  const code = `${prefix}-${digits}${suffix ?? ''}`;
  return { code, norm: normalizeReg(code), labeled, repaired };
}

function variantsFor(prefixRaw: string, numRaw: string, suffix: string | undefined, labeled: boolean): RegCandidate[] {
  const out: RegCandidate[] = [];
  const digitsFixed = toDigits(numRaw);
  const numRepaired = digitsFixed !== numRaw;
  // The numeric part must be digits after repair; at most one trailing letter may stay if it was read as one.
  let digits = digitsFixed;
  let tail = suffix;
  if (/\D/.test(digits)) return out;
  if (!tail && /[A-Z]$/.test(numRaw) && numRaw.length > 3 && /\d/.test(numRaw.slice(0, -1))) {
    // e.g. 101168L written without a space: the final letter is a real suffix.
    const body = toDigits(numRaw.slice(0, -1));
    if (!/\D/.test(body)) {
      digits = body;
      tail = numRaw.slice(-1);
    }
  }
  if (digits.length < 3 || digits.length > 6) return out;
  for (const pv of prefixVariants(prefixRaw)) {
    out.push(build(pv.value, digits, tail, labeled, pv.repaired || numRepaired));
  }
  return out;
}

function isDate(prefix: string, sep: string, digits: string): boolean {
  const month = Number(prefix);
  return sep === '/' && /^\d{2}$/.test(prefix) && month >= 1 && month <= 12 && /^(19|20)\d{2}$/.test(digits);
}

/** Every match of a sticky pattern, including ones that overlap an earlier match. */
function allMatchesAt(re: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  for (let i = 0; i < text.length; i++) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (m) out.push(m);
  }
  return out;
}

export function extractRegCandidates(text: string): RegCandidate[] {
  if (!text) return [];
  const upper = text.toUpperCase().replace(DASHES, '-').replace(/[\r\n]+/g, ' ');
  const found: RegCandidate[] = [];
  const push = (c: RegCandidate) => {
    const existing = found.find((f) => f.norm === c.norm);
    if (!existing) found.push(c);
    else if (c.labeled && !existing.labeled) existing.labeled = true;
  };

  for (const m of upper.matchAll(LABELED)) {
    const inner = m[1].replace(/\s+/g, ' ');
    const sm = /^([A-Z0-9|]{2,3})\s?([-/.\s])\s?([A-Z0-9|]{3,6})(?:-?([A-Z]))?$/.exec(inner);
    if (sm) variantsFor(sm[1], sm[3], sm[4], true).forEach(push);
  }
  // Try every start position: a junk match such as 'NO- BA4' must not hide the real number after it.
  for (const m of allMatchesAt(SHAPE, upper)) {
    const [, prefix, sep, num, suffix] = m;
    const digitsGuess = toDigits(num);
    if (sep === '/' && isDate(toDigits(prefix), '/', digitsGuess)) continue;
    // Slash or space separated shapes are too easy to confuse with licence numbers and dates.
    if (sep !== '-') continue;
    variantsFor(prefix, num, suffix, false).forEach(push);
  }
  // Labeled first, then literal reads before repaired ones.
  return found.sort((a, b) => Number(b.labeled) - Number(a.labeled) || Number(a.repaired) - Number(b.repaired));
}
