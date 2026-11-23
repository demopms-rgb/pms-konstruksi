import React, { useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  FileUp,
  GitBranch,
  History,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { AddendumChangeType, ContractSubmenuKey } from '../../../types/pms';
import { formatDateID, formatRupiah } from '../../../utils/format';
import { canCreateAddendum } from '../../../utils/permissions';
import { EmptyState, StatusLabel } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

interface ContractAddendumViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

const CHANGE_TYPES: AddendumChangeType[] = [
  'Perubahan Nilai Kontrak',
  'Perubahan Waktu Pelaksanaan',
  'Perubahan Ruang Lingkup Pekerjaan',
  'Perubahan Jadwal Termin',
  'Perubahan Lainnya',
];

export const ContractAddendumView: React.FC<ContractAddendumViewProps> = ({
  onNavigateSubmenu,
}) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    selectedContractId,
    setSelectedContractId,
    createContractAddendumApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { uploadFiles, getAttachmentsFor, getSignedUrl } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowAddendum = canCreateAddendum(roleCode, divCode);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const visibleContractIds = useMemo(
    () => new Set(visibleContracts.map((c) => c.id)),
    [visibleContracts]
  );

  const eligibleContracts = useMemo(
    () => visibleContracts.filter((c) => c.status !== 'Selesai' && c.status !== 'Ditutup'),
    [visibleContracts]
  );

  const visibleAddendums = useMemo(
    () => state.contractAddendums.filter((a) => visibleContractIds.has(a.contract_id)),
    [state.contractAddendums, visibleContractIds]
  );

  const chosenContractId = useMemo(() => {
    if (selectedContractId && eligibleContracts.some((c) => c.id === selectedContractId)) {
      return selectedContractId;
    }
    return eligibleContracts[0]?.id ?? '';
  }, [selectedContractId, eligibleContracts]);

  const activeContract = eligibleContracts.find((c) => c.id === chosenContractId) ?? null;

  const contractTerms = useMemo(() => {
    if (!activeContract) return [];
    return state.contractTerms
      .filter((t) => t.contract_id === activeContract.id)
      .sort((a, b) => a.execution_date.localeCompare(b.execution_date));
  }, [state.contractTerms, activeContract]);

  const [addNumber, setAddNumber] = useState('');
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));
  const [changeType, setChangeType] = useState<AddendumChangeType>('Perubahan Nilai Kontrak');
  const [valueAfter, setValueAfter] = useState<number>(0);
  const [endDateAfter, setEndDateAfter] = useState('');
  const [scopeAfter, setScopeAfter] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState(currentUser?.full_name ?? '');
  const [termAdjustments, setTermAdjustments] = useState<
    Array<{ term_id: string; term_number: string; payment_percentage: number; execution_date: string }>
  >([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    url: string;
    downloadUrl: string;
    ext: string;
  } | null>(null);

  useEffect(() => {
    if (!activeContract) return;
    setAddNumber(
      `ADD-${String(state.contractAddendums.filter((a) => a.contract_id === activeContract.id).length + 1).padStart(2, '0')}/${activeContract.contract_number}`
    );
    setValueAfter(activeContract.contract_value);
    setEndDateAfter(activeContract.end_date);
    setScopeAfter(activeContract.scope_description || activeContract.work_name);
    setTermAdjustments(
      contractTerms.map((t) => ({
        term_id: t.id,
        term_number: t.term_number,
        payment_percentage: t.payment_percentage,
        execution_date: t.execution_date,
      }))
    );
  }, [activeContract?.id, contractTerms.length, state.contractAddendums.length]);

  const adjSummary = useMemo(() => {
    const totalPct = termAdjustments.reduce((s, a) => s + Number(a.payment_percentage || 0), 0);
    let allocated = 0;
    const nominals = termAdjustments.map((a, idx) => {
      const val =
        idx === termAdjustments.length - 1
          ? Math.max(0, valueAfter - allocated)
          : Math.round((Number(a.payment_percentage || 0) / 100) * valueAfter);
      allocated += val;
      return val;
    });
    return { totalPct, nominals, is100: termAdjustments.length === 0 || Math.abs(totalPct - 100) <= 0.01 };
  }, [termAdjustments, valueAfter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContract) return;
    if (!adjSummary.is100) {
      showToast(`Total persentase termin penyesuaian wajib 100% (saat ini ${adjSummary.totalPct}%).`);
      return;
    }

    let attachmentIds: string[] = [];
    if (files.length > 0) {
      try {
        const uploaded = await uploadFiles({
          files,
          module_id: 'kontrak',
          entity_id: activeContract.id,
          entity_label: `${activeContract.contract_number} — ${addNumber}`,
          doc_category: 'Dokumen Addendum',
          description: `Dokumen Addendum ${addNumber}: ${reason}`,
          onProgress: setUploadPct,
        });
        attachmentIds = uploaded.map((u) => u.id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengunggah dokumen addendum.');
        setUploadPct(0);
        return;
      }
    }

    const res = await createContractAddendumApi(activeContract.id, {
      addendum_number: addNumber,
      addendum_date: addDate,
      change_type: changeType,
      value_after: valueAfter,
      end_date_after: endDateAfter,
      scope_after: scopeAfter,
      reason,
      approved_by_name: approvedBy || currentUser?.full_name,
      attachment_ids: attachmentIds,
      adjusted_terms: termAdjustments.map((t) => ({
        term_id: t.term_id,
        payment_percentage: t.payment_percentage,
        execution_date: t.execution_date,
      })),
    });

    setUploadPct(0);
    if (res.ok) {
      setReason('');
      setFiles([]);
    }
  };

  const openAttachmentPreview = async (id: string) => {
    const att = getAttachmentsFor('kontrak').find((a) => a.id === id);
    if (!att) {
      showToast('File addendum tidak ditemukan.');
      return;
    }
    try {
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(att.id, 'inline'),
        getSignedUrl(att.id, 'attachment'),
      ]);
      setPreviewDoc({ name: att.original_name, url, downloadUrl, ext: att.extension });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka pratinjau dokumen.');
    }
  };

  const valueDelta = activeContract ? valueAfter - activeContract.contract_value : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Addendum & Perubahan Kontrak
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pencatatan perubahan resmi nilai, waktu, ruang lingkup, atau jadwal termin dengan penyimpanan versi historis kontrak.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateSubmenu('riwayat', activeContract?.id)}
          className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
        >
          <History className="w-3.5 h-3.5" />
          <span>Lihat Riwayat Versi Kontrak</span>
        </button>
      </div>

      {allowAddendum && activeContract && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-[#13233C] inline-flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[#1D7AFC]" />
              <span>Formulir Penerbitan Addendum Kontrak</span>
            </h2>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-mono text-slate-700 font-semibold">
              Versi Saat Ini: v{activeContract.current_version ?? 1} → Baru: v
              {(activeContract.current_version ?? 1) + 1}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kontrak Terkait</label>
              <select
                value={chosenContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                {eligibleContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_number} — {c.work_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nomor Addendum <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={addNumber}
                onChange={(e) => setAddNumber(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Addendum</label>
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jenis Perubahan</label>
              <select
                value={changeType}
                onChange={(e) => setChangeType(e.target.value as AddendumChangeType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              >
                {CHANGE_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nilai Kontrak Baru (IDR)
              </label>
              <input
                type="number"
                min={1}
                value={valueAfter}
                onChange={(e) => setValueAfter(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-xl"
                required
              />
              <p className="text-[11px] mt-1 text-slate-500">
                Sebelumnya {formatRupiah(activeContract.contract_value)} ·{' '}
                <strong className={valueDelta >= 0 ? 'text-blue-700' : 'text-amber-700'}>
                  Selisih: {valueDelta >= 0 ? '+' : ''}
                  {formatRupiah(valueDelta)}
                </strong>
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Selesai Baru
              </label>
              <input
                type="date"
                value={endDateAfter}
                onChange={(e) => setEndDateAfter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                required
              />
              <p className="text-[11px] mt-1 text-slate-500">
                Sebelumnya: {formatDateID(activeContract.end_date)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ruang Lingkup Pekerjaan Baru / Tambahan
              </label>
              <textarea
                rows={2}
                value={scopeAfter}
                onChange={(e) => setScopeAfter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan & Dasar Addendum <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Penambahan pekerjaan kanopi teras dan penyesuaian durasi akibat cuaca."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                required
              />
            </div>
          </div>

          {termAdjustments.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-slate-800">
                  Penyesuaian Jadwal & Nominal Termin Otomatis
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded font-mono font-bold ${
                    adjSummary.is100
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  Total Porsi: {adjSummary.totalPct}% / 100%
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">Termin</th>
                      <th className="py-2 px-3">Tgl Baru</th>
                      <th className="py-2 px-3">% Baru</th>
                      <th className="py-2 pl-3 text-right">Nominal Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {termAdjustments.map((adj, idx) => (
                      <tr key={adj.term_id}>
                        <td className="py-2 pr-3 font-semibold text-slate-800">{adj.term_number}</td>
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={adj.execution_date}
                            onChange={(e) =>
                              setTermAdjustments((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, execution_date: e.target.value } : item
                                )
                              )
                            }
                            className="px-2 py-1 bg-white border border-slate-300 rounded-lg"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step="0.5"
                            value={adj.payment_percentage}
                            onChange={(e) =>
                              setTermAdjustments((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, payment_percentage: Number(e.target.value) }
                                    : item
                                )
                              )
                            }
                            className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono"
                          />
                        </td>
                        <td className="py-2 pl-3 text-right font-mono font-bold text-[#13233C]">
                          {formatRupiah(adjSummary.nominals[idx] ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pejabat / Penyetuju Addendum
              </label>
              <input
                type="text"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                <FileUp className="w-3.5 h-3.5 text-[#1D7AFC]" />
                <span>Unggah Dokumen Addendum (PDF / Lampiran)</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length > 0) setFiles((prev) => [...prev, ...list]);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f, idx) => (
                    <span
                      key={`${f.name}-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px]"
                    >
                      <span className="truncate max-w-[160px]">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {uploadPct > 0 && uploadPct < 100 && (
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1D7AFC]" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={workflowBusy || !adjSummary.is100}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 font-bold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{workflowBusy ? 'Menyimpan Addendum...' : 'Terbitkan Addendum Kontrak'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Addendum List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-[#13233C]">
            Daftar Addendum Kontrak Tercatat ({visibleAddendums.length})
          </h2>
        </div>

        {visibleAddendums.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Belum Ada Addendum Kontrak"
              description="Setiap addendum perubahan nilai, jadwal, atau ruang lingkup kontrak akan tercatat lengkap di sini."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleAddendums.map((add) => {
              const ctr = visibleContracts.find((c) => c.id === add.contract_id);
              const delta = add.value_after - add.value_before;
              return (
                <div key={add.id} className="p-4 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#1D7AFC]">
                        {add.addendum_number}
                      </span>
                      <StatusLabel status={add.change_type} />
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{formatDateID(add.addendum_date)}</span>
                    </div>
                    <span className="text-slate-500">
                      Disetujui oleh: <strong className="text-slate-800">{add.approved_by_name}</strong>
                    </span>
                  </div>

                  <p className="font-semibold text-slate-900">
                    {ctr?.contract_number} — {ctr?.work_name}
                  </p>
                  <p className="text-slate-600">{add.reason}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-slate-500">Perubahan Nilai</span>
                      <p className="font-mono font-semibold text-slate-900 mt-0.5">
                        {formatRupiah(add.value_before, true)} → {formatRupiah(add.value_after, true)}{' '}
                        <span className={delta >= 0 ? 'text-blue-700' : 'text-amber-700'}>
                          ({delta >= 0 ? '+' : ''}
                          {formatRupiah(delta, true)})
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Perubahan Akhir Pelaksanaan</span>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {formatDateID(add.end_date_before || '')} →{' '}
                        {formatDateID(add.end_date_after || '')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Penyesuaian Termin</span>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {add.term_adjustments?.length ?? 0} termin disesuaikan
                      </p>
                    </div>
                  </div>

                  {add.attachment_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {add.attachment_ids.map((attId) => (
                        <button
                          key={attId}
                          type="button"
                          onClick={() => openAttachmentPreview(attId)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#1D7AFC] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>Lihat Dokumen Addendum</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PdfPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name || 'Pratinjau Dokumen Addendum'}
        subtitle="Dokumen Addendum Kontrak"
        fileName={previewDoc?.name || 'dokumen.pdf'}
        fileExtension={previewDoc?.ext || 'pdf'}
        sourceUrl={previewDoc?.url ?? null}
        downloadUrl={previewDoc?.downloadUrl ?? null}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
