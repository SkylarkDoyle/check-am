import React from 'react';
import { ProductStatus } from '../types';

export interface StatusBadgeProps {
  status: ProductStatus;
  size?: 'full' | 'short';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status = 'match',
  size = 'full',
  className = '',
}) => {
  const getLabel = () => {
    if (status === 'match') {
      return size === 'full' ? 'Official NAFDAC Registry Match' : 'Registry match';
    }
    if (status === 'lapsed') {
      return size === 'full' ? 'Registration Lapsed / Not Found in Registry' : 'Lapsed / not found';
    }
    return size === 'full' ? 'Subject of Official NAFDAC Public Alert' : 'Public alert';
  };

  return (
    <span
      className={`ca-badge ${className}`}
      data-status={status}
      data-size={size}
      role="status"
    >
      {status === 'match' && (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M8 12.5l2.8 2.8L16 9.5"></path>
        </svg>
      )}
      {status === 'lapsed' && (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M8 12h8"></path>
        </svg>
      )}
      {status === 'alert' && (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3.5l9.5 16.5h-19z"></path>
          <path d="M12 10v4.5M12 17.2v.1"></path>
        </svg>
      )}
      <span>{getLabel()}</span>
    </span>
  );
};
