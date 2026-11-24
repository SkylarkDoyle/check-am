import React, { useRef } from 'react';
import { Button, OfflinePill } from '../components';
import { ScanBubble } from '../components/scan/ScanBubble';
import { ScanDebugPanel } from '../components/scan/ScanDebugPanel';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useScanner } from '../hooks/useScanner';
import { isScanDebug } from '../lib/ocr/diagnostics';

interface ScanScreenProps {
  onScanResult: (detectedCode: string) => void;
  onClose: () => void;
  onTypeInstead?: () => void;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({ onScanResult, onClose, onTypeInstead }) => {
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debug = isScanDebug();
  const {
    videoRef,
    guideRef,
    camera,
    engineState,
    statusMessage,
    autoCode,
    suggestion,
    totalCount,
    torch,
    isReadingPhoto,
    capturedImage,
    diagnostics,
    scanning,
    toggleTorch,
    retryEngine,
    confirmSuggestion,
    dismissSuggestion,
    readPhotoFile,
    takePhoto,
    findClose,
  } = useScanner({ onScanResult });

  const hasPermission = camera === 'ready' ? true : camera === 'pending' ? null : false;
  const engineReady = engineState === 'ready';

  // Live camera: snap a sharp still and read it. No camera (or an old browser): open the phone's
  // own camera app instead; the photo it returns is read straight away.
  const handleTakePhoto = async () => {
    const done = await takePhoto();
    if (!done) fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) readPhotoFile(file);
  };

    return (
    <div className="flex flex-col min-h-screen bg-ground pb-8 pt-2">
      {/* Hidden input: opens the phone's own camera app when there is no live camera */}
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

      {debug && <ScanDebugPanel diagnostics={diagnostics} />}

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
              <p className="font-bold text-base mb-1.5">
                {camera === 'unsupported' ? 'Camera needs a secure connection' : 'Camera not accessible'}
              </p>
              <p className="text-xs text-white/80 max-w-[260px] mb-4">
                {camera === 'unsupported'
                  ? 'This page is not on https, so the browser hides the camera. Open the secure (https) address, or take a photo of the label instead.'
                  : 'You can take a photo of the pack label with your phone.'}
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-surface text-ink font-bold text-xs rounded-pill shadow-md hover:bg-surface-alt transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                Take photo
              </button>
            </div>
          )}

          {/* The photo that was just taken, shown while it is read */}
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
                {autoCode || suggestion ? 'GOT IT' : scanning || isReadingPhoto ? 'READING…' : 'ALIGN NAFDAC NO.'}
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
        {autoCode && (
          <div className="bub bub-pop z-30" role="status" aria-label={`Detected code ${autoCode}`}>
            Got it! <span>{autoCode}</span>
          </div>
        )}
        {suggestion && !autoCode && (
          <ScanBubble
            key={suggestion.code}
            code={suggestion.code}
            reason={suggestion.reason}
            findClose={findClose}
            onCheck={confirmSuggestion}
            onScanAgain={dismissSuggestion}
          />
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
              ? 'Take a photo of the label, or type the number.'
              : engineReady
              ? 'Hold the NAFDAC number inside the box. It reads by itself.'
              : 'Getting the scanner ready…')}
        </p>

        {engineState === 'loading' && camera !== 'denied' && camera !== 'unsupported' && (
          <p className="text-xs text-center text-ink-muted">Getting the scanner ready. This can take a few seconds the first time.</p>
        )}
        {engineState === 'error' && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs font-bold text-ink">The scanner could not start. Check your connection, then try again.</p>
            <Button label="Try again" tone="secondary" onClick={retryEngine} />
          </div>
        )}

        {/* Secondary Actions: Take Photo / Type Instead */}
        <div className="grid grid-cols-2 gap-2">
          <Button label="Take photo" tone="secondary" onClick={handleTakePhoto} />
          <Button label="Type it instead" tone="ghost" onClick={onTypeInstead || onClose} />
        </div>
      </div>
    </div>
  );
};
