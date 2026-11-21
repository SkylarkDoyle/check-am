import React from 'react';
import { StatusBadge } from './StatusBadge';
import { ProductStatus } from '../types';

export interface RegistryRowProps {
  rule?: 'dashed' | 'solid' | 'dotted';
  no: string;
  brand: string;
  meta: string;
  status?: ProductStatus;
  badgeSlot?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const RegistryRow: React.FC<RegistryRowProps> = ({
  rule = 'dashed',
  no,
  brand,
  meta,
  status,
  badgeSlot,
  onClick,
  className = '',
}) => {
  return (
    <div
      className={`ca-rr ${className} ${onClick ? 'cursor-pointer hover:bg-surface-alt/40 transition-colors' : ''}`}
      data-rule={rule}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
    >
      <span className="ca-rr-n">{no}</span>
      <div className="ca-rr-b">
        <div className="ca-rr-t">{brand}</div>
        <div className="ca-rr-m">{meta}</div>
      </div>
      <div>
        {badgeSlot || (status && <StatusBadge status={status} size="short" />)}
      </div>
    </div>
  );
};
