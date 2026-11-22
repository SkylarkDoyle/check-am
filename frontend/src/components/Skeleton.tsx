import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Base animated skeleton primitive styled to CheckAm theme tokens:
 * Uses --color-skeleton-bg (var(--color-surface-alt)) and pulses
 * to --color-skeleton-pulse (var(--color-line)).
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style, ...props }) => {
  return (
    <div
      className={`ca-skeleton ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
};

export interface ProductCardSkeletonProps {
  layout?: 'tile' | 'row';
  className?: string;
}

/**
 * Reusable ProductCard skeleton matching both grid tiles and row cards
 */
export const ProductCardSkeleton: React.FC<ProductCardSkeletonProps> = ({
  layout = 'tile',
  className = '',
}) => {
  if (layout === 'row') {
    return (
      <div
        className={`bg-surface border-thin border-line rounded-lg p-3 flex gap-3 items-center ${className}`}
        aria-hidden="true"
      >
        <Skeleton className="w-14 h-14 rounded-md flex-none" />
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
          <Skeleton className="h-3 w-20 rounded-pill mt-0.5" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface border-thin border-line rounded-lg p-3 flex flex-col gap-2 ${className}`}
      aria-hidden="true"
    >
      <Skeleton className="w-full aspect-square rounded-md" />
      <Skeleton className="h-4 w-4/5 rounded mt-1" />
      <Skeleton className="h-3 w-3/5 rounded" />
      <div className="flex gap-1.5 mt-auto pt-1">
        <Skeleton className="h-4 w-14 rounded-pill" />
        <Skeleton className="h-4 w-16 rounded-pill" />
      </div>
    </div>
  );
};

/**
 * Full-screen skeleton placeholder for ResultScreen when resolving product details
 */
export const ResultScreenSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-ground pb-8 pt-2" aria-busy="true" aria-label="Loading verification details">
      {/* Top Bar Skeleton */}
      <div className="bar">
        <Skeleton className="w-11 h-11 rounded-full" />
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="w-11 h-11 rounded-full" />
      </div>

      <main className="flex-1 px-4 flex flex-col gap-3">
        {/* Big Verdict Header Card Skeleton */}
        <div className="bg-surface border-w border-line rounded-lg p-5 flex flex-col gap-3 shadow-card">
          <Skeleton className="h-5 w-32 rounded-pill" />
          <Skeleton className="h-8 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>

        {/* Product Strip Card Skeleton */}
        <div className="flex gap-3 items-center bg-surface border-w border-line rounded-lg p-3 shadow-sm">
          <Skeleton className="w-[72px] h-[72px] rounded-md flex-none" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </div>

        {/* Registry Details Panel Skeleton */}
        <div className="bg-surface rounded-lg border-w border-line p-5 flex flex-col gap-3">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>

        {/* Checklist Panel Skeleton */}
        <div className="bg-surface rounded-lg border-w border-line p-5 flex flex-col gap-3">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </main>
    </div>
  );
};
