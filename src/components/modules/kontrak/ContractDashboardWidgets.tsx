import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileSignature,
  Hourglass,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { ContractSubmenuKey } from '../../../types/pms';
import { formatDateID, formatMonthYearID, formatRupiah } from '../../../utils/format';
import { StatusLabel } from '../../ui/CommonUI';

interface ContractDashboardWidgetsProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const ContractDashboardWidgets: React.FC<ContractDashboardWidgetsProps> = ({
  onNavigateSubmenu,
}) => {
  const { state } = usePMS();

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const visibleContractIds = useMemo(
    () => new Set(visibleContracts.map((c) => c.id)),
    [visibleContracts]
  );

  const visibleTerms = useMemo(
    () => state.contractTerms.filter((t) => visibleContractIds.has(t.contract_id)),
    [state.contractTerms, visibleContractIds]
  );

  const visibleClaims = useMemo(
    () => state.termClaims.filter((c) => visibleContractIds.has(c.contract_id)),
    [state.termClaims, visibleContractIds]
  );

  const visiblePayments = useMemo(
    () => state.termPayments.filter((p) => visibleContractIds.has(p.contract_id)),
    [state.termPayments, visibleContractIds]
  );

  const metrics = useMemo(() => {
    const activeContracts = visibleContracts.filter(
      (c) => c.status === 'Aktif' || c.status === 'Akan Berakhir'
    );
    const totalContractValue = visibleContracts.reduce((s, c) => s + Number(c.contract_value || 0), 0);
    const totalPaid = visibleTerms.reduce(
      (s, t) =>
        s + Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0)),
      0
    );
    const totalRemaining = Math.max(0, totalContractValue - totalPaid);

    const waitingSubmission = visibleTerms.filter((t) => {
      const hasClaim = visibleClaims.some(
        (cl) => cl.term_id === t.id && (cl.status === 'Menunggu Approval' || cl.status === 'Disetujui')
      );
      const st = t.timeline_status;
      return !hasClaim && (st === 'Siap Diajukan' || st === 'Menunggu Progres' || st === 'Terjadwal' || st === 'Revisi' || !st);
    }).length;

    const waitingApproval = visibleClaims.filter((c) => c.status === 'Menunggu Approval').length;

    const approvedUnpaid = visibleClaims.filter((c) => {
      if (c.status !== 'Disetujui') return false;
      const term = visibleTerms.find((t) => t.id === c.term_id);
      if (!term) return false;
      const paid = Number(term.paid_amount ?? (term.payment_status === 'Terbayar' ? term.term_value : 0));
      return paid < term.term_value;
    }).length;

    const nowMs = Date.now();
    const soonThresholdMs = nowMs + 45 * 86400000;
    const expiringContracts = visibleContracts.filter((c) => {
      if (c.status === 'Selesai' || c.status === 'Ditutup') return false;
      if (c.status === 'Akan Berakhir') return true;
      const endMs = new Date(c.end_date).getTime();
      return !Number.isNaN(endMs) && endMs <= soonThresholdMs;
    });

    const closedContracts = visibleContracts.filter(
      (c) => c.status === 'Selesai' || c.status === 'Ditutup'
    ).length;

    return {
      activeCount: activeContracts.length,
      totalContractValue,
      totalPaid,
      totalRemaining,
      waitingSubmission,
      waitingApproval,
      approvedUnpaid,
      expiringContracts,
      closedContracts,
    };
  }, [visibleContracts, visibleTerms, visibleClaims]);

  // 1. Monthly Contract Value
  const monthlyContractSeries = useMemo(() => {
    const map = new Map<string, number>();
    visibleContracts.forEach((c) => {
      const ym = (c.contract_date || c.start_date || '').slice(0, 7);
      if (!ym) return;
      map.set(ym, (map.get(ym) ?? 0) + Number(c.contract_value || 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([ym, total]) => ({ ym, label: formatMonthYearID(ym), total }));
  }, [visibleContracts]);

  // 2. Monthly Termin Payments
  const monthlyPaymentSeries = useMemo(() => {
    const map = new Map<string, number>();
    visiblePayments.forEach((p) => {
      const ym = (p.payment_date || '').slice(0, 7);
      if (!ym) return;
      map.set(ym, (map.get(ym) ?? 0) + Number(p.paid_amount || 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([ym, total]) => ({ ym, label: formatMonthYearID(ym), total }));
  }, [visiblePayments]);

  // 3. Contract Value vs Actual Payment per Contract
  const contractComparison = useMemo(() => {
    return visibleContracts.slice(0, 5).map((c) => {
      const terms = visibleTerms.filter((t) => t.contract_id === c.id);
      const paid = terms.reduce(
        (s, t) => s + Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0)),
        0
      );
      const pct = c.contract_value > 0 ? Math.min(100, Math.round((paid / c.contract_value) * 100)) : 0;
      return { contract: c, paid, pct };
    });
  }, [visibleContracts, visibleTerms]);

  // 4. Upcoming Termins
  const upcomingTerms = useMemo(() => {
    return visibleTerms
      .filter((t) => {
        const paid = Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0));
        return paid < t.term_value;
      })
      .sort((a, b) => a.execution_date.localeCompare(b.execution_date))
      .slice(0, 5);
  }, [visibleTerms]);

  // 6. Pending Approval Queue
  const pendingApprovalClaims = useMemo(
    () => visibleClaims.filter((c) => c.status === 'Menunggu Approval').slice(0, 5),
    [visibleClaims]
  );

  const maxContractBar = Math.max(1, ...monthlyContractSeries.map((s) => s.total));
  const maxPaymentBar = Math.max(1, ...monthlyPaymentSeries.map((s) => s.total));

  const kpiCards = [
    {
      label: 'Total Kontrak Aktif',
      value: String(metrics.activeCount),
      icon: FileSignature,
      tone: 'text-[#1D7AFC] bg-blue-50 border-blue-200',
    },
    {
      label: 'Total Nilai Kontrak',
      value: formatRupiah(metrics.totalContractValue, true),
      sub: formatRupiah(metrics.totalContractValue),
      icon: TrendingUp,
      tone: 'text-[#13233C] bg-slate-100 border-slate-200',
    },
    {
      label: 'Termin Sudah Dibayar',
      value: formatRupiah(metrics.totalPaid, true),
      sub: formatRupiah(metrics.totalPaid),
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      label: 'Sisa Pembayaran Kontrak',
      value: formatRupiah(metrics.totalRemaining, true),
      sub: formatRupiah(metrics.totalRemaining),
      icon: Wallet,
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      label: 'Termin Siap/Menunggu Diajukan',
      value: String(metrics.waitingSubmission),
      icon: Clock,
      tone: 'text-slate-700 bg-slate-100 border-slate-200',
    },
    {
      label: 'Termin Menunggu Approval',
      value: String(metrics.waitingApproval),
      icon: Hourglass,
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      label: 'Disetujui Belum Dibayar',
      value: String(metrics.approvedUnpaid),
      icon: FileCheck2,
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    {
      label: 'Kontrak Mendekati Berakhir',
      value: String(metrics.expiringContracts.length),
      icon: AlertTriangle,
      tone: 'text-red-700 bg-red-50 border-red-200',
    },
    {
      label: 'Kontrak Selesai / Ditutup',
      value: String(metrics.closedContracts),
      icon: CheckCircle2,
      tone: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    },
  ];

  return (
    <div className="space-y-4">
      {/* 9 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              title={card.sub}
              className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex items-start gap-3"
            >
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${card.tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 leading-snug line-clamp-2">
                  {card.label}
                </p>
                <p className="text-base sm:text-lg font-extrabold text-[#13233C] font-mono tabular-nums mt-0.5 truncate">
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 6 Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Nilai Kontrak per Bulan */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider">
              Nilai Kontrak per Bulan
            </h3>
            <span className="text-[11px] text-slate-400">IDR</span>
          </div>
          {monthlyContractSeries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Belum ada data kontrak tercatat.</p>
          ) : (
            <div className="space-y-2">
              {monthlyContractSeries.map((s) => (
                <div key={s.ym} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium text-slate-700">{s.label}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatRupiah(s.total, true)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#13233C] rounded-full"
                      style={{ width: `${Math.max(6, Math.round((s.total / maxContractBar) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Pembayaran Termin per Bulan */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider">
              Pembayaran Termin per Bulan
            </h3>
            <span className="text-[11px] text-slate-400">Realisasi</span>
          </div>
          {monthlyPaymentSeries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Belum ada realisasi pembayaran termin.</p>
          ) : (
            <div className="space-y-2">
              {monthlyPaymentSeries.map((s) => (
                <div key={s.ym} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium text-slate-700">{s.label}</span>
                    <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatRupiah(s.total, true)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.max(6, Math.round((s.total / maxPaymentBar) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Perbandingan Nilai Kontrak vs Pembayaran Aktual */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider">
              Nilai Kontrak vs Pembayaran
            </h3>
            <span className="text-[11px] text-slate-400">Rasio Lunas</span>
          </div>
          {contractComparison.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Belum ada kontrak terdaftar.</p>
          ) : (
            <div className="space-y-2.5">
              {contractComparison.map(({ contract, paid, pct }) => (
                <div key={contract.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-[#1D7AFC] truncate">
                      {contract.contract_number}
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums shrink-0">
                      {formatRupiah(paid, true)} / {formatRupiah(contract.contract_value, true)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1D7AFC] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Termin Mendekati Target Tanggal */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-[#1D7AFC]" />
              <span>Termin Mendekati Target</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubmenu('timeline')}
              className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
            >
              Timeline
            </button>
          </div>
          {upcomingTerms.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">Semua termin telah lunas.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingTerms.map((t) => {
                const ctr = state.contracts.find((c) => c.id === t.contract_id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onNavigateSubmenu('timeline', t.contract_id)}
                    className="w-full py-2 text-left hover:bg-slate-50 rounded-lg px-1 flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {t.term_number} · {ctr?.contract_number}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Target {formatDateID(t.execution_date)} · {formatRupiah(t.term_value, true)}
                      </p>
                    </div>
                    <StatusLabel status={t.timeline_status || 'Terjadwal'} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 5. Kontrak Mendekati Tanggal Berakhir */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Kontrak Mendekati Berakhir</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {metrics.expiringContracts.length} kontrak
            </span>
          </div>
          {metrics.expiringContracts.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">
              Tidak ada kontrak yang mendekati jatuh tempo dalam 45 hari.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.expiringContracts.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigateSubmenu('daftar', c.id)}
                  className="w-full py-2 text-left hover:bg-slate-50 rounded-lg px-1 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-[#1D7AFC] truncate">{c.contract_number}</p>
                    <p className="text-[11px] text-slate-600 truncate">
                      {c.work_name} · Berakhir {formatDateID(c.end_date)}
                    </p>
                  </div>
                  <StatusLabel status={c.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 6. Antrean Pengajuan Termin Menunggu Approval */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#13233C] uppercase tracking-wider flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-600" />
              <span>Menunggu Approval Termin</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubmenu('approval')}
              className="text-[11px] font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>Proses</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {pendingApprovalClaims.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">
              Tidak ada pengajuan termin menunggu approval.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingApprovalClaims.map((cl) => {
                const ctr = state.contracts.find((c) => c.id === cl.contract_id);
                const term = state.contractTerms.find((t) => t.id === cl.term_id);
                return (
                  <button
                    key={cl.id}
                    type="button"
                    onClick={() => onNavigateSubmenu('approval', cl.contract_id)}
                    className="w-full py-2 text-left hover:bg-slate-50 rounded-lg px-1 flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {cl.claim_number} · {term?.term_number}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {ctr?.contract_number} · {formatRupiah(cl.claim_amount, true)}
                      </p>
                    </div>
                    <StatusLabel status={cl.status} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
