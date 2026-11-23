import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileWarning,
  History,
  Image as ImageIcon,
  Layers,
  PackageCheck,
  Plus,
  ShieldAlert,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useAttachments } from '../../context/AttachmentContext';
import { usePMS } from '../../context/PMSContext';
import {
  ProjectAsset,
  ProjectAssetCondition,
  ProjectAssetHistoryAction,
  ProjectAssetReport,
  ProjectAssetReportStatus,
  ProjectAssetReportType,
} from '../../types/pms';
import { formatDateID, formatDateTimeID, formatNumber } from '../../utils/format';
import {
  canDeleteProjectAsset,
  canManageProjectAssets,
  canReportProjectAssetIssue,
  canReviewProjectAssetReports,
  isProjectAssetMonitoringOnly,
} from '../../utils/permissions';
import { ProtectedAttachmentImage } from '../attachments/ProtectedAttachmentImage';
import { EmptyState, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';

type AssetTab = 'aset' | 'laporan' | 'riwayat';

const ASSET_CATEGORIES = [
  'Alat Pelindung Diri (APD)',
  'Alat Gali & Tanah',
  'Alat Angkut Lapangan',
  'Alat Ukur',
  'Perkakas Tangan',
  'Alat Bantu Ketinggian',
  'Peralatan Listrik & Mesin',
  'Lainnya',
];

const ASSET_UNITS = ['Buah', 'Unit', 'Set', 'Pasang', 'Roll', 'Batang', 'Paket'];

const QUICK_TOOL_SUGGESTIONS = [
  'Cangkul',
  'Sekop',
  'Pengki',
  'Helm Proyek',
  'Rompi Safety',
  'Meteran',
  'Gerobak Sorong',
  'Palu',
  'Tangga Lipat',
];

const IMAGE_MIME_ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const AsetModule: React.FC = () => {
  const {
    state,
    currentRole,
    currentDivision,
    selectedAssetId,
    setSelectedAssetId,
    workflowBusy,
    showToast,
    createProjectAssetApi,
    updateProjectAssetApi,
    createProjectAssetReportApi,
    resubmitProjectAssetReportApi,
    reviewProjectAssetReportApi,
    deleteProjectAssetApi,
  } = usePMS();

  const { attachments, uploadFiles } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';

  const canManageAssets = canManageProjectAssets(roleCode, divCode);
  const canReviewReports = canReviewProjectAssetReports(roleCode, divCode);
  const canReportIssue = canReportProjectAssetIssue(roleCode, divCode);
  const canDeleteAsset = canDeleteProjectAsset(roleCode);
  const isMonitoringOnly = isProjectAssetMonitoringOnly(roleCode, divCode);

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );
  const projectAssets = useMemo(() => state.projectAssets ?? [], [state.projectAssets]);
  const assetReports = useMemo(() => state.projectAssetReports ?? [], [state.projectAssetReports]);
  const assetHistories = useMemo(
    () => state.projectAssetHistories ?? [],
    [state.projectAssetHistories]
  );

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<AssetTab>('aset');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [conditionFilter, setConditionFilter] = useState<'SEMUA' | ProjectAssetCondition>('SEMUA');
  const [reportStatusFilter, setReportStatusFilter] = useState<'SEMUA' | ProjectAssetReportStatus>(
    'SEMUA'
  );
  const [reportTypeFilter, setReportTypeFilter] = useState<'SEMUA' | ProjectAssetReportType>(
    'SEMUA'
  );
  const [historyActionFilter, setHistoryActionFilter] = useState<'SEMUA' | ProjectAssetHistoryAction>(
    'SEMUA'
  );

  // Lightbox Photo Preview
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null);
  const [previewPhotoTitle, setPreviewPhotoTitle] = useState('');

  // Modal: Add / Edit Asset (Finance)
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ProjectAsset | null>(null);
  const [assetForm, setAssetForm] = useState({
    project_id: activeProjects[0]?.id ?? '',
    asset_code: '',
    name: '',
    category: ASSET_CATEGORIES[0],
    qty: 1,
    qty_available: 1,
    qty_damaged: 0,
    qty_lost: 0,
    unit: 'Buah',
    recorded_date: new Date().toISOString().slice(0, 10),
    initial_condition: 'Baik' as ProjectAssetCondition,
    notes: '',
  });
  const [assetPhotoFile, setAssetPhotoFile] = useState<File | null>(null);
  const [assetPhotoPreview, setAssetPhotoPreview] = useState<string>('');
  const [assetUploadPct, setAssetUploadPct] = useState(0);
  const [assetFormError, setAssetFormError] = useState('');
  const [assetSubmitting, setAssetSubmitting] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal: Report Loss / Damage (Tim Lapangan)
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<ProjectAssetReport | null>(null);
  const [reportForm, setReportForm] = useState({
    project_id: activeProjects[0]?.id ?? '',
    asset_id: '',
    report_type: 'Rusak' as ProjectAssetReportType,
    affected_qty: 1,
    incident_date: new Date().toISOString().slice(0, 10),
    chronology: '',
  });
  const [reportPhotoFile, setReportPhotoFile] = useState<File | null>(null);
  const [reportPhotoPreview, setReportPhotoPreview] = useState<string>('');
  const [reportUploadPct, setReportUploadPct] = useState(0);
  const [reportFormError, setReportFormError] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const reportFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal: Review & Follow-up Report (Finance)
  const [reviewTarget, setReviewTarget] = useState<ProjectAssetReport | null>(null);
  const [reviewForm, setReviewForm] = useState({
    status: 'Disetujui' as ProjectAssetReportStatus,
    approved_qty: 1,
    follow_up_note: '',
  });
  const [reviewError, setReviewError] = useState('');

  // Modal: Hapus Aset Proyek (Super Admin & Head)
  const [deleteTarget, setDeleteTarget] = useState<ProjectAsset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Revoke temporary blob previews cleanly
  useEffect(() => {
    return () => {
      if (assetPhotoPreview) URL.revokeObjectURL(assetPhotoPreview);
    };
  }, [assetPhotoPreview]);

  useEffect(() => {
    return () => {
      if (reportPhotoPreview) URL.revokeObjectURL(reportPhotoPreview);
    };
  }, [reportPhotoPreview]);

  const getPhotoAttachment = (attachmentId?: string) => {
    if (!attachmentId) return null;
    return attachments.find((a) => a.id === attachmentId && a.status !== 'Diarsipkan') ?? null;
  };

  // Filtered Lists
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectAssets.filter((a) => {
      if (projectFilter !== 'SEMUA' && a.project_id !== projectFilter) return false;
      if (conditionFilter === 'Baik') {
        if (!(a.qty_available > 0 && a.qty_damaged === 0 && a.qty_lost === 0)) return false;
      } else if (conditionFilter === 'Rusak') {
        if (!(a.qty_damaged > 0 || a.condition === 'Rusak')) return false;
      } else if (conditionFilter === 'Hilang') {
        if (!(a.qty_lost > 0 || a.condition === 'Hilang')) return false;
      }
      if (!q) return true;
      return (
        a.asset_code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.project_number.toLowerCase().includes(q) ||
        a.project_name.toLowerCase().includes(q) ||
        (a.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [projectAssets, projectFilter, conditionFilter, search]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assetReports.filter((r) => {
      if (projectFilter !== 'SEMUA' && r.project_id !== projectFilter) return false;
      if (reportStatusFilter !== 'SEMUA' && r.status !== reportStatusFilter) return false;
      if (reportTypeFilter !== 'SEMUA' && r.report_type !== reportTypeFilter) return false;
      if (!q) return true;
      return (
        r.report_no.toLowerCase().includes(q) ||
        r.asset_code.toLowerCase().includes(q) ||
        r.asset_name.toLowerCase().includes(q) ||
        r.project_number.toLowerCase().includes(q) ||
        r.project_name.toLowerCase().includes(q) ||
        r.reported_by_name.toLowerCase().includes(q) ||
        r.chronology.toLowerCase().includes(q)
      );
    });
  }, [assetReports, projectFilter, reportStatusFilter, reportTypeFilter, search]);

  const filteredHistories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assetHistories.filter((h) => {
      if (projectFilter !== 'SEMUA' && h.project_id !== projectFilter) return false;
      if (historyActionFilter !== 'SEMUA' && h.action_type !== historyActionFilter) return false;
      if (!q) return true;
      return (
        h.asset_code.toLowerCase().includes(q) ||
        h.asset_name.toLowerCase().includes(q) ||
        h.project_number.toLowerCase().includes(q) ||
        h.project_name.toLowerCase().includes(q) ||
        h.actor_name.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q)
      );
    });
  }, [assetHistories, projectFilter, historyActionFilter, search]);

  // KPI Metrics (scoped to selected project filter or all projects)
  const kpiStats = useMemo(() => {
    const scoped =
      projectFilter === 'SEMUA'
        ? projectAssets
        : projectAssets.filter((a) => a.project_id === projectFilter);
    const pendingReports = assetReports.filter(
      (r) =>
        r.status === 'Menunggu Pemeriksaan' &&
        (projectFilter === 'SEMUA' || r.project_id === projectFilter)
    ).length;
    return {
      itemCount: scoped.length,
      totalQty: scoped.reduce((acc, a) => acc + a.qty_total, 0),
      availableQty: scoped.reduce((acc, a) => acc + a.qty_available, 0),
      damagedQty: scoped.reduce((acc, a) => acc + a.qty_damaged, 0),
      lostQty: scoped.reduce((acc, a) => acc + a.qty_lost, 0),
      pendingReports,
    };
  }, [projectAssets, assetReports, projectFilter]);

  const projectSummaryRows = useMemo(() => {
    return activeProjects.map((prj) => {
      const items = projectAssets.filter((a) => a.project_id === prj.id);
      const pendingCount = assetReports.filter(
        (r) => r.project_id === prj.id && r.status === 'Menunggu Pemeriksaan'
      ).length;
      return {
        project: prj,
        itemTypes: items.length,
        totalQty: items.reduce((s, a) => s + a.qty_total, 0),
        availableQty: items.reduce((s, a) => s + a.qty_available, 0),
        damagedQty: items.reduce((s, a) => s + a.qty_damaged, 0),
        lostQty: items.reduce((s, a) => s + a.qty_lost, 0),
        pendingCount,
      };
    });
  }, [activeProjects, projectAssets, assetReports]);

  const reportableAssetsForForm = useMemo(() => {
    return projectAssets.filter(
      (a) => a.project_id === reportForm.project_id && a.qty_available > 0
    );
  }, [projectAssets, reportForm.project_id]);

  const selectedAssetForReport = useMemo(
    () => projectAssets.find((a) => a.id === reportForm.asset_id) ?? null,
    [projectAssets, reportForm.asset_id]
  );

  const selectedAsset: ProjectAsset | null =
    projectAssets.find((a) => a.id === selectedAssetId) ?? null;

  // Helpers for Photo Selection
  const handleSelectImageFile = (
    file: File | null,
    setFile: React.Dispatch<React.SetStateAction<File | null>>,
    setPreview: React.Dispatch<React.SetStateAction<string>>,
    setErr: React.Dispatch<React.SetStateAction<string>>
  ) => {
    setErr('');
    if (!file) {
      setFile(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    if (!validExt && !IMAGE_MIME_ALLOWED.has(file.type.toLowerCase())) {
      setErr('Format foto harus JPG, JPEG, PNG, atau WEBP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErr('Ukuran foto maksimal 15 MB.');
      return;
    }
    setFile(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  // Open Modals
  const openAddAssetModal = () => {
    if (!canManageAssets) {
      showToast('Hanya Divisi Finance atau Super Admin yang dapat menambah aset proyek.');
      return;
    }
    const defaultPrjId =
      projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id ?? '';
    setEditingAsset(null);
    setAssetForm({
      project_id: defaultPrjId,
      asset_code: `AST-PRJ-${String(projectAssets.length + 1).padStart(3, '0')}`,
      name: '',
      category: ASSET_CATEGORIES[0],
      qty: 1,
      qty_available: 1,
      qty_damaged: 0,
      qty_lost: 0,
      unit: 'Buah',
      recorded_date: new Date().toISOString().slice(0, 10),
      initial_condition: 'Baik',
      notes: '',
    });
    setAssetPhotoFile(null);
    setAssetPhotoPreview('');
    setAssetUploadPct(0);
    setAssetFormError('');
    setAssetModalOpen(true);
  };

  const openEditAssetModal = (asset: ProjectAsset) => {
    if (!canManageAssets) {
      showToast('Hanya Divisi Finance atau Super Admin yang dapat mengubah data aset.');
      return;
    }
    setEditingAsset(asset);
    setAssetForm({
      project_id: asset.project_id,
      asset_code: asset.asset_code,
      name: asset.name,
      category: asset.category,
      qty: asset.qty_total,
      qty_available: asset.qty_available,
      qty_damaged: asset.qty_damaged,
      qty_lost: asset.qty_lost,
      unit: asset.unit,
      recorded_date: asset.recorded_date,
      initial_condition: asset.initial_condition,
      notes: asset.notes === '-' ? '' : asset.notes,
    });
    setAssetPhotoFile(null);
    setAssetPhotoPreview('');
    setAssetUploadPct(0);
    setAssetFormError('');
    setAssetModalOpen(true);
  };

  const openReportModal = (presetAsset?: ProjectAsset) => {
    if (!canReportIssue) {
      showToast('Hanya Tim Lapangan (Divisi Teknik) atau Super Admin yang dapat membuat laporan.');
      return;
    }
    const targetProjectId =
      presetAsset?.project_id ??
      (projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id ?? '');
    const candidates = projectAssets.filter(
      (a) => a.project_id === targetProjectId && a.qty_available > 0
    );
    const targetAssetId =
      presetAsset && presetAsset.qty_available > 0
        ? presetAsset.id
        : candidates[0]?.id ?? '';

    setResubmitTarget(null);
    setReportForm({
      project_id: targetProjectId,
      asset_id: targetAssetId,
      report_type: 'Rusak',
      affected_qty: 1,
      incident_date: new Date().toISOString().slice(0, 10),
      chronology: '',
    });
    setReportPhotoFile(null);
    setReportPhotoPreview('');
    setReportUploadPct(0);
    setReportFormError('');
    setReportModalOpen(true);
  };

  const openResubmitModal = (report: ProjectAssetReport) => {
    if (!canReportIssue) return;
    setResubmitTarget(report);
    setReportForm({
      project_id: report.project_id,
      asset_id: report.asset_id,
      report_type: report.report_type,
      affected_qty: report.affected_qty,
      incident_date: report.incident_date,
      chronology: report.chronology,
    });
    setReportPhotoFile(null);
    setReportPhotoPreview('');
    setReportUploadPct(0);
    setReportFormError('');
    setReportModalOpen(true);
  };

  const openReviewModal = (report: ProjectAssetReport) => {
    if (!canReviewReports) {
      showToast('Hanya Divisi Finance atau Super Admin yang dapat memeriksa laporan aset.');
      return;
    }
    setReviewTarget(report);
    setReviewForm({
      status: 'Disetujui',
      approved_qty: report.affected_qty,
      follow_up_note: report.follow_up_note && report.follow_up_note !== '-' ? report.follow_up_note : '',
    });
    setReviewError('');
  };

  // Submit Handlers
  const handleSubmitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssetFormError('');

    if (!assetForm.project_id) {
      setAssetFormError('Silakan pilih proyek terlebih dahulu.');
      return;
    }
    if (!assetForm.name.trim()) {
      setAssetFormError('Nama aset atau peralatan kerja wajib diisi.');
      return;
    }

    setAssetSubmitting(true);
    try {
      const targetId = editingAsset ? editingAsset.id : `past-${Date.now()}`;
      let photoAttachmentId: string | undefined = editingAsset?.photo_attachment_id;

      if (assetPhotoFile) {
        const uploaded = await uploadFiles({
          files: [assetPhotoFile],
          module_id: 'aset',
          entity_id: targetId,
          entity_label: `${assetForm.asset_code || targetId} — ${assetForm.name.trim()}`,
          doc_category: 'Foto Material / Aset',
          description: `Foto aset proyek: ${assetForm.name.trim()}`,
          onProgress: (pct) => setAssetUploadPct(pct),
        });
        photoAttachmentId = uploaded[0]?.id;
      }

      if (editingAsset) {
        const avail = Math.round(Number(assetForm.qty_available));
        const dmg = Math.round(Number(assetForm.qty_damaged));
        const lost = Math.round(Number(assetForm.qty_lost));
        if (avail < 0 || dmg < 0 || lost < 0 || avail + dmg + lost <= 0) {
          setAssetFormError('Jumlah Tersedia, Rusak, dan Hilang tidak boleh negatif dan total harus > 0.');
          return;
        }
        const res = await updateProjectAssetApi(editingAsset.id, {
          project_id: assetForm.project_id,
          name: assetForm.name.trim(),
          category: assetForm.category.trim(),
          unit: assetForm.unit.trim(),
          recorded_date: assetForm.recorded_date,
          qty_available: avail,
          qty_damaged: dmg,
          qty_lost: lost,
          notes: assetForm.notes.trim(),
          ...(photoAttachmentId ? { photo_attachment_id: photoAttachmentId } : {}),
        });
        if (!res.ok) {
          setAssetFormError(res.message);
          return;
        }
      } else {
        const qty = Math.round(Number(assetForm.qty));
        if (!Number.isFinite(qty) || qty <= 0) {
          setAssetFormError('Jumlah (Qty) awal harus lebih dari 0.');
          return;
        }
        const res = await createProjectAssetApi({
          id: targetId,
          asset_code: assetForm.asset_code.trim() || undefined,
          project_id: assetForm.project_id,
          name: assetForm.name.trim(),
          category: assetForm.category.trim(),
          qty,
          unit: assetForm.unit.trim(),
          recorded_date: assetForm.recorded_date,
          initial_condition: assetForm.initial_condition,
          notes: assetForm.notes.trim(),
          photo_attachment_id: photoAttachmentId,
        });
        if (!res.ok) {
          setAssetFormError(res.message);
          return;
        }
      }

      setAssetModalOpen(false);
    } catch (err) {
      setAssetFormError(err instanceof Error ? err.message : 'Gagal menyimpan aset proyek.');
    } finally {
      setAssetSubmitting(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportFormError('');

    if (!reportForm.project_id) {
      setReportFormError('Pilih proyek terlebih dahulu.');
      return;
    }
    if (!reportForm.asset_id) {
      setReportFormError('Pilih aset proyek yang dilaporkan.');
      return;
    }
    const targetAsset = projectAssets.find((a) => a.id === reportForm.asset_id);
    if (!targetAsset) {
      setReportFormError('Data aset tidak ditemukan.');
      return;
    }
    const qty = Math.round(Number(reportForm.affected_qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setReportFormError('Jumlah aset terdampak minimal 1.');
      return;
    }
    if (qty > targetAsset.qty_available) {
      setReportFormError(
        `Jumlah terdampak (${qty} ${targetAsset.unit}) melebihi jumlah tersedia saat ini (${targetAsset.qty_available} ${targetAsset.unit}).`
      );
      return;
    }
    if (!reportForm.chronology.trim()) {
      setReportFormError('Kronologi / keterangan kejadian wajib diisi.');
      return;
    }
    const hasExistingPhoto = Boolean(resubmitTarget?.photo_attachment_id);
    if (reportForm.report_type === 'Rusak' && !reportPhotoFile && !hasExistingPhoto) {
      setReportFormError('Foto bukti kerusakan wajib diunggah untuk laporan kerusakan aset.');
      return;
    }

    setReportSubmitting(true);
    try {
      const targetReportId = resubmitTarget ? resubmitTarget.id : `par-${Date.now()}`;
      let photoAttachmentId: string | undefined = resubmitTarget?.photo_attachment_id;

      if (reportPhotoFile) {
        const uploaded = await uploadFiles({
          files: [reportPhotoFile],
          module_id: 'aset',
          entity_id: targetReportId,
          entity_label: `Bukti ${reportForm.report_type} — ${targetAsset.name}`,
          doc_category: 'Foto Material / Aset',
          description: `Bukti laporan ${reportForm.report_type.toLowerCase()} aset ${targetAsset.asset_code} (${targetAsset.name})`,
          onProgress: (pct) => setReportUploadPct(pct),
        });
        photoAttachmentId = uploaded[0]?.id;
      }

      if (resubmitTarget) {
        const res = await resubmitProjectAssetReportApi(resubmitTarget.id, {
          affected_qty: qty,
          incident_date: reportForm.incident_date,
          chronology: reportForm.chronology.trim(),
          photo_attachment_id: photoAttachmentId,
        });
        if (!res.ok) {
          setReportFormError(res.message);
          return;
        }
      } else {
        const res = await createProjectAssetReportApi({
          id: targetReportId,
          project_id: reportForm.project_id,
          asset_id: reportForm.asset_id,
          report_type: reportForm.report_type,
          affected_qty: qty,
          incident_date: reportForm.incident_date,
          chronology: reportForm.chronology.trim(),
          photo_attachment_id: photoAttachmentId,
        });
        if (!res.ok) {
          setReportFormError(res.message);
          return;
        }
      }

      setReportModalOpen(false);
      setActiveTab('laporan');
    } catch (err) {
      setReportFormError(err instanceof Error ? err.message : 'Gagal mengirim laporan aset.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleConfirmDeleteAsset = async () => {
    if (!deleteTarget || !canDeleteAsset) return;
    setDeleteBusy(true);
    try {
      const res = await deleteProjectAssetApi(deleteTarget.id);
      if (res.ok) {
        setDeleteTarget(null);
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewError('');

    if (reviewForm.status === 'Perlu Perbaikan Data' && !reviewForm.follow_up_note.trim()) {
      setReviewError('Catatan tindak lanjut wajib diisi jika meminta perbaikan data laporan.');
      return;
    }

    const res = await reviewProjectAssetReportApi(reviewTarget.id, {
      status: reviewForm.status,
      follow_up_note: reviewForm.follow_up_note.trim(),
      approved_qty:
        reviewForm.status === 'Disetujui' ? Number(reviewForm.approved_qty) : undefined,
    });
    if (!res.ok) {
      setReviewError(res.message);
      return;
    }
    setReviewTarget(null);
  };

  const openPhotoLightbox = (attachmentId: string, title: string) => {
    setPreviewPhotoId(attachmentId);
    setPreviewPhotoTitle(title);
  };

  const renderPhotoThumbnail = (attachmentId: string | undefined, label: string, size = 'w-11 h-11') => {
    const att = getPhotoAttachment(attachmentId);
    if (!att) {
      return (
        <div
          className={`${size} rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 shrink-0`}
          title="Belum ada foto"
        >
          <ImageIcon className="w-4 h-4" />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => openPhotoLightbox(att.id, label)}
        className={`${size} rounded-lg border border-slate-200 overflow-hidden bg-slate-100 hover:ring-2 hover:ring-[#1D7AFC] transition-all shrink-0 cursor-pointer relative group`}
        title={`Klik untuk melihat foto: ${att.original_name}`}
      >
        <ProtectedAttachmentImage attachment={att} className="w-full h-full object-cover" />
        <span className="absolute inset-0 bg-slate-900/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Eye className="w-3.5 h-3.5 text-white" />
        </span>
      </button>
    );
  };

  // DETAIL VIEW FOR SELECTED ASSET
  if (selectedAsset) {
    const assetSpecificReports = assetReports.filter((r) => r.asset_id === selectedAsset.id);
    const assetSpecificHistory = assetHistories.filter((h) => h.asset_id === selectedAsset.id);
    const photoAtt = getPhotoAttachment(selectedAsset.photo_attachment_id);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedAssetId(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-[#1D7AFC] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Aset Proyek</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {canReportIssue && selectedAsset.qty_available > 0 && (
              <button
                type="button"
                onClick={() => openReportModal(selectedAsset)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 rounded-xl cursor-pointer"
              >
                <FileWarning className="w-4 h-4" />
                <span>Lapor Kehilangan / Kerusakan</span>
              </button>
            )}
            {canManageAssets && (
              <button
                type="button"
                onClick={() => openEditAssetModal(selectedAsset)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Data Aset</span>
              </button>
            )}
          </div>
        </div>

        {/* Asset Header Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
          <div className="flex flex-col md:flex-row gap-5">
            <div className="w-full md:w-44 h-40 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
              {photoAtt ? (
                <button
                  type="button"
                  onClick={() => openPhotoLightbox(photoAtt.id, `${selectedAsset.asset_code} — ${selectedAsset.name}`)}
                  className="w-full h-full relative group cursor-pointer"
                >
                  <ProtectedAttachmentImage attachment={photoAtt} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-semibold">
                    Perbesar
                  </span>
                </button>
              ) : (
                <div className="text-center text-slate-400 p-4">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                  <p className="text-[11px]">Tidak ada foto aset</p>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-[#1D7AFC]">{selectedAsset.asset_code}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-slate-700">
                      {selectedAsset.project_number} — {selectedAsset.project_name}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 mt-1">{selectedAsset.name}</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kategori: {selectedAsset.category} · Dicatat: {formatDateID(selectedAsset.recorded_date)} oleh{' '}
                    {selectedAsset.created_by_name}
                  </p>
                </div>
                <StatusLabel status={selectedAsset.condition} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Total Aset</span>
                  <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                    {formatNumber(selectedAsset.qty_total)} {selectedAsset.unit}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <span className="text-[11px] text-emerald-700 block">Tersedia (Baik)</span>
                  <span className="text-lg font-bold font-mono text-emerald-800 tabular-nums">
                    {formatNumber(selectedAsset.qty_available)} {selectedAsset.unit}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-red-50/70 border border-red-200">
                  <span className="text-[11px] text-red-700 block">Rusak</span>
                  <span className="text-lg font-bold font-mono text-red-800 tabular-nums">
                    {formatNumber(selectedAsset.qty_damaged)} {selectedAsset.unit}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                  <span className="text-[11px] text-rose-700 block">Hilang</span>
                  <span className="text-lg font-bold font-mono text-rose-800 tabular-nums">
                    {formatNumber(selectedAsset.qty_lost)} {selectedAsset.unit}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-700 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5">
                <span className="font-semibold text-slate-900">Keterangan: </span>
                {selectedAsset.notes || '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Asset Reports & History Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Laporan Kehilangan & Kerusakan Aset Ini
            </h2>
            <div className="divide-y divide-slate-100 mt-1">
              {assetSpecificReports.map((rep) => (
                <div key={rep.id} className="py-3 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-[#1D7AFC]">{rep.report_no}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-semibold text-slate-900">
                        {rep.report_type} ({rep.affected_qty} {rep.unit})
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Kejadian: {formatDateID(rep.incident_date)} · Pelapor: {rep.reported_by_name}
                      </p>
                    </div>
                    <StatusLabel status={rep.status} />
                  </div>
                  <p className="text-slate-700">{rep.chronology}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {renderPhotoThumbnail(rep.photo_attachment_id, `${rep.report_no} — Bukti`, 'w-10 h-10')}
                      {rep.follow_up_note && (
                        <span className="text-[11px] text-slate-600">
                          <strong>Tindak Lanjut:</strong> {rep.follow_up_note}
                        </span>
                      )}
                    </div>
                    {canReviewReports && !rep.applied_to_asset && (
                      <button
                        type="button"
                        onClick={() => openReviewModal(rep)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-[#13233C] text-white rounded-lg cursor-pointer shrink-0"
                      >
                        Periksa
                      </button>
                    )}
                    {canReportIssue && rep.status === 'Perlu Perbaikan Data' && (
                      <button
                        type="button"
                        onClick={() => openResubmitModal(rep)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-orange-600 text-white rounded-lg cursor-pointer shrink-0"
                      >
                        Perbaiki Data
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {assetSpecificReports.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-500">
                  Belum ada laporan kehilangan atau kerusakan untuk aset ini.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Riwayat Perubahan Aset
            </h2>
            <div className="divide-y divide-slate-100 mt-1">
              {assetSpecificHistory.map((h) => (
                <div key={h.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{h.action_type}</span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {formatDateTimeID(h.created_at)}
                    </span>
                  </div>
                  <p className="text-slate-700">{h.description}</p>
                  <p className="text-[11px] text-slate-500">
                    Petugas: {h.actor_name} ({h.actor_role})
                  </p>
                </div>
              ))}
              {assetSpecificHistory.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-500">
                  Belum ada riwayat perubahan tercatat.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modals remain accessible from detail view */}
        {renderModals()}
      </div>
    );
  }

  function renderModals() {
    return (
      <>
        {/* MODAL: TAMBAH / EDIT ASET PROYEK (FINANCE) */}
        <Modal
          open={assetModalOpen}
          onClose={() => setAssetModalOpen(false)}
          title={editingAsset ? `Edit Aset — ${editingAsset.asset_code}` : 'Tambah Aset Proyek'}
          subtitle="Catat peralatan kerja berdasarkan masing-masing proyek"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSubmitAsset} className="space-y-4">
            {assetFormError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {assetFormError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pilih Proyek <span className="text-red-500">*</span>
              </label>
              <select
                value={assetForm.project_id}
                onChange={(e) => setAssetForm({ ...assetForm, project_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                required
              >
                <option value="">-- Pilih Proyek --</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Aset / Peralatan Kerja <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  placeholder="Contoh: Cangkul, Sekop, Helm Proyek, Gerobak"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
                {!editingAsset && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_TOOL_SUGGESTIONS.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => setAssetForm((prev) => ({ ...prev, name: tool }))}
                        className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-blue-50 hover:text-[#1D7AFC] text-slate-600 rounded-md border border-slate-200 cursor-pointer"
                      >
                        + {tool}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Aset</label>
                <input
                  type="text"
                  value={assetForm.asset_code}
                  onChange={(e) => setAssetForm({ ...assetForm, asset_code: e.target.value })}
                  disabled={Boolean(editingAsset)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kategori Aset <span className="text-red-500">*</span>
                </label>
                <select
                  value={assetForm.category}
                  onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  required
                >
                  {ASSET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Pencatatan <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={assetForm.recorded_date}
                  onChange={(e) => setAssetForm({ ...assetForm, recorded_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
              </div>
            </div>

            {!editingAsset ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jumlah (Qty) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={assetForm.qty}
                    onChange={(e) => setAssetForm({ ...assetForm, qty: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Satuan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={assetForm.unit}
                    onChange={(e) => setAssetForm({ ...assetForm, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {ASSET_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kondisi Awal <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={assetForm.initial_condition}
                    onChange={(e) =>
                      setAssetForm({
                        ...assetForm,
                        initial_condition: e.target.value as ProjectAssetCondition,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="Baik">Baik (Tersedia)</option>
                    <option value="Rusak">Rusak</option>
                    <option value="Hilang">Hilang</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-semibold text-slate-800">
                  Rincian Jumlah & Kondisi ({assetForm.unit})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-emerald-700 mb-1">
                      Tersedia (Baik)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={assetForm.qty_available}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, qty_available: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-red-700 mb-1">Rusak</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={assetForm.qty_damaged}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, qty_damaged: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-rose-700 mb-1">Hilang</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={assetForm.qty_lost}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, qty_lost: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Satuan</label>
                    <select
                      value={assetForm.unit}
                      onChange={(e) => setAssetForm({ ...assetForm, unit: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {ASSET_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Total terhitung:{' '}
                  <strong className="font-mono">
                    {Math.max(0, assetForm.qty_available) +
                      Math.max(0, assetForm.qty_damaged) +
                      Math.max(0, assetForm.qty_lost)}{' '}
                    {assetForm.unit}
                  </strong>
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
              <textarea
                rows={2}
                value={assetForm.notes}
                onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                placeholder="Catatan lokasi penyimpanan proyek, spesifikasi ringkas, atau keterangan tambahan..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload Foto Aset (Opsional)
              </label>
              <div className="flex items-center gap-3 p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50/70">
                <input
                  ref={assetFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    handleSelectImageFile(
                      e.target.files?.[0] ?? null,
                      setAssetPhotoFile,
                      setAssetPhotoPreview,
                      setAssetFormError
                    )
                  }
                  className="hidden"
                />
                {assetPhotoPreview ? (
                  <img
                    src={assetPhotoPreview}
                    alt="Preview foto aset"
                    className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                ) : editingAsset?.photo_attachment_id ? (
                  renderPhotoThumbnail(editingAsset.photo_attachment_id, editingAsset.name, 'w-16 h-16')
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => assetFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{assetPhotoFile ? 'Ganti Foto' : 'Pilih Foto'}</span>
                    </button>
                    {assetPhotoFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setAssetPhotoFile(null);
                          setAssetPhotoPreview('');
                          if (assetFileInputRef.current) assetFileInputRef.current.value = '';
                        }}
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Hapus Pilihan
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {assetPhotoFile
                      ? `${assetPhotoFile.name} (${(assetPhotoFile.size / 1024).toFixed(0)} KB)`
                      : editingAsset?.photo_name
                      ? `Foto tersimpan: ${editingAsset.photo_name}`
                      : 'Format JPG, PNG, WEBP (maks. 15 MB)'}
                  </p>
                  {assetSubmitting && assetUploadPct > 0 && (
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-[#1D7AFC] transition-all"
                        style={{ width: `${assetUploadPct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={assetSubmitting || workflowBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60"
              >
                {assetSubmitting
                  ? 'Menyimpan...'
                  : editingAsset
                  ? 'Simpan Perubahan'
                  : 'Simpan Aset Proyek'}
              </button>
            </div>
          </form>
        </Modal>

        {/* MODAL: LAPOR KEHILANGAN / KERUSAKAN (TIM LAPANGAN) */}
        <Modal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          title={
            resubmitTarget
              ? `Perbaiki Laporan ${resubmitTarget.report_no}`
              : 'Lapor Kehilangan / Kerusakan Aset Proyek'
          }
          subtitle="Laporan akan diperiksa oleh Finance sebelum jumlah & kondisi aset diperbarui"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSubmitReport} className="space-y-4">
            {reportFormError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {reportFormError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Proyek <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportForm.project_id}
                  disabled={Boolean(resubmitTarget)}
                  onChange={(e) => {
                    const nextPrj = e.target.value;
                    const firstAsset = projectAssets.find(
                      (a) => a.project_id === nextPrj && a.qty_available > 0
                    );
                    setReportForm({
                      ...reportForm,
                      project_id: nextPrj,
                      asset_id: firstAsset?.id ?? '',
                      affected_qty: 1,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white disabled:bg-slate-100"
                  required
                >
                  <option value="">-- Pilih Proyek --</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Aset yang Dilaporkan <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportForm.asset_id}
                  disabled={Boolean(resubmitTarget)}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, asset_id: e.target.value, affected_qty: 1 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white disabled:bg-slate-100"
                  required
                >
                  <option value="">-- Pilih Aset Tersedia --</option>
                  {(resubmitTarget
                    ? projectAssets.filter((a) => a.id === resubmitTarget.asset_id)
                    : reportableAssetsForForm
                  ).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.asset_code} — {a.name} (Tersedia: {a.qty_available} {a.unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!resubmitTarget && reportableAssetsForForm.length === 0 && reportForm.project_id && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Belum ada aset dengan stok tersedia pada proyek ini.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Laporan <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportForm.report_type}
                  disabled={Boolean(resubmitTarget)}
                  onChange={(e) =>
                    setReportForm({
                      ...reportForm,
                      report_type: e.target.value as ProjectAssetReportType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white disabled:bg-slate-100"
                >
                  <option value="Rusak">Rusak</option>
                  <option value="Hilang">Hilang</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jumlah Terdampak <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedAssetForReport?.qty_available || undefined}
                  step={1}
                  value={reportForm.affected_qty}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, affected_qty: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  required
                />
                {selectedAssetForReport && (
                  <p className="text-[10.5px] text-slate-500 mt-0.5">
                    Maks. {selectedAssetForReport.qty_available} {selectedAssetForReport.unit} tersedia
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Kejadian <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={reportForm.incident_date}
                  onChange={(e) => setReportForm({ ...reportForm, incident_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kronologi / Keterangan Kejadian <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reportForm.chronology}
                onChange={(e) => setReportForm({ ...reportForm, chronology: e.target.value })}
                placeholder="Jelaskan penyebab, waktu/lokasi kejadian, dan kondisi terkini aset di lapangan..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {reportForm.report_type === 'Rusak' ? (
                  <>
                    Upload Foto Bukti Kerusakan <span className="text-red-500">* (Wajib)</span>
                  </>
                ) : (
                  'Upload Bukti Pendukung / Foto Kondisi Lokasi (Opsional)'
                )}
              </label>
              <div className="flex items-center gap-3 p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50/70">
                <input
                  ref={reportFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    handleSelectImageFile(
                      e.target.files?.[0] ?? null,
                      setReportPhotoFile,
                      setReportPhotoPreview,
                      setReportFormError
                    )
                  }
                  className="hidden"
                />
                {reportPhotoPreview ? (
                  <img
                    src={reportPhotoPreview}
                    alt="Preview bukti laporan"
                    className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                ) : resubmitTarget?.photo_attachment_id ? (
                  renderPhotoThumbnail(
                    resubmitTarget.photo_attachment_id,
                    resubmitTarget.report_no,
                    'w-16 h-16'
                  )
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reportFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{reportPhotoFile ? 'Ganti Foto' : 'Pilih Foto Bukti'}</span>
                    </button>
                    {reportPhotoFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportPhotoFile(null);
                          setReportPhotoPreview('');
                          if (reportFileInputRef.current) reportFileInputRef.current.value = '';
                        }}
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {reportPhotoFile
                      ? `${reportPhotoFile.name} (${(reportPhotoFile.size / 1024).toFixed(0)} KB)`
                      : resubmitTarget?.photo_name
                      ? `Foto saat ini: ${resubmitTarget.photo_name}`
                      : reportForm.report_type === 'Rusak'
                      ? 'Wajib unggah foto kerusakan (JPG/PNG/WEBP, maks 15 MB)'
                      : 'Foto lokasi / surat kehilangan jika tersedia (JPG/PNG/WEBP)'}
                  </p>
                  {reportSubmitting && reportUploadPct > 0 && (
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-[#1D7AFC] transition-all"
                        style={{ width: `${reportUploadPct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={reportSubmitting || workflowBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#13233C] hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-60"
              >
                {reportSubmitting
                  ? 'Mengirim Laporan...'
                  : resubmitTarget
                  ? 'Kirim Ulang Perbaikan'
                  : 'Kirim Laporan ke Finance'}
              </button>
            </div>
          </form>
        </Modal>

        {/* MODAL: PEMERIKSAAN & TINDAK LANJUT LAPORAN (FINANCE) */}
        <Modal
          open={Boolean(reviewTarget)}
          onClose={() => setReviewTarget(null)}
          title={reviewTarget ? `Pemeriksaan Laporan — ${reviewTarget.report_no}` : 'Pemeriksaan Laporan'}
          subtitle="Jumlah & kondisi aset hanya diperbarui jika pemeriksaan disetujui"
          maxWidth="max-w-lg"
        >
          {reviewTarget && (
            <form onSubmit={handleSubmitReview} className="space-y-4">
              {reviewError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {reviewError}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    {reviewTarget.asset_code} — {reviewTarget.asset_name}
                  </span>
                  <StatusLabel status={reviewTarget.report_type} />
                </div>
                <p className="text-slate-600">
                  Proyek: <strong>{reviewTarget.project_number}</strong> — {reviewTarget.project_name}
                </p>
                <p className="text-slate-600">
                  Dilaporkan: <strong>{reviewTarget.affected_qty} {reviewTarget.unit}</strong> pada{' '}
                  {formatDateID(reviewTarget.incident_date)} oleh {reviewTarget.reported_by_name}
                </p>
                <p className="text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5">
                  {reviewTarget.chronology}
                </p>
                {reviewTarget.photo_attachment_id && (
                  <div className="flex items-center gap-2.5 pt-1">
                    {renderPhotoThumbnail(
                      reviewTarget.photo_attachment_id,
                      `${reviewTarget.report_no} — Foto Bukti`,
                      'w-14 h-14'
                    )}
                    <span className="text-[11px] text-slate-600">
                      Bukti lampiran: {reviewTarget.photo_name || 'Foto Terlampir'} (klik untuk perbesar)
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Pemeriksaan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={reviewForm.status}
                    onChange={(e) =>
                      setReviewForm({
                        ...reviewForm,
                        status: e.target.value as ProjectAssetReportStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="Disetujui">Disetujui</option>
                    <option value="Perlu Perbaikan Data">Perlu Perbaikan Data</option>
                    <option value="Menunggu Pemeriksaan">Menunggu Pemeriksaan</option>
                  </select>
                </div>

                {reviewForm.status === 'Disetujui' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jumlah Terdampak Disetujui ({reviewTarget.unit})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={
                        projectAssets.find((a) => a.id === reviewTarget.asset_id)?.qty_available ||
                        reviewTarget.affected_qty
                      }
                      step={1}
                      value={reviewForm.approved_qty}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, approved_qty: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tindak Lanjut{' '}
                  {reviewForm.status === 'Perlu Perbaikan Data' && (
                    <span className="text-red-500">* (Wajib)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  value={reviewForm.follow_up_note}
                  onChange={(e) => setReviewForm({ ...reviewForm, follow_up_note: e.target.value })}
                  placeholder="Tuliskan hasil verifikasi Finance, alasan perbaikan data, atau tindak lanjut penggantian alat..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required={reviewForm.status === 'Perlu Perbaikan Data'}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={workflowBusy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {workflowBusy ? 'Menyimpan...' : 'Simpan Hasil Pemeriksaan'}
                </button>
              </div>
            </form>
          )}
        </Modal>

        {/* MODAL: LIGHTBOX PREVIEW FOTO */}
        <Modal
          open={Boolean(previewPhotoId)}
          onClose={() => setPreviewPhotoId(null)}
          title={previewPhotoTitle || 'Pratinjau Foto Aset'}
          maxWidth="max-w-2xl"
        >
          {previewPhotoId && (() => {
            const att = getPhotoAttachment(previewPhotoId);
            if (!att) {
              return (
                <p className="py-8 text-center text-xs text-slate-500">
                  Foto tidak ditemukan atau telah diarsipkan.
                </p>
              );
            }
            return (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950/5 max-h-[65vh] flex items-center justify-center">
                  <ProtectedAttachmentImage
                    attachment={att}
                    className="max-h-[62vh] w-auto object-contain mx-auto"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{att.original_name}</span>
                  <span>
                    Diunggah oleh {att.uploaded_by_name} · {formatDateTimeID(att.uploaded_at)}
                  </span>
                </div>
              </div>
            );
          })()}
        </Modal>

        {/* MODAL: KONFIRMASI HAPUS ASET PROYEK (SUPER ADMIN & HEAD) */}
        <Modal
          open={Boolean(deleteTarget)}
          onClose={() => {
            if (!deleteBusy) setDeleteTarget(null);
          }}
          title="Hapus Aset Proyek"
          maxWidth="max-w-sm"
        >
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-slate-800 font-medium">
                Yakin ingin menghapus aset ini?
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                <div className="font-mono font-semibold text-[#1D7AFC]">
                  {deleteTarget.asset_code}
                </div>
                <div className="font-semibold text-slate-900">{deleteTarget.name}</div>
                <div className="text-slate-500">
                  {deleteTarget.project_number} — {deleteTarget.project_name}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deleteBusy || workflowBusy}
                  onClick={handleConfirmDeleteAsset}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {deleteBusy ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Aset Proyek
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pencatatan dan pemantauan aset serta peralatan kerja berdasarkan masing-masing proyek.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMonitoringOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
              <Eye className="w-3.5 h-3.5" />
              <span>Mode Monitoring (Read-Only)</span>
            </span>
          )}
          {canReportIssue && (
            <button
              type="button"
              onClick={() => openReportModal()}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl cursor-pointer whitespace-nowrap"
            >
              <FileWarning className="w-4 h-4" />
              <span>Lapor Kehilangan / Kerusakan</span>
            </button>
          )}
          {canManageAssets && (
            <button
              type="button"
              onClick={openAddAssetModal}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Aset</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip: Total Aset, Tersedia, Rusak, Hilang */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Aset</span>
            <Layers className="w-4 h-4 text-[#1D7AFC]" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {formatNumber(kpiStats.totalQty)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{kpiStats.itemCount} jenis peralatan</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-700 font-medium">Tersedia (Baik)</span>
            <PackageCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-700 tabular-nums mt-1">
            {formatNumber(kpiStats.availableQty)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Siap dipakai di lapangan</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-700 font-medium">Rusak</span>
            <Wrench className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-red-700 tabular-nums mt-1">
            {formatNumber(kpiStats.damagedQty)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Disetujui laporan kerusakan</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-700 font-medium">Hilang</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-700 tabular-nums mt-1">
            {formatNumber(kpiStats.lostQty)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {kpiStats.pendingReports > 0
              ? `${kpiStats.pendingReports} laporan menunggu pemeriksaan`
              : 'Tidak ada laporan pending'}
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('aset')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              activeTab === 'aset'
                ? 'bg-white text-[#13233C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Daftar Aset Proyek</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('laporan')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              activeTab === 'laporan'
                ? 'bg-white text-[#13233C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Laporan Kehilangan & Kerusakan</span>
            {kpiStats.pendingReports > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                {kpiStats.pendingReports}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              activeTab === 'riwayat'
                ? 'bg-white text-[#13233C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat & Monitoring</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama aset, kode, proyek, kategori, atau keterangan..."
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
        >
          <option value="SEMUA">Semua Proyek</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_number} — {p.name}
            </option>
          ))}
        </select>

        {activeTab === 'aset' && (
          <select
            value={conditionFilter}
            onChange={(e) =>
              setConditionFilter(e.target.value as 'SEMUA' | ProjectAssetCondition)
            }
            className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
          >
            <option value="SEMUA">Semua Kondisi</option>
            <option value="Baik">Baik (Tersedia)</option>
            <option value="Rusak">Rusak</option>
            <option value="Hilang">Hilang</option>
          </select>
        )}

        {activeTab === 'laporan' && (
          <>
            <select
              value={reportTypeFilter}
              onChange={(e) =>
                setReportTypeFilter(e.target.value as 'SEMUA' | ProjectAssetReportType)
              }
              className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Jenis Laporan</option>
              <option value="Rusak">Kerusakan (Rusak)</option>
              <option value="Hilang">Kehilangan (Hilang)</option>
            </select>
            <select
              value={reportStatusFilter}
              onChange={(e) =>
                setReportStatusFilter(e.target.value as 'SEMUA' | ProjectAssetReportStatus)
              }
              className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Status Pemeriksaan</option>
              <option value="Menunggu Pemeriksaan">Menunggu Pemeriksaan</option>
              <option value="Disetujui">Disetujui</option>
              <option value="Perlu Perbaikan Data">Perlu Perbaikan Data</option>
            </select>
          </>
        )}

        {activeTab === 'riwayat' && (
          <select
            value={historyActionFilter}
            onChange={(e) =>
              setHistoryActionFilter(e.target.value as 'SEMUA' | ProjectAssetHistoryAction)
            }
            className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
          >
            <option value="SEMUA">Semua Aktivitas</option>
            <option value="Penambahan Aset">Penambahan Aset</option>
            <option value="Pembaruan Aset">Pembaruan Aset</option>
            <option value="Laporan Kerusakan">Laporan Kerusakan</option>
            <option value="Laporan Kehilangan">Laporan Kehilangan</option>
            <option value="Pemeriksaan Disetujui">Pemeriksaan Disetujui</option>
            <option value="Perlu Perbaikan Data">Perlu Perbaikan Data</option>
            <option value="Perubahan Kondisi">Perubahan Kondisi</option>
          </select>
        )}
      </div>

      {/* TAB 1: DAFTAR ASET PROYEK */}
      {activeTab === 'aset' && (
        <div className="space-y-4">
          {/* Ringkasan Per Proyek (Quick Filter Cards) */}
          {projectFilter === 'SEMUA' && projectSummaryRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {projectSummaryRows.map((row) => (
                <button
                  key={row.project.id}
                  type="button"
                  onClick={() => setProjectFilter(row.project.id)}
                  className="text-left bg-white border border-slate-200/90 hover:border-[#1D7AFC] rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#1D7AFC]">
                      {row.project.project_number}
                    </span>
                    {row.pendingCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
                        {row.pendingCount} laporan baru
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1 line-clamp-1">
                    {row.project.name}
                  </p>
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Total</span>
                      <span className="font-mono font-bold text-slate-900">{row.totalQty}</span>
                    </div>
                    <div>
                      <span className="text-emerald-700 block">Tersedia</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {row.availableQty}
                      </span>
                    </div>
                    <div>
                      <span className="text-red-700 block">Rusak</span>
                      <span className="font-mono font-bold text-red-700">{row.damagedQty}</span>
                    </div>
                    <div>
                      <span className="text-rose-700 block">Hilang</span>
                      <span className="font-mono font-bold text-rose-700">{row.lostQty}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Main Project Assets Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
            {filteredAssets.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="Belum ada aset proyek sesuai filter"
                  description="Gunakan tombol Tambah Aset (Divisi Finance) atau ubah filter proyek / kondisi."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Foto & Aset</th>
                      <th className="py-3 px-4 font-semibold">Proyek</th>
                      <th className="py-3 px-4 font-semibold text-right">Total</th>
                      <th className="py-3 px-4 font-semibold text-right">Tersedia</th>
                      <th className="py-3 px-4 font-semibold text-right">Rusak</th>
                      <th className="py-3 px-4 font-semibold text-right">Hilang</th>
                      <th className="py-3 px-4 font-semibold">Kondisi</th>
                      <th className="py-3 px-4 font-semibold">Tgl Catat & Keterangan</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssets.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {renderPhotoThumbnail(a.photo_attachment_id, `${a.asset_code} — ${a.name}`)}
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] font-semibold text-[#1D7AFC]">
                                {a.asset_code}
                              </div>
                              <div className="font-semibold text-slate-900">{a.name}</div>
                              <div className="text-[11px] text-slate-500">{a.category}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-800">
                            {a.project_number}
                          </div>
                          <div className="text-slate-500 max-w-[200px] truncate">{a.project_name}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatNumber(a.qty_total)} {a.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatNumber(a.qty_available)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-red-700 tabular-nums">
                          {formatNumber(a.qty_damaged)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                          {formatNumber(a.qty_lost)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusLabel status={a.condition} />
                        </td>
                        <td className="py-3 px-4 max-w-[220px]">
                          <div className="text-slate-700 font-medium tabular-nums">
                            {formatDateID(a.recorded_date)}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-2">{a.notes || '-'}</div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedAssetId(a.id)}
                              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                            >
                              Detail
                            </button>
                            {canManageAssets && (
                              <button
                                type="button"
                                onClick={() => openEditAssetModal(a)}
                                className="px-2.5 py-1.5 text-[11px] font-semibold text-[#1D7AFC] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer"
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteAsset && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(a)}
                                className="px-2.5 py-1.5 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer"
                              >
                                Hapus
                              </button>
                            )}
                            {canReportIssue && a.qty_available > 0 && (
                              <button
                                type="button"
                                onClick={() => openReportModal(a)}
                                className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer"
                              >
                                Lapor
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LAPORAN KEHILANGAN & KERUSAKAN */}
      {activeTab === 'laporan' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
          {filteredReports.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Belum ada laporan kehilangan atau kerusakan"
                description="Tim Lapangan dapat melaporkan kerusakan atau kehilangan peralatan melalui tombol Lapor Kehilangan / Kerusakan."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Bukti & No. Laporan</th>
                    <th className="py-3 px-4 font-semibold">Proyek & Aset</th>
                    <th className="py-3 px-4 font-semibold">Jenis & Qty</th>
                    <th className="py-3 px-4 font-semibold">Kronologi & Pelapor</th>
                    <th className="py-3 px-4 font-semibold">Status Pemeriksaan</th>
                    <th className="py-3 px-4 font-semibold">Tindak Lanjut Finance</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {renderPhotoThumbnail(r.photo_attachment_id, `${r.report_no} — Bukti`)}
                          <div>
                            <div className="font-mono font-semibold text-[#1D7AFC]">
                              {r.report_no}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              Kejadian: {formatDateID(r.incident_date)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-800">
                          {r.project_number}
                        </div>
                        <div className="font-semibold text-slate-900">{r.asset_name}</div>
                        <div className="text-[11px] text-slate-500">{r.asset_code}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusLabel status={r.report_type} />
                        <div className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                          {formatNumber(r.affected_qty)} {r.unit}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <p className="text-slate-800 line-clamp-2">{r.chronology}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Pelapor: {r.reported_by_name}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={r.status} />
                        {r.reviewed_at && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            Oleh {r.reviewed_by_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-[220px]">
                        <span className="text-slate-700">{r.follow_up_note || '-'}</span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canReviewReports && !r.applied_to_asset && (
                            <button
                              type="button"
                              onClick={() => openReviewModal(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-[#13233C] hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Periksa</span>
                            </button>
                          )}
                          {canReportIssue && r.status === 'Perlu Perbaikan Data' && (
                            <button
                              type="button"
                              onClick={() => openResubmitModal(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg cursor-pointer"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Perbaiki</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedAssetId(r.asset_id)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                          >
                            Lihat Aset
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RIWAYAT & MONITORING */}
      {activeTab === 'riwayat' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
          {filteredHistories.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Belum ada riwayat perubahan aset proyek"
                description="Semua penambahan aset, perubahan kondisi, pelaporan, dan hasil pemeriksaan akan tercatat di sini."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Waktu</th>
                    <th className="py-3 px-4 font-semibold">Proyek & Aset</th>
                    <th className="py-3 px-4 font-semibold">Aktivitas</th>
                    <th className="py-3 px-4 font-semibold text-center">Perubahan Qty</th>
                    <th className="py-3 px-4 font-semibold">Keterangan</th>
                    <th className="py-3 px-4 font-semibold">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistories.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTimeID(h.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-[#1D7AFC]">
                          {h.project_number} · {h.asset_code}
                        </div>
                        <div className="font-semibold text-slate-900">{h.asset_name}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {h.action_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] tabular-nums whitespace-nowrap">
                        {h.qty_change_available === 0 &&
                        h.qty_change_damaged === 0 &&
                        h.qty_change_lost === 0 ? (
                          <span className="text-slate-400">Tidak berubah</span>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-1">
                            {h.qty_change_available !== 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  h.qty_change_available > 0
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                Tersedia {h.qty_change_available > 0 ? '+' : ''}
                                {h.qty_change_available}
                              </span>
                            )}
                            {h.qty_change_damaged !== 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                                Rusak {h.qty_change_damaged > 0 ? '+' : ''}
                                {h.qty_change_damaged}
                              </span>
                            )}
                            {h.qty_change_lost !== 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
                                Hilang {h.qty_change_lost > 0 ? '+' : ''}
                                {h.qty_change_lost}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-[300px]">
                        <div className="flex items-start gap-2">
                          {h.attachment_id &&
                            renderPhotoThumbnail(h.attachment_id, `${h.asset_name} — Lampiran`, 'w-9 h-9')}
                          <span className="text-slate-700">{h.description}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{h.actor_name}</div>
                        <div className="text-[11px] text-slate-500">{h.actor_role}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {renderModals()}
    </div>
  );
};
