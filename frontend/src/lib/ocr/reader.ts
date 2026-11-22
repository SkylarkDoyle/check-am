import { extractRegCandidates } from './extract';
import { cropPixels, prepareForOcr } from './image';
import { ScanDecision, ScanSession } from './session';
import { Pixels } from './types';

/**
 * How Tesseract should treat the image: one text block, scattered words, or a text block with no
 * character restriction ('free', better on whole photos full of other text).
 */
export type ReadMode = 'block' | 'sparse' | 'free';
export type RecognizeFn = (image: Pixels, mode: ReadMode) => Promise<string>;

/**
 * Read one aimed crop. Up to three passes, stopping at the first that yields a well-formed
 * number: cleaned image in block mode, cleaned image in sparse mode, then the untouched crop in
 * block mode. Different passes win on different frames, so trying all three lifts the hit rate
 * (see the benchmark in bench.test.ts). Returns the text of the winning pass, or of the last pass
 * when nothing looked like a number.
 */
export async function readCrop(crop: Pixels, recognize: RecognizeFn): Promise<string> {
  const prepared = prepareForOcr(crop);
  const passes: [Pixels, ReadMode][] = [
    [prepared, 'block'],
    [prepared, 'sparse'],
    [crop, 'block'],
  ];
  let last = '';
  for (const [image, mode] of passes) {
    last = await recognize(image, mode);
    if (extractRegCandidates(last).length > 0) return last;
  }
  return last;
}

/**
 * Read one region of a still photo (the whole picture or a band of it). Whole photos behave
 * differently from aimed live crops: the untouched image read without a character restriction
 * wins, so that goes first, then the cleaned image, then sparse mode.
 */
export async function readPhotoRegion(region: Pixels, recognize: RecognizeFn): Promise<string> {
  const prepared = prepareForOcr(region);
  const passes: [Pixels, ReadMode][] = [
    [region, 'free'],
    [prepared, 'free'],
    [prepared, 'sparse'],
  ];
  let last = '';
  for (const [image, mode] of passes) {
    last = await recognize(image, mode);
    if (extractRegCandidates(last).length > 0) return last;
  }
  return last;
}

/**
 * Every pass over a still photo region, with no early exit. A still picture cannot be "read again"
 * the way live frames are, so agreement between different passes (cleaned or untouched, block or
 * sparse) stands in for the repeat the live camera gets for free.
 */
export async function readPhotoRegionAll(region: Pixels, recognize: RecognizeFn): Promise<string[]> {
  const prepared = prepareForOcr(region);
  const passes: [Pixels, ReadMode][] = [
    [region, 'free'],
    [prepared, 'free'],
    [prepared, 'sparse'],
  ];
  const texts: string[] = [];
  for (const [image, mode] of passes) texts.push(await recognize(image, mode));
  return texts;
}

/** The regions tried on a still photo: the whole picture, then three overlapping horizontal bands. */
export function photoRegions(photo: Pixels): Pixels[] {
  const H = photo.height;
  return [
    photo,
    cropPixels(photo, { x: 0, y: 0, w: photo.width, h: H * 0.4 }),
    cropPixels(photo, { x: 0, y: H * 0.3, w: photo.width, h: H * 0.4 }),
    cropPixels(photo, { x: 0, y: H * 0.6, w: photo.width, h: H * 0.4 }),
  ];
}

/**
 * Find the registration number in a still photo. Tries each region with every pass and stops as
 * soon as the session accepts a number (two agreeing reads). Returns null if nothing is trusted.
 */
export async function readPhoto(
  photo: Pixels,
  recognize: RecognizeFn,
  session: ScanSession
): Promise<ScanDecision | null> {
  for (const region of photoRegions(photo)) {
    for (const text of await readPhotoRegionAll(region, recognize)) {
      const decision = session.ingest(text);
      if (decision) return decision;
    }
  }
  return null;
}
