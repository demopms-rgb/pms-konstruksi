import React, { useMemo, useState } from 'react';
import { Archive, Edit3, Eye, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { BudgetItem } from '../../types/pms';
import { formatDateID, formatDateTimeID, formatNumber, formatRupiah } from '../../utils/format';
import { canEditRAB, canRestoreArchivedData } from '../../utils/permissions';
import { ConfirmDialog, Modal, PaginationBar, SearchInput } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';

export const RABModule: React.FC = () => {
  const {
    state,
    currentRole,
    currentDivision,
    addBudgetItem,
    updateBudgetItem,
    softDeleteBudgetItem,
    restoreBudgetItem,
  } = usePMS();
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [viewing, setViewing] = useState<BudgetItem | null>(null);
  const [deletingRab, setDeletingRab] = useState<BudgetItem | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const allowEdit =
    currentRole && currentDivision ? canEditRAB(currentRole.code, currentDivision.code) : false;
  const canRestore = currentRole ? canRestoreArchivedData(currentRole.code) : false;

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const [form, setForm] = useState({
    project_id: activeProjects[0]?.id ?? state.projects[0]?.id ?? '',
    category: 'Pekerjaan Dinding & Plafon',
    work_item_name: '',
    volume: 50,
    unit: 'm2',
    unit_price: 350000,
    target_qty: 50,
    actual_qty: 0,
    pic_employee_id: state.employees[2]?.id ?? state.employees[0].id,
    execution_date: new Date().toISOString().slice(0, 10),
    field_doc_ref: '',
    constraints: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.budgets.filter((b) => {
      if (b.is_deleted) return false;
      if (projectFilter !== 'SEMUA' && b.project_id !== projectFilter) return false;
      if (!q) return true;
      return (
        b.work_item_name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.constraints.toLowerCase().includes(q)
      );
    });
  }, [state.budgets, search, projectFilter]);

  const archivedBudgets = useMemo(
    () =>
      state.budgets.filter((b) => {
        if (!b.is_deleted) return false;
        if (projectFilter !== 'SEMUA' && b.project_id !== projectFilter) return false;
        return true;
      }),
    [state.budgets, projectFilter]
  );

  const totalBudgetSum = useMemo(
    () => filtered.reduce((acc, b) => acc + b.total_cost, 0),
    [filtered]
  );

  const totalRealizationValue = useMemo(
    () =>
      filtered.reduce((acc, b) => {
        const pct = Math.min(1, b.actual_qty / Math.max(1, b.target_qty));
        return acc + b.total_cost * pct;
      }, 0),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openCreate = () => {
    setEditing(null);
    setForm({
      project_id:
        projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id ?? state.projects[0]?.id ?? '',
      category: 'Pekerjaan Dinding & Plafon',
      work_item_name: '',
      volume: 50,
      unit: 'm2',
      unit_price: 350000,
      target_qty: 50,
      actual_qty: 0,
      pic_employee_id: state.employees.find((e) => e.division_id === 'div-teknik')?.id ?? state.employees[0].id,
      execution_date: new Date().toISOString().slice(0, 10),
      field_doc_ref: '',
      constraints: 'Belum ada kendala.',
    });
    setModalOpen(true);
  };

  const openEdit = (b: BudgetItem) => {
    setEditing(b);
    setForm({
      project_id: b.project_id,
      category: b.category,
      work_item_name: b.work_item_name,
      volume: b.volume,
      unit: b.unit,
      unit_price: b.unit_price,
      target_qty: b.target_qty,
      actual_qty: b.actual_qty,
      pic_employee_id: b.pic_employee_id,
      execution_date: b.execution_date,
      field_doc_ref: b.field_doc_ref,
      constraints: b.constraints,
    });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const total_cost = form.volume * form.unit_price;
    if (editing) {
      updateBudgetItem({ ...editing, ...form, total_cost });
    } else {
      addBudgetItem({ ...form, total_cost });
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Rencana Anggaran Biaya (RAB) & Pemantauan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rincian volume, harga satuan, total anggaran proyek, serta realisasi fisik dan kendala pekerjaan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleAttachmentToolbar
            moduleId="rab"
            entityId={projectFilter !== 'SEMUA' ? projectFilter : 'rab-master'}
            entityLabel={
              projectFilter !== 'SEMUA'
                ? state.projects.find((p) => p.id === projectFilter)?.project_number ?? 'RAB Proyek'
                : 'Arsip RAB Perusahaan'
            }
            title="Dokumen & Lampiran RAB"
            subtitle="Unggah file Excel (.xls/.xlsx), PDF RAB, dan gambar pendukung"
            defaultCategory="Dokumen RAB"
          />
          {allowEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pos RAB</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <span className="text-xs text-slate-500">Total Anggaran RAB (Filter Aktif)</span>
          <p className="text-lg font-bold font-mono text-slate-900 tabular-nums mt-1">
            {formatRupiah(totalBudgetSum)}
          </p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <span className="text-xs text-slate-500">Nilai Realisasi Terpasang</span>
          <p className="text-lg font-bold font-mono text-blue-700 tabular-nums mt-1">
            {formatRupiah(totalRealizationValue)}
          </p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4">
          <span className="text-xs text-slate-500">Serapan Fisik Rata-rata</span>
          <p className="text-lg font-bold font-mono text-emerald-700 tabular-nums mt-1">
            {totalBudgetSum > 0
              ? `${Math.round((totalRealizationValue / totalBudgetSum) * 100)}%`
              : '0%'}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Cari kategori, uraian pekerjaan, atau kendala..."
        />
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
        >
          <option value="SEMUA">Semua Proyek Aktif</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_number} — {p.name}
            </option>
          ))}
        </select>
        {canRestore && archivedBudgets.length > 0 && (
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
            <span>Arsip RAB ({archivedBudgets.length})</span>
          </button>
        )}
      </div>

      {canRestore && showArchive && archivedBudgets.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs sm:text-sm font-bold text-amber-900">
            Arsip Item RAB Terhapus ({archivedBudgets.length})
          </h3>
          <div className="divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200">
            {archivedBudgets.map((ab) => (
              <div
                key={ab.id}
                className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{ab.work_item_name}</span> (
                  {formatRupiah(ab.total_cost)})
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Dihapus oleh <strong>{ab.deleted_by_name ?? '-'}</strong>
                    {ab.deleted_at ? ` pada ${formatDateTimeID(ab.deleted_at)}` : ''} · Alasan:{' '}
                    {ab.delete_reason ?? '-'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreBudgetItem(ab.id)}
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

      {/* RAB Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Kategori & Uraian Pekerjaan</th>
                <th className="py-3 px-4 font-semibold text-right">Volume</th>
                <th className="py-3 px-4 font-semibold text-right">Harga Satuan</th>
                <th className="py-3 px-4 font-semibold text-right">Jumlah Biaya</th>
                <th className="py-3 px-4 font-semibold text-right">Target vs Realisasi</th>
                <th className="py-3 px-4 font-semibold">PIC & Dokumentasi</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((b) => {
                const prj = state.projects.find((p) => p.id === b.project_id);
                const pic = state.employees.find((e) => e.id === b.pic_employee_id);
                const pct = Math.min(100, Math.round((b.actual_qty / Math.max(1, b.target_qty)) * 100));
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 max-w-xs">
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-700 font-semibold">
                        <span>{prj?.project_number} · {b.category}</span>
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">{b.work_item_name}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Kendala: {b.constraints || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatNumber(b.volume)} {b.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatRupiah(b.unit_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(b.total_cost)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatNumber(b.actual_qty)} / {formatNumber(b.target_qty)} {b.unit}
                      </div>
                      <div className="text-[11px] font-mono text-blue-700 tabular-nums">{pct}%</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{pic?.full_name ?? '-'}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatDateID(b.execution_date)} · {b.field_doc_ref || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <ModuleAttachmentToolbar
                          compact
                          moduleId="rab"
                          entityId={b.id}
                          entityLabel={`${prj?.project_number ?? 'RAB'} · ${b.work_item_name}`}
                          title={`Lampiran Pos RAB: ${b.work_item_name}`}
                          subtitle="Dokumen RAB Excel, PDF, atau foto pendukung pekerjaan"
                          defaultCategory="Dokumen RAB"
                        />
                        <button
                          type="button"
                          onClick={() => setViewing(b)}
                          className="p-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                          title="Lihat Detail Pos RAB"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {allowEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded hover:bg-blue-50 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingRab(b)}
                              className="p-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 cursor-pointer"
                              title="Hapus / Arsipkan Pos RAB"
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
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          onPageChange={setPage}
        />
      </div>

      {/* Add/Edit RAB Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Pos RAB & Realisasi' : 'Tambah Pos RAB Baru'}
      >
        <form onSubmit={handleSave} className="space-y-4">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori Pekerjaan</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Uraian Pekerjaan</label>
            <input
              type="text"
              value={form.work_item_name}
              onChange={(e) => setForm({ ...form, work_item_name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Volume</label>
              <input
                type="number"
                value={form.volume}
                onChange={(e) =>
                  setForm({
                    ...form,
                    volume: Number(e.target.value),
                    target_qty: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Satuan</label>
              <input
                type="number"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Realisasi Vol.</label>
              <input
                type="number"
                value={form.actual_qty}
                onChange={(e) => setForm({ ...form, actual_qty: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600">Jumlah Biaya Terhitung (Volume × Harga Satuan):</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              {formatRupiah(form.volume * form.unit_price)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Penanggung Jawab</label>
              <select
                value={form.pic_employee_id}
                onChange={(e) => setForm({ ...form, pic_employee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {state.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dokumentasi Lapangan</label>
              <input
                type="text"
                value={form.field_doc_ref}
                onChange={(e) => setForm({ ...form, field_doc_ref: e.target.value })}
                placeholder="Contoh: Foto-Pemasangan-Atap-PRJ001.jpg"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kendala Pekerjaan</label>
            <textarea
              rows={2}
              value={form.constraints}
              onChange={(e) => setForm({ ...form, constraints: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Simpan RAB
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="Detail Pos RAB"
        subtitle={viewing?.category}
        maxWidth="max-w-lg"
      >
        {viewing && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Uraian Pekerjaan</span>
              <span className="text-sm font-bold text-slate-900">{viewing.work_item_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Volume & Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatNumber(viewing.volume)} {viewing.unit}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Harga Satuan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatRupiah(viewing.unit_price)}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Total Biaya</span>
                <span className="font-mono font-bold text-blue-700">
                  {formatRupiah(viewing.total_cost)}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Realisasi Lapangan</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatNumber(viewing.actual_qty)} / {formatNumber(viewing.target_qty)} {viewing.unit}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Kendala</span>
              <p className="text-slate-800 mt-0.5">{viewing.constraints || '-'}</p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRab)}
        title={deletingRab ? `Arsipkan / Hapus Item RAB "${deletingRab.work_item_name}"?` : ''}
        description={
          deletingRab
            ? (() => {
                const relWorks = state.workItems.filter(
                  (w) => w.budget_id === deletingRab.id && !w.is_deleted
                ).length;
                const relFin = state.financialTransactions.filter(
                  (f) => f.budget_id === deletingRab.id
                ).length;
                return `Data yang akan dihapus: ${deletingRab.work_item_name} (${formatRupiah(deletingRab.total_cost)}). Terkait dengan ${relWorks} pekerjaan dan ${relFin} transaksi keuangan — seluruh riwayat tetap aman karena menggunakan Arsip (Soft Delete).`;
              })()
            : ''
        }
        confirmLabel="Arsipkan Item RAB"
        danger
        requireNote
        noteLabel="Alasan Penghapusan / Pengarsipan"
        onCancel={() => setDeletingRab(null)}
        onConfirm={(reason) => {
          if (deletingRab) softDeleteBudgetItem(deletingRab.id, reason);
          setDeletingRab(null);
        }}
      />
    </div>
  );
};
