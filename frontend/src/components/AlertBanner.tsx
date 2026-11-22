import React, { useState, useEffect, useRef } from 'react';
import { SafetyAlert } from '../types';

export interface AlertBannerProps {
  alerts?: SafetyAlert[];
  headline?: string;
  meta?: string;
  onClick?: () => void;
  onClickAlert?: (alert: SafetyAlert) => void;
  autoScrollInterval?: number; // default: 3000ms
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  headline,
  meta,
  onClick,
  onClickAlert,
  autoScrollInterval = 3000,
  className = '',
}) => {
  // Normalize items and sort by most recent issued_date descending
  const rawItems: SafetyAlert[] =
    alerts && alerts.length > 0
      ? alerts
      : headline
      ? [
          {
            id: 'legacy-1',
            alert_reference_no: 'NAFDAC-ALERT',
            product_name: headline,
            summary: headline,
            issued_date: meta || '',
            official_source_url: 'https://nafdac.gov.ng',
          },
        ]
      : [];

  const items: SafetyAlert[] = [...rawItems].sort(
    (a, b) => new Date(b.issued_date || 0).getTime() - new Date(a.issued_date || 0).getTime()
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // If there are no alerts, don't show the section at all (cleanly hidden)
  if (items.length === 0) {
    return null;
  }

  // Bound index safely
  const activeAlert = items[currentIndex % items.length];
  const hasMultiple = items.length > 1;

  // Auto-scroll effect
  useEffect(() => {
    if (!hasMultiple || isPaused || isExpanded) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, autoScrollInterval);

    return () => clearInterval(timer);
  }, [hasMultiple, isPaused, isExpanded, items.length, autoScrollInterval]);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  // Universal touch & pointer swipe gesture handlers (left = next, right = prev)
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    const touch = e.touches?.[0];
    if (touch) {
      touchStartXRef.current = touch.clientX;
      touchStartYRef.current = touch.clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const touch = e.changedTouches?.[0];
    if (!touch) return;

    const endX = touch.clientX;
    const endY = touch.clientY;
    const diffX = touchStartXRef.current - endX;
    const diffY = touchStartYRef.current - endY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
      if (diffX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const diffX = touchStartXRef.current - e.clientX;
    const diffY = touchStartYRef.current - e.clientY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
      if (diffX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handleCardClick = () => {
    if (onClickAlert) {
      onClickAlert(activeAlert);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`ca-alert-carousel relative overflow-hidden bg-alert-bg border-w border-alert rounded-lg p-3.5 text-alert transition-all duration-300 shadow-sm select-none ${className}`}
      style={{ touchAction: 'pan-y' }}
      role="region"
      aria-label="NAFDAC Public Safety Alerts"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-none text-alert" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5l9.5 16.5h-19z" />
              <path d="M12 10v4.5M12 17.2v.1" />
            </svg>
          </span>
          <span className="font-mono font-bold text-[11px] tracking-wider uppercase text-alert truncate">
            NAFDAC PUBLIC ALERT
          </span>
        </div>

        {/* Carousel pagination indicator & arrows if multi-alert */}
        {hasMultiple && (
          <div className="flex items-center gap-1.5 flex-none" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-[10px] font-bold text-alert opacity-80 mr-0.5">
              {currentIndex + 1}/{items.length}
            </span>
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded-full border-thin border-alert bg-[#a8200f]/15 hover:bg-[#a8200f]/30 text-alert transition-colors"
              onClick={handlePrev}
              aria-label="Previous alert"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded-full border-thin border-alert bg-[#a8200f]/15 hover:bg-[#a8200f]/30 text-alert transition-colors"
              onClick={handleNext}
              aria-label="Next alert"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Main Alert Body */}
      <div className="pl-6.5">
        {/* Truncated or expanded headline/summary */}
        <p
          className={`font-body font-bold text-[13.5px] leading-snug text-ink transition-all ${
            isExpanded ? '' : 'line-clamp-2'
          }`}
          style={
            !isExpanded
              ? {
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }
              : undefined
          }
        >
          {activeAlert.summary || activeAlert.title || activeAlert.product_name}
        </p>

        {/* Controls Row: Read more button & Meta */}
        <div className="flex items-center justify-between gap-3 mt-1.5 pt-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="font-body font-bold text-[12px] text-alert underline hover:opacity-80 transition-opacity cursor-pointer p-0 bg-transparent border-0"
              onClick={handleToggleExpand}
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Read less' : 'Read more'}
            </button>

            {isExpanded && (
              <button
                type="button"
                className="font-body font-bold text-[12px] text-ink hover:underline transition-opacity cursor-pointer p-0 bg-transparent border-0"
                onClick={handleCardClick}
              >
                View full notice →
              </button>
            )}
          </div>

          <span className="text-[11px] font-medium text-alert opacity-90 truncate">
            {activeAlert.issued_date ? `Issued ${activeAlert.issued_date}` : 'nafdac.gov.ng'}
          </span>
        </div>

        {/* Multi-alert indicator dots (cleanly visible without separating border line) */}
        {hasMultiple && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {items.map((_, idx) => (
              <button
                key={`dot-${idx}`}
                type="button"
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === currentIndex % items.length
                    ? 'w-5 bg-alert'
                    : 'w-1.5 bg-[#A8200F]/55 border border-[#A8200F]/90 hover:bg-alert'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                aria-label={`Jump to alert slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
