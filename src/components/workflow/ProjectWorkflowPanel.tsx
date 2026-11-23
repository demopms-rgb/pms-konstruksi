import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  HardHat,
  History,
  Package,
  Plus,
  RotateCcw,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import { attachmentApi } from '../../services/attachmentApi';
import { Project, ProjectWorkflow } from '../../types/pms';
import {
  formatDateID,
  formatDateTimeID,
  formatNumber,
  formatRupiah,
  getWorkflowStageMeta,
} from '../../utils/format';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ConfirmDialog, Modal, StatusLabel } from '../ui/CommonUI';

type StageTab = 'teknik' | 'finance' | 'logistik' | 'lapangan' | 'riwayat';

function defaultTabForStage(wf: ProjectWorkflow): StageTab {
  switch (wf.stage) {
    case 'DRAFT_TEKNIK':
    case 'REVISI_TEKNIK':
    case 'DITOLAK_FINANCE':
      return 'teknik';
    case 'MENUNGGU_FINANCE':
    case 'MENUNGGU_KONTRAK':
      return 'finance';
    case 'MENUNGGU_LOGISTIK':
    case 'PROSES_LOGISTIK':
      return 'logistik';
    case 'SIAP_LAPANGAN':
    case 'DALAM_PELAKSANAAN':
      return 'lapangan';
    case 'SELESAI':
      return 'riwayat';
  }
}

export const ProjectWorkflowPanel: React.FC<{
  project: Project;
  initialTab?: StageTab;
}> = ({ project, initialTab }) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    workflowBusy,
    prepareTeknikWorkflow,
    submitWorkflowToFinance,
    decideWorkflowFinance,
    processWorkflowLogistics,
    submitWorkflowFieldReport,
    setActiveModule,
    setContractSubmenu,
    setSelectedContractId,
    showToast,
  } = usePMS();
  const { getAttachmentsFor, refreshAttachments } = useAttachments();

  const workflow = useMemo<ProjectWorkflow>(() => {
    return (
      state.workflows.find((w) => w.project_id === project.id) ?? {
        id: `wf-${project.id}`,
        project_id: project.id,
        stage: project.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
        submitter_id: project.pic_employee_id,
        submitter_name: 'Tim Teknik',
        submitter_division_id: 'div-teknik',
        approved_budget_limit: 0,
        work_cost_estimate: 0,
        schedule_start: project.start_date,
        schedule_end: project.target_end_date,
        material_needs: [],
        procurements: [],
        field_reports: [],
        history: [],
        updated_at: new Date().toISOString(),
      }
    );
  }, [state.workflows, project]);

  const [activeTab, setActiveTab] = useState<StageTab>(initialTab ?? defaultTabForStage(workflow));

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else {
      setActiveTab(defaultTabForStage(workflow));
    }
  }, [project.id, workflow.stage, initialTab]);

  const roleCode = currentRole?.code;
  const divCode = currentDivision?.code;

  const isTeknikUser = roleCode === 'SUPER_ADMIN' || divCode === 'TEKNIK';
  const isFinanceUser = roleCode === 'SUPER_ADMIN' || divCode === 'FINANCE';
  const isLogistikUser = roleCode === 'SUPER_ADMIN' || divCode === 'LOGISTIK';

  const stageMeta = getWorkflowStageMeta(workflow.stage);
  const projectRab = useMemo(
    () => state.budgets.filter((b) => b.project_id === project.id && !b.is_deleted),
    [state.budgets, project.id]
  );
  const totalRabCost = useMemo(
    () => projectRab.reduce((acc, b) => acc + b.total_cost, 0),
    [projectRab]
  );
  const projectAttachments = getAttachmentsFor('proyek', project.id);

  // =========================================================================
  // STAGE 1: TIM TEKNIK STATE
  // =========================================================================
  const canEditTeknik =
    isTeknikUser &&
    ['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE'].includes(workflow.stage);

  const [scheduleStart, setScheduleStart] = useState(workflow.schedule_start || project.start_date);
  const [scheduleEnd, setScheduleEnd] = useState(workflow.schedule_end || project.target_end_date);
  const [workCostEstimate, setWorkCostEstimate] = useState(
    workflow.work_cost_estimate || totalRabCost || 0
  );
  const [materialNeedsDraft, setMaterialNeedsDraft] = useState<
    Array<{ id?: string; material_id: string; qty_needed: number; notes: string }>
  >(() =>
    workflow.material_needs.map((n) => ({
      id: n.id,
      material_id: n.material_id,
      qty_needed: n.qty_needed,
      notes: n.notes,
    }))
  );

  const [newMatId, setNewMatId] = useState(state.materials[0]?.id ?? '');
  const [newMatQty, setNewMatQty] = useState(100);
  const [newMatNotes, setNewMatNotes] = useState('');

  const [newRabCat, setNewRabCat] = useState('Pekerjaan Struktur');
  const [newRabName, setNewRabName] = useState('');
  const [newRabVol, setNewRabVol] = useState(100);
  const [newRabUnit, setNewRabUnit] = useState('m3');
  const [newRabPrice, setNewRabPrice] = useState(1200000);

  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  useEffect(() => {
    setScheduleStart(workflow.schedule_start || project.start_date);
    setScheduleEnd(workflow.schedule_end || project.target_end_date);
    setWorkCostEstimate(workflow.work_cost_estimate || totalRabCost || 0);
    setMaterialNeedsDraft(
      workflow.material_needs.map((n) => ({
        id: n.id,
        material_id: n.material_id,
        qty_needed: n.qty_needed,
        notes: n.notes,
      }))
    );
  }, [workflow.id, workflow.updated_at, project.id, totalRabCost]);

  const totalMaterialEstCost = useMemo(() => {
    return materialNeedsDraft.reduce((acc, item) => {
      const mat = state.materials.find((m) => m.id === item.material_id);
      return acc + (mat?.unit_cost ?? 0) * item.qty_needed;
    }, 0);
  }, [materialNeedsDraft, state.materials]);

  const handleAddMaterialNeed = () => {
    if (!newMatId || newMatQty <= 0) return;
    setMaterialNeedsDraft((prev) => {
      const idx = prev.findIndex((p) => p.material_id === newMatId);
      if (idx >= 0) {
        return prev.map((p, i) =>
          i === idx
            ? { ...p, qty_needed: p.qty_needed + newMatQty, notes: newMatNotes || p.notes }
            : p
        );
      }
      return [
        ...prev,
        { material_id: newMatId, qty_needed: newMatQty, notes: newMatNotes || 'Kebutuhan proyek' },
      ];
    });
    setNewMatNotes('');
  };

  const handleAddRabQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRabName.trim()) return;
    await prepareTeknikWorkflow({
      projectId: project.id,
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      material_needs: materialNeedsDraft,
      upsertBudgetItem: {
        project_id: project.id,
        category: newRabCat,
        work_item_name: newRabName.trim(),
        volume: newRabVol,
        unit: newRabUnit,
        unit_price: newRabPrice,
        total_cost: newRabVol * newRabPrice,
        target_qty: newRabVol,
        actual_qty: 0,
        pic_employee_id: currentUser?.id ?? project.pic_employee_id,
        execution_date: scheduleStart,
        field_doc_ref: '',
        constraints: '-',
      },
    });
    setNewRabName('');
  };

  const handleSaveTeknikDraft = async () => {
    await prepareTeknikWorkflow({
      projectId: project.id,
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      work_cost_estimate: workCostEstimate || totalRabCost,
      material_needs: materialNeedsDraft,
    });
  };

  const handleConfirmSubmitFinance = async (note: string) => {
    const saved = await prepareTeknikWorkflow({
      projectId: project.id,
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      work_cost_estimate: workCostEstimate || totalRabCost,
      material_needs: materialNeedsDraft,
    });
    if (saved.ok) {
      await submitWorkflowToFinance(project.id, note, workCostEstimate || totalRabCost);
    }
    setSubmitModalOpen(false);
  };

  // =========================================================================
  // STAGE 2: TIM FINANCE STATE
  // =========================================================================
  const canDecideFinance = isFinanceUser && workflow.stage === 'MENUNGGU_FINANCE';
  const [approvedBudgetInput, setApprovedBudgetInput] = useState<number>(
    workflow.approved_budget_limit || totalRabCost || workflow.work_cost_estimate || 0
  );
  const [financeDialog, setFinanceDialog] = useState<{
    decision: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    requireNote?: boolean;
  } | null>(null);

  useEffect(() => {
    setApprovedBudgetInput(
      workflow.approved_budget_limit || totalRabCost || workflow.work_cost_estimate || 0
    );
  }, [workflow.approved_budget_limit, workflow.work_cost_estimate, totalRabCost]);

  // =========================================================================
  // STAGE 3: TIM LOGISTIK STATE
  // =========================================================================
  const canProcessLogistik =
    isLogistikUser && ['MENUNGGU_LOGISTIK', 'PROSES_LOGISTIK'].includes(workflow.stage);

  const [poModalNeed, setPoModalNeed] = useState<{
    material_id: string;
    material_name: string;
    unit: string;
    defaultQty: number;
    unitCost: number;
  } | null>(null);
  const [poQty, setPoQty] = useState(50);
  const [poSupplier, setPoSupplier] = useState('PT Bangun Baja Mandiri');
  const [poEstCost, setPoEstCost] = useState(0);
  const [poNote, setPoNote] = useState('');
  const [forwardFieldOpen, setForwardFieldOpen] = useState(false);

  // =========================================================================
  // STAGE 4: TIM LAPANGAN STATE
  // =========================================================================
  const canSubmitLapangan =
    isTeknikUser && ['SIAP_LAPANGAN', 'DALAM_PELAKSANAAN'].includes(workflow.stage);

  const [workSummary, setWorkSummary] = useState('');
  const [fieldProgress, setFieldProgress] = useState(project.progress_percent);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [fieldExpense, setFieldExpense] = useState(0);
  const [fieldExpenseNote, setFieldExpenseNote] = useState('');
  const [fieldConstraints, setFieldConstraints] = useState('');
  const [fieldFollowUp, setFieldFollowUp] = useState('');
  const [markCompleted, setMarkCompleted] = useState(false);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    setFieldProgress(project.progress_percent);
  }, [project.id, project.progress_percent]);

  const handleFieldReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workSummary.trim()) {
      showToast('Mohon isi ringkasan pekerjaan lapangan.');
      return;
    }

    let uploadedAttachmentIds: string[] = [];
    if (pendingPhotoFiles.length > 0 && currentUser && currentRole && currentDivision) {
      setUploadingPhoto(true);
      try {
        const uploaded = await attachmentApi.uploadWithProgress(
          {
            employeeId: currentUser.id,
            nik: currentUser.nik,
            roleCode: currentRole.code,
            divisionCode: currentDivision.code,
            divisionId: currentDivision.id,
            fullName: currentUser.full_name,
          },
          {
            files: pendingPhotoFiles,
            module_id: 'proyek',
            entity_id: project.id,
            entity_label: `${project.project_number} — ${project.name}`,
            doc_category: 'Foto Lapangan',
            description: `Dokumentasi lapangan (${fieldProgress}%): ${workSummary.trim()}`,
            division_id: currentDivision.id,
          },
          () => {}
        );
        uploadedAttachmentIds = uploaded.map((u) => u.id);
        await refreshAttachments();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengunggah foto lapangan.');
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    const material_usages = Object.entries(usageMap)
      .map(([material_id, qty_used]) => ({ material_id, qty_used: Number(qty_used || 0) }))
      .filter((u) => u.qty_used > 0);

    const res = await submitWorkflowFieldReport(project.id, {
      work_summary: workSummary.trim(),
      progress_percent: fieldProgress,
      material_usages,
      expense_amount: fieldExpense,
      expense_note: fieldExpenseNote.trim(),
      constraints: fieldConstraints.trim() || '-',
      follow_up: fieldFollowUp.trim() || '-',
      attachment_ids: uploadedAttachmentIds,
      mark_completed: markCompleted,
    });

    if (res.ok) {
      setWorkSummary('');
      setUsageMap({});
      setFieldExpense(0);
      setFieldExpenseNote('');
      setFieldConstraints('');
      setFieldFollowUp('');
      setPendingPhotoFiles([]);
      setMarkCompleted(false);
    }
  };

  const steps = [
    { key: 'teknik' as StageTab, num: 1, title: 'Tim Teknik', sub: 'RAB, Material & Jadwal' },
    { key: 'finance' as StageTab, num: 2, title: 'Tim Finance', sub: 'Verifikasi Anggaran' },
    { key: 'logistik' as StageTab, num: 3, title: 'Tim Logistik', sub: 'Stok & Pengadaan' },
    { key: 'lapangan' as StageTab, num: 4, title: 'Tim Lapangan', sub: 'Eksekusi & Foto' },
    { key: 'riwayat' as StageTab, num: 5, title: 'Monitoring', sub: 'Jejak & Dokumen' },
  ];

  return (
    <div className="space-y-5">
      {/* Pipeline Header + 5-Step Stepper */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-[#13233C] uppercase tracking-wider">
                Alur Operasional Terintegrasi
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-bold text-[#1D7AFC]">{project.project_number}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#13233C] mt-0.5">
              {stageMeta.label}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold ${stageMeta.badgeClass}`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Tahap {stageMeta.step}/5 · {stageMeta.team}</span>
            </span>
            <ModuleAttachmentToolbar
              compact
              moduleId="proyek"
              entityId={project.id}
              entityLabel={`${project.project_number} — ${project.name}`}
              title={`Dokumen & Foto Proyek ${project.project_number}`}
              subtitle="Seluruh dokumen RAB, gambar kerja, dan foto dokumentasi lapangan terhubung ke proyek ini."
              defaultCategory="Foto Lapangan"
            />
          </div>
        </div>

        {/* Contract Creation Gate Banner */}
        {workflow.stage === 'MENUNGGU_KONTRAK' && (
          <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5 min-w-0">
              <p className="font-bold text-indigo-950">
                Tahap Wajib: Pembuatan & Aktivasi Kontrak Proyek
              </p>
              <p className="text-indigo-800">
                Anggaran sudah disetujui Tim Finance. Buat kontrak resmi, lengkapi jadwal termin (100%), dan aktifkan kontrak sebelum proyek dapat masuk ke Tim Logistik.
              </p>
            </div>
            {(isFinanceUser || (currentRole?.code === 'HEAD' && currentDivision?.code === 'TEKNIK')) && (
              <button
                type="button"
                onClick={() => {
                  const existingCtr = state.contracts.find((c) => !c.is_deleted && c.project_id === project.id);
                  setActiveModule('kontrak');
                  if (existingCtr) {
                    setSelectedContractId(existingCtr.id);
                    setContractSubmenu('daftar');
                  } else if (isFinanceUser) {
                    setContractSubmenu('pembuatan');
                  } else {
                    setContractSubmenu('daftar');
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Buka Modul Kontrak & Termin</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Returned / Rejection Warning Banner */}
        {(workflow.stage === 'REVISI_TEKNIK' || workflow.stage === 'DITOLAK_FINANCE') && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-red-900">
                {workflow.stage === 'REVISI_TEKNIK'
                  ? 'Pengajuan Dikembalikan Tim Finance untuk Revisi'
                  : 'Pengajuan Ditolak oleh Tim Finance'}
              </p>
              <p className="text-red-800">
                <strong>Catatan Finance ({workflow.finance_reviewer_name || 'Tim Finance'}):</strong>{' '}
                {workflow.returned_reason || workflow.finance_decision_note}
              </p>
              <p className="text-red-700">
                Seluruh data RAB, daftar material, jadwal, dan lampiran proyek tetap tersimpan. Perbarui dan ajukan kembali ke Finance.
              </p>
            </div>
          </div>
        )}

        {/* Interactive 5-Step Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {steps.map((s) => {
            const isCompleted =
              workflow.stage === 'SELESAI'
                ? true
                : stageMeta.step > s.num &&
                  workflow.stage !== 'REVISI_TEKNIK' &&
                  workflow.stage !== 'DITOLAK_FINANCE';
            const isCurrent = stageMeta.step === s.num;
            const isSelected = activeTab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveTab(s.key)}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#13233C] text-white border-[#13233C] shadow-sm'
                    : isCurrent
                    ? 'bg-blue-50/90 border-blue-300 text-slate-900'
                    : isCompleted
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                  <span>Tahap {s.num}</span>
                  {isCompleted ? (
                    <CheckCircle2
                      className={`w-4 h-4 ${isSelected ? 'text-[#FBC02D]' : 'text-emerald-600'}`}
                    />
                  ) : isCurrent ? (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-[#FBC02D]' : 'bg-[#1D7AFC]'
                      }`}
                    />
                  ) : null}
                </div>
                <p className="text-xs font-bold mt-1 truncate">{s.title}</p>
                <p
                  className={`text-[10px] truncate mt-0.5 ${
                    isSelected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {s.sub}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: TIM TEKNIK */}
      {/* ===================================================================== */}
      {activeTab === 'teknik' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1D7AFC] flex items-center justify-center">
                  <HardHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#13233C]">
                    1. Tim Teknik — Penyiapan RAB, Kebutuhan Material, Biaya & Jadwal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Lengkapi data RAB, daftar material baku, estimasi biaya, jadwal kerja, dan dokumen pendukung proyek sebelum diajukan ke Finance.
                  </p>
                </div>
              </div>
              {!canEditTeknik && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold">
                  Mode Baca ({stageMeta.shortLabel})
                </span>
              )}
            </div>

            {/* Schedule & Cost Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jadwal Mulai
                </label>
                <input
                  type="date"
                  value={scheduleStart}
                  disabled={!canEditTeknik}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Selesai
                </label>
                <input
                  type="date"
                  value={scheduleEnd}
                  disabled={!canEditTeknik}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Estimasi Biaya Pekerjaan (IDR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={workCostEstimate}
                  disabled={!canEditTeknik}
                  onChange={(e) => setWorkCostEstimate(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl disabled:bg-slate-50"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
                <span className="text-[11px] text-slate-500">Total RAB Terdaftar</span>
                <span className="text-sm font-bold font-mono text-[#13233C] tabular-nums">
                  {formatRupiah(totalRabCost)}
                </span>
              </div>
            </div>

            {/* RAB Items List + Quick Add */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Pos Rencana Anggaran Biaya (RAB) ({projectRab.length})
                </h4>
                <span className="text-xs text-slate-500">
                  Lampiran proyek terhubung: <strong>{projectAttachments.length} berkas</strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Kategori & Item Pekerjaan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Volume</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Jumlah Biaya</th>
                      {canEditTeknik && <th className="py-2.5 px-3 text-right">Hapus</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectRab.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900">{r.work_item_name}</span>
                          <span className="text-slate-500 ml-1.5">({r.category})</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNumber(r.volume)} {r.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(r.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                          {formatRupiah(r.total_cost)}
                        </td>
                        {canEditTeknik && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                prepareTeknikWorkflow({
                                  projectId: project.id,
                                  removeBudgetId: r.id,
                                })
                              }
                              className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              title="Hapus item RAB"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {projectRab.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-slate-500">
                          Belum ada item RAB. Tambahkan minimal 1 pos RAB di bawah untuk diajukan ke Finance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canEditTeknik && (
                <form
                  onSubmit={handleAddRabQuick}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 items-end"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Kategori RAB
                    </label>
                    <input
                      type="text"
                      value={newRabCat}
                      onChange={(e) => setNewRabCat(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Uraian Pekerjaan
                    </label>
                    <input
                      type="text"
                      value={newRabName}
                      onChange={(e) => setNewRabName(e.target.value)}
                      placeholder="Contoh: Pengecoran Pondasi"
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
                        min={1}
                        value={newRabVol}
                        onChange={(e) => setNewRabVol(Number(e.target.value))}
                        className="w-16 px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={newRabUnit}
                        onChange={(e) => setNewRabUnit(e.target.value)}
                        className="w-14 px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Harga Satuan (Rp)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      value={newRabPrice}
                      onChange={(e) => setNewRabPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={workflowBusy}
                      className="w-full py-1.5 px-3 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah RAB</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Material Needs Planning */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Kebutuhan Bahan Baku & Material Proyek ({materialNeedsDraft.length})
                </h4>
                <span className="text-xs font-mono font-semibold text-slate-700">
                  Estimasi Biaya Material: {formatRupiah(totalMaterialEstCost)}
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Material</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Kebutuhan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Stok Gudang</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Est. Biaya</th>
                      <th className="py-2.5 px-3 font-semibold">Catatan</th>
                      {canEditTeknik && <th className="py-2.5 px-3 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materialNeedsDraft.map((item, idx) => {
                      const mat = state.materials.find((m) => m.id === item.material_id);
                      const stockOk = (mat?.stock ?? 0) >= item.qty_needed;
                      return (
                        <tr key={`${item.material_id}-${idx}`}>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-blue-700 font-semibold">{mat?.code}</span>{' '}
                            · <strong className="text-slate-900">{mat?.name}</strong>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                            {formatNumber(item.qty_needed)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <span className={stockOk ? 'text-emerald-700' : 'text-amber-700 font-semibold'}>
                              {formatNumber(mat?.stock ?? 0)} {mat?.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatRupiah((mat?.unit_cost ?? 0) * item.qty_needed)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{item.notes}</td>
                          {canEditTeknik && (
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setMaterialNeedsDraft((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {materialNeedsDraft.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500">
                          Belum ada daftar kebutuhan material ditambahkan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canEditTeknik && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Pilih Material Gudang
                    </label>
                    <select
                      value={newMatId}
                      onChange={(e) => setNewMatId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      {state.materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name} (Stok: {m.stock} {m.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Jumlah
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newMatQty}
                      onChange={(e) => setNewMatQty(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Keperluan Pekerjaan
                    </label>
                    <input
                      type="text"
                      value={newMatNotes}
                      onChange={(e) => setNewMatNotes(e.target.value)}
                      placeholder="Contoh: Pembesian kolom"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddMaterialNeed}
                      className="w-full py-1.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {canEditTeknik && (
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={handleSaveTeknikDraft}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Simpan Persiapan Teknis
                </button>
                <button
                  type="button"
                  disabled={workflowBusy || projectRab.length === 0}
                  onClick={() => setSubmitModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>AJUKAN KE FINANCE</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: TIM FINANCE */}
      {/* ===================================================================== */}
      {activeTab === 'finance' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#13233C]">
                  2. Tim Finance — Pemeriksaan RAB, Anggaran & Permintaan Stok Material
                </h3>
                <p className="text-xs text-slate-500">
                  Periksa kesesuaian nilai kontrak, RAB, kebutuhan pembiayaan, serta daftar pengeluaran stok bahan baku sebelum disetujui.
                </p>
              </div>
            </div>
            <StatusLabel status={stageMeta.shortLabel} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500">Nilai Kontrak Proyek</span>
              <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {formatRupiah(project.contract_value)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500">Total RAB Diajukan Teknik</span>
              <p className="text-sm font-bold font-mono text-[#1D7AFC] mt-1 tabular-nums">
                {formatRupiah(totalRabCost)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500">Estimasi Nilai Material</span>
              <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {formatRupiah(
                  workflow.material_needs.reduce(
                    (a, n) => a + n.qty_needed * n.estimated_unit_cost,
                    0
                  )
                )}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] text-emerald-700">Selisih Margin Kontrak vs RAB</span>
              <p className="text-sm font-bold font-mono text-emerald-800 mt-1 tabular-nums">
                {formatRupiah(project.contract_value - totalRabCost)}
              </p>
            </div>
          </div>

          {/* Material Release Request Summary for Finance Review */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Daftar Permintaan Pengeluaran Stok Material dari Teknik
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Material</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Qty Diminta</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Stok Gudang</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Nilai Estimasi</th>
                    <th className="py-2.5 px-3 font-semibold">Status Ketersediaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workflow.material_needs.map((n) => {
                    const mat = state.materials.find((m) => m.id === n.material_id);
                    return (
                      <tr key={n.id}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {mat?.code} · {mat?.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNumber(n.qty_needed)} {mat?.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNumber(mat?.stock ?? 0)} {mat?.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(n.qty_needed * n.estimated_unit_cost)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusLabel status={n.procurement_status} />
                        </td>
                      </tr>
                    );
                  })}
                  {workflow.material_needs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        Tidak ada pengajuan material tambahan pada proyek ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {workflow.finance_decided_at && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-900">
                Keputusan Terakhir Finance ({workflow.finance_reviewer_name}) ·{' '}
                {formatDateTimeID(workflow.finance_decided_at)}
              </p>
              <p className="text-slate-700">{workflow.finance_decision_note}</p>
              {workflow.approved_budget_limit > 0 && (
                <p className="font-mono text-emerald-700 font-semibold">
                  Pagu Anggaran Disetujui: {formatRupiah(workflow.approved_budget_limit)}
                </p>
              )}
            </div>
          )}

          {canDecideFinance && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Pagu Anggaran Disetujui Finance (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={approvedBudgetInput}
                    onChange={(e) => setApprovedBudgetInput(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-amber-300 rounded-xl"
                  />
                </div>
                <p className="text-[11px] text-amber-900">
                  Keputusan <strong>APPROVE</strong> akan mengarahkan proyek ke tahap{' '}
                  <strong>Pembuatan & Aktivasi Kontrak</strong> terlebih dahulu (atau langsung ke Logistik jika kontrak sudah aktif).
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() =>
                    setFinanceDialog({
                      decision: 'REJECT',
                      title: `Tolak Pengajuan ${project.project_number}?`,
                      description:
                        'Pengajuan akan dikembalikan ke Tim Teknik dengan status ditolak. Seluruh data RAB dan lampiran tetap aman tersimpan.',
                      confirmLabel: 'REJECT Pengajuan',
                      danger: true,
                      requireNote: true,
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>REJECT</span>
                </button>
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() =>
                    setFinanceDialog({
                      decision: 'REQUEST_REVISION',
                      title: `Minta Revisi ke Tim Teknik (${project.project_number})`,
                      description:
                        'Tuliskan item RAB, biaya, atau dokumen yang harus direvisi Tim Teknik agar dapat diajukan ulang.',
                      confirmLabel: 'REQUEST REVISION',
                      requireNote: true,
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>REQUEST REVISION</span>
                </button>
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() =>
                    setFinanceDialog({
                      decision: 'APPROVE',
                      title: `Approve & Teruskan ke Tim Logistik?`,
                      description: `Menyetujui pagu anggaran ${formatRupiah(
                        approvedBudgetInput
                      )} dan meneruskan kebutuhan material ke Tim Logistik.`,
                      confirmLabel: 'APPROVE & Teruskan',
                      requireNote: false,
                    })
                  }
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>APPROVE</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TIM LOGISTIK */}
      {/* ===================================================================== */}
      {activeTab === 'logistik' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#13233C]">
                  3. Tim Logistik — Cek Ketersediaan Stok, Reservasi & Pengadaan Material
                </h3>
                <p className="text-xs text-slate-500">
                  Periksa stok gudang vs kebutuhan proyek, lakukan reservasi/pengeluaran stok, buat PO jika kurang, lalu teruskan ke Lapangan.
                </p>
              </div>
            </div>
            <StatusLabel status={stageMeta.shortLabel} />
          </div>

          {workflow.stage === 'MENUNGGU_KONTRAK' && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Terkunci Menunggu Kontrak Aktif:</strong> Proses reservasi & pengadaan Logistik belum dapat dibuka sebelum kontrak proyek resmi berstatus <strong>Aktif</strong>.
              </span>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Material</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Dibutuhkan</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Stok Gudang</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Dikeluarkan</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Kekurangan</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  {canProcessLogistik && (
                    <th className="py-2.5 px-3 font-semibold text-right">Aksi Gudang</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workflow.material_needs.map((n) => {
                  const mat = state.materials.find((m) => m.id === n.material_id);
                  const remaining = Math.max(0, n.qty_needed - n.qty_issued);
                  const stockNow = mat?.stock ?? 0;
                  const shortage = Math.max(0, remaining - stockNow);
                  return (
                    <tr key={n.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{mat?.name ?? n.material_id}</div>
                        <div className="text-[11px] font-mono text-slate-500">{mat?.code}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {formatNumber(n.qty_needed)} {mat?.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatNumber(stockNow)} {mat?.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold tabular-nums">
                        {formatNumber(n.qty_issued)} {mat?.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {shortage > 0 ? (
                          <span className="text-red-700 font-bold">
                            -{formatNumber(shortage)} {mat?.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusLabel status={n.procurement_status} />
                      </td>
                      {canProcessLogistik && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {remaining > 0 && stockNow > 0 && (
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() =>
                                  processWorkflowLogistics(project.id, {
                                    action: 'RESERVE_ISSUE',
                                    material_id: n.material_id,
                                    qty: Math.min(stockNow, remaining),
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                              >
                                Keluarkan ({Math.min(stockNow, remaining)})
                              </button>
                            )}
                            {shortage > 0 && (
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() => {
                                  setPoModalNeed({
                                    material_id: n.material_id,
                                    material_name: mat?.name ?? n.material_id,
                                    unit: mat?.unit ?? 'Unit',
                                    defaultQty: shortage,
                                    unitCost: mat?.unit_cost ?? n.estimated_unit_cost,
                                  });
                                  setPoQty(shortage);
                                  setPoEstCost(shortage * (mat?.unit_cost ?? n.estimated_unit_cost));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Buat PO</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {workflow.material_needs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-5 text-center text-slate-500">
                      Tidak ada item material khusus dalam proyek ini. Anda dapat langsung meneruskan ke Tim Lapangan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Procurement POs List */}
          {workflow.procurements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Daftar Pengadaan (PO) Terkait Proyek ({workflow.procurements.length})
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {workflow.procurements.map((po) => {
                  const mat = state.materials.find((m) => m.id === po.material_id);
                  return (
                    <div
                      key={po.id}
                      className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-blue-700">{po.po_number}</span> ·{' '}
                        <strong>
                          {mat?.name} ({po.qty_order} {mat?.unit})
                        </strong>
                        <p className="text-slate-500 mt-0.5">
                          Supplier: {po.supplier_name} · Est: {formatRupiah(po.estimated_cost)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusLabel status={po.status} />
                        {canProcessLogistik && po.status !== 'Diterima di Gudang' && (
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() =>
                              processWorkflowLogistics(project.id, {
                                action: 'RECEIVE_PROCUREMENT',
                                procurement_id: po.id,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Terima di Gudang
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canProcessLogistik && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={workflowBusy}
                onClick={() => setForwardFieldOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                <span>TERUSKAN KE LAPANGAN</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: TIM LAPANGAN */}
      {/* ===================================================================== */}
      {activeTab === 'lapangan' && (
        <div className="space-y-4">
          {/* Approved Budget & Material Reference Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#13233C]">
                    4. Tim Lapangan — Pelaksanaan, Pemakaian Material & Dokumentasi Foto
                  </h3>
                  <p className="text-xs text-slate-500">
                    Input laporan progres fisik, realisasi pemakaian material, kendala lapangan, serta foto dokumentasi langsung.
                  </p>
                </div>
              </div>
              <span className="font-mono font-bold text-sm text-[#1D7AFC]">
                Progres Saat Ini: {project.progress_percent}%
              </span>
            </div>

            {canSubmitLapangan ? (
              <form onSubmit={handleFieldReportSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ringkasan Pekerjaan Lapangan <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={workSummary}
                      onChange={(e) => setWorkSummary(e.target.value)}
                      placeholder="Contoh: Pengecoran sloof & pembesian kolom lantai 2 selesai sesuai gambar kerja..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4 space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Persentase Progres Fisik ({fieldProgress}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={fieldProgress}
                      onChange={(e) => setFieldProgress(Number(e.target.value))}
                      className="w-full accent-[#1D7AFC]"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={fieldProgress}
                        onChange={(e) => setFieldProgress(Number(e.target.value))}
                        className="w-20 px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={markCompleted || fieldProgress >= 100}
                          onChange={(e) => {
                            setMarkCompleted(e.target.checked);
                            if (e.target.checked) setFieldProgress(100);
                          }}
                        />
                        <span>Selesai 100%</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Actual Material Usage Inputs */}
                {workflow.material_needs.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h4 className="text-xs font-bold text-slate-800">
                      Pemakaian Material di Lapangan (Opsional)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {workflow.material_needs.map((n) => {
                        const mat = state.materials.find((m) => m.id === n.material_id);
                        return (
                          <div
                            key={n.id}
                            className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{mat?.name}</p>
                              <p className="text-[11px] text-slate-500">
                                Terpakai: {n.qty_used} / Keluar: {n.qty_issued} {mat?.unit}
                              </p>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={usageMap[n.material_id] || ''}
                              onChange={(e) =>
                                setUsageMap((prev) => ({
                                  ...prev,
                                  [n.material_id]: Number(e.target.value),
                                }))
                              }
                              placeholder="0"
                              className="w-20 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-right"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kendala Lapangan
                    </label>
                    <input
                      type="text"
                      value={fieldConstraints}
                      onChange={(e) => setFieldConstraints(e.target.value)}
                      placeholder="Contoh: Hujan deras sore hari / akses alat..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tindak Lanjut / Solusi
                    </label>
                    <input
                      type="text"
                      value={fieldFollowUp}
                      onChange={(e) => setFieldFollowUp(e.target.value)}
                      placeholder="Contoh: Penambahan tenda pengecoran & lembur..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Biaya Operasional Lapangan (IDR, Opsional)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={fieldExpense}
                      onChange={(e) => setFieldExpense(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Upload Foto Dokumentasi Lapangan (JPG/PNG/PDF)
                    </label>
                    <label className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-100">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 truncate">
                        <Camera className="w-4 h-4 text-[#1D7AFC] shrink-0" />
                        {pendingPhotoFiles.length > 0
                          ? `${pendingPhotoFiles.length} file dipilih`
                          : 'Pilih foto atau berita acara lapangan...'}
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => setPendingPhotoFiles(Array.from(e.target.files || []))}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={workflowBusy || uploadingPhoto}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>
                      {uploadingPhoto ? 'Mengunggah Dokumentasi...' : 'Simpan Laporan Lapangan'}
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {workflow.stage === 'SELESAI'
                  ? 'Proyek telah selesai 100% dan seluruh laporan lapangan tercatat pada Monitoring.'
                  : 'Input laporan lapangan aktif setelah Tim Logistik meneruskan pekerjaan ke Lapangan (dan oleh Tim Lapangan/Teknik).'}
              </div>
            )}
          </div>

          {/* Field Reports Log */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Riwayat Laporan Lapangan ({workflow.field_reports.length})
            </h4>
            <div className="divide-y divide-slate-100">
              {workflow.field_reports.map((fr) => (
                <div key={fr.id} className="py-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{fr.reported_by_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1D7AFC] font-mono font-bold">
                        {fr.progress_percent}%
                      </span>
                      <span className="text-slate-500">{formatDateTimeID(fr.reported_at)}</span>
                    </div>
                  </div>
                  <p className="text-slate-800">{fr.work_summary}</p>
                  <p className="text-slate-500">
                    Kendala: {fr.constraints} · Tindak lanjut: {fr.follow_up}
                    {fr.attachment_ids.length > 0 && ` · ${fr.attachment_ids.length} lampiran foto`}
                  </p>
                </div>
              ))}
              {workflow.field_reports.length === 0 && (
                <p className="py-4 text-xs text-slate-500">Belum ada laporan progres lapangan yang masuk.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: MONITORING, AUDIT TRAIL & LAMPIRAN PROYEK */}
      {/* ===================================================================== */}
      {activeTab === 'riwayat' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <History className="w-5 h-5 text-[#1D7AFC]" />
              <div>
                <h3 className="text-sm font-bold text-[#13233C]">
                  5. Monitoring & Rekam Jejak Perpindahan Tahap Proyek
                </h3>
                <p className="text-xs text-slate-500">
                  Jejak audit lengkap lintas Tim Teknik, Finance, Logistik, dan Tim Lapangan.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {[...workflow.history].reverse().map((h) => (
                <div key={h.id} className="py-3 flex flex-wrap items-start justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">{h.action}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-medium text-blue-700">{h.actor_name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {h.actor_division}
                      </span>
                    </div>
                    <p className="text-slate-600">{h.note}</p>
                    <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                      {h.from_stage || 'AWAL'} <ArrowRight className="w-3 h-3" /> {h.to_stage}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {formatDateTimeID(h.timestamp)}
                  </span>
                </div>
              ))}
              {workflow.history.length === 0 && (
                <p className="py-4 text-xs text-slate-500">Belum ada riwayat transisi workflow.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
            <AttachmentPanel
              moduleId="proyek"
              entityId={project.id}
              entityLabel={`${project.project_number} — ${project.name}`}
              defaultCategory="Foto Lapangan"
              heading="Dokumen & Foto Lapangan Terhubung ke Proyek"
              subtitle="Seluruh berkas dari Teknik, Finance, Logistik, dan Tim Lapangan otomatis tersinkronisasi di sini."
            />
          </div>
        </div>
      )}

      {/* Dialog Submit ke Finance */}
      <ConfirmDialog
        open={submitModalOpen}
        title={`Ajukan Proyek ${project.project_number} ke Finance?`}
        description={`Pengajuan mencakup ${projectRab.length} pos RAB (${formatRupiah(
          totalRabCost
        )}), ${materialNeedsDraft.length} kebutuhan material, serta jadwal ${formatDateID(
          scheduleStart
        )} s/d ${formatDateID(scheduleEnd)}.`}
        confirmLabel="Ya, Ajukan ke Finance"
        noteLabel="Catatan Pengajuan untuk Tim Finance"
        onCancel={() => setSubmitModalOpen(false)}
        onConfirm={handleConfirmSubmitFinance}
      />

      {/* Dialog Keputusan Finance */}
      <ConfirmDialog
        open={Boolean(financeDialog)}
        title={financeDialog?.title ?? ''}
        description={financeDialog?.description ?? ''}
        confirmLabel={financeDialog?.confirmLabel ?? 'Konfirmasi'}
        danger={financeDialog?.danger}
        requireNote={financeDialog?.requireNote}
        noteLabel="Catatan Keputusan Tim Finance"
        onCancel={() => setFinanceDialog(null)}
        onConfirm={async (note) => {
          if (financeDialog) {
            await decideWorkflowFinance(project.id, {
              decision: financeDialog.decision,
              note,
              approved_budget_limit: approvedBudgetInput,
            });
          }
          setFinanceDialog(null);
        }}
      />

      {/* Dialog Teruskan ke Lapangan */}
      <ConfirmDialog
        open={forwardFieldOpen}
        title={`Teruskan ${project.project_number} ke Tim Lapangan?`}
        description="Tim Lapangan akan menerima notifikasi bahwa material & kebutuhan proyek sudah siap dan dapat mulai menginput laporan progres serta dokumentasi foto."
        confirmLabel="Ya, Teruskan ke Lapangan"
        noteLabel="Catatan Serah Terima Material / Logistik"
        onCancel={() => setForwardFieldOpen(false)}
        onConfirm={async (note) => {
          await processWorkflowLogistics(project.id, {
            action: 'FORWARD_FIELD',
            note,
          });
          setForwardFieldOpen(false);
        }}
      />

      {/* Modal Buat Pengadaan (PO) Material */}
      <Modal
        open={Boolean(poModalNeed)}
        onClose={() => setPoModalNeed(null)}
        title={`Buat Pengadaan (PO) — ${poModalNeed?.material_name ?? ''}`}
        subtitle="Pengadaan dibuat karena stok gudang tidak mencukupi kebutuhan proyek."
        maxWidth="max-w-md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!poModalNeed) return;
            await processWorkflowLogistics(project.id, {
              action: 'CREATE_PROCUREMENT',
              material_id: poModalNeed.material_id,
              qty: poQty,
              supplier_name: poSupplier,
              estimated_cost: poEstCost,
              note: poNote,
            });
            setPoModalNeed(null);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jumlah Order ({poModalNeed?.unit})
              </label>
              <input
                type="number"
                min={1}
                value={poQty}
                onChange={(e) => {
                  const q = Number(e.target.value);
                  setPoQty(q);
                  if (poModalNeed) setPoEstCost(q * poModalNeed.unitCost);
                }}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Estimasi Biaya PO (IDR)
              </label>
              <input
                type="number"
                min={0}
                value={poEstCost}
                onChange={(e) => setPoEstCost(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Supplier</label>
            <input
              type="text"
              value={poSupplier}
              onChange={(e) => setPoSupplier(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan PO</label>
            <textarea
              rows={2}
              value={poNote}
              onChange={(e) => setPoNote(e.target.value)}
              placeholder="Prioritas pengiriman ke gudang/lokasi proyek..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPoModalNeed(null)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Terbitkan PO Pengadaan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
