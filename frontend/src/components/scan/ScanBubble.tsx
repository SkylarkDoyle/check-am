import React, { useMemo, useState } from 'react';
import type { SuggestReason } from '../../lib/ocr/confirm';

const REASON_TEXT: Record<SuggestReason, string> = {
  'not-in-registry': 'Not found in this phone’s list yet. Fix any wrong character, then check.',
  repaired: 'Close to a registered number. Check that it is right.',
  'single-read': 'Is this the number? Fix any wrong character, then check.',
  'registry-match': 'This number is in the list on this phone. Check that it matches the pack.',
  'nothing-read': 'No number found in the box. Move the box over the number, or type it.',
};

interface ScanBubbleProps {
  code: string;
  reason: SuggestReason;
  onCheck: (code: string) => void;
  /** Registry numbers close to what is typed, for tap-to-pick chips. */
  findClose?: (code: string) => string[];
  onRetake: () => void;
}

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The editable "Got it!" sheet that slides up after a photo is read. The text is only ever a
 * suggestion: nothing is looked up until the user taps Check, and what they typed is what gets
 * looked up. Doop frame "Scan / Got it sheet".
 */
export const ScanBubble: React.FC<ScanBubbleProps> = ({ code, reason, onCheck, findClose, onRetake }) => {
  const [value, setValue] = useState(code);
  const close = useMemo(
    () => (findClose ? findClose(value).filter((c) => normalize(c) !== normalize(value)) : []),
    [findClose, value]
  );
  return (
    <div
      className="bub-pop absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 rounded-t-[28px] border-t-2 border-ink bg-surface px-4 pb-7 pt-5 text-ink"
      role="group"
      aria-label="Detected number"
    >
      <h3 className="font-display text-[22px] font-black leading-tight">{code ? 'Got it!' : 'Type the number'}</h3>
      <div className="flex items-center gap-2.5 rounded-md border-2 border-ink py-1.5 pl-3.5 pr-1.5">
        <input
          aria-label="NAFDAC number"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCheck(value);
          }}
          placeholder="e.g. A4-2260"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-xl font-semibold outline-none"
        />
        <button
          type="button"
          onClick={() => onCheck(value)}
          disabled={!value.trim()}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-on-accent disabled:opacity-50"
        >
          Check
        </button>
      </div>
      {close.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-ink-muted">Did you mean</p>
          <div className="flex flex-wrap gap-2">
            {close.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue(c)}
                className="rounded-full border-2 border-ink bg-surface-alt px-3.5 py-1.5 font-mono text-sm font-semibold"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[13px] leading-snug text-ink-muted">{REASON_TEXT[reason]}</p>
      <button type="button" onClick={onRetake} className="text-sm font-extrabold underline">
        Retake photo
      </button>
    </div>
  );
};
