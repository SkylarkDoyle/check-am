import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'secondary' | 'ghost';
  width?: 'auto' | 'full';
  label?: string;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  tone = 'primary',
  width = 'auto',
  label,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  return (
    <button
      className={`ca-btn ${className}`}
      data-tone={tone}
      data-width={width}
      data-state={disabled ? 'disabled' : 'default'}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="flex-none flex items-center justify-center">{icon}</span>}
      {label || children}
    </button>
  );
};
