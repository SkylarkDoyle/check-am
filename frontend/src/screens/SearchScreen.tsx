import React, { useState, useEffect, useRef } from 'react';
import {
  SearchBar,
  Chip,
  RegistryRow,
  Button,
  SectionHeader,
  StatusBadge,
  ChecklistItem,
  Disclaimer,
  TabBar,
  ProductCardSkeleton,
} from '../components';
import { Product, ProductCategory } from '../types';
import { repository, SearchResultItem } from '../data/repository';
import { AiEntryCard, AiLookupSheet } from '../components/ai';
import { AI_FIXTURES, useAiLookup } from '../hooks/useAiLookup';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface SearchScreenProps {
  initialQuery?: string;
  onSelectProduct: (product: Product) => void;
  onBack: () => void;
  onOpenScan: () => void;
  onNavigateTab?: (tab: 'home' | 'scan' | 'saved' | 'about') => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  initialQuery = '',
  onSelectProduct,
  onBack,
  onOpenScan,
  onNavigateTab,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string>('All');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncDate, setSyncDate] = useState<string>('');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isOnline = useOnlineStatus();
  const ai = useAiLookup();

  // QA only: ?ai=loading|result|nothing|limit opens that AI sheet state directly.
  useEffect(() => {
    if (!AI_FIXTURES) return;
    const which = new URLSearchParams(window.location.search).get('ai');
    if (which) ai.preview(which, initialQuery || 'Colgate toothpaste');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    repository.getCatalogMeta().then((meta) => {
      setSyncDate(meta.lastSynced);
    });
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      const cat = category === 'All' ? null : (category as ProductCategory);
      if (!query.trim()) {
        const defaultList = await repository.listProducts(cat, 30);
        setResults(defaultList);
      } else {
        const matches = await repository.searchProducts(query, cat, 30);
        setResults(matches);
      }
      setLoading(false);
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, category]);

  // The AI card needs a typed question that found nothing, and a network connection.
  const showAiCard = !loading && results.length === 0 && query.trim().length >= 3 && isOnline;
  const { refreshUsage } = ai;
  useEffect(() => {
    if (showAiCard) refreshUsage();
  }, [showAiCard, refreshUsage]);

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-28 pt-2">
      {/* Top Search & Navigation */}
      <div className="px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center border-thin border-ink rounded-full bg-surface hover:bg-surface-alt transition-colors"
          onClick={onBack}
          aria-label="Back to home"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1">
          <SearchBar
            value={query}
            placeholder="Search name or NAFDAC no."
            autoFocus={!initialQuery}
            onChange={(val) => setQuery(val)}
            onScan={onOpenScan}
          />
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {['All', 'Food', 'Drinks', 'Care', 'Meds'].map((cat) => (
          <Chip
            key={cat}
            label={cat}
            active={category === cat}
            onClick={() => setCategory(cat)}
          />
        ))}
      </div>

      {/* Results Feed */}
      <main className="flex-1 px-4 py-2 flex flex-col gap-2">
        {loading ? (
          <div className="flex flex-col gap-2.5">
            <ProductCardSkeleton layout="row" />
            <ProductCardSkeleton layout="row" />
            <ProductCardSkeleton layout="row" />
            <ProductCardSkeleton layout="row" />
          </div>
        ) : results.length > 0 ? (
          <>
            {/* Header with Product Count & Clear Action */}
            <SectionHeader
              title={`${results.length} ${results.length === 1 ? 'product' : 'products'}`}
              action={query ? 'Clear' : undefined}
              onAction={() => {
                setQuery('');
                setCategory('All');
              }}
            />

            {/* Product List */}
            <div className="bg-surface rounded-lg border-w border-line p-3 divide-y divide-line/60">
              {results.map((prod, idx) => (
                <RegistryRow
                  key={prod.id}
                  no={String(idx + 1).padStart(2, '0')}
                  brand={prod.brand_name || prod.product_name}
                  meta={`${prod.manufacturer} · ${prod.nafdac_reg_num}`}
                  status={prod.status}
                  onClick={() => onSelectProduct(prod)}
                />
              ))}
            </div>

            {/* Bottom helper & scan button matching Doop frame 4RajuPWjTA */}
            <div className="flex flex-col gap-2 pt-3">
              <p className="lbl" style={{ paddingTop: 'var(--spacing-3)' }}>
                TYPOS ARE FINE. HYPHENS AND SPACES ARE IGNORED.
              </p>
              <p style={{ fontSize: 14, color: 'var(--color-ink-muted)' }}>
                Try the number from the pack, like 01-4721 or 014721. Or scan the label.
              </p>
              <Button
                label="Scan a label instead"
                tone="secondary"
                width="full"
                onClick={onOpenScan}
              />
            </div>
          </>
        ) : (
          /* No Result State Matching Doop Frame 8jyQrYEItc */
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            {/* 88px Magnifying Glass with Brown Minus Icon */}
            <svg viewBox="0 0 120 120" width="88" height="88" aria-hidden="true">
              <circle cx="60" cy="60" r="56" fill="var(--color-surface-alt)" />
              <circle cx="54" cy="54" r="22" fill="none" stroke="var(--color-ink)" strokeWidth="5" />
              <path d="M71 71l22 22" stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" />
              <path d="M45 54h18" stroke="var(--color-warn)" strokeWidth="5" strokeLinecap="round" />
            </svg>

            <h1 className="font-display font-black text-[28px] leading-tight text-ink">
              No match found
            </h1>

            <p className="text-[15px] text-ink-muted max-w-[300px]">
              {query ? `"${query}"` : 'This item'} is not in the records on this phone{syncDate ? `, synced ${syncDate}` : ''}.
            </p>

            <StatusBadge status="lapsed" size="full" />

            {/* Guidance Panel */}
            <div className="panel w-full text-left mt-2" style={{ paddingBottom: 'var(--spacing-3)' }}>
              <h3 className="font-display font-black text-[17px] pt-1">Before you decide</h3>
              <ChecklistItem
                title="Check what you typed"
                detail="Compare each character with the pack."
                state="flag"
              />
            </div>

            {/* Optional AI lookup: only here, only for what the person typed */}
            {showAiCard && ai.enabled && (
              <AiEntryCard remaining={ai.remaining} onAsk={() => ai.run(query.trim())} />
            )}

            {/* Scan the label button */}
            <div className="w-full pt-2">
              <Button label="Scan the label" width="full" onClick={onOpenScan} />
            </div>

            {/* Legal Disclaimer */}
            <div className="pt-3 pb-2 w-full text-left">
              <Disclaimer />
            </div>
          </div>
        )}
      </main>

      {ai.enabled && (
        <AiLookupSheet
          isOpen={ai.open}
          state={ai.state}
          query={ai.query}
          remaining={ai.remaining}
          limit={ai.limit}
          onClose={ai.close}
          onScan={() => {
            ai.close();
            onOpenScan();
          }}
          onEditSearch={() => {
            ai.close();
            setTimeout(() => document.querySelector<HTMLInputElement>('input')?.focus(), 50);
          }}
        />
      )}

      {/* Persistent Bottom TabBar */}
      {onNavigateTab && <TabBar active="home" onSelect={onNavigateTab} />}
    </div>
  );
};
