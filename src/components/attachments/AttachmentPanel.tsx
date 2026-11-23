import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  Lock,
  Paperclip,
  Presentation,
  RefreshCw,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useAttachments } from '../../context/AttachmentContext';
import { usePMS } from '../../context/PMSContext';
import { formatFileSize } from '../../services/attachmentApi';
import { AttachmentCategory, AttachmentMetadata } from '../../types/attachment';
import { ModuleKey } from '../../types/pms';
import { formatDateTimeID } from '../../utils/format';
import { canRestoreArchivedData } from '../../utils/permissions';
import { downloadBinaryFile, fetchVerifiedAttachmentBytes } from '../../utils/pdfUtils';
import { ConfirmDialog, Modal } from '../ui/CommonUI';
import { PdfPreviewModal } from '../ui/PdfPreviewModal';
import { ProtectedAttachmentImage } from './ProtectedAttachmentImage';

const ALL_CATEGORIES: AttachmentCategory[] = [
  'Foto Lapangan',
  'Gambar Kerja',
  'Kontrak / SPK',
  'Addendum / Berita Acara',
  'Invoice / Bukti Pembayaran',
  'Dokumen RAB',
  'Surat Jalan / Nota Material',
  'Foto Material / Aset',
  'Sertifikat / Kepemilikan',
  'Identitas & Berkas Karyawan',
  'Lampiran Persetujuan',
  'Laporan & Dokumentasi',
  'Lampiran Umum',
];

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function getFileVisual(ext: string) {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) {
    return {
      icon: ImageIcon,
      badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
      iconBg: 'bg-sky-100 text-sky-700',
      label: e.toUpperCase(),
    };
  }
  if (e === 'pdf') {
    return {
      icon: FileText,
      badgeBg: 'bg-red-50 text-red-700 border-red-200',
      iconBg: 'bg-red-100 text-red-700',
      label: 'PDF',
    };
  }
  if (e === 'xls' || e === 'xlsx') {
    return {
      icon: FileSpreadsheet,
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-700',
      label: e.toUpperCase(),
    };
  }
  if (e === 'doc' || e === 'docx') {
    return {
      icon: FileText,
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
      iconBg: 'bg-blue-100 text-blue-700',
      label: e.toUpperCase(),
    };
  }
  if (e === 'ppt' || e === 'pptx') {
    return {
      icon: Presentation,
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
      iconBg: 'bg-amber-100 text-amber-700',
      label: e.toUpperCase(),
    };
  }
  if (e === 'zip') {
    return {
      icon: Archive,
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
      iconBg: 'bg-purple-100 text-purple-700',
      label: 'ZIP',
    };
  }
  return {
    icon: File,
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
    iconBg: 'bg-slate-100 text-slate-700',
    label: e.toUpperCase(),
  };
}

interface AttachmentPanelProps {
  moduleId: ModuleKey;
  entityId: string;
  entityLabel: string;
  defaultCategory?: AttachmentCategory;
  categoryOptions?: AttachmentCategory[];
  heading?: string;
  subtitle?: string;
  compact?: boolean;
}

interface UploadQueueItem {
  id: string;
  file: File;
  extension: string;
  docCategory: AttachmentCategory;
  description: string;
  status: 'Menunggu' | 'Mengunggah' | 'Berhasil' | 'Gagal';
  progress: number;
  error?: string;
}

export const AttachmentPanel: React.FC<AttachmentPanelProps> = ({
  moduleId,
  entityId,
  entityLabel,
  defaultCategory = 'Lampiran Umum',
  categoryOptions,
  heading = 'Dokumen & Foto Lampiran',
  subtitle,
  compact = false,
}) => {
  const { currentUser, currentRole, isOnline, showToast } = usePMS();
  const {
    uploadConfig,
    getAttachmentsFor,
    getArchivedAttachmentsFor,
    uploadFiles,
    uploadNewVersion,
    updateAttachmentMeta,
    archiveAttachment,
    restoreAttachment,
    deleteAttachment,
    getSignedUrl,
  } = useAttachments();

  const effectiveCategories = useMemo(
    () => (categoryOptions && categoryOptions.length > 0 ? categoryOptions : ALL_CATEGORIES),
    [categoryOptions]
  );

  const items = useMemo(
    () => getAttachmentsFor(moduleId, entityId),
    [getAttachmentsFor, moduleId, entityId]
  );

  const archivedItems = useMemo(
    () => getArchivedAttachmentsFor(moduleId, entityId),
    [getArchivedAttachmentsFor, moduleId, entityId]
  );

  const canRestore = currentRole ? canRestoreArchivedData(currentRole.code) : false;

  const imageItems = useMemo(
    () => items.filter((it) => IMAGE_EXTS.has(it.extension.toLowerCase())),
    [items]
  );

  const [category, setCategory] = useState<AttachmentCategory>(defaultCategory);
  const [description, setDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [previewItem, setPreviewItem] = useState<{
    item: AttachmentMetadata;
    url: string;
    downloadUrl: string;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<AttachmentMetadata | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editCat, setEditCat] = useState<AttachmentCategory>('Lampiran Umum');
  const [versionTarget, setVersionTarget] = useState<AttachmentMetadata | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [versionHistoryItem, setVersionHistoryItem] = useState<AttachmentMetadata | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentMetadata | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<AttachmentMetadata | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCategory(defaultCategory);
  }, [defaultCategory]);

  const acceptAllString = useMemo(
    () => uploadConfig.allowedExtensions.map((e) => `.${e}`).join(','),
    [uploadConfig.allowedExtensions]
  );

  const canMutate = (item: AttachmentMetadata) => {
    if (currentRole?.code === 'SUPER_ADMIN' || currentRole?.code === 'HEAD') return true;
    return item.uploaded_by_id === currentUser?.id;
  };

  const uploadSingleQueueItem = async (item: UploadQueueItem) => {
    setUploadQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, status: 'Mengunggah', progress: 5, error: undefined } : q
      )
    );
    try {
      await uploadFiles({
        files: [item.file],
        module_id: moduleId,
        entity_id: entityId,
        entity_label: entityLabel,
        doc_category: item.docCategory,
        description: item.description,
        onProgress: (pct) => {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: pct } : q))
          );
        },
      });
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: 'Berhasil', progress: 100, error: undefined } : q
        )
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah file.';
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'Gagal', error: msg } : q))
      );
      return false;
    }
  };

  const handleFilesSelected = async (fileList: FileList | File[] | null, forcedCategory?: AttachmentCategory) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    const files = Array.from(fileList);

    if (uploadConfig.requireDescription && !description.trim()) {
      setErrorMsg('Mohon isi keterangan file terlebih dahulu sebelum mengunggah.');
      return;
    }

    const chosenCat = forcedCategory ?? category;
    const descText = description.trim() || `Lampiran ${chosenCat}`;
    const maxBytes = uploadConfig.maxFileSizeMb * 1024 * 1024;
    const allowedSet = new Set(uploadConfig.allowedExtensions.map((e) => e.toLowerCase()));

    const newQueueItems: UploadQueueItem[] = files.map((file) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      let preError: string | undefined;
      if (!ext || !allowedSet.has(ext)) {
        preError = `Format .${ext || '?'} tidak didukung. Gunakan: ${uploadConfig.allowedExtensions.map((e) => e.toUpperCase()).join(', ')}.`;
      } else if (file.size > maxBytes) {
        preError = `Ukuran ${formatFileSize(file.size)} melebihi batas maksimal ${uploadConfig.maxFileSizeMb} MB.`;
      }
      return {
        id: `upq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        extension: ext || 'file',
        docCategory: chosenCat,
        description: descText,
        status: preError ? 'Gagal' : 'Menunggu',
        progress: 0,
        error: preError,
      };
    });

    setUploadQueue((prev) => [...newQueueItems, ...prev]);

    const validToUpload = newQueueItems.filter((q) => q.status === 'Menunggu');
    if (validToUpload.length === 0) {
      setErrorMsg('Semua file yang dipilih tidak memenuhi validasi format/ukuran.');
      return;
    }

    setUploading(true);
    let anyFailed = false;
    try {
      for (const qItem of validToUpload) {
        const ok = await uploadSingleQueueItem(qItem);
        if (!ok) anyFailed = true;
      }
      if (!anyFailed) {
        setDescription('');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRetryQueueItem = async (item: UploadQueueItem) => {
    setErrorMsg('');
    setUploading(true);
    try {
      await uploadSingleQueueItem(item);
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPreview = async (item: AttachmentMetadata) => {
    setErrorMsg('');
    try {
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(item.id, 'inline'),
        getSignedUrl(item.id, 'attachment'),
      ]);
      setPreviewItem({ item, url, downloadUrl });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tidak dapat membuka preview file.');
    }
  };

  const handleDownload = async (item: AttachmentMetadata) => {
    setErrorMsg('');
    try {
      const url = await getSignedUrl(item.id, 'attachment');
      const { bytes, mimeType } = await fetchVerifiedAttachmentBytes(url, item.extension);
      downloadBinaryFile(bytes, mimeType, item.original_name);
      showToast(`Dokumen ${item.original_name} berhasil diunduh.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh file.';
      setErrorMsg(msg);
      showToast(msg);
    }
  };

  const handleVersionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !versionTarget) return;
    setErrorMsg('');
    setUploading(true);
    try {
      await uploadNewVersion(
        versionTarget.id,
        file,
        versionNote.trim() || `Pembaruan versi v${versionTarget.version + 1}`,
        () => undefined
      );
      setVersionTarget(null);
      setVersionNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui versi file.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-[#1D7AFC] shrink-0" />
            <h3 className="text-sm font-bold text-[#13233C] truncate">{heading}</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold tabular-nums">
              {items.length} file
            </span>
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        {/* Dedicated Upload Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => docInputRef.current?.click()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Upload Dokumen</span>
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => photoInputRef.current?.click()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Upload Foto</span>
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#FBC02D] hover:bg-[#F59E0B] text-[#13233C] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Ambil Foto</span>
          </button>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept={acceptAllString}
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={photoInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'Foto Lapangan');
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'Foto Lapangan');
          e.target.value = '';
        }}
      />

      {/* Drag & Drop Cloud Upload Zone + Category & Description */}
      <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Jenis / Kategori Dokumen
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {effectiveCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Keterangan File {uploadConfig.requireDescription ? '*' : '(Opsional)'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Foto pengecoran lantai 9 / PDF Kontrak Addendum 1..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesSelected(e.dataTransfer.files);
          }}
          onClick={() => docInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center ${
            compact ? 'py-4 px-3' : 'py-6 px-4'
          } ${
            isDragging
              ? 'border-[#1D7AFC] bg-blue-50/70'
              : 'border-slate-300 bg-white hover:border-[#1D7AFC]/70 hover:bg-blue-50/20'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1D7AFC] flex items-center justify-center mb-2">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-800">
            Seret & lepaskan file di sini, atau{' '}
            <span className="text-[#1D7AFC] underline">pilih file dari perangkat</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Mendukung {uploadConfig.allowedExtensions.map((e) => e.toUpperCase()).join(', ')} ·
            Maks {uploadConfig.maxFileSizeMb} MB/file · Multi-upload s/d {uploadConfig.maxFilesPerBatch} file
          </p>
          {!isOnline && (
            <p className="text-[11px] font-semibold text-amber-700 mt-1.5">
              Mode Offline aktif — sambungkan internet untuk mengunggah ke server.
            </p>
          )}
        </div>

        {/* Per-File Upload Progress & Retry Queue */}
        {uploadQueue.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-800">
                Antrean Upload Multi-File ({uploadQueue.length} file)
              </span>
              {uploadQueue.some((q) => q.status === 'Berhasil') && (
                <button
                  type="button"
                  onClick={() =>
                    setUploadQueue((prev) => prev.filter((q) => q.status !== 'Berhasil'))
                  }
                  className="font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Bersihkan yang Berhasil
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {uploadQueue.map((q) => {
                const vis = getFileVisual(q.extension);
                return (
                  <div key={q.id} className="px-3.5 py-2.5 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${vis.badgeBg}`}>
                            {vis.label}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {q.file.name}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                            ({formatFileSize(q.file.size)})
                          </span>
                        </div>
                        {q.error && (
                          <p className="text-[11px] text-red-600 font-medium mt-0.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{q.error}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            q.status === 'Berhasil'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.status === 'Mengunggah'
                              ? 'bg-blue-100 text-blue-800'
                              : q.status === 'Gagal'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {q.status === 'Mengunggah' ? `Mengunggah ${q.progress}%` : q.status}
                        </span>
                        {q.status === 'Gagal' && !uploading && (
                          <button
                            type="button"
                            onClick={() => handleRetryQueueItem(q)}
                            className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Unggah Ulang File Ini"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Unggah Ulang</span>
                          </button>
                        )}
                        {q.status !== 'Mengunggah' && (
                          <button
                            type="button"
                            onClick={() =>
                              setUploadQueue((prev) => prev.filter((item) => item.id !== q.id))
                            }
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Tutup dari antrean"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {(q.status === 'Mengunggah' || q.status === 'Berhasil') && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 rounded-full ${
                            q.status === 'Berhasil' ? 'bg-emerald-600' : 'bg-[#1D7AFC]'
                          }`}
                          style={{ width: `${q.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-500 hover:text-red-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Photo Thumbnail Gallery Grid */}
      {imageItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700">
            Galeri Foto ({imageItems.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {imageItems.map((img) => (
              <div
                key={img.id}
                className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
              >
                <button
                  type="button"
                  onClick={() => handleOpenPreview(img)}
                  aria-label={`Preview ${img.original_name}`}
                  className="block w-full aspect-[4/3] overflow-hidden cursor-pointer"
                >
                  <ProtectedAttachmentImage
                    attachment={img}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </button>
                <div className="p-2 bg-white border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-900 truncate">
                    {img.original_name}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">{img.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Files List: Desktop Table + Mobile 1-Column Cards */}
      {items.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-white">
          <p className="text-xs font-semibold text-slate-600">Belum ada dokumen atau foto terunggah.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Gunakan tombol Upload Dokumen, Upload Foto, atau Ambil Foto di atas.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3.5 font-semibold">Nama File & Jenis</th>
                  <th className="py-2.5 px-3.5 font-semibold">Ukuran & Versi</th>
                  <th className="py-2.5 px-3.5 font-semibold">Pengunggah & Tanggal</th>
                  <th className="py-2.5 px-3.5 font-semibold">Keterangan</th>
                  <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const vis = getFileVisual(item.extension);
                  const Icon = vis.icon;
                  const canPreview = IMAGE_EXTS.has(item.extension) || item.extension === 'pdf';
                  const allowedMutate = canMutate(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3.5 max-w-xs">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${vis.iconBg}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate flex items-center gap-1">
                              <span className="truncate">{item.original_name}</span>
                              {item.is_sensitive && (
                                <span title="Dokumen Privat & Dilindungi">
                                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${vis.badgeBg}`}
                              >
                                {vis.label}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate">
                                {item.doc_category}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-800 tabular-nums">
                          {formatFileSize(item.size_bytes)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setVersionHistoryItem(item)}
                          className="text-[11px] text-[#1D7AFC] hover:underline inline-flex items-center gap-1 cursor-pointer mt-0.5"
                        >
                          <History className="w-3 h-3" />
                          <span>v{item.version}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-medium text-slate-800">{item.uploaded_by_name}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {formatDateTimeID(item.uploaded_at)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 max-w-xs">
                        <p className="text-slate-600 line-clamp-2">{item.description || '-'}</p>
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canPreview && (
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(item)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                              title="Lihat Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(item)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                            title="Unduh File"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {allowedMutate && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditDesc(item.description);
                                  setEditCat(item.doc_category);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                title="Edit Keterangan"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVersionTarget(item);
                                  setVersionNote('');
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 cursor-pointer"
                                title="Unggah Versi Terbaru"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Hapus Lampiran"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile 1-Column Card List */}
          <div className="md:hidden divide-y divide-slate-100">
            {items.map((item) => {
              const vis = getFileVisual(item.extension);
              const Icon = vis.icon;
              const canPreview = IMAGE_EXTS.has(item.extension) || item.extension === 'pdf';
              const allowedMutate = canMutate(item);
              return (
                <div key={item.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${vis.iconBg}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 break-words flex items-center gap-1">
                        <span>{item.original_name}</span>
                        {item.is_sensitive && <Lock className="w-3 h-3 text-amber-600 shrink-0" />}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded border font-bold ${vis.badgeBg}`}>
                          {vis.label} · v{item.version}
                        </span>
                        <span className="text-slate-600 font-medium">{item.doc_category}</span>
                        <span className="font-mono text-slate-500">
                          {formatFileSize(item.size_bytes)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-600 leading-snug">{item.description}</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {item.uploaded_by_name} · {formatDateTimeID(item.uploaded_at)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {canPreview && (
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh</span>
                    </button>
                    {allowedMutate && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item);
                            setEditDesc(item.description);
                            setEditCat(item.doc_category);
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVersionTarget(item);
                            setVersionNote('');
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Versi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview Modal (Full-Size Photo Lightbox & PDF.js Viewer) */}
      <PdfPreviewModal
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.item.original_name ?? 'Preview Lampiran'}
        subtitle={
          previewItem
            ? `${previewItem.item.doc_category} · ${formatFileSize(previewItem.item.size_bytes)} · ${previewItem.item.uploaded_by_name}`
            : undefined
        }
        fileName={previewItem?.item.original_name ?? 'dokumen.pdf'}
        fileExtension={previewItem?.item.extension ?? 'pdf'}
        sourceUrl={previewItem?.url ?? null}
        downloadUrl={previewItem?.downloadUrl ?? null}
        description={previewItem?.item.description}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => setErrorMsg(msg)}
      />

      {/* Edit Description & Category Modal */}
      <Modal
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title="Ubah Keterangan Lampiran"
        maxWidth="max-w-md"
      >
        {editingItem && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateAttachmentMeta(editingItem.id, {
                description: editDesc,
                doc_category: editCat,
              });
              setEditingItem(null);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori Dokumen</label>
              <select
                value={editCat}
                onChange={(e) => setEditCat(e.target.value as AttachmentCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {Array.from(new Set([...effectiveCategories, editCat])).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan File</label>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Simpan Keterangan
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Upload New Version Modal */}
      <Modal
        open={Boolean(versionTarget)}
        onClose={() => setVersionTarget(null)}
        title={`Unggah Versi Terbaru (${versionTarget?.original_name ?? ''})`}
        subtitle={versionTarget ? `Versi saat ini: v${versionTarget.version}` : undefined}
        maxWidth="max-w-md"
      >
        {versionTarget && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Perubahan Versi
              </label>
              <input
                type="text"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder={`Contoh: Revisi final v${versionTarget.version + 1} sesuai arahan Head`}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <input
              ref={versionInputRef}
              type="file"
              accept={acceptAllString}
              className="hidden"
              onChange={handleVersionFileChange}
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVersionTarget(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => versionInputRef.current?.click()}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Pilih File Versi v{versionTarget.version + 1}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Version History Modal */}
      <Modal
        open={Boolean(versionHistoryItem)}
        onClose={() => setVersionHistoryItem(null)}
        title={`Riwayat Versi — ${versionHistoryItem?.original_name ?? ''}`}
        maxWidth="max-w-lg"
      >
        {versionHistoryItem && (
          <div className="divide-y divide-slate-100 text-xs">
            {versionHistoryItem.versions.map((v) => (
              <div key={v.version} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Versi v{v.version}</span>
                    <span className="font-mono text-slate-500">({formatFileSize(v.size_bytes)})</span>
                  </div>
                  <p className="text-slate-600 mt-0.5">{v.original_name}</p>
                  <p className="text-slate-500 mt-0.5">
                    {v.uploaded_by_name} · {formatDateTimeID(v.uploaded_at)} · {v.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Admin Archived Documents & Recovery Section */}
      {canRestore && archivedItems.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Archive className="w-4 h-4 text-amber-700" />
              <span>Arsip Dokumen Terhapus ({archivedItems.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              className="text-xs font-semibold text-amber-900 underline cursor-pointer"
            >
              {showArchive ? 'Sembunyikan Arsip' : 'Lihat & Pulihkan Arsip'}
            </button>
          </div>
          {showArchive && (
            <div className="divide-y divide-amber-200/70 bg-white border border-amber-200 rounded-xl">
              {archivedItems.map((arch) => (
                <div
                  key={arch.id}
                  className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{arch.original_name}</p>
                    <p className="text-slate-500 mt-0.5">
                      {arch.doc_category} · Dihapus oleh{' '}
                      <strong>{arch.deleted_by_name ?? '-'}</strong>
                      {arch.deleted_at ? ` pada ${formatDateTimeID(arch.deleted_at)}` : ''}
                    </p>
                    {arch.delete_reason && (
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Alasan: {arch.delete_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => restoreAttachment(arch.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Pulihkan</span>
                    </button>
                    {currentRole?.code === 'SUPER_ADMIN' && (
                      <button
                        type="button"
                        onClick={() => setPermanentDeleteTarget(arch)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 font-medium cursor-pointer"
                      >
                        Hapus Permanen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Soft Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Hapus Dokumen "${deleteTarget?.original_name ?? ''}"?`}
        description="Dokumen ini akan dipindahkan ke Arsip Dokumen (soft delete), tercatat siapa yang menghapus beserta waktunya, dan masih dapat dipulihkan oleh Admin / Head yang berwenang."
        confirmLabel="Ya, Hapus (Arsipkan)"
        danger
        requireNote
        noteLabel="Alasan Penghapusan Dokumen"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async (reason) => {
          if (deleteTarget) {
            await archiveAttachment(deleteTarget.id, reason);
          }
          setDeleteTarget(null);
        }}
      />

      {/* Permanent Delete Confirmation (Super Admin Only from Archive) */}
      <ConfirmDialog
        open={Boolean(permanentDeleteTarget)}
        title={`Hapus Permanen "${permanentDeleteTarget?.original_name ?? ''}"?`}
        description="File akan dihapus permanen dari penyimpanan server dan tidak dapat dipulihkan lagi."
        confirmLabel="Hapus Permanen"
        danger
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={async () => {
          if (permanentDeleteTarget) {
            await deleteAttachment(permanentDeleteTarget.id);
          }
          setPermanentDeleteTarget(null);
        }}
      />
    </div>
  );
};
