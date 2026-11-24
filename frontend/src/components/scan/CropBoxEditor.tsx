import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CropBox } from '../../hooks/useScanner';

interface CropBoxEditorProps {
  imageUrl: string;
  box: CropBox;
  onChange: (box: CropBox) => void;
  /** Dim the rest of the photo and animate a line across the box while reading. */
  reading?: boolean;
}

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const MIN = 0.06;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The photo, with a box to drag over the NAFDAC number. Drag inside the box to move it, or drag a
 * corner to resize it. The box is stored as shares of the photo, so it maps straight onto the
 * full-resolution image when read. Doop frame "Scan / Adjust box".
 */
export const CropBoxEditor: React.FC<CropBoxEditorProps> = ({ imageUrl, box, onChange, reading = false }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: CropBox } | null>(null);

  // Where the photo sits inside the wrapper (it is shown "contain", so there can be side margins).
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || !img.naturalWidth) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    setRect({ left: (w - width) / 2, top: (h - height) / 2, width, height });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, imageUrl]);

  const begin = (handle: Handle) => (e: React.PointerEvent) => {
    if (reading) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, start: box };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !rect) return;
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    const s = d.start;
    let { x, y, w, h } = s;
    if (d.handle === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      const west = d.handle === 'nw' || d.handle === 'sw';
      const north = d.handle === 'nw' || d.handle === 'ne';
      if (west) {
        const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
        w = s.x + s.w - nx;
        x = nx;
      } else {
        w = clamp(s.w + dx, MIN, 1 - s.x);
      }
      if (north) {
        const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
        h = s.y + s.h - ny;
        y = ny;
      } else {
        h = clamp(s.h + dy, MIN, 1 - s.y);
      }
    }
    onChange({ x, y, w, h });
  };

  const end = () => {
    drag.current = null;
  };

  const px = rect
    ? {
        left: rect.left + box.x * rect.width,
        top: rect.top + box.y * rect.height,
        width: box.w * rect.width,
        height: box.h * rect.height,
      }
    : null;

  const handleStyle = (cx: number, cy: number): React.CSSProperties => ({
    position: 'absolute',
    left: cx - 22,
    top: cy - 22,
    width: 44,
    height: 44,
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div ref={wrapRef} className="absolute inset-0 select-none" style={{ touchAction: 'none' }}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Your photo of the pack"
        className="absolute inset-0 h-full w-full object-contain"
        onLoad={measure}
        draggable={false}
      />
      {px && (
        <>
          <div
            className="absolute rounded-xl border-[3px] border-dashed border-white"
            style={{ ...px, boxShadow: '0 0 0 2000px rgba(8,12,7,0.55)', touchAction: 'none', cursor: 'move' }}
            onPointerDown={begin('move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            role="group"
            aria-label="Area to read. Drag to move it."
          >
            {reading && <div className="scan-laser" aria-hidden="true" />}
          </div>
          {!reading &&
            (
              [
                ['nw', px.left, px.top],
                ['ne', px.left + px.width, px.top],
                ['sw', px.left, px.top + px.height],
                ['se', px.left + px.width, px.top + px.height],
              ] as [Handle, number, number][]
            ).map(([h, cx, cy]) => (
              <div
                key={h}
                style={handleStyle(cx, cy)}
                onPointerDown={begin(h)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                aria-label="Drag to resize"
              >
                <span className="h-5 w-5 rounded-full border-[3px] border-accent bg-surface" />
              </div>
            ))}
        </>
      )}
    </div>
  );
};
