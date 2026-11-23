import React, { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  FileUp,
  FolderLock,
  Loader2,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { AttachmentCategory, AttachmentMetadata } from '../../../types/attachment';
import { formatDateTimeID } from '../../../utils/format';
import { canManageContractDocuments } from '../../../utils/permissions';
import { downloadBinaryFile, fetchVerifiedAttachmentBytes } from '../../../utils/pdfUtils';
import { ConfirmDialog, EmptyState, SearchInput } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

const DOC_CATEGORIES: AttachmentCategory[] = [
  'SPK',
  'Kontrak Kerja',
  'RAB yang Disetujui',
  'Dokumen Addendum',
  'Invoice',
  'Berita Acara',
  'Bukti Pembayaran',
  'Dokumen Pendukung Lainnya',
];

export const ContractDocumentsView: React.FC = () => {
  const {
    state,
    currentRole,
    currentDivision,
    selectedContractId,
    setSelectedContractId,
    showToast,
  } = usePMS();
  const {
    attachments,
    uploadFiles,
    getSignedUrl,
    deleteAttachment,
  } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowUploadDelete = canManageContractDocuments(roleCode, divCode);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const activeContract =
    visibleContracts.find((c) => c.id === selectedContractId) ?? visibleContracts[0] ?? null;

  const [categoryFilter, setCategoryFilter] = useState<'SEMUA' | AttachmentCategory>('SEMUA');
  const [search, setSearch] = useState('');
  const [uploadCategory, setUploadCategory] = useState<AttachmentCategory>('Kontrak Kerja');
  const [uploadDesc, setUploadDesc] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    meta: AttachmentMetadata;
    url: string;
    downloadUrl: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentMetadata | null>(null);

  const contractAttachments = useMemo(() => {
    if (!activeContract) return [];
    const termIds = new Set(
      state.contractTerms.filter((t) => t.contract_id === activeContract.id).map((t) => t.id)
    );
    const claimIds = new Set(
      state.termClaims.filter((cl) => cl.contract_id === activeContract.id).map((cl) => cl.id)
    );

    const q = search.trim().toLowerCase();
    return attachments.filter((att) => {
      if (att.status === 'Diarsipkan') return false;
      const belongsToContract =
        (att.module_id === 'kontrak' &&
          (att.entity_id === activeContract.id ||
            termIds.has(att.entity_id) ||
            claimIds.has(att.entity_id))) ||
        (att.module_id === 'proyek' &&
          att.entity_id === activeContract.project_id &&
          (att.doc_category.toLowerCase().includes('spk') ||
            att.doc_category.toLowerCase().includes('kontrak') ||
            att.doc_category.toLowerCase().includes('rab')));

      if (!belongsToContract) return false;
      if (categoryFilter !== 'SEMUA' && att.doc_category !== categoryFilter) return false;
      if (!q) return true;
      return (
        att.original_name.toLowerCase().includes(q) ||
        att.doc_category.toLowerCase().includes(q) ||
        att.description.toLowerCase().includes(q)
      );
    });
  }, [attachments, activeContract, state.contractTerms, state.termClaims, categoryFilter, search]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContract || queuedFiles.length === 0) return;
    try {
      await uploadFiles({
        files: queuedFiles,
        module_id: 'kontrak',
        entity_id: activeContract.id,
        entity_label: `${activeContract.contract_number} — ${activeContract.work_name}`,
        doc_category: uploadCategory,
        description: uploadDesc.trim() || `${uploadCategory} untuk kontrak ${activeContract.contract_number}`,
        onProgress: setUploadPct,
      });
      setQueuedFiles([]);
      setUploadDesc('');
      setUploadPct(0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah dokumen kontrak.');
      setUploadPct(0);
    }
  };

  const handlePreview = async (meta: AttachmentMetadata) => {
    setLoadingActionId(meta.id);
    try {
      const [inlineUrl, dlUrl] = await Promise.all([
        getSignedUrl(meta.id, 'inline'),
        getSignedUrl(meta.id, 'attachment'),
      ]);
      setPreviewDoc({ meta, url: inlineUrl, downloadUrl: dlUrl });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pratinjau dokumen.');
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleDownload = async (meta: AttachmentMetadata) => {
    setLoadingActionId(meta.id);
    try {
      const url = await getSignedUrl(meta.id, 'attachment');
      const { bytes, mimeType } = await fetchVerifiedAttachmentBytes(url, meta.extension);
      downloadBinaryFile(bytes, mimeType, meta.original_name);
      showToast(`Dokumen ${meta.original_name} berhasil diunduh.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunduh file dokumen.');
    } finally {
      setLoadingActionId(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Arsip & Dokumen Kontrak (Vault Terproteksi)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pusat penyimpanan digital SPK, kontrak kerja, RAB disetujui, addendum, invoice, berita acara, dan bukti pembayaran.
          </p>
        </div>

        <select
          value={activeContract?.id ?? ''}
          onChange={(e) => setSelectedContractId(e.target.value)}
          className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl max-w-xs"
        >
          {visibleContracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.contract_number} — {c.work_name}
            </option>
          ))}
        </select>
      </div>

      {!activeContract ? (
        <EmptyState
          title="Belum Ada Kontrak"
          description="Dokumen kontrak akan dikelompokkan di sini setelah kontrak dibuat."
        />
      ) : (
        <>
          {/* Upload Panel */}
          {allowUploadDelete && (
            <form
              onSubmit={handleUpload}
              className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <h2 className="text-sm font-bold text-[#13233C] inline-flex items-center gap-2">
                  <FolderLock className="w-4 h-4 text-[#1D7AFC]" />
                  <span>Unggah Dokumen ke {activeContract.contract_number}</span>
                </h2>
                <span className="text-[11px] text-slate-500">
                  Mendukung multiple file upload & drag-and-drop
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori Dokumen</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as AttachmentCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    {DOC_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Keterangan Dokumen</label>
                  <input
                    type="text"
                    value={uploadDesc}
                    onChange={(e) => setUploadDesc(e.target.value)}
                    placeholder="Contoh: Kontrak Kerja Induk bertandatangan basah & bermeterai"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = Array.from(e.dataTransfer.files ?? []);
                  if (dropped.length > 0) setQueuedFiles((prev) => [...prev, ...dropped]);
                }}
                className={`p-5 rounded-xl border-2 border-dashed text-center transition-colors ${
                  dragOver ? 'border-[#1D7AFC] bg-blue-50' : 'border-slate-300 bg-slate-50/70'
                }`}
              >
                <FileUp className="w-6 h-6 text-[#1D7AFC] mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700">
                  Tarik & lepas file dokumen ke sini atau klik tombol pilih file
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  PDF, JPG, PNG, DOCX, XLSX (maks 15 MB/file)
                </p>
                <label className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                  <span>Pilih Dokumen</span>
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
              </div>

              {queuedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {queuedFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200"
                      >
                        <span className="truncate max-w-[200px] font-medium">{f.name}</span>
                        <span className="text-slate-400">({formatBytes(f.size)})</span>
                        <button
                          type="button"
                          onClick={() => setQueuedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {uploadPct > 0 && uploadPct < 100 && (
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1D7AFC]" style={{ width: `${uploadPct}%` }} />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white font-bold cursor-pointer"
                    >
                      Unggah {queuedFiles.length} Dokumen Sekarang
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Document Repository Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Cari nama file, kategori, atau deskripsi..."
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'SEMUA' | AttachmentCategory)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="SEMUA">Semua Kategori Dokumen</option>
                {DOC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {contractAttachments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Belum Ada Dokumen Tersimpan"
                  description="Unggah dokumen SPK, kontrak kerja, addendum, invoice, berita acara, atau bukti pembayaran untuk kontrak ini."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Nama File</th>
                      <th className="py-3 px-4 font-semibold">Kategori</th>
                      <th className="py-3 px-4 font-semibold">Ukuran</th>
                      <th className="py-3 px-4 font-semibold">Diunggah Oleh</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractAttachments.map((att) => {
                      const busy = loadingActionId === att.id;
                      return (
                        <tr key={att.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-[#1D7AFC] shrink-0" />
                              <div>
                                <div className="font-semibold text-slate-900">{att.original_name}</div>
                                <div className="text-[11px] text-slate-500 line-clamp-1">
                                  {att.description || '-'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {att.doc_category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                            {formatBytes(att.size_bytes)}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{att.uploaded_by_name}</div>
                            <div className="text-[11px] text-slate-400">
                              {formatDateTimeID(att.uploaded_at)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handlePreview(att)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                <span>Preview</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDownload(att)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1D7AFC] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Download className="w-3 h-3" />
                                <span>Unduh</span>
                              </button>
                              {allowUploadDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(att)}
                                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                                  title="Hapus Dokumen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
        </>
      )}

      {/* In-app PDF.js & Verified Binary Preview Modal */}
      <PdfPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.meta.original_name ?? 'Pratinjau Dokumen'}
        subtitle={previewDoc?.meta.doc_category}
        fileName={previewDoc?.meta.original_name ?? 'dokumen.pdf'}
        fileExtension={previewDoc?.meta.extension ?? 'pdf'}
        sourceUrl={previewDoc?.url ?? null}
        downloadUrl={previewDoc?.downloadUrl ?? null}
        description={previewDoc?.meta.description}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Hapus Dokumen "${deleteTarget?.original_name ?? ''}"?`}
        description="File akan dihapus permanen dari penyimpanan dokumen kontrak."
        confirmLabel="Hapus Dokumen"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteAttachment(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
