import React, { useMemo, useState } from 'react';
import { Download, Eye, FileBarChart2, FileSpreadsheet } from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { ContractStatus, TerminTimelineStatus } from '../../../types/pms';
import { formatDateID, formatRupiah } from '../../../utils/format';
import {
  buildContractReportPdfBytes,
  exportContractReportExcel,
  exportContractReportPdf,
} from '../../../utils/contractExport';
import { EmptyState } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

type ReportType =
  | 'daftar-kontrak'
  | 'kontrak-aktif'
  | 'kontrak-berakhir'
  | 'rincian-termin'
  | 'pengajuan-termin'
  | 'approval-termin'
  | 'realisasi-pembayaran'
  | 'sisa-tagihan'
  | 'addendum-kontrak';

const REPORT_TYPES: Array<{ key: ReportType; label: string }> = [
  { key: 'daftar-kontrak', label: '1. Laporan Daftar Kontrak' },
  { key: 'kontrak-aktif', label: '2. Laporan Kontrak Aktif' },
  { key: 'kontrak-berakhir', label: '3. Laporan Kontrak Mendekati Berakhir' },
  { key: 'rincian-termin', label: '4. Laporan Rincian Termin Kontrak' },
  { key: 'pengajuan-termin', label: '5. Laporan Pengajuan Termin' },
  { key: 'approval-termin', label: '6. Laporan Approval Termin' },
  { key: 'realisasi-pembayaran', label: '7. Laporan Realisasi Pembayaran Termin' },
  { key: 'sisa-tagihan', label: '8. Laporan Sisa Tagihan / Nilai Kontrak Belum Dibayar' },
  { key: 'addendum-kontrak', label: '9. Laporan Addendum Kontrak' },
];

export const ContractReportsView: React.FC = () => {
  const { state, showToast } = usePMS();

  const [reportType, setReportType] = useState<ReportType>('daftar-kontrak');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [contractFilter, setContractFilter] = useState('SEMUA');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [clientFilter, setClientFilter] = useState('SEMUA');
  const [contractStatusFilter, setContractStatusFilter] = useState<'SEMUA' | ContractStatus>('SEMUA');
  const [termStatusFilter, setTermStatusFilter] = useState<'SEMUA' | TerminTimelineStatus>('SEMUA');
  const [pdfPreview, setPdfPreview] = useState<{
    bytes: Uint8Array;
    fileName: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const clients = useMemo(() => {
    const set = new Set<string>();
    visibleContracts.forEach((c) => {
      if (c.counterparty) set.add(c.counterparty);
    });
    return Array.from(set).sort();
  }, [visibleContracts]);

  const inRange = (dateStr: string) => {
    if (!dateStr) return true;
    const d = dateStr.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const baseContracts = useMemo(() => {
    return visibleContracts.filter((c) => {
      if (contractFilter !== 'SEMUA' && c.id !== contractFilter) return false;
      if (projectFilter !== 'SEMUA' && c.project_id !== projectFilter) return false;
      if (clientFilter !== 'SEMUA' && c.counterparty !== clientFilter) return false;
      if (contractStatusFilter !== 'SEMUA' && c.status !== contractStatusFilter) return false;
      if (!inRange(c.contract_date)) return false;
      return true;
    });
  }, [
    visibleContracts,
    contractFilter,
    projectFilter,
    clientFilter,
    contractStatusFilter,
    dateFrom,
    dateTo,
  ]);

  const reportPayload = useMemo(() => {
    const allowedContractIds = new Set(baseContracts.map((c) => c.id));
    const reportMeta = REPORT_TYPES.find((r) => r.key === reportType)!;

    if (
      reportType === 'daftar-kontrak' ||
      reportType === 'kontrak-aktif' ||
      reportType === 'kontrak-berakhir'
    ) {
      const now = new Date();
      const targetContracts = baseContracts.filter((c) => {
        if (reportType === 'kontrak-aktif') return c.status === 'Aktif';
        if (reportType === 'kontrak-berakhir') {
          const daysLeft = Math.ceil(
            (new Date(c.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          return c.status === 'Akan Berakhir' || (c.status === 'Aktif' && daysLeft <= 45);
        }
        return true;
      });
      let sumVal = 0;
      let sumPaid = 0;
      let sumRem = 0;
      const rows = targetContracts.map((c) => {
        const prj = state.projects.find((p) => p.id === c.project_id);
        const terms = state.contractTerms.filter((t) => t.contract_id === c.id);
        const paid = terms.reduce(
          (s, t) => s + Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0)),
          0
        );
        const rem = Math.max(0, c.contract_value - paid);
        sumVal += c.contract_value;
        sumPaid += paid;
        sumRem += rem;
        return [
          c.contract_number,
          prj?.project_number ?? '-',
          c.work_name,
          c.counterparty,
          `${formatDateID(c.start_date)} - ${formatDateID(c.end_date)}`,
          formatRupiah(c.contract_value),
          formatRupiah(paid),
          formatRupiah(rem),
          c.status,
        ];
      });
      return {
        title: reportMeta.label.replace(/^\d+\.\s*/, ''),
        headers: [
          'No. Kontrak',
          'Proyek',
          'Nama Pekerjaan',
          'Instansi / Klien',
          'Periode',
          'Nilai Kontrak',
          'Dibayar',
          'Sisa Tagihan',
          'Status',
        ],
        rows,
        summaryRow: [
          'TOTAL',
          '',
          `${rows.length} Kontrak`,
          '',
          '',
          formatRupiah(sumVal),
          formatRupiah(sumPaid),
          formatRupiah(sumRem),
          '',
        ],
      };
    }

    if (reportType === 'rincian-termin') {
      const terms = state.contractTerms.filter((t) => {
        if (!allowedContractIds.has(t.contract_id)) return false;
        if (!inRange(t.execution_date)) return false;
        const st = t.timeline_status || (t.payment_status === 'Terbayar' ? 'Dibayar' : 'Terjadwal');
        if (termStatusFilter !== 'SEMUA' && st !== termStatusFilter) return false;
        return true;
      });
      let sumVal = 0;
      let sumPaid = 0;
      const rows = terms.map((t) => {
        const ctr = state.contracts.find((c) => c.id === t.contract_id);
        const paid = Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0));
        sumVal += t.term_value;
        sumPaid += paid;
        return [
          ctr?.contract_number ?? '-',
          t.term_number,
          formatDateID(t.execution_date),
          `${t.payment_percentage}%`,
          `${t.actual_progress}% / ${t.target_progress}%`,
          formatRupiah(t.term_value),
          formatRupiah(paid),
          t.timeline_status || t.payment_status,
        ];
      });
      return {
        title: 'Laporan Rincian Termin Kontrak',
        headers: [
          'No. Kontrak',
          'Termin',
          'Tgl Pelaksanaan',
          'Porsi',
          'Aktual / Target',
          'Nominal Termin',
          'Dibayar',
          'Status Termin',
        ],
        rows,
        summaryRow: [
          'TOTAL',
          `${rows.length} Termin`,
          '',
          '',
          '',
          formatRupiah(sumVal),
          formatRupiah(sumPaid),
          '',
        ],
      };
    }

    if (reportType === 'pengajuan-termin' || reportType === 'approval-termin') {
      const claims = state.termClaims.filter(
        (cl) => allowedContractIds.has(cl.contract_id) && inRange(cl.claim_date)
      );
      let sumClaim = 0;
      const rows = claims.map((cl) => {
        const ctr = state.contracts.find((c) => c.id === cl.contract_id);
        const trm = state.contractTerms.find((t) => t.id === cl.term_id);
        sumClaim += cl.claim_amount;
        return [
          cl.claim_number,
          ctr?.contract_number ?? '-',
          trm?.term_number ?? '-',
          formatDateID(cl.claim_date),
          `${cl.actual_progress}% / ${cl.target_progress}%`,
          formatRupiah(cl.claim_amount),
          cl.submitted_by_name,
          cl.decision_by_name || '-',
          cl.status,
        ];
      });
      return {
        title:
          reportType === 'pengajuan-termin'
            ? 'Laporan Pengajuan Termin'
            : 'Laporan Approval Termin Finance',
        headers: [
          'No. Pengajuan',
          'No. Kontrak',
          'Termin',
          'Tgl Ajuan',
          'Progres',
          'Nilai Klaim',
          'Pengaju',
          'Pemutus Finance',
          'Status',
        ],
        rows,
        summaryRow: [
          'TOTAL',
          '',
          `${rows.length} Pengajuan`,
          '',
          '',
          formatRupiah(sumClaim),
          '',
          '',
          '',
        ],
      };
    }

    if (reportType === 'realisasi-pembayaran') {
      const pays = state.termPayments.filter(
        (p) => allowedContractIds.has(p.contract_id) && inRange(p.payment_date)
      );
      let sumPaid = 0;
      const rows = pays.map((p) => {
        const ctr = state.contracts.find((c) => c.id === p.contract_id);
        const trm = state.contractTerms.find((t) => t.id === p.term_id);
        sumPaid += p.paid_amount;
        return [
          p.payment_no,
          ctr?.contract_number ?? '-',
          trm?.term_number ?? '-',
          formatDateID(p.payment_date),
          p.payment_method,
          p.transaction_ref,
          formatRupiah(p.paid_amount),
          p.recorded_by_name,
        ];
      });
      return {
        title: 'Laporan Realisasi Pembayaran Termin',
        headers: [
          'No. Pembayaran',
          'No. Kontrak',
          'Termin',
          'Tanggal Bayar',
          'Metode',
          'Ref Transaksi',
          'Nominal Dibayar',
          'Pencatat',
        ],
        rows,
        summaryRow: [
          'TOTAL',
          '',
          `${rows.length} Transaksi`,
          '',
          '',
          '',
          formatRupiah(sumPaid),
          '',
        ],
      };
    }

    if (reportType === 'sisa-tagihan') {
      let sumVal = 0;
      let sumPaid = 0;
      let sumUnpaid = 0;
      const rows = baseContracts
        .map((c) => {
          const terms = state.contractTerms.filter((t) => t.contract_id === c.id);
          const paid = terms.reduce(
            (s, t) => s + Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0)),
            0
          );
          const unpaid = Math.max(0, c.contract_value - paid);
          return { c, paid, unpaid };
        })
        .filter((x) => x.unpaid > 0)
        .map(({ c, paid, unpaid }) => {
          sumVal += c.contract_value;
          sumPaid += paid;
          sumUnpaid += unpaid;
          const pctPaid = c.contract_value > 0 ? Math.round((paid / c.contract_value) * 100) : 0;
          return [
            c.contract_number,
            c.work_name,
            c.counterparty,
            formatRupiah(c.contract_value),
            formatRupiah(paid),
            formatRupiah(unpaid),
            `${pctPaid}%`,
            c.status,
          ];
        });
      return {
        title: 'Laporan Sisa Tagihan / Nilai Kontrak Belum Dibayar',
        headers: [
          'No. Kontrak',
          'Pekerjaan',
          'Instansi',
          'Nilai Kontrak',
          'Sudah Dibayar',
          'Sisa Belum Dibayar',
          '% Terbayar',
          'Status',
        ],
        rows,
        summaryRow: [
          'TOTAL',
          `${rows.length} Kontrak`,
          '',
          formatRupiah(sumVal),
          formatRupiah(sumPaid),
          formatRupiah(sumUnpaid),
          '',
          '',
        ],
      };
    }

    // addendum-kontrak
    const adds = state.contractAddendums.filter(
      (a) => allowedContractIds.has(a.contract_id) && inRange(a.addendum_date)
    );
    const rows = adds.map((a) => {
      const ctr = state.contracts.find((c) => c.id === a.contract_id);
      const delta = a.value_after - a.value_before;
      return [
        a.addendum_number,
        ctr?.contract_number ?? '-',
        formatDateID(a.addendum_date),
        a.change_type,
        formatRupiah(a.value_before),
        formatRupiah(a.value_after),
        `${delta >= 0 ? '+' : ''}${formatRupiah(delta)}`,
        a.approved_by_name,
      ];
    });
    return {
      title: 'Laporan Addendum Kontrak',
      headers: [
        'No. Addendum',
        'No. Kontrak',
        'Tanggal',
        'Jenis Perubahan',
        'Nilai Lama',
        'Nilai Baru',
        'Selisih',
        'Penyetuju',
      ],
      rows,
      summaryRow: ['TOTAL', `${rows.length} Addendum`, '', '', '', '', '', ''],
    };
  }, [
    reportType,
    baseContracts,
    state.projects,
    state.contracts,
    state.contractTerms,
    state.termClaims,
    state.termPayments,
    state.contractAddendums,
    termStatusFilter,
    dateFrom,
    dateTo,
  ]);

  const handleExport = (format: 'pdf' | 'excel' | 'preview-pdf') => {
    const opts = {
      title: reportPayload.title,
      subtitle: `Periode: ${dateFrom || 'Awal'} s/d ${dateTo || 'Sekarang'} · Proyek: ${projectFilter} · Instansi: ${clientFilter}`,
      fileName: `PMS-${reportType}-${new Date().toISOString().slice(0, 10)}`,
      headers: reportPayload.headers,
      rows: reportPayload.rows,
      summaryRow: reportPayload.summaryRow,
    };
    try {
      if (format === 'preview-pdf') {
        const bytes = buildContractReportPdfBytes(opts);
        setPdfPreview({
          bytes,
          fileName: `${opts.fileName}.pdf`,
          title: opts.title,
          subtitle: opts.subtitle,
        });
      } else if (format === 'pdf') {
        exportContractReportPdf(opts);
        showToast(`PDF ${opts.fileName}.pdf berhasil diunduh.`);
      } else {
        exportContractReportExcel(opts);
        showToast(`Excel ${opts.fileName}.xlsx berhasil diunduh.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat file laporan.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Laporan Kontrak & Termin
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            9 laporan operasional kontrak, termin, approval, realisasi pembayaran, sisa tagihan, dan addendum dengan pratinjau & ekspor PDF / Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={reportPayload.rows.length === 0}
            onClick={() => handleExport('preview-pdf')}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5 text-[#1D7AFC]" />
            <span>Preview PDF</span>
          </button>
          <button
            type="button"
            disabled={reportPayload.rows.length === 0}
            onClick={() => handleExport('pdf')}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            <span>Download PDF</span>
          </button>
          <button
            type="button"
            disabled={reportPayload.rows.length === 0}
            onClick={() => handleExport('excel')}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Matrix */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Jenis Laporan</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full px-3 py-2 bg-blue-50/60 border border-blue-200 rounded-xl font-bold text-[#13233C]"
            >
              {REPORT_TYPES.map((rt) => (
                <option key={rt.key} value={rt.key}>
                  {rt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Kontrak</option>
            {visibleContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
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
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Instansi / Klien</option>
            {clients.map((cl) => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>
          <select
            value={contractStatusFilter}
            onChange={(e) =>
              setContractStatusFilter(e.target.value as 'SEMUA' | ContractStatus)
            }
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Status Kontrak</option>
            <option value="Draft">Draft</option>
            <option value="Aktif">Aktif</option>
            <option value="Akan Berakhir">Akan Berakhir</option>
            <option value="Selesai">Selesai</option>
            <option value="Ditutup">Ditutup</option>
          </select>
          <select
            value={termStatusFilter}
            onChange={(e) =>
              setTermStatusFilter(e.target.value as 'SEMUA' | TerminTimelineStatus)
            }
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Status Termin</option>
            <option value="Terjadwal">Terjadwal</option>
            <option value="Menunggu Approval">Menunggu Approval</option>
            <option value="Disetujui">Disetujui</option>
            <option value="Dibayar">Dibayar</option>
            <option value="Revisi">Revisi</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Live Preview Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-[#1D7AFC]" />
            <h2 className="text-sm font-bold text-[#13233C]">{reportPayload.title}</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">{reportPayload.rows.length} baris</span>
        </div>

        {reportPayload.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Tidak Ada Data Laporan"
              description="Sesuaikan filter periode, kontrak, proyek, atau status di atas untuk melihat data laporan."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  {reportPayload.headers.map((h) => (
                    <th key={h} className="py-3 px-4 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportPayload.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 text-slate-700 whitespace-nowrap tabular-nums">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {reportPayload.summaryRow && (
                <tfoot className="bg-blue-50/70 border-t-2 border-blue-200 font-bold text-[#13233C]">
                  <tr>
                    {reportPayload.summaryRow.map((cell, idx) => (
                      <td key={idx} className="py-3 px-4 whitespace-nowrap tabular-nums">
                        {cell}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        title={pdfPreview?.title ?? 'Pratinjau Laporan'}
        subtitle={pdfPreview?.subtitle}
        fileName={pdfPreview?.fileName ?? 'Laporan-Kontrak.pdf'}
        fileExtension="pdf"
        sourceBytes={pdfPreview?.bytes ?? null}
        onDownloadComplete={(name) => showToast(`Laporan ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
