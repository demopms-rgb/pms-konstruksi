import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Terjadi kesalahan saat merender aplikasi.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[PMS] Root render error:', error);
  }

  private handleRecover = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      localStorage.removeItem('pms_konstruksi_state_v1');
    } catch {
      // ignore cleanup failures
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto font-bold text-lg">
              !
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-bold text-[#13233C]">
                Aplikasi Mengalami Gangguan Tampilan
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                {this.state.message || 'Terjadi gangguan pada cache browser atau data lokal.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={() => void this.handleRecover()}
                className="px-4 py-2 rounded-xl bg-[#0B2C5F] hover:bg-[#133A78] text-white text-xs font-semibold cursor-pointer"
              >
                Bersihkan Cache &amp; Pulihkan
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // Unregister any stale dev/prod service workers left over from prior sessions in dev mode
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  } else if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onOfflineReady() {
        // Static app shell cached safely
      },
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
