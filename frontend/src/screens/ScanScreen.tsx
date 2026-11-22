import React, { useState, useRef, useEffect } from 'react';
import { Button, OfflinePill } from '../components';
import { repository } from '../data/repository';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface ScanScreenProps {
  onScanResult: (detectedCode: string) => void;
  onClose: () => void;
  onTypeInstead?: () => void;
}

/**
 * Extracts potential NAFDAC registration numbers from OCR text.
 * Covers all valid Nigerian registry formats without artificial prefix restrictions:
 * - Hyphenated e.g. 04-0023, A8-101168L, B1-3599, A4-1070, A11-1222, 01-0022
 * - Slashes e.g. 04/0023, A8/101168L
 * - Spaced e.g. A8 101168L, 04 0023
 * - Continuous alphanumeric e.g. A8101168L, 040023
 * - Following labels: NAFDAC NO, NRN, REG NO
 */
export function extractNafdacCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];

  // Pattern 1: Explicit NAFDAC / REG prefix context
  const labeledMatches = text.matchAll(/(?:NAFDAC|REG|NRN)[^A-Za-z0-9]*([A-Za-z0-9]{1,4}[-/ ]?[0-9]{3,8}[A-Za-z]?)/gi);
  for (const m of labeledMatches) {
    const raw = m[1].replace(/[\s/]/g, '-').toUpperCase();
    if (/\d/.test(raw) && raw.length >= 4) {
      candidates.push(raw);
    }
  }

  // Pattern 2: Standard alphanumeric code with hyphen or slash (e.g. 04-0023, A8-101902L, A11-1222)
  const standardMatches = text.matchAll(/\b([A-Za-z0-9]{1,4})[-/ ]([0-9]{3,8}[A-Za-z]?)\b/gi);
  for (const m of standardMatches) {
    const code = `${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
    if (/\d/.test(code)) {
      candidates.push(code);
    }
  }

  // Pattern 3: Standalone alphanumeric tokens with 5 to 14 characters containing digits
  const tokens = text.split(/[\s,;:|()\[\]]+/);
  for (const token of tokens) {
    const clean = token.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    // Must contain at least 3 digits and be 5-14 chars
    const digitCount = (clean.match(/\d/g) || []).length;
    if (clean.length >= 5 && clean.length <= 14 && digitCount >= 3) {
      candidates.push(clean);
    }
  }

  return Array.from(new Set(candidates));
}

export const ScanScreen: React.FC<ScanScreenProps> = ({
  onScanResult,
  onClose,
  onTypeInstead,
}) => {
  const isOnline = useOnlineStatus();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [detectedCode, setDetectedCode] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isOcrReady, setIsOcrReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    repository.getCatalogMeta().then((meta) => {
      setTotalCount(meta.count);
    });

    startCamera();
    initTesseract();

    return () => {
      stopCamera();
      if (workerRef.current) {
        workerRef.current.terminate().catch(() => {});
        workerRef.current = null;
      }
    };
  }, []);

  const initTesseract = async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      // Full character set without restrictive whitelisting so dashes and labels are preserved
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any, // Assume a single uniform block of text
      });
      workerRef.current = worker;
      setIsOcrReady(true);
    } catch (err) {
      console.warn('Tesseract OCR worker initialization error:', err);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        return;
      }

      let stream: MediaStream;
      try {
        // Try high-resolution back camera first
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        // Fallback to any default camera available
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }

      streamRef.current = stream;
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Perform OCR on an image source (from video capture or uploaded file)
  const performOcr = async (sourceCanvas: HTMLCanvasElement) => {
    setIsScanning(true);
    setStatusMessage('Reading pack label…');

    try {
      if (!workerRef.current) {
        // Fallback init worker if not ready yet
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_pageseg_mode: '6' as any,
        });
        workerRef.current = worker;
        setIsOcrReady(true);
      }

      const ret = await workerRef.current.recognize(sourceCanvas);
      const rawText = ret?.data?.text?.trim() || '';
      console.info('OCR text detected:', rawText);

      const candidates = extractNafdacCandidates(rawText);

      if (candidates.length > 0) {
        // Try finding a direct registry match among candidates
        let matchedCode: string | null = null;
        for (const candidate of candidates) {
          const lookup = await repository.lookupReg(candidate);
          if (lookup.result === 'match' && lookup.products.length > 0) {
            matchedCode = lookup.products[0].nafdac_reg_num;
            break;
          }
        }

        const finalCode = matchedCode || candidates[0];
        setDetectedCode(finalCode);
        setStatusMessage(`Detected ${finalCode}`);

        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(50);
          } catch {
            // ignore
          }
        }

        // Trigger result navigation immediately
        onScanResult(finalCode);
        return;
      }

      setStatusMessage('Could not read number clearly. Hold closer or type it below.');
    } catch (err) {
      console.warn('OCR scan error:', err);
      setStatusMessage('Scan failed. Please type the number or try another photo.');
    } finally {
      setIsScanning(false);
    }
  };

  // User explicitly clicks "Scan Label" to capture the live frame and OCR it
  const handleCaptureAndScan = () => {
    if (isScanning) return;

    if (!videoRef.current) {
      fileInputRef.current?.click();
      return;
    }

    const video = videoRef.current;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    canvas.width = vw;
    canvas.height = vh;

    // Draw full natural video frame
    ctx.drawImage(video, 0, 0, vw, vh);

    // Save snapshot preview
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.8));

    performOcr(canvas);
  };

  // Handle uploaded or native camera photo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      const src = loadEvent.target?.result as string;
      setCapturedImage(src);
      img.onload = () => {
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        performOcr(canvas);
      };
      img.src = src;
    };

    reader.readAsDataURL(file);
  };

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
        <button
          type="button"
          className="rb"
          aria-label="Back"
          onClick={onClose}
        >
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
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
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

          {/* Captured snapshot overlay while OCR runs */}
          {capturedImage && isScanning && (
            <img
              src={capturedImage}
              alt="Captured frame"
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
          )}

          {/* Animated Laser Scanning Line while recognizing */}
          {isScanning && (
            <div className="scan-laser" aria-hidden="true" />
          )}

          {/* Center Target Crosshairs / Alignment Guides */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-64 h-32 border-2 border-white/50 rounded-lg flex items-center justify-center bg-black/15 shadow-sm">
              <span className="text-[11px] font-mono text-white uppercase tracking-widest font-bold">
                {isScanning ? 'READING LABEL…' : 'ALIGN NAFDAC NO.'}
              </span>
            </div>
          </div>
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
        {statusMessage ? (
          <p className="text-xs font-bold text-center text-ink px-2">{statusMessage}</p>
        ) : (
          <p>Align the NAFDAC number inside the box and tap Scan Label.</p>
        )}

        {/* Primary Action Button: Scan Label (Active, not disabled!) */}
        <Button
          label={isScanning ? 'Reading label…' : 'Scan Label'}
          width="full"
          tone="primary"
          disabled={isScanning}
          onClick={handleCaptureAndScan}
        />

        {/* Secondary Actions: Upload Photo / Type Instead */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            label="Upload photo"
            tone="secondary"
            onClick={() => fileInputRef.current?.click()}
          />
          <Button
            label="Type it instead"
            tone="ghost"
            onClick={onTypeInstead || onClose}
          />
        </div>
      </div>
    </div>
  );
};
