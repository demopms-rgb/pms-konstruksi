import React, { useMemo, useState } from 'react';
import { KeyRound, Plus, ShieldCheck } from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { AccountStatus } from '../../types/pms';
import { formatDateID, formatDateTimeID } from '../../utils/format';
import { canRegisterEmployee } from '../../utils/permissions';
import { ConfirmDialog, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';

export const KaryawanModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    registerEmployee,
    updateEmployeeStatus,
    resetEmployeePassword,
  } = usePMS();

  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('SEMUA');
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  const isSuperAdmin = currentRole?.code === 'SUPER_ADMIN';
  const isHead = currentRole?.code === 'HEAD';
  const allowRegister = currentRole ? canRegisterEmployee(currentRole.code) : false;

  const staffRole = state.roles.find((r) => r.code === 'STAFF');

  const [form, setForm] = useState({
    full_name: '',
    nik: '',
    division_id: currentUser?.division_id ?? 'div-teknik',
    role_id: staffRole?.id ?? 'role-staff',
    position: '',
    phone: '',
    email: '',
    status: 'Aktif' as AccountStatus,
  });

  const visibleEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees.filter((e) => {
      if (isHead && e.division_id !== currentDivision?.id) return false;
      if (isSuperAdmin && divisionFilter !== 'SEMUA' && e.division_id !== divisionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q)
      );
    });
  }, [state.employees, isHead, isSuperAdmin, currentDivision, divisionFilter, search]);

  const openRegister = () => {
    setFormError('');
    setForm({
      full_name: '',
      nik: '',
      division_id: isHead ? currentDivision?.id ?? 'div-teknik' : 'div-teknik',
      role_id: staffRole?.id ?? 'role-staff',
      position: '',
      phone: '',
      email: '',
      status: 'Aktif',
    });
    setModalOpen(true);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const res = registerEmployee({
      ...form,
      joined_date: new Date().toISOString().slice(0, 10),
    });
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Manajemen Karyawan & Akun Internal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isSuperAdmin
              ? 'Super Admin dapat mendaftarkan karyawan di seluruh divisi, mengatur role, status akun, dan reset kata sandi.'
              : `Head Divisi ${currentDivision?.name} dapat mendaftarkan dan memantau Staff pada divisinya sendiri.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleAttachmentToolbar
            moduleId="karyawan"
            entityId={currentUser?.id ?? 'karyawan-hr'}
            entityLabel={`Berkas Pribadi — ${currentUser?.full_name ?? 'Karyawan'}`}
            title="Berkas Pribadi & Foto Profil Saya"
            subtitle="Foto profil, KTP, CV, sertifikat keahlian, dan dokumen administrasi (Privat & Terproteksi)"
            defaultCategory="Identitas & Berkas Karyawan"
          />
          {allowRegister && (
            <button
              type="button"
              onClick={openRegister}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{isHead ? `Daftarkan Staff ${currentDivision?.name}` : 'Daftarkan Karyawan Baru'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-3.5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama karyawan, NIK, atau jabatan..."
        />
        {isSuperAdmin && (
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl"
          >
            <option value="SEMUA">Semua Divisi</option>
            {state.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Employee Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">NIK & Nama Lengkap</th>
                <th className="py-3 px-4 font-semibold">Divisi & Jabatan</th>
                <th className="py-3 px-4 font-semibold">Role Akses</th>
                <th className="py-3 px-4 font-semibold">Kontak & Login Terakhir</th>
                <th className="py-3 px-4 font-semibold">Status Akun</th>
                <th className="py-3 px-4 font-semibold text-right">Berkas HR</th>
                {isSuperAdmin && <th className="py-3 px-4 font-semibold text-right">Kontrol Akun</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEmployees.map((emp) => {
                const div = state.divisions.find((d) => d.id === emp.division_id);
                const role = state.roles.find((r) => r.id === emp.role_id);
                const acc = state.accounts.find((a) => a.employee_id === emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-blue-700">{emp.nik}</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{emp.full_name}</div>
                      <div className="text-slate-500">Bergabung: {formatDateID(emp.joined_date)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{div?.name ?? '-'}</div>
                      <div className="text-slate-500">{emp.position}</div>
                    </td>
                    <td className="py-3 px-4">
                      {isSuperAdmin && emp.id !== currentUser?.id ? (
                        <select
                          value={emp.role_id}
                          onChange={(e) =>
                            updateEmployeeStatus(emp.id, emp.status, e.target.value, emp.division_id)
                          }
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          {state.roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                          {role?.name ?? '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700">{emp.phone}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        Login: {acc?.last_login_at ? formatDateTimeID(acc.last_login_at) : 'Belum login'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={emp.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <ModuleAttachmentToolbar
                        compact
                        moduleId="karyawan"
                        entityId={emp.id}
                        entityLabel={`${emp.nik} — ${emp.full_name}`}
                        title={`Berkas Karyawan: ${emp.full_name} (${emp.nik})`}
                        subtitle="Foto profil, KTP, CV, sertifikat keahlian, dan dokumen administrasi karyawan"
                        defaultCategory="Identitas & Berkas Karyawan"
                      />
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <select
                            value={emp.status}
                            disabled={emp.id === currentUser?.id}
                            onChange={(e) =>
                              updateEmployeeStatus(emp.id, e.target.value as AccountStatus)
                            }
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white disabled:opacity-50"
                          >
                            <option value="Aktif">Aktif</option>
                            <option value="Nonaktif">Nonaktif</option>
                            <option value="Ditangguhkan">Ditangguhkan</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setConfirmResetId(emp.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Reset Sandi</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Daftarkan Karyawan */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isHead ? `Daftarkan Staff Divisi ${currentDivision?.name}` : 'Registrasi Karyawan & Akun Baru'}
        subtitle={
          isHead
            ? 'Sesuai aturan wewenang, Head hanya dapat mendaftarkan akun Staff pada divisinya sendiri.'
            : 'Kredensial awal akun akan disiapkan dan karyawan wajib mengubah kata sandi saat login pertama.'
        }
      >
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIK Karyawan</label>
              <input
                type="text"
                value={form.nik}
                onChange={(e) => setForm({ ...form, nik: e.target.value.toUpperCase() })}
                placeholder="Contoh: TEK-220"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Divisi</label>
              <select
                value={form.division_id}
                disabled={isHead}
                onChange={(e) => setForm({ ...form, division_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                {state.divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role / Kewenangan</label>
              <select
                value={form.role_id}
                disabled={isHead}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                {state.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan Operasional</label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Contoh: Pelaksana Lapangan Sipil"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Perusahaan</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nama@pmskonstruksi.id"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Akun</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AccountStatus })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
                <option value="Ditangguhkan">Ditangguhkan</option>
              </select>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Kredensial sementara untuk login perdana: <span className="font-mono font-semibold text-slate-900">pms2026</span> (status wajib ganti kata sandi akan aktif).
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

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
              Daftarkan Karyawan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmResetId)}
        title="Reset Kata Sandi Karyawan?"
        description="Kata sandi akun akan direset ke kredensial sementara dan ditandai wajib diperbarui saat login berikutnya."
        confirmLabel="Reset Sekarang"
        onCancel={() => setConfirmResetId(null)}
        onConfirm={() => {
          if (confirmResetId) resetEmployeePassword(confirmResetId);
          setConfirmResetId(null);
        }}
      />
    </div>
  );
};
