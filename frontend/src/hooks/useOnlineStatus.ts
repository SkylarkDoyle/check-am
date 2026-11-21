import { useState, useEffect } from 'react';

let currentOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Set<(isOnline: boolean) => void>();

function notify(status: boolean) {
  if (currentOnlineStatus !== status) {
    currentOnlineStatus = status;
    listeners.forEach((listener) => listener(status));
  }
}

/**
 * Actively checks actual internet connectivity by probing external endpoints.
 * This handles cases where:
 * 1. Laptop Wi-Fi is disconnected, but loopback / virtual network adapters (WSL, Hyper-V)
 *    keep navigator.onLine reporting true in Chromium.
 * 2. Device is connected to a local network (LAN) with no internet access.
 */
export async function checkInternetConnectivity(): Promise<boolean> {
  // If the browser/OS explicitly says offline, believe it immediately
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  // Active check 1: Fast zero-content ping to Google 204 with cache-busting timestamp
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(`https://www.google.com/generate_204?_=${Date.now()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return true;
  } catch {
    // Active check 2 (fallback): Cloudflare trace ping if Google is blocked or unreachable
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 1500);
      await fetch(`https://1.1.1.1/cdn-cgi/trace?_=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller2.signal,
      });
      clearTimeout(timeoutId2);
      return true;
    } catch {
      // Both external network requests failed -> definitely offline
      return false;
    }
  }
}

// Set up global listeners and periodic heartbeat
if (typeof window !== 'undefined') {
  const performCheck = () => {
    checkInternetConnectivity().then(notify);
  };

  // Immediate initial verification
  performCheck();

  // Standard window events
  window.addEventListener('online', performCheck);
  window.addEventListener('offline', () => notify(false));

  // Critical for laptops: When user toggles Wi-Fi in OS and clicks back into the browser
  window.addEventListener('focus', performCheck);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performCheck();
    }
  });

  // Custom network error event dispatched by API client
  window.addEventListener('app:network-error', performCheck);

  // Background heartbeat every 2.5 seconds to detect drops without user interaction
  setInterval(performCheck, 2500);
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(currentOnlineStatus);

  useEffect(() => {
    const handleChange = (status: boolean) => setIsOnline(status);
    listeners.add(handleChange);
    // Sync with latest status on mount
    setIsOnline(currentOnlineStatus);

    return () => {
      listeners.delete(handleChange);
    };
  }, []);

  return isOnline;
}

