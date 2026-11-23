import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { ApprovalRecord } from '../../types/pms';
import { formatDateTimeID } from '../../utils/format';
import { canApproveItems } from '../../utils/permissions';
import { ConfirmDialog, EmptyState, SearchInput, StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';

export const PersetujuanModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    setActiveModule,
    setGudangSubmenu,
    setSelectedDocumentId,
    setSelectedProjectId,
    advanceWarehouseMaterialRequestApi,
    advanceDocumentStatus,
    decideFinancialTransaction,
    decideWorkflowFinance,
  } = usePMS();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('SEMUA');
  const [confirmDecision, setConfirmDecision] = useState<{
    approval: ApprovalRecord;
    approve: boolean;
  } | null>(null);

  const allowApprove = currentRole ? canApproveItems(currentRole.code) : false;

  const visibleApprovals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.approvals.filter((a) => {
      if (currentRole?.code === 'HEAD' && a.division_id !== currentDivision?.id) return false;
      if (currentRole?.code === 'STAFF' && a.requester_id !== currentUser?.id) return false;
      if (statusFilter !== 'SEMUA' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.reference_no.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.notes.toLowerCase().includes(q)
      );
    });
  }, [state.approvals, currentRole, currentDivision, currentUser, statusFilter, search]);

  const handleOpenDetail = (a: ApprovalRecord) => {
    if (a.entity_type === 'Document') {
      setSelectedDocumentId(a.entity_id);
      setActiveModule('dokumen');
    } else if (a.entity_type === 'MaterialRequest') {
      setActiveModule('gudang');
      setGudangSubmenu('permintaan-material');
    } else if (a.entity_type === 'ProjectWorkflow') {
      setSelectedProjectId(a.entity_id);
      setActiveModule('proyek');
    } else {
      setActiveModule('finance');
    }
  };

  const handleExecuteDecision = async (note: string) => {
    if (!confirmDecision) return;
    const { approval, approve } = confirmDecision;
    if (approval.entity_type === 'MaterialRequest') {
      await advanceWarehouseMaterialRequestApi(approval.entity_id, {
        next_status: approve ? 'Disetujui Head' : 'Ditolak Head',
        note,
      });
    } else if (approval.entity_type === 'Document') {
      advanceDocumentStatus(approval.entity_id, approve ? 'Disetujui' : 'Ditolak', note);
    } else if (approval.entity_type === 'ProjectWorkflow') {
      const rabSum = state.budgets
        .filter((b) => b.project_id === approval.entity_id)
        .reduce((a, b) => a + b.total_cost, 0);
      await decideWorkflowFinance(approval.entity_id, {
        decision: approve ? 'APPROVE' : 'REJECT',
        note,
        approved_budget_limit: rabSum,
      });
    } else if (approval.entity_type === 'Finance') {
      decideFinancialTransaction(
        approval.entity_id,
        approve ? 'Terverifikasi' : 'Ditolak',
        note
      );
    }
    setConfirmDecision(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {allowApprove ? 'Pusat Persetujuan Berjenjang' : 'Status Pengajuan & Persetujuan Saya'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {allowApprove
              ? 'Tinjau, setujui, atau tolak pengajuan permintaan material, dokumen internal, dan verifikasi keuangan sesuai kewenangan.'
              : 'Pantau status pemeriksaan dan keputusan Head Divisi atas permintaan serta dokumen yang Anda ajukan.'}
          </p>
        </div>
        <ModuleAttachmentToolbar
          moduleId="persetujuan"
          entityId="persetujuan-umum"
          entityLabel="Pusat Dokumen Persetujuan"
          title="Arsip Dokumen & Bukti Persetujuan"
          subtitle="Lampiran pengajuan, dokumen pendukung, dan bukti persetujuan resmi"
          defaultCategory="Lampiran Persetujuan"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
          {(['SEMUA', 'Menunggu', 'Disetujui', 'Ditolak'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-[#13233C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'SEMUA' ? 'Semua' : st}
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nomor referensi atau judul pengajuan..."
        />
      </div>

      {visibleApprovals.length === 0 ? (
        <EmptyState
          title="Tidak Ada Data Persetujuan"
          description="Belum ada pengajuan yang sesuai dengan filter dan hak akses Anda."
        />
      ) : (
        <div className="space-y-3">
          {visibleApprovals.map((apr) => {
            const requester = state.employees.find((e) => e.id === apr.requester_id);
            const approver = apr.approver_id
              ? state.employees.find((e) => e.id === apr.approver_id)
              : null;
            const div = state.divisions.find((d) => d.id === apr.division_id);
            const typeLabel =
              apr.entity_type === 'MaterialRequest'
                ? 'Permintaan Material'
                : apr.entity_type === 'Document'
                ? 'Dokumen & Surat'
                : apr.entity_type === 'ProjectWorkflow'
                ? 'Workflow Proyek & RAB'
                : 'Verifikasi Keuangan';

            return (
              <div
                key={apr.id}
                className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-blue-700">{apr.reference_no}</span>
                    <span aria-hidden="true">·</span>
                    <span>{typeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>Divisi {div?.name ?? '-'}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{apr.title}</h3>
                  <p className="text-xs text-slate-600">{apr.notes}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Diajukan oleh <strong>{requester?.full_name ?? '-'}</strong> pada{' '}
                    {formatDateTimeID(apr.requested_at)}
                    {approver && ` · Diputuskan oleh ${approver.full_name}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <StatusLabel status={apr.status} />
                  <ModuleAttachmentToolbar
                    compact
                    moduleId="persetujuan"
                    entityId={apr.id}
                    entityLabel={`${apr.reference_no} — ${apr.title}`}
                    title={`Lampiran Persetujuan: ${apr.reference_no}`}
                    subtitle="Lampiran pengajuan, dokumen pendukung, dan bukti persetujuan"
                    defaultCategory="Lampiran Persetujuan"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(apr)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Tinjau Modul</span>
                  </button>
                  {allowApprove && apr.status === 'Menunggu' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmDecision({ approval: apr, approve: false })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Tolak</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDecision({ approval: apr, approve: true })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Setujui</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDecision)}
        title={
          confirmDecision?.approve
            ? `Setujui ${confirmDecision.approval.reference_no}?`
            : `Tolak ${confirmDecision?.approval.reference_no}?`
        }
        description={
          confirmDecision?.approve
            ? 'Keputusan persetujuan akan langsung meneruskan proses operasional ke tahap berikutnya dan membubuhkan otorisasi digital.'
            : 'Berikan alasan penolakan yang jelas agar pengaju dapat melakukan perbaikan.'
        }
        confirmLabel={confirmDecision?.approve ? 'Ya, Setujui' : 'Tolak Pengajuan'}
        danger={!confirmDecision?.approve}
        requireNote={!confirmDecision?.approve}
        onCancel={() => setConfirmDecision(null)}
        onConfirm={handleExecuteDecision}
      />
    </div>
  );
};
