import React from 'react';

export interface RegNumberProps {
  value: string;
  className?: string;
}

export const RegNumber: React.FC<RegNumberProps> = ({ value, className = '' }) => {
  return (
    <div className={`ca-reg ${className}`} role="text" aria-label={`NAFDAC registration number ${value}`}>
      <span className="ca-reg-k">NAFDAC</span>
      <span className="ca-reg-v">{value}</span>
    </div>
  );
};
