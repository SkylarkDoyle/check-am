import React, { useRef } from 'react';
import { OfflinePill } from '../components';
import { CropBoxEditor } from '../components/scan/CropBoxEditor';
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

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

const roundBtn =
  'flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/75 bg-black/40 text-white';

/**
 * Scan a label: take a photo, drag the box over the NAFDAC number, read it, confirm.
 * Doop frames "Scan / Camera (shutter)", "Scan / Adjust box", "Scan / Reading", "Scan / Got it sheet".
 */
export const ScanScreen: React.FC<ScanScreenProps> = ({ onScanResult, onClose, onTypeInstead }) => {
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debug = isScanDebug();
  const {
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
    retryEngine,
    findClose,
    takePhoto,
    loadPhotoFile,
    retake,
    readBox,
    confirmSuggestion,
  } = useScanner({ onScanResult });

  const noCamera = camera === 'denied' || camera === 'unsupported';
  const showStill = phase !== 'camera' && stillUrl;

  // Live camera: snap a sharp still. No camera (or an old browser): open the phone's own camera app.
  const handleShutter = async () => {
    const done = await takePhoto();
    if (!done) fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) loadPhotoFile(file);
  };

  const back = () => (phase === 'camera' ? onClose() : retake());

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-camera text-on-camera">
      {/* Opens the phone's own camera app when there is no live camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Picture layer. The camera video stays mounted the whole time (only hidden behind the photo),
          so Retake shows the live picture again without restarting the camera. */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${showStill || noCamera ? 'invisible' : ''}`}
        />
        {showStill && (
          <CropBoxEditor imageUrl={stillUrl!} box={box} onChange={setBox} reading={phase === 'reading'} />
        )}
        {noCamera && !showStill && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-base font-bold">
              {camera === 'unsupported' ? 'Camera needs a secure connection' : 'Camera not accessible'}
            </p>
            <p className="max-w-[270px] text-xs text-white/80">
              {camera === 'unsupported'
                ? 'This page is not on https, so the browser hides the camera. Open the secure (https) address, or take a photo with your phone instead.'
                : 'Allow the camera in your browser settings, or take a photo with your phone instead.'}
            </p>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <button type="button" className={roundBtn} aria-label={phase === 'camera' ? 'Back' : 'Retake'} onClick={back}>
          <BackIcon />
        </button>
        {phase !== 'camera' && <b className="font-display text-[17px] font-black text-white">Adjust the box</b>}
        {phase === 'camera' && torch.supported && !noCamera ? (
          <button type="button" className={roundBtn} onClick={toggleTorch} aria-pressed={torch.on} aria-label={torch.on ? 'Turn the light off' : 'Turn the light on'}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill={torch.on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
            </svg>
          </button>
        ) : (
          <span className="w-11" aria-hidden="true" />
        )}
      </div>

      {phase === 'camera' && !isOnline && (
        <div className="relative z-10 mt-3 flex justify-center px-4">
          <OfflinePill state="offline" productCount={totalCount} />
        </div>
      )}

      {debug && (
        <div className="relative z-10 px-4 pt-2">
          <ScanDebugPanel diagnostics={diagnostics} />
        </div>
      )}

      {/* Camera phase: where to point it */}
      {phase === 'camera' && !noCamera && (
        <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-6">
          <div
            className="h-[74px] w-full max-w-[300px] rounded-[14px] border-[3px] border-accent"
            style={{ boxShadow: '0 0 0 3px #fff, 0 0 0 2000px rgba(8,12,7,0.45)' }}
          />
          <p className="max-w-[300px] text-center text-[15px] font-bold text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
            Put the NAFDAC number in the box, then tap the button.
          </p>
        </div>
      )}

      {(phase === 'adjust' || phase === 'reading' || phase === 'result' || noCamera) && <div className="flex-1" />}

      {/* Messages */}
      <div className="relative z-10 px-6 text-center" role="status" aria-live="polite">
        {phase === 'reading' && <p className="mb-3 text-[15px] font-bold text-white">Reading the photo…</p>}
        {phase === 'adjust' && !statusMessage && <p className="mb-3 text-[15px] font-bold text-white">Drag the box over the number.</p>}
        {statusMessage && <p className="mb-3 text-[13px] font-bold text-white">{statusMessage}</p>}
        {phase === 'camera' && engineState === 'loading' && <p className="mb-2 text-xs text-white/80">Getting the scanner ready…</p>}
        {engineState === 'error' && (
          <div className="mb-3 flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-white">The scanner could not start. Check your connection, then try again.</p>
            <button type="button" onClick={retryEngine} className="rounded-full bg-surface px-4 py-2 text-xs font-extrabold text-ink">
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {phase === 'camera' && (
        <div
          className="relative z-10 flex items-center justify-between bg-black/70 px-8 pt-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 22px)' }}
        >
          <button type="button" onClick={onTypeInstead || onClose} className="w-20 text-left text-[15px] font-extrabold text-white underline">
            Type it
          </button>
          <button
            type="button"
            onClick={handleShutter}
            aria-label="Take photo"
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white transition-transform active:scale-95"
          >
            <span className="h-[58px] w-[58px] rounded-full bg-surface" />
          </button>
          <span className="w-20" aria-hidden="true" />
        </div>
      )}

      {phase === 'adjust' && (
        <div className="relative z-10 flex gap-3 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <button type="button" onClick={retake} className="flex-1 rounded-full border-2 border-ink bg-surface py-4 text-base font-extrabold text-ink">
            Retake
          </button>
          <button
            type="button"
            onClick={readBox}
            disabled={engineState === 'loading'}
            className="flex-1 rounded-full border-2 border-ink bg-accent py-4 text-base font-extrabold text-on-accent disabled:opacity-60"
          >
            {engineState === 'loading' ? 'Getting ready…' : 'Read number'}
          </button>
        </div>
      )}
      {phase === 'reading' && <div style={{ height: 'calc(env(safe-area-inset-bottom) + 24px)' }} />}

      {/* The editable result sheet */}
      {phase === 'result' && suggestion && (
        <ScanBubble
          key={`${suggestion.code}|${suggestion.reason}`}
          code={suggestion.code}
          reason={suggestion.reason}
          findClose={findClose}
          onCheck={confirmSuggestion}
          onRetake={retake}
        />
      )}
    </div>
  );
};
