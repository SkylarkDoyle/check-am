import React from 'react';

export interface FoodArtProps {
  className?: string;
}

export const FoodArt: React.FC<FoodArtProps> = ({ className = '' }) => {
  return (
    <svg
      viewBox="0 0 166 134"
      width="143"
      height="116"
      aria-hidden="true"
      stroke="#1D2A1A"
      strokeWidth="3"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      {/* 1. Cereal box (back left) */}
      <g>
        <rect x="12" y="12" width="68" height="104" rx="8" fill="#FFE0A3" />
        <path d="M12 32h68" fill="none" />
        <circle cx="46" cy="68" r="20" fill="#FFF8DC" strokeWidth="2.5" />
        <path d="M30 74a17 17 0 0 1 32 0z" fill="#F2A33A" strokeWidth="2.5" />
        <path d="M46 44v-7M30 52l-5-5M62 52l5-5" fill="none" strokeWidth="2.5" />
        <rect x="24" y="97" width="44" height="6" rx="3" fill="#1D2A1A" stroke="none" />
      </g>

      {/* 2. Juice carton with straw (back right, translate(-14 2)) */}
      <g transform="translate(-14 2)">
        <path d="M134 54l9-17h26l9 17z" fill="#F7FBF2" />
        <rect x="134" y="54" width="44" height="64" rx="4" fill="#FFF8DC" />
        <path d="M158 37V19q0-6 6-6h9" fill="none" stroke="#D6322A" strokeWidth="3.5" />
        <rect x="134" y="74" width="44" height="28" fill="#F2A33A" strokeWidth="2.5" />
        <circle cx="156" cy="88" r="9" fill="#FFF8DC" strokeWidth="2.5" />
        <path d="M156 79c1-5 5-6 8-5-1 4-4 6-8 5z" fill="#4C9A3B" strokeWidth="2" />
        <path d="M142 110h28" fill="none" strokeWidth="3" />
      </g>

      {/* 3. Tinned tomato (front centre, overlapping box & carton) */}
      <g>
        <path d="M68 70v42c0 5 13 9 29 9s29-4 29-9V70" fill="#D6322A" />
        <rect x="68" y="86" width="58" height="22" fill="#FFF8DC" strokeWidth="2.5" />
        <path d="M80 97h34" fill="none" strokeWidth="3.5" />
        <ellipse cx="97" cy="70" rx="29" ry="9" fill="#DCEBD0" />
        <ellipse cx="97" cy="70" rx="21" ry="5.5" fill="none" strokeWidth="2" />
      </g>
    </svg>
  );
};
