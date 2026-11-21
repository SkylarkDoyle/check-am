import React from 'react';

export interface KeyValueRowProps {
  label: string;
  value: string;
  className?: string;
}

export const KeyValueRow: React.FC<KeyValueRowProps> = ({
  label,
  value,
  className = '',
}) => {
  return (
    <div className={`ca-kv ${className}`}>
      <span className="ca-kv-k">{label}</span>
      <i className="ca-kv-l" aria-hidden="true"></i>
      <span className="ca-kv-v">{value}</span>
    </div>
  );
};
