import React, { useState, useRef, useEffect } from 'react';
import { Button, OfflinePill } from '../components';
import { repository } from '../data/repository';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface ScanScreenProps {
  onScanResult: (detectedCode: string) => void;
  onClose: () => void;
  onTypeInstead?: () => void;
}

// Valid NAFDAC regex: 2 characters (alphanumeric, e.g. 01, A4, B2, 04, A8), optional dash/space, then 4-8 alphanumeric chars with at least 3 digits
const NAFDAC_REGEX = /\b([0-9A-Z]{2})[- ]?([0-9]{4,8}[A-Z]?)\b/i;

export const ScanScreen: React.FC<ScanScreenProps> = ({
  onScanResult,
  onClose,
  onTypeInstead,
}) => {
  const isOnline = useOnlineStatus();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [detectedCode, setDetectedCode] = useState<string>('');
  const [isRecognized, setIsRecognized] = useState(false);
  const [isOcrReady, setIsOcrReady] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const lastReadRef = useRef<string | null>(null);

  useEffect(() => {
    repository.getCatalogMeta().then((meta) => {
      setTotalCount(meta.count);
    });

    startCamera();
    initTesseract();

    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
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
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-',
        tessedit_pageseg_mode: '7' as any, // Single line text mode
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setHasPermission(true);

      // Start capture loop once camera is streaming
      intervalRef.current = setInterval(processFrame, 500);
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

  // Narrow centre strip extraction, grayscale & contrast stretching
  const processFrame = async () => {
    if (isProcessingRef.current || !workerRef.current || !videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) return; // HAVE_CURRENT_DATA

    isProcessingRef.current = true;

    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // Extract centre 70% width and centre 25% height strip
      const cropW = Math.min(vw * 0.7, 720);
      const cropH = vh * 0.25;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Grayscale & contrast enhancement
      const imgData = ctx.getImageData(0, 0, cropW, cropH);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // High contrast thresholding
        const val = gray > 120 ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);

      // Perform OCR on preprocessed canvas
      const ret = await workerRef.current.recognize(canvas);
      const rawText = ret?.data?.text?.trim() || '';

      const match = rawText.match(NAFDAC_REGEX);
      if (match) {
        const candidate = `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
        // Consecutive double-read check
        if (lastReadRef.current === candidate) {
          setDetectedCode(candidate);
          setIsRecognized(true);

          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(50);
            } catch {
              // ignore
            }
          }
        } else {
          lastReadRef.current = candidate;
        }
      } else {
        lastReadRef.current = null;
      }
    } catch {
      // frame processing error caught safely
    } finally {
      isProcessingRef.current = false;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-8 pt-2">
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
        <div className="absolute inset-0 rounded-[28px] overflow-hidden">
          {hasPermission !== false && (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
          )}

          {/* Viewfinder fallback when camera unavailable */}
          {hasPermission === false && (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-camera text-on-camera">
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 mb-2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <p className="font-bold text-sm mb-1">Camera viewfinder active</p>
              <p className="text-xs text-white/70 max-w-[240px]">
                Align pack label with NAFDAC registration number inside the frame.
              </p>
            </div>
          )}

          {/* Animated Laser Scanning Line while recognizing */}
          {!isRecognized && (
            <div className="scan-laser" aria-hidden="true" />
          )}

          {/* Center Target Crosshairs / Alignment Guides */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-60 h-28 border border-white/40 rounded-lg flex items-center justify-center bg-black/10">
              <span className="text-[11px] font-mono text-white/80 uppercase tracking-widest font-bold">
                ALIGN NAFDAC NO.
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
        {isRecognized && detectedCode && (
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
      <div className="low">
        <p>Point at the NAFDAC number. I read it on your phone and never upload your photo.</p>
        <Button
          label={isRecognized ? `Check ${detectedCode}` : isOcrReady ? "Scanning label…" : "Initializing scanner…"}
          width="full"
          disabled={!isRecognized}
          onClick={() => onScanResult(detectedCode)}
        />
        <Button
          label="Type it instead"
          tone="ghost"
          onClick={onTypeInstead || onClose}
        />
      </div>
    </div>
  );
};
