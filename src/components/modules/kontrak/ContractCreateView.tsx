import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  FileUp,
  Info,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { ContractSubmenuKey } from '../../../types/pms';
import { formatDateID, formatRupiah } from '../../../utils/format';
import { canCreateContract } from '../../../utils/permissions';
import { EmptyState, StatusLabel } from '../../ui/CommonUI';

interface ContractCreateViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const ContractCreateView: React.FC<ContractCreateViewProps> = ({ onNavigateSubmenu }) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    createContractApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { uploadFiles } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowCreate = canCreateContract(roleCode, divCode);

  const eligibleProjects = useMemo(() => {
    return state.projects.filter((p) => {
      if (p.is_deleted) return false;
      const wf = state.workflows.find((w) => w.project_id === p.id);
      const financeApproved =
        Boolean(
          wf &&
            wf.finance_decided_at &&
            !['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE', 'MENUNGGU_FINANCE'].includes(
              wf.stage
            )
        ) || ['Berjalan', 'Dalam Pengerjaan', 'Selesai'].includes(p.status);
      return financeApproved;
    });
  }, [state.projects, state.workflows]);

  const unapprovedProjects = useMemo(() => {
    const eligibleIds = new Set(eligibleProjects.map((p) => p.id));
    return state.projects.filter((p) => !p.is_deleted && !eligibleIds.has(p.id));
  }, [state.projects, eligibleProjects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(eligibleProjects[0]?.id ?? '');

  const selectedProject = useMemo(
    () => eligibleProjects.find((p) => p.id === selectedProjectId) ?? null,
    [eligibleProjects, selectedProjectId]
  );

  const selectedWorkflow = useMemo(
    () =>
      selectedProject
        ? state.workflows.find((w) => w.project_id === selectedProject.id) ?? null
        : null,
    [state.workflows, selectedProject]
  );

  const rabApprovedValue = useMemo(() => {
    if (!selectedProject) return 0;
    if (selectedWorkflow && selectedWorkflow.approved_budget_limit > 0) {
      return selectedWorkflow.approved_budget_limit;
    }
    const rabSum = state.budgets
      .filter((b) => b.project_id === selectedProject.id && !b.is_deleted)
      .reduce((acc, b) => acc + b.total_cost, 0);
    return rabSum || selectedProject.contract_value;
  }, [selectedProject, selectedWorkflow, state.budgets]);

  const picName = useMemo(() => {
    if (!selectedProject) return currentUser?.full_name ?? '';
    return (
      state.employees.find((e) => e.id === selectedProject.pic_employee_id)?.full_name ??
      currentUser?.full_name ??
      ''
    );
  }, [selectedProject, state.employees, currentUser]);

  const [contractNumber, setContractNumber] = useState(
    `SPK/WAS/2026/${String(state.contracts.filter((c) => !c.is_deleted).length + 1).padStart(3, '0')}`
  );
  const [workName, setWorkName] = useState('');
  const [contractValue, setContractValue] = useState<number>(0);
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [firstPartyName, setFirstPartyName] = useState('');
  const [secondPartyName, setSecondPartyName] = useState('PT. Wilwa Abiyasa Sejahtera');
  const [picContract, setPicContract] = useState(currentUser?.full_name ?? '');
  const [scopeDescription, setScopeDescription] = useState('');
  const [contractNotes, setContractNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [verifyChecked, setVerifyChecked] = useState(true);
  const [goToTimelineAfter, setGoToTimelineAfter] = useState(true);

  useEffect(() => {
    if (!selectedProject) return;
    setWorkName(selectedProject.name);
    setContractValue(selectedProject.contract_value || rabApprovedValue);
    setStartDate(selectedProject.start_date);
    setEndDate(selectedProject.target_end_date);
    setFirstPartyName(selectedProject.client_name);
    setScopeDescription(selectedProject.description);
  }, [selectedProject?.id, rabApprovedValue]);

  const rabDelta = contractValue - rabApprovedValue;
  const rabDeltaPct =
    rabApprovedValue > 0 ? ((rabDelta / rabApprovedValue) * 100).toFixed(1) : '0.0';

  useEffect(() => {
    if (!allowCreate) {
      showToast('Anda tidak memiliki hak akses untuk membuat kontrak');
    }
  }, [allowCreate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowCreate) {
      showToast('Anda tidak memiliki hak akses untuk membuat kontrak');
      return;
    }
    if (!selectedProject) {
      showToast('Pilih proyek yang sudah disetujui Tim Finance.');
      return;
    }
    if (pendingFiles.length === 0) {
      showToast('Unggah minimal 1 dokumen kontrak/SPK resmi dalam format PDF.');
      return;
    }

    const res = await createContractApi({
      project_id: selectedProject.id,
      contract_number: contractNumber.trim(),
      work_name: workName.trim(),
      contract_value: contractValue,
      rab_approved_value: rabApprovedValue,
      contract_date: contractDate,
      start_date: startDate,
      end_date: endDate,
      counterparty: firstPartyName.trim(),
      first_party_name: firstPartyName.trim(),
      second_party_name: secondPartyName.trim(),
      pic_contract: picContract.trim(),
      scope_description: scopeDescription.trim(),
      contract_notes: contractNotes.trim(),
      finance_approved_date:
        selectedWorkflow?.finance_decided_at?.slice(0, 10) || contractDate,
      document_ref: pendingFiles[0]?.name || 'Dokumen-Kontrak.pdf',
      document_verified: verifyChecked && pendingFiles.some((f) => f.name.toLowerCase().endsWith('.pdf')),
    });

    if (!res.ok || !res.contract) return;

    try {
      await uploadFiles({
        files: pendingFiles,
        module_id: 'kontrak',
        entity_id: res.contract.id,
        entity_label: `${res.contract.contract_number} — ${res.contract.work_name}`,
        doc_category: 'Kontrak Kerja',
        description: `Dokumen kontrak resmi ${res.contract.contract_number}`,
        onProgress: setUploadProgress,
      });
    } catch (err) {
      showToast(
        err instanceof Error
          ? `Kontrak tersimpan, namun upload dokumen gagal: ${err.message}`
          : 'Kontrak tersimpan, gagal upload dokumen.'
      );
    }

    setPendingFiles([]);
    setUploadProgress(0);
    if (goToTimelineAfter) {
      onNavigateSubmenu('timeline', res.contract.id);
    } else {
      onNavigateSubmenu('daftar', res.contract.id);
    }
  };

  if (!allowCreate) {
    return (
      <EmptyState
        title="Anda tidak memiliki hak akses untuk membuat kontrak"
        description="Fitur Pembuatan Kontrak hanya dapat diakses oleh Super Admin, Head Finance, dan Staff Finance."
        actionLabel="Kembali ke Daftar Kontrak"
        onAction={() => onNavigateSubmenu('daftar')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Pembuatan Kontrak Proyek
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kontrak hanya dapat dibuat dari proyek yang sudah disetujui Tim Finance, lengkap dengan dokumen SPK/Kontrak PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateSubmenu('daftar')}
          className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          Kembali ke Daftar Kontrak
        </button>
      </div>

      {eligibleProjects.length === 0 ? (
        <EmptyState
          title="Belum Ada Proyek Disetujui Finance"
          description="Kontrak tidak boleh dibuat dari proyek yang belum disetujui Tim Finance. Pastikan proyek sudah diajukan Tim Teknik dan disetujui Finance."
        />
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Main Form */}
          <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Pilih Proyek (Sudah Disetujui Finance) <span className="text-red-600">*</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-[#1D7AFC]"
                required
              >
                {eligibleProjects.map((p) => {
                  const hasCtr = state.contracts.some((c) => !c.is_deleted && c.project_id === p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name} ({p.client_name}) {hasCtr ? '· [Sudah Ada Kontrak]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Kontrak / SPK <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="SPK/WAS/2026/004"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Kontrak <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Pekerjaan Kontrak <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={workName}
                onChange={(e) => setWorkName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nilai Kontrak Final (IDR) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={contractValue}
                  onChange={(e) => setContractValue(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Mulai Pekerjaan <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Selesai Pekerjaan <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pihak Pertama (Instansi / Klien) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={firstPartyName}
                  onChange={(e) => setFirstPartyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pihak Kedua (Pelaksana) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={secondPartyName}
                  onChange={(e) => setSecondPartyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIC Kontrak <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={picContract}
                  onChange={(e) => setPicContract(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ruang Lingkup Pekerjaan Kontrak
              </label>
              <textarea
                rows={3}
                value={scopeDescription}
                onChange={(e) => setScopeDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Kontrak
              </label>
              <textarea
                rows={2}
                value={contractNotes}
                onChange={(e) => setContractNotes(e.target.value)}
                placeholder="Syarat retensi, jaminan pelaksanaan, atau catatan klausul penting..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
              />
            </div>

            {/* Mandatory PDF Upload */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#13233C]">
                    Upload Dokumen Kontrak Resmi (PDF Wajib) <span className="text-red-600">*</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Unggah file SPK / Surat Perjanjian Kerja berformat PDF. Kontrak tidak dapat diaktifkan sebelum PDF diverifikasi.
                  </p>
                </div>
                <label className="px-3 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Pilih File PDF</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    onChange={(e) =>
                      setPendingFiles((prev) => [...prev, ...Array.from(e.target.files || [])])
                    }
                    className="hidden"
                  />
                </label>
              </div>

              {pendingFiles.length > 0 && (
                <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl">
                  {pendingFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800 truncate">
                        {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1D7AFC]" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyChecked}
                  onChange={(e) => setVerifyChecked(e.target.checked)}
                />
                <span>Tandai dokumen kontrak sudah sesuai & siap diverifikasi</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={goToTimelineAfter}
                  onChange={(e) => setGoToTimelineAfter(e.target.checked)}
                />
                <span>Langsung lanjut ke pengaturan jadwal termin (100%)</span>
              </label>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-5 py-2.5 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>{workflowBusy ? 'Menyimpan Kontrak...' : 'Simpan Draft Kontrak'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Auto-Populated Project Info & Validation Panel */}
          <div className="lg:col-span-4 space-y-4">
            {selectedProject && (
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-3 text-xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-[#13233C]">Informasi Proyek Disetujui Finance</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Nomor Proyek</span>
                    <span className="font-mono font-bold text-[#1D7AFC]">{selectedProject.project_number}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Jenis Pekerjaan</span>
                    <span className="font-semibold text-slate-900">{selectedProject.work_type || 'Pembangunan'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Instansi / Klien</span>
                    <span className="font-semibold text-slate-900 text-right">{selectedProject.client_name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Lokasi</span>
                    <span className="text-slate-800 text-right">{selectedProject.location}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">PIC Proyek Teknik</span>
                    <span className="font-semibold text-slate-900">{picName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Approval Finance</span>
                    <span className="font-medium text-emerald-700">
                      {selectedWorkflow?.finance_decided_at
                        ? formatDateID(selectedWorkflow.finance_decided_at)
                        : 'Disetujui'}
                    </span>
                  </div>
                </div>

                {/* Comparison vs RAB */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nilai RAB Disetujui</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatRupiah(rabApprovedValue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nilai Kontrak Final</span>
                    <span className="font-mono font-bold text-[#1D7AFC] tabular-nums">
                      {formatRupiah(contractValue)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200">
                    <span className="font-semibold text-slate-700">Selisih vs RAB</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        rabDelta > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {rabDelta >= 0 ? `+${formatRupiah(rabDelta)}` : formatRupiah(rabDelta)} ({rabDeltaPct}%)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {unapprovedProjects.length > 0 && (
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Proyek Belum Memenuhi Syarat ({unapprovedProjects.length})</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Proyek berikut belum disetujui Finance sehingga dikunci dari pembuatan kontrak:
                </p>
                <div className="divide-y divide-slate-100">
                  {unapprovedProjects.map((p) => (
                    <div key={p.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-700">{p.project_number}</p>
                        <p className="text-[11px] text-slate-500 truncate">{p.name}</p>
                      </div>
                      <StatusLabel status={p.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-blue-950 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#1D7AFC]" />
                <span>Gerbang Aktivasi Kontrak</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                Setelah draft disimpan, atur termin hingga <strong>total 100%</strong> lalu aktifkan kontrak agar proyek dapat memasuki tahap <strong>Logistik</strong>.
              </p>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
