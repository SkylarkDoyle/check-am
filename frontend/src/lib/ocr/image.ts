import { Gray, Pixels, Rect } from './types';

/**
 * Pure pixel helpers for the label reader. They work on raw arrays, so they run in the browser
 * (canvas ImageData) and in Node (tests and the bench) alike.
 *
 * Recipe (chosen on a degraded-photo benchmark): crop to the aimed area, grayscale, stretch the
 * contrast between the 2nd and 98th percentile, and normalise the width so the text is a size
 * Tesseract reads well. On the benchmark this read 5 of 5 aimed crops, against 1 of 5 for the
 * old whole-frame approach.
 */

export function cropPixels(p: Pixels, r: Rect): Pixels {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(p.width, Math.ceil(r.x + r.w));
  const y1 = Math.min(p.height, Math.ceil(r.y + r.h));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * p.width + x0) * 4;
    out.set(p.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

export function toGray(p: Pixels): Gray {
  const n = p.width * p.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = (p.data[o] * 299 + p.data[o + 1] * 587 + p.data[o + 2] * 114) / 1000;
  }
  return { width: p.width, height: p.height, data: out };
}

/** Linear stretch between the low and high percentile (default 2% and 98%). */
export function stretchContrast(g: Gray, lowFrac = 0.02, highFrac = 0.98): Gray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > total * lowFrac) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > total * (1 - highFrac)) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 8) return g; // flat frame: nothing to stretch
  const out = new Uint8Array(g.data.length);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < g.data.length; i++) {
    const v = (g.data[i] - lo) * scale;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { width: g.width, height: g.height, data: out };
}

/** Area-average when shrinking, bilinear when enlarging. */
export function resizeGray(g: Gray, targetW: number): Gray {
  const scale = targetW / g.width;
  const targetH = Math.max(1, Math.round(g.height * scale));
  const out = new Uint8Array(targetW * targetH);
  if (scale < 1) {
    for (let y = 0; y < targetH; y++) {
      const sy0 = Math.floor(y / scale);
      const sy1 = Math.min(g.height, Math.max(sy0 + 1, Math.floor((y + 1) / scale)));
      for (let x = 0; x < targetW; x++) {
        const sx0 = Math.floor(x / scale);
        const sx1 = Math.min(g.width, Math.max(sx0 + 1, Math.floor((x + 1) / scale)));
        let sum = 0;
        let count = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            sum += g.data[sy * g.width + sx];
            count++;
          }
        }
        out[y * targetW + x] = count ? sum / count : 0;
      }
    }
  } else {
    for (let y = 0; y < targetH; y++) {
      const fy = Math.min(g.height - 1, y / scale);
      const y0 = Math.floor(fy);
      const y1 = Math.min(g.height - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < targetW; x++) {
        const fx = Math.min(g.width - 1, x / scale);
        const x0 = Math.floor(fx);
        const x1 = Math.min(g.width - 1, x0 + 1);
        const tx = fx - x0;
        const a = g.data[y0 * g.width + x0];
        const b = g.data[y0 * g.width + x1];
        const c = g.data[y1 * g.width + x0];
        const d = g.data[y1 * g.width + x1];
        out[y * targetW + x] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
      }
    }
  }
  return { width: targetW, height: targetH, data: out };
}

export function grayToPixels(g: Gray): Pixels {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    const o = i * 4;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return { width: g.width, height: g.height, data: out };
}

export interface PrepareOptions {
  /** Aim for this width when the crop is narrower than minWidth or wider than maxWidth. */
  targetWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

/** Grayscale, contrast stretch and size normalisation. Returns RGBA ready for a canvas or PNG. */
export function prepareForOcr(p: Pixels, opts: PrepareOptions = {}): Pixels {
  const { targetWidth = 1000, minWidth = 800, maxWidth = 1200 } = opts;
  let g = stretchContrast(toGray(p));
  if (g.width < minWidth || g.width > maxWidth) g = resizeGray(g, targetWidth);
  return grayToPixels(g);
}
