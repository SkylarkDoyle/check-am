import React from 'react';

export interface LogoProps {
  tone?: 'default' | 'reversed' | 'onaccent';
  layout?: 'horizontal' | 'stacked';
  align?: 'center' | 'start';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  tone = 'default',
  layout = 'horizontal',
  align = 'center',
  size = 'md',
  className = '',
}) => {
  return (
    <div
      className={`ca-logo ${className}`}
      data-tone={tone}
      data-layout={layout}
      data-align={align}
      data-size={size}
      role="img"
      aria-label="CheckAm"
    >
      <svg className="ca-logo-m" viewBox="0 0 64 64" aria-hidden="true">
        {/* Handle */}
        <path
          className="a"
          d="M22 27C22 10 42 10 42 27"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
        ></path>
        {/* Basket body */}
        <path
          className="a f"
          d="M8 27H56L50 54Q49.4 58 45 58H19Q14.6 58 14 54Z"
          strokeWidth="2"
          strokeLinejoin="round"
        ></path>
        {/* Tick */}
        <path
          className="t"
          d="M23 41l7 7 12-14"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        ></path>
      </svg>
      <span className="ca-logo-w">
        Check<b>Am</b>
      </span>
    </div>
  );
};
