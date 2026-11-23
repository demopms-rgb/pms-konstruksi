import React, { useMemo, useState } from 'react';
import { Archive, Clock, GitCommit, History, Layers } from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { formatDateID, formatDateTimeID, formatRupiah } from '../../../utils/format';
import { EmptyState, StatusLabel } from '../../ui/CommonUI';

export const ContractHistoryView: React.FC = () => {
  const { state, selectedContractId, setSelectedContractId } = usePMS();
  const [filterContractId, setFilterContractId] = useState<string>(selectedContractId || 'SEMUA');

  const focusedContract =
    filterContractId !== 'SEMUA'
      ? state.contracts.find((c) => c.id === filterContractId) ?? null
      : null;

  const deletedContracts = useMemo(() => {
    const list = state.contracts.filter((c) => c.is_deleted);
    return focusedContract ? list.filter((c) => c.id === focusedContract.id) : list;
  }, [state.contracts, focusedContract]);

  const contractLogs = useMemo(() => {
    return state.activityLogs.filter((log) => {
      const t = log.activity_type.toLowerCase();
      const d = log.description.toLowerCase();
      const isContractEvent =
        t.includes('kontrak') ||
        t.includes('termin') ||
        t.includes('addendum') ||
        d.includes('kontrak') ||
        d.includes('termin') ||
        d.includes('spk');
      if (!isContractEvent) return false;
      if (focusedContract && log.project_id !== focusedContract.project_id) return false;
      return true;
    });
  }, [state.activityLogs, focusedContract]);

  const versionsList = useMemo(() => {
    const contracts = focusedContract ? [focusedContract] : state.contracts;
    return contracts.flatMap((c) =>
      (c.versions ?? []).map((v) => ({ contract: c, snapshot: v }))
    );
  }, [focusedContract, state.contracts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Riwayat & Jejak Audit Kontrak
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rekam jejak versi kontrak (sebelum/sesudah addendum), riwayat kontrak dihapus (soft delete), perubahan termin, keputusan Finance, dan log aktivitas.
          </p>
        </div>

        <select
          value={filterContractId}
          onChange={(e) => {
            setFilterContractId(e.target.value);
            if (e.target.value !== 'SEMUA') setSelectedContractId(e.target.value);
          }}
          className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl max-w-xs"
        >
          <option value="SEMUA">Semua Kontrak (Termasuk Terhapus)</option>
          {state.contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.contract_number} — {c.work_name}
              {c.is_deleted ? ' [Dihapus]' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Soft-Deleted Contracts Audit Section */}
      {deletedContracts.length > 0 && (
        <div className="bg-white border border-red-200 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-red-100 bg-red-50/50 flex items-center gap-2">
            <Archive className="w-4 h-4 text-red-700" />
            <h2 className="text-sm font-bold text-red-900">
              Riwayat Kontrak Dihapus / Soft Delete ({deletedContracts.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {deletedContracts.map((ctr) => {
              const prj = state.projects.find((p) => p.id === ctr.project_id);
              return (
                <div key={ctr.id} className="p-4 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-800">
                        {ctr.contract_number}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[11px]">
                        Dihapus (Soft Delete)
                      </span>
                      <span className="font-semibold text-slate-900">{ctr.work_name}</span>
                    </div>
                    <span className="font-mono font-semibold text-slate-700">
                      {formatRupiah(ctr.contract_value)}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Proyek: <strong>{prj?.project_number ?? '-'} — {prj?.name ?? '-'}</strong> · Dihapus oleh{' '}
                    <strong>{ctr.deleted_by_name || '-'}</strong> pada{' '}
                    <strong>{ctr.deleted_at ? formatDateTimeID(ctr.deleted_at) : '-'}</strong>
                  </p>
                  <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    Alasan penghapusan: <span className="font-medium">{ctr.delete_reason || '-'}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contract Version Snapshots */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#1D7AFC]" />
          <h2 className="text-sm font-bold text-[#13233C]">
            Riwayat Versi Kontrak ({versionsList.length} Snapshot)
          </h2>
        </div>

        {versionsList.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Belum Ada Snapshot Versi"
              description="Setiap pembuatan kontrak dan penerbitan addendum otomatis menyimpan snapshot versi historis yang tidak berubah."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {versionsList.map(({ contract, snapshot }, idx) => (
              <div key={`${contract.id}-v${snapshot.version}-${idx}`} className="p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#13233C] text-white font-mono font-bold">
                      v{snapshot.version}
                    </span>
                    <span className="font-mono font-bold text-[#1D7AFC]">
                      {snapshot.contract_number}
                    </span>
                    {contract.is_deleted ? (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[11px]">
                        Dihapus
                      </span>
                    ) : (
                      <StatusLabel status={contract.status} />
                    )}
                  </div>
                  <span className="text-slate-500">
                    {formatDateTimeID(snapshot.timestamp)} · oleh{' '}
                    <strong className="text-slate-800">{snapshot.changed_by_name}</strong>
                  </span>
                </div>
                <p className="text-slate-700 font-medium">{snapshot.reason}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-slate-500">Nilai Pada Versi Ini</span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">
                      {formatRupiah(snapshot.contract_value)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Periode Pelaksanaan</span>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {formatDateID(snapshot.start_date)} s/d {formatDateID(snapshot.end_date)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Komposisi Termin Snapshot</span>
                    <p className="text-slate-800 mt-0.5">
                      {snapshot.term_snapshot.length > 0
                        ? snapshot.term_snapshot
                            .map((t) => `${t.term_number} (${t.payment_percentage}%)`)
                            .join(', ')
                        : 'Belum ada termin pada versi awal'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Activity Timeline */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-[#1D7AFC]" />
          <h2 className="text-sm font-bold text-[#13233C]">
            Log Aktivitas Kontrak, Termin & Pembayaran ({contractLogs.length})
          </h2>
        </div>

        {contractLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada catatan aktivitas untuk filter kontrak ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {contractLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-start gap-3 text-xs">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1D7AFC] flex items-center justify-center shrink-0 mt-0.5">
                  <GitCommit className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{log.activity_type}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">
                        {log.employee_name} ({log.division_name})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTimeID(log.timestamp)}
                    </span>
                  </div>
                  <p className="text-slate-700 mt-1 leading-relaxed">{log.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
