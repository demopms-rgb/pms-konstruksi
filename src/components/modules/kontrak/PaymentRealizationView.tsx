import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { ContractSubmenuKey, TermClaim, TermPayment } from '../../../types/pms';
import {
  computeTermPaymentRealization,
  formatDateID,
  formatRupiah,
} from '../../../utils/format';
import { canExportContractReports, canRecordTermPayment } from '../../../utils/permissions';
import {
  buildContractReportPdfBytes,
  exportContractReportExcel,
  exportContractReportPdf,
} from '../../../utils/contractExport';
import { EmptyState, Modal, SearchInput, StatusLabel } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

interface PaymentRealizationViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const PaymentRealizationView: React.FC<PaymentRealizationViewProps> = ({
  onNavigateSubmenu,
}) => {
  const {
    state,
    currentRole,
    currentDivision,
    recordTermPaymentApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { uploadFiles, getAttachmentsFor, getSignedUrl } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowPay = canRecordTermPayment(roleCode, divCode);
  const allowExport = canExportContractReports(roleCode, divCode);

  const [contractFilter, setContractFilter] = useState('SEMUA');
  const [search, setSearch] = useState('');

  const [payModalClaim, setPayModalClaim] = useState<TermClaim | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] =
    useState<TermPayment['payment_method']>('Transfer Bank');
  const [txRef, setTxRef] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    url?: string | null;
    downloadUrl?: string | null;
    bytes?: Uint8Array | null;
    ext: string;
    subtitle?: string;
  } | null>(null);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const visibleContractIds = useMemo(
    () => new Set(visibleContracts.map((c) => c.id)),
    [visibleContracts]
  );

  const approvedClaims = useMemo(() => {
    return state.termClaims
      .filter((cl) => visibleContractIds.has(cl.contract_id) && cl.status === 'Disetujui')
      .filter((cl) => contractFilter === 'SEMUA' || cl.contract_id === contractFilter)
      .map((cl) => {
        const ctr = visibleContracts.find((c) => c.id === cl.contract_id);
        const trm = state.contractTerms.find((t) => t.id === cl.term_id);
        const {
          approvedAmount: termVal,
          paidAmount: paid,
          remainingAmount: remaining,
          statusRealization,
        } = computeTermPaymentRealization({
          approvedAmount: trm?.term_value ?? cl.claim_amount,
          term: trm,
          termPayments: state.termPayments,
          claims: state.termClaims,
        });
        return { claim: cl, contract: ctr, term: trm, termVal, paid, remaining, statusRealization };
      });
  }, [
    state.termClaims,
    state.termPayments,
    visibleContracts,
    visibleContractIds,
    state.contractTerms,
    contractFilter,
  ]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.termPayments.filter((p) => {
      if (!visibleContractIds.has(p.contract_id)) return false;
      if (contractFilter !== 'SEMUA' && p.contract_id !== contractFilter) return false;
      if (!q) return true;
      const ctr = visibleContracts.find((c) => c.id === p.contract_id);
      const trm = state.contractTerms.find((t) => t.id === p.term_id);
      return (
        p.payment_no.toLowerCase().includes(q) ||
        p.transaction_ref.toLowerCase().includes(q) ||
        (ctr?.contract_number.toLowerCase().includes(q) ?? false) ||
        (trm?.term_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [state.termPayments, visibleContracts, visibleContractIds, state.contractTerms, contractFilter, search]);

  const openPayModal = (cl: TermClaim, remaining: number) => {
    setPayModalClaim(cl);
    setPaidAmount(remaining);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('Transfer Bank');
    setTxRef(`TRF-WAS-${new Date().getFullYear()}-${String(state.termPayments.length + 1).padStart(3, '0')}`);
    setNotes('');
    setProofFiles([]);
    setUploadPct(0);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalClaim) return;
    if (paidAmount <= 0) {
      showToast('Nominal pembayaran harus lebih dari Rp 0.');
      return;
    }

    let proofIds: string[] = [];
    if (proofFiles.length > 0) {
      try {
        const created = await uploadFiles({
          files: proofFiles,
          module_id: 'kontrak',
          entity_id: payModalClaim.term_id,
          entity_label: `Bukti Bayar ${payModalClaim.claim_number}`,
          doc_category: 'Bukti Pembayaran',
          description: `Bukti transfer/pembayaran termin (${txRef})`,
          onProgress: setUploadPct,
        });
        proofIds = created.map((c) => c.id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengunggah bukti pembayaran.');
        setUploadPct(0);
        return;
      }
    }

    const res = await recordTermPaymentApi(payModalClaim.id, {
      paid_amount: paidAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      transaction_ref: txRef,
      proof_attachment_ids: proofIds,
      notes,
    });
    setUploadPct(0);
    if (res.ok) setPayModalClaim(null);
  };

  const buildExportOpts = () => {
    const headers = [
      'No. Pembayaran',
      'Kontrak',
      'Termin',
      'Tgl Bayar',
      'Metode',
      'Ref Transaksi',
      'Nominal Dibayar',
      'Pencatat',
    ];
    const rows = filteredPayments.map((p) => {
      const ctr = visibleContracts.find((c) => c.id === p.contract_id);
      const trm = state.contractTerms.find((t) => t.id === p.term_id);
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
    const total = filteredPayments.reduce((s, p) => s + p.paid_amount, 0);
    return {
      title: 'Laporan Realisasi Pembayaran Termin',
      subtitle: `Total ${filteredPayments.length} transaksi realisasi`,
      fileName: `Realisasi-Pembayaran-Termin-${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      summaryRow: ['TOTAL', '', '', '', '', '', formatRupiah(total), ''],
    };
  };

  const handleExport = (type: 'pdf' | 'excel' | 'preview') => {
    try {
      const opts = buildExportOpts();
      if (type === 'preview') {
        const bytes = buildContractReportPdfBytes(opts);
        setPreviewDoc({
          name: `${opts.fileName}.pdf`,
          bytes,
          ext: 'pdf',
          subtitle: opts.subtitle,
        });
        return;
      }
      if (type === 'pdf') {
        exportContractReportPdf(opts);
        showToast(`Laporan PDF ${opts.fileName}.pdf berhasil diunduh.`);
      } else {
        exportContractReportExcel(opts);
        showToast(`Laporan Excel ${opts.fileName}.xlsx berhasil diunduh.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat file laporan.');
    }
  };

  const openProofPreview = async (id: string) => {
    const att = getAttachmentsFor('kontrak').find((a) => a.id === id);
    if (!att) {
      showToast('File bukti pembayaran tidak ditemukan.');
      return;
    }
    try {
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(att.id, 'inline'),
        getSignedUrl(att.id, 'attachment'),
      ]);
      setPreviewDoc({
        name: att.original_name,
        url,
        downloadUrl,
        ext: att.extension,
        subtitle: att.doc_category,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka bukti.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Realisasi Pembayaran Termin
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pencatatan pembayaran aktual untuk termin yang telah disetujui Finance (mendukung pembayaran penuh maupun bertahap/parsial).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl max-w-xs"
          >
            <option value="SEMUA">Semua Kontrak</option>
            {visibleContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number} — {c.work_name}
              </option>
            ))}
          </select>
          {allowExport && (
            <>
              <button
                type="button"
                onClick={() => handleExport('preview')}
                className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-[#1D7AFC]" />
                <span>Preview PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-red-600" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('excel')}
                className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Approved Claims Payable Queue */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#13233C]">
            Termin Disetujui Siap Dibayar & Status Pelunasan
          </h2>
          <button
            type="button"
            onClick={() => onNavigateSubmenu('approval')}
            className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
          >
            Lihat Approval Termin
          </button>
        </div>

        {approvedClaims.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Belum Ada Termin Disetujui"
              description="Termin yang telah mendapat persetujuan Head Finance akan otomatis muncul di daftar realisasi pembayaran ini."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">No. Klaim & Kontrak</th>
                  <th className="py-3 px-4 font-semibold">Termin</th>
                  <th className="py-3 px-4 font-semibold text-right">Disetujui</th>
                  <th className="py-3 px-4 font-semibold text-right">Sudah Dibayar</th>
                  <th className="py-3 px-4 font-semibold text-right">Sisa Tagihan</th>
                  <th className="py-3 px-4 font-semibold">Status Realisasi</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvedClaims.map(({ claim, contract, term, termVal, paid, remaining, statusRealization }) => (
                  <tr key={claim.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#1D7AFC]">{claim.claim_number}</div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {contract?.contract_number} — {contract?.counterparty}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{term?.term_number}</div>
                      <div className="text-[11px] text-slate-500">
                        Disetujui {formatDateID(claim.decision_at || claim.claim_date)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatRupiah(termVal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatRupiah(paid)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-800 tabular-nums">
                      {formatRupiah(remaining)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={statusRealization} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {remaining > 0 && allowPay ? (
                        <button
                          type="button"
                          onClick={() => openPayModal(claim, remaining)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Catat Pembayaran</span>
                        </button>
                      ) : remaining === 0 && paid >= termVal && termVal > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Lunas</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Read-Only</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History Ledger */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[#13233C]">
            Riwayat Transaksi Pembayaran Termin ({filteredPayments.length})
          </h2>
          <div className="w-full sm:w-72">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari no. bayar, ref transfer, kontrak..."
            />
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada catatan pembayaran termin pada filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">No. Pembayaran</th>
                  <th className="py-3 px-4 font-semibold">Kontrak & Termin</th>
                  <th className="py-3 px-4 font-semibold">Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Metode & Referensi</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal Dibayar</th>
                  <th className="py-3 px-4 font-semibold">Pencatat & Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const ctr = state.contracts.find((c) => c.id === p.contract_id);
                  const trm = state.contractTerms.find((t) => t.id === p.term_id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{p.payment_no}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{ctr?.contract_number}</div>
                        <div className="text-[11px] text-slate-500">{trm?.term_number}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 tabular-nums">
                        {formatDateID(p.payment_date)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{p.payment_method}</div>
                        <div className="font-mono text-[11px] text-slate-500">{p.transaction_ref}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {formatRupiah(p.paid_amount)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700">{p.recorded_by_name}</div>
                        {p.proof_attachment_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.proof_attachment_ids.map((attId) => (
                              <button
                                key={attId}
                                type="button"
                                onClick={() => openProofPreview(attId)}
                                className="px-2 py-0.5 rounded bg-blue-50 text-[#1D7AFC] text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Paperclip className="w-3 h-3" />
                                <span>Bukti Bayar</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={Boolean(payModalClaim)}
        onClose={() => setPayModalClaim(null)}
        title={`Catat Realisasi Pembayaran — ${payModalClaim?.claim_number ?? ''}`}
        maxWidth="max-w-lg"
      >
        {payModalClaim && (() => {
          const trm = state.contractTerms.find((t) => t.id === payModalClaim.term_id);
          const {
            approvedAmount: termVal,
            paidAmount: alreadyPaid,
            remainingAmount: remaining,
          } = computeTermPaymentRealization({
            approvedAmount: trm?.term_value ?? payModalClaim.claim_amount,
            term: trm,
            termPayments: state.termPayments,
            claims: state.termClaims,
          });

          return (
            <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500">Nilai Termin</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{formatRupiah(termVal)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Sudah Dibayar</span>
                  <p className="font-mono font-bold text-emerald-700 mt-0.5">{formatRupiah(alreadyPaid)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Sisa Tagihan</span>
                  <p className="font-mono font-bold text-amber-800 mt-0.5">{formatRupiah(remaining)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Nominal Pembayaran Aktual (IDR) <span className="text-red-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPaidAmount(remaining)}
                    className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                  >
                    Bayar Lunas Sisa ({formatRupiah(remaining)})
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-sm"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {paidAmount < remaining
                    ? 'Akan tercatat sebagai "Dibayar Sebagian" dan dapat dilunasi pada transaksi berikutnya.'
                    : 'Akan langsung melunasi termin ini menjadi status "Lunas" dan tersinkron ke Ledger Finance.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Bayar</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as TermPayment['payment_method'])
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Virtual Account">Virtual Account</option>
                    <option value="Giro / Cek">Giro / Cek</option>
                    <option value="Tunai Kas">Tunai Kas</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Referensi / Bukti Transfer <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  placeholder="Contoh: TRF-BRI-2026-112"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Pembayaran</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                  <FileUp className="w-3.5 h-3.5 text-[#1D7AFC]" />
                  <span>Unggah Bukti Pembayaran / Slip Transfer</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) setProofFiles((prev) => [...prev, ...files]);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                {proofFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {proofFiles.map((f, idx) => (
                      <span
                        key={`${f.name}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px]"
                      >
                        <span className="truncate max-w-[160px]">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setProofFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {uploadPct > 0 && uploadPct < 100 && (
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1D7AFC]" style={{ width: `${uploadPct}%` }} />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayModalClaim(null)}
                  className="px-4 py-2 font-semibold border border-slate-300 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={workflowBusy}
                  className="px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {workflowBusy ? 'Menyimpan...' : 'Simpan Realisasi Pembayaran'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      <PdfPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name || 'Pratinjau Dokumen'}
        subtitle={previewDoc?.subtitle || 'Bukti Pembayaran'}
        fileName={previewDoc?.name || 'dokumen.pdf'}
        fileExtension={previewDoc?.ext || 'pdf'}
        sourceBytes={previewDoc?.bytes ?? null}
        sourceUrl={previewDoc?.url ?? null}
        downloadUrl={previewDoc?.downloadUrl ?? null}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
