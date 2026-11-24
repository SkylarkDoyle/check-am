import React from 'react';
import { AiSparkle } from './AiSparkle';

export interface AiStripProps {
  remaining: number;
  /** True when something is typed that can be sent; otherwise the button asks for input first. */
  canAsk: boolean;
  onAsk: () => void;
}

/**
 * Slim AI entry at the TOP of the Search screen (under the search bar). Doop component "AiStrip".
 * It never starts a lookup by itself.
 */
export const AiStrip: React.FC<AiStripProps> = ({ remaining, canAsk, onAsk }) => {
  const out = remaining <= 0;
  return (
    <div className="ai-strip" role="region" aria-label="Ask AI">
      <AiSparkle />
      <div className="ai-strip-t">
        <b>{canAsk ? 'Not in the registry? Use AI' : 'Ask AI about a pack'}</b>
        <small>
          {out
            ? 'No lookups left today'
            : canAsk
            ? `${remaining} ${remaining === 1 ? 'lookup' : 'lookups'} left today`
            : 'Type a name or NAFDAC number first'}
        </small>
      </div>
      <button type="button" className="ai-strip-b" onClick={onAsk} disabled={out}>
        Ask
      </button>
    </div>
  );
};
