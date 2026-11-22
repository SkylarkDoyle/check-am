import React from 'react';
import { ChecklistState } from '../types';

export interface ChecklistRowProps {
  state?: ChecklistState;
  title: string;
  detail: string;
  /** Tapping the tick (matches) or the cross (does not match). Tapping the active one clears it. */
  onChoose?: (choice: 'match' | 'nomatch') => void;
  className?: string;
}

/**
 * One pack check with a tick and a cross button. No divider between rows.
 * Matches the Doop component "ChecklistRow".
 */
export const ChecklistRow: React.FC<ChecklistRowProps> = ({
  state = 'todo',
  title,
  detail,
  onChoose,
  className = '',
}) => {
  return (
    <div className={`ca-cr ${className}`} data-state={state}>
      <div className="ca-cr-t">
        <div className="ca-cr-h">{title}</div>
        <div className="ca-cr-d">{detail}</div>
      </div>
      <button
        type="button"
        className="ca-cr-b ca-cr-y"
        aria-label={`${title}: matches`}
        aria-pressed={state === 'match'}
        onClick={() => onChoose && onChoose('match')}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 12.5l4 4 8-9" />
        </svg>
      </button>
      <button
        type="button"
        className="ca-cr-b ca-cr-n"
        aria-label={`${title}: does not match`}
        aria-pressed={state === 'nomatch'}
        onClick={() => onChoose && onChoose('nomatch')}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};
