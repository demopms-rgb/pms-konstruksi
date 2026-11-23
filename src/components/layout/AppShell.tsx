import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Calculator,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  FileBarChart2,
  FileCheck2,
  FileDiff,
  FilePlus2,
  FileSignature,
  FileText,
  FolderKanban,
  FolderOpen,
  History,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  Package,
  PackageMinus,
  PackagePlus,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  Settings,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { ContractSubmenuKey, ModuleKey, ProjectSubmenuKey, WarehouseSubmenuKey } from '../../types/pms';
import { formatDateTimeID } from '../../utils/format';
import { ALL_NAV_ITEMS, canCreateContract, getAllowedModules } from '../../utils/permissions';
import { BrandLogo } from '../ui/BrandLogo';
import { PWAInstallButton } from '../ui/PWAInstallButton';

const MODULE_ICONS: Record<ModuleKey, React.FC<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  proyek: FolderKanban,
  kontrak: FileSignature,
  rab: Calculator,
  gudang: Warehouse,
  teknik: Wrench,
  logistik: Package,
  finance: Wallet,
  aset: Truck,
  dokumen: FileText,
  karyawan: Users,
  persetujuan: CheckSquare,
  laporan: BarChart3,
  pengaturan: Settings,
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    activeModule,
    setActiveModule,
    projectSubmenu,
    setProjectSubmenu,
    contractSubmenu,
    setContractSubmenu,
    gudangSubmenu,
    setGudangSubmenu,
    setSelectedProjectId,
    setSelectedContractId,
    setSelectedAssetId,
    setSelectedDocumentId,
    isOnline,
    simulateOffline,
    setSimulateOffline,
    syncOfflineDrafts,
    markNotificationRead,
    markAllNotificationsRead,
    logout,
    toastMessage,
  } = usePMS();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    proyek: true,
    kontrak: false,
    gudang: false,
  });

  const toggleSubmenuGroup = (key: string) => {
    setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allowedKeys = useMemo(() => {
    if (!currentRole || !currentDivision) return ['dashboard'] as ModuleKey[];
    return getAllowedModules(currentRole.code, currentDivision.code);
  }, [currentRole, currentDivision]);

  const allowCreateContract = useMemo(() => {
    if (!currentRole || !currentDivision) return false;
    return canCreateContract(currentRole.code, currentDivision.code);
  }, [currentRole, currentDivision]);

  const navItems = useMemo(
    () =>
      ALL_NAV_ITEMS.filter((item) => allowedKeys.includes(item.key)).map((item) => {
        if (item.key === 'kontrak' && item.submenus && !allowCreateContract) {
          return {
            ...item,
            submenus: item.submenus.filter((sub) => sub.key !== 'pembuatan'),
          };
        }
        return item;
      }),
    [allowedKeys, allowCreateContract]
  );

  const pendingApprovalsCount = useMemo(() => {
    if (!currentRole || !currentDivision) return 0;
    return state.approvals.filter((a) => {
      if (a.status !== 'Menunggu') return false;
      if (currentRole.code === 'SUPER_ADMIN') return true;
      if (currentRole.code === 'HEAD') return a.division_id === currentDivision.id;
      return a.requester_id === currentUser?.id;
    }).length;
  }, [state.approvals, currentRole, currentDivision, currentUser]);

  const pendingDraftsCount = useMemo(
    () => state.offlineDrafts.filter((d) => d.status === 'Menunggu Sinkronisasi').length,
    [state.offlineDrafts]
  );

  const unreadNotifs = useMemo(
    () =>
      state.notifications.filter((n) => {
        if (n.read) return false;
        if (currentRole?.code === 'SUPER_ADMIN') return true;
        if (n.target_division_id && n.target_division_id !== currentDivision?.id) return false;
        if (n.target_role && n.target_role !== 'ALL' && n.target_role !== currentRole?.code) {
          return false;
        }
        return true;
      }),
    [state.notifications, currentRole, currentDivision]
  );

  const navigateTo = (mod: ModuleKey) => {
    setActiveModule(mod);
    if (mod === 'proyek') {
      setProjectSubmenu('daftar');
      setOpenSubmenus((prev) => ({ ...prev, proyek: true }));
    }
    if (mod === 'kontrak') {
      setContractSubmenu('daftar');
      setOpenSubmenus((prev) => ({ ...prev, kontrak: true }));
    }
    if (mod === 'gudang') {
      setGudangSubmenu('dashboard');
      setOpenSubmenus((prev) => ({ ...prev, gudang: true }));
    }
    setSelectedProjectId(null);
    setSelectedContractId(null);
    setSelectedAssetId(null);
    setSelectedDocumentId(null);
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setGlobalQuery('');
  };

  const navigateToSubmenu = (
    mod: ModuleKey,
    subKey: ProjectSubmenuKey | ContractSubmenuKey | WarehouseSubmenuKey
  ) => {
    setActiveModule(mod);
    if (mod === 'proyek') {
      const pSub = subKey as ProjectSubmenuKey;
      setProjectSubmenu(pSub);
      setOpenSubmenus((prev) => ({ ...prev, proyek: true }));
      if (pSub === 'daftar' || pSub === 'tambah') {
        setSelectedProjectId(null);
      }
    } else if (mod === 'kontrak') {
      const cSub = subKey as ContractSubmenuKey;
      setContractSubmenu(cSub);
      setOpenSubmenus((prev) => ({ ...prev, kontrak: true }));
      if (cSub === 'daftar' || cSub === 'pembuatan') {
        setSelectedContractId(null);
      }
    } else if (mod === 'gudang') {
      const gSub = subKey as WarehouseSubmenuKey;
      setGudangSubmenu(gSub);
      setOpenSubmenus((prev) => ({ ...prev, gudang: true }));
    }
    setSelectedAssetId(null);
    setSelectedDocumentId(null);
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setGlobalQuery('');
  };

  const PROJECT_SUBMENU_ICONS: Record<ProjectSubmenuKey, React.FC<{ className?: string }>> = {
    daftar: List,
    tambah: PlusCircle,
    'rab-material': Calculator,
    dokumen: FileText,
    riwayat: History,
  };

  const CONTRACT_SUBMENU_ICONS: Record<ContractSubmenuKey, React.FC<{ className?: string }>> = {
    daftar: List,
    pembuatan: FilePlus2,
    timeline: CalendarRange,
    pengajuan: Send,
    approval: FileCheck2,
    pembayaran: Banknote,
    addendum: FileDiff,
    dokumen: FolderOpen,
    laporan: FileBarChart2,
    riwayat: History,
  };

  const GUDANG_SUBMENU_ICONS: Record<WarehouseSubmenuKey, React.FC<{ className?: string }>> = {
    dashboard: LayoutDashboard,
    'data-barang': Package,
    'stok-barang': Boxes,
    'barang-masuk': PackagePlus,
    'barang-keluar': PackageMinus,
    'permintaan-material': ClipboardList,
    'stok-minimum': AlertTriangle,
    'riwayat-transaksi': History,
    'stok-opname': ClipboardCheck,
    'surat-jalan': Truck,
  };

  const getSubmenuIcon = (mod: ModuleKey, subKey: string) => {
    if (mod === 'kontrak') {
      return CONTRACT_SUBMENU_ICONS[subKey as ContractSubmenuKey] ?? FileText;
    }
    if (mod === 'gudang') {
      return GUDANG_SUBMENU_ICONS[subKey as WarehouseSubmenuKey] ?? Package;
    }
    return PROJECT_SUBMENU_ICONS[subKey as ProjectSubmenuKey] ?? FileText;
  };

  // Interactive Global Search across Menus, Projects, and Documents
  const searchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return null;
    const matchedMenus = navItems.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 4);
    const matchedProjects = state.projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.project_number.toLowerCase().includes(q)
      )
      .slice(0, 4);
    const matchedDocs = state.documents
      .filter(
        (d) => d.title.toLowerCase().includes(q) || d.doc_number.toLowerCase().includes(q)
      )
      .slice(0, 4);
    return { matchedMenus, matchedProjects, matchedDocs };
  }, [globalQuery, navItems, state.projects, state.documents]);

  const mobileBottomKeys: ModuleKey[] = ['dashboard', 'proyek', 'persetujuan'];
  const initials =
    currentUser?.full_name
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('') ?? 'PM';

  const renderSearchDropdown = () => {
    if (!searchResults) return null;
    return (
      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50 space-y-1 text-xs max-h-80 overflow-y-auto">
        {searchResults.matchedMenus.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => navigateTo(m.key)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 font-medium text-slate-800 cursor-pointer flex justify-between"
          >
            <span>Menu: {m.label}</span>
            <span className="text-slate-400">Buka</span>
          </button>
        ))}
        {searchResults.matchedProjects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setActiveModule('proyek');
              setProjectSubmenu('daftar');
              setSelectedProjectId(p.id);
              setGlobalQuery('');
              setMobileSearchOpen(false);
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-800 cursor-pointer truncate"
          >
            <span className="font-mono font-semibold text-blue-700">{p.project_number}</span>{' '}
            · {p.name}
          </button>
        ))}
        {searchResults.matchedDocs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setActiveModule('dokumen');
              setSelectedDocumentId(d.id);
              setGlobalQuery('');
              setMobileSearchOpen(false);
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-800 cursor-pointer truncate"
          >
            <span className="font-mono font-semibold text-amber-700">{d.doc_number}</span>{' '}
            · {d.title}
          </button>
        ))}
        {searchResults.matchedMenus.length === 0 &&
          searchResults.matchedProjects.length === 0 &&
          searchResults.matchedDocs.length === 0 && (
            <p className="px-3 py-2 text-slate-500">Tidak ditemukan hasil yang cocok.</p>
          )}
      </div>
    );
  };

  return (
    <div className="app-shell-root min-h-screen bg-[#F4F7FC] text-slate-900 flex flex-col lg:flex-row overflow-x-hidden">
      {/* Desktop & Laptop Permanent Navy Sidebar (lg: 1024px+) */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-40 bg-[#13233C] text-slate-100 transition-all duration-200 no-print ${
          sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-60'
        }`}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between shrink-0">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="mx-auto font-bold text-[#FBC02D] text-sm cursor-pointer"
              title="Perluas Sidebar"
            >
              PMS
            </button>
          ) : (
            <BrandLogo size="sm" />
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = MODULE_ICONS[item.key];
            const isActive = activeModule === item.key;
            const hasSubmenus = Boolean(item.submenus && item.submenus.length > 0);
            const isGroupOpen = Boolean(openSubmenus[item.key]);
            return (
              <div key={item.key} className="space-y-1">
                <div
                  className={`w-full flex items-center justify-between rounded-xl transition-colors ${
                    isActive
                      ? 'bg-[#FBC02D] text-[#13233C] font-semibold shadow-sm'
                      : 'text-[#E2E8F0] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (hasSubmenus) {
                        if (!isActive) {
                          navigateTo(item.key);
                        } else {
                          toggleSubmenuGroup(item.key);
                        }
                      } else {
                        navigateTo(item.key);
                      }
                    }}
                    title={sidebarCollapsed ? item.description || item.label : item.description}
                    className="flex-1 flex items-center gap-3 min-w-0 px-3.5 py-2.5 text-[13px] font-medium text-left cursor-pointer whitespace-nowrap"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                  {!sidebarCollapsed && item.key === 'persetujuan' && pendingApprovalsCount > 0 && (
                    <span className="mr-3 min-w-[20px] h-5 px-1.5 rounded-full bg-[#EF4444] text-white text-[11px] font-mono font-semibold flex items-center justify-center tabular-nums">
                      {pendingApprovalsCount}
                    </span>
                  )}
                  {!sidebarCollapsed && hasSubmenus && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSubmenuGroup(item.key);
                      }}
                      aria-label={isGroupOpen ? 'Tutup submenu' : 'Buka submenu'}
                      className={`mr-2 p-1 rounded-lg cursor-pointer ${
                        isActive ? 'hover:bg-[#13233C]/10' : 'hover:bg-white/10'
                      }`}
                    >
                      {isGroupOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {!sidebarCollapsed && hasSubmenus && isGroupOpen && (
                  <div className="ml-4 pl-2.5 border-l border-white/15 space-y-0.5 py-1">
                    {item.description && (
                      <p className="px-2 pb-1.5 text-[10px] leading-snug text-slate-300/80">
                        {item.description}
                      </p>
                    )}
                    {item.submenus!.map((sub) => {
                      const SubIcon = getSubmenuIcon(item.key, sub.key);
                      const activeSubVal =
                        item.key === 'kontrak'
                          ? contractSubmenu
                          : item.key === 'gudang'
                          ? gudangSubmenu
                          : projectSubmenu;
                      const isSubActive = isActive && activeSubVal === sub.key;
                      return (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => navigateToSubmenu(item.key, sub.key)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors cursor-pointer ${
                            isSubActive
                              ? 'bg-white/15 text-[#FBC02D] font-semibold'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <SubIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom Division Card matching reference */}
        {!sidebarCollapsed && (
          <div className="p-3.5 shrink-0">
            <div className="rounded-xl bg-[#1D304D] border border-white/10 p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                <Settings className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-300">Divisi Anda:</p>
                <p className="text-xs font-bold text-white truncate">{currentDivision?.name}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Wrapper */}
      <div
        className={`app-shell-content flex-1 min-w-0 flex flex-col min-h-screen pb-16 md:pb-0 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-60'
        }`}
      >
        {/* Top White Search & Profile Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white border-b border-slate-200/80 px-2.5 sm:px-4 lg:px-6 flex items-center justify-between gap-1.5 sm:gap-4 no-print">
          <div className="flex items-center gap-1.5 sm:gap-3 flex-1 min-w-0">
            {/* Desktop Collapse/Expand Toggle (lg+) */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Ubah ukuran sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Tablet & Mobile Hamburger Drawer Trigger (< lg) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-[#13233C] hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="sm:hidden min-w-0">
              <span className="min-[420px]:hidden text-xs font-extrabold text-[#13233C] tracking-tight block">
                PMS
              </span>
              <span className="hidden min-[420px]:block text-sm font-bold text-[#13233C] tracking-tight truncate">
                PMS KONSTRUKSI
              </span>
            </div>

            {/* Interactive Global Search (Tablet & Desktop sm+) */}
            <div className="relative flex-1 max-w-md hidden sm:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Cari proyek, dokumen, atau menu..."
                className="w-full pl-10 pr-3 py-2 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
              />
              {renderSearchDropdown()}
            </div>
          </div>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {/* Mobile Search Toggle (< sm) */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              aria-label="Cari data"
            >
              <Search className="w-4 h-4" />
            </button>

            <PWAInstallButton variant="compact" />

            <button
              type="button"
              onClick={() => setSimulateOffline(!simulateOffline)}
              className={`min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                isOnline
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
              title="Uji mode offline lapangan"
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden md:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </button>

            {pendingDraftsCount > 0 && (
              <button
                type="button"
                onClick={syncOfflineDrafts}
                className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="tabular-nums hidden sm:inline">Sinkron ({pendingDraftsCount})</span>
                <span className="tabular-nums sm:hidden">{pendingDraftsCount}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
              aria-label="Buka pusat notifikasi"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifs.length > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-semibold flex items-center justify-center tabular-nums">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-1 pr-1.5 sm:pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#13233C] text-[#FBC02D] text-xs font-bold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[140px]">
                    {currentUser?.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight truncate max-w-[140px]">
                    {currentRole?.name} · {currentDivision?.name}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {profileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-xs">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="font-bold text-slate-900 truncate">{currentUser?.full_name}</p>
                      <p className="font-mono text-slate-500">{currentUser?.nik}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {currentRole?.name} · {currentDivision?.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigateTo('pengaturan');
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-slate-700 cursor-pointer flex items-center gap-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Pengaturan & Draft Offline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-red-50 text-red-700 font-semibold cursor-pointer flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar Akun</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Expandable Mobile Global Search Bar (< sm) */}
        {mobileSearchOpen && (
          <div className="sm:hidden bg-white border-b border-slate-200 px-3 py-2.5 no-print">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Cari proyek, dokumen, atau menu..."
                autoFocus
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
              />
              {globalQuery && (
                <button
                  type="button"
                  onClick={() => setGlobalQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {renderSearchDropdown()}
            </div>
          </div>
        )}

        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 no-print">
            <div className="flex items-center gap-2">
              <CloudOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Mode Offline Lapangan Aktif:</strong> Input pekerjaan, material, dan dokumen dapat disimpan sebagai draft lokal.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSimulateOffline(false)}
              className="font-semibold underline cursor-pointer"
            >
              Aktifkan Koneksi
            </button>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <main className="app-shell-main flex-1 p-3.5 sm:p-5 lg:p-6 max-w-[1440px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>

      {/* Smartphone Bottom Navigation (< md / 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 h-14 pb-safe no-print">
        {mobileBottomKeys.map((key) => {
          const item = ALL_NAV_ITEMS.find((i) => i.key === key)!;
          const Icon = MODULE_ICONS[key];
          if (!allowedKeys.includes(key)) return null;
          const active = activeModule === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigateTo(key)}
              className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
                active ? 'text-[#13233C] font-bold' : 'text-slate-600'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {key === 'persetujuan' && pendingApprovalsCount > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 min-w-[15px] h-[15px] rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {pendingApprovalsCount}
                  </span>
                )}
              </div>
              <span className="mt-0.5 truncate">{item.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            !mobileBottomKeys.includes(activeModule) ? 'text-[#13233C] font-bold' : 'text-slate-600'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="mt-0.5">Menu</span>
        </button>
      </nav>

      {/* Tablet & Mobile Full Navy Slide-Out Hamburger Drawer (< lg) */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[84vw] bg-[#13233C] text-slate-100 h-full flex flex-col shadow-2xl">
            <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
              <BrandLogo size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-300 hover:text-white rounded-xl hover:bg-white/10 cursor-pointer"
                aria-label="Tutup menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {navItems.map((item) => {
                const Icon = MODULE_ICONS[item.key];
                const isActive = activeModule === item.key;
                const hasSubmenus = Boolean(item.submenus && item.submenus.length > 0);
                const isGroupOpen = Boolean(openSubmenus[item.key]);
                return (
                  <div key={item.key} className="space-y-1">
                    <div
                      className={`w-full min-h-[42px] flex items-center justify-between rounded-xl transition-colors ${
                        isActive
                          ? 'bg-[#FBC02D] text-[#13233C] font-semibold shadow-sm'
                          : 'text-[#E2E8F0] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (hasSubmenus) {
                            if (!isActive) {
                              navigateTo(item.key);
                            } else {
                              toggleSubmenuGroup(item.key);
                            }
                          } else {
                            navigateTo(item.key);
                          }
                        }}
                        className="flex-1 flex items-center gap-3 min-w-0 px-3.5 py-2.5 text-[13px] font-medium text-left cursor-pointer"
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                      {item.key === 'persetujuan' && pendingApprovalsCount > 0 && (
                        <span className="mr-3 min-w-[20px] h-5 px-1.5 rounded-full bg-[#EF4444] text-white text-[11px] font-mono font-semibold flex items-center justify-center tabular-nums">
                          {pendingApprovalsCount}
                        </span>
                      )}
                      {hasSubmenus && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSubmenuGroup(item.key);
                          }}
                          aria-label={isGroupOpen ? 'Tutup submenu' : 'Buka submenu'}
                          className={`mr-2 p-1.5 rounded-lg cursor-pointer ${
                            isActive ? 'hover:bg-[#13233C]/10' : 'hover:bg-white/10'
                          }`}
                        >
                          {isGroupOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {hasSubmenus && isGroupOpen && (
                      <div className="ml-4 pl-2.5 border-l border-white/15 space-y-0.5 py-1">
                        {item.description && (
                          <p className="px-2 pb-1.5 text-[10px] leading-snug text-slate-300/80">
                            {item.description}
                          </p>
                        )}
                        {item.submenus!.map((sub) => {
                          const SubIcon = getSubmenuIcon(item.key, sub.key);
                          const activeSubVal =
                            item.key === 'kontrak'
                              ? contractSubmenu
                              : item.key === 'gudang'
                              ? gudangSubmenu
                              : projectSubmenu;
                          const isSubActive = isActive && activeSubVal === sub.key;
                          return (
                            <button
                              key={sub.key}
                              type="button"
                              onClick={() => navigateToSubmenu(item.key, sub.key)}
                              className={`w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors cursor-pointer ${
                                isSubActive
                                  ? 'bg-white/15 text-[#FBC02D] font-semibold'
                                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <SubIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="p-3.5 border-t border-white/10 space-y-2.5 shrink-0">
              <div className="rounded-xl bg-[#1D304D] border border-white/10 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FBC02D] text-[#13233C] flex items-center justify-center font-bold text-xs shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{currentUser?.full_name}</p>
                  <p className="text-[11px] text-slate-300 truncate">
                    {currentRole?.name} · {currentDivision?.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <PWAInstallButton variant="compact" />
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Notification Center Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex justify-end no-print">
          <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pusat Notifikasi</h3>
                <p className="text-xs text-slate-500">
                  {unreadNotifs.length} notifikasi belum dibaca
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadNotifs.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Tandai Semua Dibaca
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {state.notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markNotificationRead(n.id);
                    if (allowedKeys.includes(n.link_module)) {
                      navigateTo(n.link_module);
                      if (n.project_id && n.link_module === 'proyek') {
                        setSelectedProjectId(n.project_id);
                      }
                    }
                    setNotifOpen(false);
                  }}
                  className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
                    !n.read ? 'bg-blue-50/40' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-blue-700">{n.type}</span>
                    <span className="tabular-nums">{formatDateTimeID(n.created_at)}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 mt-1">{n.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-16 lg:bottom-6 right-4 lg:right-6 z-50 bg-[#13233C] text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 text-xs font-medium flex items-center gap-2.5 max-w-sm no-print">
          <Building2 className="w-4 h-4 text-[#FBC02D] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
