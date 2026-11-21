import React from 'react';

export interface OfflinePillProps {
  state?: 'online' | 'offline' | 'syncing';
  productCount?: number;
  syncDate?: string;
  changedCount?: number;
  className?: string;
}

export const OfflinePill: React.FC<OfflinePillProps> = ({
  state = 'offline',
  productCount,
  syncDate = '',
  changedCount,
  className = '',
}) => {
  return (
    <div className={`ca-off ${className}`} data-state={state} role="status">
      <i className="ca-off-d" aria-hidden="true"></i>
      {state === 'online' && (
        <span className="ca-off-t" data-for="online">
          Online. Catalog up to date{syncDate ? `, ${syncDate}` : ''}
        </span>
      )}
      {state === 'offline' && (
        <span className="ca-off-t" data-for="offline">
          Offline. Searching {productCount && productCount > 0 ? `${productCount.toLocaleString()} products` : 'products'} saved on this phone
        </span>
      )}
      {state === 'syncing' && (
        <span className="ca-off-t" data-for="syncing">
          Syncing updates{changedCount ? `. ${changedCount} changed records` : '…'}
        </span>
      )}
    </div>
  );
};
