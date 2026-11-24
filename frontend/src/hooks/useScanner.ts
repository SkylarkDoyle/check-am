import { useCallback, useEffect, useRef, useState } from 'react';
import { repository } from '../data/repository';
import { db } from '../db';
import { haptic } from '../lib/haptics';
import {
  EMPTY_DIAGNOSTICS,
  OcrEngine,
  Pixels,
  RegistryIndex,
  ScanConfirmer,
  ScanDiagnostics,
  SuggestReason,
  TesseractEngine,
  logScan,
  readLiveCrop,
  toRecognizeFn,
} from '../lib/ocr';

/** The still is capped at this width: sharp enough for small print, light enough to read quickly. */
const MAX_STILL_WIDTH = 2400;
/** Extra margin around the dragged box when reading, as a share of the box size. */
const READ_PAD = 0.12;

export type CameraState = 'pending' | 'ready' | 'denied' | 'unsupported';
/**
 * camera: live preview and shutter. adjust: the photo with a draggable box. reading: OCR running.
 * result: the editable "Got it!" sheet.
 */
export type ScanPhase = 'camera' | 'adjust' | 'reading' | 'result';

export interface Suggestion {
  code: string;
  reason: SuggestReason;
}

/** The read area, as shares (0 to 1) of the photo's width and height. */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_BOX: CropBox = { x: 0.08, y: 0.4, w: 0.84, h: 0.16 };

export interface UseScannerOptions {
  onScanResult: (code: string) => void;
  /** Swap the reader (tests, or a future engine). */
  createEngine?: () => OcrEngine;
}

/** Registered numbers on this phone, so a misread character can be repaired against them. */
async function loadRegistryIndex(): Promise<RegistryIndex | null> {
  try {
    const regs = (await db.products.orderBy('nafdac_reg_num').uniqueKeys()).map(String);
    return regs.length > 0 ? new RegistryIndex(regs) : null;
  } catch {
    return null;
  }
}

/**
 * Take a photo, drag a box over the number, read it, confirm. There is no live scanning loop:
 * one sharp still read once is faster and more accurate than reading blurry video frames.
 * The screen only presents what this returns.
 */
export function useScanner({ onScanResult, createEngine }: UseScannerOptions) {
  const [camera, setCamera] = useState<CameraState>('pending');
  const [engineState, setEngineState] = useState<ScanDiagnostics['engine']>('idle');
  const [phase, setPhase] = useState<ScanPhase>('camera');
  const [statusMessage, setStatusMessage] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [box, setBox] = useState<CropBox>(DEFAULT_BOX);
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics>(EMPTY_DIAGNOSTICS);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<OcrEngine | null>(null);
  const engineGen = useRef(0);
  const indexRef = useRef<RegistryIndex | null>(null);
  const confirmerRef = useRef<ScanConfirmer>(new ScanConfirmer(null));
  const stillRef = useRef<HTMLCanvasElement | null>(null);
  const stillUrlRef = useRef<string | null>(null);
  const doneRef = useRef(false);
  const diagRef = useRef<ScanDiagnostics>(EMPTY_DIAGNOSTICS);
  const onResultRef = useRef(onScanResult);
  onResultRef.current = onScanResult;

  const patchDiag = useCallback((patch: Partial<ScanDiagnostics>) => {
    diagRef.current = { ...diagRef.current, ...patch };
    setDiagnostics(diagRef.current);
  }, []);

  // ---- engine -------------------------------------------------------------------------------
  const startEngine = useCallback(async () => {
    const gen = ++engineGen.current;
    engineRef.current?.dispose();
    const engine = createEngine ? createEngine() : new TesseractEngine();
    engineRef.current = engine;
    setEngineState('loading');
    patchDiag({ engine: 'loading', engineError: null });
    try {
      await engine.init();
      if (gen !== engineGen.current) return;
      setEngineState('ready');
      patchDiag({ engine: 'ready' });
      logScan('engine ready', diagRef.current);
    } catch (err) {
      if (gen !== engineGen.current) return;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Scanner engine failed to start', err);
      setEngineState('error');
      patchDiag({ engine: 'error', engineError: message });
      logScan('engine failed', diagRef.current);
    }
  }, [createEngine, patchDiag]);

  // ---- camera -------------------------------------------------------------------------------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Plain http (outside localhost) hides the camera API entirely.
      setCamera('unsupported');
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (doneRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
      }
      setTorch({ supported: Boolean(caps.torch), on: false });
      const settings = track?.getSettings?.() ?? {};
      if (settings.width && settings.height) patchDiag({ camera: { width: settings.width, height: settings.height } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCamera('ready');
      logScan('camera ready', diagRef.current);
    } catch {
      setCamera('denied');
    }
  }, [patchDiag]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }, [torch.on]);

  // ---- setup and teardown -------------------------------------------------------------------
  useEffect(() => {
    // React dev mode mounts twice; the flag must start false on every mount.
    doneRef.current = false;
    repository.getCatalogMeta().then((meta) => setTotalCount(meta.count));
    loadRegistryIndex().then((index) => {
      indexRef.current = index;
      confirmerRef.current = new ScanConfirmer(index);
    });
    startCamera();
    startEngine();
    return () => {
      doneRef.current = true;
      engineGen.current++;
      stopCamera();
      engineRef.current?.dispose();
      engineRef.current = null;
      if (stillUrlRef.current) URL.revokeObjectURL(stillUrlRef.current);
      stillUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the photo ----------------------------------------------------------------------------
  /** Put a photo (from the live camera or the phone's camera app) on screen, ready to adjust. */
  const loadStill = useCallback(
    async (blob: Blob) => {
      try {
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, MAX_STILL_WIDTH / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        stillRef.current = canvas;
        const url = await new Promise<string>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('encode'))), 'image/jpeg', 0.92)
        );
        if (stillUrlRef.current) URL.revokeObjectURL(stillUrlRef.current);
        stillUrlRef.current = url;
        setStillUrl(url);
        patchDiag({ frame: { width: canvas.width, height: canvas.height } });
        setBox(DEFAULT_BOX);
        setSuggestion(null);
        setStatusMessage('');
        setPhase('adjust');
      } catch (err) {
        console.warn('Could not open the photo', err);
        setStatusMessage('Could not open that photo. Try again, or type the number.');
      }
    },
    [patchDiag]
  );

  /**
   * Take a still from the live camera: the camera's full-resolution, autofocused photo where the
   * browser supports it, else the full video frame. False when there is no live camera, so the
   * screen can open the phone's own camera app instead.
   */
  const takePhoto = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (camera !== 'ready' || !video || !track) return false;
    haptic('scanHit');
    try {
      const IC = (
        window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }
      ).ImageCapture;
      if (IC) {
        await loadStill(await new IC(track).takePhoto());
        return true;
      }
    } catch (err) {
      console.warn('takePhoto unavailable, using a video frame', err);
    }
    if (!video.videoWidth) return false;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return false;
    await loadStill(blob);
    return true;
  }, [camera, loadStill]);

  /** A file from the phone's own camera app or gallery. It goes to the same adjust step. */
  const loadPhotoFile = useCallback((file: File) => loadStill(file), [loadStill]);

  const retake = useCallback(() => {
    setSuggestion(null);
    setStatusMessage('');
    setPhase('camera');
    // Make sure the live picture is playing again (some browsers pause a hidden video).
    const video = videoRef.current;
    if (video && streamRef.current) {
      if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, []);

  // ---- read the boxed area ------------------------------------------------------------------
  const readBox = useCallback(async () => {
    const canvas = stillRef.current;
    if (!canvas || doneRef.current) return;
    setPhase('reading');
    setStatusMessage('');
    try {
      if (!engineRef.current || engineState !== 'ready') await startEngine();
      const engine = engineRef.current;
      if (!engine) throw new Error('no engine');

      // The dragged box plus a little margin, cut from the full-resolution photo.
      const padX = box.w * READ_PAD;
      const padY = box.h * READ_PAD;
      const x0 = Math.max(0, box.x - padX);
      const y0 = Math.max(0, box.y - padY);
      const x1 = Math.min(1, box.x + box.w + padX);
      const y1 = Math.min(1, box.y + box.h + padY);
      const sx = Math.round(x0 * canvas.width);
      const sy = Math.round(y0 * canvas.height);
      const sw = Math.max(8, Math.round((x1 - x0) * canvas.width));
      const sh = Math.max(8, Math.round((y1 - y0) * canvas.height));
      const data = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(sx, sy, sw, sh);
      if (!data) throw new Error('no pixels');
      const crop: Pixels = { width: sw, height: sh, data: data.data };

      const t0 = performance.now();
      const { text, enhanced } = await readLiveCrop(crop, toRecognizeFn(engine));
      const ms = performance.now() - t0;
      confirmerRef.current.reset();
      const step = confirmerRef.current.ingest(text);
      patchDiag({
        frame: { width: sw, height: sh },
        lastText: text,
        candidates: step.candidates,
        matched: step.matched,
        lastReadMs: ms,
        reads: diagRef.current.reads + 1,
        usedEnhanced: enhanced,
      });
      logScan('read', diagRef.current);

      if (step.matched) {
        setSuggestion({ code: step.matched, reason: 'registry-match' });
      } else if (step.candidates.length > 0) {
        setSuggestion({ code: step.candidates[0], reason: 'single-read' });
      } else {
        setSuggestion({ code: '', reason: 'nothing-read' });
      }
      haptic('scanHit');
      setPhase('result');
    } catch (err) {
      console.warn('Reading the photo failed', err);
      setStatusMessage('Could not read that photo. Move the box or retake it, or type the number.');
      setPhase('adjust');
    }
  }, [box, engineState, startEngine, patchDiag]);

  /** The user tapped Check. A normal registry lookup runs; the typed text is never altered. */
  const confirmSuggestion = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean || doneRef.current) return;
    doneRef.current = true;
    onResultRef.current(clean);
  }, []);

  return {
    videoRef,
    camera,
    engineState,
    phase,
    statusMessage,
    suggestion,
    totalCount,
    torch,
    stillUrl,
    box,
    setBox,
    diagnostics,
    toggleTorch,
    retryEngine: startEngine,
    findClose: (code: string) => indexRef.current?.closest(code, 3) ?? [],
    takePhoto,
    loadPhotoFile,
    retake,
    readBox,
    confirmSuggestion,
  };
}
