import React, { useMemo, useState } from 'react';
import {
  CloudOff,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Smartphone,
  Trash2,
  Wifi,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import { formatFileSize } from '../../services/attachmentApi';
import { formatDateTimeID } from '../../utils/format';
import { ConfirmDialog, SearchInput, StatusLabel } from '../ui/CommonUI';
import { PWAInstallButton } from '../ui/PWAInstallButton';

const SUPABASE_SCHEMA_SQL = `-- Target Database: Supabase PostgreSQL + Auth + Row Level Security (RLS)
-- Entitas Relasional Utama PMS KONSTRUKSI:
-- divisions, roles, employees, accounts, projects, contracts, contract_terms,
-- work_items, budgets, materials, material_requests, material_transactions,
-- company_assets, asset_movements, maintenance_records, financial_transactions,
-- documents, approvals, notifications, activity_logs

CREATE TABLE divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code IN ('TEKNIK', 'LOGISTIK', 'FINANCE', 'DIREKSI')),
  name text NOT NULL
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code IN ('SUPER_ADMIN', 'HEAD', 'STAFF')),
  name text NOT NULL
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id),
  nik text UNIQUE NOT NULL,
  full_name text NOT NULL,
  division_id uuid NOT NULL REFERENCES divisions(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  position text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('Aktif', 'Nonaktif', 'Ditangguhkan'))
);

-- Contoh Kebijakan Row Level Security (RLS) untuk Head mendaftarkan Staff divisinya:
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access" ON employees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees e JOIN roles r ON e.role_id = r.id
      WHERE e.auth_user_id = auth.uid() AND r.code = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "head_insert_own_division_staff" ON employees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees head JOIN roles hr ON head.role_id = hr.id
      JOIN roles sr ON sr.id = employees.role_id
      WHERE head.auth_user_id = auth.uid()
        AND hr.code = 'HEAD'
        AND head.division_id = employees.division_id
        AND sr.code = 'STAFF'
    )
  );`;

export const PengaturanModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    isOnline,
    simulateOffline,
    setSimulateOffline,
    syncOfflineDrafts,
    deleteOfflineDraft,
    resetDemoData,
  } = usePMS();

  const { uploadConfig, storageStats, auditLogs, updateUploadConfig } = useAttachments();

  const [logSearch, setLogSearch] = useState('');
  const [logProjectFilter, setLogProjectFilter] = useState('SEMUA');
  const [logUserFilter, setLogUserFilter] = useState('SEMUA');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [maxMbInput, setMaxMbInput] = useState<number>(uploadConfig.maxFileSizeMb);
  const [maxBatchInput, setMaxBatchInput] = useState<number>(uploadConfig.maxFilesPerBatch);
  const [requireDescInput, setRequireDescInput] = useState<boolean>(uploadConfig.requireDescription);
  const [allowedExtsInput, setAllowedExtsInput] = useState<string[]>(uploadConfig.allowedExtensions);
  const [savingConfig, setSavingConfig] = useState(false);

  React.useEffect(() => {
    setMaxMbInput(uploadConfig.maxFileSizeMb);
    setMaxBatchInput(uploadConfig.maxFilesPerBatch);
    setRequireDescInput(uploadConfig.requireDescription);
    setAllowedExtsInput(uploadConfig.allowedExtensions);
  }, [uploadConfig]);

  const canConfigureUpload = currentRole?.code === 'SUPER_ADMIN' || currentRole?.code === 'HEAD';

  const handleToggleExt = (ext: string) => {
    setAllowedExtsInput((prev) =>
      prev.includes(ext) ? prev.filter((item) => item !== ext) : [...prev, ext]
    );
  };

  const handleSaveUploadConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfigureUpload) return;
    setSavingConfig(true);
    try {
      await updateUploadConfig({
        maxFileSizeMb: maxMbInput,
        maxFilesPerBatch: maxBatchInput,
        requireDescription: requireDescInput,
        allowedExtensions: allowedExtsInput,
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return state.activityLogs.filter((l) => {
      if (logProjectFilter !== 'SEMUA' && l.project_id !== logProjectFilter) return false;
      if (logUserFilter !== 'SEMUA' && l.employee_id !== logUserFilter) return false;
      if (!q) return true;
      return (
        l.employee_name.toLowerCase().includes(q) ||
        l.activity_type.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
      );
    });
  }, [state.activityLogs, logSearch, logProjectFilter, logUserFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Pengaturan, Sinkronisasi Offline & Riwayat Aktivitas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Profil akun aktif, pengelolaan draft offline lapangan, log aktivitas audit, dan kesiapan skema Supabase PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setResetConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Data Awal</span>
        </button>
      </div>

      {/* Profile & Offline Sync Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
            Informasi Akun & Kewenangan Aktif
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Nama Lengkap</span>
              <span className="font-semibold text-slate-900">{currentUser?.full_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block">NIK Karyawan</span>
              <span className="font-mono font-semibold text-blue-700">{currentUser?.nik}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Divisi & Jabatan</span>
              <span className="font-semibold text-slate-900">
                {currentDivision?.name} · {currentUser?.position}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Tingkat Akses Role</span>
              <span className="font-semibold text-slate-900">{currentRole?.name}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            {currentRole?.description}
          </div>
        </div>

        {/* Offline Queue Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Draft Offline Lapangan & Sinkronisasi
              </h2>
              <p className="text-xs text-slate-500">
                Mendukung pencatatan proyek di area lapangan tanpa sinyal internet
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSimulateOffline(!simulateOffline)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Status: Online' : 'Status: Offline'}</span>
            </button>
          </div>

          {state.offlineDrafts.length === 0 ? (
            <p className="py-4 text-xs text-slate-500">
              Belum ada draft offline tersimpan. Aktifkan Mode Offline lalu input pekerjaan teknik, permintaan material, atau dokumen untuk menguji penyimpanan draft lokal.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {state.offlineDrafts.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{d.title}</div>
                    <div className="text-slate-500">
                      Modul {d.module} · {formatDateTimeID(d.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusLabel status={d.status} />
                    <button
                      type="button"
                      onClick={() => deleteOfflineDraft(d.id)}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label="Hapus draft"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={syncOfflineDrafts}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sinkronkan Semua Draft ke Sistem</span>
            </button>
          </div>
        </div>
      </div>

      {/* PWA Installability Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#13233C] text-[#FBC02D] flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">
              Instalasi Aplikasi (PWA) & Download APK Android
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              Pasang PMS KONSTRUKSI secara instan melalui Google Chrome (PWA mode standalone) atau unduh paket installer Android (.apk) resmi untuk perangkat lapangan. Aset aplikasi dicache aman dan draft lapangan tersimpan lokal saat offline.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <PWAInstallButton variant="full" />
        </div>
      </div>

      {/* Upload & File Storage Configuration Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1D7AFC] flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Konfigurasi Upload & Penyimpanan File Privat
              </h2>
              <p className="text-xs text-slate-500">
                Kelola batas ukuran file, format ekstensi yang diizinkan, serta pantau kapasitas penyimpanan backend.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
            <div>
              <span className="text-slate-500 block text-[11px]">Total File Tersimpan</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {storageStats.totalFiles} berkas ({formatFileSize(storageStats.totalBytes)})
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveUploadConfig} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Maksimal Ukuran per File (MB)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                disabled={!canConfigureUpload}
                value={maxMbInput}
                onChange={(e) => setMaxMbInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Maksimal File per Multi-Upload
              </label>
              <input
                type="number"
                min={1}
                max={20}
                disabled={!canConfigureUpload}
                value={maxBatchInput}
                onChange={(e) => setMaxBatchInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl disabled:bg-slate-100"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canConfigureUpload}
                  checked={requireDescInput}
                  onChange={(e) => setRequireDescInput(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1D7AFC]"
                />
                <span>Wajib isi keterangan saat upload</span>
              </label>
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Format Ekstensi File Diizinkan (Validasi MIME + Magic Byte Server):
            </span>
            <div className="flex flex-wrap gap-2">
              {storageStats.masterAllowedExtensions.map((ext) => {
                const active = allowedExtsInput.includes(ext);
                return (
                  <button
                    key={ext}
                    type="button"
                    disabled={!canConfigureUpload}
                    onClick={() => handleToggleExt(ext)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border cursor-pointer disabled:opacity-60 ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    .{ext.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Terakhir diperbarui oleh <strong>{uploadConfig.updatedBy || 'Sistem'}</strong>
              {uploadConfig.updatedAt ? ` (${formatDateTimeID(uploadConfig.updatedAt)})` : ''}
            </span>
            {canConfigureUpload && (
              <button
                type="submit"
                disabled={savingConfig || allowedExtsInput.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingConfig ? 'Menyimpan...' : 'Simpan Kebijakan Upload'}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Activity Log Explorer */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Riwayat Aktivitas Perusahaan (Audit Trail)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={logSearch}
              onChange={setLogSearch}
              placeholder="Cari aktivitas, jenis aksi, atau keterangan..."
            />
            <select
              value={logUserFilter}
              onChange={(e) => setLogUserFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              <option value="SEMUA">Semua Pengguna</option>
              {state.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <select
              value={logProjectFilter}
              onChange={(e) => setLogProjectFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              <option value="SEMUA">Semua Proyek</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number}
                  {p.is_deleted ? ' (Arsip)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Waktu</th>
                <th className="py-2.5 px-4 font-semibold">Pengguna & Divisi</th>
                <th className="py-2.5 px-4 font-semibold">Jenis Aktivitas</th>
                <th className="py-2.5 px-4 font-semibold">Proyek</th>
                <th className="py-2.5 px-4 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeID(log.timestamp)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-slate-900">{log.employee_name}</span> ·{' '}
                    <span className="text-slate-500">{log.division_name}</span>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-blue-700">{log.activity_type}</td>
                  <td className="py-2.5 px-4 text-slate-600">{log.project_name ?? '-'}</td>
                  <td className="py-2.5 px-4 text-slate-700">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* File Security & Audit Log Explorer */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#1D7AFC]" />
            <h2 className="text-sm font-bold text-slate-900">
              Log Audit Aktivitas Dokumen & Foto (Upload, Preview, Unduh, Hapus)
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">{auditLogs.length} catatan</span>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Waktu</th>
                <th className="py-2.5 px-4 font-semibold">Aktor</th>
                <th className="py-2.5 px-4 font-semibold">Aksi</th>
                <th className="py-2.5 px-4 font-semibold">Modul & File</th>
                <th className="py-2.5 px-4 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((al) => (
                <tr key={al.id}>
                  <td className="py-2.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeID(al.timestamp)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-slate-900">{al.actor_name}</span>{' '}
                    <span className="text-slate-500">({al.actor_role})</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px] font-bold">
                      {al.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-blue-700 uppercase">{al.module_id}</span> ·{' '}
                    <span className="text-slate-800">{al.file_name}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{al.detail}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Belum ada log aktivitas dokumen pada sesi server ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supabase PostgreSQL & RLS Architecture Reference */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Database className="w-4 h-4 text-blue-700" />
          <span>Kesiapan Skema Database Supabase PostgreSQL & Kebijakan RLS</span>
        </div>
        <p className="text-xs text-slate-600">
          Seluruh entitas aplikasi (20 tabel relasional) telah disusun dengan foreign-key konsisten dan bebas kredensial klien agar siap diterapkan ke Supabase Auth + Row Level Security (RLS).
        </p>
        <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
          {SUPABASE_SCHEMA_SQL}
        </pre>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Kembalikan Data Awal Sistem?"
        description="Data awal sistem akan dikembalikan ke kondisi standar PT. Wilwa Abiyasa Sejahtera. Seluruh proyek, transaksi, dokumen, dan upload operasional Anda tetap aman tersimpan."
        confirmLabel="Ya, Reset Data Awal"
        danger
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          resetDemoData();
          setResetConfirmOpen(false);
        }}
      />
    </div>
  );
};
