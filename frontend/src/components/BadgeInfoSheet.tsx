import React, { useCallback, useMemo, useState } from 'react';
import { BadgeInfoContext } from '../context/BadgeInfoContext';
import { ProductStatus } from '../types';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

/**
 * Explains what each verification badge means. Opens from any tappable StatusBadge
 * (product cards, result screen). Matches Doop frame "Result / Badge info" (FnmeNZRD9l).
 * Wording is neutral on purpose: CheckAm reports what the registry shows and never
 * decides that a product is fake or genuine (PRD 5.2).
 */
const LEGEND: { status: ProductStatus; detail: string }[] = [
  {
    status: 'match',
    detail:
      'Listed as active in the registry data NAFDAC holds. A match is not a guarantee, so still check the pack.',
  },
  {
    status: 'lapsed',
    detail:
      'The registration date has passed, or there is no record in our data. This alone does not mean the product is unsafe. Check the pack and ask the seller.',
  },
  {
    status: 'alert',
    detail: 'Named in an official NAFDAC public alert. Read the alert before you buy or use it.',
  },
];

export const BadgeInfoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selected, setSelected] = useState<ProductStatus | null>(null);
  const openBadgeInfo = useCallback((status: ProductStatus) => setSelected(status), []);
  const value = useMemo(() => ({ openBadgeInfo }), [openBadgeInfo]);

  return (
    <BadgeInfoContext.Provider value={value}>
      {children}
      <BottomSheet isOpen={selected !== null} onClose={() => setSelected(null)} title="What the badges mean">
        <h2 className="font-display font-black text-[22px] text-ink leading-tight">What the badges mean</h2>
        <div className="flex flex-col gap-1">
          {LEGEND.map((row) => (
            <div
              key={row.status}
              className="ca-bl"
              data-status={row.status}
              data-selected={selected === row.status ? 'yes' : 'no'}
            >
              <StatusBadge status={row.status} size="full" />
              <p className="ca-bl-d">{row.detail}</p>
              <span className="ca-bl-y">You tapped this badge</span>
            </div>
          ))}
        </div>
        <Button tone="primary" width="full" label="Got it" onClick={() => setSelected(null)} />
      </BottomSheet>
    </BadgeInfoContext.Provider>
  );
};
