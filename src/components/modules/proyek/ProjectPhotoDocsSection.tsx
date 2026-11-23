import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useAttachments } from '../../../context/AttachmentContext';
import { usePMS } from '../../../context/PMSContext';
import { formatFileSize } from '../../../services/attachmentApi';
import { AttachmentCategory, AttachmentMetadata } from '../../../types/attachment';
import { Project } from '../../../types/pms';
import { formatDateTimeID } from '../../../utils/format';
import { canRestoreArchivedData } from '../../../utils/permissions';
import { downloadBinaryFile, fetchVerifiedAttachmentBytes } from '../../../utils/pdfUtils';
import { ConfirmDialog, Modal } from '../../ui/CommonUI';
import { ProtectedAttachmentImage } from '../../attachments/ProtectedAttachmentImage';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'jfif']);

const PHOTO_CATEGORIES: AttachmentCategory[] = [
  'Foto Kondisi Awal',
  'Foto Lapangan',
  'Foto Material / Aset',
  'Foto Selesai / BAST',
];

interface StagedPhotoItem {
  id: string;
  file: File;
  extension: string;
  previewUrl: string;
  docCategory: AttachmentCategory;
  description: string;
  status: 'Menunggu' | 'Mengunggah' | 'Berhasil' | 'Gagal';
  progress: number;
  error?: string;
}

interface ProjectPhotoDocsSectionProps {
  project: Project;
}

export const ProjectPhotoDocsSection: React.FC<ProjectPhotoDocsSectionProps> = ({ project }) => {
  const { currentUser, currentRole, isOnline, showToast } = usePMS();
  const {
    uploadConfig,
    getAttachmentsFor,
    getArchivedAttachmentsFor,
    uploadFiles,
    updateAttachmentMeta,
    archiveAttachment,
    restoreAttachment,
    deleteAttachment,
    getSignedUrl,
  } = useAttachments();

  const allPhotos = useMemo(
    () =>
      getAttachmentsFor('proyek', project.id).filter((it) =>
        IMAGE_EXTS.has(it.extension.toLowerCase())
      ),
    [getAttachmentsFor, project.id]
  );

  const archivedPhotos = useMemo(
    () =>
      getArchivedAttachmentsFor('proyek', project.id).filter((it) =>
        IMAGE_EXTS.has(it.extension.toLowerCase())
      ),
    [getArchivedAttachmentsFor, project.id]
  );

  const canRestore = currentRole ? canRestoreArchivedData(currentRole.code) : false;

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'SEMUA' | AttachmentCategory>(
    'SEMUA'
  );
  const [defaultCategory, setDefaultCategory] = useState<AttachmentCategory>('Foto Lapangan');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhotoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  const stagedUrlsRef = useRef<Set<string>>(new Set());
  const lightboxObjectUrlRef = useRef<string | null>(null);

  // Lightbox preview for either uploaded photo or staged local photo
  const [lightboxState, setLightboxState] = useState<
    | { mode: 'uploaded'; photoId: string }
    | { mode: 'staged'; stagedId: string }
    | null
  >(null);
  const [lightboxFullUrl, setLightboxFullUrl] = useState<string | null>(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [lightboxError, setLightboxError] = useState<string | null>(null);

  const [editingPhoto, setEditingPhoto] = useState<AttachmentMetadata | null>(null);
  const [editCat, setEditCat] = useState<AttachmentCategory>('Foto Lapangan');
  const [editDesc, setEditDesc] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<AttachmentMetadata | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<AttachmentMetadata | null>(
    null
  );
  const [showArchive, setShowArchive] = useState(false);

  const multiPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const revokeAllStagedUrls = () => {
    stagedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    stagedUrlsRef.current.clear();
  };

  const revokeLightboxObjectUrl = () => {
    if (lightboxObjectUrlRef.current) {
      URL.revokeObjectURL(lightboxObjectUrlRef.current);
      lightboxObjectUrlRef.current = null;
    }
  };

  // Reset local staged queue and filter when switching projects
  useEffect(() => {
    revokeAllStagedUrls();
    revokeLightboxObjectUrl();
    setStagedPhotos([]);
    setActiveCategoryFilter('SEMUA');
    setErrorMsg('');
    setUploadSuccessMsg('');
    setLightboxState(null);
    setLightboxFullUrl(null);
    setLightboxError(null);
  }, [project.id]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      stagedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      stagedUrlsRef.current.clear();
      if (lightboxObjectUrlRef.current) {
        URL.revokeObjectURL(lightboxObjectUrlRef.current);
        lightboxObjectUrlRef.current = null;
      }
    };
  }, []);

  const filteredPhotos = useMemo(() => {
    if (activeCategoryFilter === 'SEMUA') return allPhotos;
    return allPhotos.filter((p) => p.doc_category === activeCategoryFilter);
  }, [allPhotos, activeCategoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { SEMUA: allPhotos.length };
    PHOTO_CATEGORIES.forEach((cat) => {
      counts[cat] = allPhotos.filter((p) => p.doc_category === cat).length;
    });
    return counts;
  }, [allPhotos]);

  const canMutate = (item: AttachmentMetadata) => {
    if (currentRole?.code === 'SUPER_ADMIN' || currentRole?.code === 'HEAD') return true;
    return item.uploaded_by_id === currentUser?.id;
  };

  const addPhotosToQueue = (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    const files = Array.from(fileList);
    const maxBytes = uploadConfig.maxFileSizeMb * 1024 * 1024;
    const allowedImgExts = new Set(
      uploadConfig.allowedExtensions
        .map((e) => e.toLowerCase())
        .filter((e) => IMAGE_EXTS.has(e))
    );

    const existingKeys = new Set(
      stagedPhotos.map((s) => `${s.file.name}::${s.file.size}::${s.file.lastModified}`)
    );

    const added: StagedPhotoItem[] = [];
    let skippedDuplicates = 0;

    for (const file of files) {
      const key = `${file.name}::${file.size}::${file.lastModified}`;
      if (existingKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }
      existingKeys.add(key);

      let ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext === 'jfif') ext = 'jpg';
      if (!ext && file.type.toLowerCase().includes('jpeg')) ext = 'jpg';
      if (!ext && file.type.toLowerCase().includes('png')) ext = 'png';
      if (!ext && file.type.toLowerCase().includes('webp')) ext = 'webp';

      let preError: string | undefined;
      if (!ext || !allowedImgExts.has(ext)) {
        preError = `Format .${ext || '?'} tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.`;
      } else if (file.size > maxBytes) {
        preError = `Ukuran ${formatFileSize(file.size)} melebihi batas maksimal ${uploadConfig.maxFileSizeMb} MB.`;
      }

      const previewUrl = URL.createObjectURL(file);
      stagedUrlsRef.current.add(previewUrl);

      added.push({
        id: `stp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        extension: ext || 'jpg',
        previewUrl,
        docCategory: defaultCategory,
        description: defaultDescription.trim(),
        status: preError ? 'Gagal' : 'Menunggu',
        progress: 0,
        error: preError,
      });
    }

    if (added.length > 0) {
      setStagedPhotos((prev) => [...prev, ...added]);
    }
    if (skippedDuplicates > 0) {
      setErrorMsg(`${skippedDuplicates} foto yang sama sudah ada di antrean upload.`);
    }
  };

  const removeStagedPhoto = (id: string) => {
    setStagedPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        stagedUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const uploadSingleStaged = async (item: StagedPhotoItem): Promise<boolean> => {
    setStagedPhotos((prev) =>
      prev.map((p) =>
        p.id === item.id ? { ...p, status: 'Mengunggah', progress: 8, error: undefined } : p
      )
    );
    try {
      await uploadFiles({
        files: [item.file],
        module_id: 'proyek',
        entity_id: project.id,
        entity_label: `${project.project_number} — ${project.name}`,
        doc_category: item.docCategory,
        description: item.description.trim() || `${item.docCategory} — ${project.project_number}`,
        onProgress: (pct) => {
          setStagedPhotos((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: pct } : p))
          );
        },
      });
      setStagedPhotos((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, status: 'Berhasil', progress: 100, error: undefined } : p
        )
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah foto.';
      setStagedPhotos((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'Gagal', error: msg } : p))
      );
      return false;
    }
  };

  const handleUploadAllStaged = async () => {
    if (!isOnline) {
      setErrorMsg('Mode Offline aktif: sambungkan internet untuk mengunggah foto proyek.');
      return;
    }
    if (uploadConfig.requireDescription) {
      const missingDesc = stagedPhotos.some(
        (p) => p.status === 'Menunggu' && !p.description.trim() && !defaultDescription.trim()
      );
      if (missingDesc) {
        setErrorMsg('Mohon isi keterangan foto terlebih dahulu sebelum mengunggah.');
        return;
      }
    }
    const queue = stagedPhotos.filter((p) => p.status === 'Menunggu');
    if (queue.length === 0) return;

    setErrorMsg('');
    setUploadSuccessMsg('');
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const item of queue) {
        const ok = await uploadSingleStaged(item);
        if (ok) successCount++;
        else failCount++;
      }
      if (successCount > 0 && failCount === 0) {
        clearSucceededStaged();
        setDefaultDescription('');
        setUploadSuccessMsg(
          `${successCount} foto berhasil diunggah dan tersimpan di proyek ${project.project_number}.`
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRetryStaged = async (item: StagedPhotoItem) => {
    setErrorMsg('');
    setUploading(true);
    try {
      await uploadSingleStaged(item);
    } finally {
      setUploading(false);
    }
  };

  const clearSucceededStaged = () => {
    setStagedPhotos((prev) => {
      prev
        .filter((p) => p.status === 'Berhasil')
        .forEach((p) => {
          URL.revokeObjectURL(p.previewUrl);
          stagedUrlsRef.current.delete(p.previewUrl);
        });
      return prev.filter((p) => p.status !== 'Berhasil');
    });
  };

  const openUploadedLightbox = async (photo: AttachmentMetadata) => {
    setLightboxZoomed(false);
    setLightboxError(null);
    setLightboxState({ mode: 'uploaded', photoId: photo.id });
    revokeLightboxObjectUrl();
    setLightboxFullUrl(null);
    setLightboxLoading(true);
    try {
      const signedUrl = await getSignedUrl(photo.id, 'inline');
      const { bytes, mimeType } = await fetchVerifiedAttachmentBytes(signedUrl, photo.extension);
      const blob = new Blob([bytes.slice()], {
        type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
      });
      const objUrl = URL.createObjectURL(blob);
      lightboxObjectUrlRef.current = objUrl;
      setLightboxFullUrl(objUrl);
    } catch (err) {
      setLightboxError(err instanceof Error ? err.message : 'Gagal memuat pratinjau foto.');
    } finally {
      setLightboxLoading(false);
    }
  };

  const openStagedLightbox = (staged: StagedPhotoItem) => {
    setLightboxZoomed(false);
    setLightboxError(null);
    revokeLightboxObjectUrl();
    setLightboxState({ mode: 'staged', stagedId: staged.id });
    setLightboxFullUrl(staged.previewUrl);
    setLightboxLoading(false);
  };

  const activeUploadedIndex =
    lightboxState?.mode === 'uploaded'
      ? filteredPhotos.findIndex((p) => p.id === lightboxState.photoId)
      : -1;
  const activeUploadedPhoto =
    activeUploadedIndex >= 0 ? filteredPhotos[activeUploadedIndex] : null;
  const activeStagedPhoto =
    lightboxState?.mode === 'staged'
      ? stagedPhotos.find((s) => s.id === lightboxState.stagedId) ?? null
      : null;

  const navigateLightbox = (dir: -1 | 1) => {
    if (lightboxState?.mode !== 'uploaded' || filteredPhotos.length <= 1) return;
    const nextIndex = (activeUploadedIndex + dir + filteredPhotos.length) % filteredPhotos.length;
    openUploadedLightbox(filteredPhotos[nextIndex]);
  };

  const handleDownloadPhoto = async (photo: AttachmentMetadata) => {
    setErrorMsg('');
    try {
      const url = await getSignedUrl(photo.id, 'attachment');
      const { bytes, mimeType } = await fetchVerifiedAttachmentBytes(url, photo.extension);
      downloadBinaryFile(bytes, mimeType, photo.original_name);
      showToast(`Foto ${photo.original_name} berhasil diunduh.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh foto.';
      setErrorMsg(msg);
      showToast(msg);
    }
  };

  const pendingUploadCount = stagedPhotos.filter((p) => p.status === 'Menunggu').length;
  const succeededCount = stagedPhotos.filter((p) => p.status === 'Berhasil').length;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1D7AFC] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
              Dokumentasi Foto Proyek — {project.project_number}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold tabular-nums">
              {allPhotos.length} foto
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Unggah beberapa foto sekaligus (JPG, PNG, WEBP), lihat preview sebelum & sesudah tersimpan, khusus untuk proyek{' '}
            <strong className="text-slate-700">{project.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={uploading}
            onClick={() => multiPhotoInputRef.current?.click()}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Pilih Beberapa Foto</span>
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#FBC02D] hover:bg-[#F59E0B] text-[#13233C] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Ambil Foto</span>
          </button>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={multiPhotoInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          addPhotosToQueue(e.target.files);
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
          addPhotosToQueue(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Multi-Photo Upload Dropzone & Options */}
      <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Kategori Dokumentasi Foto
            </label>
            <select
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value as AttachmentCategory)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {PHOTO_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Keterangan Foto Default {uploadConfig.requireDescription ? '*' : '(Opsional)'}
            </label>
            <input
              type="text"
              value={defaultDescription}
              onChange={(e) => setDefaultDescription(e.target.value)}
              placeholder="Contoh: Progres pengecoran sloof & kolom lantai 1..."
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
            addPhotosToQueue(e.dataTransfer.files);
          }}
          onClick={() => multiPhotoInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer py-5 px-4 flex flex-col items-center justify-center text-center ${
            isDragging
              ? 'border-[#1D7AFC] bg-blue-50/70'
              : 'border-slate-300 bg-white hover:border-[#1D7AFC]/70 hover:bg-blue-50/20'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1D7AFC] flex items-center justify-center mb-2">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-800">
            Seret & lepaskan beberapa foto di sini, atau{' '}
            <span className="text-[#1D7AFC] underline">pilih foto dari perangkat</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Format JPG, JPEG, PNG, WEBP · Maks {uploadConfig.maxFileSizeMb} MB/foto · Bisa pilih beberapa foto sekaligus
          </p>
        </div>

        {/* Staged Multi-Photo Preview & Upload Queue */}
        {stagedPhotos.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#13233C]">
                Antrean Preview Foto ({stagedPhotos.length} foto)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => multiPhotoInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Foto Lagi</span>
                </button>
                {succeededCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSucceededStaged}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Bersihkan yang Selesai
                  </button>
                )}
                {pendingUploadCount > 0 && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleUploadAllStaged}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>
                      {uploading
                        ? 'Mengunggah...'
                        : `Unggah ${pendingUploadCount} Foto ke Proyek`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto">
              {stagedPhotos.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 flex flex-col"
                >
                  <div className="relative aspect-[4/3] bg-slate-200 overflow-hidden group">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => openStagedLightbox(item)}
                      className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 transition-colors flex items-center justify-center cursor-pointer"
                      title="Lihat Preview Foto"
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-white/95 text-slate-900 text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </span>
                    </button>
                    <span
                      className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs ${
                        item.status === 'Berhasil'
                          ? 'bg-emerald-600 text-white'
                          : item.status === 'Mengunggah'
                          ? 'bg-[#1D7AFC] text-white'
                          : item.status === 'Gagal'
                          ? 'bg-red-600 text-white'
                          : 'bg-[#13233C]/85 text-white'
                      }`}
                    >
                      {item.status === 'Mengunggah' ? `${item.progress}%` : item.status}
                    </span>
                    {item.status !== 'Mengunggah' && (
                      <button
                        type="button"
                        onClick={() => removeStagedPhoto(item.id)}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-900/75 hover:bg-red-600 text-white flex items-center justify-center cursor-pointer"
                        title="Hapus dari Antrean"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-2.5 space-y-2 bg-white flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-semibold text-slate-900 truncate">
                          {item.file.name}
                        </span>
                        <span className="font-mono text-slate-500 shrink-0 tabular-nums">
                          {formatFileSize(item.file.size)}
                        </span>
                      </div>
                      {item.status === 'Menunggu' && (
                        <>
                          <select
                            value={item.docCategory}
                            onChange={(e) =>
                              setStagedPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === item.id
                                    ? { ...p, docCategory: e.target.value as AttachmentCategory }
                                    : p
                                )
                              )
                            }
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-lg"
                          >
                            {PHOTO_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) =>
                              setStagedPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === item.id ? { ...p, description: e.target.value } : p
                                )
                              )
                            }
                            placeholder="Keterangan foto ini..."
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-lg"
                          />
                        </>
                      )}
                      {item.error && (
                        <p className="text-[11px] text-red-600 font-medium flex items-start gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{item.error}</span>
                        </p>
                      )}
                    </div>

                    {(item.status === 'Mengunggah' || item.status === 'Berhasil') && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 rounded-full ${
                            item.status === 'Berhasil' ? 'bg-emerald-600' : 'bg-[#1D7AFC]'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {item.status === 'Gagal' && !uploading && !item.error?.startsWith('Format') && !item.error?.startsWith('Ukuran') && (
                      <button
                        type="button"
                        onClick={() => handleRetryStaged(item)}
                        className="w-full py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Unggah Ulang</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-2 font-medium">
            <span>{uploadSuccessMsg}</span>
            <button
              type="button"
              onClick={() => setUploadSuccessMsg('')}
              className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('SEMUA')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
            activeCategoryFilter === 'SEMUA'
              ? 'bg-[#13233C] text-white border-[#13233C]'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Semua Foto ({categoryCounts.SEMUA})
        </button>
        {PHOTO_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              activeCategoryFilter === cat
                ? 'bg-[#1D7AFC] text-white border-[#1D7AFC]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat} ({categoryCounts[cat] ?? 0})
          </button>
        ))}
      </div>

      {/* Project Photo Gallery */}
      {allPhotos.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1D7AFC] flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              Belum ada dokumentasi foto untuk proyek {project.project_number}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Unggah foto kondisi awal, foto lapangan, material, atau hasil selesai proyek agar tersimpan rapi per proyek.
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => multiPhotoInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload Foto Sekarang</span>
            </button>
          </div>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-2xl border border-slate-200 bg-slate-50/40 space-y-2">
          <p className="text-xs font-semibold text-slate-700">
            Tidak ada foto pada kategori &ldquo;{activeCategoryFilter}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('SEMUA')}
            className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
          >
            Tampilkan Semua Foto ({allPhotos.length})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredPhotos.map((img) => {
            const allowedMutate = canMutate(img);
            return (
              <div
                key={img.id}
                className="group rounded-2xl overflow-hidden border border-slate-200 bg-white flex flex-col shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-blue-300 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openUploadedLightbox(img)}
                  aria-label={`Preview ${img.original_name}`}
                  className="relative block w-full aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer"
                  title="Klik untuk memperbesar preview foto"
                >
                  <ProtectedAttachmentImage
                    attachment={img}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#13233C]/85 text-white text-[10px] font-semibold backdrop-blur-xs">
                    {img.doc_category}
                  </span>
                  <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-white/95 text-slate-900 text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
                    <Eye className="w-3.5 h-3.5 text-[#1D7AFC]" />
                    <span>Preview</span>
                  </span>
                </button>

                <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 truncate" title={img.original_name}>
                        {img.original_name}
                      </p>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 tabular-nums">
                        {formatFileSize(img.size_bytes)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 min-h-[2rem]">
                      {img.description || '-'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {img.uploaded_by_name} · {formatDateTimeID(img.uploaded_at)}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openUploadedLightbox(img)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#1D7AFC] hover:bg-blue-100 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPhoto(img)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Unduh Foto"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {allowedMutate && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPhoto(img);
                            setEditCat(img.doc_category);
                            setEditDesc(img.description);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Edit Keterangan / Kategori"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(img)}
                          className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer"
                          title="Hapus / Arsipkan Foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Archived Photos Recovery */}
      {canRestore && archivedPhotos.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Archive className="w-4 h-4 text-amber-700" />
              <span>Arsip Foto Terhapus ({archivedPhotos.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
            >
              {showArchive ? 'Sembunyikan' : 'Kelola Arsip Foto'}
            </button>
          </div>
          {showArchive && (
            <div className="divide-y divide-amber-200/70">
              {archivedPhotos.map((ap) => (
                <div
                  key={ap.id}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {ap.original_name}{' '}
                      <span className="font-normal text-slate-600">({ap.doc_category})</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Dihapus oleh {ap.deleted_by_name ?? '-'} · Alasan: {ap.delete_reason ?? '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => restoreAttachment(ap.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Pulihkan</span>
                    </button>
                    {currentRole?.code === 'SUPER_ADMIN' && (
                      <button
                        type="button"
                        onClick={() => setPermanentDeleteTarget(ap)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus Permanen</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full-Size Photo Lightbox Preview Modal */}
      <Modal
        open={Boolean(lightboxState)}
        onClose={() => {
          revokeLightboxObjectUrl();
          setLightboxState(null);
          setLightboxFullUrl(null);
          setLightboxError(null);
          setLightboxZoomed(false);
        }}
        title={
          activeUploadedPhoto?.original_name ??
          activeStagedPhoto?.file.name ??
          'Preview Foto Proyek'
        }
        subtitle={
          activeUploadedPhoto
            ? `${activeUploadedPhoto.doc_category} · ${formatFileSize(activeUploadedPhoto.size_bytes)} · ${activeUploadedPhoto.uploaded_by_name} · ${formatDateTimeID(activeUploadedPhoto.uploaded_at)}`
            : activeStagedPhoto
            ? `${activeStagedPhoto.docCategory} · ${formatFileSize(activeStagedPhoto.file.size)} · Belum diunggah (Antrean)`
            : undefined
        }
        maxWidth="max-w-5xl"
      >
        <div className="space-y-3">
          <div className="relative bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center min-h-[300px] sm:min-h-[440px] max-h-[70vh]">
            {lightboxLoading ? (
              <div className="text-xs text-slate-300">Memuat foto...</div>
            ) : lightboxError ? (
              <div className="flex flex-col items-center gap-2 text-center p-6">
                <p className="text-xs text-red-300">{lightboxError}</p>
                {activeUploadedPhoto && (
                  <button
                    type="button"
                    onClick={() => openUploadedLightbox(activeUploadedPhoto)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Muat Ulang Foto</span>
                  </button>
                )}
              </div>
            ) : lightboxFullUrl ? (
              <img
                src={lightboxFullUrl}
                alt=""
                onClick={() => setLightboxZoomed((z) => !z)}
                onError={() => setLightboxError('Foto tidak dapat dirender oleh browser.')}
                className={`transition-transform duration-200 cursor-zoom-in ${
                  lightboxZoomed
                    ? 'max-h-none max-w-none scale-125 cursor-zoom-out'
                    : 'max-h-[68vh] max-w-full object-contain'
                }`}
              />
            ) : (
              <div className="text-xs text-slate-400">Preview foto tidak tersedia.</div>
            )}

            {lightboxState?.mode === 'uploaded' && filteredPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center border border-white/20 cursor-pointer"
                  title="Foto Sebelumnya"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center border border-white/20 cursor-pointer"
                  title="Foto Berikutnya"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-600">
              {activeUploadedPhoto?.description || activeStagedPhoto?.description || 'Tanpa keterangan'}
              {lightboxState?.mode === 'uploaded' && filteredPhotos.length > 1 && (
                <span className="ml-2 font-mono text-slate-400">
                  ({activeUploadedIndex + 1} / {filteredPhotos.length})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLightboxZoomed((z) => !z)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {lightboxZoomed ? (
                  <>
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span>Normal</span>
                  </>
                ) : (
                  <>
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Perbesar</span>
                  </>
                )}
              </button>
              {activeUploadedPhoto && (
                <button
                  type="button"
                  onClick={() => handleDownloadPhoto(activeUploadedPhoto)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Foto</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Photo Metadata Modal */}
      <Modal
        open={Boolean(editingPhoto)}
        onClose={() => setEditingPhoto(null)}
        title="Ubah Detail Dokumentasi Foto"
        maxWidth="max-w-md"
      >
        {editingPhoto && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateAttachmentMeta(editingPhoto.id, {
                doc_category: editCat,
                description: editDesc,
              });
              setEditingPhoto(null);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kategori Foto
              </label>
              <select
                value={editCat}
                onChange={(e) => setEditCat(e.target.value as AttachmentCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {Array.from(new Set([...PHOTO_CATEGORIES, editCat])).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keterangan Foto
              </label>
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
                onClick={() => setEditingPhoto(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={async (reason) => {
          if (archiveTarget) {
            await archiveAttachment(archiveTarget.id, reason);
            setArchiveTarget(null);
          }
        }}
        requireNote
        noteLabel="Alasan Penghapusan / Pengarsipan Foto"
        title="Arsipkan Dokumentasi Foto?"
        description={`Foto "${archiveTarget?.original_name ?? ''}" akan diarsipkan secara aman dan dapat dipulihkan oleh Super Admin / Head Divisi.`}
        confirmLabel="Arsipkan Foto"
        danger
      />

      {/* Permanent Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(permanentDeleteTarget)}
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={async () => {
          if (permanentDeleteTarget) {
            await deleteAttachment(permanentDeleteTarget.id);
            setPermanentDeleteTarget(null);
          }
        }}
        title="Hapus Foto Permanen?"
        description={`File foto "${permanentDeleteTarget?.original_name ?? ''}" akan dihapus permanen dari penyimpanan server.`}
        confirmLabel="Hapus Permanen"
        danger
      />
    </div>
  );
};
