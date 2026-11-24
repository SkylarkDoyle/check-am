import React, { useEffect, useState } from 'react';
import { AiSparkle } from './AiSparkle';

const TIP_KEY = 'checkam_ai_tip_seen';
const TIP_DELAY_MS = 1500;
const TIP_VISIBLE_MS = 5000;

function tipAlreadySeen(): boolean {
  try {
    return localStorage.getItem(TIP_KEY) === '1';
  } catch {
    return false;
  }
}
function markTipSeen() {
  try {
    localStorage.setItem(TIP_KEY, '1');
  } catch {
    /* private mode: the tip may show again, which is harmless */
  }
}

export interface AiSearchButtonProps {
  onAsk: () => void;
}

/**
 * Small sparkle that sits inside the hero search bar, left of the scan button. It opens Search with
 * the AI hint (never a paid lookup by itself). A one-time tip points at it, closes by itself after a
 * few seconds, and never blocks a tap. Doop component "AiSparkle" inside Home.
 */
export const AiSearchButton: React.FC<AiSearchButtonProps> = ({ onAsk }) => {
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (tipAlreadySeen()) return;
    const show = setTimeout(() => {
      setTip(true);
      markTipSeen();
    }, TIP_DELAY_MS);
    const hide = setTimeout(() => setTip(false), TIP_DELAY_MS + TIP_VISIBLE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="ai-search-btn"
        aria-label="Ask AI about a product"
        onClick={(e) => {
          e.stopPropagation();
          setTip(false);
          onAsk();
        }}
      >
        <span className="ai-search-dot">
          <AiSparkle />
        </span>
      </button>
      <div className="ai-tip" data-open={tip} role="status" aria-live="polite" onClick={() => setTip(false)}>
        {tip ? 'Can’t find it? Ask AI' : ''}
      </div>
    </>
  );
};
