import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

export interface ThumbProps {
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube';
  size?: 'sm' | 'md' | 'lg' | '72';
  round?: boolean;
  imageUrl?: string;
  alt?: string;
  className?: string;
  /** What to show without a photo: a category illustration, or a plain "No image yet" note. */
  fallback?: 'illustration' | 'no-image';
}

export const Thumb: React.FC<ThumbProps> = ({
  kind = 'tin',
  size = 'md',
  round = false,
  imageUrl,
  alt = '',
  className = '',
  fallback = 'illustration',
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClass = size === 'sm' ? 'data-size="sm"' : size === 'lg' ? 'data-size="lg"' : size === '72' ? 'data-size="72"' : 'data-size="md"';
  const customStyle: React.CSSProperties = {
    ...(round ? { borderRadius: '50%' } : {}),
    ...(size === '72' ? { width: '72px', height: '72px' } : {}),
  };

  return (
    <div
      className={`ca-thumb ${className}`}
      data-kind={kind}
      data-size={size}
      style={customStyle}
      aria-hidden="true"
    >
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : fallback === 'no-image' ? (
        <div className="flex flex-col items-center justify-center gap-1 px-1 text-center text-ink-muted">
          <ImageOff
            aria-hidden="true"
            strokeWidth={2}
            style={{ width: size === 'lg' ? 28 : 18, height: size === 'lg' ? 28 : 18 }}
          />
          {size !== 'sm' && (
            <span
              className="font-bold leading-tight"
              style={{ fontSize: size === 'lg' ? 12 : 10 }}
            >
              No image yet
            </span>
          )}
        </div>
      ) : (
        <>
          {kind === 'tin' && (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" data-k="tin">
              <ellipse cx="32" cy="16" rx="16" ry="5"></ellipse>
              <path d="M16 16v32c0 3 7 5.5 16 5.5S48 51 48 48V16"></path>
              <rect x="16.8" y="26" width="30.4" height="14" fill="var(--color-accent)" stroke="none" opacity=".9"></rect>
            </svg>
          )}
          {kind === 'bottle' && (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" data-k="bottle">
              <path d="M27 6h10v8l5 7v34a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V21l5-7z"></path>
              <rect x="22.8" y="30" width="18.4" height="14" fill="var(--color-accent)" stroke="none" opacity=".9"></rect>
            </svg>
          )}
          {kind === 'sachet' && (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" data-k="sachet">
              <path d="M14 10l4 3 4-3 4 3 4-3 4 3 4-3 4 3 4-3v44l-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z"></path>
              <rect x="14" y="26" width="36" height="14" fill="var(--color-accent)" stroke="none" opacity=".9"></rect>
            </svg>
          )}
          {kind === 'tube' && (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" data-k="tube">
              <path d="M10 25l32-9 12 20-32 9z"></path>
              <path d="M42 16l4-3 8 11-3 5"></path>
              <path d="M10 25l-2 11 12 9"></path>
              <path d="M26 24l8 14" strokeWidth="5" opacity=".9" stroke="var(--color-accent)"></path>
            </svg>
          )}
        </>
      )}
    </div>
  );
};
