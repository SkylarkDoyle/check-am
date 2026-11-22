import React from 'react';
import { Button } from './Button';

export type CheckBarState = 'progress' | 'match' | 'nomatch';

export interface CheckBarProps {
  total: number;
  matched: number;
  mismatched: number;
  isSaved?: boolean;
  onSave: () => void;
  onShare: () => void;
}

/** Derive the bar state from the checklist answers. Any cross wins, then completeness. */
export function getCheckBarState(total: number, matched: number, mismatched: number): CheckBarState {
  if (mismatched > 0) return 'nomatch';
  if (total > 0 && matched === total) return 'match';
  return 'progress';
}

/**
 * Sticky action bar under the checklist (Doop component "CheckBar").
 * Wording is neutral: it reports the person's own checks against the registry record
 * and never says the product is fake or genuine.
 */
export const CheckBar: React.FC<CheckBarProps> = ({
  total,
  matched,
  mismatched,
  isSaved = false,
  onSave,
  onShare,
}) => {
  const state = getCheckBarState(total, matched, mismatched);
  const answered = matched + mismatched;

  let title: string;
  let detail: string;
  if (state === 'match') {
    title = `All ${total} checks match`;
    detail = 'Your pack agrees with the registry record. Still use your own judgment.';
  } else if (state === 'nomatch') {
    title = `${mismatched} ${mismatched === 1 ? "check doesn't" : "checks don't"} match`;
    detail = "Hold off on buying or using this until you're sure.";
  } else {
    title = `${answered} of ${total} checked`;
    detail = 'Finish the list, then decide.';
  }

  const saveLabel = isSaved ? '✓ Saved to this phone' : 'Save this check';

  return (
    <div className="ca-cb" data-state={state} role="region" aria-label="Checklist result">
      <div className="ca-cb-top">
        <span className="ca-cb-i" aria-hidden="true">
          {state === 'progress' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
            </svg>
          )}
          {state === 'match' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.8 2.8L16 9.5" />
            </svg>
          )}
          {state === 'nomatch' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5l9.5 16.5h-19z" />
              <path d="M12 10v4.5M12 17.2v.1" />
            </svg>
          )}
        </span>
        <span className="ca-cb-h" aria-live="polite">{title}</span>
      </div>
      {state === 'progress' && (
        <div className="ca-cb-seg" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <i key={i} className={i < answered ? 'on' : ''} />
          ))}
        </div>
      )}
      <p className="ca-cb-d">{detail}</p>
      <div className="ca-cb-a">
        <Button tone={state === 'progress' ? 'secondary' : 'primary'} width="full" label={saveLabel} onClick={onSave} />
        {state !== 'progress' && (
          <Button tone="secondary" width="full" label="Share on WhatsApp" onClick={onShare} />
        )}
      </div>
    </div>
  );
};
