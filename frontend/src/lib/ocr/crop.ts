import { Rect } from './types';

/**
 * Map the on-screen aiming box to pixels of the real video frame.
 *
 * The <video> uses object-fit: cover, so part of the frame is hidden and the rest is scaled. The
 * box is in container CSS pixels; the result is in video pixels, grown by `pad` on each side so a
 * slightly off aim still reads, and clamped to the frame.
 */
export function computeCropRect(
  video: { w: number; h: number },
  container: { w: number; h: number },
  box: Rect,
  pad = 0.15
): Rect {
  const scale = Math.max(container.w / video.w, container.h / video.h);
  const offsetX = (container.w - video.w * scale) / 2;
  const offsetY = (container.h - video.h * scale) / 2;

  let x = (box.x - offsetX) / scale;
  let y = (box.y - offsetY) / scale;
  let w = box.w / scale;
  let h = box.h / scale;

  x -= w * pad;
  y -= h * pad;
  w *= 1 + 2 * pad;
  h *= 1 + 2 * pad;

  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(video.w, x + w);
  const y1 = Math.min(video.h, y + h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
