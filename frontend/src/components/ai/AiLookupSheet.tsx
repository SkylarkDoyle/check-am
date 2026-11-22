import React from 'react';
import { BottomSheet } from '../BottomSheet';
import { Button } from '../Button';
import { Disclaimer } from '../Disclaimer';
import { AiLoadingLines } from './AiLoadingLines';
import { AiSparkle } from './AiSparkle';
import { AI_DISCLAIMER, AiBlock, AiListItem, AiLookupState } from './types';

export interface AiLookupSheetProps {
  isOpen: boolean;
  state: AiLookupState;
  query: string;
  /** Lookups left today, shown under the result and on the limit state. */
  remaining: number;
  limit?: number;
  onClose: () => void;
  onScan: () => void;
  onEditSearch: () => void;
}

const COUNTRY_NOTE = 'Packaging can differ by country. Check the NAFDAC number on your own pack.';

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function ListItems({ items }: { items: AiListItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div key={i}>
          <div className="ai-li">{it.text}</div>
          {it.items && it.items.length > 0 && (
            <div className="pl-4 mt-1">
              <ListItems items={it.items} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Blocks({ blocks }: { blocks: AiBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((b, i) => {
        if (b.type === 'heading') return <div key={i} className="ai-sh">{b.text}</div>;
        if (b.type === 'paragraph') return <p key={i} className="ai-p">{b.text}</p>;
        return <ListItems key={i} items={b.items} />;
      })}
    </div>
  );
}

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ai-h">
    <AiSparkle />
    <span>{children}</span>
  </div>
);

/**
 * Bottom sheet for the AI lookup, in the existing sheet style. Four states, matching the Doop
 * frames "AI lookup / Loading", "Result", "Nothing found" and "Limit reached".
 */
export const AiLookupSheet: React.FC<AiLookupSheetProps> = ({
  isOpen,
  state,
  query,
  remaining,
  limit = 5,
  onClose,
  onScan,
  onEditSearch,
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="AI lookup">
      {state.status === 'loading' && (
        <>
          <Heading>Looking up the genuine pack</Heading>
          <AiLoadingLines />
          <div className="ai-step" role="status">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
            Searching the web for Nigerian packaging…
          </div>
          <Disclaimer text={AI_DISCLAIMER} />
        </>
      )}

      {state.status === 'result' && (
        <>
          <Heading>AI summary</Heading>
          <h2 className="ai-t" style={{ fontSize: 20 }}>{query}</h2>
          <Blocks blocks={state.data.blocks} />
          {state.data.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {state.data.sources.map((s, i) => (
                <a
                  key={i}
                  className="ai-src"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.title}
                >
                  {sourceDomain(s.url)}
                </a>
              ))}
            </div>
          )}
          <div className="ai-note">{COUNTRY_NOTE}</div>
          <Disclaimer text={`${AI_DISCLAIMER} Not from NAFDAC.`} />
          <Button tone="primary" width="full" label="Done" onClick={onClose} />
          <div className="ai-cnt">{remaining} {remaining === 1 ? 'lookup' : 'lookups'} left today</div>
        </>
      )}

      {state.status === 'none' && (
        <>
          <Heading>AI summary</Heading>
          <h2 className="ai-t">No reliable information found</h2>
          <p className="ai-p">
            We could not find trustworthy details for &quot;{query}&quot;. Check the spelling, or scan the pack.
          </p>
          <div className="ai-note">This lookup was not counted against your daily limit.</div>
          <Button tone="primary" width="full" label="Scan the label" onClick={onScan} />
          <Button tone="secondary" width="full" label="Edit my search" onClick={onEditSearch} />
          <Disclaimer text={AI_DISCLAIMER} />
        </>
      )}

      {state.status === 'limit' && (
        <>
          <Heading>AI lookups</Heading>
          <h2 className="ai-t">You have used your {limit} lookups today</h2>
          <p className="ai-p">Lookups reset tomorrow. You can still search the registry or scan the pack.</p>
          <div className="ai-cnt">0 lookups left today</div>
          <Button tone="primary" width="full" label="Scan the label" onClick={onScan} />
          <Button tone="secondary" width="full" label="Back to search" onClick={onClose} />
          <Disclaimer text={AI_DISCLAIMER} />
        </>
      )}

      {state.status === 'error' && (
        <>
          <Heading>AI summary</Heading>
          <h2 className="ai-t">The lookup is not available right now</h2>
          <p className="ai-p">Try again later. You can still search the registry or scan the pack.</p>
          <Button tone="primary" width="full" label="Scan the label" onClick={onScan} />
          <Button tone="secondary" width="full" label="Back to search" onClick={onClose} />
          <Disclaimer text={AI_DISCLAIMER} />
        </>
      )}
    </BottomSheet>
  );
};
