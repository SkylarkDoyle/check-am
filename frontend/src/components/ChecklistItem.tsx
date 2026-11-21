import React from 'react';

export interface ChecklistItemProps {
  state?: 'todo' | 'done' | 'flag';
  title: string;
  detail: string;
  flagHint?: string;
  onToggle?: () => void;
  className?: string;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  state = 'todo',
  title,
  detail,
  flagHint,
  onToggle,
  className = '',
}) => {
  return (
    <div
      className={`ca-ck ${className}`}
      data-state={state}
      role="checkbox"
      aria-checked={state === 'done'}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle && onToggle();
        }
      }}
    >
      <span className="ca-ck-b" aria-hidden="true">
        {state === 'done' && (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12.5l4 4 8-9" />
          </svg>
        )}
        {state === 'flag' && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 21V4M6 5h11l-2 4 2 4H6" />
          </svg>
        )}
      </span>
      <div className="ca-ck-t">
        <div className="ca-ck-h">{title}</div>
        <div className="ca-ck-d">{detail}</div>
        {state === 'flag' && flagHint && (
          <div className="text-xs text-warn font-semibold mt-1 bg-warn-bg/40 px-2 py-1 rounded border-thin border-warn/30">
            {flagHint}
          </div>
        )}
      </div>
    </div>
  );
};
