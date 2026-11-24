import React, { useState, useEffect, useLayoutEffect } from 'react';
import { Route, Switch, useLocation, useParams, useSearch } from 'wouter';
import { HomeScreen } from './screens/HomeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SavedScreen } from './screens/SavedScreen';
import { AboutScreen } from './screens/AboutScreen';
import { ResultScreenSkeleton } from './components';
import { Product, SafetyAlert } from './types';
import { initDatabase } from './db';
import { initHaptics } from './lib/haptics';
import { repository } from './data/repository';

interface ResultRouteProps {
  cachedProduct: Product | null;
  onShowToast: (msg: string) => void;
  onBack: () => void;
}

const ResultRoute: React.FC<ResultRouteProps> = ({ cachedProduct, onShowToast, onBack }) => {
  const params = useParams<{ id: string }>();
  const id = params.id ? decodeURIComponent(params.id) : '';
  const [product, setProduct] = useState<Product | null>(
    cachedProduct && (cachedProduct.id === id || cachedProduct.nafdac_reg_num === id) ? cachedProduct : null
  );
  const [loading, setLoading] = useState<boolean>(!product);
  const [notFound, setNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    if (cachedProduct && (cachedProduct.id === id || cachedProduct.nafdac_reg_num === id)) {
      setProduct(cachedProduct);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    repository.getProduct(id).then(async (prod) => {
      if (prod) {
        setProduct(prod);
        setLoading(false);
      } else {
        const lookup = await repository.lookupReg(id);
        if (lookup.result === 'match' && lookup.products.length > 0) {
          setProduct(lookup.products[0]);
          setLoading(false);
        } else {
          setNotFound(true);
          setLoading(false);
        }
      }
    }).catch(() => {
      setNotFound(true);
      setLoading(false);
    });
  }, [id, cachedProduct]);

  if (loading) {
    return <ResultScreenSkeleton />;
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-ground flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center text-ink/40 mb-4">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="font-heading font-black text-ink text-xl mb-2">Product Not Found</h2>
        <p className="font-body text-ink/70 text-sm max-w-xs mb-6">
          We couldn't find a product matching this verification ID or registration number in the registry.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="bg-primary text-ground px-6 py-2.5 rounded-pill font-body font-bold text-sm shadow-sm active:opacity-90"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <ResultScreen
      product={product}
      onBack={onBack}
      onShowToast={onShowToast}
    />
  );
};

const SearchRoute: React.FC<{
  onSelectProduct: (product: Product) => void;
  onOpenScan: () => void;
  onNavigateTab: (tab: 'home' | 'scan' | 'saved' | 'about') => void;
  onBack: () => void;
}> = ({ onSelectProduct, onOpenScan, onNavigateTab, onBack }) => {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('cat') || 'All';

  return (
    <SearchScreen
      key={`${initialQuery}|${initialCategory}`}
      initialQuery={initialQuery}
      initialCategory={initialCategory}
      onSelectProduct={onSelectProduct}
      onBack={onBack}
      onOpenScan={onOpenScan}
      onNavigateTab={onNavigateTab}
    />
  );
};

export const App: React.FC = () => {
  const [location, setLocation] = useLocation();
  const [cachedProduct, setCachedProduct] = useState<Product | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    initDatabase().then(() => initHaptics());
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Direct deep-link backwards compatibility for legacy query parameters (?product=<id> or ?reg=<reg>)
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get('product') || params.get('id');
    const reg = params.get('reg');

    if (prodId) {
      setLocation(`/result/${encodeURIComponent(prodId)}`, { replace: true });
    } else if (reg) {
      repository.lookupReg(reg).then((lookup) => {
        if (lookup.result === 'match' && lookup.products.length > 0) {
          setLocation(`/result/${encodeURIComponent(lookup.products[0].id)}`, { replace: true });
        } else {
          setLocation(`/search?q=${encodeURIComponent(reg)}`, { replace: true });
        }
      });
    }
  }, [setLocation]);

  // Always reset scroll to top on screen transitions
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleNavigateTab = (tab: 'home' | 'scan' | 'saved' | 'about') => {
    if (tab === 'home') {
      setLocation('/');
    } else if (tab === 'scan') {
      setLocation('/scan');
    } else if (tab === 'saved') {
      setLocation('/saved');
    } else if (tab === 'about') {
      setLocation('/about');
    }
  };

  const handleOpenSearch = (initialQuery = '', opts?: { askAi?: boolean; category?: string }) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set('q', initialQuery);
    if (opts?.askAi) params.set('askai', '1');
    if (opts?.category) params.set('cat', opts.category);
    const qs = params.toString();
    setLocation(qs ? `/search?${qs}` : '/search');
  };

  const navigateToProductResult = (product: Product) => {
    setCachedProduct(product);
    setLocation(`/result/${encodeURIComponent(product.id)}`);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/');
    }
  };

  const handleScanResult = async (detectedCode: string) => {
    const lookup = await repository.lookupReg(detectedCode);

    if (lookup.result === 'match' && lookup.products.length > 0) {
      navigateToProductResult(lookup.products[0]);
      showToast(`Verified ${lookup.products[0].nafdac_reg_num}`);
    } else if (lookup.result === 'multiple') {
      setLocation(`/search?q=${encodeURIComponent(detectedCode)}`);
      showToast(`${lookup.products.length} records found for ${detectedCode}`);
    } else {
      setLocation(`/search?q=${encodeURIComponent(detectedCode)}`);
      showToast(`No record found for ${detectedCode}`);
    }
  };

  const handleOpenAlert = async (alert: SafetyAlert) => {
    if (alert.nafdac_reg_num) {
      const prod = await repository.getProduct(alert.nafdac_reg_num);
      if (prod) {
        navigateToProductResult(prod);
        return;
      }
    }

    // Direct alert object view
    navigateToProductResult({
      id: alert.id,
      nafdac_reg_num: alert.nafdac_reg_num || 'Alert Notice',
      normalized_reg_num: alert.nafdac_reg_num ? alert.nafdac_reg_num.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '',
      product_name: alert.product_name,
      brand_name: alert.product_name,
      category: 'Drinks',
      manufacturer: 'Subject of NAFDAC Public Alert',
      status: 'alert',
      kind: 'sachet',
      alert_id: alert.id,
      alert_title: alert.title || alert.product_name,
      alert_meta: `Issued ${alert.issued_date}, nafdac.gov.ng`,
    });
  };

  return (
    <div className="app-container">
      {/* Toast notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-ink text-ground px-4 py-2.5 rounded-pill font-body font-bold text-xs flex items-center gap-3 shadow-lg border border-line/30 animate-fadeIn"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            className="text-surface underline font-bold"
            onClick={() => setToastMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Screen Router */}
      <Switch>
        <Route path="/">
          <HomeScreen
            onNavigateProduct={navigateToProductResult}
            onOpenScan={() => setLocation('/scan')}
            onOpenSearch={handleOpenSearch}
            onNavigateTab={handleNavigateTab}
            onOpenAlert={handleOpenAlert}
          />
        </Route>

        <Route path="/saved">
          <SavedScreen
            onNavigateProduct={navigateToProductResult}
            onNavigateTab={handleNavigateTab}
            onShowToast={showToast}
          />
        </Route>

        <Route path="/about">
          <AboutScreen
            onNavigateTab={handleNavigateTab}
            onShowToast={showToast}
          />
        </Route>

        <Route path="/scan">
          <ScanScreen
            onScanResult={handleScanResult}
            onClose={handleBack}
            onTypeInstead={() => setLocation('/search')}
          />
        </Route>

        <Route path="/search">
          <SearchRoute
            onSelectProduct={navigateToProductResult}
            onOpenScan={() => setLocation('/scan')}
            onNavigateTab={handleNavigateTab}
            onBack={handleBack}
          />
        </Route>

        <Route path="/result/:id">
          <ResultRoute
            cachedProduct={cachedProduct}
            onBack={handleBack}
            onShowToast={showToast}
          />
        </Route>

        {/* Fallback route */}
        <Route>
          <HomeScreen
            onNavigateProduct={navigateToProductResult}
            onOpenScan={() => setLocation('/scan')}
            onOpenSearch={handleOpenSearch}
            onNavigateTab={handleNavigateTab}
            onOpenAlert={handleOpenAlert}
          />
        </Route>
      </Switch>
    </div>
  );
};
