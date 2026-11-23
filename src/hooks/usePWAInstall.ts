import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface ApkPackageInfo {
  available: boolean;
  appName: string;
  version: string;
  versionCode: number;
  packageId: string;
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  builtAt: string | null;
}

declare global {
  interface Window {
    __pmsBeforeInstallPrompt?: BeforeInstallPromptEvent | null;
    __pmsAppInstalled?: boolean;
  }
}

const DEFAULT_APK_INFO: ApkPackageInfo = {
  available: false,
  appName: 'PMS KONSTRUKSI',
  version: '1.0.0',
  versionCode: 1,
  packageId: 'id.pmskonstruksi.app',
  fileName: 'pms-konstruksi.apk',
  downloadUrl: '/downloads/pms-konstruksi.apk',
  sizeBytes: 0,
  builtAt: null,
};

let sharedApkInfo: ApkPackageInfo | null = null;
let sharedApkFetched = false;

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    Boolean(window.__pmsAppInstalled)
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__pmsBeforeInstallPrompt ?? null : null
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone());
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [apkInfo, setApkInfo] = useState<ApkPackageInfo>(() => sharedApkInfo ?? DEFAULT_APK_INFO);
  const [apkLoading, setApkLoading] = useState(!sharedApkFetched);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwReady(Boolean(reg));
      });
    }

    const syncState = () => {
      setDeferredPrompt(window.__pmsBeforeInstallPrompt ?? null);
      setIsInstalled(checkIsStandalone());
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.__pmsBeforeInstallPrompt = e as BeforeInstallPromptEvent;
      syncState();
    };

    const onAppInstalled = () => {
      window.__pmsBeforeInstallPrompt = null;
      window.__pmsAppInstalled = true;
      syncState();
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => syncState();

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('pms:pwa-state-change', syncState);
    if (media.addEventListener) {
      media.addEventListener('change', onDisplayChange);
    }

    syncState();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('pms:pwa-state-change', syncState);
      if (media.removeEventListener) {
        media.removeEventListener('change', onDisplayChange);
      }
    };
  }, []);

  useEffect(() => {
    if (sharedApkFetched && sharedApkInfo) {
      setApkInfo(sharedApkInfo);
      setApkLoading(false);
      return;
    }
    let active = true;
    fetch('/api/app-package/info')
      .then((res) => (res.ok ? res.json() : DEFAULT_APK_INFO))
      .then((data: ApkPackageInfo) => {
        sharedApkInfo = data;
        sharedApkFetched = true;
        if (active) {
          setApkInfo(data);
          setApkLoading(false);
        }
      })
      .catch(() => {
        if (active) setApkLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPrompt ?? window.__pmsBeforeInstallPrompt ?? null;
    if (!promptEvent) return 'unavailable';
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      window.__pmsBeforeInstallPrompt = null;
      window.__pmsAppInstalled = true;
      setDeferredPrompt(null);
      setIsInstalled(true);
      window.dispatchEvent(new CustomEvent('pms:pwa-state-change'));
      return 'accepted';
    }
    return 'dismissed';
  };

  const refreshApkInfo = async () => {
    setApkLoading(true);
    try {
      const res = await fetch('/api/app-package/info');
      if (res.ok) {
        const data: ApkPackageInfo = await res.json();
        sharedApkInfo = data;
        sharedApkFetched = true;
        setApkInfo(data);
      }
    } finally {
      setApkLoading(false);
    }
  };

  return {
    isInstallable: Boolean(deferredPrompt || (typeof window !== 'undefined' && window.__pmsBeforeInstallPrompt)),
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    swReady,
    apkInfo,
    apkLoading,
    refreshApkInfo,
    install,
  };
}
