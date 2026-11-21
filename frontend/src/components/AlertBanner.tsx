import React from 'react';

export interface AlertBannerProps {
  headline: string;
  meta: string;
  onClick?: () => void;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  headline,
  meta,
  onClick,
  className = '',
}) => {
  return (
    <div
      className={`ca-alert ${className} ${onClick ? 'cursor-pointer' : ''}`}
      role="alert"
      onClick={onClick}
    >
      <span className="ca-alert-i" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5l9.5 16.5h-19z"></path>
          <path d="M12 10v4.5M12 17.2v.1"></path>
        </svg>
      </span>
      <div className="ca-alert-b">
        <div className="ca-alert-k">NAFDAC PUBLIC ALERT</div>
        <div className="ca-alert-h">{headline}</div>
        <div className="ca-alert-m">{meta}</div>
      </div>
    </div>
  );
};
