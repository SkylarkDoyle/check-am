import React from 'react';

export interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  action,
  onAction,
  className = '',
}) => {
  return (
    <div className={`ca-sec ${className}`}>
      <h2>{title}</h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
};
