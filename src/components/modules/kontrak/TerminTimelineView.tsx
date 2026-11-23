import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { ContractSubmenuKey, TerminTimelineStatus } from '../../../types/pms';
import {
  computeTermPaymentRealization,
  formatDateID,
  formatMonthYearID,
  formatRupiah,
} from '../../../utils/format';
import {
  canActivateOrCloseContract,
  canCreateContract,
  canManageContractTerms,
  canRecordTermPayment,
  canSubmitTermClaim,
} from '../../../utils/permissions';
import { ConfirmDialog, EmptyState, StatusLabel } from '../../ui/CommonUI';

interface TerminTimelineViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

interface EditableTermRow {
  id?: string;
  term_number: string;
  title: string;
  period_month: string;
  execution_date: string;
  payment_percentage: number;
  target_progress: number;
  requirements_desc: string;
  notes: string;
}

export const TerminTimelineView: React.FC<TerminTimelineViewProps> = ({ onNavigateSubmenu }) => {
  const {
    state,
    currentRole,
    currentDivision,
    selectedContractId,
    setSelectedContractId,
    saveContractTermsApi,
    activateContractApi,
    workflowBusy,
    showToast,
  } = usePMS();

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const activeContract = useMemo(() => {
    return (
      visibleContracts.find((c) => c.id === selectedContractId) ??
      visibleContracts[0] ??
      null
    );
  }, [visibleContracts, selectedContractId]);

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowCreate = canCreateContract(roleCode, divCode);
  const allowManageTerms = canManageContractTerms(roleCode, divCode);
  const allowActivate = canActivateOrCloseContract(roleCode, divCode);
  const allowSubmitClaim = canSubmitTermClaim(roleCode, divCode);
  const allowPayment = canRecordTermPayment(roleCode, divCode);

  const contractTerms = useMemo(() => {
    if (!activeContract) return [];
    return state.contractTerms
      .filter((t) => t.contract_id === activeContract.id)
      .sort((a, b) => a.execution_date.localeCompare(b.execution_date));
  }, [state.contractTerms, activeContract]);

  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState<EditableTermRow[]>([]);
  const [activateOpen, setActivateOpen] = useState(false);

  useEffect(() => {
    if (!activeContract) {
      setRows([]);
      setEditMode(false);
      return;
    }
    if (contractTerms.length > 0) {
      setRows(
        contractTerms.map((t) => ({
          id: t.id,
          term_number: t.term_number,
          title: t.title || t.term_number,
          period_month: t.period_month,
          execution_date: t.execution_date,
          payment_percentage: t.payment_percentage,
          target_progress: t.target_progress,
          requirements_desc: t.requirements_desc || '',
          notes: t.notes || '',
        }))
      );
      setEditMode(false);
    } else {
      setRows([
        {
          term_number: 'Termin 1 (Uang Muka)',
          title: 'Uang Muka / Persiapan Lapangan',
          period_month: activeContract.start_date.slice(0, 7),
          execution_date: activeContract.start_date,
          payment_percentage: 30,
          target_progress: 0,
          requirements_desc: 'SPK ditandatangani & mobilisasi awal',
          notes: '',
        },
        {
          term_number: 'Termin 2 (Progres 50%)',
          title: 'Penyelesaian Pekerjaan Tahap Menengah',
          period_month: activeContract.end_date.slice(0, 7),
          execution_date: activeContract.end_date,
          payment_percentage: 40,
          target_progress: 50,
          requirements_desc: 'Opname lapangan mencapai 50% & foto progres',
          notes: '',
        },
        {
          term_number: 'Termin 3 (Pelunasan 100%)',
          title: 'BAST & Pelunasan Pekerjaan',
          period_month: activeContract.end_date.slice(0, 7),
          execution_date: activeContract.end_date,
          payment_percentage: 30,
          target_progress: 100,
          requirements_desc: 'Berita Acara Serah Terima Pekerjaan 100%',
          notes: '',
        },
      ]);
      setEditMode(true);
    }
  }, [activeContract?.id, contractTerms]);

  const metrics = useMemo(() => {
    if (!activeContract) return null;
    const totalPct = contractTerms.reduce((s, t) => s + Number(t.payment_percentage || 0), 0);
    const totalTermVal = contractTerms.reduce((s, t) => s + Number(t.term_value || 0), 0);
    const totalPaid = contractTerms.reduce(
      (s, t) =>
        s +
        computeTermPaymentRealization({
          approvedAmount: t.term_value,
          term: t,
          termPayments: state.termPayments,
          claims: state.termClaims,
        }).paidAmount,
      0
    );
    const remaining = Math.max(0, activeContract.contract_value - totalPaid);
    return { totalPct, totalTermVal, totalPaid, remaining };
  }, [activeContract, contractTerms, state.termPayments, state.termClaims]);

  const draftSummary = useMemo(() => {
    const val = activeContract?.contract_value ?? 0;
    const totalPct = rows.reduce((s, r) => s + Number(r.payment_percentage || 0), 0);
    let allocated = 0;
    const computedValues = rows.map((r, idx) => {
      const pct = Number(r.payment_percentage || 0);
      const itemVal =
        idx === rows.length - 1
          ? Math.max(0, val - allocated)
          : Math.round((pct / 100) * val);
      allocated += itemVal;
      return itemVal;
    });
    const isValid100 =
      rows.length > 0 &&
      Math.abs(totalPct - 100) <= 0.01 &&
      rows.every((r) => Number(r.payment_percentage) > 0 && Number(r.target_progress) >= 0 && Number(r.target_progress) <= 100);
    return { totalPct, computedValues, isValid100 };
  }, [rows, activeContract?.contract_value]);

  const handleAddRow = () => {
    const nextIdx = rows.length + 1;
    const remainingPct = Math.max(0, Number((100 - draftSummary.totalPct).toFixed(2)));
    setRows((prev) => [
      ...prev,
      {
        term_number: `Termin ${nextIdx}`,
        title: `Termin Tahap ${nextIdx}`,
        period_month: activeContract?.end_date.slice(0, 7) || new Date().toISOString().slice(0, 7),
        execution_date: activeContract?.end_date || new Date().toISOString().slice(0, 10),
        payment_percentage: remainingPct > 0 ? remainingPct : 10,
        target_progress: Math.min(100, nextIdx * 25),
        requirements_desc: 'Berita acara opname progres & dokumentasi lapangan',
        notes: '',
      },
    ]);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContract) return;
    if (!draftSummary.isValid100) {
      showToast('Total persentase seluruh termin wajib tepat 100% dan setiap baris bernilai positif.');
      return;
    }
    const res = await saveContractTermsApi(activeContract.id, { terms: rows });
    if (res.ok) {
      setEditMode(false);
    }
  };

  const resolveTimelineStatus = (term: (typeof contractTerms)[number]): TerminTimelineStatus => {
    if (term.timeline_status) return term.timeline_status;
    if (term.payment_status === 'Terbayar') return 'Dibayar';
    if (term.payment_status === 'Menunggu Verifikasi') return 'Menunggu Approval';
    if (term.actual_progress >= term.target_progress) return 'Siap Diajukan';
    if (term.actual_progress > 0) return 'Menunggu Progres';
    return 'Terjadwal';
  };

  if (visibleContracts.length === 0) {
    return (
      <EmptyState
        title="Belum Ada Kontrak Tersedia"
        description="Buat kontrak resmi terlebih dahulu dari proyek yang telah disetujui Tim Finance untuk menyusun timeline termin."
        actionLabel={allowCreate ? 'Buat Kontrak Baru' : undefined}
        onAction={allowCreate ? () => onNavigateSubmenu('pembuatan') : undefined}
      />
    );
  }

  const project = activeContract
    ? state.projects.find((p) => p.id === activeContract.project_id)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header + Contract Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Timeline Termin Pembayaran Kontrak
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Atur jadwal termin pembayaran (wajib 100% dari nilai kontrak), pantau target vs realisasi progres, dan ajukan pencairan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeContract?.id ?? ''}
            onChange={(e) => setSelectedContractId(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl max-w-xs"
          >
            {visibleContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number} — {c.work_name} ({c.status})
              </option>
            ))}
          </select>

          {allowManageTerms && activeContract && !editMode && (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer"
            >
              Atur / Edit Jadwal Termin
            </button>
          )}
        </div>
      </div>

      {activeContract && metrics && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Kontrak Terpilih</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-mono font-bold text-xs text-[#1D7AFC]">
                  {activeContract.contract_number}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusLabel status={activeContract.status} />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Nilai Kontrak Final</p>
              <p className="text-base font-bold font-mono text-[#13233C] mt-1 tabular-nums">
                {formatRupiah(activeContract.contract_value, true)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {project?.project_number} · {project?.name}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Total Porsi Termin</p>
              <p
                className={`text-base font-bold font-mono mt-1 tabular-nums ${
                  Math.abs(metrics.totalPct - 100) <= 0.01 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {metrics.totalPct.toFixed(1).replace(/\.0$/, '')}%
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {contractTerms.length} termin ({formatRupiah(metrics.totalTermVal, true)})
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Sudah Dibayar</p>
              <p className="text-base font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                {formatRupiah(metrics.totalPaid, true)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeContract.contract_value > 0
                  ? `${Math.round((metrics.totalPaid / activeContract.contract_value) * 100)}% terbayar`
                  : '0%'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Sisa Pembayaran</p>
              <p className="text-base font-bold font-mono text-amber-800 mt-1 tabular-nums">
                {formatRupiah(metrics.remaining, true)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                s/d {formatDateID(activeContract.end_date)}
              </p>
            </div>
          </div>

          {/* Activation Banner when contract is still Draft */}
          {activeContract.status === 'Draft' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Kontrak Masih Berstatus Draft</p>
                  <p className="text-amber-800 mt-0.5">
                    Lengkapi jadwal termin hingga 100% dan pastikan PDF kontrak terverifikasi, lalu aktifkan kontrak agar Tim Logistik & Pengajuan Termin dapat berjalan.
                  </p>
                </div>
              </div>
              {allowActivate && (
                <button
                  type="button"
                  disabled={workflowBusy || Math.abs(metrics.totalPct - 100) > 0.01}
                  onClick={() => setActivateOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Aktifkan Kontrak</span>
                </button>
              )}
            </div>
          )}

          {/* Schedule Editor Mode */}
          {editMode && allowManageTerms ? (
            <form
              onSubmit={handleSaveSchedule}
              className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Pengaturan Jadwal Termin (Wajib Total 100%)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Nominal setiap termin dihitung otomatis: % Termin × {formatRupiah(activeContract.contract_value)}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
                      draftSummary.isValid100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    Total: {draftSummary.totalPct.toFixed(1).replace(/\.0$/, '')}% / 100%
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1D7AFC] text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Termin & Judul</th>
                      <th className="py-2.5 px-3 font-semibold">Tgl Pelaksanaan</th>
                      <th className="py-2.5 px-3 font-semibold w-24">% Bayar</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Nominal Otomatis</th>
                      <th className="py-2.5 px-3 font-semibold w-24">Target Progres (%)</th>
                      <th className="py-2.5 px-3 font-semibold">Syarat Pencairan</th>
                      <th className="py-2.5 px-2 font-semibold text-center">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={row.id || idx} className="align-top">
                        <td className="py-2.5 px-3 space-y-1.5 min-w-[200px]">
                          <input
                            type="text"
                            value={row.term_number}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, term_number: e.target.value } : r))
                              )
                            }
                            placeholder="Nama Termin"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                            required
                          />
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r))
                              )
                            }
                            placeholder="Deskripsi singkat"
                            className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-[11px] text-slate-600"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={row.execution_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, execution_date: val, period_month: val.slice(0, 7) }
                                    : r
                                )
                              );
                            }}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-lg"
                            required
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step="0.5"
                            value={row.payment_percentage}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, payment_percentage: Number(e.target.value) } : r
                                )
                              )
                            }
                            className="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                            required
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap pt-4">
                          {formatRupiah(draftSummary.computedValues[idx] ?? 0)}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.target_progress}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, target_progress: Number(e.target.value) } : r
                                )
                              )
                            }
                            className="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                            required
                          />
                        </td>
                        <td className="py-2.5 px-3 min-w-[200px]">
                          <input
                            type="text"
                            value={row.requirements_desc}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, requirements_desc: e.target.value } : r
                                )
                              )
                            }
                            placeholder="Syarat BAST / opname..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center pt-3">
                          <button
                            type="button"
                            disabled={rows.length <= 1}
                            onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                {contractTerms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl cursor-pointer"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  disabled={workflowBusy || !draftSummary.isValid100}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{workflowBusy ? 'Menyimpan...' : 'Simpan Jadwal Termin 100%'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Timeline Milestones Cards */
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <FileText className="w-4 h-4 text-[#1D7AFC]" />
                  <span>
                    Dokumen Utama: <strong className="text-slate-900">{activeContract.document_ref}</strong>
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Menampilkan {contractTerms.length} tahapan termin pembayaran
                </span>
              </div>

              {contractTerms.length === 0 ? (
                <EmptyState
                  title="Jadwal Termin Belum Disusun"
                  description="Susun jadwal termin dengan total tepat 100% agar kontrak dapat diaktifkan."
                  actionLabel={allowManageTerms ? 'Susun Jadwal Termin' : undefined}
                  onAction={allowManageTerms ? () => setEditMode(true) : undefined}
                />
              ) : (
                <div className="space-y-3">
                  {contractTerms.map((term, idx) => {
                    const timelineStatus = resolveTimelineStatus(term);
                    const {
                      paidAmount: paid,
                      remainingAmount: unpaid,
                      statusRealization,
                    } = computeTermPaymentRealization({
                      approvedAmount: term.term_value,
                      term,
                      termPayments: state.termPayments,
                      claims: state.termClaims,
                    });
                    const linkedClaim = state.termClaims.find(
                      (cl) => cl.term_id === term.id && (cl.status === 'Menunggu Approval' || cl.status === 'Disetujui')
                    );

                    return (
                      <div
                        key={term.id}
                        className="border border-slate-200 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center hover:border-blue-200 transition-colors"
                      >
                        <div className="lg:col-span-4 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-bold text-[#13233C]">#{idx + 1}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-medium text-[#1D7AFC]">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatMonthYearID(term.period_month)}
                            </span>
                            <span>·</span>
                            <span className="tabular-nums">{formatDateID(term.execution_date)}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">{term.term_number}</h3>
                          {term.requirements_desc && (
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              Syarat: {term.requirements_desc}
                            </p>
                          )}
                        </div>

                        <div className="lg:col-span-4 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-600">
                              Target Progres: <strong className="font-mono">{term.target_progress}%</strong>
                            </span>
                            <span className="text-slate-900">
                              Realisasi:{' '}
                              <strong className="font-mono text-[#1D7AFC]">{term.actual_progress}%</strong>
                            </span>
                          </div>
                          <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-slate-300 rounded-full"
                              style={{ width: `${Math.min(100, term.target_progress)}%` }}
                            />
                            <div
                              className="absolute inset-y-0 left-0 bg-[#1D7AFC] rounded-full"
                              style={{ width: `${Math.min(100, term.actual_progress)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                            <span>Dibayar: {formatRupiah(paid)}</span>
                            <span>Sisa: {formatRupiah(unpaid)}</span>
                          </div>
                        </div>

                        <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-2">
                          <div className="lg:text-right">
                            <div className="text-sm font-bold font-mono text-[#13233C] tabular-nums">
                              {formatRupiah(term.term_value)}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              Porsi {term.payment_percentage}% · Target Progres {term.target_progress}%
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <StatusLabel status={statusRealization} />
                            <StatusLabel status={timelineStatus} />
                            {activeContract.status === 'Aktif' &&
                              allowSubmitClaim &&
                              !linkedClaim &&
                              unpaid > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateSubmenu('pengajuan', activeContract.id)}
                                  className="px-2.5 py-1 text-[11px] font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Ajukan Termin</span>
                                </button>
                              )}
                            {linkedClaim?.status === 'Menunggu Approval' && (
                              <button
                                type="button"
                                onClick={() => onNavigateSubmenu('approval', activeContract.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Proses Approval</span>
                              </button>
                            )}
                            {linkedClaim?.status === 'Disetujui' && unpaid > 0 && allowPayment && (
                              <button
                                type="button"
                                onClick={() => onNavigateSubmenu('pembayaran', activeContract.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Catat Bayar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={activateOpen}
        title={`Aktifkan Kontrak ${activeContract?.contract_number ?? ''}?`}
        description="Setelah kontrak aktif, proyek otomatis terbuka untuk Tim Logistik dan termin pembayaran dapat diajukan sesuai progres lapangan."
        confirmLabel="Aktifkan Kontrak"
        noteLabel="Catatan Aktivasi"
        onCancel={() => setActivateOpen(false)}
        onConfirm={async (note) => {
          if (!activeContract) return;
          await activateContractApi(activeContract.id, { document_verified: true, note });
          setActivateOpen(false);
        }}
      />
    </div>
  );
};
