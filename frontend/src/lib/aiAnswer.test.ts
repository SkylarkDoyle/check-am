import { describe, expect, it } from 'vitest';
import type { AiLookupResult } from '../components/ai/types';
import { buildAiShareText, inlineParts, looksLikeReg, summaryLines, verdictOf, withoutVerdictLine } from './aiAnswer';

const result = (texts: string[]): AiLookupResult => ({
  query: 'A8-106270L',
  result: 'ok',
  cached: false,
  blocks: [{ type: 'paragraph', text: texts[0] }, { type: 'list', items: texts.slice(1).map((text) => ({ text })) }],
  sources: [],
  usage: { limit: 5, remaining: 4, resets_at: '' },
  disclaimer: 'AI responses may include mistakes.',
});

describe('verdictOf', () => {
  it('reads the three verdict lines', () => {
    expect(verdictOf(result(['**Verdict: No public record found**']).blocks)).toBe('none');
    expect(verdictOf(result(['Verdict: Found in public sources.']).blocks)).toBe('found');
    expect(verdictOf(result(['Verdict: Cannot tell.']).blocks)).toBe('unknown');
  });

  it('falls back to clear wording, and is cautious otherwise', () => {
    expect(verdictOf(result(['No public record for this number appears in web results.']).blocks)).toBe('none');
    expect(verdictOf(result(['The pack usually has a green label.']).blocks)).toBe('unknown');
  });
});

describe('inlineParts', () => {
  it('uses **bold** markers when present', () => {
    expect(inlineParts('Is **Listed** here')).toEqual([
      { text: 'Is ', bold: false },
      { text: 'Listed', bold: true },
      { text: ' here', bold: false },
    ]);
  });

  it('bolds key terms and numbers when nothing is marked', () => {
    const parts = inlineParts('No public record found for A8-106270L today');
    expect(parts.filter((p) => p.bold).map((p) => p.text)).toEqual(['No public record found', 'A8-106270L']);
  });
});

describe('provider highlight markers', () => {
  it('shows them as bold, never as literal text', () => {
    const parts = inlineParts('Verdict: [Highlight start] No public record found [Highlight end] .');
    expect(parts.map((p) => p.text).join('')).toBe('Verdict: No public record found.');
    expect(parts.filter((p) => p.bold).map((p) => p.text)).toEqual(['No public record found']);
  });
});

describe('sharing', () => {
  it('builds one link, the verdict and a disclaimer', () => {
    const r = result(['Verdict: No public record found', 'First point', 'Second point']);
    const text = buildAiShareText('A8-106270L', r);
    expect(text).toContain('*Verdict:* No public record found');
    expect(text).toContain('• First point');
    expect(text).toContain('Not from NAFDAC');
    expect(text.match(/https?:\/\//g)).toHaveLength(1);
  });

  it('keeps the summary short', () => {
    expect(summaryLines(result(['Verdict: x', 'a', 'b', 'c', 'd']), 3)).toEqual(['a', 'b', 'c']);
  });
});

describe('looksLikeReg', () => {
  it('tells numbers from names', () => {
    expect(looksLikeReg('A8-106270L')).toBe(true);
    expect(looksLikeReg('01-4721')).toBe(true);
    expect(looksLikeReg('gino party jollof')).toBe(false);
  });
});

describe('provider highlight markers', () => {
  it('turns [Highlight start]/[Highlight end] into bold and never shows the markers', () => {
    const parts = inlineParts('Verdict: [Highlight start] No public record found [Highlight end] .');
    expect(parts.map((p) => p.text).join('')).toBe('Verdict: No public record found.');
    expect(parts.find((p) => p.bold)?.text).toBe('No public record found');
  });

  it('reads the verdict through the markers', () => {
    expect(verdictOf(result(['Verdict: [Highlight start] No public record found [Highlight end] .']).blocks)).toBe('none');
  });
});

describe('withoutVerdictLine', () => {
  it('drops a leading verdict sentence the card already shows, and keeps the rest', () => {
    const blocks = result(['Verdict: Found in public sources. According to a report, it is listed.', 'point']).blocks;
    const out = withoutVerdictLine(blocks);
    expect(out[0]).toEqual({ type: 'paragraph', text: 'According to a report, it is listed.' });
  });

  it('removes a block that was only the verdict, and leaves other answers alone', () => {
    expect(withoutVerdictLine(result(['**Verdict: No public record found**', 'point']).blocks)).toHaveLength(1);
    expect(withoutVerdictLine(result(['Nothing special here.', 'point']).blocks)).toHaveLength(2);
  });
});
