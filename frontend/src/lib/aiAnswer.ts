import type { AiBlock, AiListItem, AiLookupResult } from '../components/ai/types';

/** What the AI's own first line says. It is a reading of web sources, never an official result. */
export type AiVerdict = 'found' | 'none' | 'unknown';

export const VERDICT_LABEL: Record<AiVerdict, string> = {
  found: 'Found in public sources',
  none: 'No public record found',
  unknown: 'Cannot tell',
};

export const VERDICT_NOTE: Record<AiVerdict, string> = {
  found: 'Web sources mention this number or product. Check the pack against them.',
  none: 'This does not prove it is unregistered. Check with NAFDAC directly.',
  unknown: 'The web sources were not clear. Check with NAFDAC directly.',
};

/**
 * The provider marks highlighted words "[Highlight start]...[Highlight end]". Turn those into
 * **bold** markers (older saved answers may still contain them) and drop any stray marker.
 */
export function cleanMarkers(text: string): string {
  return text
    .replace(/\[Highlight start\]\s*([\s\S]*?)\s*\[Highlight end\]/gi, '**$1**')
    .replace(/\[Highlight (?:start|end)\]/gi, '')
    .replace(/\s+([.,;:!?])/g, '$1');
}

/** Strip our own bold markers and bullets so text can be matched or put in a message. */
export function plain(text: string): string {
  return cleanMarkers(text).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function firstTexts(blocks: AiBlock[], limit = 6): string[] {
  const out: string[] = [];
  const walk = (items: AiListItem[]) => {
    for (const it of items) {
      if (out.length >= limit) return;
      out.push(it.text);
      if (it.items) walk(it.items);
    }
  };
  for (const b of blocks) {
    if (out.length >= limit) break;
    if (b.type === 'list') walk(b.items);
    else out.push(b.text);
  }
  return out;
}

/** Read the verdict from the answer's "Verdict:" line, or from clear wording when it is missing. */
export function verdictOf(blocks: AiBlock[]): AiVerdict {
  for (const raw of firstTexts(blocks)) {
    const t = plain(raw).toLowerCase();
    if (!t.startsWith('verdict') && !/no (public )?record|not (found|listed)|could not find|no reliable/.test(t)) continue;
    if (/no (public )?record|not found|not listed|no match|could not find/.test(t)) return 'none';
    if (/cannot tell|can't tell|unclear|not clear|unable to/.test(t)) return 'unknown';
    if (/found|listed|registered|appears in/.test(t)) return 'found';
    if (t.startsWith('verdict')) return 'unknown';
  }
  return 'unknown';
}

/**
 * The verdict card already shows the verdict, so drop the AI's own leading "Verdict: ..." sentence
 * (keeping anything after it) instead of saying it twice.
 */
export function withoutVerdictLine(blocks: AiBlock[]): AiBlock[] {
  const out: AiBlock[] = [];
  let done = false;
  for (const b of blocks) {
    if (!done && b.type === 'paragraph') {
      done = true;
      const text = cleanMarkers(b.text);
      if (/^\s*(\*\*)?\s*verdict/i.test(text)) {
        const rest = text.replace(/^\s*(\*\*)?\s*verdict[^.]*\.?(\*\*)?\s*/i, '').replace(/^\*\*\s*/, '').trim();
        if (rest) out.push({ type: 'paragraph', text: rest });
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/** A short plain-text summary for a message: the verdict line and up to three key points. */
export function summaryLines(result: AiLookupResult, max = 3): string[] {
  const lines: string[] = [];
  for (const t of firstTexts(result.blocks, 12)) {
    const p = plain(t);
    if (!p || /^verdict/i.test(p)) continue;
    lines.push(p.length > 160 ? p.slice(0, 157).trimEnd() + '…' : p);
    if (lines.length >= max) break;
  }
  return lines;
}

/** Looks like a NAFDAC registration number rather than a product name (A4-2260, 01-4721, A8-106270L). */
export function looksLikeReg(query: string): boolean {
  return /^[A-Z]?\d{1,2}-?\d{3,7}[A-Z]?$/i.test(query.trim().replace(/\s+/g, ''));
}

export interface InlinePart {
  text: string;
  bold: boolean;
}

/** Terms that are worth bold in an answer even when the provider did not mark them. */
const AUTO_BOLD =
  /\b(Verdict: [A-Za-z ]+?(?=\.|$)|No public record found|Found in public sources|Cannot tell|NAFDAC Greenbook|Listed|registered|unregistered)\b|\b[A-Z]?\d{1,2}-\d{3,7}[A-Z]?\b/g;

/** Split text into plain and bold parts. **marked** text is bold; if none is marked, key terms are. */
export function inlineParts(raw: string): InlinePart[] {
  const text = cleanMarkers(raw);
  if (text.includes('**')) {
    return text
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((s) => (s.startsWith('**') && s.endsWith('**') ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }));
  }
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(AUTO_BOLD)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), bold: false });
    parts.push({ text: m[0], bold: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.length ? parts : [{ text, bold: false }];
}

const SITE_URL = 'https://checkam.com.ng';

/** The WhatsApp message for an AI answer. One link only, so WhatsApp previews the CheckAm card. */
export function buildAiShareText(query: string, result: AiLookupResult): string {
  const verdict = verdictOf(result.blocks);
  const points = summaryLines(result, 3);
  return [
    '*CheckAm AI summary*',
    '',
    `*Question:* ${query}`,
    `*Verdict:* ${VERDICT_LABEL[verdict]}`,
    ...(points.length ? ['', ...points.map((p) => `• ${p}`)] : []),
    '',
    `_${VERDICT_NOTE[verdict]}_`,
    '_AI responses may include mistakes. Not from NAFDAC. Inspect the pack yourself._',
    '',
    `🔗 *Check it on CheckAm:* ${SITE_URL}/?utm_source=whatsapp&utm_medium=share&utm_campaign=ai_summary`,
  ].join('\n');
}

export function whatsappUrl(text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
