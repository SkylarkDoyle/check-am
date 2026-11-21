import React from 'react';

export interface StatusBarProps {
  tone?: 'dark' | 'light';
  time?: string;
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  tone = 'dark',
  time = '9:41',
  className = '',
}) => {
  return (
    <div className={`ca-sb ${className}`} data-tone={tone} aria-hidden="true">
      <span className="ca-sb-t">{time}</span>
      <span className="ca-sb-r">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx=".6"></rect>
          <rect x="5" y="5" width="3" height="7" rx=".6"></rect>
          <rect x="10" y="2.5" width="3" height="9.5" rx=".6"></rect>
          <rect x="15" y="0" width="3" height="12" rx=".6"></rect>
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor">
          <rect x=".5" y=".5" width="21" height="11" rx="3"></rect>
          <rect x="2.5" y="2.5" width="14" height="7" rx="1.4" fill="currentColor" stroke="none"></rect>
          <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" stroke="none"></rect>
        </svg>
      </span>
    </div>
  );
};
