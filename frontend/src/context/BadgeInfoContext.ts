import { createContext, useContext } from 'react';
import { ProductStatus } from '../types';

export interface BadgeInfoContextValue {
  openBadgeInfo: (status: ProductStatus) => void;
}

/** Without a provider (tests, isolated renders) tapping a badge does nothing. */
export const BadgeInfoContext = createContext<BadgeInfoContextValue>({ openBadgeInfo: () => {} });

export function useBadgeInfo(): BadgeInfoContextValue {
  return useContext(BadgeInfoContext);
}
