import React from 'react';

export type TabKey = 'home' | 'scan' | 'saved' | 'about';

export interface TabBarProps {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  className?: string;
}

export const TabBar: React.FC<TabBarProps> = ({
  active,
  onSelect,
  className = '',
}) => {
  return (
    <nav className={`ca-tabs ${className}`} data-active={active} role="navigation" aria-label="Main Navigation">
      <button
        type="button"
        data-t="home"
        aria-label="Home"
        aria-current={active === 'home' ? 'page' : undefined}
        onClick={() => onSelect('home')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4v-5.5h-6V20H5a1 1 0 0 1-1-1z"></path>
        </svg>
        <span>Home</span>
      </button>

      <button
        type="button"
        data-t="scan"
        aria-label="Scan label or barcode"
        aria-current={active === 'scan' ? 'page' : undefined}
        onClick={() => onSelect('scan')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"></path>
          <path d="M4 12h16"></path>
        </svg>
        <span>Scan</span>
      </button>

      <button
        type="button"
        data-t="saved"
        aria-label="Saved products"
        aria-current={active === 'saved' ? 'page' : undefined}
        onClick={() => onSelect('saved')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"></path>
        </svg>
        <span>Saved</span>
      </button>

      <button
        type="button"
        data-t="about"
        aria-label="About CheckAm and settings"
        aria-current={active === 'about' ? 'page' : undefined}
        onClick={() => onSelect('about')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 11v5.5M12 7.8v.1"></path>
        </svg>
        <span>About</span>
      </button>
    </nav>
  );
};
