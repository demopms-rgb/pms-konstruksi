import React, { useMemo, useState } from 'react';
import { AlertTriangle, Archive, Camera, CloudOff, Edit3, Eye, Plus, RotateCcw, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { isStaticSamplePhotoUrl, useAttachments } from '../../context/AttachmentContext';
import { Project, WorkItem, WorkItemStatus } from '../../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah, getWorkflowStageMeta } from '../../utils/format';
import { canAccessTeknikModule, canRestoreArchivedData } from '../../utils/permissions';
import { ConfirmDialog, FallbackImage, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ProtectedAttachmentImage } from '../attachments/ProtectedAttachmentImage';
import { ProjectWorkflowPanel } from '../workflow/ProjectWorkflowPanel';
import { TeknikReportCenter } from './TeknikReportCenter';

export const TeknikModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    isOnline,
    setActiveModule,
    addWorkItem,
    updateWorkItem,
    softDeleteWorkItem,
    restoreWorkItem,
    saveOfflineDraft,
  } = usePMS();
  const { getLatestPhotoFor } = useAttachments();

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [viewingWork, setViewingWork] = useState<WorkItem | null>(null);
  const [deletingWork, setDeletingWork] = useState<WorkItem | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const hasAccess = Boolean(
    currentRole && currentDivision && canAccessTeknikModule(currentRole.code, currentDivision.code)
  );
  const allowEdit = hasAccess;
  const canRestore = Boolean(hasAccess && currentRole && canRestoreArchivedData(currentRole.code));

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );
  const [workflowModal, setWorkflowModal] = useState<{
    project: Project;
    tab: 'teknik' | 'lapangan';
  } | null>(null);

  const teknikQueue = useMemo(() => {
    return state.workflows.filter((w) =>
      ['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE'].includes(w.stage)
    );
  }, [state.workflows]);

  const lapanganQueue = useMemo(() => {
    return state.workflows.filter((w) =>
      ['SIAP_LAPANGAN', 'DALAM_PELAKSANAAN'].includes(w.stage)
    );
  }, [state.workflows]);

  const [form, setForm] = useState({
    project_id: state.projects[0]?.id ?? '',
    budget_id: state.budgets[0]?.id ?? '',
    title: '',
    pic_employee_id: currentUser?.id ?? state.employees[2]?.id ?? '',
    start_date: new Date().toISOString().slice(0, 10),
    due_date: '2026-12-20',
    weight_percent: 15,
    daily_progress: 3,
    weekly_progress: 12,
    monthly_progress: 45,
    overall_progress: 50,
    status: 'Dikerjakan' as WorkItemStatus,
    constraints: '',
    follow_up: '',
    field_photo_url: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.workItems.filter((w) => {
      if (w.is_deleted) return false;
      if (projectFilter !== 'SEMUA' && w.project_id !== projectFilter) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        w.constraints.toLowerCase().includes(q) ||
        w.follow_up.toLowerCase().includes(q)
      );
    });
  }, [state.workItems, search, projectFilter]);

  const archivedWorks = useMemo(
    () =>
      state.workItems.filter((w) => {
        if (!w.is_deleted) return false;
        if (projectFilter !== 'SEMUA' && w.project_id !== projectFilter) return false;
        return true;
      }),
    [state.workItems, projectFilter]
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      project_id: projectFilter !== 'SEMUA' ? projectFilter : state.projects[0]?.id ?? '',
      budget_id: state.budgets[0]?.id ?? '',
      title: '',
      pic_employee_id: currentUser?.id ?? state.employees[2]?.id ?? '',
      start_date: new Date().toISOString().slice(0, 10),
      due_date: '2026-12-28',
      weight_percent: 10,
      daily_progress: 2,
      weekly_progress: 8,
      monthly_progress: 20,
      overall_progress: 20,
      status: 'Dikerjakan',
      constraints: '',
      follow_up: '',
      field_photo_url: '',
    });
    setModalOpen(true);
  };

  const openEdit = (w: WorkItem) => {
    setEditing(w);
    setForm({
      project_id: w.project_id,
      budget_id: w.budget_id,
      title: w.title,
      pic_employee_id: w.pic_employee_id,
      start_date: w.start_date,
      due_date: w.due_date,
      weight_percent: w.weight_percent,
      daily_progress: w.daily_progress,
      weekly_progress: w.weekly_progress,
      monthly_progress: w.monthly_progress,
      overall_progress: w.overall_progress,
      status: w.status,
      constraints: w.constraints,
      follow_up: w.follow_up,
      field_photo_url: w.field_photo_url,
    });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent, asOfflineDraft = false) => {
    e.preventDefault();
    if (asOfflineDraft || !isOnline) {
      saveOfflineDraft({
        module: 'teknik',
        title: form.title || 'Laporan Progres Lapangan',
        project_id: form.project_id,
        created_by_id: currentUser?.id ?? 'emp-03',
        payload: {
          title: form.title,
          budget_id: form.budget_id,
          daily_progress: form.daily_progress,
          overall_progress: form.overall_progress,
          constraints: form.constraints,
          follow_up: form.follow_up,
        },
      });
      setModalOpen(false);
      return;
    }

    if (editing) {
      updateWorkItem({ ...editing, ...form, division_id: 'div-teknik' });
    } else {
      addWorkItem({ ...form, division_id: 'div-teknik' });
    }
    setModalOpen(false);
  };

  if (!hasAccess) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Akses Modul Teknik Ditolak</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          Modul Teknik hanya dapat dibuka dan digunakan oleh{' '}
          <span className="font-semibold">Head Teknik</span>,{' '}
          <span className="font-semibold">Staff Teknik</span>, dan{' '}
          <span className="font-semibold">Super Admin</span>. Divisi lain tidak memiliki izin akses
          ke halaman maupun fungsi internal modul Teknik.
        </p>
        <button
          type="button"
          onClick={() => setActiveModule('dashboard')}
          className="mt-5 px-4 py-2 rounded-lg bg-[#13233C] text-white text-sm font-semibold hover:bg-[#1D304D] cursor-pointer whitespace-nowrap"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Teknik · Jadwal, Pembagian Tugas & Progres Lapangan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pantau progres harian, mingguan, bulanan, kendala lapangan, dan tindak lanjut teknis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{isOnline ? 'Input Pekerjaan / Progres' : 'Buat Draft Progres Offline'}</span>
          </button>
        </div>
      </div>

      {/* Integrated Operational Workflow Queues: Tim Teknik & Tim Lapangan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stage 1: Tim Teknik Queue */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">
                1. Antrean Tim Teknik → Ajukan ke Finance
              </h2>
              <p className="text-[11px] text-slate-500">
                Lengkapi RAB, kebutuhan material, biaya, jadwal & dokumen sebelum dikirim ke Finance.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1D7AFC] text-xs font-bold font-mono">
              {teknikQueue.length}
            </span>
          </div>
          {teknikQueue.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">
              Seluruh proyek tahap persiapan Teknik telah diajukan ke Finance.
            </p>
          ) : (
            <div className="space-y-2.5">
              {teknikQueue.map((wf) => {
                const prj = state.projects.find((p) => p.id === wf.project_id);
                if (!prj || prj.is_deleted) return null;
                const meta = getWorkflowStageMeta(wf.stage);
                const rabCount = state.budgets.filter((b) => b.project_id === prj.id && !b.is_deleted).length;
                const rabSum = state.budgets
                  .filter((b) => b.project_id === prj.id && !b.is_deleted)
                  .reduce((a, b) => a + b.total_cost, 0);
                return (
                  <div
                    key={wf.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono font-bold text-[#1D7AFC]">
                          {prj.project_number}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 truncate">{prj.name}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.badgeClass}`}
                      >
                        {meta.shortLabel}
                      </span>
                    </div>
                    {(wf.stage === 'REVISI_TEKNIK' || wf.stage === 'DITOLAK_FINANCE') &&
                      wf.returned_reason && (
                        <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>Revisi Finance:</strong> {wf.returned_reason}
                          </span>
                        </div>
                      )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>
                        {rabCount} Pos RAB ({formatRupiah(rabSum, true)}) ·{' '}
                        {wf.material_needs.length} Material
                      </span>
                      <button
                        type="button"
                        onClick={() => setWorkflowModal({ project: prj, tab: 'teknik' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Siapkan & Ajukan Finance</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stage 4: Tim Lapangan Queue */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">
                4. Antrean Tim Lapangan (Siap & Berjalan)
              </h2>
              <p className="text-[11px] text-slate-500">
                Pekerjaan yang telah lolos Finance & Logistik — input progres, pemakaian material, & foto.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold font-mono">
              {lapanganQueue.length}
            </span>
          </div>
          {lapanganQueue.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">
              Belum ada proyek aktif yang diteruskan Logistik ke Lapangan saat ini.
            </p>
          ) : (
            <div className="space-y-2.5">
              {lapanganQueue.map((wf) => {
                const prj = state.projects.find((p) => p.id === wf.project_id);
                if (!prj) return null;
                const meta = getWorkflowStageMeta(wf.stage);
                return (
                  <div
                    key={wf.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono font-bold text-[#1D7AFC]">
                          {prj.project_number}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 truncate">{prj.name}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.badgeClass}`}
                      >
                        {meta.shortLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>
                        Progres Fisik: <strong className="font-mono">{prj.progress_percent}%</strong>{' '}
                        · {wf.field_reports.length} Laporan Lapangan
                      </span>
                      <button
                        type="button"
                        onClick={() => setWorkflowModal({ project: prj, tab: 'lapangan' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Laporan Lapangan & Foto</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Integrated Report & Technical Progress Index Center (Inside Dashboard Teknik) */}
      <TeknikReportCenter
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
      />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari pekerjaan, kendala, atau tindak lanjut..."
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
        {canRestore && archivedWorks.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className={`px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 cursor-pointer ${
              showArchive
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Arsip Pekerjaan ({archivedWorks.length})</span>
          </button>
        )}
      </div>

      {canRestore && showArchive && archivedWorks.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs sm:text-sm font-bold text-amber-900">
            Arsip Progres Pekerjaan Terhapus ({archivedWorks.length})
          </h3>
          <div className="divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200">
            {archivedWorks.map((aw) => (
              <div
                key={aw.id}
                className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{aw.title}</span> ({aw.overall_progress}%)
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Dihapus oleh <strong>{aw.deleted_by_name ?? '-'}</strong>
                    {aw.deleted_at ? ` pada ${formatDateTimeID(aw.deleted_at)}` : ''} · Alasan: {aw.delete_reason ?? '-'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreWorkItem(aw.id)}
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

      {/* Table of Work Items */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Pekerjaan & Dokumentasi</th>
                <th className="py-3 px-4 font-semibold">Penanggung Jawab & Jadwal</th>
                <th className="py-3 px-4 font-semibold text-right">Harian / Mingguan / Total</th>
                <th className="py-3 px-4 font-semibold">Kendala & Tindak Lanjut</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((w) => {
                const prj = state.projects.find((p) => p.id === w.project_id);
                const pic = state.employees.find((e) => e.id === w.pic_employee_id);
                const latestWorkPhoto =
                  getLatestPhotoFor('teknik', w.id) ?? getLatestPhotoFor('proyek', w.project_id);
                const safeFieldUrl =
                  w.field_photo_url && !isStaticSamplePhotoUrl(w.field_photo_url)
                    ? w.field_photo_url
                    : '';
                return (
                  <tr key={w.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-12 rounded overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                          {latestWorkPhoto ? (
                            <ProtectedAttachmentImage
                              key={latestWorkPhoto.id}
                              attachment={latestWorkPhoto}
                              className="w-16 h-12 object-cover"
                            />
                          ) : (
                            <FallbackImage
                              src={safeFieldUrl}
                              alt={w.title}
                              className="w-16 h-12 object-cover"
                            />
                          )}
                        </div>
                        <div>
                          <div className="font-mono text-[11px] text-blue-700 font-semibold">
                            {prj?.project_number}
                          </div>
                          <div className="font-semibold text-slate-900 mt-0.5">{w.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{pic?.full_name ?? '-'}</div>
                      <div className="text-slate-500 mt-0.5">
                        {formatDateID(w.start_date)} – {formatDateID(w.due_date)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-600">
                        +{w.daily_progress}% / +{w.weekly_progress}%
                      </div>
                      <div className="font-bold text-blue-700">{w.overall_progress}%</div>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-slate-800">Kendala: {w.constraints || '-'}</div>
                      <div className="text-slate-500 mt-0.5">Tindak lanjut: {w.follow_up || '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={w.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <ModuleAttachmentToolbar
                          compact
                          moduleId="teknik"
                          entityId={w.id}
                          entityLabel={`${prj?.project_number ?? ''} · ${w.title}`}
                          title={`Lampiran Pekerjaan: ${w.title}`}
                          subtitle="Shop drawing, laporan teknis, dan foto progres lapangan"
                          defaultCategory="Foto Lapangan"
                        />
                        <button
                          type="button"
                          onClick={() => setViewingWork(w)}
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Lihat Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(w)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded hover:bg-blue-50 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Update</span>
                        </button>
                        {allowEdit && (
                          <button
                            type="button"
                            onClick={() => setDeletingWork(w)}
                            className="p-1.5 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                            title="Hapus / Arsipkan Pekerjaan"
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
      </div>

      {/* Add/Update Work Item Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Perbarui Progres Pekerjaan Teknik' : 'Tambah Pekerjaan & Jadwal Teknik'}
        subtitle={
          isOnline
            ? 'Pembaruan langsung tersimpan dan mengirimkan notifikasi progres ke Head Teknik'
            : 'Mode Offline: Perubahan dapat disimpan sebagai draft lokal untuk disinkronkan nanti'
        }
      >
        <form onSubmit={(e) => handleSave(e, false)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Proyek</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Penanggung Jawab</label>
              <select
                value={form.pic_employee_id}
                onChange={(e) => setForm({ ...form, pic_employee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {state.employees
                  .filter((e) => e.division_id === 'div-teknik' && e.status === 'Aktif')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Pekerjaan</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Harian (%)</label>
              <input
                type="number"
                step="0.5"
                value={form.daily_progress}
                onChange={(e) => setForm({ ...form, daily_progress: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mingguan (%)</label>
              <input
                type="number"
                step="0.5"
                value={form.weekly_progress}
                onChange={(e) => setForm({ ...form, weekly_progress: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bulanan (%)</label>
              <input
                type="number"
                value={form.monthly_progress}
                onChange={(e) => setForm({ ...form, monthly_progress: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.overall_progress}
                onChange={(e) => setForm({ ...form, overall_progress: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as WorkItemStatus })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Terjadwal">Terjadwal</option>
                <option value="Dikerjakan">Dikerjakan</option>
                <option value="Kendala">Kendala</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tenggat</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kendala Lapangan</label>
            <textarea
              rows={2}
              value={form.constraints}
              onChange={(e) => setForm({ ...form, constraints: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tindak Lanjut</label>
            <textarea
              rows={2}
              value={form.follow_up}
              onChange={(e) => setForm({ ...form, follow_up: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Dokumen Gambar Kerja &amp; Foto Pekerjaan
            </span>
            <ModuleAttachmentToolbar
              compact
              moduleId="teknik"
              entityId={editing?.id || form.project_id || 'teknik-drawings'}
              entityLabel={
                editing
                  ? editing.title
                  : state.projects.find((p) => p.id === form.project_id)?.project_number ?? 'Pekerjaan Teknik'
              }
              title={`Lampiran Pekerjaan: ${editing?.title || form.title || 'Proyek'}`}
              subtitle="Unggah gambar kerja, shop drawing, laporan teknis, dan foto progres"
              defaultCategory="Foto Lapangan"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={(e) => handleSave(e, true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg cursor-pointer"
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span>Simpan Draft Offline</span>
            </button>
            {isOnline && (
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Simpan & Publikasikan
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* Workflow Workspace Modal */}
      <Modal
        open={Boolean(workflowModal)}
        onClose={() => setWorkflowModal(null)}
        title={
          workflowModal
            ? `Workflow Operasional — ${workflowModal.project.project_number}`
            : 'Workflow Operasional'
        }
        subtitle={workflowModal?.project.name}
        maxWidth="max-w-5xl"
      >
        {workflowModal && (
          <ProjectWorkflowPanel
            project={workflowModal.project}
            initialTab={workflowModal.tab}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(viewingWork)}
        onClose={() => setViewingWork(null)}
        title="Detail Pekerjaan Teknik"
        subtitle={viewingWork?.title}
        maxWidth="max-w-lg"
      >
        {viewingWork && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <StatusLabel status={viewingWork.status} />
              <span className="font-mono font-bold text-blue-700">
                Progres Total: {viewingWork.overall_progress}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Periode Pelaksanaan</span>
                <span className="font-semibold text-slate-900">
                  {formatDateID(viewingWork.start_date)} – {formatDateID(viewingWork.due_date)}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">PIC Pekerjaan</span>
                <span className="font-semibold text-slate-900">
                  {state.employees.find((e) => e.id === viewingWork.pic_employee_id)?.full_name ?? '-'}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Kendala</span>
              <p className="text-slate-800 mt-0.5">{viewingWork.constraints || '-'}</p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Tindak Lanjut</span>
              <p className="text-slate-800 mt-0.5">{viewingWork.follow_up || '-'}</p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
              <span className="font-semibold text-slate-700">Lampiran &amp; Dokumentasi Pekerjaan</span>
              <ModuleAttachmentToolbar
                compact
                moduleId="teknik"
                entityId={viewingWork.id}
                entityLabel={viewingWork.title}
                title={`Lampiran Pekerjaan: ${viewingWork.title}`}
                subtitle="Shop drawing, laporan teknis, dan foto progres lapangan"
                defaultCategory="Foto Lapangan"
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingWork)}
        title={deletingWork ? `Arsipkan / Hapus Pekerjaan "${deletingWork.title}"?` : ''}
        description={
          deletingWork
            ? `Data yang akan dihapus: ${deletingWork.title} (Progres ${deletingWork.overall_progress}%). Progres diarsipkan secara aman (Soft Delete) tanpa menghapus data RAB/keuangan proyek dan dapat dipulihkan admin.`
            : ''
        }
        confirmLabel="Arsipkan Pekerjaan"
        danger
        requireNote
        noteLabel="Alasan Pengarsipan / Penghapusan"
        onCancel={() => setDeletingWork(null)}
        onConfirm={(reason) => {
          if (deletingWork) softDeleteWorkItem(deletingWork.id, reason);
          setDeletingWork(null);
        }}
      />
    </div>
  );
};
