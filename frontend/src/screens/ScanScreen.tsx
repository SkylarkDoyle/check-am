import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Worker } from 'tesseract.js';
import { Button, OfflinePill } from '../components';
import { repository } from '../data/repository';
import { db } from '../db';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { haptic } from '../lib/haptics';
import {
  Pixels,
  ReadMode,
  RegistryIndex,
  ScanSession,
  computeCropRect,
  readCrop,
  readPhoto,
} from '../lib/ocr';

interface ScanScreenProps {
  onScanResult: (detectedCode: string) => void;
  onClose: () => void;
  onTypeInstead?: () => void;
}

/** One read about every 0.7 s while the screen is open. No button, no photo to take. */
const TICK_MS = 700;
const HINT_CLOSER_MS = 8000;
const HINT_GIVE_UP_MS = 20000;
const MAX_CROP_WIDTH = 1600;
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. ';

/** Registered numbers on this phone, so a misread character can be repaired against them. */
async function loadRegistryIndex(): Promise<RegistryIndex | null> {
  try {
    const regs = (await db.products.orderBy('nafdac_reg_num').uniqueKeys()).map(String);
    return regs.length > 0 ? new RegistryIndex(regs) : null;
  } catch {
    return null;
  }
}

function pixelsToCanvas(p: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return canvas;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({ onScanResult, onClose, onTypeInstead }) => {
  const isOnline = useOnlineStatus();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [detectedCode, setDetectedCode] = useState<string>('');
  const [engineReady, setEngineReady] = useState(false);
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [torch, setTorch] = useState({ supported: false, on: false });

  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const indexRef = useRef<RegistryIndex | null>(null);
  const sessionRef = useRef<ScanSession>(new ScanSession(null));
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- setup and teardown -------------------------------------------------------------------
  useEffect(() => {
    // React dev mode mounts twice; the flag must start false on every mount.
    doneRef.current = false;
    repository.getCatalogMeta().then((meta) => setTotalCount(meta.count));
    loadRegistryIndex().then((index) => {
      indexRef.current = index;
      sessionRef.current = new ScanSession(index);
    });
    startCamera();
    initEngine();

    return () => {
      doneRef.current = true;
      stopCamera();
      workerRef.current?.terminate().catch(() => {});
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initEngine = async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      if (doneRef.current) {
        worker.terminate().catch(() => {});
        return;
      }
      workerRef.current = worker;
      setEngineReady(true);
    } catch (err) {
      console.warn('Text reader failed to start', err);
      setStatusMessage('The reader could not start. Upload a photo or type the number instead.');
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setHasPermission(false);
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;

      // Keep the picture sharp while the phone moves, and offer the torch where the phone has one.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
      }
      setTorch({ supported: Boolean(caps.torch), on: false });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setHasPermission(true);
    } catch {
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  // ---- reading ------------------------------------------------------------------------------
  const recognize = useCallback(async (image: Pixels, mode: ReadMode): Promise<string> => {
    const worker = workerRef.current;
    if (!worker) return '';
    await worker.setParameters({
      tessedit_pageseg_mode: (mode === 'sparse' ? '11' : '6') as never,
      // 'free' (whole photos) reads without restricting the characters.
      tessedit_char_whitelist: mode === 'free' ? '' : WHITELIST,
    });
    const result = await worker.recognize(pixelsToCanvas(image));
    return result.data.text ?? '';
  }, []);

  /** The part of the live frame inside the on-screen box (plus a little margin), as pixels. */
  const grabAimedCrop = useCallback((): Pixels | null => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video || !guide || video.readyState < 2 || !video.videoWidth) return null;

    const v = video.getBoundingClientRect();
    const g = guide.getBoundingClientRect();
    const rect = computeCropRect(
      { w: video.videoWidth, h: video.videoHeight },
      { w: v.width, h: v.height },
      { x: g.left - v.left, y: g.top - v.top, w: g.width, h: g.height }
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
    return { width: w, height: h, data: img.data };
  }, []);

  const finish = useCallback(
    (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setDetectedCode(code);
      setStatusMessage(`Detected ${code}`);
      haptic('scanHit');
      // Let the "Got it!" bubble be seen before moving on.
      setTimeout(() => onScanResult(code), 800);
    },
    [onScanResult]
  );

  // The hands-free loop: starts when both the camera and the reader are ready.
  useEffect(() => {
    if (hasPermission !== true || !engineReady) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setStatusMessage('');

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      if (!document.hidden) {
        try {
          const crop = grabAimedCrop();
          if (crop) {
            const text = await readCrop(crop, recognize);
            const decision = sessionRef.current.ingest(text);
            if (decision && !cancelled) {
              finish(decision.code);
              return;
            }
          }
        } catch (err) {
          console.warn('Scan frame failed', err);
        }
        const waited = Date.now() - startedAt;
        setStatusMessage(
          waited > HINT_GIVE_UP_MS
            ? 'Still nothing. Try more light, or type the number instead.'
            : waited > HINT_CLOSER_MS
            ? 'Move closer so the number fills the box, and hold steady.'
            : ''
        );
      }
      if (!cancelled && !doneRef.current) timer = setTimeout(tick, TICK_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasPermission, engineReady, grabAimedCrop, recognize, finish]);

  // A photo from the gallery or the phone's own camera: try the whole picture, then bands of it.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const src = loadEvent.target?.result as string;
      setCapturedImage(src);
      const img = new Image();
      img.onload = async () => {
        setIsReadingPhoto(true);
        setStatusMessage('Reading the photo…');
        try {
          if (!workerRef.current) await initEngine();
          const scale = Math.min(1, 2000 / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('no canvas');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const full: Pixels = {
            width: canvas.width,
            height: canvas.height,
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
          // A still photo cannot be re-read like live frames, so different passes over the same
          // picture have to agree (the same two-reads rule as the camera).
          const decision = await readPhoto(full, recognize, new ScanSession(indexRef.current));
          if (decision) {
            finish(decision.code);
            return;
          }
          setStatusMessage('Could not find a NAFDAC number in that photo. Try a closer, sharper one, or type it.');
        } catch (err) {
          console.warn('Photo read failed', err);
          setStatusMessage('Could not read that photo. Please type the number instead.');
        } finally {
          setIsReadingPhoto(false);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const scanning = hasPermission === true && engineReady && !detectedCode;

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-8 pt-2">
      {/* Hidden file input for photo snap or gallery upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top action bar */}
      <div className="bar">
        <button type="button" className="rb" aria-label="Back" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <b>Scan a label</b>
        <span style={{ width: 44 }} aria-hidden="true"></span>
      </div>

      {/* Main Viewfinder Card (.cam) */}
      <div className="cam relative" style={{ overflow: 'visible' }}>
        {!isOnline && (
          <span className="pill">
            <OfflinePill state="offline" productCount={totalCount} />
          </span>
        )}

        {/* Video / Camera layer with rounded corners */}
        <div className="absolute inset-0 rounded-[28px] overflow-hidden bg-camera">
          {hasPermission !== false ? (
            <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
          ) : (
            /* Viewfinder fallback when camera permission is unavailable */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-on-camera">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 mb-3 text-surface">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <p className="font-bold text-base mb-1.5">Camera not accessible</p>
              <p className="text-xs text-white/80 max-w-[260px] mb-4">
                You can take or upload a photo of the pack label directly from your phone.
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-surface text-ink font-bold text-xs rounded-pill shadow-md hover:bg-surface-alt transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose or Take Photo
              </button>
            </div>
          )}

          {/* Photo overlay while a gallery photo is read */}
          {capturedImage && isReadingPhoto && (
            <img src={capturedImage} alt="Photo being read" className="absolute inset-0 w-full h-full object-cover opacity-90" />
          )}

          {/* Animated laser line while the reader is working */}
          {(scanning || isReadingPhoto) && <div className="scan-laser" aria-hidden="true" />}

          {/* Alignment guide: the number inside this box is what gets read */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div
              ref={guideRef}
              className="w-64 h-32 border-2 border-white/50 rounded-lg flex items-center justify-center bg-black/15 shadow-sm"
            >
              <span className="text-[11px] font-mono text-white uppercase tracking-widest font-bold">
                {detectedCode ? 'GOT IT' : scanning || isReadingPhoto ? 'READING…' : 'ALIGN NAFDAC NO.'}
              </span>
            </div>
          </div>

          {/* Torch, where the phone has one */}
          {torch.supported && hasPermission && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torch.on}
              aria-label={torch.on ? 'Turn the light off' : 'Turn the light on'}
              className="absolute right-3 top-3 z-20 w-11 h-11 rounded-full border-thin border-white/70 bg-black/35 text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill={torch.on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
              </svg>
            </button>
          )}
        </div>

        {/* 4 Corner reticle brackets (.cb) */}
        <span className="cb" style={{ left: '16px', top: '70px', borderRight: 0, borderBottom: 0 }}></span>
        <span className="cb" style={{ right: '16px', top: '70px', borderLeft: 0, borderBottom: 0 }}></span>
        <span className="cb" style={{ left: '16px', bottom: '60px', borderRight: 0, borderTop: 0 }}></span>
        <span className="cb" style={{ right: '16px', bottom: '60px', borderLeft: 0, borderTop: 0 }}></span>

        {/* Recognition Speech Bubble - Positioned ON TOP over viewfinder */}
        {detectedCode && (
          <div
            className="bub bub-pop cursor-pointer hover:scale-105 active:scale-95 transition-transform z-30"
            onClick={() => onScanResult(detectedCode)}
            role="button"
            aria-label={`Detected code ${detectedCode}. Tap to verify.`}
          >
            Got it! <span>{detectedCode}</span>
          </div>
        )}
      </div>

      {/* Lower controls (.low) */}
      <div className="low flex flex-col gap-3">
        <p
          className={statusMessage ? 'text-xs font-bold text-center text-ink px-2' : undefined}
          role="status"
          aria-live="polite"
        >
          {statusMessage ||
            (hasPermission === false
              ? 'Upload a photo of the label, or type the number.'
              : engineReady
              ? 'Hold the NAFDAC number inside the box. It reads by itself.'
              : 'Getting the reader ready…')}
        </p>

        {/* Secondary Actions: Upload Photo / Type Instead */}
        <div className="grid grid-cols-2 gap-2">
          <Button label="Upload photo" tone="secondary" onClick={() => fileInputRef.current?.click()} />
          <Button label="Type it instead" tone="ghost" onClick={onTypeInstead || onClose} />
        </div>
      </div>
    </div>
  );
};
