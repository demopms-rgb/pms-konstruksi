import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { formatDateID, formatNumber, formatRupiah } from '../../utils/format';
import { StatusLabel } from '../ui/CommonUI';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';

type ReportTab = 'proyek' | 'keuangan' | 'material' | 'aset';

export const LaporanModule: React.FC = () => {
  const { state, currentDivision, showToast } = usePMS();
  const [tab, setTab] = useState<ReportTab>('proyek');
  const [projectFilter, setProjectFilter] = useState('SEMUA');

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const filteredProjects = useMemo(
    () =>
      activeProjects.filter((p) => projectFilter === 'SEMUA' || p.id === projectFilter),
    [activeProjects, projectFilter]
  );

  const exportCsv = () => {
    let csv = '';
    if (tab === 'proyek') {
      csv = 'Nomor Proyek,Nama Proyek,Klien,Nilai Kontrak,Progres (%),Status\n';
      filteredProjects.forEach((p) => {
        csv += `"${p.project_number}","${p.name}","${p.client_name}",${p.contract_value},${p.progress_percent},"${p.status}"\n`;
      });
    } else if (tab === 'keuangan') {
      csv = 'No Transaksi,Tanggal,Kategori,Jenis,Nominal,Status,Keterangan\n';
      state.financialTransactions
        .filter((f) => projectFilter === 'SEMUA' || f.project_id === projectFilter)
        .forEach((f) => {
          csv += `"${f.transaction_no}","${f.date}","${f.category}","${f.type}",${f.amount},"${f.status}","${f.description}"\n`;
        });
    } else if (tab === 'material') {
      csv = 'Kode,Nama Material,Kategori,Stok,Stok Minimum,Satuan,Lokasi\n';
      state.materials.forEach((m) => {
        csv += `"${m.code}","${m.name}","${m.category}",${m.stock},${m.min_stock},"${m.unit}","${m.warehouse_location}"\n`;
      });
    } else {
      csv = 'Kode Aset,Nomor Proyek,Nama Proyek,Nama Aset,Kategori,Total,Tersedia,Rusak,Hilang,Satuan,Kondisi\n';
      (state.projectAssets || [])
        .filter((a) => projectFilter === 'SEMUA' || a.project_id === projectFilter)
        .forEach((a) => {
          csv += `"${a.asset_code}","${a.project_number}","${a.project_name}","${a.name}","${a.category}",${a.qty_total},${a.qty_available},${a.qty_damaged},${a.qty_lost},"${a.unit}","${a.condition}"\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-${tab}-pms-konstruksi.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Laporan ${tab} berhasil diunduh dalam format CSV.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Laporan Terpadu · {currentDivision?.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rekapitulasi laporan proyek, progres pekerjaan, arus kas keuangan, stok material, dan inventaris aset perusahaan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleAttachmentToolbar
            moduleId="laporan"
            entityId={`laporan-${tab}`}
            entityLabel={`Laporan ${tab.toUpperCase()}`}
            title={`Dokumen & Foto Laporan (${tab.toUpperCase()})`}
            subtitle="Foto dokumentasi lapangan, PDF, Excel, dan dokumen laporan perusahaan"
            defaultCategory="Laporan & Dokumentasi"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Report Selector */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setTab('proyek')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              tab === 'proyek' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600'
            }`}
          >
            Laporan Proyek & Progres
          </button>
          <button
            type="button"
            onClick={() => setTab('keuangan')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              tab === 'keuangan' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600'
            }`}
          >
            Laporan Keuangan
          </button>
          <button
            type="button"
            onClick={() => setTab('material')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              tab === 'material' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600'
            }`}
          >
            Laporan Material
          </button>
          <button
            type="button"
            onClick={() => setTab('aset')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
              tab === 'aset' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600'
            }`}
          >
            Laporan Aset Proyek
          </button>
        </div>

        {(tab === 'proyek' || tab === 'keuangan' || tab === 'aset') && (
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
        )}
      </div>

      {/* Report Content Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              PT. WILWA ABIYASA SEJAHTERA — Rekapitulasi {tab.toUpperCase()}
            </h2>
            <p className="text-xs text-slate-500">
              Dicetak per tanggal {formatDateID(new Date().toISOString())}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === 'proyek' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nomor</th>
                  <th className="py-3 px-4 font-semibold">Nama Proyek & Klien</th>
                  <th className="py-3 px-4 font-semibold">Periode</th>
                  <th className="py-3 px-4 font-semibold text-right">Nilai Kontrak</th>
                  <th className="py-3 px-4 font-semibold text-right">Progres</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700">{p.project_number}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-slate-500">{p.client_name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {formatDateID(p.start_date)} – {formatDateID(p.target_end_date)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatRupiah(p.contract_value)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {p.progress_percent}%
                    </td>
                    <td className="py-3 px-4 font-medium">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'keuangan' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nomor Transaksi</th>
                  <th className="py-3 px-4 font-semibold">Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold">Uraian</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.financialTransactions
                  .filter((f) => projectFilter === 'SEMUA' || f.project_id === projectFilter)
                  .map((f) => (
                    <tr key={f.id}>
                      <td className="py-3 px-4 font-mono font-semibold">{f.transaction_no}</td>
                      <td className="py-3 px-4">{formatDateID(f.date)}</td>
                      <td className="py-3 px-4">{f.category}</td>
                      <td className="py-3 px-4">{f.description}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                          f.type === 'Pemasukan' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {f.type === 'Pemasukan' ? '+' : '-'} {formatRupiah(f.amount)}
                      </td>
                      <td className="py-3 px-4">{f.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {tab === 'material' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode</th>
                  <th className="py-3 px-4 font-semibold">Nama Material</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold text-right">Stok</th>
                  <th className="py-3 px-4 font-semibold text-right">Minimum</th>
                  <th className="py-3 px-4 font-semibold">Lokasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.materials.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4 font-mono font-semibold">{m.code}</td>
                    <td className="py-3 px-4 font-semibold">{m.name}</td>
                    <td className="py-3 px-4">{m.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatNumber(m.stock)} {m.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatNumber(m.min_stock)} {m.unit}
                    </td>
                    <td className="py-3 px-4">{m.warehouse_location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'aset' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode Aset</th>
                  <th className="py-3 px-4 font-semibold">Proyek</th>
                  <th className="py-3 px-4 font-semibold">Nama Aset & Kategori</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Tersedia</th>
                  <th className="py-3 px-4 font-semibold text-right">Rusak</th>
                  <th className="py-3 px-4 font-semibold text-right">Hilang</th>
                  <th className="py-3 px-4 font-semibold">Kondisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(state.projectAssets || [])
                  .filter((a) => projectFilter === 'SEMUA' || a.project_id === projectFilter)
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="py-3 px-4 font-mono font-semibold text-blue-700">{a.asset_code}</td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-800">{a.project_number}</div>
                        <div className="text-slate-500">{a.project_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{a.name}</div>
                        <div className="text-slate-500">{a.category}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                        {formatNumber(a.qty_total)} {a.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatNumber(a.qty_available)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {formatNumber(a.qty_damaged)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-rose-700 tabular-nums">
                        {formatNumber(a.qty_lost)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={a.condition} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Report Supporting Documents & Field Documentation Photos */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 no-print">
        <AttachmentPanel
          moduleId="laporan"
          entityId={`laporan-${tab}`}
          entityLabel={`Laporan ${tab.toUpperCase()}`}
          defaultCategory="Laporan & Dokumentasi"
          heading={`Arsip Lampiran & Dokumentasi Laporan (${tab.toUpperCase()})`}
          subtitle="Unggah foto dokumentasi lapangan, laporan PDF, file Excel, dan berita acara rekapitulasi"
        />
      </div>
    </div>
  );
};
