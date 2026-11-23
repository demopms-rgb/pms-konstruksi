import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileArchive,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  History,
  Lock,
  Paperclip,
  PenTool,
  Printer,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useAttachments } from '../../context/AttachmentContext';
import { usePMS } from '../../context/PMSContext';
import { AttachmentCategory, AttachmentMetadata } from '../../types/attachment';
import {
  DocumentCategoryGroup,
  DocumentStatus,
  DocumentType,
  InternalDocument,
  ModuleKey,
} from '../../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from '../../utils/format';
import {
  canApproveInternalDocument,
  canArchiveOrRestoreInternalDocument,
  canEditInternalDocument,
  canReviseInternalDocument,
  canSubmitInternalDocument,
  isDocumentFinalizedStatus,
} from '../../utils/permissions';
import {
  ALL_DOC_TYPES,
  classifyDocumentBucket,
  computeAutoDocNumberPreview,
  DOC_CATEGORY_GROUPS,
  DOC_TYPES_BY_CATEGORY,
  downloadDocumentBundleZip,
  exportDokumenReportExcel,
  exportDokumenReportPdf,
  generateOfficialDocumentPdfBytes,
  getDocCategoryGroup,
  getDocTypeFormHint,
  isApprovalRequiredDocType,
  openDokumenReportPrintA4Window,
  openOfficialDocumentPrintWindow,
  UnifiedDocumentRecord,
  buildUnifiedDocuments,
} from '../../utils/dokumenExport';
import { downloadPdfBytes, fetchVerifiedAttachmentBytes } from '../../utils/pdfUtils';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ConfirmDialog, EmptyState, Modal, StatusLabel } from '../ui/CommonUI';
import { PdfPreviewModal } from '../ui/PdfPreviewModal';

const DOKUMEN_ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  'Lampiran Umum',
  'Kontrak / SPK',
  'Addendum / Berita Acara',
  'Dokumen RAB',
  'Gambar Kerja',
  'Surat Jalan / Nota Material',
  'Invoice / Bukti Pembayaran',
  'Lampiran Persetujuan',
  'Laporan & Dokumentasi',
];

function mapDocTypeToAttachmentCategory(docType: string): AttachmentCategory {
  const dt = docType.toLowerCase();
  if (dt.includes('kontrak')) return 'Kontrak / SPK';
  if (dt.includes('berita acara') || dt.includes('bast')) return 'Addendum / Berita Acara';
  if (dt.includes('rab')) return 'Dokumen RAB';
  if (dt.includes('gambar') || dt.includes('spesifikasi')) return 'Gambar Kerja';
  if (dt.includes('surat jalan') || dt.includes('permintaan')) return 'Surat Jalan / Nota Material';
  if (dt.includes('anggaran') || dt.includes('persetujuan')) return 'Lampiran Persetujuan';
  if (dt.includes('laporan')) return 'Laporan & Dokumentasi';
  return 'Lampiran Umum';
}

// =========================================================================
// SIGNATURE PAD MODAL (ELECTRONIC APPROVAL SIGNATURE)
// =========================================================================

interface SignatureApprovalModalProps {
  open: boolean;
  record: UnifiedDocumentRecord | null;
  signerName: string;
  signerPosition: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string, signatureDataUrl?: string) => void;
}

const SignatureApprovalModal: React.FC<SignatureApprovalModalProps> = ({
  open,
  record,
  signerName,
  signerPosition,
  busy,
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [note, setNote] = useState('Disetujui dan disahkan secara elektronik.');

  const getPointerPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    const pos = getPointerPos(e);
    ctx.strokeStyle = '#13233C';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const moveDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const sigUrl = hasDrawn && canvas ? canvas.toDataURL('image/png') : undefined;
    onConfirm(note.trim() || 'Disetujui dan disahkan secara elektronik.', sigUrl);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Pengesahan & Tanda Tangan Elektronik"
      subtitle={
        record ? `${record.doc_number} — ${record.title}` : undefined
      }
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-slate-700 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#1D7AFC] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-900">
              Pejabat Penanda Tangan: {signerName} ({signerPosition})
            </p>
            <p className="text-slate-600 mt-0.5">
              Setelah disetujui, dokumen akan dikunci dengan hash verifikasi elektronik. Perubahan lebih lanjut hanya dapat dilakukan melalui mekanisme Revisi Resmi.
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-semibold text-slate-800">
              Goresan Tanda Tangan Elektronik (Opsional — tetap menghasilkan E-Sign Hash resmi)
            </label>
            {hasDrawn && (
              <button
                type="button"
                onClick={clearCanvas}
                className="text-[#1D7AFC] hover:underline font-semibold cursor-pointer"
              >
                Bersihkan Kanvas
              </button>
            )}
          </div>
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={540}
              height={150}
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
              className="w-full h-36 cursor-crosshair touch-none bg-[linear-gradient(to_bottom,transparent_95%,#f1f5f9_95%)] bg-[length:100%_24px]"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Gambar tanda tangan di area atas, atau langsung klik Setujui untuk menggunakan segel tanda tangan digital terenkripsi.
          </p>
        </div>

        <div>
          <label className="block font-semibold text-slate-800 mb-1">
            Catatan Pengesahan
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan persetujuan untuk arsip & pemohon..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1D7AFC]"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{busy ? 'Menyimpan...' : 'Setujui & Tanda Tangani'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

// =========================================================================
// MAIN MODULE COMPONENT
// =========================================================================

export const DokumenModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    isOnline,
    workflowBusy,
    setActiveModule,
    setSelectedProjectId,
    createDocumentApi,
    updateDocumentApi,
    reviseDocumentApi,
    advanceDocumentStatus,
    softDeleteDocument,
    restoreDocument,
    saveOfflineDraft,
    showToast,
  } = usePMS();

  const {
    attachments,
    refreshAttachments,
    getSignedUrl,
  } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divisionCode = currentDivision?.code ?? 'TEKNIK';
  const userDivId = currentUser?.division_id ?? '';
  const userId = currentUser?.id ?? '';

  // Unified list across internal documents & all integrated modules
  const allUnified = useMemo(
    () => buildUnifiedDocuments({ state, attachments }),
    [state, attachments]
  );

  const activeUnified = useMemo(
    () => allUnified.filter((d) => !d.is_deleted),
    [allUnified]
  );

  const archivedInternalDocs = useMemo(
    () => allUnified.filter((d) => d.sourceType === 'internal' && d.is_deleted),
    [allUnified]
  );

  // Dashboard 4 KPIs (computed strictly from live unified records)
  const kpiStats = useMemo(() => {
    let menunggu = 0;
    let disetujui = 0;
    let selesai = 0;
    for (const r of activeUnified) {
      const b = classifyDocumentBucket(r.status);
      if (b === 'menunggu') menunggu += 1;
      else if (b === 'disetujui') disetujui += 1;
      else if (b === 'selesai') selesai += 1;
    }
    return {
      total: activeUnified.length,
      menunggu,
      disetujui,
      selesai,
    };
  }, [activeUnified]);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | DocumentCategoryGroup>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'internal' | 'integrated'>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showArchiveBin, setShowArchiveBin] = useState(false);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: activeUnified.length };
    for (const cat of DOC_CATEGORY_GROUPS) map[cat] = 0;
    for (const r of activeUnified) {
      map[r.category_group] = (map[r.category_group] || 0) + 1;
    }
    return map;
  }, [activeUnified]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeUnified.filter((d) => {
      if (categoryFilter !== 'ALL' && d.category_group !== categoryFilter) return false;
      if (sourceFilter !== 'ALL' && d.sourceType !== sourceFilter) return false;
      if (projectFilter !== 'ALL' && d.project_id !== projectFilter) return false;
      if (divisionFilter !== 'ALL' && d.division_id !== divisionFilter) return false;
      if (dateFrom && d.doc_date < dateFrom) return false;
      if (dateTo && d.doc_date > dateTo) return false;

      if (statusFilter !== 'ALL') {
        const b = classifyDocumentBucket(d.status);
        if (statusFilter === 'MENUNGGU' && b !== 'menunggu') return false;
        if (statusFilter === 'DISETUJUI' && b !== 'disetujui') return false;
        if (statusFilter === 'SELESAI' && b !== 'selesai') return false;
        if (statusFilter === 'DRAFT' && b !== 'draft') return false;
        if (statusFilter === 'REVISI' && b !== 'revisi') return false;
      }

      if (q) {
        const hitAttachment = d.linkedAttachments.some((att) =>
          att.original_name.toLowerCase().includes(q)
        );
        const hay = `${d.doc_number} ${d.doc_type} ${d.category_group} ${d.title} ${d.project_label} ${d.creator_name} ${d.division_name} ${d.sourceModule} ${d.status}`.toLowerCase();
        if (!hay.includes(q) && !hitAttachment) return false;
      }
      return true;
    });
  }, [
    activeUnified,
    categoryFilter,
    sourceFilter,
    projectFilter,
    divisionFilter,
    dateFrom,
    dateTo,
    statusFilter,
    search,
  ]);

  // Recent Documents & Activity Log
  const recentDocs = useMemo(() => activeUnified.slice(0, 5), [activeUnified]);

  const documentActivities = useMemo(() => {
    return (state.activityLogs || [])
      .filter((log) => {
        const t = `${log.activity_type} ${log.description}`.toLowerCase();
        return (
          t.includes('dokumen') ||
          t.includes('surat') ||
          t.includes('persetujuan') ||
          t.includes('revisi') ||
          t.includes('lampiran') ||
          t.includes('arsip')
        );
      })
      .slice(0, 6);
  }, [state.activityLogs]);

  // Selection / Modals state
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const selectedRecord = useMemo(
    () => allUnified.find((r) => r.id === selectedRecordId) || null,
    [allUnified, selectedRecordId]
  );

  // Create / Edit Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingInternalDoc, setEditingInternalDoc] = useState<InternalDocument | null>(null);
  const [draftAttachEntityId, setDraftAttachEntityId] = useState<string>('');
  const [formCategory, setFormCategory] = useState<DocumentCategoryGroup>('Surat Operasional');
  const [formDocType, setFormDocType] = useState<DocumentType>('Surat Permintaan Material');
  const [useCustomDocNumber, setUseCustomDocNumber] = useState(false);
  const [customDocNumber, setCustomDocNumber] = useState('');
  const [formDocDate, setFormDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [formProjectId, setFormProjectId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formRefCode, setFormRefCode] = useState('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formEffectiveDate, setFormEffectiveDate] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formItemsSummary, setFormItemsSummary] = useState('');
  const [formError, setFormError] = useState('');

  // Quick Upload Dokumen Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTargetMode, setUploadTargetMode] = useState<'new' | 'existing' | 'general'>('new');
  const [uploadExistingDocId, setUploadExistingDocId] = useState<string>('');
  const [uploadNewCategory, setUploadNewCategory] = useState<DocumentCategoryGroup>('Dokumen Proyek');
  const [uploadNewDocType, setUploadNewDocType] = useState<DocumentType>('RAB');
  const [uploadNewProjectId, setUploadNewProjectId] = useState<string>('');
  const [uploadNewTitle, setUploadNewTitle] = useState<string>('');
  const [uploadNewNotes, setUploadNewNotes] = useState<string>('');
  const [uploadNewEntityId, setUploadNewEntityId] = useState<string>('');

  // Preview Modal (PDF / Image / Generated Official PDF)
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    record: UnifiedDocumentRecord;
    attachments: AttachmentMetadata[];
    activeAttIndex: number;
    generatedBytes: Uint8Array | null;
  } | null>(null);

  // Workflow Confirmations (Submit, Diperiksa, Revisi/Tolak, Selesai, Batal, Arsipkan)
  const [workflowActionModal, setWorkflowActionModal] = useState<{
    docId: string;
    docNumber: string;
    nextStatus: DocumentStatus;
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    requireNote?: boolean;
  } | null>(null);

  const [signatureModalRecord, setSignatureModalRecord] =
    useState<UnifiedDocumentRecord | null>(null);

  // Formal Revision Modal for Finalized Documents
  const [reviseModalDoc, setReviseModalDoc] = useState<InternalDocument | null>(null);
  const [reviseReason, setReviseReason] = useState('');
  const [reviseTitle, setReviseTitle] = useState('');
  const [reviseDetails, setReviseDetails] = useState('');
  const [reviseItems, setReviseItems] = useState('');
  const [reviseResubmit, setReviseResubmit] = useState(false);

  // Archive (Soft Delete) Modal
  const [deletingDoc, setDeletingDoc] = useState<UnifiedDocumentRecord | null>(null);
  const [zipBusyId, setZipBusyId] = useState<string | null>(null);

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const editableExistingDocs = useMemo(
    () =>
      (state.documents || []).filter(
        (d) => !d.is_deleted && !isDocumentFinalizedStatus(d.status) && d.status !== 'Dibatalkan'
      ),
    [state.documents]
  );

  const autoDocNumberPreview = useMemo(
    () => computeAutoDocNumberPreview(state.documents || [], formDocType, formDocDate),
    [state.documents, formDocType, formDocDate]
  );

  const formHints = useMemo(() => getDocTypeFormHint(formDocType), [formDocType]);

  // Open Create Modal
  const openCreateModal = () => {
    setEditingInternalDoc(null);
    const cat: DocumentCategoryGroup = 'Surat Operasional';
    const dt: DocumentType = 'Surat Permintaan Material';
    setFormCategory(cat);
    setFormDocType(dt);
    setUseCustomDocNumber(false);
    setCustomDocNumber('');
    setFormDocDate(new Date().toISOString().slice(0, 10));
    setFormProjectId(activeProjects[0]?.id || '');
    setFormTitle('');
    setFormRecipient('');
    setFormRefCode('');
    setFormAmount('');
    setFormEffectiveDate('');
    setFormDetails('');
    setFormItemsSummary('');
    setFormError('');
    setDraftAttachEntityId(`doc-draft-${Date.now()}`);
    setShowFormModal(true);
  };

  // Open Edit Modal
  const openEditModal = (doc: InternalDocument) => {
    setEditingInternalDoc(doc);
    setFormCategory(doc.category_group || getDocCategoryGroup(doc.doc_type));
    setFormDocType(doc.doc_type);
    setUseCustomDocNumber(false);
    setCustomDocNumber(doc.doc_number);
    setFormDocDate(doc.doc_date);
    setFormProjectId(doc.project_id || '');
    setFormTitle(doc.title);
    setFormRecipient(doc.recipient_name || '');
    setFormRefCode(doc.reference_code || '');
    setFormAmount(doc.amount_value !== undefined ? String(doc.amount_value) : '');
    setFormEffectiveDate(doc.effective_date || '');
    setFormDetails(doc.details);
    setFormItemsSummary(doc.items_summary === '-' ? '' : doc.items_summary);
    setFormError('');
    setDraftAttachEntityId(doc.id);
    setShowFormModal(true);
  };

  const handleCategoryChangeInForm = (cat: DocumentCategoryGroup) => {
    setFormCategory(cat);
    const list = DOC_TYPES_BY_CATEGORY[cat];
    if (list && list.length > 0 && !list.includes(formDocType)) {
      setFormDocType(list[0]);
    }
  };

  const handleSubmitForm = async (submitMode: 'draft' | 'submit' | 'complete') => {
    setFormError('');
    if (!formTitle.trim() || !formDetails.trim()) {
      setFormError('Judul dokumen dan rincian isi dokumen wajib diisi.');
      return;
    }

    if (!isOnline) {
      if (!editingInternalDoc && formProjectId) {
        saveOfflineDraft({
          module: 'dokumen',
          title: formTitle.trim(),
          project_id: formProjectId,
          created_by_id: userId,
          payload: {
            doc_type: formDocType,
            title: formTitle.trim(),
            details: formDetails.trim(),
            items_summary: formItemsSummary.trim() || '-',
          },
        });
        setShowFormModal(false);
        return;
      }
      setFormError('Mode offline: hubungkan internet untuk menyimpan perubahan ke server.');
      return;
    }

    const parsedAmount = formAmount.trim() ? Number(formAmount.replace(/[^0-9.]/g, '')) : undefined;
    const attachmentsForDraft = attachments.filter(
      (a) => a.module_id === 'dokumen' && a.entity_id === draftAttachEntityId && a.status !== 'Diarsipkan'
    );
    const firstAttName = attachmentsForDraft[0]?.original_name;

    if (editingInternalDoc) {
      const res = await updateDocumentApi(editingInternalDoc.id, {
        doc_type: formDocType,
        doc_date: formDocDate,
        project_id: formProjectId,
        title: formTitle.trim(),
        details: formDetails.trim(),
        items_summary: formItemsSummary.trim() || '-',
        attachment_name: firstAttName || editingInternalDoc.attachment_name,
        recipient_name: formRecipient.trim() || undefined,
        reference_code: formRefCode.trim() || undefined,
        amount_value: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
        effective_date: formEffectiveDate || undefined,
      });
      if (!res.ok) {
        setFormError(res.message);
        return;
      }
      if (submitMode === 'submit' || submitMode === 'complete') {
        const nextStatus: DocumentStatus =
          submitMode === 'complete'
            ? 'Selesai'
            : isApprovalRequiredDocType(formDocType)
            ? 'Menunggu Persetujuan'
            : 'Diajukan';
        await advanceDocumentStatus(
          editingInternalDoc.id,
          nextStatus,
          'Diperbarui dan diajukan oleh pembuat dokumen.'
        );
      }
      setShowFormModal(false);
      if (res.document) setSelectedRecordId(res.document.id);
      return;
    }

    const res = await createDocumentApi({
      doc_type: formDocType,
      doc_number: useCustomDocNumber && customDocNumber.trim() ? customDocNumber.trim() : undefined,
      doc_date: formDocDate,
      project_id: formProjectId,
      title: formTitle.trim(),
      details: formDetails.trim(),
      items_summary: formItemsSummary.trim() || '-',
      attachment_name: firstAttName || '-',
      recipient_name: formRecipient.trim() || undefined,
      reference_code: formRefCode.trim() || undefined,
      amount_value: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      effective_date: formEffectiveDate || undefined,
      submit_mode: submitMode,
      draft_attachment_entity_id: draftAttachEntityId,
    });

    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    await refreshAttachments();
    setShowFormModal(false);
    if (res.document) setSelectedRecordId(res.document.id);
  };

  // Upload Dokumen Modal Handlers
  const openUploadModal = () => {
    setUploadTargetMode('new');
    setUploadExistingDocId(editableExistingDocs[0]?.id || '');
    setUploadNewCategory('Dokumen Proyek');
    setUploadNewDocType('RAB');
    setUploadNewProjectId(activeProjects[0]?.id || '');
    setUploadNewTitle('');
    setUploadNewNotes('');
    setUploadNewEntityId(`doc-draft-${Date.now()}`);
    setShowUploadModal(true);
  };

  const handleSaveUploadNewDoc = async (submitForApproval: boolean) => {
    if (!uploadNewTitle.trim()) {
      showToast('Masukkan judul dokumen terlebih dahulu sebelum menyimpan.');
      return;
    }
    const uploadedDraftFiles = attachments.filter(
      (a) => a.module_id === 'dokumen' && a.entity_id === uploadNewEntityId && a.status !== 'Diarsipkan'
    );
    const res = await createDocumentApi({
      doc_type: uploadNewDocType,
      doc_date: new Date().toISOString().slice(0, 10),
      project_id: uploadNewProjectId,
      title: uploadNewTitle.trim(),
      details:
        uploadNewNotes.trim() ||
        `Unggahan dokumen ${uploadNewDocType} (${uploadedDraftFiles.length} berkas lampiran).`,
      items_summary:
        uploadedDraftFiles.map((f) => f.original_name).join('; ') || 'Dokumen digital terlampir.',
      attachment_name: uploadedDraftFiles[0]?.original_name || '-',
      submit_mode: submitForApproval
        ? 'submit'
        : isApprovalRequiredDocType(uploadNewDocType)
        ? 'draft'
        : 'complete',
      draft_attachment_entity_id: uploadNewEntityId,
    });
    if (res.ok) {
      await refreshAttachments();
      setShowUploadModal(false);
      if (res.document) setSelectedRecordId(res.document.id);
    }
  };

  // Preview Logic (attachment if present, or official A4 PDF)
  const [previewUrls, setPreviewUrls] = useState<{
    inlineUrl: string | null;
    downloadUrl: string | null;
  }>({ inlineUrl: null, downloadUrl: null });

  const loadAttachmentUrlsForPreview = async (att: AttachmentMetadata) => {
    try {
      const [inlineUrl, downloadUrl] = await Promise.all([
        getSignedUrl(att.id, 'inline'),
        getSignedUrl(att.id, 'attachment'),
      ]);
      setPreviewUrls({ inlineUrl, downloadUrl });
    } catch {
      setPreviewUrls({ inlineUrl: null, downloadUrl: null });
    }
  };

  const openPreviewForRecord = async (
    record: UnifiedDocumentRecord,
    attIndex = -1
  ) => {
    const previewableAtts = record.linkedAttachments.filter((a) =>
      ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes((a.extension || '').toLowerCase())
    );

    if (attIndex >= 0 && previewableAtts[attIndex]) {
      setPreviewUrls({ inlineUrl: null, downloadUrl: null });
      setPreviewState({
        open: true,
        record,
        attachments: previewableAtts,
        activeAttIndex: attIndex,
        generatedBytes: null,
      });
      await loadAttachmentUrlsForPreview(previewableAtts[attIndex]);
      return;
    }

    // Default: if no attachment index forced and there is an uploaded PDF/image, let user preview official PDF OR switch to attachment
    try {
      const bytes = generateOfficialDocumentPdfBytes(record);
      setPreviewUrls({ inlineUrl: null, downloadUrl: null });
      setPreviewState({
        open: true,
        record,
        attachments: previewableAtts,
        activeAttIndex: -1,
        generatedBytes: bytes,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat pratinjau PDF dokumen.');
    }
  };

  const switchPreviewSource = async (nextIndex: number) => {
    if (!previewState) return;
    if (nextIndex < 0) {
      const bytes = generateOfficialDocumentPdfBytes(previewState.record);
      setPreviewUrls({ inlineUrl: null, downloadUrl: null });
      setPreviewState({
        ...previewState,
        activeAttIndex: -1,
        generatedBytes: bytes,
      });
      return;
    }
    const targetAtt = previewState.attachments[nextIndex];
    if (!targetAtt) return;
    setPreviewUrls({ inlineUrl: null, downloadUrl: null });
    setPreviewState({
      ...previewState,
      activeAttIndex: nextIndex,
      generatedBytes: null,
    });
    await loadAttachmentUrlsForPreview(targetAtt);
  };

  const handleDownloadOfficialPdf = (record: UnifiedDocumentRecord) => {
    try {
      const bytes = generateOfficialDocumentPdfBytes(record);
      const safeNum = record.doc_number.replace(/[^a-zA-Z0-9_-]+/g, '-');
      downloadPdfBytes(bytes, `${safeNum}-${record.doc_type}.pdf`);
      showToast(`Dokumen PDF ${record.doc_number} berhasil diunduh.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghasilkan PDF.');
    }
  };

  const handleDownloadZipBundle = async (record: UnifiedDocumentRecord) => {
    setZipBusyId(record.id);
    try {
      const safeNum = record.doc_number.replace(/[^a-zA-Z0-9_-]+/g, '-');
      const officialPdf = generateOfficialDocumentPdfBytes(record);
      const entries: { name: string; data: Uint8Array }[] = [
        { name: `${safeNum}-Dokumen-Resmi.pdf`, data: officialPdf },
      ];

      for (const att of record.linkedAttachments) {
        try {
          const url = await getSignedUrl(att.id, 'attachment');
          const fetched = await fetchVerifiedAttachmentBytes(url, att.extension);
          entries.push({ name: `lampiran/${att.original_name}`, data: fetched.bytes });
        } catch {
          // continue bundling remaining available files
        }
      }

      downloadDocumentBundleZip(`${safeNum}-Paket-Dokumen.zip`, entries);
      showToast(
        `Paket dokumen (${entries.length} berkas) untuk ${record.doc_number} berhasil diunduh.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat paket ZIP dokumen.');
    } finally {
      setZipBusyId(null);
    }
  };

  const reportExportMeta = useMemo(() => {
    const pObj = state.projects.find((p) => p.id === projectFilter);
    return {
      categoryLabel: categoryFilter === 'ALL' ? 'Semua Kategori' : categoryFilter,
      projectLabel: pObj ? `${pObj.project_number} - ${pObj.name}` : 'Semua Proyek',
      statusLabel: statusFilter === 'ALL' ? 'Semua Status' : statusFilter,
      periodLabel:
        dateFrom || dateTo
          ? `${dateFrom || 'Awal'} s.d. ${dateTo || 'Sekarang'}`
          : 'Seluruh Periode',
      preparedBy: `${currentUser?.full_name || 'Pengguna'} (${currentRole?.name || ''})`,
    };
  }, [
    state.projects,
    projectFilter,
    categoryFilter,
    statusFilter,
    dateFrom,
    dateTo,
    currentUser,
    currentRole,
  ]);

  const openOriginModule = (record: UnifiedDocumentRecord) => {
    if (record.project_id) {
      setSelectedProjectId(record.project_id);
    }
    setActiveModule(record.originModuleKey);
    setSelectedRecordId(null);
  };

  // Formal Revision Handler
  const openReviseModal = (doc: InternalDocument) => {
    setReviseModalDoc(doc);
    setReviseReason('');
    setReviseTitle(doc.title);
    setReviseDetails(doc.details);
    setReviseItems(doc.items_summary === '-' ? '' : doc.items_summary);
    setReviseResubmit(false);
  };

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviseModalDoc) return;
    if (!reviseReason.trim()) {
      showToast('Alasan revisi resmi wajib diisi.');
      return;
    }
    const res = await reviseDocumentApi(reviseModalDoc.id, {
      reason: reviseReason.trim(),
      title: reviseTitle.trim(),
      details: reviseDetails.trim(),
      items_summary: reviseItems.trim() || '-',
      resubmit: reviseResubmit,
    });
    if (res.ok) {
      setReviseModalDoc(null);
      if (res.document) setSelectedRecordId(res.document.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Surat & Dokumen Perusahaan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pusat pengendalian surat operasional, dokumen proyek, persetujuan berjenjang, tanda tangan elektronik, dan arsip terintegrasi lintas modul.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold whitespace-nowrap">
              <WifiOff className="w-3.5 h-3.5" /> Mode Offline
            </span>
          )}
          <button
            type="button"
            onClick={openUploadModal}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-[#1D7AFC]" />
            <span>Upload Dokumen</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1e3559] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4 text-[#FBC02D]" />
            <span>Buat Dokumen / Surat Baru</span>
          </button>
        </div>
      </div>

      {/* 4 Live KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('ALL');
            setShowArchiveBin(false);
          }}
          className={`text-left rounded-xl border p-4 bg-white transition-colors cursor-pointer ${
            statusFilter === 'ALL' && !showArchiveBin
              ? 'border-[#1D7AFC] ring-1 ring-[#1D7AFC]/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Dokumen
            </span>
            <FileText className="w-4 h-4 text-[#13233C]" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {kpiStats.total}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Internal & terintegrasi lintas divisi
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'MENUNGGU' ? 'ALL' : 'MENUNGGU');
            setShowArchiveBin(false);
          }}
          className={`text-left rounded-xl border p-4 bg-white transition-colors cursor-pointer ${
            statusFilter === 'MENUNGGU'
              ? 'border-amber-500 ring-1 ring-amber-500/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Menunggu Persetujuan
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-2">
            {kpiStats.menunggu}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Diajukan / pemeriksaan pejabat berwenang
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'DISETUJUI' ? 'ALL' : 'DISETUJUI');
            setShowArchiveBin(false);
          }}
          className={`text-left rounded-xl border p-4 bg-white transition-colors cursor-pointer ${
            statusFilter === 'DISETUJUI'
              ? 'border-emerald-600 ring-1 ring-emerald-600/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Dokumen Disetujui
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
            {kpiStats.disetujui}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Telah disahkan & bertanda tangan digital
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'SELESAI' ? 'ALL' : 'SELESAI');
            setShowArchiveBin(false);
          }}
          className={`text-left rounded-xl border p-4 bg-white transition-colors cursor-pointer ${
            statusFilter === 'SELESAI'
              ? 'border-[#1D7AFC] ring-1 ring-[#1D7AFC]/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Dokumen Selesai / Arsip
            </span>
            <Archive className="w-4 h-4 text-[#1D7AFC]" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {kpiStats.selesai}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Selesai diproses & tersimpan di arsip
          </p>
        </button>
      </div>

      {/* Category Filter Strip (6 Categories without excessive submenus) */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('ALL');
                setShowArchiveBin(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                categoryFilter === 'ALL' && !showArchiveBin
                  ? 'bg-[#13233C] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Kategori ({categoryCounts.ALL || 0})
            </button>
            {DOC_CATEGORY_GROUPS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  setShowArchiveBin(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  categoryFilter === cat && !showArchiveBin
                    ? 'bg-[#13233C] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat} ({categoryCounts[cat] || 0})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSourceFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                sourceFilter === 'ALL'
                  ? 'bg-blue-50 text-[#1D7AFC] border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Semua Sumber
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('internal')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                sourceFilter === 'internal'
                  ? 'bg-blue-50 text-[#1D7AFC] border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Dokumen Internal
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('integrated')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                sourceFilter === 'integrated'
                  ? 'bg-blue-50 text-[#1D7AFC] border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Terintegrasi Modul
            </button>
            {(roleCode === 'SUPER_ADMIN' || roleCode === 'HEAD') &&
              archivedInternalDocs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchiveBin((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-1 ${
                    showArchiveBin
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Arsip Terhapus ({archivedInternalDocs.length})</span>
                </button>
              )}
          </div>
        </div>

        {/* Search, Advanced Filters & Export Toolbox */}
        {!showArchiveBin && (
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-2.5 items-center">
            <div className="relative xl:col-span-3">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nomor, judul, proyek, pembuat, nama lampiran..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-[#1D7AFC]"
              />
            </div>

            <div className="xl:col-span-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
              >
                <option value="ALL">Semua Proyek</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
              >
                <option value="ALL">Semua Divisi</option>
                {state.divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    {div.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
              >
                <option value="ALL">Semua Status</option>
                <option value="DRAFT">Draft</option>
                <option value="MENUNGGU">Menunggu Persetujuan</option>
                <option value="DISETUJUI">Disetujui</option>
                <option value="REVISI">Perlu Revisi / Ditolak</option>
                <option value="SELESAI">Selesai / Diarsipkan</option>
              </select>
            </div>

            <div className="xl:col-span-3 flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Tanggal Mulai"
                className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
              />
              <span className="text-slate-400 text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Tanggal Selesai"
                className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
              />
            </div>

            {/* Export & Reset bar */}
            <div className="md:col-span-2 xl:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <span>
                  Menampilkan <strong className="text-slate-800 font-mono">{filteredDocs.length}</strong> dokumen terpadu
                </span>
                {(search ||
                  categoryFilter !== 'ALL' ||
                  sourceFilter !== 'ALL' ||
                  projectFilter !== 'ALL' ||
                  divisionFilter !== 'ALL' ||
                  statusFilter !== 'ALL' ||
                  dateFrom ||
                  dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setCategoryFilter('ALL');
                      setSourceFilter('ALL');
                      setProjectFilter('ALL');
                      setDivisionFilter('ALL');
                      setStatusFilter('ALL');
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-[#1D7AFC] hover:underline font-semibold cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={filteredDocs.length === 0}
                  onClick={() => exportDokumenReportPdf(filteredDocs, reportExportMeta)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5 text-red-600" />
                  <span>Export PDF</span>
                </button>
                <button
                  type="button"
                  disabled={filteredDocs.length === 0}
                  onClick={() => exportDokumenReportExcel(filteredDocs, reportExportMeta)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export Excel</span>
                </button>
                <button
                  type="button"
                  disabled={filteredDocs.length === 0}
                  onClick={() => openDokumenReportPrintA4Window(filteredDocs, reportExportMeta)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-700" />
                  <span>Cetak A4</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Archive / Restore Bin */}
      {showArchiveBin ? (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Arsip Dokumen Internal Terhapus
              </h2>
              <p className="text-xs text-slate-600">
                Dokumen internal yang diarsipkan tetap menyimpan riwayat pengesahan & dapat dipulihkan oleh Head Divisi atau Super Admin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowArchiveBin(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Kembali ke Daftar Aktif
            </button>
          </div>
          {archivedInternalDocs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Tidak ada dokumen dalam arsip terhapus.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {archivedInternalDocs.map((ad) => {
                const canRestore =
                  ad.internalDoc &&
                  canArchiveOrRestoreInternalDocument(roleCode, divisionCode, userDivId, ad.internalDoc);
                return (
                  <div
                    key={ad.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="text-xs">
                      <p className="font-mono font-bold text-slate-900">
                        {ad.doc_number} · {ad.doc_type}
                      </p>
                      <p className="font-semibold text-slate-800 mt-0.5">{ad.title}</p>
                      <p className="text-slate-500 mt-0.5">
                        Diarsipkan oleh {ad.internalDoc?.deleted_by_name || '-'} · Alasan:{' '}
                        {ad.internalDoc?.delete_reason || '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordId(ad.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Lihat Detail
                      </button>
                      {canRestore && (
                        <button
                          type="button"
                          disabled={workflowBusy}
                          onClick={() => void restoreDocument(ad.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Pulihkan</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Main Document Table (Desktop) + Card Stack (Mobile) */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredDocs.length === 0 ? (
            <EmptyState
              title="Tidak ada dokumen yang cocok"
              description="Ubah kata kunci pencarian atau filter kategori, atau buat dokumen resmi baru."
              actionLabel="Buat Dokumen Baru"
              onAction={openCreateModal}
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Nomor Dokumen</th>
                      <th className="py-3 px-3">Jenis Dokumen</th>
                      <th className="py-3 px-3">Judul Dokumen</th>
                      <th className="py-3 px-3">Proyek Terkait</th>
                      <th className="py-3 px-3">Pembuat & Divisi</th>
                      <th className="py-3 px-3">Tanggal</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDocs.map((rec) => {
                      const canEdit =
                        rec.internalDoc &&
                        canEditInternalDocument(roleCode, userDivId, userId, rec.internalDoc);
                      return (
                        <tr
                          key={rec.id}
                          className="hover:bg-slate-50/80 transition-colors align-top"
                        >
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-slate-900 whitespace-nowrap">
                              {rec.doc_number}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  rec.sourceType === 'internal'
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-blue-50 text-[#1D7AFC] border-blue-200'
                                }`}
                              >
                                {rec.sourceModule}
                              </span>
                              {rec.revision_no > 1 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Rev v{rec.revision_no}
                                </span>
                              )}
                              {rec.digital_signature_hash && (
                                <span
                                  title={`E-Sign Verified: ${rec.digital_signature_hash}`}
                                  className="inline-flex items-center text-emerald-700"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-800">{rec.doc_type}</p>
                            <p className="text-[11px] text-slate-500">{rec.category_group}</p>
                          </td>
                          <td className="py-3 px-3 max-w-xs">
                            <button
                              type="button"
                              onClick={() => setSelectedRecordId(rec.id)}
                              className="text-left font-semibold text-slate-900 hover:text-[#1D7AFC] line-clamp-2 cursor-pointer"
                            >
                              {rec.title}
                            </button>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="w-3 h-3" />
                                {rec.linkedAttachments.length} lampiran
                              </span>
                              {rec.amount_value && rec.amount_value > 0 ? (
                                <span className="font-mono text-slate-700">
                                  · {formatRupiah(rec.amount_value)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[180px]">
                            <span className="line-clamp-2">{rec.project_label}</span>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-800">{rec.creator_name}</p>
                            <p className="text-[11px] text-slate-500">{rec.division_name}</p>
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatDateID(rec.doc_date)}
                          </td>
                          <td className="py-3 px-3">
                            <StatusLabel status={rec.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordId(rec.id)}
                                title="Detail Dokumen"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void openPreviewForRecord(rec)}
                                title="Preview Dokumen"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 text-[#1D7AFC] cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (rec.linkedAttachments.length > 0) {
                                    void openPreviewForRecord(rec, 0);
                                  } else {
                                    setSelectedRecordId(rec.id);
                                  }
                                }}
                                title={`Lampiran (${rec.linkedAttachments.length})`}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 relative cursor-pointer"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                {rec.linkedAttachments.length > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 px-1 min-w-[15px] h-[15px] rounded-full bg-[#1D7AFC] text-white text-[9px] font-bold flex items-center justify-center">
                                    {rec.linkedAttachments.length}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadOfficialPdf(rec)}
                                title="Download PDF Resmi"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openOfficialDocumentPrintWindow(rec)}
                                title="Cetak A4"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && rec.internalDoc && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(rec.internalDoc!)}
                                  title="Edit Dokumen"
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 text-amber-700 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
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

              {/* Mobile Card Stack */}
              <div className="lg:hidden divide-y divide-slate-100">
                {filteredDocs.map((rec) => (
                  <div key={rec.id} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono font-bold text-slate-900">{rec.doc_number}</p>
                        <p className="text-[11px] text-slate-500">
                          {rec.doc_type} · {rec.sourceModule}
                        </p>
                      </div>
                      <StatusLabel status={rec.status} />
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">{rec.title}</p>
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p>Proyek: {rec.project_label}</p>
                      <p>
                        Pembuat: {rec.creator_name} ({rec.division_name}) ·{' '}
                        {formatDateID(rec.doc_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordId(rec.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#13233C] text-white font-semibold inline-flex items-center gap-1"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> Detail
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPreviewForRecord(rec)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadOfficialPdf(rec)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => openOfficialDocumentPrintWindow(rec)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Cetak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent Documents & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Dokumen Terbaru</h2>
            <span className="text-[11px] text-slate-500 font-medium">
              5 entri terkini lintas modul
            </span>
          </div>
          {recentDocs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Belum ada dokumen.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedRecordId(doc.id)}
                      className="font-semibold text-slate-900 hover:text-[#1D7AFC] truncate block text-left cursor-pointer"
                    >
                      {doc.title}
                    </button>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      <span className="font-mono font-semibold text-slate-700">
                        {doc.doc_number}
                      </span>{' '}
                      · {doc.sourceModule} · {formatDateID(doc.doc_date)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusLabel status={doc.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Aktivitas Dokumen & Persetujuan</h2>
            <History className="w-4 h-4 text-slate-400" />
          </div>
          {documentActivities.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Belum ada aktivitas dokumen tercatat.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {documentActivities.map((act) => (
                <div key={act.id} className="py-2.5 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{act.activity_type}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatDateTimeID(act.timestamp)}
                    </span>
                  </div>
                  <p className="text-slate-600 line-clamp-2">{act.description}</p>
                  <p className="text-[11px] text-slate-400">
                    {act.employee_name} · {act.division_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* DETAIL DOKUMEN MODAL                                              */}
      {/* ================================================================= */}
      <Modal
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecordId(null)}
        title={selectedRecord ? `${selectedRecord.doc_type} — ${selectedRecord.doc_number}` : ''}
        subtitle={
          selectedRecord
            ? `${selectedRecord.category_group} · ${selectedRecord.sourceModule} · Revisi v${selectedRecord.revision_no}`
            : undefined
        }
        maxWidth="max-w-4xl"
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs">
            {/* Status & Quick Actions Bar */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel status={selectedRecord.status} />
                {selectedRecord.internalDoc?.is_final_locked && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[11px] font-semibold">
                    <Lock className="w-3 h-3" /> Terkunci Final
                  </span>
                )}
                {selectedRecord.digital_signature_hash && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-semibold">
                    <ShieldCheck className="w-3 h-3" /> E-Sign: {selectedRecord.digital_signature_hash}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void openPreviewForRecord(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#1D7AFC]" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadOfficialPdf(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  disabled={zipBusyId === selectedRecord.id}
                  onClick={() => void handleDownloadZipBundle(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileArchive className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {zipBusyId === selectedRecord.id ? 'Mengemas...' : 'Download PDF + Lampiran'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openOfficialDocumentPrintWindow(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg bg-[#13233C] hover:bg-[#1e3559] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#FBC02D]" />
                  <span>Cetak A4</span>
                </button>
                {selectedRecord.sourceType === 'integrated' && (
                  <button
                    type="button"
                    onClick={() => openOriginModule(selectedRecord)}
                    className="px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Modul {selectedRecord.sourceModule}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Workflow Controls for Native Internal Document */}
            {selectedRecord.internalDoc && !selectedRecord.is_deleted && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">Kontrol Alur & Pengesahan:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Edit button when not locked */}
                  {canEditInternalDocument(
                    roleCode,
                    userDivId,
                    userId,
                    selectedRecord.internalDoc
                  ) && (
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedRecord.internalDoc!)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Isi</span>
                    </button>
                  )}

                  {/* Submit for approval */}
                  {(selectedRecord.status === 'Draft' ||
                    selectedRecord.status === 'Perlu Revisi' ||
                    selectedRecord.status === 'Ditolak') &&
                    canSubmitInternalDocument(
                      roleCode,
                      userDivId,
                      userId,
                      selectedRecord.internalDoc
                    ) && (
                      <button
                        type="button"
                        disabled={workflowBusy}
                        onClick={() =>
                          setWorkflowActionModal({
                            docId: selectedRecord.id,
                            docNumber: selectedRecord.doc_number,
                            nextStatus: isApprovalRequiredDocType(selectedRecord.internalDoc!.doc_type)
                              ? 'Menunggu Persetujuan'
                              : 'Diajukan',
                            title: `Ajukan Dokumen ${selectedRecord.doc_number}?`,
                            description:
                              'Dokumen akan diteruskan ke antrean pemeriksaan pejabat berwenang.',
                            confirmLabel: 'Ya, Ajukan Sekarang',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Ajukan</span>
                      </button>
                    )}

                  {/* Mark Diperiksa */}
                  {(selectedRecord.status === 'Diajukan' ||
                    selectedRecord.status === 'Menunggu Persetujuan') &&
                    canApproveInternalDocument(
                      roleCode,
                      divisionCode,
                      userDivId,
                      selectedRecord.internalDoc
                    ) && (
                      <button
                        type="button"
                        disabled={workflowBusy}
                        onClick={() =>
                          setWorkflowActionModal({
                            docId: selectedRecord.id,
                            docNumber: selectedRecord.doc_number,
                            nextStatus: 'Diperiksa',
                            title: `Tandai "${selectedRecord.doc_number}" Sedang Diperiksa?`,
                            description: 'Status berubah menjadi Diperiksa sebelum pengesahan akhir.',
                            confirmLabel: 'Tandai Diperiksa',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 font-semibold cursor-pointer"
                      >
                        Tandai Diperiksa
                      </button>
                    )}

                  {/* Approve with Electronic Signature */}
                  {(selectedRecord.status === 'Diajukan' ||
                    selectedRecord.status === 'Menunggu Persetujuan' ||
                    selectedRecord.status === 'Diperiksa' ||
                    selectedRecord.status === 'Diperiksa Head') &&
                    canApproveInternalDocument(
                      roleCode,
                      divisionCode,
                      userDivId,
                      selectedRecord.internalDoc
                    ) && (
                      <>
                        <button
                          type="button"
                          disabled={workflowBusy}
                          onClick={() => setSignatureModalRecord(selectedRecord)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <PenTool className="w-3.5 h-3.5" />
                          <span>Setujui & Tanda Tangani</span>
                        </button>
                        <button
                          type="button"
                          disabled={workflowBusy}
                          onClick={() =>
                            setWorkflowActionModal({
                              docId: selectedRecord.id,
                              docNumber: selectedRecord.doc_number,
                              nextStatus: 'Perlu Revisi',
                              title: `Kembalikan "${selectedRecord.doc_number}" untuk Revisi?`,
                              description:
                                'Tuliskan catatan kekurangan atau koreksi yang harus diperbaiki pembuat dokumen.',
                              confirmLabel: 'Kembalikan untuk Revisi',
                              danger: true,
                              requireNote: true,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Kembalikan Revisi</span>
                        </button>
                      </>
                    )}

                  {/* Complete document */}
                  {(selectedRecord.status === 'Disetujui' ||
                    (!isApprovalRequiredDocType(selectedRecord.internalDoc.doc_type) &&
                      (selectedRecord.status === 'Draft' || selectedRecord.status === 'Diajukan') &&
                      (roleCode === 'SUPER_ADMIN' ||
                        roleCode === 'HEAD' ||
                        selectedRecord.internalDoc.creator_id === userId))) && (
                    <button
                      type="button"
                      disabled={workflowBusy}
                      onClick={() =>
                        setWorkflowActionModal({
                          docId: selectedRecord.id,
                          docNumber: selectedRecord.doc_number,
                          nextStatus: 'Selesai',
                          title: `Selesaikan & Arsipkan Resmi "${selectedRecord.doc_number}"?`,
                          description:
                            'Dokumen akan ditandai Selesai dan dikunci di arsip resmi perusahaan.',
                          confirmLabel: 'Tandai Selesai',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#13233C] hover:bg-[#1e3559] text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>Tandai Selesai</span>
                    </button>
                  )}

                  {/* Formal Revision when locked/finalized */}
                  {isDocumentFinalizedStatus(selectedRecord.status) &&
                    canReviseInternalDocument(
                      roleCode,
                      userDivId,
                      userId,
                      selectedRecord.internalDoc
                    ) && (
                      <button
                        type="button"
                        onClick={() => openReviseModal(selectedRecord.internalDoc!)}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Ajukan Revisi Resmi</span>
                      </button>
                    )}

                  {/* Archive (soft delete) */}
                  {canArchiveOrRestoreInternalDocument(
                    roleCode,
                    divisionCode,
                    userDivId,
                    selectedRecord.internalDoc
                  ) && (
                    <button
                      type="button"
                      onClick={() => setDeletingDoc(selectedRecord)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-red-600 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Arsipkan</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Official Document Paper View */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="bg-[#13233C] text-white px-5 py-4 border-b-2 border-[#FBC02D] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-[#FBC02D]">
                    PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI
                  </p>
                  <h3 className="text-base font-bold mt-0.5">{selectedRecord.title}</h3>
                </div>
                <div className="text-left sm:text-right font-mono text-[11px] shrink-0">
                  <p className="font-bold">{selectedRecord.doc_number}</p>
                  <p className="text-slate-300">{formatDateID(selectedRecord.doc_date)}</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Proyek Terkait</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {selectedRecord.project_label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Pembuat & Divisi</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {selectedRecord.creator_name} ({selectedRecord.division_name})
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Tujuan / Referensi
                    </p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {selectedRecord.recipient_name || '-'}{' '}
                      {selectedRecord.reference_code ? `(${selectedRecord.reference_code})` : ''}
                    </p>
                  </div>
                  {selectedRecord.amount_value !== undefined && selectedRecord.amount_value > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Nilai Nominal</p>
                      <p className="font-mono font-bold text-[#13233C] mt-0.5">
                        {formatRupiah(selectedRecord.amount_value)}
                      </p>
                    </div>
                  )}
                  {selectedRecord.effective_date && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Tanggal Efektif</p>
                      <p className="font-mono font-semibold text-slate-800 mt-0.5">
                        {formatDateID(selectedRecord.effective_date)}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Uraian / Isi Dokumen
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {selectedRecord.details}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Rincian Item, Volume & Catatan Tambahan
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800 whitespace-pre-wrap">
                    {selectedRecord.items_summary || '-'}
                  </div>
                </div>

                {/* Electronic Signature Block */}
                {(selectedRecord.approver_name || selectedRecord.digital_signature_hash) && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Pengesahan & Tanda Tangan Elektronik
                      </p>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {selectedRecord.approver_name}{' '}
                        {selectedRecord.approver_position
                          ? `— ${selectedRecord.approver_position}`
                          : ''}
                      </p>
                      {selectedRecord.approved_at && (
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Disahkan pada {formatDateTimeID(selectedRecord.approved_at)}
                        </p>
                      )}
                      {selectedRecord.digital_signature_hash && (
                        <p className="font-mono text-[11px] text-[#1D7AFC] mt-1">
                          Hash Verifikasi: {selectedRecord.digital_signature_hash}
                        </p>
                      )}
                    </div>
                    {selectedRecord.electronic_signature_data_url && (
                      <div className="bg-white border border-slate-200 rounded-lg p-2 shrink-0">
                        <img
                          src={selectedRecord.electronic_signature_data_url}
                          alt="Tanda Tangan Elektronik"
                          className="h-14 w-auto object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments Section */}
            {selectedRecord.sourceType === 'internal' && selectedRecord.internalDoc ? (
              <div className="space-y-2">
                {isDocumentFinalizedStatus(selectedRecord.status) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Dokumen final terkunci: penambahan atau perubahan lampiran hanya dapat dilakukan setelah membuka Revisi Resmi.
                    </span>
                  </div>
                )}
                <AttachmentPanel
                  moduleId="dokumen"
                  entityId={selectedRecord.id}
                  entityLabel={`${selectedRecord.doc_number} — ${selectedRecord.title}`}
                  defaultCategory={mapDocTypeToAttachmentCategory(selectedRecord.doc_type)}
                  categoryOptions={DOKUMEN_ATTACHMENT_CATEGORIES}
                  heading="Lampiran Berkas Dokumen"
                  subtitle="File PDF, gambar kerja, scan surat, atau foto dokumentasi yang melekat pada dokumen ini."
                  compact
                />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">
                    Lampiran Terhubung dari Modul {selectedRecord.sourceModule} (
                    {selectedRecord.linkedAttachments.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => openOriginModule(selectedRecord)}
                    className="text-[#1D7AFC] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Kelola di Modul Asal</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                {selectedRecord.linkedAttachments.length === 0 ? (
                  <p className="text-slate-500">
                    Tidak ada berkas fisik tambahan pada entitas modul asal. Anda tetap dapat mencetak atau mengunduh PDF resmi yang digenerasi otomatis di atas.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {selectedRecord.linkedAttachments.map((att, idx) => (
                      <div
                        key={att.id}
                        className="p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{att.original_name}</p>
                          <p className="text-[11px] text-slate-500">
                            {att.doc_category} · v{att.version} · Diunggah {att.uploaded_by_name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void openPreviewForRecord(selectedRecord, idx)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold shrink-0 cursor-pointer"
                        >
                          Pratinjau
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Revision & Approval History Timeline */}
            {selectedRecord.internalDoc && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                  <h4 className="font-bold text-slate-900">Riwayat Persetujuan & Status</h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(selectedRecord.internalDoc.history || []).map((h, i) => (
                      <div key={i} className="border-b border-slate-100 pb-2 last:border-none">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{h.action}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatDateTimeID(h.timestamp)}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">{h.note}</p>
                        <p className="text-[10px] text-slate-400">
                          {h.actor_name} ({h.role_label})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                  <h4 className="font-bold text-slate-900">
                    Catatan Revisi Versi ({selectedRecord.internalDoc.revisions?.length || 0})
                  </h4>
                  {(selectedRecord.internalDoc.revisions || []).length === 0 ? (
                    <p className="text-slate-500">
                      Dokumen masih berada pada versi awal (v1) tanpa revisi pasca-pengesahan.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {selectedRecord.internalDoc.revisions!.map((rev, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 space-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-amber-900">
                              Arsip Versi v{rev.revision_no} ({rev.status_before})
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {formatDateTimeID(rev.timestamp)}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-800">{rev.title}</p>
                          <p className="text-slate-600">Alasan Revisi: {rev.reason}</p>
                          <p className="text-[10px] text-slate-500">
                            Oleh {rev.actor_name} ({rev.role_label})
                            {rev.approved_by_name
                              ? ` · Disahkan sebelumnya oleh ${rev.approved_by_name}`
                              : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* CREATE / EDIT DOCUMENT MODAL                                      */}
      {/* ================================================================= */}
      <Modal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingInternalDoc ? `Edit Dokumen ${editingInternalDoc.doc_number}` : 'Buat Dokumen / Surat Baru'}
        subtitle="Penomoran otomatis unik, pemilihan kategori dinamis, dan dukungan lampiran multi-file langsung."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-xs">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Kategori Dokumen</label>
              <select
                value={formCategory}
                onChange={(e) => handleCategoryChangeInForm(e.target.value as DocumentCategoryGroup)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                {DOC_CATEGORY_GROUPS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Jenis Dokumen</label>
              <select
                value={formDocType}
                onChange={(e) => setFormDocType(e.target.value as DocumentType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                {(DOC_TYPES_BY_CATEGORY[formCategory] || ALL_DOC_TYPES).map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-800">Nomor Dokumen</label>
                {!editingInternalDoc && (
                  <label className="inline-flex items-center gap-1 text-[11px] text-[#1D7AFC] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomDocNumber}
                      onChange={(e) => setUseCustomDocNumber(e.target.checked)}
                    />
                    <span>Input Nomor Manual</span>
                  </label>
                )}
              </div>
              {editingInternalDoc ? (
                <input
                  type="text"
                  disabled
                  value={editingInternalDoc.doc_number}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 font-mono font-bold text-slate-700"
                />
              ) : useCustomDocNumber ? (
                <input
                  type="text"
                  value={customDocNumber}
                  onChange={(e) => setCustomDocNumber(e.target.value)}
                  placeholder={`Contoh: ${autoDocNumberPreview}`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
                />
              ) : (
                <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono font-semibold text-slate-700">
                  Otomatis: {autoDocNumberPreview}
                </div>
              )}
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Tanggal Dokumen</label>
              <input
                type="date"
                value={formDocDate}
                onChange={(e) => setFormDocDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Proyek Terkait</label>
              <select
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                <option value="">Umum Perusahaan (Non-Proyek)</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} - {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {formHints.recipientLabel}
              </label>
              <input
                type="text"
                value={formRecipient}
                onChange={(e) => setFormRecipient(e.target.value)}
                placeholder={formHints.recipientPlaceholder}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">Judul Dokumen *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={`Contoh: ${formDocType} — Pekerjaan Proyek`}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {formHints.referenceLabel}
              </label>
              <input
                type="text"
                value={formRefCode}
                onChange={(e) => setFormRefCode(e.target.value)}
                placeholder={formHints.referencePlaceholder}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {formHints.amountLabel}
              </label>
              <input
                type="number"
                min={0}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Tanggal Berlaku / Target
              </label>
              <input
                type="date"
                value={formEffectiveDate}
                onChange={(e) => setFormEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">Uraian / Isi Dokumen *</label>
            <textarea
              rows={3}
              value={formDetails}
              onChange={(e) => setFormDetails(e.target.value)}
              placeholder={formHints.detailsPlaceholder}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Rincian Item, Volume, atau Lampiran Pendukung
            </label>
            <textarea
              rows={2}
              value={formItemsSummary}
              onChange={(e) => setFormItemsSummary(e.target.value)}
              placeholder={formHints.itemsPlaceholder}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            />
          </div>

          {/* Integrated Multi-File Upload */}
          {draftAttachEntityId && (
            <AttachmentPanel
              moduleId="dokumen"
              entityId={draftAttachEntityId}
              entityLabel={formTitle.trim() || `${formDocType} (Draft Baru)`}
              defaultCategory={mapDocTypeToAttachmentCategory(formDocType)}
              categoryOptions={DOKUMEN_ATTACHMENT_CATEGORIES}
              heading="Upload Lampiran Multi-File"
              subtitle="Unggah PDF, gambar kerja, scan surat, atau foto pendukung langsung bersama dokumen ini."
              compact
            />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={workflowBusy}
              onClick={() => void handleSubmitForm('draft')}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer disabled:opacity-50"
            >
              {isOnline ? 'Simpan sebagai Draft' : 'Simpan Draft Offline'}
            </button>
            {isOnline &&
              (!isApprovalRequiredDocType(formDocType) ||
                roleCode === 'HEAD' ||
                roleCode === 'SUPER_ADMIN') && (
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() => void handleSubmitForm('complete')}
                  className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1e3559] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileCheck2 className="w-3.5 h-3.5 text-[#FBC02D]" />
                  <span>Simpan & Selesaikan</span>
                </button>
              )}
            {isOnline && (
              <button
                type="button"
                disabled={workflowBusy}
                onClick={() => void handleSubmitForm('submit')}
                className="px-4 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isApprovalRequiredDocType(formDocType)
                    ? 'Ajukan untuk Persetujuan'
                    : 'Simpan & Ajukan'}
                </span>
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* UPLOAD DOKUMEN MODAL                                              */}
      {/* ================================================================= */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Dokumen ke Pusat Arsip"
        subtitle="Unggah file PDF, gambar kerja, RAB, surat scan, atau berita acara untuk diarsipkan atau dilekatkan ke dokumen aktif."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setUploadTargetMode('new')}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                uploadTargetMode === 'new'
                  ? 'border-[#1D7AFC] bg-blue-50/70 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="font-bold">Dokumen Baru + File</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Buat entri bernomor resmi & unggah berkasnya sekaligus
              </p>
            </button>
            <button
              type="button"
              onClick={() => setUploadTargetMode('existing')}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                uploadTargetMode === 'existing'
                  ? 'border-[#1D7AFC] bg-blue-50/70 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="font-bold">Lampirkan ke Dokumen</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tambahkan file ke dokumen internal yang masih aktif
              </p>
            </button>
            <button
              type="button"
              onClick={() => setUploadTargetMode('general')}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                uploadTargetMode === 'general'
                  ? 'border-[#1D7AFC] bg-blue-50/70 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="font-bold">Arsip Lampiran Umum</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Simpan berkas referensi langsung ke arsip perusahaan
              </p>
            </button>
          </div>

          {uploadTargetMode === 'new' && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Kategori</label>
                  <select
                    value={uploadNewCategory}
                    onChange={(e) => {
                      const cat = e.target.value as DocumentCategoryGroup;
                      setUploadNewCategory(cat);
                      const list = DOC_TYPES_BY_CATEGORY[cat];
                      if (list?.[0]) setUploadNewDocType(list[0]);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    {DOC_CATEGORY_GROUPS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Jenis Dokumen</label>
                  <select
                    value={uploadNewDocType}
                    onChange={(e) => setUploadNewDocType(e.target.value as DocumentType)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    {(DOC_TYPES_BY_CATEGORY[uploadNewCategory] || ALL_DOC_TYPES).map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Proyek Terkait</label>
                  <select
                    value={uploadNewProjectId}
                    onChange={(e) => setUploadNewProjectId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="">Umum Perusahaan</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_number} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Judul Dokumen *</label>
                  <input
                    type="text"
                    value={uploadNewTitle}
                    onChange={(e) => setUploadNewTitle(e.target.value)}
                    placeholder={`Contoh: Scan ${uploadNewDocType} Proyek`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Catatan Singkat</label>
                  <input
                    type="text"
                    value={uploadNewNotes}
                    onChange={(e) => setUploadNewNotes(e.target.value)}
                    placeholder="Keterangan isi file yang diunggah..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>

              <AttachmentPanel
                moduleId="dokumen"
                entityId={uploadNewEntityId}
                entityLabel={uploadNewTitle.trim() || `Upload ${uploadNewDocType}`}
                defaultCategory={mapDocTypeToAttachmentCategory(uploadNewDocType)}
                categoryOptions={DOKUMEN_ATTACHMENT_CATEGORIES}
                heading="Unggah Berkas Dokumen (Multi-File)"
                compact
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() => void handleSaveUploadNewDoc(false)}
                  className="px-4 py-2 rounded-lg bg-[#13233C] text-white font-semibold cursor-pointer"
                >
                  Simpan Dokumen Terunggah
                </button>
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() => void handleSaveUploadNewDoc(true)}
                  className="px-4 py-2 rounded-lg bg-[#1D7AFC] text-white font-semibold cursor-pointer"
                >
                  Simpan & Ajukan Persetujuan
                </button>
              </div>
            </div>
          )}

          {uploadTargetMode === 'existing' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Pilih Dokumen Aktif Tujuan (Dokumen Final Terkunci tidak ditampilkan)
                </label>
                <select
                  value={uploadExistingDocId}
                  onChange={(e) => setUploadExistingDocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                >
                  {editableExistingDocs.length === 0 ? (
                    <option value="">Tidak ada dokumen aktif yang terbuka untuk lampiran</option>
                  ) : (
                    editableExistingDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.doc_number} — {d.title} ({d.status})
                      </option>
                    ))
                  )}
                </select>
              </div>
              {uploadExistingDocId && (
                <AttachmentPanel
                  moduleId="dokumen"
                  entityId={uploadExistingDocId}
                  entityLabel={
                    editableExistingDocs.find((d) => d.id === uploadExistingDocId)?.title ||
                    'Dokumen Internal'
                  }
                  defaultCategory="Lampiran Umum"
                  categoryOptions={DOKUMEN_ATTACHMENT_CATEGORIES}
                  heading="Unggah Berkas ke Dokumen Terpilih"
                  compact
                />
              )}
            </div>
          )}

          {uploadTargetMode === 'general' && (
            <AttachmentPanel
              moduleId="dokumen"
              entityId="arsip-umum-dokumen"
              entityLabel="Arsip Dokumen Umum Perusahaan"
              defaultCategory="Lampiran Umum"
              categoryOptions={DOKUMEN_ATTACHMENT_CATEGORIES}
              heading="Arsip Lampiran Umum Perusahaan"
              subtitle="Setiap berkas yang diunggah langsung tercatat di daftar dokumen terintegrasi."
              compact
            />
          )}
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* FORMAL REVISION MODAL FOR FINALIZED DOCUMENTS                     */}
      {/* ================================================================= */}
      <Modal
        open={Boolean(reviseModalDoc)}
        onClose={() => setReviseModalDoc(null)}
        title={
          reviseModalDoc
            ? `Revisi Resmi Dokumen ${reviseModalDoc.doc_number} (v${(reviseModalDoc.revision_no || 1) + 1})`
            : ''
        }
        subtitle="Versi sebelumnya beserta hash tanda tangan elektronik tetap tersimpan utuh di riwayat revisi."
        maxWidth="max-w-xl"
      >
        {reviseModalDoc && (
          <form onSubmit={handleSubmitRevision} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Alasan Revisi Resmi *
              </label>
              <textarea
                rows={2}
                required
                value={reviseReason}
                onChange={(e) => setReviseReason(e.target.value)}
                placeholder="Contoh: Penyesuaian volume material / koreksi spesifikasi teknis sesuai addendum terbaru."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Judul Dokumen</label>
              <input
                type="text"
                value={reviseTitle}
                onChange={(e) => setReviseTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Isi / Uraian Terbaru</label>
              <textarea
                rows={3}
                value={reviseDetails}
                onChange={(e) => setReviseDetails(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Rincian Item / Catatan
              </label>
              <textarea
                rows={2}
                value={reviseItems}
                onChange={(e) => setReviseItems(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 text-slate-800 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={reviseResubmit}
                onChange={(e) => setReviseResubmit(e.target.checked)}
              />
              <span>Langsung ajukan ulang hasil revisi ke pejabat peninjau</span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReviseModalDoc(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
              >
                Catat Revisi & Buka Kunci
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* ELECTRONIC SIGNATURE MODAL                                        */}
      {/* ================================================================= */}
      <SignatureApprovalModal
        open={Boolean(signatureModalRecord)}
        record={signatureModalRecord}
        signerName={currentUser?.full_name || 'Pejabat Berwenang'}
        signerPosition={currentUser?.position || currentRole?.name || 'Head'}
        busy={workflowBusy}
        onCancel={() => setSignatureModalRecord(null)}
        onConfirm={async (note, signatureDataUrl) => {
          if (!signatureModalRecord) return;
          const res = await advanceDocumentStatus(
            signatureModalRecord.id,
            'Disetujui',
            note,
            signatureDataUrl
          );
          if (res.ok) {
            setSignatureModalRecord(null);
          }
        }}
      />

      {/* ================================================================= */}
      {/* WORKFLOW CONFIRM DIALOG                                           */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={Boolean(workflowActionModal)}
        title={workflowActionModal?.title || ''}
        description={workflowActionModal?.description || ''}
        confirmLabel={workflowActionModal?.confirmLabel || 'Lanjutkan'}
        danger={workflowActionModal?.danger}
        requireNote={workflowActionModal?.requireNote}
        noteLabel={
          workflowActionModal?.requireNote
            ? 'Alasan / Catatan Revisi (Wajib)'
            : 'Catatan Tambahan (Opsional)'
        }
        onCancel={() => setWorkflowActionModal(null)}
        onConfirm={async (note) => {
          if (!workflowActionModal) return;
          await advanceDocumentStatus(
            workflowActionModal.docId,
            workflowActionModal.nextStatus,
            note
          );
          setWorkflowActionModal(null);
        }}
      />

      {/* ================================================================= */}
      {/* ARCHIVE / SOFT DELETE CONFIRM DIALOG                              */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={Boolean(deletingDoc)}
        title={`Arsipkan Dokumen "${deletingDoc?.doc_number || ''} — ${deletingDoc?.title || ''}"?`}
        description="Dokumen akan dipindahkan ke Arsip Terhapus tanpa menghilangkan jejak audit atau riwayat pengesahan, dan dapat dipulihkan kembali oleh Head/Super Admin."
        confirmLabel="Arsipkan Dokumen"
        danger
        requireNote
        noteLabel="Alasan Pengarsipan / Penghapusan (Tercatat di Log Audit)"
        onCancel={() => setDeletingDoc(null)}
        onConfirm={async (reason) => {
          if (!deletingDoc) return;
          const res = await softDeleteDocument(deletingDoc.id, reason);
          if (res.ok) {
            setDeletingDoc(null);
            if (selectedRecordId === deletingDoc.id) setSelectedRecordId(null);
          }
        }}
      />

      {/* ================================================================= */}
      {/* PDF / ATTACHMENT PREVIEW MODAL WITH SOURCE SWITCHER               */}
      {/* ================================================================= */}
      {previewState && (
        <>
          <PdfPreviewModal
            open={previewState.open}
            onClose={() => {
              setPreviewState(null);
              setPreviewUrls({ inlineUrl: null, downloadUrl: null });
            }}
            title={
              previewState.activeAttIndex >= 0 &&
              previewState.attachments[previewState.activeAttIndex]
                ? `${previewState.record.doc_number} — ${previewState.attachments[previewState.activeAttIndex].original_name}`
                : `${previewState.record.doc_number} — Dokumen Resmi A4`
            }
            subtitle={
              previewState.attachments.length > 0
                ? `${previewState.record.title} · Tersedia ${previewState.attachments.length} lampiran pratinjau`
                : previewState.record.title
            }
            fileName={
              previewState.activeAttIndex >= 0 &&
              previewState.attachments[previewState.activeAttIndex]
                ? previewState.attachments[previewState.activeAttIndex].original_name
                : `${previewState.record.doc_number.replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`
            }
            fileExtension={
              previewState.activeAttIndex >= 0 &&
              previewState.attachments[previewState.activeAttIndex]
                ? previewState.attachments[previewState.activeAttIndex].extension
                : 'pdf'
            }
            sourceBytes={previewState.activeAttIndex < 0 ? previewState.generatedBytes : null}
            sourceUrl={previewState.activeAttIndex >= 0 ? previewUrls.inlineUrl : null}
            downloadUrl={previewState.activeAttIndex >= 0 ? previewUrls.downloadUrl : null}
            description={
              previewState.attachments.length > 0
                ? 'Gunakan pemilih sumber di sudut bawah/detail dokumen untuk meninjau berkas lampiran asli.'
                : previewState.record.title
            }
            onPrint={() => openOfficialDocumentPrintWindow(previewState.record)}
            onError={(msg) => showToast(msg)}
          />
          {/* Floating source switcher bar when doc has attachments */}
          {previewState.open && previewState.attachments.length > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-[#13233C] text-white rounded-xl px-3 py-2 shadow-xl border border-slate-700 flex flex-wrap items-center gap-1.5 text-[11px] max-w-[92vw]">
              <span className="text-[#FBC02D] font-bold mr-1">Sumber Pratinjau:</span>
              <button
                type="button"
                onClick={() => void switchPreviewSource(-1)}
                className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                  previewState.activeAttIndex < 0
                    ? 'bg-[#1D7AFC] text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                PDF Resmi A4
              </button>
              {previewState.attachments.map((att, idx) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => void switchPreviewSource(idx)}
                  className={`px-2.5 py-1 rounded-lg font-semibold truncate max-w-[180px] cursor-pointer ${
                    previewState.activeAttIndex === idx
                      ? 'bg-[#1D7AFC] text-white'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {att.original_name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
