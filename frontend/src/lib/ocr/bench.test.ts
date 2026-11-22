import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { describe, expect, it } from 'vitest';
import { RecognizeFn, RegistryIndex, ScanSession, readCrop, readPhoto } from './index';

/**
 * Opt-in benchmark (needs the internet once for the Tesseract language data):
 *   python scripts/ocr-fixtures.py && OCR_BENCH=1 pnpm test
 * It runs the same prepare, read and extract steps the camera uses over degraded copies of the
 * pack photos and reports how often the expected number is found.
 */
const EXPECTED: Record<string, string> = { 'b4-6953': 'B46953' };
const VARIANTS = path.resolve(__dirname, '../../../test-fixtures/packs/variants');
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. ';

function readPng(file: string) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function toPngBuffer(p: { width: number; height: number; data: Uint8ClampedArray }) {
  const png = new PNG({ width: p.width, height: p.height });
  png.data = Buffer.from(p.data);
  return PNG.sync.write(png);
}

describe.skipIf(!process.env.OCR_BENCH)('OCR bench (aimed crops)', () => {
  it('reads the expected number from degraded aimed crops', async () => {
    const files = fs.existsSync(VARIANTS) ? fs.readdirSync(VARIANTS).filter((f) => f.includes('__crop_')) : [];
    expect(files.length, 'run scripts/ocr-fixtures.py first').toBeGreaterThan(0);

    const worker = await createWorker('eng');
    const recognize: RecognizeFn = async (image, mode) => {
      await worker.setParameters({
        tessedit_pageseg_mode: (mode === 'sparse' ? '11' : '6') as never,
        tessedit_char_whitelist: mode === 'free' ? '' : WHITELIST,
      });
      return (await worker.recognize(toPngBuffer(image))).data.text;
    };
    let ok = 0;
    const rows: string[] = [];
    for (const f of files) {
      const photo = f.split('__')[0];
      const t = Date.now();
      const text = await readCrop(readPng(path.join(VARIANTS, f)), recognize);
      // Acceptance, as in the live loop: the session sees the same frame text twice.
      const session = new ScanSession(new RegistryIndex(['B4-6953', 'A4-2260', '01-4721']));
      const decision = session.ingest(text) ?? session.ingest(text);
      const hit = decision?.norm === EXPECTED[photo];
      ok += hit ? 1 : 0;
      rows.push(`${f.padEnd(34)} ${hit ? 'OK' : '--'}  ${Date.now() - t}ms  ${text.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
    }
    await worker.terminate();
    console.log(`\n${rows.join('\n')}\nread rate: ${ok}/${files.length}`);
    expect(ok / files.length).toBeGreaterThanOrEqual(0.8);
  });

  it('reads the expected number from degraded whole photos (gallery path)', async () => {
    const files = fs.existsSync(VARIANTS) ? fs.readdirSync(VARIANTS).filter((f) => f.includes('__full_')) : [];
    expect(files.length, 'run scripts/ocr-fixtures.py first').toBeGreaterThan(0);

    const worker = await createWorker('eng');
    const recognize: RecognizeFn = async (image, mode) => {
      await worker.setParameters({
        tessedit_pageseg_mode: (mode === 'sparse' ? '11' : '6') as never,
        tessedit_char_whitelist: mode === 'free' ? '' : WHITELIST,
      });
      return (await worker.recognize(toPngBuffer(image))).data.text;
    };
    let ok = 0;
    const rows: string[] = [];
    for (const f of files) {
      const photo = f.split('__')[0];
      const t = Date.now();
      const session = new ScanSession(new RegistryIndex(['B4-6953', 'A4-2260', '01-4721']));
      const decision = await readPhoto(readPng(path.join(VARIANTS, f)), recognize, session);
      const hit = decision?.norm === EXPECTED[photo];
      ok += hit ? 1 : 0;
      rows.push(`${f.padEnd(34)} ${hit ? 'OK' : '--'}  ${Date.now() - t}ms`);
    }
    await worker.terminate();
    console.log(['', ...rows, `photo read rate: ${ok}/${files.length}`].join(String.fromCharCode(10)));
    // Blurred or very small whole photos can fail; clear ones must not.
    expect(ok / files.length).toBeGreaterThanOrEqual(0.6);
  });
});
