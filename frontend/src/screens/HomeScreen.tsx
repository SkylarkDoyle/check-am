import React, { useState, useEffect, useRef } from 'react';
import {
  FoodArt,
  Logo,
  SearchBar,
  OfflinePill,
  AlertBanner,
  Thumb,
  ProductCard,
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

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateProduct,
  onOpenScan,
  onOpenSearch,
  onNavigateTab,
  onOpenAlert,
}) => {
  const isOnline = useOnlineStatus();
  const [activeAlert, setActiveAlert] = useState<SafetyAlert | null>(null);
  const [justChecked, setJustChecked] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(3618);
  const [syncDate, setSyncDate] = useState('18 Nov 2026');

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
      setSyncDate(meta.lastSynced);
    });

    // 2. Load active safety alert
    repository.listAlerts(1).then((alerts) => {
      if (alerts && alerts.length > 0) setActiveAlert(alerts[0]);
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
      if (currentOffset + nextBatch.length >= totalCount || nextBatch.length < PAGE_SIZE) {
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

          <small className="font-bold text-[13px] opacity-90">Hello, shopper</small>

          {/* 10s CSS Animated Typing Headline & Logo Phase */}
          <div className="stage" role="heading" aria-level={1} aria-label="What are you buying today? CheckAm.">
            <h1 aria-hidden="true" className="font-display font-black text-display leading-tight max-w-[205px] tracking-display">
              <span className="w">
                <span className="c" style={{ animationName: 'tc0' }}>W<i className="k" style={{ animationName: 'cc0' }}></i></span>
                <span className="c" style={{ animationName: 'tc1' }}>h<i className="k" style={{ animationName: 'cc1' }}></i></span>
                <span className="c" style={{ animationName: 'tc2' }}>a<i className="k" style={{ animationName: 'cc2' }}></i></span>
                <span className="c" style={{ animationName: 'tc3' }}>t<i className="k" style={{ animationName: 'cc3' }}></i></span>
              </span>{' '}
              <span className="w">
                <span className="c" style={{ animationName: 'tc5' }}>a<i className="k" style={{ animationName: 'cc5' }}></i></span>
                <span className="c" style={{ animationName: 'tc6' }}>r<i className="k" style={{ animationName: 'cc6' }}></i></span>
                <span className="c" style={{ animationName: 'tc7' }}>e<i className="k" style={{ animationName: 'cc7' }}></i></span>
              </span>{' '}
              <span className="w">
                <span className="c" style={{ animationName: 'tc9' }}>y<i className="k" style={{ animationName: 'cc9' }}></i></span>
                <span className="c" style={{ animationName: 'tc10' }}>o<i className="k" style={{ animationName: 'cc10' }}></i></span>
                <span className="c" style={{ animationName: 'tc11' }}>u<i className="k" style={{ animationName: 'cc11' }}></i></span>
              </span>{' '}
              <span className="w">
                <span className="c" style={{ animationName: 'tc13' }}>b<i className="k" style={{ animationName: 'cc13' }}></i></span>
                <span className="c" style={{ animationName: 'tc14' }}>u<i className="k" style={{ animationName: 'cc14' }}></i></span>
                <span className="c" style={{ animationName: 'tc15' }}>y<i className="k" style={{ animationName: 'cc15' }}></i></span>
                <span className="c" style={{ animationName: 'tc16' }}>i<i className="k" style={{ animationName: 'cc16' }}></i></span>
                <span className="c" style={{ animationName: 'tc17' }}>n<i className="k" style={{ animationName: 'cc17' }}></i></span>
                <span className="c" style={{ animationName: 'tc18' }}>g<i className="k" style={{ animationName: 'cc18' }}></i></span>
              </span>{' '}
              <span className="w">
                <span className="c" style={{ animationName: 'tc20' }}>t<i className="k" style={{ animationName: 'cc20' }}></i></span>
                <span className="c" style={{ animationName: 'tc21' }}>o<i className="k" style={{ animationName: 'cc21' }}></i></span>
                <span className="c" style={{ animationName: 'tc22' }}>d<i className="k" style={{ animationName: 'cc22' }}></i></span>
                <span className="c" style={{ animationName: 'tc23' }}>a<i className="k" style={{ animationName: 'cc23' }}></i></span>
                <span className="c" style={{ animationName: 'tc24' }}>y<i className="k" style={{ animationName: 'cc24' }}></i></span>
                <span className="c" style={{ animationName: 'tc25' }}>?<i className="k" style={{ animationName: 'cc25' }}></i></span>
              </span>
            </h1>

            {/* Logo Phase */}
            <div className="lg" aria-hidden="true">
              <Logo tone="onaccent" layout="stacked" align="start" size="md" />
            </div>
          </div>

          {/* SearchBar with Scan Shortcut */}
          <SearchBar
            placeholder="Search name or NAFDAC no."
            onFocus={() => onOpenSearch()}
            onScan={onOpenScan}
          />
        </div>

        {/* Offline Pill Indicator - Shown ONLY when device is offline */}
        {!isOnline && (
          <div className="flex justify-center py-1">
            <OfflinePill state="offline" productCount={totalCount} />
          </div>
        )}

        {/* NAFDAC Safety Alert Banner */}
        {activeAlert && (
          <AlertBanner
            headline={activeAlert.summary}
            meta={`Issued ${activeAlert.issued_date}, nafdac.gov.ng`}
            onClick={() => onOpenAlert(activeAlert)}
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
            <span className="text-[13px] font-bold text-ink-muted">{totalCount.toLocaleString()} products</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {allProducts.map((prod, idx) => (
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
            ))}
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
                You have seen all {totalCount.toLocaleString()} products
              </p>
              <p className="text-[13px] text-ink-muted font-medium">Registry synced {syncDate}</p>
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
