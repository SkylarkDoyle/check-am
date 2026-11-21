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
  productCount = 3618,
  syncDate = '18 Nov 2026',
  changedCount = 38,
  className = '',
}) => {
  return (
    <div className={`ca-off ${className}`} data-state={state} role="status">
      <i className="ca-off-d" aria-hidden="true"></i>
      {state === 'online' && (
        <span className="ca-off-t" data-for="online">
          Online. Catalog up to date, {syncDate}
        </span>
      )}
      {state === 'offline' && (
        <span className="ca-off-t" data-for="offline">
          Offline. Searching {productCount.toLocaleString()} products saved on this phone
        </span>
      )}
      {state === 'syncing' && (
        <span className="ca-off-t" data-for="syncing">
          Syncing updates. {changedCount} changed records
        </span>
      )}
    </div>
  );
};
