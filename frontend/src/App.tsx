import React, { useState, useEffect, useLayoutEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SavedScreen } from './screens/SavedScreen';
import { AboutScreen } from './screens/AboutScreen';
import { Product, SafetyAlert } from './types';
import { initDatabase } from './db';
import { repository } from './data/repository';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'scan' | 'saved' | 'about'>('home');
  const [currentScreen, setCurrentScreen] = useState<'home' | 'result' | 'search' | 'scan' | 'saved' | 'about'>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    initDatabase();
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Always reset scroll to top on screen transitions
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentScreen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleNavigateTab = (tab: 'home' | 'scan' | 'saved' | 'about') => {
    setActiveTab(tab);
    if (tab === 'home') {
      setCurrentScreen('home');
    } else if (tab === 'scan') {
      setCurrentScreen('scan');
    } else if (tab === 'saved') {
      setCurrentScreen('saved');
    } else if (tab === 'about') {
      setCurrentScreen('about');
    }
  };

  const handleOpenSearch = (initialQuery = '') => {
    setSearchInitialQuery(initialQuery);
    setCurrentScreen('search');
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentScreen('result');
  };

  const handleScanResult = async (detectedCode: string) => {
    const lookup = await repository.lookupReg(detectedCode);

    if (lookup.result === 'match' && lookup.products.length > 0) {
      setSelectedProduct(lookup.products[0]);
      setCurrentScreen('result');
      showToast(`Verified ${lookup.products[0].nafdac_reg_num}`);
    } else if (lookup.result === 'multiple') {
      // Multiple products share this registration number -> navigate to Search results list
      setSearchInitialQuery(detectedCode);
      setCurrentScreen('search');
      showToast(`${lookup.products.length} records found for ${detectedCode}`);
    } else {
      // Unrecognized / Not Found -> open SearchScreen with the detected code to show "No match found" view
      setSearchInitialQuery(detectedCode);
      setCurrentScreen('search');
      showToast(`No record found for ${detectedCode}`);
    }
  };

  const handleOpenAlert = async (alert: SafetyAlert) => {
    if (alert.nafdac_reg_num) {
      const prod = await repository.getProduct(alert.nafdac_reg_num);
      if (prod) {
        setSelectedProduct(prod);
        setCurrentScreen('result');
        return;
      }
    }

    // Direct alert object view
    setSelectedProduct({
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
    setCurrentScreen('result');
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
      {currentScreen === 'home' && (
        <HomeScreen
          onNavigateProduct={handleSelectProduct}
          onOpenScan={() => setCurrentScreen('scan')}
          onOpenSearch={handleOpenSearch}
          onNavigateTab={handleNavigateTab}
          onOpenAlert={handleOpenAlert}
        />
      )}

      {currentScreen === 'search' && (
        <SearchScreen
          initialQuery={searchInitialQuery}
          onSelectProduct={handleSelectProduct}
          onBack={() => handleNavigateTab('home')}
          onOpenScan={() => setCurrentScreen('scan')}
          onNavigateTab={handleNavigateTab}
        />
      )}

      {currentScreen === 'scan' && (
        <ScanScreen
          onScanResult={handleScanResult}
          onClose={() => handleNavigateTab('home')}
          onTypeInstead={() => {
            setSearchInitialQuery('');
            setCurrentScreen('search');
          }}
        />
      )}

      {currentScreen === 'result' && selectedProduct && (
        <ResultScreen
          product={selectedProduct}
          onBack={() => {
            if (activeTab === 'saved') {
              setCurrentScreen('saved');
            } else {
              handleNavigateTab('home');
            }
          }}
          onShowToast={showToast}
        />
      )}

      {currentScreen === 'saved' && (
        <SavedScreen
          onNavigateProduct={handleSelectProduct}
          onNavigateTab={handleNavigateTab}
          onShowToast={showToast}
        />
      )}

      {currentScreen === 'about' && (
        <AboutScreen
          onNavigateTab={handleNavigateTab}
          onShowToast={showToast}
        />
      )}
    </div>
  );
};
