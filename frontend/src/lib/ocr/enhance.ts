import { grayToPixels, resizeGray, stretchContrast, toGray } from './image';
import { Gray, Pixels } from './types';

/**
 * A stronger clean-up for glossy or curved packs, used only for the second read when the first one
 * found no number. Subtracts the local average brightness (a box blur through an integral image) to
 * flatten glare and shading, then stretches the contrast and normalises the width.
 */
export function localContrast(g: Gray, radius = 24, gain = 2.2): Gray {
  const { width: w, height: h, data } = g;
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const v = 128 + (data[y * w + x] - sum / area) * gain;
      out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { width: w, height: h, data: out };
}

export function enhanceForOcr(p: Pixels, targetWidth = 1000): Pixels {
  let g = toGray(p);
  if (g.width !== targetWidth) g = resizeGray(g, targetWidth);
  return grayToPixels(stretchContrast(localContrast(g), 0.01, 0.99));
}
