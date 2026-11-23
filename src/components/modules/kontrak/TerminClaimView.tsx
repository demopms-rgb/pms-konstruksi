import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileUp,
  History,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { AttachmentCategory } from '../../../types/attachment';
import { ContractSubmenuKey, TermClaim, TermClaimStatus } from '../../../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from '../../../utils/format';
import { canSubmitTermClaim } from '../../../utils/permissions';
import { EmptyState, Modal, SearchInput, StatusLabel } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

interface TerminClaimViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const TerminClaimView: React.FC<TerminClaimViewProps> = ({ onNavigateSubmenu }) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    selectedContractId,
    setSelectedContractId,
    submitTermClaimApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { uploadFiles, getAttachmentsFor, getSignedUrl } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowSubmit = canSubmitTermClaim(roleCode, divCode);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const activeContracts = useMemo(
    () =>
      visibleContracts.filter(
        (c) => c.status === 'Aktif' || c.status === 'Akan Berakhir'
      ),
    [visibleContracts]
  );

  const chosenContractId = useMemo(() => {
    if (selectedContractId && activeContracts.some((c) => c.id === selectedContractId)) {
      return selectedContractId;
    }
    return activeContracts[0]?.id ?? '';
  }, [selectedContractId, activeContracts]);

  const chosenContract = activeContracts.find((c) => c.id === chosenContractId) ?? null;

  const contractTerms = useMemo(() => {
    if (!chosenContract) return [];
    return state.contractTerms
      .filter((t) => t.contract_id === chosenContract.id)
      .sort((a, b) => a.execution_date.localeCompare(b.execution_date));
  }, [state.contractTerms, chosenContract]);

  const eligibleTerms = useMemo(() => {
    return contractTerms.filter((t) => {
      const hasLockedClaim = state.termClaims.some(
        (cl) => cl.term_id === t.id && (cl.status === 'Menunggu Approval' || cl.status === 'Disetujui')
      );
      const paid = Number(t.paid_amount ?? 0);
      return !hasLockedClaim && paid < t.term_value;
    });
  }, [contractTerms, state.termClaims]);

  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const effectiveTermId = eligibleTerms.some((t) => t.id === selectedTermId)
    ? selectedTermId
    : eligibleTerms[0]?.id ?? '';
  const selectedTerm = contractTerms.find((t) => t.id === effectiveTermId) ?? null;

  const fieldReports = useMemo(() => {
    if (!chosenContract) return [];
    const wf = state.workflows.find((w) => w.project_id === chosenContract.project_id);
    return wf?.field_reports ?? [];
  }, [state.workflows, chosenContract]);

  const [fieldReportId, setFieldReportId] = useState('');
  const [actualProgress, setActualProgress] = useState<number>(0);
  const [claimDate, setClaimDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [workDesc, setWorkDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldVerified, setFieldVerified] = useState(false);
  const [verifierName, setVerifierName] = useState(currentUser?.full_name ?? '');
  const [docCategory, setDocCategory] = useState<AttachmentCategory>('Berita Acara');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploadPct, setUploadPct] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | TermClaimStatus>('SEMUA');
  const [detailClaim, setDetailClaim] = useState<TermClaim | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    url: string;
    downloadUrl: string;
    ext: string;
  } | null>(null);

  const handleSelectFieldReport = (reportId: string) => {
    setFieldReportId(reportId);
    const rpt = fieldReports.find((r) => r.id === reportId);
    if (rpt) {
      setActualProgress(rpt.progress_percent);
      setWorkDesc(rpt.work_summary);
      setFieldVerified(true);
      if (rpt.reported_by_name) setVerifierName(rpt.reported_by_name);
    }
  };

  const handleResubmitFromRevision = (cl: TermClaim) => {
    setSelectedContractId(cl.contract_id);
    setSelectedTermId(cl.term_id);
    setActualProgress(cl.actual_progress);
    setWorkDesc(cl.work_description);
    setNotes(`Pengajuan ulang setelah revisi: ${cl.decision_note || ''}`);
    setFieldVerified(true);
    setVerifierName(cl.field_verified_by_name || currentUser?.full_name || '');
    showToast(`Data ${cl.claim_number} dimuat ke form untuk pengajuan ulang.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenContract || !selectedTerm) return;
    if (!fieldVerified) {
      showToast('Centang verifikasi kesiapan & realisasi progres dari Pelaksana Lapangan.');
      return;
    }
    if (actualProgress < selectedTerm.target_progress) {
      showToast(
        `Realisasi progres (${actualProgress}%) belum mencapai syarat target termin (${selectedTerm.target_progress}%).`
      );
      return;
    }

    let uploadedIds: string[] = [];
    if (queuedFiles.length > 0) {
      try {
        const created = await uploadFiles({
          files: queuedFiles,
          module_id: 'kontrak',
          entity_id: selectedTerm.id,
          entity_label: `${chosenContract.contract_number} · ${selectedTerm.term_number}`,
          doc_category: docCategory,
          description: `Lampiran pengajuan ${selectedTerm.term_number}: ${workDesc}`,
          onProgress: setUploadPct,
        });
        uploadedIds = created.map((c) => c.id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengunggah dokumen pendukung termin.');
        setUploadPct(0);
        return;
      }
    }

    const res = await submitTermClaimApi(chosenContract.id, {
      term_id: selectedTerm.id,
      actual_progress: actualProgress,
      claim_date: claimDate,
      work_description: workDesc,
      notes,
      field_report_id: fieldReportId || undefined,
      field_verified: fieldVerified,
      field_verified_by_name: verifierName || currentUser?.full_name || 'Tim Lapangan',
      doc_attachment_ids: uploadedIds,
    });

    setUploadPct(0);
    if (res.ok) {
      setWorkDesc('');
      setNotes('');
      setFieldReportId('');
      setFieldVerified(false);
      setQueuedFiles([]);
    }
  };

  const filteredClaims = useMemo(() => {
    const visibleIds = new Set(visibleContracts.map((c) => c.id));
    const q = search.trim().toLowerCase();
    return state.termClaims.filter((cl) => {
      if (!visibleIds.has(cl.contract_id)) return false;
      if (statusFilter !== 'SEMUA' && cl.status !== statusFilter) return false;
      if (!q) return true;
      const ctr = visibleContracts.find((c) => c.id === cl.contract_id);
      const trm = state.contractTerms.find((t) => t.id === cl.term_id);
      return (
        cl.claim_number.toLowerCase().includes(q) ||
        cl.work_description.toLowerCase().includes(q) ||
        (ctr?.contract_number.toLowerCase().includes(q) ?? false) ||
        (trm?.term_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [state.termClaims, visibleContracts, state.contractTerms, search, statusFilter]);

  const handleOpenPreview = async (attachmentId: string) => {
    const att = getAttachmentsFor('kontrak').find((a) => a.id === attachmentId);
    if (!att) {
      showToast('Metadata file tidak ditemukan.');
      return;
    }
    try {
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(att.id, 'inline'),
        getSignedUrl(att.id, 'attachment'),
      ]);
      setPreviewDoc({ name: att.original_name, url, downloadUrl, ext: att.extension });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka pratinjau file.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Pengajuan Pencairan Termin
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Ajukan pencairan termin berdasarkan progres lapangan terverifikasi, berita acara, dan dokumentasi pendukung ke Tim Finance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateSubmenu('approval', chosenContract?.id)}
          className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer"
        >
          Lihat Antrean Approval
        </button>
      </div>

      {/* Claim Form */}
      {allowSubmit && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
          <h2 className="text-sm font-bold text-[#13233C] pb-3 border-b border-slate-200">
            Formulir Pengajuan Termin Baru
          </h2>

          {activeContracts.length === 0 ? (
            <div className="py-6 text-xs text-slate-500">
              Belum ada kontrak berstatus <strong>Aktif</strong>. Aktifkan kontrak terlebih dahulu agar dapat mengajukan termin.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kontrak Aktif <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={chosenContractId}
                    onChange={(e) => setSelectedContractId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  >
                    {activeContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number} — {c.work_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Termin yang Diajukan <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={effectiveTermId}
                    onChange={(e) => {
                      setSelectedTermId(e.target.value);
                      const t = contractTerms.find((item) => item.id === e.target.value);
                      if (t && t.actual_progress > 0) setActualProgress(t.actual_progress);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  >
                    {eligibleTerms.length === 0 ? (
                      <option value="">Tidak ada termin yang tersedia untuk diajukan</option>
                    ) : (
                      eligibleTerms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.term_number} ({t.payment_percentage}% · {formatRupiah(t.term_value)} · Target {t.target_progress}%)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {selectedTerm && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-slate-500">Nominal Klaim Termin</span>
                      <p className="font-mono font-bold text-sm text-[#13233C] mt-0.5 tabular-nums">
                        {formatRupiah(selectedTerm.term_value)} ({selectedTerm.payment_percentage}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Syarat Target Progres</span>
                      <p className="font-mono font-bold text-sm text-slate-900 mt-0.5 tabular-nums">
                        Minimal {selectedTerm.target_progress}%
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Dokumen / Syarat Wajib</span>
                      <p className="text-slate-800 mt-0.5">{selectedTerm.requirements_desc || '-'}</p>
                    </div>
                  </div>

                  {/* Link to Field Report */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Ambil Referensi Laporan Lapangan (Opsional)
                      </label>
                      <select
                        value={fieldReportId}
                        onChange={(e) => handleSelectFieldReport(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        <option value="">-- Input Progres Manual / Verifikasi Lapangan --</option>
                        {fieldReports.map((r) => (
                          <option key={r.id} value={r.id}>
                            [{formatDateID(r.reported_at)}] Progres {r.progress_percent}% — {r.work_summary}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Tanggal Pengajuan
                      </label>
                      <input
                        type="date"
                        value={claimDate}
                        onChange={(e) => setClaimDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Realisasi Progres Lapangan (%) <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={actualProgress}
                        onChange={(e) => setActualProgress(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                        required
                      />
                      {actualProgress < selectedTerm.target_progress ? (
                        <p className="text-[11px] text-red-600 mt-1 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Progres belum memenuhi target termin ({selectedTerm.target_progress}%).
                        </p>
                      ) : (
                        <p className="text-[11px] text-emerald-700 mt-1 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Syarat progres terpenuhi.
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Deskripsi Pekerjaan yang Diselesaikan <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={workDesc}
                        onChange={(e) => setWorkDesc(e.target.value)}
                        placeholder="Contoh: Pekerjaan struktur atap, rangka baja ringan, dan plafon telah selesai 100% sesuai BAST."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldVerified}
                          onChange={(e) => setFieldVerified(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-[#1D7AFC]"
                        />
                        <span className="font-semibold text-slate-800">
                          Konfirmasi Verifikasi Admin / Pelaksana Lapangan <span className="text-red-600">*</span>
                        </span>
                      </label>
                      <input
                        type="text"
                        value={verifierName}
                        onChange={(e) => setVerifierName(e.target.value)}
                        placeholder="Nama Pelaksana / Pengawas Lapangan yang memverifikasi"
                        className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Catatan Tambahan Pengajuan
                      </label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Keterangan tambahan atau nomor invoice/BAP..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Multi-file attachment upload */}
                  <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-[#1D7AFC]" />
                        Upload Dokumen Pendukung (Berita Acara, Invoice, Foto Lapangan)
                      </span>
                      <select
                        value={docCategory}
                        onChange={(e) => setDocCategory(e.target.value as AttachmentCategory)}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px]"
                      >
                        <option value="Berita Acara">Berita Acara</option>
                        <option value="Invoice">Invoice</option>
                        <option value="Foto Lapangan">Foto Lapangan</option>
                        <option value="Dokumen Pendukung Lainnya">Dokumen Pendukung Lainnya</option>
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                      <FileUp className="w-3.5 h-3.5 text-[#1D7AFC]" />
                      <span>Pilih File (Bisa Banyak)</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          if (list.length > 0) setQueuedFiles((prev) => [...prev, ...list]);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    {queuedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {queuedFiles.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]"
                          >
                            <span className="truncate max-w-[180px] font-medium">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setQueuedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-red-500 hover:text-red-700 cursor-pointer"
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

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={
                        workflowBusy ||
                        !fieldVerified ||
                        actualProgress < selectedTerm.target_progress
                      }
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{workflowBusy ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan Termin ke Finance'}</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      )}

      {/* Claims List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor klaim, kontrak, termin, atau deskripsi pekerjaan..."
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'SEMUA' | TermClaimStatus)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="SEMUA">Semua Status</option>
            <option value="Menunggu Approval">Menunggu Approval</option>
            <option value="Disetujui">Disetujui</option>
            <option value="Revisi">Revisi</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>

        {filteredClaims.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Belum Ada Pengajuan Termin"
              description="Pengajuan termin pembayaran yang dikirim ke Tim Finance akan tampil lengkap beserta riwayat statusnya di sini."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">No. Pengajuan</th>
                  <th className="py-3 px-4 font-semibold">Kontrak & Termin</th>
                  <th className="py-3 px-4 font-semibold">Progres</th>
                  <th className="py-3 px-4 font-semibold text-right">Nilai Diajukan</th>
                  <th className="py-3 px-4 font-semibold">Pengaju & Verifikator</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClaims.map((cl) => {
                  const ctr = state.contracts.find((c) => c.id === cl.contract_id);
                  const trm = state.contractTerms.find((t) => t.id === cl.term_id);
                  return (
                    <tr key={cl.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-[#1D7AFC]">
                          <span>{cl.claim_number}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateID(cl.claim_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {ctr?.contract_number} — {trm?.term_number}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">
                          {cl.work_description}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <span className="font-bold text-slate-900">{cl.actual_progress}%</span>
                        <span className="text-slate-400"> / {cl.target_progress}%</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatRupiah(cl.claim_amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>{cl.submitted_by_name}</div>
                        <div className="text-[11px] text-slate-400">
                          Verif: {cl.field_verified_by_name || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={cl.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailClaim(cl)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Detail</span>
                          </button>
                          {cl.status === 'Revisi' && allowSubmit && (
                            <button
                              type="button"
                              onClick={() => handleResubmitFromRevision(cl)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Ajukan Ulang</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Claim Detail Modal */}
      <Modal
        open={Boolean(detailClaim)}
        onClose={() => setDetailClaim(null)}
        title={detailClaim ? `Detail Pengajuan ${detailClaim.claim_number}` : ''}
        maxWidth="max-w-2xl"
      >
        {detailClaim && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <StatusLabel status={detailClaim.status} />
              <span className="font-mono font-bold text-sm text-[#13233C]">
                {formatRupiah(detailClaim.claim_amount)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-500">Kontrak & Termin</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {state.contracts.find((c) => c.id === detailClaim.contract_id)?.contract_number} ·{' '}
                  {state.contractTerms.find((t) => t.id === detailClaim.term_id)?.term_number}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Progres Target vs Aktual</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">
                  Target {detailClaim.target_progress}% · Aktual {detailClaim.actual_progress}%
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-slate-500">Deskripsi Pekerjaan</p>
                <p className="text-slate-800 mt-0.5">{detailClaim.work_description}</p>
              </div>
              {detailClaim.decision_note && (
                <div className="sm:col-span-2">
                  <p className="text-slate-500">Catatan Keputusan Finance ({detailClaim.decision_by_name})</p>
                  <p className="text-slate-800 mt-0.5 font-medium">{detailClaim.decision_note}</p>
                </div>
              )}
            </div>

            {detailClaim.doc_attachment_ids.length > 0 && (
              <div>
                <p className="font-semibold text-slate-700 mb-1.5">Dokumen Pendukung Terlampir</p>
                <div className="flex flex-wrap gap-2">
                  {detailClaim.doc_attachment_ids.map((id) => {
                    const att = getAttachmentsFor('kontrak').find((a) => a.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleOpenPreview(id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1D7AFC] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{att?.original_name || id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="font-semibold text-slate-700 mb-2 inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                Riwayat Pengajuan Termin
              </p>
              <div className="space-y-2">
                {detailClaim.history.map((h, i) => (
                  <div key={i} className="p-2.5 rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {h.action} — {h.actor_name} ({h.actor_role})
                      </span>
                      <span>{formatDateTimeID(h.timestamp)}</span>
                    </div>
                    <p className="text-slate-600 mt-1">{h.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* In-app PDF.js & Verified Binary Preview Modal */}
      <PdfPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name || 'Pratinjau Dokumen'}
        subtitle="Lampiran Pengajuan Termin"
        fileName={previewDoc?.name || 'dokumen.pdf'}
        fileExtension={previewDoc?.ext || 'pdf'}
        sourceUrl={previewDoc?.url ?? null}
        downloadUrl={previewDoc?.downloadUrl ?? null}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
