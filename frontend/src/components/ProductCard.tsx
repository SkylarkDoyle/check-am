import React from 'react';
import { Thumb } from './Thumb';
import { RegNumber } from './RegNumber';
import { StatusBadge } from './StatusBadge';
import { ProductStatus } from '../types';
import { ProductCardSkeleton } from './Skeleton';

export { ProductCardSkeleton };

export interface ProductCardProps {
  loading?: boolean;
  layout?: 'row' | 'tile';
  brand?: string;
  maker?: string;
  regNumber?: string;
  status?: ProductStatus;
  kind?: 'tin' | 'bottle' | 'sachet' | 'tube';
  imageUrl?: string;
  thumbSlot?: React.ReactNode;
  regSlot?: React.ReactNode;
  badgeSlot?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  loading = false,
  layout = 'row',
  brand = '',
  maker = '',
  regNumber,
  status = 'match',
  kind = 'tin',
  imageUrl,
  thumbSlot,
  regSlot,
  badgeSlot,
  onClick,
  className = '',
}) => {
  if (loading) {
    return <ProductCardSkeleton layout={layout} className={className} />;
  }
  return (
    <div
      className={`ca-card ${className}`}
      data-layout={layout}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick && onClick();
        }
      }}
    >
      <div className="ca-card-th flex-none">
        {thumbSlot || <Thumb kind={kind} imageUrl={imageUrl} size={layout === 'tile' ? 'md' : 'md'} fallback="no-image" />}
      </div>
      <div className="ca-card-b">
        <h3 className="ca-card-n">{brand}</h3>
        <p className="ca-card-m">{maker}</p>
        <div className="ca-card-r">
          {regSlot || (regNumber && <RegNumber value={regNumber} />)}
          {badgeSlot || <StatusBadge status={status} size="short" />}
        </div>
      </div>
    </div>
  );
};
