import type { Worker } from 'tesseract.js';
import type { ReadMode, RecognizeFn } from './reader';
import { Pixels } from './types';

export type OcrInput = ImageData | Blob | Pixels;

export interface OcrReadResult {
  text: string;
  /** 0 to 100, as reported by the engine. 0 when the engine does not report one. */
  confidence: number;
}

export interface OcrReadOptions {
  mode?: ReadMode;
}

/**
 * The seam for a text reader. The scanner hook and screen only know this interface, so another
 * on-device engine (for example PaddleOCR through ONNX) can replace Tesseract without touching them.
 */
export interface OcrEngine {
  /** Load whatever the engine needs. Safe to call again after a failure. */
  init(): Promise<void>;
  read(img: OcrInput, opts?: OcrReadOptions): Promise<OcrReadResult>;
  dispose(): void;
}

/** Adapt an engine to the (image, mode) => text function the reading passes use. */
export function toRecognizeFn(engine: OcrEngine): RecognizeFn {
  return async (image, mode) => (await engine.read(image, { mode })).text;
}

const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. ';

/** Engine files are served from public/tesseract/ so the scanner works offline and without a CDN. */
export function tesseractPaths(origin: string, base: string): { workerPath: string; corePath: string } {
  const root = `${origin.replace(/\/$/, '')}${base.startsWith('/') ? base : `/${base}`}`.replace(/\/$/, '');
  return { workerPath: `${root}/tesseract/worker.min.js`, corePath: `${root}/tesseract` };
}

function toCanvasSource(img: OcrInput): HTMLCanvasElement | Blob {
  if (img instanceof Blob) return img;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const data = img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data);
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data), img.width, img.height), 0, 0);
  return canvas;
}

/**
 * The Tesseract worker. Worker and core are self-hosted. The English traineddata still comes from
 * tesseract.js's default CDN (jsDelivr) because eng.traineddata.gz is not in the project's
 * dependencies; the service worker caches it after the first online start (see vite.config.ts).
 */
export class TesseractEngine implements OcrEngine {
  private worker: Worker | null = null;
  private starting: Promise<void> | null = null;
  private disposed = false;

  init(): Promise<void> {
    if (this.worker) return Promise.resolve();
    if (this.starting) return this.starting;
    this.disposed = false;
    this.starting = (async () => {
      try {
        const { createWorker } = await import('tesseract.js');
        const paths = tesseractPaths(window.location.origin, import.meta.env.BASE_URL ?? '/');
        const worker = await createWorker('eng', undefined, { ...paths });
        if (this.disposed) {
          worker.terminate().catch(() => {});
          return;
        }
        this.worker = worker;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  async read(img: OcrInput, opts: OcrReadOptions = {}): Promise<OcrReadResult> {
    const worker = this.worker;
    if (!worker) throw new Error('OCR engine is not ready');
    const mode = opts.mode ?? 'block';
    await worker.setParameters({
      tessedit_pageseg_mode: (mode === 'sparse' ? '11' : '6') as never,
      // 'free' (whole photos) reads without restricting the characters.
      tessedit_char_whitelist: mode === 'free' ? '' : WHITELIST,
    });
    const result = await worker.recognize(toCanvasSource(img));
    return { text: result.data.text ?? '', confidence: result.data.confidence ?? 0 };
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate().catch(() => {});
    this.worker = null;
  }
}
