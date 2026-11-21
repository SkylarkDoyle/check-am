import React, { useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { BottomSheet } from './BottomSheet';

export interface InstallBannerProps {
  className?: string;
  onInstallSuccess?: () => void;
}

export const InstallBanner: React.FC<InstallBannerProps> = ({
  className = '',
  onInstallSuccess,
}) => {
  const { canInstall, isInstalled, isDismissed, isIos, promptInstall, dismiss } = usePwaInstall();
  const [showIosSheet, setShowIosSheet] = useState(false);

  // If already installed, cannot install, or dismissed by user, do not render
  if (isInstalled || !canInstall || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      onInstallSuccess?.();
    } else if (outcome === 'ios') {
      setShowIosSheet(true);
    }
  };

  return (
    <>
      <div
        className={`bg-surface border-2 border-line rounded-lg p-3.5 shadow-card flex items-center justify-between gap-3 ${className}`}
        role="region"
        aria-label="App installation banner"
      >
        {/* App Icon */}
        <div className="w-10 h-10 rounded-md bg-accent text-on-accent flex items-center justify-center flex-none shadow-sm">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-black text-ink text-sm leading-tight truncate">
            Install CheckAm app
          </h3>
          <p className="text-xs text-ink-muted leading-tight mt-0.5 truncate">
            Fast, 1-tap pack check. Works offline.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-none">
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 bg-accent text-on-accent rounded-full text-xs font-bold shadow-sm hover:opacity-95 active:scale-95 transition-transform"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install banner"
            className="w-7 h-7 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-surface-alt transition-colors"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* iOS Safari Installation Instructions Sheet */}
      {isIos && (
        <BottomSheet
          isOpen={showIosSheet}
          onClose={() => setShowIosSheet(false)}
          title="Add CheckAm to Home Screen"
        >
          <div className="flex flex-col gap-4 py-2 text-ink">
            <p className="text-sm text-ink-muted">
              To install CheckAm on your iPhone or iPad, follow these simple steps in Safari:
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">1</span>
                <div className="text-sm">
                  Tap the <strong className="font-bold">Share</strong> button in Safari's bottom toolbar.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">2</span>
                <div className="text-sm">
                  Scroll down the share sheet and tap <strong className="font-bold">Add to Home Screen</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">3</span>
                <div className="text-sm">
                  Tap <strong className="font-bold">Add</strong> in the top right corner. CheckAm will appear as an app on your screen!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosSheet(false)}
              className="mt-2 w-full py-2.5 bg-accent text-on-accent font-bold rounded-full text-sm"
            >
              Got it
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
};
