import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Edit3,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  Lock,
  MapPin,
  Package,
  Paperclip,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import {
  BudgetItem,
  InternalDocument,
  Project,
  ProjectMaterialItem,
  ProjectStatus,
  ProjectSubmenuKey,
  ProjectWorkType,
  WorkItem,
} from '../../types/pms';
import { AttachmentCategory } from '../../types/attachment';
import {
  computeTermPaymentRealization,
  formatDateID,
  formatDateTimeID,
  formatNumber,
  formatRupiah,
  getWorkflowStageMeta,
} from '../../utils/format';
import {
  canAccessTeknikModule,
  canDeleteProjectWorkOrMaterial,
  canEditRAB,
  canManageProjects,
  canRestoreArchivedData,
  MANAGEMENT_PROYEK_SUBMENUS,
} from '../../utils/permissions';
import {
  ConfirmDialog,
  EmptyState,
  FallbackImage,
  Modal,
  PaginationBar,
  SearchInput,
  StatusLabel,
} from '../ui/CommonUI';
import { isStaticSamplePhotoUrl, useAttachments } from '../../context/AttachmentContext';
import { formatFileSize } from '../../services/attachmentApi';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ProtectedAttachmentImage } from '../attachments/ProtectedAttachmentImage';
import { ProjectWorkflowPanel } from '../workflow/ProjectWorkflowPanel';
import { PdfPreviewModal } from '../ui/PdfPreviewModal';
import { ProjectPhotoDocsSection } from './proyek/ProjectPhotoDocsSection';

type DetailTab =
  | 'ringkasan'
  | 'workflow'
  | 'pekerjaan'
  | 'kontrak'
  | 'rab'
  | 'material'
  | 'keuangan'
  | 'dokumen'
  | 'lampiran';

const PROJECT_DOC_CATEGORIES: AttachmentCategory[] = [
  'SPK',
  'RAB',
  'Gambar Bangunan',
  'Surat',
  'Foto Kondisi Awal',
  'Foto Lapangan',
  'Foto Selesai / BAST',
  'Dokumen Lainnya',
];

const COMMON_BUILDING_MATERIALS: { name: string; unit: string; defaultPrice: number }[] = [
  { name: 'Semen', unit: 'Zak', defaultPrice: 72000 },
  { name: 'Pasir', unit: 'm3', defaultPrice: 320000 },
  { name: 'Batu Split', unit: 'm3', defaultPrice: 360000 },
  { name: 'Bata Merah', unit: 'Buah', defaultPrice: 1100 },
  { name: 'Hebel', unit: 'm3', defaultPrice: 680000 },
  { name: 'Besi Beton', unit: 'Batang', defaultPrice: 98000 },
  { name: 'Keramik', unit: 'Dus', defaultPrice: 78000 },
  { name: 'Cat', unit: 'Pail', defaultPrice: 620000 },
  { name: 'Kayu', unit: 'Batang', defaultPrice: 85000 },
  { name: 'Pipa PVC', unit: 'Batang', defaultPrice: 65000 },
  { name: 'Kabel Listrik', unit: 'Roll', defaultPrice: 410000 },
];

const MATERIAL_UNIT_OPTIONS = ['Zak', 'm3', 'Buah', 'Batang', 'Dus', 'Pail', 'Roll', 'Kg', 'Lembar', 'Set', 'Unit'];

const SUPPORTED_PROJECT_UPLOAD_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];
const PREVIEWABLE_EXTS = new Set(['jpg', 'jpeg', 'png', 'pdf']);

interface QueuedDocFile {
  id: string;
  file: File;
  extension: string;
  category: AttachmentCategory;
  description: string;
  previewUrl?: string;
  status: 'Menunggu' | 'Mengunggah' | 'Berhasil' | 'Gagal';
  progress: number;
  error?: string;
  uploadedAttachmentId?: string;
}

type DeleteTarget =
  | { kind: 'project'; item: Project }
  | { kind: 'rab'; item: BudgetItem }
  | { kind: 'material'; item: ProjectMaterialItem }
  | { kind: 'work'; item: WorkItem }
  | { kind: 'doc'; item: InternalDocument };

export const ProyekModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    isOnline,
    showToast,
    projectSubmenu,
    setProjectSubmenu,
    selectedProjectId,
    setSelectedProjectId,
    setSelectedDocumentId,
    setActiveModule,
    createProjectApi,
    updateProjectApi,
    softDeleteProject,
    restoreProject,
    addBudgetItem,
    updateBudgetItem,
    softDeleteBudgetItem,
    restoreBudgetItem,
    addProjectMaterial,
    updateProjectMaterial,
    softDeleteProjectMaterial,
    restoreProjectMaterial,
    softDeleteWorkItem,
    restoreWorkItem,
    softDeleteDocument,
    restoreDocument,
  } = usePMS();
  const { getAttachmentsFor, getLatestPhotoFor, uploadFiles, uploadConfig } = useAttachments();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('SEMUA');
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('SEMUA');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'progress'>('name');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('ringkasan');

  // Archive visibility toggles
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [showArchivedRab, setShowArchivedRab] = useState(false);
  const [showArchivedMaterials, setShowArchivedMaterials] = useState(false);
  const [showArchivedWorks, setShowArchivedWorks] = useState(false);
  const [showArchivedDocs, setShowArchivedDocs] = useState(false);

  // Confirm soft-delete modal target
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Queued supporting documents in Tambah Proyek form (multi-file upload)
  const [queuedDocs, setQueuedDocs] = useState<QueuedDocFile[]>([]);
  const [queuedCategory, setQueuedCategory] = useState<AttachmentCategory>('SPK');
  const [queuedDesc, setQueuedDesc] = useState('');
  const [isDraggingCreateDocs, setIsDraggingCreateDocs] = useState(false);
  const [docQueueError, setDocQueueError] = useState('');
  const [previewQueuedDoc, setPreviewQueuedDoc] = useState<QueuedDocFile | null>(null);
  const [previewQueuedBytes, setPreviewQueuedBytes] = useState<Uint8Array | null>(null);
  const [createdDraftProject, setCreatedDraftProject] = useState<Project | null>(null);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [projectSaveError, setProjectSaveError] = useState('');
  const createFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!previewQueuedDoc) {
      setPreviewQueuedBytes(null);
      return;
    }
    let cancelled = false;
    previewQueuedDoc.file
      .arrayBuffer()
      .then((buf) => {
        if (!cancelled) setPreviewQueuedBytes(new Uint8Array(buf));
      })
      .catch(() => {
        if (!cancelled) setPreviewQueuedBytes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [previewQueuedDoc]);

  // Inline / Modal RAB CRUD state
  const [inlineRabCat, setInlineRabCat] = useState('Pekerjaan Struktur');
  const [inlineRabName, setInlineRabName] = useState('');
  const [inlineRabVol, setInlineRabVol] = useState(10);
  const [inlineRabUnit, setInlineRabUnit] = useState('m3');
  const [inlineRabPrice, setInlineRabPrice] = useState(850000);
  const [inlineRabNotes, setInlineRabNotes] = useState('');
  const [editingRab, setEditingRab] = useState<BudgetItem | null>(null);
  const [viewingRab, setViewingRab] = useState<BudgetItem | null>(null);

  // Inline / Modal Bahan Bangunan CRUD state
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('Zak');
  const [matVol, setMatVol] = useState(20);
  const [matPrice, setMatPrice] = useState(72000);
  const [matNotes, setMatNotes] = useState('');
  const [editingMat, setEditingMat] = useState<ProjectMaterialItem | null>(null);
  const [viewingMat, setViewingMat] = useState<ProjectMaterialItem | null>(null);

  // Detail modal for WorkItem
  const [viewingWork, setViewingWork] = useState<WorkItem | null>(null);

  const canManage =
    currentRole && currentDivision
      ? canManageProjects(currentRole.code, currentDivision.code)
      : false;
  const allowEditRab =
    currentRole && currentDivision ? canEditRAB(currentRole.code, currentDivision.code) : false;
  const allowTeknikAccess =
    currentRole && currentDivision
      ? canAccessTeknikModule(currentRole.code, currentDivision.code)
      : false;
  const allowDeleteWork =
    currentRole && currentDivision
      ? canDeleteProjectWorkOrMaterial(currentRole.code, currentDivision.code)
      : false;
  const canRestore = currentRole ? canRestoreArchivedData(currentRole.code) : false;

  const generateNextProjectCode = () => {
    const maxNum = state.projects.reduce((max, p) => {
      const m = p.project_number.match(/(\d+)$/);
      const n = m ? Number(m[1]) : 0;
      return n > max ? n : max;
    }, 0);
    return `PRJ-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const getDefaultFormState = () => ({
    project_number: generateNextProjectCode(),
    name: '',
    client_name: '',
    work_type: 'Pembangunan' as ProjectWorkType,
    location: '',
    pic_employee_id:
      state.employees.find((e) => e.division_id === 'div-teknik' && e.status === 'Aktif')?.id ??
      state.employees[0]?.id ??
      '',
    division_ids: ['div-teknik', 'div-logistik', 'div-finance'],
    start_date: new Date().toISOString().slice(0, 10),
    target_end_date: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
    status: 'Perencanaan' as ProjectStatus,
    contract_value: 250000000,
    progress_percent: 0,
    image_url: '',
    description: '',
  });

  const [formState, setFormState] = useState(getDefaultFormState);

  const clearQueuedDocs = () => {
    setQueuedDocs((prev) => {
      prev.forEach((d) => {
        if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      });
      return [];
    });
    setDocQueueError('');
    setPreviewQueuedDoc(null);
  };

  useEffect(() => {
    return () => {
      queuedDocs.forEach((d) => {
        if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      });
    };
    // cleanup object URLs only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setCreatedDraftProject(null);
    setProjectSaveError('');
    setFormState(getDefaultFormState());
    clearQueuedDocs();
    setProjectSubmenu('tambah');
    setSelectedProjectId(null);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setProjectSaveError('');
    setFormState({
      project_number: p.project_number,
      name: p.name,
      client_name: p.client_name,
      work_type: p.work_type ?? 'Pembangunan',
      location: p.location,
      pic_employee_id: p.pic_employee_id,
      division_ids: p.division_ids,
      start_date: p.start_date,
      target_end_date: p.target_end_date,
      status: p.status,
      contract_value: p.contract_value,
      progress_percent: p.progress_percent,
      image_url: p.image_url,
      description: p.description,
    });
    setFormOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingProject) return;
    setSubmittingProject(true);
    setProjectSaveError('');
    try {
      if (editing) {
        const res = await updateProjectApi({ ...editing, ...formState });
        if (!res.ok) {
          setProjectSaveError(res.message);
          return;
        }
      } else {
        const res = await createProjectApi(formState);
        if (!res.ok) {
          setProjectSaveError(res.message);
          return;
        }
      }
      setFormOpen(false);
    } finally {
      setSubmittingProject(false);
    }
  };

  const addFilesToQueue = (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    setDocQueueError('');

    const maxBytes = (uploadConfig.maxFileSizeMb || 15) * 1024 * 1024;
    const rejectedMessages: string[] = [];
    const accepted: QueuedDocFile[] = [];

    for (const file of Array.from(fileList)) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ext || !SUPPORTED_PROJECT_UPLOAD_EXTS.includes(ext)) {
        rejectedMessages.push(
          `"${file.name}": format .${ext || '?'} tidak didukung (gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG).`
        );
        continue;
      }
      if (file.size === 0) {
        rejectedMessages.push(`"${file.name}": file kosong (0 byte).`);
        continue;
      }
      if (file.size > maxBytes) {
        rejectedMessages.push(
          `"${file.name}": ukuran ${formatFileSize(file.size)} melebihi batas maksimal ${uploadConfig.maxFileSizeMb || 15} MB.`
        );
        continue;
      }

      const duplicate = queuedDocs.some(
        (existing) =>
          existing.file.name === file.name &&
          existing.file.size === file.size &&
          existing.file.lastModified === file.lastModified
      );
      if (duplicate) {
        rejectedMessages.push(`"${file.name}": file sudah ada dalam daftar upload.`);
        continue;
      }

      const previewUrl = PREVIEWABLE_EXTS.has(ext) ? URL.createObjectURL(file) : undefined;
      accepted.push({
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        extension: ext,
        category: queuedCategory,
        description: queuedDesc.trim(),
        previewUrl,
        status: 'Menunggu',
        progress: 0,
      });
    }

    if (accepted.length > 0) {
      setQueuedDocs((prev) => [...prev, ...accepted]);
      setQueuedDesc('');
    }

    if (rejectedMessages.length > 0) {
      setDocQueueError(rejectedMessages.join(' '));
    }
  };

  const removeQueuedDoc = (docId: string) => {
    setQueuedDocs((prev) => {
      const target = prev.find((d) => d.id === docId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== docId);
    });
  };

  const uploadSingleQueuedDoc = async (doc: QueuedDocFile, project: Project): Promise<boolean> => {
    if (!isOnline) {
      setQueuedDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                status: 'Gagal',
                error: 'Mode Offline aktif — nonaktifkan simulasi offline atau sambungkan internet.',
              }
            : d
        )
      );
      return false;
    }

    setQueuedDocs((prev) =>
      prev.map((d) =>
        d.id === doc.id ? { ...d, status: 'Mengunggah', progress: 5, error: undefined } : d
      )
    );

    try {
      const created = await uploadFiles({
        files: [doc.file],
        module_id: 'proyek',
        entity_id: project.id,
        entity_label: `${project.project_number} — ${project.name}`,
        doc_category: doc.category,
        description: doc.description || `Dokumen awal proyek ${project.project_number}`,
        onProgress: (pct) => {
          setQueuedDocs((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, progress: pct } : d))
          );
        },
      });
      setQueuedDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                status: 'Berhasil',
                progress: 100,
                error: undefined,
                uploadedAttachmentId: created[0]?.id,
              }
            : d
        )
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengunggah dokumen.';
      setQueuedDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: 'Gagal', error: message } : d))
      );
      return false;
    }
  };

  const finalizeAndOpenCreatedProject = (project: Project) => {
    clearQueuedDocs();
    setCreatedDraftProject(null);
    setFormState(getDefaultFormState());
    setDetailTab('ringkasan');
    setSelectedProjectId(project.id);
    setProjectSubmenu('daftar');
  };

  const handleRetrySingleQueuedDoc = async (doc: QueuedDocFile) => {
    if (!createdDraftProject || submittingProject) return;
    setSubmittingProject(true);
    try {
      await uploadSingleQueuedDoc(doc, createdDraftProject);
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingProject) return;
    setSubmittingProject(true);
    setDocQueueError('');
    setProjectSaveError('');

    try {
      let targetProject = createdDraftProject;
      if (!targetProject) {
        const createRes = await createProjectApi(formState);
        if (!createRes.ok || !createRes.project) {
          setProjectSaveError(createRes.message || 'Gagal menyimpan proyek baru ke server.');
          return;
        }
        targetProject = createRes.project;
        setCreatedDraftProject(targetProject);
      }

      const docsToUpload = queuedDocs.filter(
        (q) => q.status === 'Menunggu' || q.status === 'Gagal'
      );

      if (docsToUpload.length === 0) {
        finalizeAndOpenCreatedProject(targetProject);
        return;
      }

      let failedCount = 0;
      let successCount = 0;
      for (const doc of docsToUpload) {
        const ok = await uploadSingleQueuedDoc(doc, targetProject);
        if (ok) {
          successCount += 1;
        } else {
          failedCount += 1;
        }
      }

      if (failedCount === 0) {
        showToast(
          `Proyek ${targetProject.project_number} & ${successCount} dokumen pendukung berhasil disimpan.`
        );
        finalizeAndOpenCreatedProject(targetProject);
      } else {
        showToast(
          `Proyek ${targetProject.project_number} tersimpan. ${successCount} file berhasil, ${failedCount} file gagal — silakan klik Unggah Ulang pada file yang gagal.`
        );
      }
    } finally {
      setSubmittingProject(false);
    }
  };

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const archivedProjects = useMemo(
    () => state.projects.filter((p) => Boolean(p.is_deleted)),
    [state.projects]
  );

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProjects
      .filter((p) => {
        if (statusFilter !== 'SEMUA' && p.status !== statusFilter) return false;
        if (workTypeFilter !== 'SEMUA' && (p.work_type ?? 'Pembangunan') !== workTypeFilter) {
          return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.project_number.toLowerCase().includes(q) ||
          p.client_name.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'value') return b.contract_value - a.contract_value;
        if (sortBy === 'progress') return b.progress_percent - a.progress_percent;
        return a.project_number.localeCompare(b.project_number);
      });
  }, [activeProjects, search, statusFilter, workTypeFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const paginated = filteredProjects.slice((page - 1) * pageSize, page * pageSize);

  const selectedProject =
    activeProjects.find((p) => p.id === selectedProjectId) ?? null;
  const activeContextProject = selectedProject ?? activeProjects[0] ?? null;

  const switchSubmenu = (key: ProjectSubmenuKey) => {
    setProjectSubmenu(key);
    if (key === 'daftar' || key === 'tambah') {
      setSelectedProjectId(null);
      if (key === 'tambah') {
        setEditing(null);
        setCreatedDraftProject(null);
        setFormState(getDefaultFormState());
        clearQueuedDocs();
      }
    } else if ((!selectedProjectId || !activeProjects.some((p) => p.id === selectedProjectId)) && activeProjects[0]) {
      setSelectedProjectId(activeProjects[0].id);
    }
  };

  // Relation summary builder for safe soft-delete dialog
  const getDeleteDialogMeta = (target: DeleteTarget | null) => {
    if (!target) {
      return { title: '', description: '', confirmLabel: 'Arsipkan / Hapus' };
    }
    if (target.kind === 'project') {
      const p = target.item;
      const contractsCount = state.contracts.filter((c) => !c.is_deleted && c.project_id === p.id).length;
      const financesCount = state.financialTransactions.filter((f) => f.project_id === p.id).length;
      const matReqCount = state.materialRequests.filter((m) => m.project_id === p.id).length;
      const matTxCount = state.materialTransactions.filter((t) => t.project_id === p.id).length;
      const rabCount = state.budgets.filter((b) => b.project_id === p.id && !b.is_deleted).length;
      const worksCount = state.workItems.filter((w) => w.project_id === p.id && !w.is_deleted).length;
      const approvalsCount = state.approvals.filter(
        (a) => a.entity_id === p.id || a.reference_no.includes(p.project_number)
      ).length;

      const relations: string[] = [];
      if (contractsCount > 0) relations.push(`${contractsCount} kontrak`);
      if (financesCount > 0) relations.push(`${financesCount} transaksi keuangan`);
      if (matReqCount + matTxCount > 0) {
        relations.push(`${matReqCount} SPM & ${matTxCount} mutasi stok`);
      }
      if (rabCount > 0) relations.push(`${rabCount} item RAB`);
      if (worksCount > 0) relations.push(`${worksCount} progres pekerjaan`);
      if (approvalsCount > 0) relations.push(`${approvalsCount} riwayat persetujuan`);

      const relNotice =
        relations.length > 0
          ? `Proyek ini terhubung dengan ${relations.join(', ')}. Sistem menggunakan Arsip Aman (Soft Delete) sehingga riwayat transaksi keuangan, kontrak, stok gudang, dan persetujuan TIDAK akan hilang dan dapat dipulihkan admin.`
          : 'Proyek ini akan diarsipkan (Soft Delete) dan tidak ditampilkan pada daftar aktif, namun tetap dapat dipulihkan oleh admin.';

      return {
        title: `Arsipkan / Hapus Proyek "${p.project_number} — ${p.name}"?`,
        description: `Data yang akan dihapus: ${p.project_number} — ${p.name} (${p.client_name}). ${relNotice}`,
        confirmLabel: 'Arsipkan Proyek',
      };
    }

    if (target.kind === 'rab') {
      const b = target.item;
      const linkedWorks = state.workItems.filter(
        (w) => w.budget_id === b.id && !w.is_deleted
      ).length;
      const linkedTx = state.financialTransactions.filter((f) => f.budget_id === b.id).length;
      const rel =
        linkedWorks > 0 || linkedTx > 0
          ? `Item RAB ini memiliki relasi ke ${linkedWorks} item pekerjaan dan ${linkedTx} transaksi keuangan. Riwayat transaksi keuangan tetap aman karena menggunakan arsip (Soft Delete).`
          : 'Item RAB akan dipindahkan ke Arsip RAB dan dapat dipulihkan kembali oleh admin.';
      return {
        title: `Hapus Item RAB "${b.work_item_name}"?`,
        description: `Data yang akan dihapus: ${b.work_item_name} (${formatRupiah(b.total_cost)}). ${rel}`,
        confirmLabel: 'Arsipkan Item RAB',
      };
    }

    if (target.kind === 'material') {
      const m = target.item;
      return {
        title: `Hapus Kebutuhan Bahan "${m.material_name}"?`,
        description: `Data yang akan dihapus: ${m.material_name} (${formatNumber(m.volume)} ${m.unit}, nilai ${formatRupiah(m.total_price)}). Item akan diarsipkan secara aman tanpa mengubah mutasi stok gudang logistik dan dapat dipulihkan admin.`,
        confirmLabel: 'Arsipkan Bahan',
      };
    }

    if (target.kind === 'work') {
      const w = target.item;
      return {
        title: `Hapus Progres Pekerjaan "${w.title}"?`,
        description: `Data yang akan dihapus: ${w.title} (Progres ${w.overall_progress}%). Progres akan diarsipkan (Soft Delete) tanpa menghapus riwayat RAB/keuangan dan dapat dipulihkan oleh admin.`,
        confirmLabel: 'Arsipkan Pekerjaan',
      };
    }

    const d = target.item;
    return {
      title: `Hapus Surat / Dokumen "${d.doc_number} — ${d.title}"?`,
      description: `Data yang akan dihapus: ${d.doc_number} — ${d.title} (Status: ${d.status}). Dokumen akan diarsipkan tanpa menghapus riwayat persetujuan dan dapat dipulihkan oleh admin.`,
      confirmLabel: 'Arsipkan Dokumen',
    };
  };

  const handleConfirmDelete = (reason: string) => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'project') {
      softDeleteProject(deleteTarget.item.id, reason);
    } else if (deleteTarget.kind === 'rab') {
      softDeleteBudgetItem(deleteTarget.item.id, reason);
    } else if (deleteTarget.kind === 'material') {
      softDeleteProjectMaterial(deleteTarget.item.id, reason);
    } else if (deleteTarget.kind === 'work') {
      softDeleteWorkItem(deleteTarget.item.id, reason);
    } else if (deleteTarget.kind === 'doc') {
      softDeleteDocument(deleteTarget.item.id, reason);
    }
    setDeleteTarget(null);
  };

  const dialogMeta = getDeleteDialogMeta(deleteTarget);

  // Common modals rendered across views
  const renderSharedDialogs = () => (
    <>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={dialogMeta.title}
        description={dialogMeta.description}
        confirmLabel={dialogMeta.confirmLabel}
        danger
        requireNote
        noteLabel="Alasan Penghapusan / Pengarsipan (Tercatat di Log Audit)"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Detail & Edit RAB Modal */}
      <Modal
        open={Boolean(viewingRab)}
        onClose={() => setViewingRab(null)}
        title="Detail Item RAB"
        subtitle={viewingRab?.category}
        maxWidth="max-w-lg"
      >
        {viewingRab && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Uraian Pekerjaan</span>
              <span className="text-sm font-bold text-slate-900">{viewingRab.work_item_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Volume & Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatNumber(viewingRab.volume)} {viewingRab.unit}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Harga Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatRupiah(viewingRab.unit_price)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Total Harga</span>
                <span className="font-mono font-bold text-[#1D7AFC]">
                  {formatRupiah(viewingRab.total_cost)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Realisasi Lapangan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatNumber(viewingRab.actual_qty)} / {formatNumber(viewingRab.target_qty)} {viewingRab.unit}
                </span>
              </div>
            </div>
            {viewingRab.notes && (
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Keterangan</span>
                <p className="text-slate-800 mt-0.5">{viewingRab.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editingRab)}
        onClose={() => setEditingRab(null)}
        title="Edit Item RAB"
        subtitle={editingRab?.work_item_name}
        maxWidth="max-w-lg"
      >
        {editingRab && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateBudgetItem({
                ...editingRab,
                total_cost: Number(editingRab.volume) * Number(editingRab.unit_price),
                target_qty: Number(editingRab.volume),
              });
              setEditingRab(null);
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kategori Pekerjaan</label>
              <input
                type="text"
                value={editingRab.category}
                onChange={(e) => setEditingRab({ ...editingRab, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Uraian Item RAB</label>
              <input
                type="text"
                value={editingRab.work_item_name}
                onChange={(e) => setEditingRab({ ...editingRab, work_item_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Volume</label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={editingRab.volume}
                  onChange={(e) => setEditingRab({ ...editingRab, volume: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Satuan</label>
                <input
                  type="text"
                  value={editingRab.unit}
                  onChange={(e) => setEditingRab({ ...editingRab, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Harga Satuan (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={editingRab.unit_price}
                  onChange={(e) =>
                    setEditingRab({ ...editingRab, unit_price: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  required
                />
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between">
              <span className="font-semibold text-slate-700">Total Harga Otomatis</span>
              <span className="font-mono font-bold text-[#1D7AFC]">
                {formatRupiah(Number(editingRab.volume || 0) * Number(editingRab.unit_price || 0))}
              </span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={editingRab.notes ?? ''}
                onChange={(e) => setEditingRab({ ...editingRab, notes: e.target.value })}
                placeholder="Catatan tambahan (opsional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRab(null)}
                className="px-4 py-2 font-semibold text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-semibold text-white bg-[#1D7AFC] rounded-lg cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Detail & Edit Bahan Bangunan Modal */}
      <Modal
        open={Boolean(viewingMat)}
        onClose={() => setViewingMat(null)}
        title="Detail Kebutuhan Bahan Bangunan"
        subtitle={viewingMat?.material_name}
        maxWidth="max-w-md"
      >
        {viewingMat && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Nama Bahan Bangunan</span>
              <span className="text-sm font-bold text-slate-900">{viewingMat.material_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Volume & Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatNumber(viewingMat.volume)} {viewingMat.unit}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Harga Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatRupiah(viewingMat.unit_price)}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
              <span className="font-semibold text-slate-700">Total Anggaran Bahan</span>
              <span className="font-mono font-bold text-[#1D7AFC] text-sm">
                {formatRupiah(viewingMat.total_price)}
              </span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 block">Keterangan</span>
              <p className="text-slate-800 mt-0.5">{viewingMat.notes || '-'}</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editingMat)}
        onClose={() => setEditingMat(null)}
        title="Edit Kebutuhan Bahan Bangunan"
        subtitle={editingMat?.material_name}
        maxWidth="max-w-md"
      >
        {editingMat && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProjectMaterial(editingMat);
              setEditingMat(null);
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Bahan Bangunan</label>
              <input
                type="text"
                value={editingMat.material_name}
                onChange={(e) =>
                  setEditingMat({ ...editingMat, material_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Satuan</label>
                <input
                  type="text"
                  value={editingMat.unit}
                  onChange={(e) => setEditingMat({ ...editingMat, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Volume</label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={editingMat.volume}
                  onChange={(e) => setEditingMat({ ...editingMat, volume: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Harga Satuan</label>
                <input
                  type="number"
                  min={0}
                  value={editingMat.unit_price}
                  onChange={(e) =>
                    setEditingMat({ ...editingMat, unit_price: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  required
                />
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between">
              <span className="font-semibold text-slate-700">Total Harga Otomatis</span>
              <span className="font-mono font-bold text-[#1D7AFC]">
                {formatRupiah(Number(editingMat.volume || 0) * Number(editingMat.unit_price || 0))}
              </span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={editingMat.notes}
                onChange={(e) => setEditingMat({ ...editingMat, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingMat(null)}
                className="px-4 py-2 font-semibold text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-semibold text-white bg-[#1D7AFC] rounded-lg cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Detail Pekerjaan Teknik Modal */}
      <Modal
        open={Boolean(viewingWork)}
        onClose={() => setViewingWork(null)}
        title="Detail Progres Pekerjaan"
        subtitle={viewingWork?.title}
        maxWidth="max-w-lg"
      >
        {viewingWork && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <StatusLabel status={viewingWork.status} />
              <span className="font-mono font-bold text-[#1D7AFC] text-sm">
                Progres: {viewingWork.overall_progress}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Periode</span>
                <span className="font-semibold text-slate-900">
                  {formatDateID(viewingWork.start_date)} – {formatDateID(viewingWork.due_date)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">PIC Pekerjaan</span>
                <span className="font-semibold text-slate-900">
                  {state.employees.find((e) => e.id === viewingWork.pic_employee_id)?.full_name ?? '-'}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 block">Kendala Lapangan</span>
              <p className="text-slate-800 mt-0.5">{viewingWork.constraints || '-'}</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 block">Tindak Lanjut</span>
              <p className="text-slate-800 mt-0.5">{viewingWork.follow_up || '-'}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Data Proyek' : 'Tambah Proyek Baru'}
        subtitle="Lengkapi informasi proyek, jenis pekerjaan, instansi pemberi kerja, dan nilai kontrak"
      >
        <form onSubmit={handleSaveModal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Proyek</label>
              <input
                type="text"
                value={formState.project_number}
                onChange={(e) => setFormState({ ...formState, project_number: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jenis Pekerjaan
              </label>
              <select
                value={formState.work_type}
                onChange={(e) =>
                  setFormState({ ...formState, work_type: e.target.value as ProjectWorkType })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Pembangunan">Pembangunan</option>
                <option value="Renovasi">Renovasi</option>
                <option value="Perbaikan">Perbaikan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Proyek</label>
              <select
                value={formState.status}
                onChange={(e) =>
                  setFormState({ ...formState, status: e.target.value as ProjectStatus })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Perencanaan">Perencanaan</option>
                <option value="Dalam Pengerjaan">Dalam Pengerjaan</option>
                <option value="Review Finance">Review Finance</option>
                <option value="Berjalan">Berjalan</option>
                <option value="Tertunda">Tertunda</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Proyek</label>
            <input
              type="text"
              value={formState.name}
              onChange={(e) => setFormState({ ...formState, name: e.target.value })}
              placeholder="Contoh: Renovasi Rumah Dinas Polres & Asrama"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instansi / Pemberi Pekerjaan
              </label>
              <input
                type="text"
                value={formState.client_name}
                onChange={(e) => setFormState({ ...formState, client_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PIC / Penanggung Jawab
              </label>
              <select
                value={formState.pic_employee_id}
                onChange={(e) => setFormState({ ...formState, pic_employee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {state.employees
                  .filter((e) => e.status === 'Aktif')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} ({e.nik})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lokasi Pekerjaan
            </label>
            <input
              type="text"
              value={formState.location}
              onChange={(e) => setFormState({ ...formState, location: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={formState.start_date}
                onChange={(e) => setFormState({ ...formState, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Selesai</label>
              <input
                type="date"
                value={formState.target_end_date}
                onChange={(e) => setFormState({ ...formState, target_end_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Progres (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={formState.progress_percent}
                onChange={(e) =>
                  setFormState({ ...formState, progress_percent: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nilai Kontrak / Anggaran (IDR)
            </label>
            <input
              type="number"
              min={0}
              value={formState.contract_value}
              onChange={(e) =>
                setFormState({ ...formState, contract_value: Number(e.target.value) })
              }
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Pekerjaan
            </label>
            <textarea
              rows={3}
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          {projectSaveError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{projectSaveError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={submittingProject}
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingProject}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-60"
            >
              {submittingProject ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Proyek'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Dokumen Antrean Sebelum Simpan Proyek */}
      <PdfPreviewModal
        open={Boolean(previewQueuedDoc)}
        onClose={() => setPreviewQueuedDoc(null)}
        title={previewQueuedDoc?.file.name ?? 'Preview Dokumen'}
        subtitle={
          previewQueuedDoc
            ? `${previewQueuedDoc.category} · ${previewQueuedDoc.extension.toUpperCase()} · ${formatFileSize(previewQueuedDoc.file.size)}`
            : undefined
        }
        fileName={previewQueuedDoc?.file.name ?? 'dokumen.pdf'}
        fileExtension={previewQueuedDoc?.extension ?? 'pdf'}
        sourceBytes={previewQueuedBytes}
        description={previewQueuedDoc?.description || undefined}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </>
  );

  // Render Halaman Detail Proyek (saat berada di sub-tab Daftar Proyek & proyek dipilih)
  if (selectedProject && projectSubmenu === 'daftar') {
    const pic = state.employees.find((e) => e.id === selectedProject.pic_employee_id);
    const projectContracts = state.contracts.filter(
      (c) => !c.is_deleted && c.project_id === selectedProject.id
    );
    const projectTerms = state.contractTerms.filter((t) =>
      projectContracts.some((c) => c.id === t.contract_id)
    );
    const projectRab = state.budgets.filter(
      (b) => b.project_id === selectedProject.id && !b.is_deleted
    );
    const projectWorks = state.workItems.filter(
      (w) => w.project_id === selectedProject.id && !w.is_deleted
    );
    const archivedWorks = state.workItems.filter(
      (w) => w.project_id === selectedProject.id && Boolean(w.is_deleted)
    );
    const projectMaterialReqs = state.materialRequests.filter(
      (m) => m.project_id === selectedProject.id
    );
    const projectMaterialsList = (state.projectMaterials ?? []).filter(
      (m) => m.project_id === selectedProject.id && !m.is_deleted
    );
    const projectFinances = state.financialTransactions.filter(
      (f) => f.project_id === selectedProject.id
    );
    const projectDocs = state.documents.filter(
      (d) => d.project_id === selectedProject.id && !d.is_deleted
    );

    const totalRabCost = projectRab.reduce((acc, b) => acc + b.total_cost, 0);
    const totalMatCost = projectMaterialsList.reduce((acc, m) => acc + m.total_price, 0);
    const totalIn = projectFinances
      .filter((f) => f.type === 'Pemasukan')
      .reduce((a, f) => a + f.amount, 0);
    const totalOut = projectFinances
      .filter((f) => f.type === 'Pengeluaran')
      .reduce((a, f) => a + f.amount, 0);

    const projectAttachmentsCount = getAttachmentsFor('proyek', selectedProject.id).length;
    const projectWorkflow = state.workflows.find((w) => w.project_id === selectedProject.id);
    const projectStageMeta = projectWorkflow
      ? getWorkflowStageMeta(projectWorkflow.stage)
      : null;

    const tabs: { key: DetailTab; label: string }[] = [
      { key: 'ringkasan', label: 'Informasi & Ringkasan' },
      {
        key: 'workflow',
        label: projectStageMeta
          ? `Workflow Operasional (${projectStageMeta.step}/5)`
          : 'Workflow Operasional',
      },
      { key: 'pekerjaan', label: `Pekerjaan (${projectWorks.length})` },
      { key: 'kontrak', label: `Kontrak & Termin (${projectContracts.length})` },
      { key: 'rab', label: `RAB (${projectRab.length})` },
      {
        key: 'material',
        label: `Bahan & SPM (${projectMaterialsList.length + projectMaterialReqs.length})`,
      },
      { key: 'keuangan', label: `Keuangan (${projectFinances.length})` },
      { key: 'dokumen', label: `Surat Resmi (${projectDocs.length})` },
      { key: 'lampiran', label: `Dokumen & Foto (${projectAttachmentsCount})` },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedProjectId(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-blue-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Proyek</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <ModuleAttachmentToolbar
              moduleId="proyek"
              entityId={selectedProject.id}
              entityLabel={`${selectedProject.project_number} — ${selectedProject.name}`}
              title={`Dokumen Proyek ${selectedProject.project_number}`}
              subtitle="SPK, RAB, gambar bangunan, surat, foto kondisi awal, dan dokumentasi lapangan"
              defaultCategory="SPK"
            />
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(selectedProject)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Data Proyek</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: 'project', item: selectedProject })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Arsipkan / Hapus</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Hero Detail Banner */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-4 min-h-[200px] bg-slate-100">
            {(() => {
              const latestPhoto = getLatestPhotoFor('proyek', selectedProject.id);
              if (latestPhoto) {
                return (
                  <ProtectedAttachmentImage
                    key={latestPhoto.id}
                    attachment={latestPhoto}
                    className="w-full h-full object-cover min-h-[200px]"
                  />
                );
              }
              const safeUrl =
                selectedProject.image_url && !isStaticSamplePhotoUrl(selectedProject.image_url)
                  ? selectedProject.image_url
                  : '';
              return (
                <FallbackImage
                  src={safeUrl}
                  alt={selectedProject.name}
                  className="w-full h-full object-cover min-h-[200px]"
                />
              );
            })()}
          </div>
          <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-blue-700">
                    {selectedProject.project_number}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                    {selectedProject.work_type ?? 'Pembangunan'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {projectStageMeta && (
                    <button
                      type="button"
                      onClick={() => setDetailTab('workflow')}
                      className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold cursor-pointer ${projectStageMeta.badgeClass}`}
                    >
                      Tahap {projectStageMeta.step}/5 · {projectStageMeta.shortLabel}
                    </button>
                  )}
                  <StatusLabel status={selectedProject.status} />
                </div>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                {selectedProject.name}
              </h1>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {selectedProject.description}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">Instansi / Pemberi Kerja</span>
                <span className="font-semibold text-slate-900">{selectedProject.client_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">PIC / Penanggung Jawab</span>
                <span className="font-semibold text-slate-900">{pic?.full_name ?? '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Nilai Kontrak / Anggaran</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatRupiah(selectedProject.contract_value, true)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Progres Fisik</span>
                <span className="font-mono font-bold text-blue-700 tabular-nums">
                  {selectedProject.progress_percent}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1 p-1.5 bg-slate-200/70 rounded-xl overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDetailTab(t.key)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                detailTab === t.key
                  ? 'bg-white text-[#13233C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Detail Tab Body */}
        {detailTab === 'ringkasan' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-2">
              <span className="text-xs text-slate-500">Lokasi & Periode Pekerjaan</span>
              <p className="text-sm font-semibold text-slate-900">{selectedProject.location}</p>
              <p className="text-xs text-slate-600">
                Mulai: {formatDateID(selectedProject.start_date)} · Target:{' '}
                {formatDateID(selectedProject.target_end_date)}
              </p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-2">
              <span className="text-xs text-slate-500">Total RAB & Bahan Bangunan</span>
              <p className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                {formatRupiah(totalRabCost)}
              </p>
              <p className="text-xs text-slate-500">
                {projectRab.length} pos RAB · {projectMaterialsList.length} item bahan ({formatRupiah(totalMatCost, true)})
              </p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-2">
              <span className="text-xs text-slate-500">Arus Kas Proyek</span>
              <p className="text-sm font-mono font-semibold text-emerald-700 tabular-nums">
                Masuk: {formatRupiah(totalIn, true)}
              </p>
              <p className="text-sm font-mono font-semibold text-slate-700 tabular-nums">
                Keluar: {formatRupiah(totalOut, true)}
              </p>
            </div>
          </div>
        )}

        {detailTab === 'workflow' && <ProjectWorkflowPanel project={selectedProject} />}

        {detailTab === 'pekerjaan' && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Daftar Progres Pekerjaan Proyek
                </h3>
                <div className="flex items-center gap-3">
                  {canRestore && allowTeknikAccess && archivedWorks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowArchivedWorks((v) => !v)}
                      className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      Arsip Terhapus ({archivedWorks.length})
                    </button>
                  )}
                  {allowTeknikAccess && (
                    <button
                      type="button"
                      onClick={() => setActiveModule('teknik')}
                      className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      Kelola di Modul Teknik
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {projectWorks.map((w) => {
                  const wPic = state.employees.find((e) => e.id === w.pic_employee_id);
                  return (
                    <div
                      key={w.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{w.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          PIC: {wPic?.full_name ?? '-'} · Tenggat: {formatDateID(w.due_date)}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">Kendala: {w.constraints}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-blue-700 tabular-nums mr-1">
                          {w.overall_progress}%
                        </span>
                        <StatusLabel status={w.status} />
                        <button
                          type="button"
                          onClick={() => setViewingWork(w)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Lihat detail pekerjaan"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {allowDeleteWork && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ kind: 'work', item: w })}
                            className="p-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                            title="Arsipkan / Hapus pekerjaan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {projectWorks.length === 0 && (
                  <p className="p-6 text-center text-xs text-slate-500">
                    Belum ada pekerjaan teknik terdaftar.
                  </p>
                )}
              </div>
            </div>

            {canRestore && allowTeknikAccess && showArchivedWorks && archivedWorks.length > 0 && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-amber-900">
                  Arsip Progres Pekerjaan Terhapus ({archivedWorks.length})
                </h4>
                <div className="divide-y divide-amber-200/70">
                  {archivedWorks.map((w) => (
                    <div
                      key={w.id}
                      className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{w.title}</span>
                        <p className="text-[11px] text-slate-600">
                          Diarsipkan oleh {w.deleted_by_name ?? '-'} · Alasan:{' '}
                          {w.delete_reason ?? '-'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreWorkItem(w.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Pulihkan</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {detailTab === 'kontrak' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4">
            {projectContracts.map((c) => (
              <div key={c.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono text-blue-700 font-semibold">
                      {c.contract_number}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{c.work_name}</h4>
                  </div>
                  <StatusLabel status={c.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Nilai:{' '}
                  <strong className="font-mono text-slate-800">
                    {formatRupiah(c.contract_value)}
                  </strong>{' '}
                  · Periode: {formatDateID(c.start_date)} s/d {formatDateID(c.end_date)}
                </p>
              </div>
            ))}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Termin Pembayaran</h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {projectTerms.map((t) => {
                  const { paidAmount, remainingAmount, statusRealization } =
                    computeTermPaymentRealization({
                      approvedAmount: t.term_value,
                      term: t,
                      termPayments: state.termPayments,
                      claims: state.termClaims,
                    });
                  return (
                    <div
                      key={t.id}
                      className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{t.term_number}</span> ·{' '}
                        {t.period_month}
                        <p className="text-slate-500 mt-0.5 tabular-nums">
                          Target {t.target_progress}% · Realisasi {t.actual_progress}% · Dibayar{' '}
                          {formatRupiah(paidAmount, true)} · Sisa {formatRupiah(remainingAmount, true)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold tabular-nums">
                          {formatRupiah(t.term_value, true)}
                        </span>
                        <StatusLabel status={statusRealization} />
                      </div>
                    </div>
                  );
                })}
                {projectTerms.length === 0 && (
                  <p className="p-4 text-center text-xs text-slate-500">
                    Belum ada termin pembayaran terdaftar.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {detailTab === 'rab' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kategori & Uraian</th>
                  <th className="py-3 px-4 font-semibold text-right">Volume</th>
                  <th className="py-3 px-4 font-semibold text-right">Harga Satuan</th>
                  <th className="py-3 px-4 font-semibold text-right">Jumlah Biaya</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectRab.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{r.work_item_name}</div>
                      <div className="text-slate-500">{r.category}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {r.volume} {r.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatRupiah(r.unit_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {formatRupiah(r.total_cost)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingRab(r)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {allowEditRab && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingRab(r)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'rab', item: r })}
                              className="p-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {projectRab.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Belum ada item RAB terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {detailTab === 'material' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Daftar Bahan Bangunan Proyek ({projectMaterialsList.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setProjectSubmenu('rab-material');
                  }}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                >
                  Kelola di Tab RAB & Bahan Bangunan
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Nama Bahan</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Volume</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Harga Satuan</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total</th>
                    <th className="py-2.5 px-4 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectMaterialsList.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{m.material_name}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatNumber(m.volume)} {m.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatRupiah(m.unit_price)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#1D7AFC]">
                        {formatRupiah(m.total_price)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{m.notes || '-'}</td>
                    </tr>
                  ))}
                  {projectMaterialsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        Belum ada daftar bahan bangunan khusus untuk proyek ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] divide-y divide-slate-100">
              <div className="px-4 py-3 border-b border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Surat Permintaan Material Gudang ({projectMaterialReqs.length})
                </h4>
              </div>
              {projectMaterialReqs.map((mr) => (
                <div
                  key={mr.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-700">
                      {mr.request_number}
                    </span>
                    <p className="text-slate-700 mt-0.5">{mr.notes}</p>
                  </div>
                  <StatusLabel status={mr.status} />
                </div>
              ))}
              {projectMaterialReqs.length === 0 && (
                <p className="p-6 text-center text-xs text-slate-500">
                  Belum ada permintaan material ke gudang.
                </p>
              )}
            </div>
          </div>
        )}

        {detailTab === 'keuangan' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] divide-y divide-slate-100">
            {projectFinances.map((f) => (
              <div
                key={f.id}
                className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono text-slate-500">{f.transaction_no}</span> ·{' '}
                  <span className="font-semibold text-slate-900">{f.category}</span>
                  <p className="text-slate-600 mt-0.5">{f.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      f.type === 'Pemasukan' ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {f.type === 'Pemasukan' ? '+' : '-'} {formatRupiah(f.amount)}
                  </span>
                  <StatusLabel status={f.status} />
                </div>
              </div>
            ))}
            {projectFinances.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">
                Belum ada transaksi keuangan untuk proyek ini.
              </p>
            )}
          </div>
        )}

        {detailTab === 'dokumen' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] divide-y divide-slate-100">
            {projectDocs.map((d) => (
              <div
                key={d.id}
                className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono font-semibold text-blue-700">{d.doc_number}</span> ·{' '}
                  <span>{d.doc_type}</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{d.title}</p>
                </div>
                <StatusLabel status={d.status} />
              </div>
            ))}
            {projectDocs.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">
                Belum ada surat resmi terhubung ke proyek ini.
              </p>
            )}
          </div>
        )}

        {detailTab === 'lampiran' && (
          <div className="space-y-5">
            <ProjectPhotoDocsSection project={selectedProject} />
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
              <AttachmentPanel
                moduleId="proyek"
                entityId={selectedProject.id}
                entityLabel={`${selectedProject.project_number} — ${selectedProject.name}`}
                defaultCategory="SPK"
                categoryOptions={PROJECT_DOC_CATEGORIES}
                heading="Dokumen Proyek & Berkas Lainnya"
                subtitle="Unggah SPK, RAB, gambar bangunan, surat, foto kondisi awal, dan dokumentasi lapangan."
              />
            </div>
          </div>
        )}

        {renderSharedDialogs()}
      </div>
    );
  }

  // Management Proyek Submenu Workspace
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Management Proyek
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pengelolaan pekerjaan pembangunan dan renovasi gedung.
          </p>
        </div>
        {canManage && projectSubmenu !== 'tambah' && (
          <button
            type="button"
            onClick={() => switchSubmenu('tambah')}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Proyek</span>
          </button>
        )}
      </div>

      {/* Submenu Tabs Bar (Synced with Sidebar Management Proyek) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-1.5 flex items-center gap-1 overflow-x-auto">
        {MANAGEMENT_PROYEK_SUBMENUS.map((sub) => {
          const isActive = projectSubmenu === sub.key;
          return (
            <button
              key={sub.key}
              type="button"
              onClick={() => switchSubmenu(sub.key)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[#13233C] text-[#FBC02D] shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {sub.label}
            </button>
          );
        })}
      </div>

      {/* Submenu 1: Daftar Proyek */}
      {projectSubmenu === 'daftar' && (
        <>
          {/* Filter & Search Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Cari kode proyek, nama proyek, instansi, atau lokasi..."
            />
            <select
              value={workTypeFilter}
              onChange={(e) => {
                setWorkTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="SEMUA">Semua Jenis Pekerjaan</option>
              <option value="Pembangunan">Pembangunan</option>
              <option value="Renovasi">Renovasi</option>
              <option value="Perbaikan">Perbaikan</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="Perencanaan">Perencanaan</option>
              <option value="Dalam Pengerjaan">Dalam Pengerjaan</option>
              <option value="Review Finance">Review Finance</option>
              <option value="Berjalan">Berjalan</option>
              <option value="Tertunda">Tertunda</option>
              <option value="Selesai">Selesai</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'value' | 'progress')}
              className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="name">Urutkan: Kode Proyek</option>
              <option value="value">Urutkan: Nilai Tertinggi</option>
              <option value="progress">Urutkan: Progres Tertinggi</option>
            </select>
            {canRestore && archivedProjects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchivedProjects((v) => !v)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 cursor-pointer ${
                  showArchivedProjects
                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Arsip Proyek ({archivedProjects.length})</span>
              </button>
            )}
          </div>

          {canRestore && showArchivedProjects && archivedProjects.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-amber-900">
                    Arsip Proyek Terhapus ({archivedProjects.length})
                  </h3>
                  <p className="text-[11px] text-amber-800">
                    Proyek yang diarsipkan tetap menjaga seluruh riwayat kontrak, keuangan, stok, dan persetujuan.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200">
                {archivedProjects.map((ap) => (
                  <div
                    key={ap.id}
                    className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-700">{ap.project_number}</span>{' '}
                      · <strong className="text-slate-900">{ap.name}</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dihapus oleh <strong>{ap.deleted_by_name ?? '-'}</strong>
                        {ap.deleted_at ? ` pada ${formatDateTimeID(ap.deleted_at)}` : ''} · Alasan:{' '}
                        {ap.delete_reason ?? '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreProject(ap.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Pulihkan Proyek</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paginated.length === 0 ? (
            <EmptyState
              title="Proyek Tidak Ditemukan"
              description="Tidak ada data proyek yang sesuai dengan filter pencarian Anda."
              actionLabel={canManage ? 'Tambah Proyek Baru' : undefined}
              onAction={canManage ? openCreate : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {paginated.map((p) => {
                const pic = state.employees.find((e) => e.id === p.pic_employee_id);
                const wf = state.workflows.find((w) => w.project_id === p.id);
                const wfMeta = wf ? getWorkflowStageMeta(wf.stage) : null;
                const latestCardPhoto = getLatestPhotoFor('proyek', p.id);
                const safeCardUrl =
                  p.image_url && !isStaticSamplePhotoUrl(p.image_url) ? p.image_url : '';
                return (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="relative h-44 bg-slate-100">
                        {latestCardPhoto ? (
                          <ProtectedAttachmentImage
                            key={latestCardPhoto.id}
                            attachment={latestCardPhoto}
                            className="w-full h-44 object-cover"
                          />
                        ) : (
                          <FallbackImage
                            src={safeCardUrl}
                            alt={p.name}
                            className="w-full h-44 object-cover"
                          />
                        )}
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[11px] font-semibold backdrop-blur-xs">
                          {p.work_type ?? 'Pembangunan'}
                        </span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-xs font-mono font-semibold text-blue-700">
                              {p.project_number}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {wfMeta && (
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${wfMeta.badgeClass}`}
                              >
                                {wfMeta.shortLabel}
                              </span>
                            )}
                            <StatusLabel status={p.status} />
                          </div>
                        </div>
                        <h3
                          onClick={() => {
                            setDetailTab('ringkasan');
                            setSelectedProjectId(p.id);
                          }}
                          className="text-sm font-bold text-slate-900 hover:text-blue-700 cursor-pointer line-clamp-2"
                        >
                          {p.name}
                        </h3>
                        <div className="space-y-1 text-xs text-slate-500">
                          <p className="flex items-center gap-1.5 truncate">
                            <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{p.client_name}</span>
                          </p>
                          <p className="flex items-center gap-1.5 truncate">
                            <User className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">PIC: {pic?.full_name ?? '-'}</span>
                          </p>
                          <p className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{p.location}</span>
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span>
                              {formatDateID(p.start_date)} – {formatDateID(p.target_end_date)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          Nilai:{' '}
                          <strong className="font-mono text-slate-900 tabular-nums">
                            {formatRupiah(p.contract_value, true)}
                          </strong>
                        </span>
                        <span className="font-mono font-bold text-blue-700 tabular-nums">
                          {p.progress_percent}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-700 rounded-full"
                          style={{ width: `${p.progress_percent}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailTab('ringkasan');
                            setSelectedProjectId(p.id);
                          }}
                          className="flex-1 min-h-[36px] py-1.5 px-3 text-xs font-semibold text-white bg-[#13233C] hover:bg-[#1D304D] rounded-xl cursor-pointer transition-colors"
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailTab('workflow');
                            setSelectedProjectId(p.id);
                          }}
                          className="flex-1 min-h-[36px] py-1.5 px-3 text-xs font-semibold text-[#1D7AFC] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl cursor-pointer transition-colors"
                        >
                          Workflow
                        </button>
                        <ModuleAttachmentToolbar
                          compact
                          moduleId="proyek"
                          entityId={p.id}
                          entityLabel={`${p.project_number} — ${p.name}`}
                          title={`Dokumen Proyek ${p.project_number}`}
                          subtitle="SPK, RAB, gambar bangunan, surat, foto kondisi awal"
                          defaultCategory="SPK"
                        />
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="min-h-[36px] py-1.5 px-2.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
                              title="Edit Proyek"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'project', item: p })}
                              className="min-h-[36px] py-1.5 px-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 cursor-pointer"
                              title="Hapus / Arsipkan Proyek"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={filteredProjects.length}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {/* Submenu 2: Tambah Proyek */}
      {projectSubmenu === 'tambah' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 sm:p-6">
          {!canManage ? (
            <div className="py-8 text-center max-w-md mx-auto space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Akses Terbatas</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Penambahan data proyek baru hanya diizinkan untuk <strong>Super Admin</strong> atau{' '}
                <strong>Head Divisi Teknik</strong> sesuai kebijakan otorisasi perusahaan.
              </p>
              <button
                type="button"
                onClick={() => switchSubmenu('daftar')}
                className="px-4 py-2 text-xs font-semibold bg-[#13233C] text-white rounded-xl cursor-pointer"
              >
                Kembali ke Daftar Proyek
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateProjectSubmit} className="space-y-4 max-w-3xl">
              <div className="pb-3 border-b border-slate-100">
                <h2 className="text-base font-bold text-[#13233C]">
                  Form Tambah Proyek Pembangunan / Renovasi Gedung
                </h2>
                <p className="text-xs text-slate-500">
                  Isi data pekerjaan bangunan skala praktis (rumah dinas, gedung kantor, mess, atau fasilitas umum). Proyek baru otomatis masuk ke alur Tim Teknik.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Kode Proyek (Otomatis)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState((s) => ({ ...s, project_number: generateNextProjectCode() }))
                      }
                      className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                    >
                      Generate Ulang
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formState.project_number}
                    onChange={(e) => setFormState({ ...formState, project_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Pekerjaan
                  </label>
                  <select
                    value={formState.work_type}
                    onChange={(e) =>
                      setFormState({ ...formState, work_type: e.target.value as ProjectWorkType })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="Pembangunan">Pembangunan</option>
                    <option value="Renovasi">Renovasi</option>
                    <option value="Perbaikan">Perbaikan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Proyek
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as ProjectStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="Perencanaan">Perencanaan</option>
                    <option value="Dalam Pengerjaan">Dalam Pengerjaan</option>
                    <option value="Review Finance">Review Finance</option>
                    <option value="Berjalan">Berjalan</option>
                    <option value="Tertunda">Tertunda</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Proyek
                </label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="Contoh: Renovasi Rumah Dinas Perwira & Mess Anggota"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Instansi / Pemberi Pekerjaan
                  </label>
                  <input
                    type="text"
                    value={formState.client_name}
                    onChange={(e) => setFormState({ ...formState, client_name: e.target.value })}
                    placeholder="Contoh: Kepolisian Resor / Dinas PUPR / Pemda"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PIC / Penanggung Jawab
                  </label>
                  <select
                    value={formState.pic_employee_id}
                    onChange={(e) => setFormState({ ...formState, pic_employee_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    {state.employees
                      .filter((e) => e.status === 'Aktif')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name} ({e.nik})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lokasi Pekerjaan
                </label>
                <input
                  type="text"
                  value={formState.location}
                  onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                  placeholder="Contoh: Jl. Bhayangkara No. 12, Kota Depok"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={formState.start_date}
                    onChange={(e) => setFormState({ ...formState, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Selesai
                  </label>
                  <input
                    type="date"
                    value={formState.target_end_date}
                    onChange={(e) => setFormState({ ...formState, target_end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nilai Kontrak / Anggaran (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.contract_value}
                    onChange={(e) =>
                      setFormState({ ...formState, contract_value: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deskripsi Pekerjaan
                </label>
                <textarea
                  rows={3}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Jelaskan lingkup pekerjaan bangunan/renovasi (mis. perbaikan atap, pengecatan, penggantian keramik, instalasi listrik & air)..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  required
                />
              </div>

              {/* Upload Dokumen Pendukung (Multiple File Upload + Drag & Drop) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#13233C] flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-[#1D7AFC]" />
                      <span>Upload Dokumen Pendukung (Multi-File)</span>
                      {queuedDocs.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono text-[10px] font-bold tabular-nums">
                          {queuedDocs.length} file dipilih
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Unggah banyak dokumen sekaligus atau bertahap: SPK, RAB, gambar bangunan, surat tugas, atau foto kondisi awal lokasi.
                    </p>
                  </div>
                </div>

                {createdDraftProject && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Proyek {createdDraftProject.project_number} sudah tersimpan. Sebagian dokumen gagal diunggah — Anda dapat mengunggah ulang file yang gagal di bawah ini.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => finalizeAndOpenCreatedProject(createdDraftProject)}
                        className="px-3 py-1.5 rounded-lg bg-[#13233C] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Lanjut ke Detail Proyek</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Kategori Dokumen Default
                    </label>
                    <select
                      value={queuedCategory}
                      onChange={(e) => setQueuedCategory(e.target.value as AttachmentCategory)}
                      className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                    >
                      {PROJECT_DOC_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Keterangan File (Opsional)
                    </label>
                    <input
                      type="text"
                      value={queuedDesc}
                      onChange={(e) => setQueuedDesc(e.target.value)}
                      placeholder="Contoh: SPK Pekerjaan, RAB Awal & Foto Kondisi Lokasi"
                      className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      ref={createFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        addFilesToQueue(e.target.files);
                        if (createFileInputRef.current) createFileInputRef.current.value = '';
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={submittingProject}
                      onClick={() => createFileInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{queuedDocs.length > 0 ? 'Tambah File Lagi' : 'Pilih Banyak File'}</span>
                    </button>
                  </div>
                </div>

                {/* Desktop & Tablet Drag-and-Drop Multi-File Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingCreateDocs(true);
                  }}
                  onDragLeave={() => setIsDraggingCreateDocs(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingCreateDocs(false);
                    addFilesToQueue(e.dataTransfer.files);
                  }}
                  onClick={() => !submittingProject && createFileInputRef.current?.click()}
                  className={`rounded-xl border-2 border-dashed py-5 px-4 text-center transition-colors cursor-pointer flex flex-col items-center justify-center ${
                    isDraggingCreateDocs
                      ? 'border-[#1D7AFC] bg-blue-50/80'
                      : 'border-slate-300 bg-white hover:border-[#1D7AFC]/70 hover:bg-blue-50/20'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1D7AFC] flex items-center justify-center mb-2">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    Seret &amp; lepaskan beberapa file di sini, atau{' '}
                    <span className="text-[#1D7AFC] underline">klik untuk memilih dokumen</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Format didukung: PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG · Maks {uploadConfig.maxFileSizeMb || 15} MB per file · Bisa tambah bertahap
                  </p>
                </div>

                {docQueueError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{docQueueError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocQueueError('')}
                      className="text-red-500 hover:text-red-800 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Detailed File Queue List */}
                {queuedDocs.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800">
                        Daftar Dokumen Dipilih ({queuedDocs.length} file)
                      </span>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="font-mono text-slate-500 tabular-nums">
                          Total: {formatFileSize(queuedDocs.reduce((acc, q) => acc + q.file.size, 0))}
                        </span>
                        {!submittingProject && !createdDraftProject && (
                          <button
                            type="button"
                            onClick={clearQueuedDocs}
                            className="font-semibold text-red-600 hover:underline cursor-pointer"
                          >
                            Kosongkan Antrean
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {queuedDocs.map((q) => {
                        const isImg = ['jpg', 'jpeg', 'png'].includes(q.extension);
                        const isPdf = q.extension === 'pdf';
                        const isSheet = ['xls', 'xlsx'].includes(q.extension);
                        const canPreview = PREVIEWABLE_EXTS.has(q.extension) && Boolean(q.previewUrl);

                        const typeBadgeClass = isImg
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : isPdf
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : isSheet
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : ['doc', 'docx'].includes(q.extension)
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200';

                        const FileTypeIcon = isImg
                          ? ImageIcon
                          : isSheet
                          ? FileSpreadsheet
                          : isPdf || ['doc', 'docx'].includes(q.extension)
                          ? FileText
                          : File;

                        return (
                          <div key={q.id} className="p-3 space-y-2 text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                                  <FileTypeIcon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="font-semibold text-slate-900 break-words">
                                    {q.file.name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span
                                      className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${typeBadgeClass}`}
                                    >
                                      {q.extension}
                                    </span>
                                    <span className="font-mono text-slate-500 tabular-nums">
                                      {formatFileSize(q.file.size)}
                                    </span>
                                    <span>·</span>
                                    {q.status === 'Menunggu' || q.status === 'Gagal' ? (
                                      <select
                                        value={q.category}
                                        disabled={submittingProject}
                                        onChange={(e) => {
                                          const val = e.target.value as AttachmentCategory;
                                          setQueuedDocs((prev) =>
                                            prev.map((item) =>
                                              item.id === q.id ? { ...item, category: val } : item
                                            )
                                          );
                                        }}
                                        className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-700"
                                      >
                                        {PROJECT_DOC_CATEGORIES.map((cat) => (
                                          <option key={cat} value={cat}>
                                            {cat}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="font-medium text-slate-700">{q.category}</span>
                                    )}
                                    {q.description && (
                                      <span className="text-slate-500 truncate max-w-[200px]">
                                        · {q.description}
                                      </span>
                                    )}
                                  </div>
                                  {q.error && (
                                    <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      <span>{q.error}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Status, Progress %, Preview, Retry & Delete Actions */}
                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                                  {q.status === 'Mengunggah'
                                    ? `Mengunggah ${q.progress}%`
                                    : q.status}
                                </span>

                                {canPreview && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewQueuedDoc(q)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                    title="Preview Dokumen"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Preview</span>
                                  </button>
                                )}

                                {q.status === 'Gagal' && createdDraftProject && (
                                  <button
                                    type="button"
                                    disabled={submittingProject}
                                    onClick={() => handleRetrySingleQueuedDoc(q)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                                    title="Unggah Ulang File Ini"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Unggah Ulang</span>
                                  </button>
                                )}

                                {q.status !== 'Mengunggah' && q.status !== 'Berhasil' && (
                                  <button
                                    type="button"
                                    disabled={submittingProject}
                                    onClick={() => removeQueuedDoc(q.id)}
                                    className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                                    title="Hapus file dari antrean"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Individual Per-File Upload Progress Bar */}
                            <div className="space-y-1">
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-150 rounded-full ${
                                    q.status === 'Berhasil'
                                      ? 'bg-emerald-600'
                                      : q.status === 'Gagal'
                                      ? 'bg-red-500'
                                      : 'bg-[#1D7AFC]'
                                  }`}
                                  style={{
                                    width: `${
                                      q.status === 'Berhasil'
                                        ? 100
                                        : q.status === 'Gagal'
                                        ? Math.max(10, q.progress)
                                        : q.progress
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {projectSaveError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{projectSaveError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProjectSaveError('')}
                    className="text-red-500 hover:text-red-800 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submittingProject}
                  onClick={() => {
                    clearQueuedDocs();
                    setCreatedDraftProject(null);
                    switchSubmenu('daftar');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  {createdDraftProject ? 'Tutup Form' : 'Batal'}
                </button>
                <button
                  type="submit"
                  disabled={submittingProject}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 disabled:opacity-60 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {submittingProject
                      ? 'Mengunggah & Menyimpan...'
                      : createdDraftProject
                      ? 'Unggah Ulang Semua yang Gagal'
                      : queuedDocs.length > 0
                      ? `Simpan Proyek & Unggah ${queuedDocs.length} Dokumen`
                      : 'Simpan Proyek Baru'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Submenu 3–5 Shared Project Selector Bar */}
      {['rab-material', 'dokumen', 'riwayat'].includes(projectSubmenu) && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
            <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Pilih Proyek Aktif:
            </label>
            <select
              value={activeContextProject?.id ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 max-w-xl px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl"
            >
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
          </div>
          {activeContextProject && (
            <button
              type="button"
              onClick={() => {
                setDetailTab('workflow');
                setProjectSubmenu('daftar');
                setSelectedProjectId(activeContextProject.id);
              }}
              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#1D7AFC] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Buka Workflow Operasional</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Submenu 3: RAB & Bahan Bangunan */}
      {projectSubmenu === 'rab-material' && activeContextProject && (() => {
        const prj = activeContextProject;
        const prjBudgets = state.budgets.filter((b) => b.project_id === prj.id && !b.is_deleted);
        const archivedBudgets = state.budgets.filter(
          (b) => b.project_id === prj.id && Boolean(b.is_deleted)
        );
        const totalRab = prjBudgets.reduce((a, b) => a + b.total_cost, 0);

        const prjMaterials = (state.projectMaterials ?? []).filter(
          (m) => m.project_id === prj.id && !m.is_deleted
        );
        const archivedMaterials = (state.projectMaterials ?? []).filter(
          (m) => m.project_id === prj.id && Boolean(m.is_deleted)
        );
        const totalBahan = prjMaterials.reduce((a, m) => a + m.total_price, 0);

        const wf = state.workflows.find((w) => w.project_id === prj.id);
        const prjMatReqs = state.materialRequests.filter((m) => m.project_id === prj.id);

        return (
          <div className="space-y-5">
            {/* Bagian 1: RAB Proyek */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
                    Rencana Anggaran Biaya (RAB) — {prj.project_number}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Total RAB: <strong className="font-mono text-[#1D7AFC]">{formatRupiah(totalRab)}</strong> · Nilai Kontrak:{' '}
                    <strong className="font-mono text-slate-900">{formatRupiah(prj.contract_value)}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {canRestore && archivedBudgets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowArchivedRab((v) => !v)}
                      className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      Arsip RAB ({archivedBudgets.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveModule('rab')}
                    className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                  >
                    Buka Modul RAB Lengkap
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Kategori & Item Pekerjaan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Volume</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total Biaya</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prjBudgets.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <span>{b.work_item_name}</span>
                          </div>
                          <div className="text-slate-500">
                            {b.category}
                            {b.notes ? ` · ${b.notes}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNumber(b.volume)} {b.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(b.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                          {formatRupiah(b.total_cost)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingRab(b)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Lihat Detail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {allowEditRab && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingRab(b)}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  title="Edit RAB"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'rab', item: b })}
                                  className="p-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                                  title="Hapus / Arsipkan RAB"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {prjBudgets.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-slate-500">
                          Belum ada item RAB untuk proyek ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canRestore && showArchivedRab && archivedBudgets.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-900">
                    Arsip Item RAB Terhapus ({archivedBudgets.length})
                  </p>
                  <div className="divide-y divide-amber-200/70">
                    {archivedBudgets.map((ab) => (
                      <div
                        key={ab.id}
                        className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">{ab.work_item_name}</span>{' '}
                          ({formatRupiah(ab.total_cost)})
                          <p className="text-[11px] text-slate-600">
                            Dihapus oleh {ab.deleted_by_name ?? '-'} · Alasan: {ab.delete_reason ?? '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreBudgetItem(ab.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Pulihkan</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allowEditRab && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inlineRabName.trim()) return;
                    addBudgetItem({
                      project_id: prj.id,
                      category: inlineRabCat,
                      work_item_name: inlineRabName.trim(),
                      volume: inlineRabVol,
                      unit: inlineRabUnit,
                      unit_price: inlineRabPrice,
                      total_cost: inlineRabVol * inlineRabPrice,
                      target_qty: inlineRabVol,
                      actual_qty: 0,
                      pic_employee_id: currentUser?.id ?? prj.pic_employee_id,
                      execution_date: prj.start_date,
                      field_doc_ref: '-',
                      constraints: '-',
                      notes: inlineRabNotes.trim() || undefined,
                    });
                    setInlineRabName('');
                    setInlineRabNotes('');
                  }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 items-end"
                >
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Kategori
                    </label>
                    <input
                      type="text"
                      value={inlineRabCat}
                      onChange={(e) => setInlineRabCat(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Uraian Item RAB
                    </label>
                    <input
                      type="text"
                      value={inlineRabName}
                      onChange={(e) => setInlineRabName(e.target.value)}
                      placeholder="Contoh: Plesteran & Aci Dinding"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Vol & Satuan
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={inlineRabVol}
                        onChange={(e) => setInlineRabVol(Number(e.target.value))}
                        className="w-16 px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={inlineRabUnit}
                        onChange={(e) => setInlineRabUnit(e.target.value)}
                        className="w-14 px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Harga Satuan
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={inlineRabPrice}
                      onChange={(e) => setInlineRabPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ket.
                    </label>
                    <input
                      type="text"
                      value={inlineRabNotes}
                      onChange={(e) => setInlineRabNotes(e.target.value)}
                      placeholder="-"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full py-1.5 px-3 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah RAB</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Bagian 2: Input & Daftar Bahan Bangunan Praktis */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#13233C] flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#1D7AFC]" />
                    <span>Kebutuhan Bahan Bangunan — {prj.project_number}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Estimasi Bahan Bangunan:{' '}
                    <strong className="font-mono text-[#1D7AFC]">{formatRupiah(totalBahan)}</strong> ({prjMaterials.length} item)
                  </p>
                </div>
                {canRestore && archivedMaterials.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowArchivedMaterials((v) => !v)}
                    className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                  >
                    Arsip Bahan ({archivedMaterials.length})
                  </button>
                )}
              </div>

              {allowEditRab && (
                <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                      Pilih Cepat Bahan Bangunan Umum:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_BUILDING_MATERIALS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setMatName(preset.name);
                            setMatUnit(preset.unit);
                            setMatPrice(preset.defaultPrice);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                            matName === preset.name
                              ? 'bg-[#13233C] text-[#FBC02D] border-[#13233C]'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!matName.trim()) return;
                      addProjectMaterial({
                        project_id: prj.id,
                        material_name: matName.trim(),
                        unit: matUnit.trim() || 'Unit',
                        volume: Number(matVol) || 0,
                        unit_price: Number(matPrice) || 0,
                        total_price: (Number(matVol) || 0) * (Number(matPrice) || 0),
                        notes: matNotes.trim(),
                      });
                      setMatName('');
                      setMatNotes('');
                    }}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Nama Bahan Bangunan
                      </label>
                      <input
                        type="text"
                        value={matName}
                        onChange={(e) => setMatName(e.target.value)}
                        placeholder="Semen, Pasir, Hebel, Keramik..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Satuan
                      </label>
                      <select
                        value={MATERIAL_UNIT_OPTIONS.includes(matUnit) ? matUnit : 'Lainnya'}
                        onChange={(e) => {
                          if (e.target.value !== 'Lainnya') setMatUnit(e.target.value);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        {MATERIAL_UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Volume
                      </label>
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={matVol}
                        onChange={(e) => setMatVol(Number(e.target.value))}
                        className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Harga Satuan (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={matPrice}
                        onChange={(e) => setMatPrice(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Total Otomatis & Ket.
                      </label>
                      <div className="space-y-1">
                        <div className="px-2 py-1 rounded bg-blue-50 border border-blue-200 font-mono text-[11px] font-bold text-[#1D7AFC] truncate">
                          {formatRupiah((Number(matVol) || 0) * (Number(matPrice) || 0))}
                        </div>
                        <input
                          type="text"
                          value={matNotes}
                          onChange={(e) => setMatNotes(e.target.value)}
                          placeholder="Keterangan spesifikasi..."
                          className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="w-full py-2 px-3 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Bahan</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Nama Bahan Bangunan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Volume</th>
                      <th className="py-2.5 px-3 font-semibold">Satuan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total Harga</th>
                      <th className="py-2.5 px-3 font-semibold">Keterangan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prjMaterials.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{m.material_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNumber(m.volume)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{m.unit}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(m.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1D7AFC] tabular-nums">
                          {formatRupiah(m.total_price)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{m.notes || '-'}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingMat(m)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Lihat Detail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {allowEditRab && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingMat(m)}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  title="Edit Bahan"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'material', item: m })}
                                  className="p-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                                  title="Hapus / Arsipkan Bahan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {prjMaterials.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-5 text-center text-slate-500">
                          Belum ada daftar kebutuhan bahan bangunan. Gunakan form di atas untuk menambahkan material seperti Semen, Pasir, Batu Split, Hebel, Besi Beton, Keramik, atau Cat.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canRestore && showArchivedMaterials && archivedMaterials.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-900">
                    Arsip Bahan Bangunan Terhapus ({archivedMaterials.length})
                  </p>
                  <div className="divide-y divide-amber-200/70">
                    {archivedMaterials.map((am) => (
                      <div
                        key={am.id}
                        className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">{am.material_name}</span> (
                          {formatNumber(am.volume)} {am.unit} · {formatRupiah(am.total_price)})
                          <p className="text-[11px] text-slate-600">
                            Dihapus oleh {am.deleted_by_name ?? '-'} · Alasan: {am.delete_reason ?? '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreProjectMaterial(am.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Pulihkan</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bagian 3: Integrasi Gudang Logistik & SPM */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-[#13233C]">
                    Realisasi Stok Gudang Logistik & Surat Permintaan Material
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('gudang')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                >
                  Buka Gudang & Persediaan
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Material Gudang</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Kebutuhan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Stok Gudang</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Dikeluarkan / Terpakai</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(wf?.material_needs ?? []).map((n) => {
                      const mat = state.materials.find((m) => m.id === n.material_id);
                      return (
                        <tr key={n.id}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">
                              {mat?.name ?? n.material_id}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">{mat?.code}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                            {formatNumber(n.qty_needed)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatNumber(mat?.stock ?? 0)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatNumber(n.qty_issued)} / {formatNumber(n.qty_used)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusLabel status={n.procurement_status} />
                          </td>
                        </tr>
                      );
                    })}
                    {(wf?.material_needs ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-500">
                          Belum ada daftar material gudang terhubung pada workflow proyek ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {prjMatReqs.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Surat Permintaan Material (SPM) Terkait ({prjMatReqs.length})
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {prjMatReqs.map((mr) => (
                      <div
                        key={mr.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-blue-700">
                            {mr.request_number}
                          </span>{' '}
                          · <span className="text-slate-700">{mr.notes}</span>
                        </div>
                        <StatusLabel status={mr.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Submenu 4: Dokumen Proyek */}
      {projectSubmenu === 'dokumen' && activeContextProject && (() => {
        const prj = activeContextProject;
        const prjDocs = state.documents.filter((d) => d.project_id === prj.id && !d.is_deleted);
        const archivedDocs = state.documents.filter(
          (d) => d.project_id === prj.id && Boolean(d.is_deleted)
        );

        return (
          <div className="space-y-5">
            <ProjectPhotoDocsSection project={prj} />

            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
              <AttachmentPanel
                moduleId="proyek"
                entityId={prj.id}
                entityLabel={`${prj.project_number} — ${prj.name}`}
                defaultCategory="SPK"
                categoryOptions={PROJECT_DOC_CATEGORIES}
                heading={`Dokumen Proyek — ${prj.project_number}`}
                subtitle="Unggah, pratinjau, unduh, edit keterangan, dan kelola arsip SPK, RAB, Gambar Bangunan, Surat, Foto Kondisi Awal, serta Dokumen Lainnya."
              />
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1D7AFC]" />
                  <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
                    Surat & Berita Acara Resmi Proyek ({prjDocs.length})
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  {canRestore && archivedDocs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowArchivedDocs((v) => !v)}
                      className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      Arsip Surat ({archivedDocs.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveModule('dokumen')}
                    className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                  >
                    Buka Modul Surat & Dokumen
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {prjDocs.map((d) => (
                  <div
                    key={d.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-700">{d.doc_number}</span> ·{' '}
                      <span className="text-slate-500">{d.doc_type}</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{d.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusLabel status={d.status} />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDocumentId(d.id);
                          setActiveModule('dokumen');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                      >
                        Lihat Surat
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: 'doc', item: d })}
                          className="p-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                          title="Arsipkan / Hapus Surat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {prjDocs.length === 0 && (
                  <p className="py-4 text-xs text-slate-500">
                    Belum ada surat atau berita acara resmi yang terhubung ke proyek ini.
                  </p>
                )}
              </div>

              {canRestore && showArchivedDocs && archivedDocs.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-900">
                    Arsip Surat Terhapus ({archivedDocs.length})
                  </p>
                  <div className="divide-y divide-amber-200/70">
                    {archivedDocs.map((ad) => (
                      <div
                        key={ad.id}
                        className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-mono font-semibold">{ad.doc_number}</span> —{' '}
                          <span className="font-semibold text-slate-900">{ad.title}</span>
                          <p className="text-[11px] text-slate-600">
                            Dihapus oleh {ad.deleted_by_name ?? '-'} · Alasan: {ad.delete_reason ?? '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreDocument(ad.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Pulihkan</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Submenu 5: Riwayat Proyek */}
      {projectSubmenu === 'riwayat' && activeContextProject && (() => {
        const prj = activeContextProject;
        const wf = state.workflows.find((w) => w.project_id === prj.id);
        const prjLogs = state.activityLogs.filter((l) => l.project_id === prj.id);

        return (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <History className="w-4 h-4 text-[#1D7AFC]" />
                <h2 className="text-sm sm:text-base font-bold text-[#13233C]">
                  Riwayat Workflow & Progres Lapangan — {prj.project_number}
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {[...(wf?.history ?? [])].reverse().map((h) => (
                  <div
                    key={h.id}
                    className="py-3 flex flex-wrap items-start justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900">{h.action}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-blue-700">{h.actor_name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">
                          {h.actor_division}
                        </span>
                      </div>
                      <p className="text-slate-600">{h.note}</p>
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {formatDateTimeID(h.timestamp)}
                    </span>
                  </div>
                ))}
                {(wf?.history ?? []).length === 0 && (
                  <p className="py-4 text-xs text-slate-500">
                    Belum ada riwayat transisi workflow untuk proyek ini.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-[#13233C]">
                Log Aktivitas & Audit Perubahan Proyek ({prjLogs.length})
              </h3>
              <div className="divide-y divide-slate-100">
                {prjLogs.map((log) => (
                  <div
                    key={log.id}
                    className="py-3 flex flex-wrap items-start justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-blue-700">{log.activity_type}</span> ·{' '}
                      <span className="font-semibold text-slate-900">{log.employee_name}</span>{' '}
                      <span className="text-slate-500">({log.division_name})</span>
                      <p className="text-slate-700 mt-0.5">{log.description}</p>
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {formatDateTimeID(log.timestamp)}
                    </span>
                  </div>
                ))}
                {prjLogs.length === 0 && (
                  <p className="py-4 text-xs text-slate-500">
                    Belum ada log aktivitas tercatat untuk proyek ini.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {renderSharedDialogs()}
    </div>
  );
};
