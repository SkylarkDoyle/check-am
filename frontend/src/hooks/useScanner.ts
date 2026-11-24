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
  ScanSession,
  SuggestReason,
  TesseractEngine,
  computeCropRect,
  decisionToOutcome,
  isBlurry,
  logScan,
  readLiveCrop,
  readPhoto,
  toRecognizeFn,
} from '../lib/ocr';

const TICK_MS = 700;
const HINT_CLOSER_MS = 8000;
const HINT_GIVE_UP_MS = 20000;
const MAX_CROP_WIDTH = 1600;
/** The crop covers the aiming box plus this much margin on every side. */
const CROP_PAD = 0.35;
/** After this many blurry frames in a row, read anyway so a phone that never gets sharp still tries. */
const MAX_BLURRY_IN_A_ROW = 5;

export type CameraState = 'pending' | 'ready' | 'denied' | 'unsupported';

export interface Suggestion {
  code: string;
  reason: SuggestReason;
}

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

/** Camera, reader, scan loop and result events. The screen only presents what this returns. */
export function useScanner({ onScanResult, createEngine }: UseScannerOptions) {
  const [camera, setCamera] = useState<CameraState>('pending');
  const [engineState, setEngineState] = useState<ScanDiagnostics['engine']>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [autoCode, setAutoCode] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [torch, setTorch] = useState({ supported: false, on: false });
  /** Real (optical or sensor) zoom, only where the camera reports it. Digital zoom would just blur. */
  const [zoom, setZoom] = useState<{ supported: boolean; min: number; max: number; step: number; value: number }>({
    supported: false, min: 1, max: 1, step: 0.1, value: 1,
  });
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics>(EMPTY_DIAGNOSTICS);

  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<OcrEngine | null>(null);
  const engineGen = useRef(0);
  const indexRef = useRef<RegistryIndex | null>(null);
  const confirmerRef = useRef<ScanConfirmer>(new ScanConfirmer(null));
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
      const z = caps.zoom as { min: number; max: number; step?: number } | undefined;
      if (z && z.max > z.min) {
        const cur = Number((track.getSettings?.() as { zoom?: number })?.zoom ?? z.min);
        setZoom({ supported: true, min: z.min, max: z.max, step: z.step || 0.1, value: cur });
      }
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

  const changeZoom = useCallback(async (dir: 1 | -1) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setZoom((prev) => {
      if (!prev.supported) return prev;
      const span = prev.max - prev.min;
      const next = Math.min(prev.max, Math.max(prev.min, prev.value + dir * Math.max(prev.step, span / 6)));
      track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] }).catch(() => {});
      return { ...prev, value: next };
    });
  }, []);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- results ------------------------------------------------------------------------------
  const finishAuto = useCallback((code: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setAutoCode(code);
    setStatusMessage(`Detected ${code}`);
    haptic('scanHit');
    // Let the "Got it!" bubble be seen before moving on.
    setTimeout(() => onResultRef.current(code), 800);
  }, []);

  const offerSuggestion = useCallback((s: Suggestion) => {
    setSuggestion(s);
    setStatusMessage('');
    haptic('scanHit');
  }, []);

  /** The user tapped Check. A normal registry lookup runs; the typed text is never altered. */
  const confirmSuggestion = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean || doneRef.current) return;
    doneRef.current = true;
    onResultRef.current(clean);
  }, []);

  /** Throw the suggestion away and keep scanning. */
  const dismissSuggestion = useCallback(() => {
    confirmerRef.current.reset();
    setSuggestion(null);
    setStatusMessage('');
  }, []);

  // ---- the hands-free loop ------------------------------------------------------------------
  const grabAimedCrop = useCallback((): Pixels | null => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video || !guide || video.readyState < 2 || !video.videoWidth) return null;
    const v = video.getBoundingClientRect();
    const g = guide.getBoundingClientRect();
    const rect = computeCropRect(
      { w: video.videoWidth, h: video.videoHeight },
      { w: v.width, h: v.height },
      { x: g.left - v.left, y: g.top - v.top, w: g.width, h: g.height },
      CROP_PAD
    );
    const scale = Math.min(1, MAX_CROP_WIDTH / rect.w);
    const w = Math.max(1, Math.round(rect.w * scale));
    const h = Math.max(1, Math.round(rect.h * scale));
    const canvas = frameCanvasRef.current ?? (frameCanvasRef.current = document.createElement('canvas'));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const cam = diagRef.current.camera;
    if (!cam || cam.width !== video.videoWidth || cam.height !== video.videoHeight) {
      patchDiag({ camera: { width: video.videoWidth, height: video.videoHeight } });
    }
    return { width: w, height: h, data: img.data };
  }, [patchDiag]);

  const paused = autoCode !== null || suggestion !== null || isReadingPhoto;

  useEffect(() => {
    if (camera !== 'ready' || engineState !== 'ready' || paused) return;
    const engine = engineRef.current;
    if (!engine) return;
    const recognize = toRecognizeFn(engine);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let blurryRun = 0;
    const startedAt = Date.now();
    setStatusMessage('');

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      if (!document.hidden) {
        try {
          const crop = grabAimedCrop();
          if (crop && isBlurry(crop) && blurryRun < MAX_BLURRY_IN_A_ROW) {
            blurryRun++;
            patchDiag({ skippedBlurry: diagRef.current.skippedBlurry + 1 });
          } else if (crop) {
            blurryRun = 0;
            const t0 = performance.now();
            const { text, enhanced } = await readLiveCrop(crop, recognize);
            const ms = performance.now() - t0;
            if (cancelled) return;
            const step = confirmerRef.current.ingest(text);
            patchDiag({
              frame: { width: crop.width, height: crop.height },
              lastText: text,
              candidates: step.candidates,
              matched: step.matched,
              lastReadMs: ms,
              reads: diagRef.current.reads + 1,
              usedEnhanced: enhanced,
            });
            logScan('read', diagRef.current);
            if (step.outcome.action === 'auto') {
              finishAuto(step.outcome.code);
              return;
            }
            if (step.outcome.action === 'suggest') {
              offerSuggestion({ code: step.outcome.code, reason: step.outcome.reason });
              return;
            }
          }
        } catch (err) {
          console.warn('Scan frame failed', err);
        }
        const waited = Date.now() - startedAt;
        if (waited > HINT_GIVE_UP_MS) {
          const guess = confirmerRef.current.bestGuess();
          if (guess.action === 'suggest') {
            offerSuggestion({ code: guess.code, reason: guess.reason });
            return;
          }
          setStatusMessage('Still nothing. Try more light, or type the number instead.');
        } else if (waited > HINT_CLOSER_MS) {
          setStatusMessage('Move closer so the number fills the box, and hold steady.');
        }
      }
      if (!cancelled && !doneRef.current) timer = setTimeout(tick, TICK_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [camera, engineState, paused, grabAimedCrop, patchDiag, finishAuto, offerSuggestion]);

  // ---- one sharp still photo: taken from the live camera, or from the phone's own camera app --
  const readBlob = useCallback(
    async (blob: Blob) => {
      if (doneRef.current) return;
      const previewUrl = URL.createObjectURL(blob);
      setCapturedImage((old) => {
        if (old) URL.revokeObjectURL(old);
        return previewUrl;
      });
      confirmerRef.current.reset();
      setIsReadingPhoto(true);
      setSuggestion(null);
      setStatusMessage('Reading the photo…');
      try {
        if (engineRef.current === null || engineState !== 'ready') await startEngine();
        const engine = engineRef.current;
        if (!engine) throw new Error('no engine');
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 2000 / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const full: Pixels = {
          width: canvas.width,
          height: canvas.height,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        };
        // A still photo cannot be re-read like live frames, so different passes over the same
        // picture have to agree (the same two-reads rule as the camera).
        const decision = await readPhoto(full, toRecognizeFn(engine), new ScanSession(indexRef.current));
        if (decision) {
          const outcome = decisionToOutcome(decision);
          if (outcome.action === 'auto') finishAuto(outcome.code);
          else if (outcome.action === 'suggest') offerSuggestion({ code: outcome.code, reason: outcome.reason });
          return;
        }
        // Nothing certain: still hand the person the bubble with the best guess (or an empty box)
        // so they can type or pick a suggestion instead of starting over.
        const guess = confirmerRef.current.bestGuess();
        if (guess.action === 'suggest') {
          offerSuggestion({ code: guess.code, reason: guess.reason });
        } else {
          setStatusMessage('Could not find a NAFDAC number in that photo. Try a closer, sharper one, or type it.');
        }
      } catch (err) {
        console.warn('Photo read failed', err);
        setStatusMessage('Could not read that photo. Please type the number instead.');
      } finally {
        setIsReadingPhoto(false);
      }
    },
    [engineState, startEngine, finishAuto, offerSuggestion]
  );

  /** A file from the phone's own camera app (or the gallery). Read straight away, no extra step. */
  const readPhotoFile = useCallback((file: File) => readBlob(file), [readBlob]);

  /**
   * Take a still from the live camera and read it. Uses the camera's full-resolution, autofocused
   * photo where the browser supports it (much sharper than a video frame), else the full video frame.
   * Returns false when there is no live camera, so the screen can open the phone's camera app.
   */
  const takePhoto = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (camera !== 'ready' || !video || !track) return false;
    haptic('scanHit');
    try {
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
      if (IC) {
        const blob = await new IC(track).takePhoto();
        await readBlob(blob);
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
    await readBlob(blob);
    return true;
  }, [camera, readBlob]);

  return {
    videoRef,
    guideRef,
    camera,
    engineState,
    statusMessage,
    autoCode,
    suggestion,
    totalCount,
    torch,
    zoom,
    changeZoom,
    isReadingPhoto,
    capturedImage,
    diagnostics,
    scanning: camera === 'ready' && engineState === 'ready' && !paused,
    toggleTorch,
    retryEngine: startEngine,
    findClose: (code: string) => indexRef.current?.closest(code, 3) ?? [],
    confirmSuggestion,
    dismissSuggestion,
    readPhotoFile,
    takePhoto,
  };
}
