import React from 'react';

export interface DisclaimerProps {
  text?: string;
  className?: string;
}

export const Disclaimer: React.FC<DisclaimerProps> = ({
  text = 'CheckAm reports what the NAFDAC public registry shows. It does not decide whether a product is genuine. Inspect the pack yourself and contact NAFDAC directly for enforcement.',
  className = '',
}) => {
  return (
    <div className={`ca-disc ${className}`} role="note">
      <span className="ca-disc-i" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 11v5.5M12 7.8v.1"></path>
        </svg>
      </span>
      <p>{text}</p>
    </div>
  );
};
