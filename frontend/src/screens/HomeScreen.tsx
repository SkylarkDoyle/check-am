import React, { useState, useEffect, useRef } from 'react';
import {
  FoodArt,
  Logo,
  SearchBar,
  OfflinePill,
  AlertBanner,
  Thumb,
  ProductCard,
  ProductCardSkeleton,
  SectionHeader,
  Button,
  TabBar,
  InstallBanner
} from '../components';
import { Product, SafetyAlert } from '../types';
import { repository } from '../data/repository';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface HomeScreenProps {
  onNavigateProduct: (product: Product) => void;
  onOpenScan: () => void;
  onOpenSearch: (initialQuery?: string) => void;
  onNavigateTab: (tab: 'home' | 'scan' | 'saved' | 'about') => void;
  onOpenAlert: (alert: SafetyAlert) => void;
}

const PAGE_SIZE = 20;

const HERO_HEADLINE = 'Check it before you buy it';
const HERO_SUBLINE = 'Look up any food, drink or medicine in the NAFDAC registry, or scan the pack.';

/** One animated span per character. Animation names (tcN/ccN) follow the character position. */
const HeroHeadline: React.FC = () => {
  let pos = 0;
  return (
    <>
      {HERO_HEADLINE.split(' ').map((word, wi) => {
        const letters = [...word].map((ch) => {
          const i = pos++;
          return (
            <span className="c" key={i} style={{ animationName: `tc${i}` }}>
              {ch}
              <i className="k" style={{ animationName: `cc${i}` }}></i>
            </span>
          );
        });
        pos++; // the space after the word
        return (
          <React.Fragment key={wi}>
            {wi > 0 ? ' ' : null}
            <span className="w">{letters}</span>
          </React.Fragment>
        );
      })}
    </>
  );
};


export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateProduct,
  onOpenScan,
  onOpenSearch,
  onNavigateTab,
  onOpenAlert,
}) => {
  const isOnline = useOnlineStatus();
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [justChecked, setJustChecked] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [syncDate, setSyncDate] = useState<string>('');

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadSavedChecks = async () => {
    const saved = await repository.listSavedChecks();
    if (!saved || saved.length === 0) {
      setJustChecked([]);
      return;
    }
    const recent = saved.slice(0, 4);
    const prods: Product[] = [];
    for (const item of recent) {
      const fullProd = await repository.getProduct(item.productId);
      if (fullProd) {
        prods.push(fullProd);
      } else {
        prods.push({
          id: item.productId,
          nafdac_reg_num: item.regNumber,
          normalized_reg_num: item.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
          product_name: item.productName,
          brand_name: item.productName,
          category: 'Food',
          manufacturer: item.maker,
          status: item.status,
          kind: item.kind || 'tin',
        });
      }
    }
    setJustChecked(prods);
  };

  useEffect(() => {
    // 1. Load catalog metadata
    repository.getCatalogMeta().then((meta) => {
      setTotalCount(meta.count);
      setSyncDate(meta.lastSyncedShort || meta.lastSynced);
    });

    // 2. Load active safety alerts
    repository.listAlerts(20).then((items) => {
      setAlerts(items || []);
    });

    // 3. Load saved checks for "Just checked"
    loadSavedChecks();

    // 4. Initial feed items for "All products" starting from offset 0
    repository.listProducts(null, PAGE_SIZE, 0).then((feedProds) => {
      setAllProducts(feedProds);
      setHasMore(feedProds.length === PAGE_SIZE);
    });

    const handleUpdateSaved = () => {
      loadSavedChecks();
    };

    window.addEventListener('focus', handleUpdateSaved);
    window.addEventListener('app:saved-checks-updated', handleUpdateSaved);
    return () => {
      window.removeEventListener('focus', handleUpdateSaved);
      window.removeEventListener('app:saved-checks-updated', handleUpdateSaved);
    };
  }, []);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    const currentOffset = allProducts.length;

    // Show loading more indicator first before displaying the next batch
    await new Promise((resolve) => setTimeout(resolve, 500));

    const nextBatch = await repository.listProducts(null, PAGE_SIZE, currentOffset);

    if (nextBatch.length > 0) {
      setAllProducts((prev) => [...prev, ...nextBatch]);
      if ((totalCount !== null && currentOffset + nextBatch.length >= totalCount) || nextBatch.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } else {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  };

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          handleLoadMore();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, allProducts.length, totalCount]);

  const handleCategoryClick = (categoryName: string) => {
    onOpenSearch(categoryName);
  };

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-28 pt-2">
      <main className="flex-1 px-4 flex flex-col gap-3">
        {/* Eggplant Hero Panel */}
        <div className="hero bg-accent text-on-accent rounded-lg p-5 relative flex flex-col gap-3 overflow-hidden shadow-card">
          {/* Floating Food Art */}
          <span className="food-art absolute right-3 top-3">
            <FoodArt />
          </span>

          {/* Typing headline (animated per character, then the logo phase) */}
          <div className="stage" role="heading" aria-level={1} aria-label={`${HERO_HEADLINE}. CheckAm.`}>
            <h1 aria-hidden="true" className="font-display font-black text-display leading-tight max-w-[175px] tracking-display">
              <HeroHeadline />
            </h1>

          {/* Logo Phase */}
            <div className="lg" aria-hidden="true">
              <Logo tone="onaccent" layout="stacked" align="start" size="md" />
            </div>
          </div>

          <p className="text-[14px] leading-snug opacity-90 max-w-[260px]">
            {HERO_SUBLINE}
          </p>

          {/* SearchBar with Scan Shortcut */}
          <SearchBar
            placeholder="Name or NAFDAC no."
            onFocus={() => onOpenSearch()}
            onScan={onOpenScan}
          />
        </div>

        {/* Offline Pill Indicator - Shown ONLY when device is offline */}
        {!isOnline && (
          <div className="flex justify-center py-1">
            <OfflinePill state="offline" productCount={totalCount ?? undefined} />
          </div>
        )}

        {/* NAFDAC Safety Alert Carousel Banner - Automatically hidden if 0 alerts */}
        {alerts.length > 0 && (
          <AlertBanner
            alerts={alerts}
            onClickAlert={onOpenAlert}
          />
        )}

        {/* PWA In-App Install Banner */}
        <InstallBanner />

        {/* Category Thumbs Grid */}
        <div className="cats" role="navigation" aria-label="Product categories">
          <div onClick={() => handleCategoryClick('Food')}>
            <Thumb kind="tin" size="md" />
            <span>Food</span>
          </div>
          <div onClick={() => handleCategoryClick('Drinks')}>
            <Thumb kind="bottle" size="md" />
            <span>Drinks</span>
          </div>
          <div onClick={() => handleCategoryClick('Care')}>
            <Thumb kind="tube" size="md" />
            <span>Care</span>
          </div>
          <div onClick={() => handleCategoryClick('Meds')}>
            <Thumb kind="sachet" size="md" />
            <span>Meds</span>
          </div>
        </div>

        {/* Section: Just checked */}
        {justChecked.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-2">
            <SectionHeader
              title="Just checked"
              action="See all"
              onAction={() => onNavigateTab('saved')}
            />
            <div className="grid grid-cols-2 gap-3">
              {justChecked.map((prod) => (
                <ProductCard
                  key={prod.id}
                  layout="tile"
                  brand={prod.brand_name || prod.product_name}
                  maker={prod.manufacturer}
                  regNumber={prod.nafdac_reg_num}
                  status={prod.status}
                  kind={prod.kind}
                  imageUrl={prod.external_image_url || undefined}
                  onClick={() => onNavigateProduct(prod)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section: All products feed */}
        <div className="flex flex-col gap-2.5 mt-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display font-black text-title leading-tight">All products</h2>
            <span className="text-[13px] font-bold text-ink-muted">
              {totalCount !== null ? `${totalCount.toLocaleString()} products` : 'Products'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {allProducts.length === 0 ? (
              <>
                <ProductCardSkeleton layout="tile" />
                <ProductCardSkeleton layout="tile" />
                <ProductCardSkeleton layout="tile" />
                <ProductCardSkeleton layout="tile" />
              </>
            ) : (
              allProducts.map((prod, idx) => (
                <ProductCard
                  key={`all-${prod.id}-${idx}`}
                  layout="tile"
                  brand={prod.brand_name || prod.product_name}
                  maker={prod.manufacturer}
                  regNumber={prod.nafdac_reg_num}
                  status={prod.status}
                  kind={prod.kind}
                  imageUrl={prod.external_image_url || undefined}
                  onClick={() => onNavigateProduct(prod)}
                />
              ))
            )}
          </div>

          {/* Loading More Indicator - Appears first immediately below the products grid */}
          {isLoadingMore && (
            <div className="flex flex-col items-center justify-center gap-2 py-6" role="status" aria-live="polite">
              <div className="flex items-center gap-2.5 px-4 py-2 bg-surface border border-line rounded-full shadow-sm text-ink text-[13px] font-bold">
                <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading more products…</span>
              </div>
            </div>
          )}

          {/* Sentinel for infinite scroll */}
          {hasMore && !isLoadingMore && <div ref={sentinelRef} className="h-8" />}

          {/* End of list Frame */}
          {!hasMore && (
            <div className="flex flex-col items-center gap-2 py-8 text-center bg-surface border-thin border-line rounded-lg p-5 mt-2">
              <p className="font-display font-black text-lead leading-tight text-ink">
                {totalCount !== null
                  ? `You have seen all ${totalCount.toLocaleString()} products`
                  : 'You have seen all products'}
              </p>
              {syncDate && <p className="text-[13px] text-ink-muted font-medium">Registry synced {syncDate}</p>}
              <div className="mt-2">
                <Button
                  tone="secondary"
                  label="Back to top"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Persistent Bottom TabBar */}
      <TabBar active="home" onSelect={onNavigateTab} />
    </div>
  );
};
