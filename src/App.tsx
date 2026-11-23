import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { LoginPage } from './components/auth/LoginPage';
import { SplashScreen } from './components/auth/SplashScreen';
import { AppShell } from './components/layout/AppShell';
import { AsetModule } from './components/modules/AsetModule';
import { DashboardModule } from './components/modules/DashboardModule';
import { DokumenModule } from './components/modules/DokumenModule';
import { FinanceModule } from './components/modules/FinanceModule';
import { GudangModule } from './components/modules/GudangModule';
import { KaryawanModule } from './components/modules/KaryawanModule';
import { KontrakModule } from './components/modules/KontrakModule';
import { LaporanModule } from './components/modules/LaporanModule';
import { LogistikModule } from './components/modules/LogistikModule';
import { PengaturanModule } from './components/modules/PengaturanModule';
import { PersetujuanModule } from './components/modules/PersetujuanModule';
import { ProyekModule } from './components/modules/ProyekModule';
import { RABModule } from './components/modules/RABModule';
import { TeknikModule } from './components/modules/TeknikModule';
import { GlobalAttachmentModal } from './components/attachments/ModuleAttachmentButton';
import { AttachmentProvider } from './context/AttachmentContext';
import { PMSProvider, usePMS } from './context/PMSContext';
import {
  canAccessLogistikModule,
  canAccessTeknikModule,
  getAllowedModules,
} from './utils/permissions';

const ActiveModuleView: React.FC = () => {
  const { currentUser, currentRole, currentDivision, activeModule, setActiveModule } = usePMS();

  if (!currentUser || !currentRole || !currentDivision) {
    return <LoginPage />;
  }

  const allowed = getAllowedModules(currentRole.code, currentDivision.code);
  const canOpenTeknik = canAccessTeknikModule(currentRole.code, currentDivision.code);
  const canOpenLogistik = canAccessLogistikModule(currentRole.code, currentDivision.code);
  const safeModule = allowed.includes(activeModule) ? activeModule : 'dashboard';

  const renderModule = () => {
    if (activeModule === 'teknik' && !canOpenTeknik) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto mt-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3 border border-rose-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Akses Modul Teknik Ditolak</h2>
          <p className="text-sm text-slate-600 mt-1.5">
            Modul Teknik hanya dapat dibuka dan digunakan oleh{' '}
            <span className="font-semibold">Head Teknik</span>,{' '}
            <span className="font-semibold">Staff Teknik</span>, dan{' '}
            <span className="font-semibold">Super Admin</span>. Divisi lain tidak memiliki izin
            akses ke halaman maupun fungsi internal modul Teknik.
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="mt-5 px-4 py-2 rounded-lg bg-[#13233C] text-white text-sm font-semibold hover:bg-[#1D304D] cursor-pointer whitespace-nowrap"
          >
            Kembali ke Dashboard
          </button>
        </div>
      );
    }

    if (activeModule === 'logistik' && !canOpenLogistik) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto mt-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3 border border-rose-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Akses Modul Logistik Ditolak</h2>
          <p className="text-sm text-slate-600 mt-1.5">
            Modul Logistik hanya dapat dibuka dan digunakan oleh{' '}
            <span className="font-semibold">Head Logistik</span>,{' '}
            <span className="font-semibold">Staff Logistik</span>, dan{' '}
            <span className="font-semibold">Super Admin</span>. Divisi lain tidak memiliki izin
            akses ke halaman maupun fungsi internal modul Logistik.
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="mt-5 px-4 py-2 rounded-lg bg-[#13233C] text-white text-sm font-semibold hover:bg-[#1D304D] cursor-pointer whitespace-nowrap"
          >
            Kembali ke Dashboard
          </button>
        </div>
      );
    }

    switch (safeModule) {
      case 'dashboard':
        return <DashboardModule />;
      case 'proyek':
        return <ProyekModule />;
      case 'kontrak':
        return <KontrakModule />;
      case 'rab':
        return <RABModule />;
      case 'gudang':
        return <GudangModule />;
      case 'teknik':
        return <TeknikModule />;
      case 'logistik':
        return <LogistikModule />;
      case 'finance':
        return <FinanceModule />;
      case 'aset':
        return <AsetModule />;
      case 'dokumen':
        return <DokumenModule />;
      case 'karyawan':
        return <KaryawanModule />;
      case 'persetujuan':
        return <PersetujuanModule />;
      case 'laporan':
        return <LaporanModule />;
      case 'pengaturan':
        return <PengaturanModule />;
      default:
        return <DashboardModule />;
    }
  };

  return (
    <AppShell>
      {renderModule()}
      <GlobalAttachmentModal />
    </AppShell>
  );
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <PMSProvider>
      <AttachmentProvider>
        <ActiveModuleView />
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AttachmentProvider>
    </PMSProvider>
  );
}
