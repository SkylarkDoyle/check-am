import { resizeGray, toGray } from './image';
import { Pixels } from './types';

/**
 * Variance of the Laplacian: the usual sharpness score. Sharp text has many strong edges (high
 * variance); motion blur or a missed focus smooths them away. The frame is shrunk to a fixed width
 * first so the score does not depend on the camera resolution.
 */
export function laplacianVariance(p: Pixels, width = 400): number {
  let g = toGray(p);
  if (g.width !== width && g.width > 8) g = resizeGray(g, width);
  const { width: w, height: h, data } = g;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Below this the frame is treated as motion blur. Deliberately low: it only skips obvious smears. */
export const BLUR_THRESHOLD = 20;

export function isBlurry(p: Pixels, threshold = BLUR_THRESHOLD): boolean {
  return laplacianVariance(p) < threshold;
}
