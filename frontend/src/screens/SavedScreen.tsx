import React, { useState, useEffect } from 'react';
import {
  Segmented,
  ProductCard,
  ProductCardSkeleton,
  TabBar,
  Button
} from '../components';
import { Product, SavedCheck } from '../types';
import { repository } from '../data/repository';

interface SavedScreenProps {
  onNavigateProduct: (product: Product) => void;
  onNavigateTab: (tab: 'home' | 'scan' | 'saved' | 'about') => void;
  onShowToast: (msg: string) => void;
}

export const SavedScreen: React.FC<SavedScreenProps> = ({
  onNavigateProduct,
  onNavigateTab,
  onShowToast,
}) => {
  const [filterIndex, setFilterIndex] = useState<1 | 2 | 3>(1); // 1: All, 2: Match, 3: Alert
  const [savedChecks, setSavedChecks] = useState<SavedCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSavedChecks();
  }, [filterIndex]);

  const loadSavedChecks = async () => {
    setLoading(true);
    const list = await repository.listSavedChecks();
    // Re-resolve current status for each saved product
    const updatedList = await Promise.all(
      list.map(async (item) => {
        const prod = await repository.getProduct(item.productId);
        if (prod) {
          return {
            ...item,
            status: prod.status,
            productName: prod.product_name,
            maker: prod.manufacturer,
            regNumber: prod.nafdac_reg_num,
          };
        }
        return item;
      })
    );

    let filtered = updatedList;
    if (filterIndex === 2) {
      filtered = updatedList.filter((i) => i.status === 'match');
    } else if (filterIndex === 3) {
      filtered = updatedList.filter((i) => i.status === 'alert');
    }
    setSavedChecks(filtered);
    setLoading(false);
  };

  const handleClearAll = async () => {
    await repository.clearSavedChecks();
    setSavedChecks([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:saved-checks-updated'));
    }
    onShowToast('Saved checks cleared');
  };

  const handleClickItem = async (check: SavedCheck) => {
    const prod = await repository.getProduct(check.productId);
    if (prod) {
      onNavigateProduct(prod);
    } else {
      // Fallback object
      onNavigateProduct({
        id: check.productId,
        nafdac_reg_num: check.regNumber,
        normalized_reg_num: check.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
        product_name: check.productName,
        brand_name: check.productName,
        category: 'Food',
        manufacturer: check.maker,
        status: check.status,
        kind: check.kind,
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-28 pt-2">
      {/* Screen Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <h1 className="font-display font-black text-title text-ink">Saved checks</h1>
        {savedChecks.length > 0 && (
          <button
            type="button"
            className="text-xs font-bold text-ink-muted underline hover:text-ink transition-colors"
            onClick={handleClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Segmented Filter */}
      <div className="px-4 py-2">
        <Segmented
          active={filterIndex}
          options={['All', 'Match', 'Alert']}
          onChange={(idx) => setFilterIndex(idx)}
        />
      </div>

      {/* Saved List */}
      <main className="flex-1 px-4 py-2 flex flex-col gap-3">
        {loading ? (
          <div className="flex flex-col gap-2.5">
            <ProductCardSkeleton layout="row" />
            <ProductCardSkeleton layout="row" />
            <ProductCardSkeleton layout="row" />
          </div>
        ) : savedChecks.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {savedChecks.map((item) => (
              <ProductCard
                key={item.id}
                layout="row"
                brand={item.productName}
                maker={item.maker}
                regNumber={item.regNumber}
                status={item.status}
                kind={item.kind}
                onClick={() => handleClickItem(item)}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border-w border-line rounded-lg mt-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4 text-ink-muted">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
              </svg>
            </div>
            <h2 className="font-display font-black text-xl text-ink mb-1">
              No saved checks yet
            </h2>
            <p className="text-xs text-ink-muted leading-relaxed max-w-[260px] mb-4">
              When you verify a pack in a market or pharmacy, tap &ldquo;Save this check&rdquo; to review it later offline.
            </p>
            <Button
              tone="primary"
              label="Check a product"
              onClick={() => onNavigateTab('home')}
            />
          </div>
        )}
      </main>

      {/* TabBar */}
      <TabBar active="saved" onSelect={onNavigateTab} />
    </div>
  );
};
