import React, { useMemo, useState } from 'react';
import type { SuggestReason } from '../../lib/ocr/confirm';

const REASON_TEXT: Record<SuggestReason, string> = {
  'not-in-registry': 'Not found in this phone’s list yet. Fix any wrong character, then check.',
  repaired: 'Close to a registered number. Check that it is right.',
  'single-read': 'Is this the number? Fix any wrong character, then check.',
};

interface ScanBubbleProps {
  code: string;
  reason: SuggestReason;
  onCheck: (code: string) => void;
  /** Registry numbers close to what is typed, for tap-to-pick chips. */
  findClose?: (code: string) => string[];
  onScanAgain: () => void;
}

/**
 * The editable "Got it!" bubble. The text is only ever a suggestion: nothing is looked up until
 * the user taps Check, and what they typed is what gets looked up.
 */
export const ScanBubble: React.FC<ScanBubbleProps> = ({ code, reason, onCheck, findClose, onScanAgain }) => {
  const [value, setValue] = useState(code);
  const close = useMemo(() => (findClose ? findClose(value) : []), [findClose, value]);
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (
    <div className="bub bub-pop z-30" style={{ right: 'var(--spacing-5)' }} role="group" aria-label="Detected number">
      <div>Got it!</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          aria-label="NAFDAC number"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCheck(value);
          }}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 font-mono text-base font-semibold text-ground outline-none ring-1 ring-white/40 focus:ring-2"
        />
        <button
          type="button"
          onClick={() => onCheck(value)}
          className="rounded-pill bg-ground px-3 py-1.5 text-sm font-extrabold text-ink"
        >
          Check
        </button>
      </div>
      {close.filter((c) => normalize(c) !== normalize(value)).length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold opacity-80">Did you mean</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {close
              .filter((c) => normalize(c) !== normalize(value))
              .map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue(c)}
                  className="rounded-pill bg-white/15 px-2.5 py-1 font-mono text-xs font-bold text-ground ring-1 ring-white/40"
                >
                  {c}
                </button>
              ))}
          </div>
        </div>
      )}
      <p className="mt-1.5 text-[11px] font-semibold opacity-80">{REASON_TEXT[reason]}</p>
      <button type="button" onClick={onScanAgain} className="mt-1 text-[11px] font-bold underline opacity-90">
        Scan again
      </button>
    </div>
  );
};
