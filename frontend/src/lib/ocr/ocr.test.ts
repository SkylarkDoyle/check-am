import { describe, expect, it } from 'vitest';
import {
  RegistryIndex,
  ScanSession,
  computeCropRect,
  cropPixels,
  extractRegCandidates,
  prepareForOcr,
  resizeGray,
  stretchContrast,
  toGray,
} from './index';

const codes = (text: string) => extractRegCandidates(text).map((c) => c.code);

describe('extractRegCandidates', () => {
  it('reads real registry shapes', () => {
    expect(codes('NAFDAC Reg. No.: B4-6953')).toContain('B4-6953');
    expect(codes('Reg No 01-4721 batch 22')).toContain('01-4721');
    expect(codes('A8-101168L')).toContain('A8-101168L');
    expect(codes('A11-1222')).toContain('A11-1222');
    expect(codes('04-0023L')).toContain('04-0023L');
  });

  it('never mistakes dates, licence numbers or barcodes for a number', () => {
    const text = 'Mfg. Lic. No.: G/25A/4632-A Batch No : BM1783 Mfg. Date : 07/2021 Exp. Date : 06/2024 18908004297015';
    expect(codes(text)).toEqual([]);
  });

  it('accepts slash separated numbers only after a NAFDAC label', () => {
    expect(codes('NAFDAC NO: 04/0023')).toContain('04-0023');
    expect(codes('lot 04/0023')).toEqual([]);
  });

  it('repairs look-alike characters in the digit positions', () => {
    const c = extractRegCandidates('NAFDAC Reg. No.: B4-6O53');
    expect(c.map((x) => x.code)).toContain('B4-6053');
    expect(c.find((x) => x.code === 'B4-6053')?.repaired).toBe(true);
    expect(codes('O1-4721')).toContain('01-4721');
  });

  it('does not glue the next word onto the number as a suffix letter', () => {
    expect(codes('NAFDAC R. N. B4-6953 M. Lic. No.')[0]).toBe('B4-6953'); // literal read first, repaired variants after
    expect(codes('NAFDAC Reg. No.: B4-6953' + String.fromCharCode(10) + 'Mfg. Lic. No.: G/25A/4632-A')[0]).toBe('B4-6953');
  });

  it('offers the core prefix when OCR adds a stray character', () => {
    expect(codes('NAFDAC R. NO- BA4-6953 M. LC')).toEqual(expect.arrayContaining(['A4-6953', 'B4-6953']));
  });

  it('survives unicode dashes and line breaks', () => {
    expect(codes('NAFDAC Reg. No.:\nB4–6953')).toContain('B4-6953');
  });
});

describe('RegistryIndex', () => {
  const index = new RegistryIndex(['B4-6953', 'A4-2260', '01-4721', '01-4722', 'A8-101168L']);

  it('finds exact numbers and shows the registry spelling', () => {
    expect(index.has('B46953')).toBe(true);
    expect(index.displayFor('A42260')).toBe('A4-2260');
  });

  it('repairs a number only through genuine look-alike characters', () => {
    expect(index.nearest('846953')).toBe('B46953'); // 8 read for B
    expect(index.nearest('B4G953')).toBe('B46953'); // G read for 6
    expect(index.nearest('O14721')).toBe('014721'); // O read for 0
  });

  it('never treats an ordinary digit difference as a typo (it is a different product)', () => {
    expect(index.nearest('B40953')).toBeNull(); // 6 vs 0 is not a look-alike pair
    expect(index.nearest('B46958')).toBeNull();
    expect(index.nearest('B4695')).toBeNull(); // missing digit
    expect(index.nearest('ZZ9999')).toBeNull();
  });

  it('refuses a repair that points at more than one registry number', () => {
    const twins = new RegistryIndex(['0A-1111', 'OA-1111']);
    expect(twins.nearest('QA1111')).toBeNull();
  });
});

describe('ScanSession', () => {
  const index = new RegistryIndex(['B4-6953', 'A4-2260', 'B4-0953']);

  it('needs the same read twice, even for an exact registry number', () => {
    const s = new ScanSession(index);
    expect(s.ingest('NAFDAC Reg. No.: B4-6953')).toBeNull();
    expect(s.ingest('NAFDAC Reg. No.: B4-6953')).toMatchObject({ code: 'B4-6953', how: 'registry' });
  });

  it('repairs a look-alike misread only after it repeats', () => {
    const s = new ScanSession(index);
    expect(s.ingest('NAFDAC Reg. No.: 84-6953')).toBeNull();
    expect(s.ingest('NAFDAC Reg. No.: 84-6953')).toMatchObject({ code: 'B4-6953', how: 'repaired' });
  });

  it('REGRESSION: a number missing from the registry is never matched to a neighbouring product', () => {
    // B4-6953 is not registered here; B4-0953 is. One digit apart must NOT become a match.
    const lonely = new RegistryIndex(['B4-0953', 'A4-2260']);
    const s = new ScanSession(lonely);
    s.ingest('NAFDAC Reg. No.: B4-6953');
    const d = s.ingest('NAFDAC Reg. No.: B4-6953');
    expect(d).toMatchObject({ code: 'B4-6953', how: 'repeated' });
    expect(d?.norm).not.toBe('B40953');
  });

  it('accepts a number that is not in the registry only after two matching reads', () => {
    const s = new ScanSession(index);
    expect(s.ingest('NAFDAC Reg. No.: 02-9999')).toBeNull();
    expect(s.ingest('NAFDAC Reg. No.: 02-9999')).toMatchObject({ code: '02-9999', how: 'repeated' });
  });

  it('does not count two different bad reads as a repeat', () => {
    const s = new ScanSession(null);
    expect(s.ingest('NAFDAC Reg. No.: 02-9999')).toBeNull();
    expect(s.ingest('NAFDAC Reg. No.: 02-9998')).toBeNull();
  });

  it('forgets stale reads after empty frames', () => {
    const s = new ScanSession(null);
    s.ingest('NAFDAC Reg. No.: 02-9999');
    s.ingest('');
    s.ingest('');
    s.ingest('');
    expect(s.ingest('NAFDAC Reg. No.: 02-9999')).toBeNull();
  });

  it('can be configured to accept after a single read', () => {
    expect(new ScanSession(index, 1).ingest('NAFDAC Reg. No.: B4-6953')).toMatchObject({ how: 'registry' });
  });
});

describe('computeCropRect', () => {
  it('maps the aiming box through object-fit cover', () => {
    // 1920x1080 video shown in a 400x300 card: scale 300/1080, 400 px wide shows 1440 px of video.
    const r = computeCropRect({ w: 1920, h: 1080 }, { w: 400, h: 300 }, { x: 72, y: 84, w: 256, h: 128 }, 0);
    const scale = 300 / 1080;
    expect(r.w).toBeCloseTo(256 / scale, 0);
    expect(r.h).toBeCloseTo(128 / scale, 0);
    expect(r.x).toBeCloseTo((72 - (400 - 1920 * scale) / 2) / scale, 0);
  });

  it('grows by the padding and stays inside the frame', () => {
    const r = computeCropRect({ w: 640, h: 480 }, { w: 640, h: 480 }, { x: 0, y: 0, w: 640, h: 480 }, 0.2);
    expect(r).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });
});

describe('image helpers', () => {
  const px = (w: number, h: number, v: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : v))),
  });

  it('crops without leaving the image', () => {
    const c = cropPixels(px(10, 10, 100), { x: 8, y: 8, w: 10, h: 10 });
    expect(c.width).toBe(2);
    expect(c.height).toBe(2);
  });

  it('stretches a dull image to full range and leaves a flat one alone', () => {
    const g = { width: 4, height: 1, data: new Uint8Array([100, 110, 120, 130]) };
    const s = stretchContrast(g, 0, 1);
    expect(s.data[0]).toBe(0);
    expect(s.data[3]).toBe(255);
    const flat = { width: 2, height: 1, data: new Uint8Array([90, 90]) };
    expect(stretchContrast(flat)).toBe(flat);
  });

  it('resizes to the requested width in both directions', () => {
    const g = toGray(px(200, 20, 128));
    expect(resizeGray(g, 100).width).toBe(100);
    expect(resizeGray(g, 400).width).toBe(400);
  });

  it('normalises an out-of-range width and keeps a good one', () => {
    expect(prepareForOcr(px(300, 40, 128)).width).toBe(1000);
    expect(prepareForOcr(px(1500, 100, 128)).width).toBe(1000);
    expect(prepareForOcr(px(900, 100, 128)).width).toBe(900);
  });
});
