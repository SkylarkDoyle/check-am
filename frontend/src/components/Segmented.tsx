import React from 'react';

export interface SegmentedProps {
  active: 1 | 2 | 3;
  options: [string, string, string];
  onChange?: (active: 1 | 2 | 3) => void;
  className?: string;
}

export const Segmented: React.FC<SegmentedProps> = ({
  active,
  options,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`ca-seg ${className}`}
      data-active={active}
      role="radiogroup"
    >
      {options.map((opt, idx) => {
        const n = (idx + 1) as 1 | 2 | 3;
        const isSelected = active === n;
        return (
          <button
            key={opt}
            type="button"
            data-n={n}
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange && onChange(n)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
};
