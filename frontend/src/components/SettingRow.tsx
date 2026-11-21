import React from 'react';

export interface SettingRowProps {
  title: string;
  detail?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  title,
  detail,
  children,
  onClick,
  className = '',
}) => {
  return (
    <div
      className={`ca-sr ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="ca-sr-t">
        <div className="ca-sr-h">{title}</div>
        {detail && <div className="ca-sr-d">{detail}</div>}
      </div>
      {children && <div className="ca-sr-c">{children}</div>}
    </div>
  );
};
