import React, { useRef } from 'react';

export interface SearchBarProps {
  value?: string;
  placeholder?: string;
  onChange?: (val: string) => void;
  onScan?: () => void;
  onSubmit?: (val: string) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value = '',
  placeholder = 'Search name or NAFDAC no.',
  onChange,
  onScan,
  onSubmit,
  onFocus,
  autoFocus = false,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const state = value ? 'filled' : 'default';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onSubmit) {
        onSubmit(value);
      }
    }
  };

  return (
    <div
      className={`ca-search ${className}`}
      data-state={state}
      role="search"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="ca-search-i" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5"></circle>
          <path d="M20 20l-4.2-4.2"></path>
        </svg>
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label="Search product name or NAFDAC registration number"
        autoFocus={autoFocus}
        onChange={(e) => onChange && onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
      />
      {onScan && (
        <button
          type="button"
          className="ca-search-s"
          aria-label="Open camera barcode and label scanner"
          onClick={(e) => {
            e.stopPropagation();
            onScan();
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"></path>
            <path d="M4 12h16"></path>
          </svg>
        </button>
      )}
    </div>
  );
};
