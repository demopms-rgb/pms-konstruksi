import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const MAIN_LOGO_SRC = '/assets/aistudio/Logo_PMS_Konstruksi_Modern_2dc57a3c.png';

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    let active = true;
    const minDisplayMs = 1900;
    const maxWaitMs = 3400;
    const startedAt = Date.now();

    const waitForDom = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        const handler = () => resolve();
        window.addEventListener('load', handler, { once: true });
      }
    });

    const waitForLogo = new Promise<void>((resolve) => {
      const img = new Image();
      img.src = MAIN_LOGO_SRC;
      if (img.complete) {
        resolve();
        return;
      }
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });

    let finishTimer: number | undefined;
    let safetyTimer: number | undefined;

    const triggerExit = () => {
      if (!active) return;
      setFadingOut(true);
      finishTimer = window.setTimeout(() => {
        if (active) onComplete();
      }, 360);
    };

    safetyTimer = window.setTimeout(triggerExit, maxWaitMs);

    Promise.all([waitForDom, waitForLogo]).then(() => {
      if (!active) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, minDisplayMs - elapsed);
      window.setTimeout(triggerExit, remaining);
    });

    return () => {
      active = false;
      if (finishTimer) window.clearTimeout(finishTimer);
      if (safetyTimer) window.clearTimeout(safetyTimer);
    };
  }, [onComplete]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Menyiapkan aplikasi PMS Konstruksi"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between px-6 py-8 sm:py-12 bg-gradient-to-b from-white via-[#F8FAFF] to-[#EEF4FF] transition-opacity duration-350 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top subtle navy & orange identity accent strip */}
      <div className="w-full max-w-xs h-1 rounded-full overflow-hidden flex opacity-85">
        <div className="w-2/3 h-full bg-[#0B2C5F]" />
        <div className="w-1/3 h-full bg-[#F97316]" />
      </div>

      {/* Centered Brand Presentation */}
      <div className="w-full max-w-md flex flex-col items-center text-center my-auto py-6">
        <div className="w-full flex items-center justify-center px-2">
          <img
            src={MAIN_LOGO_SRC}
            alt="Logo PMS Konstruksi — Project Management System"
            className="w-[240px] sm:w-[320px] md:w-[360px] max-w-[82vw] h-auto object-contain select-none drop-shadow-[0_8px_24px_rgba(11,44,95,0.06)]"
          />
        </div>

        <div className="mt-5 space-y-1.5">
          <h1 className="text-base sm:text-lg font-extrabold tracking-[0.18em] text-[#0B2C5F] uppercase">
            PMS KONSTRUKSI
          </h1>
          <p className="text-[11px] sm:text-xs font-bold tracking-[0.26em] text-[#F97316] uppercase">
            PROJECT MANAGEMENT SYSTEM
          </p>
          <p className="text-xs font-semibold text-slate-600 pt-1">
            PT. Wilwa Abiyasa Sejahtera
          </p>
        </div>

        {/* Smooth Compositor Loading Indicator */}
        <div className="mt-8 w-48 sm:w-56 space-y-2.5">
          <div className="w-full h-1.5 rounded-full bg-[#0B2C5F]/10 overflow-hidden relative">
            <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#0B2C5F] via-[#1D4ED8] to-[#F97316] pms-splash-bar" />
          </div>
          <p className="text-xs font-medium text-[#13233C]/80 tracking-wide">
            Menyiapkan aplikasi...
          </p>
        </div>
      </div>

      {/* Clean Corporate Footer */}
      <p className="text-[11px] font-medium text-slate-500 text-center">
        Sistem Manajemen Proyek Pembangunan & Renovasi Gedung
      </p>
    </div>
  );
};
