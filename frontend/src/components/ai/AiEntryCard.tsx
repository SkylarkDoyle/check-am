import React from 'react';
import { Button } from '../Button';
import { AiSparkle } from './AiSparkle';

export interface AiEntryCardProps {
  remaining: number;
  onAsk: () => void;
}

/**
 * Optional AI lookup entry. Shown only on the Not found search view; it searches whatever the
 * person typed (a name or a NAFDAC number). Doop component "AiEntryCard".
 */
export const AiEntryCard: React.FC<AiEntryCardProps> = ({ remaining, onAsk }) => (
  <div className="ca-aic w-full text-left">
    <div className="ca-aic-h">
      <AiSparkle />
      <span>Not in the registry? Ask AI</span>
    </div>
    <p className="ca-aic-p">See what the genuine pack looks like and common signs of a counterfeit.</p>
    <Button tone="secondary" width="full" label="Ask AI about this" onClick={onAsk} />
    <div className="ca-aic-c">
      {remaining} {remaining === 1 ? 'lookup' : 'lookups'} left today
    </div>
  </div>
);
