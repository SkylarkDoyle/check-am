import React, { useState, useEffect } from 'react';
import {
  Logo,
  KeyValueRow,
  SettingRow,
  Toggle,
  Button,
  Disclaimer,
  TabBar,
  BottomSheet
} from '../components';
import { db } from '../db';
import { repository } from '../data/repository';
import { runSync, subscribeSyncStatus, SyncStatus } from '../data/sync';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface AboutScreenProps {
  onNavigateTab: (tab: 'home' | 'scan' | 'saved' | 'about') => void;
  onShowToast: (msg: string) => void;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({
  onNavigateTab,
  onShowToast,
}) => {
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [productCount, setProductCount] = useState(3618);
  const [lastSynced, setLastSynced] = useState('18 Nov 2026');
  const [savedCount, setSavedCount] = useState(0);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const { isStandalone, isIos, promptInstall } = usePwaInstall();

  useEffect(() => {
    db.settings.get('autoUpdate').then((res) => {
      if (res !== undefined) setAutoUpdate(res.value);
    });

    repository.getCatalogMeta().then((meta) => {
      setProductCount(meta.count);
      setLastSynced(meta.lastSynced);
    });

    repository.listSavedChecks().then((checks) => {
      setSavedCount(checks.length);
    });

    const unsubscribe = subscribeSyncStatus((status: SyncStatus) => {
      if (status.state === 'checking' || status.state === 'downloading' || status.state === 'applying') {
        setIsUpdating(true);
      } else {
        setIsUpdating(false);
        if (status.state === 'done') {
          repository.getCatalogMeta().then((meta) => {
            setProductCount(meta.count);
            setLastSynced(meta.lastSynced);
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleToggleAutoUpdate = async (checked: boolean) => {
    setAutoUpdate(checked);
    await db.settings.put({ key: 'autoUpdate', value: checked });
    onShowToast(checked ? 'Automatic catalog updates enabled' : 'Automatic updates paused');
  };

  const handleUpdateNow = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    onShowToast('Checking for registry updates…');
    const updated = await runSync(true);
    setIsUpdating(false);
    if (updated) {
      onShowToast('Offline catalog successfully updated');
    } else {
      onShowToast('Offline catalog is up to date');
    }
  };

  const handleClearSaved = async () => {
    await repository.clearSavedChecks();
    setSavedCount(0);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:saved-checks-updated'));
    }
    onShowToast('All saved checks cleared');
  };

  const handleInstallApp = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      onShowToast('CheckAm installed successfully');
    } else if (outcome === 'ios') {
      setShowIosSheet(true);
    } else if (outcome === 'unavailable') {
      onShowToast('Install option is accessible in your browser menu');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-28 pt-2">
      {/* Top action bar matching Doop frame MzZJw04rJ6 */}
      <div className="bar">
        <button
          type="button"
          className="rb"
          aria-label="Back to home"
          onClick={() => onNavigateTab('home')}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7"/>
          </svg>
        </button>
        <b>About</b>
        <span style={{ width: 44 }} aria-hidden="true"></span>
      </div>

      <main className="main flex flex-col gap-7 px-4">
        {/* Brand Header */}
        <div className="hd">
          <Logo layout="stacked" size="lg" tone="reversed" />
          <p>Check am now</p>
          <small>VERSION 1.0.0</small>
        </div>

        {/* Section 1: OFFLINE CATALOG */}
        <div className="flex flex-col gap-2">
          <div className="lbl">OFFLINE CATALOG</div>
          <div className="panel">
            <KeyValueRow label="On this phone" value={`${productCount.toLocaleString()} products`} />
            <KeyValueRow label="Last synced" value={lastSynced} />
            <SettingRow
              title="Update automatically"
              detail="Fetch registry changes whenever you have signal."
            >
              <Toggle checked={autoUpdate} onChange={handleToggleAutoUpdate} />
            </SettingRow>
            <div style={{ padding: 'var(--spacing-1) 0 var(--spacing-3)' }}>
              <Button
                label={isUpdating ? 'Updating catalog...' : 'Update catalog now'}
                tone="secondary"
                width="full"
                onClick={handleUpdateNow}
                disabled={isUpdating}
              />
            </div>
          </div>
        </div>

        {/* Section 2: APP INSTALLATION */}
        <div className="flex flex-col gap-2">
          <div className="lbl">APP INSTALLATION</div>
          <div className="panel">
            <SettingRow
              title={isStandalone ? "Installed on phone" : "Add CheckAm to phone"}
              detail={
                isStandalone
                  ? "Running in standalone mode with full offline database access."
                  : "Install on your home screen for quick 1-tap pack verification."
              }
            >
              {isStandalone ? (
                <span className="always" style={{ background: 'var(--color-ok-bg)', color: 'var(--color-ok)', borderColor: 'var(--color-ok)' }}>
                  INSTALLED
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="px-3.5 py-1.5 bg-accent text-on-accent rounded-full text-xs font-bold shadow-sm hover:opacity-95 active:scale-95 transition-transform"
                >
                  Install
                </button>
              )}
            </SettingRow>
          </div>
        </div>

        {/* Section 3: PRIVACY AND DATA */}
        <div className="flex flex-col gap-2">
          <div className="lbl">PRIVACY AND DATA</div>
          <div className="panel">
            <SettingRow
              title="Photos stay on this phone"
              detail="Label numbers are read on your phone. Nothing is uploaded."
            >
              <span className="always">ALWAYS</span>
            </SettingRow>
            <SettingRow
              title="No account needed"
              detail="No sign-in, no personal details collected."
            >
              <span className="always">ALWAYS</span>
            </SettingRow>
            <div style={{ padding: 'var(--spacing-2) 0 var(--spacing-3)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 'var(--spacing-2)' }}>
                {savedCount} {savedCount === 1 ? 'check is' : 'checks are'} saved on this phone only.
              </div>
              <Button
                label="Clear saved checks"
                tone="secondary"
                width="full"
                onClick={handleClearSaved}
              />
            </div>
          </div>
        </div>

        {/* Section 3: SOURCES AND LEGAL */}
        <div className="flex flex-col gap-2">
          <div className="lbl">SOURCES AND LEGAL</div>
          <div className="panel">
            <KeyValueRow label="Registry data" value="NAFDAC public registry" />
            <KeyValueRow label="Public alerts" value="nafdac.gov.ng" />
            <div className="mt-2">
              <Disclaimer />
            </div>
          </div>
        </div>
      </main>

      <div style={{ height: 'var(--spacing-5)' }}></div>

      {/* iOS Safari Instructions Sheet */}
      {isIos && (
        <BottomSheet
          isOpen={showIosSheet}
          onClose={() => setShowIosSheet(false)}
          title="Add CheckAm to Home Screen"
        >
          <div className="flex flex-col gap-4 py-2 text-ink">
            <p className="text-sm text-ink-muted">
              To install CheckAm on your iPhone or iPad, follow these simple steps in Safari:
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">1</span>
                <div className="text-sm">
                  Tap the <strong className="font-bold">Share</strong> button in Safari's bottom toolbar.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">2</span>
                <div className="text-sm">
                  Scroll down the share sheet and tap <strong className="font-bold">Add to Home Screen</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center flex-none">3</span>
                <div className="text-sm">
                  Tap <strong className="font-bold">Add</strong> in the top right corner. CheckAm will appear as an app on your screen!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosSheet(false)}
              className="mt-2 w-full py-2.5 bg-accent text-on-accent font-bold rounded-full text-sm"
            >
              Got it
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Persistent Bottom TabBar */}
      <TabBar active="about" onSelect={onNavigateTab} />
    </div>
  );
};
