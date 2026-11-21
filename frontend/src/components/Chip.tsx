import React from 'react';

export interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  active = false,
  onClick,
  className = '',
}) => {
  return (
    <button
      type="button"
      className={`ca-chip ${className}`}
      data-state={active ? 'active' : 'default'}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
};
