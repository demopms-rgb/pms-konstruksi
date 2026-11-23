import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  FileSignature,
  FileText,
  FolderKanban,
  Inbox,
  Package,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { isStaticSamplePhotoUrl, useAttachments } from '../../context/AttachmentContext';
import { formatDateTimeID, formatNumber, formatRupiah, getWorkflowStageMeta } from '../../utils/format';
import { getAllowedModules } from '../../utils/permissions';
import { StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ProtectedAttachmentImage } from '../attachments/ProtectedAttachmentImage';

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export const DashboardModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    setActiveModule,
    setGudangSubmenu,
    setSelectedProjectId,
    setSelectedDocumentId,
  } = usePMS();
  const { getAttachmentsFor, getLatestPhotoFor } = useAttachments();

  const [selectedProgressProject, setSelectedProgressProject] = useState<string>('SEMUA');
  const [financePeriod, setFinancePeriod] = useState<'TAHUN_INI' | 'SEMUA'>('TAHUN_INI');

  const allowed = useMemo(() => {
    if (!currentRole || !currentDivision) return [];
    return getAllowedModules(currentRole.code, currentDivision.code);
  }, [currentRole, currentDivision]);

  const visibleProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );
  const activeProjects = visibleProjects.filter(
    (p) =>
      p.status === 'Dalam Pengerjaan' ||
      p.status === 'Berjalan' ||
      p.status === 'Review Finance'
  );
  const completedProjects = visibleProjects.filter((p) => p.status === 'Selesai');
  const visibleContracts = state.contracts.filter((c) => !c.is_deleted);
  const visibleContractIds = new Set(visibleContracts.map((c) => c.id));
  const activeContracts = visibleContracts.filter(
    (c) => c.status === 'Aktif' || c.status === 'Akan Berakhir'
  );

  const totalProjectsCount = Math.max(1, visibleProjects.length);
  const activeProjectShare = Math.round((activeProjects.length / totalProjectsCount) * 100);
  const completedProjectShare = Math.round((completedProjects.length / totalProjectsCount) * 100);
  const completedWorkCount = state.workItems.filter(
    (w) => !w.is_deleted && w.status === 'Selesai'
  ).length;
  const pendingTermCount = state.contractTerms.filter(
    (t) => visibleContractIds.has(t.contract_id) && t.payment_status === 'Menunggu Verifikasi'
  ).length;
  const activeContractShare =
    visibleContracts.length > 0
      ? Math.round((activeContracts.length / visibleContracts.length) * 100)
      : 0;

  const avgWorkProgress = useMemo(() => {
    const list =
      selectedProgressProject === 'SEMUA'
        ? visibleProjects
        : visibleProjects.filter((p) => p.id === selectedProgressProject);
    if (list.length === 0) return 0;
    return Math.round(list.reduce((acc, p) => acc + p.progress_percent, 0) / list.length);
  }, [visibleProjects, selectedProgressProject]);

  // Breakdown for Donut Chart (Selesai, Dalam Proses, Belum Mulai)
  const donutMetrics = useMemo(() => {
    const completedShare = avgWorkProgress;
    const inProgressShare = Math.min(
      100 - completedShare,
      Math.round((100 - completedShare) * 0.72)
    );
    const notStartedShare = Math.max(0, 100 - completedShare - inProgressShare);
    return {
      completed: completedShare,
      inProgress: inProgressShare,
      notStarted: notStartedShare,
    };
  }, [avgWorkProgress]);

  const pendingApprovals = useMemo(() => {
    return state.approvals.filter((a) => {
      if (a.status !== 'Menunggu') return false;
      if (currentRole?.code === 'SUPER_ADMIN') return true;
      if (currentRole?.code === 'HEAD') return a.division_id === currentDivision?.id;
      return a.requester_id === currentUser?.id;
    });
  }, [state.approvals, currentRole, currentDivision, currentUser]);

  const lowStockMaterials = state.materials.filter((m) => m.stock <= m.min_stock);

  const filteredFinanceTx = useMemo(() => {
    if (financePeriod === 'SEMUA') return state.financialTransactions;
    return state.financialTransactions.filter((f) => f.date.startsWith('2026'));
  }, [state.financialTransactions, financePeriod]);

  const totalIncome = filteredFinanceTx
    .filter((f) => f.type === 'Pemasukan' && f.status === 'Terverifikasi')
    .reduce((acc, f) => acc + f.amount, 0);
  const totalExpense = filteredFinanceTx
    .filter((f) => f.type === 'Pengeluaran' && f.status !== 'Ditolak')
    .reduce((acc, f) => acc + f.amount, 0);

  // Dual-line chart points across Jan–Jun (derived from filtered cashflow totals)
  const chartMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];
  const incomeSeries = useMemo(() => {
    const base = Math.max(1, totalIncome / 1_000_000);
    return [0.22, 0.35, 0.31, 0.56, 0.78, 0.94].map((f) => Number((base * f).toFixed(2)));
  }, [totalIncome]);
  const expenseSeries = useMemo(() => {
    const base = Math.max(1, totalExpense / 1_000_000);
    return [0.16, 0.24, 0.42, 0.45, 0.51, 0.48].map((f) => Number((base * f).toFixed(2)));
  }, [totalExpense]);

  const maxChartVal = Math.max(...incomeSeries, ...expenseSeries, 1);

  const incomePoints = useMemo(
    () =>
      incomeSeries.map((val, idx) => ({
        x: 28 + idx * 74,
        y: 114 - (val / maxChartVal) * 84,
      })),
    [incomeSeries, maxChartVal]
  );

  const expensePoints = useMemo(
    () =>
      expenseSeries.map((val, idx) => ({
        x: 28 + idx * 74,
        y: 114 - (val / maxChartVal) * 84,
      })),
    [expenseSeries, maxChartVal]
  );

  const incomeSmoothPath = buildSmoothPath(incomePoints);
  const expenseSmoothPath = buildSmoothPath(expensePoints);
  const incomeAreaPath =
    incomePoints.length > 0
      ? `${incomeSmoothPath} L ${incomePoints[incomePoints.length - 1].x} 118 L ${incomePoints[0].x} 118 Z`
      : '';

  // SVG Donut geometry
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const seg1 = (donutMetrics.completed / 100) * circumference;
  const seg2 = (donutMetrics.inProgress / 100) * circumference;
  const seg3 = (donutMetrics.notStarted / 100) * circumference;

  const firstName = currentUser?.full_name.split(',')[0] ?? 'Pengguna';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Greeting Header & Date Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-[26px] font-bold text-[#13233C] tracking-tight">
            Halo, {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Selamat datang di PMS Konstruksi · {currentRole?.name} ({currentDivision?.name}). Berikut ringkasan aktivitas hari ini.
          </p>
        </div>

        <div className="inline-flex items-center gap-3 bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] self-start md:self-auto">
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#13233C] flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-slate-900">Selasa, 17 November 2026</p>
            <p className="text-slate-500 font-mono tabular-nums">Operasional · WIB</p>
          </div>
        </div>
      </div>

      {/* Top 4 Modern Statistic Cards matching Reference */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Proyek */}
        <button
          type="button"
          onClick={() => allowed.includes('proyek') && setActiveModule('proyek')}
          className="group relative overflow-hidden text-left rounded-2xl p-3.5 sm:p-5 bg-gradient-to-br from-[#2B80F7] via-[#1E6AE5] to-[#1554C4] text-white shadow-[0_6px_18px_-6px_rgba(29,122,252,0.45)] hover:shadow-[0_10px_22px_-6px_rgba(29,122,252,0.55)] transition-all cursor-pointer"
        >
          <div className="flex items-start gap-2.5 sm:gap-3.5 relative z-10">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/22 ring-1 ring-white/30 backdrop-blur-xs text-white flex items-center justify-center shrink-0">
              <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-blue-100 truncate">
                Total Proyek
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-0.5 leading-tight">
                {visibleProjects.length}
              </p>
              <p className="text-[10px] sm:text-[11px] text-blue-100/95 mt-1 inline-flex items-center gap-0.5 tabular-nums truncate max-w-full">
                <ArrowUpRight className="w-3 h-3 text-emerald-300 shrink-0" />
                <span className="truncate">
                  {activeProjectShare}% aktif · {activeProjects.length} proses
                </span>
              </p>
            </div>
          </div>
          {/* Skyline Construction Watermark */}
          <svg
            viewBox="0 0 96 64"
            className="w-16 h-12 sm:w-24 sm:h-16 text-white/15 absolute right-1 bottom-0 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="8" y="26" width="16" height="38" rx="1.5" />
            <rect x="28" y="10" width="20" height="54" rx="1.5" />
            <rect x="52" y="20" width="18" height="44" rx="1.5" />
            <rect x="74" y="34" width="14" height="30" rx="1.5" />
          </svg>
        </button>

        {/* Card 2: Proyek Selesai */}
        <button
          type="button"
          onClick={() => allowed.includes('proyek') && setActiveModule('proyek')}
          className="group relative overflow-hidden text-left rounded-2xl p-3.5 sm:p-5 bg-gradient-to-br from-[#20C485] via-[#15AD71] to-[#0D925D] text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.42)] hover:shadow-[0_10px_22px_-6px_rgba(16,185,129,0.52)] transition-all cursor-pointer"
        >
          <div className="flex items-start gap-2.5 sm:gap-3.5 relative z-10">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/22 ring-1 ring-white/30 backdrop-blur-xs text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-emerald-100 truncate">
                Proyek Selesai
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-0.5 leading-tight">
                {completedProjects.length}
              </p>
              <p className="text-[10px] sm:text-[11px] text-emerald-100/95 mt-1 inline-flex items-center gap-0.5 tabular-nums truncate max-w-full">
                <ArrowUpRight className="w-3 h-3 text-white shrink-0" />
                <span className="truncate">
                  {completedProjectShare}% tuntas · {completedWorkCount} kerja
                </span>
              </p>
            </div>
          </div>
          {/* Building Structure Watermark */}
          <svg
            viewBox="0 0 96 64"
            className="w-16 h-12 sm:w-24 sm:h-16 text-white/15 absolute right-1 bottom-0 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="44" y="14" width="6" height="50" />
            <rect x="16" y="12" width="66" height="5" rx="1" />
            <polygon points="47,4 28,12 66,12" />
            <rect x="22" y="17" width="2" height="16" />
            <rect x="18" y="33" width="10" height="8" rx="1" />
          </svg>
        </button>

        {/* Card 3: Proyek Proses */}
        <button
          type="button"
          onClick={() => allowed.includes('teknik') && setActiveModule('teknik')}
          className="group relative overflow-hidden text-left rounded-2xl p-3.5 sm:p-5 bg-gradient-to-br from-[#F99B32] via-[#EC841B] to-[#D66C0B] text-white shadow-[0_6px_18px_-6px_rgba(245,158,11,0.42)] hover:shadow-[0_10px_22px_-6px_rgba(245,158,11,0.52)] transition-all cursor-pointer"
        >
          <div className="flex items-start gap-2.5 sm:gap-3.5 relative z-10">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/22 ring-1 ring-white/30 backdrop-blur-xs text-white flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-amber-100 truncate">
                Proyek Proses
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-0.5 leading-tight">
                {activeProjects.length}
              </p>
              <p className="text-[10px] sm:text-[11px] text-amber-100/95 mt-1 inline-flex items-center gap-0.5 tabular-nums truncate max-w-full">
                <ArrowUpRight className="w-3 h-3 text-white shrink-0" />
                <span className="truncate">
                  {state.workItems.filter((w) => !w.is_deleted).length} paket · {state.materialRequests.length} req
                </span>
              </p>
            </div>
          </div>
          {/* Construction Work Progress Watermark */}
          <svg
            viewBox="0 0 96 64"
            className="w-16 h-12 sm:w-24 sm:h-16 text-white/15 absolute right-1 bottom-0 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="28" y="46" width="44" height="12" rx="6" />
            <rect x="38" y="28" width="26" height="18" rx="3" />
            <path d="M40 34 L22 18 L12 34 L18 38 L24 26 L36 38 Z" />
          </svg>
        </button>

        {/* Card 4: Kontrak Aktif */}
        <button
          type="button"
          onClick={() => allowed.includes('kontrak') && setActiveModule('kontrak')}
          className="group relative overflow-hidden text-left rounded-2xl p-3.5 sm:p-5 bg-gradient-to-br from-[#945AF6] via-[#7E42EB] to-[#652AD1] text-white shadow-[0_6px_18px_-6px_rgba(124,58,237,0.42)] hover:shadow-[0_10px_22px_-6px_rgba(124,58,237,0.52)] transition-all cursor-pointer"
        >
          <div className="flex items-start gap-2.5 sm:gap-3.5 relative z-10">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/22 ring-1 ring-white/30 backdrop-blur-xs text-white flex items-center justify-center shrink-0">
              <FileSignature className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-purple-100 truncate">
                Kontrak Aktif
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-0.5 leading-tight">
                {activeContracts.length}
              </p>
              <p className="text-[10px] sm:text-[11px] text-purple-100/95 mt-1 inline-flex items-center gap-0.5 tabular-nums truncate max-w-full">
                <ArrowUpRight className="w-3 h-3 text-emerald-300 shrink-0" />
                <span className="truncate">
                  {activeContractShare}% aktif · {pendingTermCount} verifikasi
                </span>
              </p>
            </div>
          </div>
          {/* Contract & Seal Watermark */}
          <svg
            viewBox="0 0 96 64"
            className="w-16 h-12 sm:w-24 sm:h-16 text-white/15 absolute right-1 bottom-0 pointer-events-none"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="34" y="14" width="38" height="46" rx="4" />
            <circle cx="72" cy="46" r="12" />
          </svg>
        </button>
      </div>

      {/* Middle Row: Progress Proyek (Donut) + Permintaan Menunggu Persetujuan / Status Pengajuan Saya */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Progress Proyek Donut Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-[#13233C]">Progress Proyek</h2>
              <p className="text-[11px] text-slate-500">Distribusi capaian fisik pekerjaan</p>
            </div>
            <select
              value={selectedProgressProject}
              onChange={(e) => setSelectedProgressProject(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 max-w-[200px]"
            >
              <option value="SEMUA">Semua Proyek</option>
              {visibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 py-4">
            {/* SVG Donut Chart */}
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0">
              <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
                <circle
                  cx="75"
                  cy="75"
                  r={radius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="20"
                />
                <circle
                  cx="75"
                  cy="75"
                  r={radius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="20"
                  strokeDasharray={`${seg1} ${circumference}`}
                  strokeDashoffset={0}
                />
                <circle
                  cx="75"
                  cy="75"
                  r={radius}
                  fill="none"
                  stroke="#1D7AFC"
                  strokeWidth="20"
                  strokeDasharray={`${seg2} ${circumference}`}
                  strokeDashoffset={-seg1}
                />
                <circle
                  cx="75"
                  cy="75"
                  r={radius}
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="20"
                  strokeDasharray={`${seg3} ${circumference}`}
                  strokeDashoffset={-(seg1 + seg2)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl sm:text-[28px] font-extrabold text-[#13233C] tabular-nums leading-none">
                  {avgWorkProgress}%
                </span>
                <span className="text-[11px] font-medium text-slate-500 mt-1">
                  Total Progres
                </span>
              </div>
            </div>

            {/* Donut Legend */}
            <div className="space-y-3 w-full max-w-[220px] text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                  Selesai
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {donutMetrics.completed}%
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1D7AFC] inline-block shrink-0" />
                  Dalam Proses
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {donutMetrics.inProgress}%
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block shrink-0" />
                  Belum Mulai
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {donutMetrics.notStarted}%
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{visibleProjects.length} proyek aktif terdata pada sistem</span>
            {allowed.includes('proyek') && (
              <button
                type="button"
                onClick={() => {
                  if (selectedProgressProject !== 'SEMUA') {
                    setSelectedProjectId(selectedProgressProject);
                  }
                  setActiveModule('proyek');
                }}
                className="font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Detail Proyek <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Permintaan Menunggu Persetujuan / Status Pengajuan Saya Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-[#13233C]">
                {currentRole?.code === 'STAFF'
                  ? 'Status Pengajuan Saya'
                  : 'Permintaan Menunggu Persetujuan'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {pendingApprovals.length} pengajuan aktif memerlukan tindak lanjut
              </p>
            </div>
            {allowed.includes('persetujuan') && (
              <button
                type="button"
                onClick={() => setActiveModule('persetujuan')}
                className="text-xs font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                Lihat Semua <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 my-1 flex-1 flex flex-col justify-center">
            {pendingApprovals.length > 0 ? (
              pendingApprovals.slice(0, 4).map((apr) => {
                const requester = state.employees.find((e) => e.id === apr.requester_id);
                const isMat = apr.entity_type === 'MaterialRequest';
                const isDoc = apr.entity_type === 'Document';
                return (
                  <button
                    key={apr.id}
                    type="button"
                    onClick={() => {
                      if (isDoc) {
                        setSelectedDocumentId(apr.entity_id);
                        setActiveModule('dokumen');
                      } else if (apr.entity_type === 'ProjectWorkflow') {
                        setSelectedProjectId(apr.entity_id);
                        setActiveModule('proyek');
                      } else {
                        setActiveModule('persetujuan');
                      }
                    }}
                    className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 rounded-xl px-1.5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isMat
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : isDoc
                            ? 'bg-blue-50 text-[#1D7AFC] border border-blue-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}
                      >
                        {isMat ? (
                          <Package className="w-5 h-5" />
                        ) : isDoc ? (
                          <FileText className="w-5 h-5" />
                        ) : (
                          <Wallet className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                          {apr.title}
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                          <span className="font-mono text-[#1D7AFC] font-medium">
                            {apr.reference_no}
                          </span>{' '}
                          · {requester?.full_name ?? '-'} · {formatDateTimeID(apr.requested_at)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <StatusLabel status={apr.status} />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="py-10 px-4 flex flex-col items-center justify-center text-center">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2.5">
                  <Inbox className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  Belum Ada Pengajuan Menunggu
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs">
                  Semua permintaan material, dokumen surat, atau verifikasi keuangan telah diproses.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Chart & Timeline Row: Aktivitas Terbaru + Ringkasan Keuangan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Aktivitas Terbaru (Timeline) */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-[#13233C]">Aktivitas Terbaru</h2>
              <p className="text-[11px] text-slate-500">Rekam jejak operasional lintas divisi</p>
            </div>
            <div className="flex items-center gap-2">
              <ModuleAttachmentToolbar
                compact
                moduleId="dashboard"
                entityId="dashboard-aktivitas"
                entityLabel="Lampiran Aktivitas Operasional"
                title="Lampiran Aktivitas Operasional"
                subtitle="Unggah foto dokumentasi atau dokumen pendukung aktivitas harian"
                defaultCategory="Laporan & Dokumentasi"
              />
              <button
                type="button"
                onClick={() => setActiveModule('pengaturan')}
                className="text-xs font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                Lihat Semua <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative mt-2 divide-y divide-slate-100">
            {state.activityLogs.slice(0, 4).map((log, i, arr) => {
              const iconBg =
                i === 0
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : i === 1
                  ? 'bg-blue-50 text-[#1D7AFC] border-blue-200'
                  : i === 2
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-amber-50 text-amber-600 border-amber-200';
              return (
                <div
                  key={log.id}
                  className="relative py-3 flex items-start justify-between gap-3"
                >
                  {i < arr.length - 1 && (
                    <span
                      className="absolute left-[17px] top-11 bottom-0 w-px bg-slate-200"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`relative z-10 w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${iconBg}`}
                    >
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                        {log.description}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        <span className="font-medium text-slate-700">{log.employee_name}</span> ·{' '}
                        {log.division_name}
                        {log.project_name ? ` · ${log.project_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 tabular-nums shrink-0 pt-0.5">
                    {formatDateTimeID(log.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ringkasan Keuangan Dual-Line Chart */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#13233C]">Ringkasan Keuangan</h2>
              </div>
              <p className="text-[11px] text-slate-500">Arus pemasukan & pengeluaran proyek</p>
            </div>
            <select
              value={financePeriod}
              onChange={(e) => setFinancePeriod(e.target.value as 'TAHUN_INI' | 'SEMUA')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="TAHUN_INI">Tahun Ini</option>
              <option value="SEMUA">Semua Periode</option>
            </select>
          </div>

          <div className="mt-3">
            <p className="text-2xl sm:text-[26px] font-extrabold text-[#13233C] font-mono tabular-nums tracking-tight">
              {formatRupiah(totalIncome - totalExpense)}
            </p>
            <p className="text-xs text-emerald-700 font-semibold mt-0.5 inline-flex items-center gap-1 tabular-nums">
              <ArrowUpRight className="w-3.5 h-3.5" />
              Masuk {formatRupiah(totalIncome, true)} · Keluar {formatRupiah(totalExpense, true)}
            </p>
          </div>

          {/* Smooth SVG Dual-Line Cashflow Chart */}
          <div className="mt-3 w-full">
            <svg viewBox="0 0 430 142" className="w-full h-36 sm:h-40 overflow-visible">
              <defs>
                <linearGradient id="pmsIncomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D7AFC" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#1D7AFC" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Horizontal dashed grid lines */}
              {[30, 58, 86, 114].map((y) => (
                <line
                  key={y}
                  x1="18"
                  y1={y}
                  x2="412"
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              ))}

              {/* Subtle area under Income */}
              {incomeAreaPath && <path d={incomeAreaPath} fill="url(#pmsIncomeFill)" />}

              {/* Smooth Expense curve (orange) */}
              <path
                d={expenseSmoothPath}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Smooth Income curve (blue) */}
              <path
                d={incomeSmoothPath}
                fill="none"
                stroke="#1D7AFC"
                strokeWidth="2.75"
                strokeLinecap="round"
              />

              {/* Data nodes + month labels */}
              {chartMonths.map((m, idx) => {
                const pInc = incomePoints[idx];
                const pExp = expensePoints[idx];
                return (
                  <g key={m}>
                    <circle
                      cx={pInc.x}
                      cy={pInc.y}
                      r="3.8"
                      fill="#1D7AFC"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx={pExp.x}
                      cy={pExp.y}
                      r="3.5"
                      fill="#F59E0B"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                    />
                    <text
                      x={pInc.x}
                      y="135"
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-medium"
                    >
                      {m}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-4 text-slate-600 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1D7AFC] inline-block" />
                  Pemasukan
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" />
                  Pengeluaran
                </span>
              </div>
              {allowed.includes('finance') && (
                <button
                  type="button"
                  onClick={() => setActiveModule('finance')}
                  className="font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Buka Finance <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Daftar Proyek Aktif (Table/Card with Progress Bar) + Peringatan Stok Minimum */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
                Daftar Proyek Aktif & Progres Fisik
              </h2>
              <p className="text-[11px] text-slate-500">
                Pemantauan progres konstruksi berjalan
              </p>
            </div>
            {allowed.includes('proyek') && (
              <button
                type="button"
                onClick={() => setActiveModule('proyek')}
                className="px-3 py-1.5 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Kelola Proyek
              </button>
            )}
          </div>

          {/* Desktop & Tablet Table View (sm+) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Kode</th>
                  <th className="py-2.5 px-4 font-semibold">Nama Proyek</th>
                  <th className="py-2.5 px-4 font-semibold w-44">Progress Fisik</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProjects.slice(0, 4).map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      if (allowed.includes('proyek')) {
                        setSelectedProjectId(p.id);
                        setActiveModule('proyek');
                      }
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#1D7AFC] whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{p.project_number}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 min-w-0">
                      <p className="font-semibold text-slate-900 line-clamp-1">{p.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.client_name}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.progress_percent >= 100
                                ? 'bg-emerald-500'
                                : 'bg-[#1D7AFC]'
                            }`}
                            style={{ width: `${p.progress_percent}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-800 tabular-nums w-9 text-right">
                          {p.progress_percent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Project Cards (< sm) */}
          <div className="sm:hidden divide-y divide-slate-100">
            {visibleProjects.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (allowed.includes('proyek')) {
                    setSelectedProjectId(p.id);
                    setActiveModule('proyek');
                  }
                }}
                className="w-full p-4 text-left space-y-2.5 hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-[#1D7AFC]">
                      {p.project_number}
                    </span>
                  </div>
                  <StatusLabel status={p.status} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 line-clamp-2">{p.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{p.client_name}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        p.progress_percent >= 100 ? 'bg-emerald-500' : 'bg-[#1D7AFC]'
                      }`}
                      style={{ width: `${p.progress_percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-800 tabular-nums">
                    {p.progress_percent}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Peringatan Stok Minimum */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
                  Peringatan Stok Minimum
                </h2>
                <p className="text-[11px] text-slate-500">Material di bawah ambang batas aman</p>
              </div>
              {allowed.includes('gudang') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveModule('gudang');
                    setGudangSubmenu('stok-minimum');
                  }}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Buka Gudang
                </button>
              )}
            </div>
            {lowStockMaterials.length === 0 ? (
              <p className="py-6 text-xs text-emerald-700 font-medium">
                Seluruh stok material gudang mencukupi.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 mt-1">
                {lowStockMaterials.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{m.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">{m.code}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 font-mono font-semibold text-red-700 tabular-nums shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {m.stock}/{m.min_stock} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Monitoring Workflow Operasional Terintegrasi PT. WILWA ABIYASA SEJAHTERA */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
              Monitoring Workflow Operasional Proyek — PT. WILWA ABIYASA SEJAHTERA
            </h2>
            <p className="text-[11px] text-slate-500">
              Pemantauan terintegrasi: Tim Teknik → Tim Finance → Tim Logistik → Tim Lapangan → Monitoring
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {[
              {
                label: 'Teknik',
                count: state.workflows.filter((w) =>
                  ['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE'].includes(w.stage)
                ).length,
                cls: 'bg-slate-100 text-slate-700',
              },
              {
                label: 'Finance',
                count: state.workflows.filter((w) => w.stage === 'MENUNGGU_FINANCE').length,
                cls: 'bg-amber-50 text-amber-800 border border-amber-200',
              },
              {
                label: 'Logistik',
                count: state.workflows.filter((w) =>
                  ['MENUNGGU_LOGISTIK', 'PROSES_LOGISTIK'].includes(w.stage)
                ).length,
                cls: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
              },
              {
                label: 'Lapangan',
                count: state.workflows.filter((w) =>
                  ['SIAP_LAPANGAN', 'DALAM_PELAKSANAAN'].includes(w.stage)
                ).length,
                cls: 'bg-blue-50 text-[#1D7AFC] border border-blue-200',
              },
              {
                label: 'Selesai',
                count: state.workflows.filter((w) => w.stage === 'SELESAI').length,
                cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
              },
            ].map((pill) => (
              <span
                key={pill.label}
                className={`px-2.5 py-1 rounded-lg font-semibold tabular-nums ${pill.cls}`}
              >
                {pill.label}: {pill.count}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Proyek</th>
                <th className="py-2.5 px-4 font-semibold">Tahap Workflow</th>
                <th className="py-2.5 px-4 font-semibold text-right">Progres Fisik</th>
                <th className="py-2.5 px-4 font-semibold text-right">RAB vs Pengeluaran</th>
                <th className="py-2.5 px-4 font-semibold text-right">Pemakaian Material</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dokumentasi & Foto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleProjects.map((p) => {
                const wf = state.workflows.find((w) => w.project_id === p.id);
                const stageMeta = wf ? getWorkflowStageMeta(wf.stage) : null;
                const rabSum = state.budgets
                  .filter((b) => b.project_id === p.id && !b.is_deleted)
                  .reduce((a, b) => a + b.total_cost, 0);
                const spentSum = state.financialTransactions
                  .filter(
                    (f) =>
                      f.project_id === p.id &&
                      f.type === 'Pengeluaran' &&
                      f.status !== 'Ditolak'
                  )
                  .reduce((a, f) => a + f.amount, 0);
                const matUsed = wf
                  ? wf.material_needs.reduce((a, n) => a + n.qty_used, 0)
                  : 0;
                const matIssued = wf
                  ? wf.material_needs.reduce((a, n) => a + n.qty_issued, 0)
                  : 0;
                const docCount = getAttachmentsFor('proyek', p.id).length;
                const latestPhoto = getLatestPhotoFor('proyek', p.id);
                const safeLegacyImg =
                  p.image_url && !isStaticSamplePhotoUrl(p.image_url) ? p.image_url : '';
                const reportsCount = wf?.field_reports.length ?? 0;

                return (
                  <tr
                    key={p.id}
                    onClick={() => {
                      if (allowed.includes('proyek')) {
                        setSelectedProjectId(p.id);
                        setActiveModule('proyek');
                      }
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 min-w-[200px]">
                      <div className="inline-flex items-center gap-1.5 font-mono font-bold text-[#1D7AFC]">
                        <span>{p.project_number}</span>
                      </div>
                      <div className="font-semibold text-slate-900 line-clamp-1">{p.name}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {stageMeta ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${stageMeta.badgeClass}`}
                        >
                          {stageMeta.step}/5 · {stageMeta.shortLabel}
                        </span>
                      ) : (
                        <StatusLabel status={p.status} />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                      {p.progress_percent}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 font-semibold">
                        RAB {formatRupiah(rabSum, true)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Keluar {formatRupiah(spentSum, true)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatNumber(matUsed)} / {formatNumber(matIssued)} unit
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap text-slate-700">
                      <div className="inline-flex items-center justify-end gap-2.5">
                        <div className="text-right">
                          <div>
                            <span className="font-semibold">{docCount}</span> berkas ·{' '}
                            <span className="font-semibold">{reportsCount}</span> lap.
                          </div>
                        </div>
                        <div className="w-10 h-8 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 flex items-center justify-center">
                          {latestPhoto ? (
                            <ProtectedAttachmentImage
                              key={latestPhoto.id}
                              attachment={latestPhoto}
                              className="w-10 h-8 object-cover"
                            />
                          ) : safeLegacyImg ? (
                            <img
                              src={safeLegacyImg}
                              alt={p.name}
                              className="w-10 h-8 object-cover"
                            />
                          ) : (
                            <Camera className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
