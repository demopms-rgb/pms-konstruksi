import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { Contract, ContractStatus, ContractSubmenuKey } from '../../../types/pms';
import {
  computeTermPaymentRealization,
  formatDateID,
  formatRupiah,
} from '../../../utils/format';
import {
  canActivateOrCloseContract,
  canCreateContract,
  canDeleteContract,
  canExportContractReports,
} from '../../../utils/permissions';
import {
  buildContractReportPdfBytes,
  exportContractReportExcel,
  exportContractReportPdf,
} from '../../../utils/contractExport';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  PaginationBar,
  SearchInput,
  StatusLabel,
} from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';
import { ContractDashboardWidgets } from './ContractDashboardWidgets';

interface ContractListViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const ContractListView: React.FC<ContractListViewProps> = ({ onNavigateSubmenu }) => {
  const {
    state,
    currentRole,
    currentDivision,
    selectedContractId,
    setSelectedContractId,
    activateContractApi,
    closeContractApi,
    deleteContractApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { getAttachmentsFor } = useAttachments();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | ContractStatus>('SEMUA');
  const [projectFilter, setProjectFilter] = useState<string>('SEMUA');
  const [periodFilter, setPeriodFilter] = useState<string>('SEMUA');
  const [sortBy, setSortBy] = useState<'date_desc' | 'value_desc' | 'end_asc' | 'num_asc'>('date_desc');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const activeContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const [detailContract, setDetailContract] = useState<Contract | null>(() =>
    selectedContractId
      ? activeContracts.find((c) => c.id === selectedContractId) ?? null
      : null
  );
  const [activateTarget, setActivateTarget] = useState<Contract | null>(null);
  const [closeTarget, setCloseTarget] = useState<Contract | null>(null);

  // Soft-delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Unified PDF Preview state for Daftar-Kontrak-YYYY-MM-DD.pdf
  const [pdfPreview, setPdfPreview] = useState<{
    bytes: Uint8Array;
    fileName: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowCreate = canCreateContract(roleCode, divCode);
  const allowDelete = canDeleteContract(roleCode, divCode);
  const allowActivateClose = canActivateOrCloseContract(roleCode, divCode);
  const allowExport = canExportContractReports(roleCode, divCode);

  const periods = useMemo(() => {
    const set = new Set<string>();
    activeContracts.forEach((c) => {
      if (c.contract_date) set.add(c.contract_date.slice(0, 4));
      if (c.start_date) set.add(c.start_date.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [activeContracts]);

  const enrichedContracts = useMemo(() => {
    return activeContracts.map((c) => {
      const prj = state.projects.find((p) => p.id === c.project_id);
      const terms = state.contractTerms.filter((t) => t.contract_id === c.id);
      const paidTotal = terms.reduce(
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
      const remainingTotal = Math.max(0, c.contract_value - paidTotal);
      return {
        contract: c,
        project: prj,
        termCount: terms.length,
        paidTotal,
        remainingTotal,
      };
    });
  }, [activeContracts, state.projects, state.contractTerms, state.termPayments, state.termClaims]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedContracts
      .filter(({ contract: c, project: p }) => {
        if (statusFilter !== 'SEMUA' && c.status !== statusFilter) return false;
        if (projectFilter !== 'SEMUA' && c.project_id !== projectFilter) return false;
        if (
          periodFilter !== 'SEMUA' &&
          !c.contract_date.startsWith(periodFilter) &&
          !c.start_date.startsWith(periodFilter)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          c.contract_number.toLowerCase().includes(q) ||
          c.work_name.toLowerCase().includes(q) ||
          c.counterparty.toLowerCase().includes(q) ||
          (p?.name.toLowerCase().includes(q) ?? false) ||
          (p?.project_number.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'value_desc':
            return b.contract.contract_value - a.contract.contract_value;
          case 'end_asc':
            return a.contract.end_date.localeCompare(b.contract.end_date);
          case 'num_asc':
            return a.contract.contract_number.localeCompare(b.contract.contract_number);
          case 'date_desc':
          default:
            return b.contract.contract_date.localeCompare(a.contract.contract_date);
        }
      });
  }, [enrichedContracts, search, statusFilter, projectFilter, periodFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const buildListExportOptions = () => {
    const headers = [
      'No. Kontrak/SPK',
      'Kode Proyek',
      'Nama Proyek & Pekerjaan',
      'Instansi / Pihak Pertama',
      'Nilai Kontrak',
      'Periode',
      'Termin',
      'Sudah Dibayar',
      'Sisa Bayar',
      'Status',
    ];
    const rows = filtered.map(({ contract: c, project: p, termCount, paidTotal, remainingTotal }) => [
      c.contract_number,
      p?.project_number ?? '-',
      c.work_name,
      c.counterparty,
      formatRupiah(c.contract_value),
      `${formatDateID(c.start_date)} - ${formatDateID(c.end_date)}`,
      `${termCount} termin`,
      formatRupiah(paidTotal),
      formatRupiah(remainingTotal),
      c.status,
    ]);
    const totalVal = filtered.reduce((s, r) => s + r.contract.contract_value, 0);
    const totalPaid = filtered.reduce((s, r) => s + r.paidTotal, 0);
    const totalRem = filtered.reduce((s, r) => s + r.remainingTotal, 0);
    const summaryRow = [
      'TOTAL',
      '',
      `${filtered.length} Kontrak`,
      '',
      formatRupiah(totalVal),
      '',
      '',
      formatRupiah(totalPaid),
      formatRupiah(totalRem),
      '',
    ];
    return {
      title: 'Daftar Kontrak & Realisasi Pembayaran',
      subtitle: `Filter Status: ${statusFilter} · Proyek: ${projectFilter}`,
      fileName: `Daftar-Kontrak-${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      summaryRow,
    };
  };

  const handleExport = (type: 'pdf' | 'excel' | 'preview-pdf') => {
    const opts = buildListExportOptions();
    try {
      if (type === 'preview-pdf') {
        const bytes = buildContractReportPdfBytes(opts);
        setPdfPreview({
          bytes,
          fileName: `${opts.fileName}.pdf`,
          title: opts.title,
          subtitle: opts.subtitle,
        });
      } else if (type === 'pdf') {
        exportContractReportPdf(opts);
        showToast(`PDF ${opts.fileName}.pdf berhasil dibuat dan diunduh.`);
      } else {
        exportContractReportExcel(opts);
        showToast(`Excel ${opts.fileName}.xlsx berhasil diunduh.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat dokumen ekspor kontrak.');
    }
  };

  const detailMetrics = useMemo(() => {
    if (!detailContract) return null;
    const prj = state.projects.find((p) => p.id === detailContract.project_id);
    const terms = state.contractTerms
      .filter((t) => t.contract_id === detailContract.id)
      .sort((a, b) => a.execution_date.localeCompare(b.execution_date));
    const termRows = terms.map((t) => ({
      term: t,
      ...computeTermPaymentRealization({
        approvedAmount: t.term_value,
        term: t,
        termPayments: state.termPayments,
        claims: state.termClaims,
      }),
    }));
    const paid = termRows.reduce((s, r) => s + r.paidAmount, 0);
    const totalPct = terms.reduce((s, t) => s + Number(t.payment_percentage || 0), 0);
    const contractFiles = [
      ...getAttachmentsFor('kontrak', detailContract.id),
      ...getAttachmentsFor('proyek', detailContract.project_id).filter((a) =>
        a.doc_category.toLowerCase().includes('spk') || a.doc_category.toLowerCase().includes('kontrak')
      ),
    ];
    return {
      project: prj,
      terms,
      termRows,
      paid,
      remaining: Math.max(0, detailContract.contract_value - paid),
      totalPct,
      contractFiles,
    };
  }, [
    detailContract,
    state.projects,
    state.contractTerms,
    state.termPayments,
    state.termClaims,
    getAttachmentsFor,
  ]);

  const deleteTargetInfo = useMemo(() => {
    if (!deleteTarget) return null;
    const project = state.projects.find((p) => p.id === deleteTarget.project_id);
    const terms = state.contractTerms.filter((t) => t.contract_id === deleteTarget.id);
    const termIds = new Set(terms.map((t) => t.id));
    const hasPayments = state.termPayments.some((p) => p.contract_id === deleteTarget.id);
    const hasClaims = state.termClaims.some((cl) => cl.contract_id === deleteTarget.id);
    const hasPaidTerms = terms.some(
      (t) =>
        Number(t.paid_amount ?? 0) > 0 ||
        t.payment_status === 'Terbayar' ||
        t.timeline_status === 'Dibayar' ||
        t.payment_realization_status === 'Lunas' ||
        t.payment_realization_status === 'Dibayar Sebagian'
    );
    const hasFinanceTx = state.financialTransactions.some(
      (ft) => ft.contract_term_id && termIds.has(ft.contract_term_id)
    );
    const blocked = hasPayments || hasClaims || hasPaidTerms || hasFinanceTx;
    return { project, blocked };
  }, [
    deleteTarget,
    state.projects,
    state.contractTerms,
    state.termPayments,
    state.termClaims,
    state.financialTransactions,
  ]);

  const handleOpenDelete = (contract: Contract) => {
    setDeleteTarget(contract);
    setDeleteReason('');
    setDeleteError('');
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    if (!deleteReason.trim()) {
      setDeleteError('Alasan penghapusan kontrak wajib diisi.');
      return;
    }
    const res = await deleteContractApi(deleteTarget.id, deleteReason.trim());
    if (!res.ok) {
      setDeleteError(res.message);
      return;
    }
    if (detailContract?.id === deleteTarget.id) {
      setDetailContract(null);
    }
    setDeleteTarget(null);
    setDeleteReason('');
    setDeleteError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Kontrak & Termin — Daftar & Ringkasan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pemantauan nilai kontrak, realisasi termin pembayaran, jadwal jatuh tempo, dan status aktivasi kontrak proyek.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowExport && (
            <>
              <button
                type="button"
                onClick={() => handleExport('preview-pdf')}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-[#1D7AFC]" />
                <span>Preview PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-red-600" />
                <span>Export PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('excel')}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Excel</span>
              </button>
            </>
          )}
          {allowCreate && (
            <button
              type="button"
              onClick={() => onNavigateSubmenu('pembuatan')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Kontrak Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-DB Dashboard KPIs & 6 Visualizations */}
      <ContractDashboardWidgets onNavigateSubmenu={onNavigateSubmenu} />

      {/* Contract Table Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari nomor kontrak/SPK, nama pekerjaan, instansi, atau proyek..."
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'SEMUA' | ContractStatus);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Status</option>
            <option value="Draft">Draft</option>
            <option value="Aktif">Aktif</option>
            <option value="Akan Berakhir">Akan Berakhir</option>
            <option value="Selesai">Selesai</option>
            <option value="Ditutup">Ditutup</option>
          </select>
          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl max-w-[200px]"
          >
            <option value="SEMUA">Semua Proyek</option>
            {state.projects
              .filter((p) => !p.is_deleted)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
          </select>
          <select
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Periode</option>
            {periods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div className="inline-flex items-center gap-1 text-xs text-slate-600">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="date_desc">Terbaru</option>
              <option value="value_desc">Nilai Tertinggi</option>
              <option value="end_asc">Berakhir Terdekat</option>
              <option value="num_asc">Nomor Kontrak A-Z</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Belum Ada Kontrak yang Sesuai"
              description="Sesuaikan filter pencarian atau buat kontrak baru dari proyek yang sudah disetujui Tim Finance."
              actionLabel={allowCreate ? 'Buat Kontrak Baru' : undefined}
              onAction={allowCreate ? () => onNavigateSubmenu('pembuatan') : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Nomor Kontrak / Proyek</th>
                    <th className="py-3 px-4 font-semibold">Instansi / Klien</th>
                    <th className="py-3 px-4 font-semibold">Periode</th>
                    <th className="py-3 px-4 font-semibold text-right">Nilai Kontrak</th>
                    <th className="py-3 px-4 font-semibold text-center">Termin</th>
                    <th className="py-3 px-4 font-semibold text-right">Dibayar</th>
                    <th className="py-3 px-4 font-semibold text-right">Sisa Bayar</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map(({ contract: c, project: p, termCount, paidTotal, remainingTotal }) => (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedContractId(c.id);
                        setDetailContract(c);
                      }}
                      className={`cursor-pointer transition-colors ${
                        selectedContractId === c.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-[#1D7AFC]">
                          <span>{c.contract_number}</span>
                        </div>
                        <div className="font-semibold text-slate-900 mt-0.5 line-clamp-1">
                          {c.work_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p?.project_number ?? '-'} · {p?.name ?? '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{c.counterparty}</td>
                      <td className="py-3 px-4 text-slate-600 tabular-nums whitespace-nowrap">
                        <div>{formatDateID(c.start_date)}</div>
                        <div className="text-slate-400">s/d {formatDateID(c.end_date)}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatRupiah(c.contract_value, true)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums">
                        {termCount} termin
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatRupiah(paidTotal, true)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-800 tabular-nums whitespace-nowrap">
                        {formatRupiah(remainingTotal, true)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContractId(c.id);
                              setDetailContract(c);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Detail</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateSubmenu('timeline', c.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1D7AFC] font-semibold cursor-pointer"
                          >
                            Termin
                          </button>
                          {allowDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDelete(c);
                              }}
                              title={`Hapus kontrak ${c.contract_number}`}
                              className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Contract Detail Modal */}
      <Modal
        open={Boolean(detailContract)}
        onClose={() => setDetailContract(null)}
        title={detailContract ? `Detail Kontrak ${detailContract.contract_number}` : ''}
        subtitle={detailContract?.work_name}
        maxWidth="max-w-3xl"
      >
        {detailContract && detailMetrics && (
          <div className="space-y-5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel status={detailContract.status} />
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono font-semibold">
                  Versi v{detailContract.current_version ?? 1}
                </span>
                {detailContract.document_verified ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    PDF Kontrak Terverifikasi
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                    <FileText className="w-4 h-4" />
                    Dokumen PDF Belum Diverifikasi
                  </span>
                )}
              </div>
              <span className="text-slate-500">
                PIC: <strong className="text-slate-800">{detailContract.pic_contract || '-'}</strong>
              </span>
            </div>

            {/* Key Value Comparison */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">RAB Disetujui</span>
                <p className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                  {formatRupiah(detailContract.rab_approved_value ?? detailContract.contract_value)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                <span className="text-blue-700">Nilai Kontrak Final</span>
                <p className="font-mono font-bold text-[#13233C] mt-1 tabular-nums">
                  {formatRupiah(detailContract.contract_value)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="text-emerald-700">Sudah Dibayar</span>
                <p className="font-mono font-bold text-emerald-800 mt-1 tabular-nums">
                  {formatRupiah(detailMetrics.paid)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-amber-800">Sisa Pembayaran</span>
                <p className="font-mono font-bold text-amber-900 mt-1 tabular-nums">
                  {formatRupiah(detailMetrics.remaining)}
                </p>
              </div>
            </div>

            {/* Parties & Scope */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-500">Proyek Terkait</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {detailMetrics.project?.project_number} — {detailMetrics.project?.name}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Pihak Pertama (Instansi / Pemberi Kerja)</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {detailContract.first_party_name || detailContract.counterparty}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Pihak Kedua (Pelaksana)</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {detailContract.second_party_name || 'PT. Wilwa Abiyasa Sejahtera'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Periode Pelaksanaan</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {formatDateID(detailContract.start_date)} s/d {formatDateID(detailContract.end_date)}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-slate-500">Ruang Lingkup Pekerjaan</p>
                <p className="text-slate-800 mt-0.5 leading-relaxed">
                  {detailContract.scope_description || '-'}
                </p>
              </div>
            </div>

            {/* Rincian Termin & Status Realisasi Pembayaran */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#13233C]">
                  Rincian Termin & Status Realisasi ({detailMetrics.termRows.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  Total Porsi: {detailMetrics.totalPct.toFixed(1).replace(/\.0$/, '')}%
                </span>
              </div>
              {detailMetrics.termRows.length === 0 ? (
                <p className="p-4 text-center text-slate-500">
                  Belum ada jadwal termin tersusun untuk kontrak ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {detailMetrics.termRows.map(
                    ({ term: t, approvedAmount, paidAmount, remainingAmount, statusRealization }) => (
                      <div
                        key={t.id}
                        className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">
                            {t.term_number} ·{' '}
                            <span className="font-mono text-slate-600">{t.payment_percentage}%</span>
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            Target {formatDateID(t.execution_date)} · Dibayar{' '}
                            <span className="font-semibold text-emerald-700">
                              {formatRupiah(paidAmount)}
                            </span>{' '}
                            · Sisa{' '}
                            <span className="font-semibold text-amber-800">
                              {formatRupiah(remainingAmount)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono font-bold text-[#13233C] tabular-nums">
                            {formatRupiah(approvedAmount)}
                          </span>
                          <StatusLabel status={statusRealization} />
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Activation / Closing checklist & Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailContract(null);
                    onNavigateSubmenu('timeline', detailContract.id);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                >
                  Atur Timeline Termin ({detailMetrics.terms.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailContract(null);
                    onNavigateSubmenu('dokumen', detailContract.id);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                >
                  Dokumen Kontrak ({detailMetrics.contractFiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailContract(null);
                    onNavigateSubmenu('addendum', detailContract.id);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                >
                  Addendum
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {allowActivateClose && detailContract.status === 'Draft' && (
                  <button
                    type="button"
                    disabled={workflowBusy}
                    onClick={() => setActivateTarget(detailContract)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aktifkan Kontrak</span>
                  </button>
                )}
                {allowActivateClose &&
                  (detailContract.status === 'Aktif' || detailContract.status === 'Akan Berakhir') &&
                  detailMetrics.remaining === 0 && (
                    <button
                      type="button"
                      disabled={workflowBusy}
                      onClick={() => setCloseTarget(detailContract)}
                      className="px-4 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Tutup Kontrak (Selesai)</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Activate Contract Confirmation */}
      <ConfirmDialog
        open={Boolean(activateTarget)}
        title={`Aktifkan Kontrak ${activateTarget?.contract_number ?? ''}?`}
        description="Aktivasi membutuhkan dokumen PDF kontrak terverifikasi dan jadwal termin lengkap 100%. Setelah aktif, proyek otomatis terbuka untuk Tim Logistik."
        confirmLabel="Aktifkan Kontrak"
        noteLabel="Catatan Aktivasi Kontrak"
        onCancel={() => setActivateTarget(null)}
        onConfirm={async (note) => {
          if (!activateTarget) return;
          const res = await activateContractApi(activateTarget.id, {
            document_verified: true,
            note,
          });
          setActivateTarget(null);
          if (res.ok) setDetailContract(null);
        }}
      />

      {/* Close Contract Confirmation */}
      <ConfirmDialog
        open={Boolean(closeTarget)}
        title={`Tutup Kontrak ${closeTarget?.contract_number ?? ''}?`}
        description="Seluruh termin pembayaran telah lunas 100%. Kontrak akan ditutup dan status berubah menjadi Selesai."
        confirmLabel="Tutup Kontrak"
        noteLabel="Catatan Penutupan Kontrak"
        onCancel={() => setCloseTarget(null)}
        onConfirm={async (note) => {
          if (!closeTarget) return;
          const res = await closeContractApi(closeTarget.id, note);
          setCloseTarget(null);
          if (res.ok) setDetailContract(null);
        }}
      />

      {/* Soft Delete Contract Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!workflowBusy) setDeleteTarget(null);
        }}
        title="Konfirmasi Hapus Kontrak"
        subtitle="Penghapusan bersifat soft delete — rekam jejak audit tetap tersimpan di Riwayat Kontrak"
        maxWidth="max-w-lg"
      >
        {deleteTarget && deleteTargetInfo && (
          <form onSubmit={handleConfirmDelete} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Nomor Kontrak / SPK</span>
                <span className="font-mono font-bold text-[#13233C]">
                  {deleteTarget.contract_number}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-500 shrink-0">Nama Proyek</span>
                <span className="font-semibold text-slate-900 text-right">
                  {deleteTargetInfo.project
                    ? `${deleteTargetInfo.project.project_number} — ${deleteTargetInfo.project.name}`
                    : deleteTarget.work_name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Nilai & Status</span>
                <span className="font-semibold text-slate-800">
                  {formatRupiah(deleteTarget.contract_value)} · {deleteTarget.status}
                </span>
              </div>
            </div>

            {deleteTargetInfo.blocked && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <p className="font-bold">Kontrak Memiliki Riwayat Pembayaran / Termin</p>
                  <p>
                    Kontrak yang sudah memiliki transaksi pembayaran, DP, atau pengajuan termin tidak dapat dihapus. Silakan gunakan proses penutupan/pembatalan kontrak agar catatan keuangan tetap valid.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Alasan Penghapusan Kontrak <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                value={deleteReason}
                onChange={(e) => {
                  setDeleteReason(e.target.value);
                  setDeleteError('');
                }}
                placeholder="Contoh: Salah input draf kontrak / dibatalkan sebelum pelaksanaan..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600"
                required
              />
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={workflowBusy}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {workflowBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus Kontrak</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* PDF.js Preview Modal for Daftar-Kontrak-YYYY-MM-DD.pdf */}
      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        title={pdfPreview?.title ?? 'Pratinjau Daftar Kontrak'}
        subtitle={pdfPreview?.subtitle}
        fileName={pdfPreview?.fileName ?? 'Daftar-Kontrak.pdf'}
        fileExtension="pdf"
        sourceBytes={pdfPreview?.bytes ?? null}
        onDownloadComplete={(name) => showToast(`File ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
