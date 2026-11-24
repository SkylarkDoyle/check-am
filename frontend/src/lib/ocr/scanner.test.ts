import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScanDebugPanel } from '../../components/scan/ScanDebugPanel';
import {
  EMPTY_DIAGNOSTICS,
  OcrEngine,
  RegistryIndex,
  ScanConfirmer,
  ScanDiagnostics,
  classifyFailures,
  extractRegCandidates,
  isBlurry,
  isScanDebug,
  laplacianVariance,
  readLiveCrop,
  tesseractPaths,
  toRecognizeFn,
} from './index';
import { Pixels } from './types';

const index = new RegistryIndex(['B4-6953', 'A4-2260']);
const read = (code: string) => `NAFDAC Reg. No.: ${code}`;

/** Scripted engine: returns the next queued text for each read. */
class FakeEngine implements OcrEngine {
  inited = false;
  disposed = false;
  calls: { mode?: string }[] = [];
  constructor(private texts: string[], private failInit = false) {}
  async init() {
    if (this.failInit) throw new Error('load failed');
    this.inited = true;
  }
  async read(_img: unknown, opts?: { mode?: string }) {
    this.calls.push({ mode: opts?.mode });
    return { text: this.texts.shift() ?? '', confidence: 80 };
  }
  dispose() {
    this.disposed = true;
  }
}

function flat(w: number, h: number, v: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(v);
  return { width: w, height: h, data };
}

function stripes(w: number, h: number, period: number): Pixels {
  const p = flat(w, h, 255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.floor(x / period) % 2 ? 0 : 255;
      const o = (y * w + x) * 4;
      p.data[o] = p.data[o + 1] = p.data[o + 2] = v;
    }
  return p;
}

describe('ScanConfirmer (hybrid confirm)', () => {
  it('continues automatically only on an exact registry match seen twice', () => {
    const c = new ScanConfirmer(index);
    expect(c.ingest(read('B4-6953')).outcome.action).toBe('none');
    expect(c.ingest(read('B4-6953')).outcome).toEqual({ action: 'auto', code: 'B4-6953' });
  });

  it('a number not in the registry becomes a suggestion, never auto and never a match', () => {
    const c = new ScanConfirmer(index);
    c.ingest(read('02-9999'));
    const step = c.ingest(read('02-9999'));
    expect(step.outcome).toEqual({ action: 'suggest', code: '02-9999', reason: 'not-in-registry' });
    expect(step.matched).toBeNull();
  });

  it('a look-alike repair is only suggested', () => {
    const c = new ScanConfirmer(index);
    c.ingest(read('84-6953'));
    expect(c.ingest(read('84-6953')).outcome).toEqual({ action: 'suggest', code: 'B4-6953', reason: 'repaired' });
  });

  it('one read alone does nothing yet, but is kept as the best guess', () => {
    const c = new ScanConfirmer(index);
    expect(c.bestGuess()).toEqual({ action: 'none' });
    expect(c.ingest(read('02-9999')).outcome.action).toBe('none');
    expect(c.bestGuess()).toEqual({ action: 'suggest', code: '02-9999', reason: 'single-read' });
  });

  it('two different reads never count as a repeat', () => {
    const c = new ScanConfirmer(index);
    c.ingest(read('02-9999'));
    expect(c.ingest(read('02-9998')).outcome.action).toBe('none');
  });

  it('reports candidates and the registry-matched candidate for diagnostics', () => {
    const step = new ScanConfirmer(index).ingest(read('A4-2260'));
    expect(step.candidates).toContain('A4-2260');
    expect(step.matched).toBe('A4-2260');
  });

  it('works without a registry (empty catalog): suggestions only', () => {
    const c = new ScanConfirmer(null);
    c.ingest(read('B4-6953'));
    expect(c.ingest(read('B4-6953')).outcome).toMatchObject({ action: 'suggest', reason: 'not-in-registry' });
  });
});

describe('OcrEngine seam', () => {
  const crop = stripes(900, 300, 6);

  it('a fake engine plugs into the reading passes', async () => {
    const engine = new FakeEngine([read('B4-6953')]);
    await engine.init();
    const { text, enhanced } = await readLiveCrop(crop, toRecognizeFn(engine));
    expect(engine.inited).toBe(true);
    expect(extractRegCandidates(text).map((c) => c.code)).toContain('B4-6953');
    expect(enhanced).toBe(false);
    expect(engine.calls).toHaveLength(1);
    engine.dispose();
    expect(engine.disposed).toBe(true);
  });

  it('reads an enhanced copy only when the first passes find no candidate', async () => {
    // Three normal passes read nothing; the enhanced block pass finds the number.
    const engine = new FakeEngine(['', '', '', read('B4-6953')]);
    const { text, enhanced } = await readLiveCrop(crop, toRecognizeFn(engine));
    expect(enhanced).toBe(true);
    expect(engine.calls).toHaveLength(4);
    expect(extractRegCandidates(text).length).toBeGreaterThan(0);
  });

  it('init failure surfaces as a rejection the hook can show with a retry', async () => {
    await expect(new FakeEngine([], true).init()).rejects.toThrow('load failed');
  });

  it('points the worker and core at self-hosted files', () => {
    expect(tesseractPaths('https://checkam.app', '/')).toEqual({
      workerPath: 'https://checkam.app/tesseract/worker.min.js',
      corePath: 'https://checkam.app/tesseract',
    });
    expect(tesseractPaths('http://localhost:5173/', '/sub/').workerPath).toBe('http://localhost:5173/sub/tesseract/worker.min.js');
  });
});

describe('blur check', () => {
  it('scores sharp edges far above a flat or smeared frame', () => {
    expect(laplacianVariance(stripes(800, 200, 4))).toBeGreaterThan(500);
    expect(isBlurry(flat(800, 200, 128))).toBe(true);
    expect(isBlurry(stripes(800, 200, 4))).toBe(false);
  });
});

describe('candidate extraction on extra fixtures', () => {
  const codes = (t: string) => extractRegCandidates(t).map((c) => c.code);
  it('finds the number among noisy curved-pack text', () => {
    expect(codes('NAFDAC Reg. No: A8-1O1168L Mfg 05/2023 Exp 05/2026')).toContain('A8-101168L');
    expect(codes('NAFDAC N0. 01-4721\nBATCH 4471')).toContain('01-4721');
  });
  it('finds nothing in text without a number', () => {
    expect(codes('KEEP OUT OF REACH OF CHILDREN. STORE BELOW 30C')).toEqual([]);
  });
});

describe('diagnostics states', () => {
  const base: ScanDiagnostics = { ...EMPTY_DIAGNOSTICS, engine: 'ready', camera: { width: 1920, height: 1080 } };

  it('classifies each failure class', () => {
    expect(classifyFailures({ ...base, engine: 'error', engineError: 'x' })).toContain('engine-failed');
    expect(classifyFailures({ ...base, camera: { width: 640, height: 480 } })).toContain('low-res-camera');
    expect(classifyFailures({ ...base, reads: 4, lastText: 'junk' })).toContain('no-candidate');
    expect(classifyFailures({ ...base, reads: 1, lastText: 'junk' })).toEqual([]); // too early to say
    expect(classifyFailures({ ...base, reads: 2, candidates: ['02-9999'], matched: null })).toContain('no-registry-match');
    expect(classifyFailures({ ...base, reads: 2, candidates: ['B4-6953'], matched: 'B4-6953' })).toEqual([]);
  });

  it('reads the flag from the query string', () => {
    expect(isScanDebug('?scandebug=1')).toBe(true);
    expect(isScanDebug('?x=1&scandebug=1')).toBe(true);
    expect(isScanDebug('?scandebug=0')).toBe(false);
    expect(isScanDebug('')).toBe(false);
  });

  const html = (d: ScanDiagnostics) => renderToStaticMarkup(React.createElement(ScanDebugPanel, { diagnostics: d }));

  it('panel shows the fields and the failure warnings', () => {
    const out = html({
      ...base,
      frame: { width: 900, height: 500 },
      lastText: 'NAFDAC 02-9999',
      candidates: ['02-9999'],
      matched: null,
      lastReadMs: 412.4,
      reads: 5,
    });
    expect(out).toContain('1920x1080');
    expect(out).toContain('900x500');
    expect(out).toContain('02-9999');
    expect(out).toContain('412');
    expect(out).toContain('data-failure="no-registry-match"');
  });

  it('panel shows the engine error state', () => {
    const out = html({ ...base, engine: 'error', engineError: 'Failed to fetch' });
    expect(out).toContain('error (Failed to fetch)');
    expect(out).toContain('data-failure="engine-failed"');
  });
});

describe('RegistryIndex.closest', () => {
  const index = new RegistryIndex(['A4-2260', 'A4-2261', '04-4413', 'B1-9999', 'A11-100486']);

  it('offers the nearest real numbers for a misread, best first', () => {
    expect(index.closest('04-4418', 3)[0]).toBe('04-4413');
    expect(index.closest('L1-9999', 3)).toContain('B1-9999');
  });

  it('treats a look-alike swap as closer than a different digit', () => {
    expect(index.closest('A4-226O', 3)[0]).toBe('A4-2260');
  });

  it('offers nothing when nothing is within two edits, or the input is too short', () => {
    expect(index.closest('ZZ-0000', 3)).toEqual([]);
    expect(index.closest('A4', 3)).toEqual([]);
  });
});
