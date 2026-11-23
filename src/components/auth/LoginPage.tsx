import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  ShieldAlert,
  User,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { BrandLogo } from '../ui/BrandLogo';
import { FallbackImage, Modal } from '../ui/CommonUI';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { PWAInstallButton } from '../ui/PWAInstallButton';

const REMEMBER_NIK_KEY = 'pms_remembered_nik_v1';

export const LoginPage: React.FC = () => {
  const { state, loginWithNik, quickLoginByNik, requestPasswordReset } = usePMS();
  const { apkInfo } = usePWAInstall();

  const [nik, setNik] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_NIK_KEY) || 'TEK-101';
    } catch {
      return 'TEK-101';
    }
  });
  const [password, setPassword] = useState('pms2026');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetNik, setResetNik] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const matchedEmployee = state.employees.find(
    (e) => e.nik.toLowerCase() === nik.trim().toLowerCase()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusNotice(null);
    try {
      if (rememberMe && nik.trim()) {
        localStorage.setItem(REMEMBER_NIK_KEY, nik.trim().toUpperCase());
      } else {
        localStorage.removeItem(REMEMBER_NIK_KEY);
      }
    } catch {
      // ignore
    }

    const res = loginWithNik(nik, password);
    if (!res.ok) {
      setErrorMsg(res.message);
      if (res.accountStatus) {
        setStatusNotice(res.accountStatus);
      }
    }
  };

  const handleQuickDemo = (demoNik: string) => {
    setErrorMsg('');
    setStatusNotice(null);
    setNik(demoNik);
    const res = quickLoginByNik(demoNik);
    if (!res.ok) {
      setErrorMsg(res.message);
      if (res.accountStatus) setStatusNotice(res.accountStatus);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = requestPasswordReset(resetNik, resetNote);
    setResetFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setResetNik('');
      setResetNote('');
    }
  };

  const demoAccounts = [
    { nik: 'PMS-001', label: 'Super Admin' },
    { nik: 'TEK-101', label: 'Head Teknik' },
    { nik: 'LOG-102', label: 'Head Logistik' },
    { nik: 'FIN-103', label: 'Head Finance' },
    { nik: 'TEK-204', label: 'Staff Teknik' },
    { nik: 'LOG-205', label: 'Staff Logistik' },
    { nik: 'FIN-207', label: 'Staff Finance' },
    { nik: 'TEK-212', label: 'Akun Ditangguhkan' },
  ];

  const resolvedStatus = statusNotice ?? matchedEmployee?.status ?? null;
  const isAccountActive = !resolvedStatus || resolvedStatus === 'Aktif';

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4 py-8 sm:px-6 overflow-x-hidden bg-[#0B1E3B]">
      {/* General Construction Site Background */}
      <FallbackImage
        src="/src/assets/images/login_hero_site_1794954802135.jpg"
        alt="Latar Proyek Konstruksi Modern"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Navy Blue Transparent Overlay for Crisp Form Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A1D3B]/80 via-[#0E2549]/75 to-[#08162D]/88" />

      {/* Centered Login Container */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center space-y-5">
        {/* Brand Logo (consistent with Dashboard) */}
        <div className="flex justify-center">
          <BrandLogo size="lg" subtitle="PT. Wilwa Abiyasa Sejahtera" />
        </div>

        {/* Clean Single White Login Card */}
        <div className="w-full bg-white rounded-2xl shadow-[0_14px_38px_-10px_rgba(8,22,45,0.40)] border border-slate-200/80 overflow-hidden">
          {/* Subtle Navy & Orange Identity Accent Line */}
          <div className="h-1 w-full flex">
            <div className="w-3/4 bg-[#0B2C5F]" />
            <div className="w-1/4 bg-[#F97316]" />
          </div>

          <div className="p-6 sm:p-7 space-y-5">
            {/* Simple Focused Header */}
            <div className="text-center space-y-1">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Selamat Datang
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Silakan login untuk melanjutkan ke sistem
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="nik-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Username / ID Karyawan
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="nik-input"
                    type="text"
                    value={nik}
                    onChange={(e) => {
                      setNik(e.target.value);
                      setErrorMsg('');
                      setStatusNotice(null);
                    }}
                    placeholder="Masukkan ID Karyawan (contoh: TEK-101)"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2C5F]/25 focus:border-[#0B2C5F] focus:bg-white transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Masukkan password"
                    className="w-full pl-10 pr-11 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2C5F]/25 focus:border-[#0B2C5F] focus:bg-white transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-[#0B2C5F] focus:ring-[#0B2C5F]"
                  />
                  <span>Ingat Saya</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetNik(nik);
                    setResetFeedback(null);
                    setForgotOpen(true);
                  }}
                  className="font-semibold text-[#0B2C5F] hover:text-[#F97316] transition-colors cursor-pointer"
                >
                  Lupa Password?
                </button>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-[#0B2C5F] hover:bg-[#133A78] active:bg-[#082047] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk</span>
              </button>
            </form>

            {/* Clean Understated User Account Status Box */}
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-center transition-colors ${
                isAccountActive
                  ? 'bg-slate-50/80 border-slate-200/90'
                  : 'bg-red-50/80 border-red-200'
              }`}
            >
              <div className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold">
                {isAccountActive ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-slate-700">
                      {matchedEmployee
                        ? `Akun Aktif · ${matchedEmployee.full_name}`
                        : 'Akun Aktif'}
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span className="text-red-700">Status Akun: {resolvedStatus}</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {isAccountActive
                  ? 'Akun didaftarkan oleh Super Admin atau Head Divisi.'
                  : 'Akses ditolak sementara. Hubungi Super Admin untuk aktivasi akun.'}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbox Akun Per Divisi */}
        <section
          aria-label="Toolbox Akun Per Divisi"
          className="w-full bg-slate-950/65 backdrop-blur-md border border-white/15 rounded-xl p-3.5 text-white space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-300">
            <span className="font-medium text-slate-200">
              Uji Cepat Role & Divisi (Sandi: pms2026)
            </span>
            <span className="text-slate-300/90">Tanpa registrasi umum</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {demoAccounts.map((acc) => (
              <button
                key={acc.nik}
                type="button"
                onClick={() => handleQuickDemo(acc.nik)}
                className="px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-left transition-colors cursor-pointer"
              >
                <div className="text-[11px] font-semibold text-white truncate">
                  {acc.label}
                </div>
                <div className="text-[10px] font-mono text-slate-300 tabular-nums">
                  {acc.nik}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Minimal Footer (Original Unboxed Style) */}
        <footer className="w-full flex flex-col items-center gap-2 pt-0.5 text-center text-[11px] text-slate-300/90">
          <PWAInstallButton variant="compact" />
          <div className="space-y-0.5 leading-relaxed">
            <p className="text-slate-200">
              <span className="font-semibold">PMS KONSTRUKSI</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-400">·</span>
              <span className="text-slate-300">Project Management System</span>
            </p>
            <p className="text-slate-300/80">
              <span className="font-mono tabular-nums">Versi {apkInfo.version}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-400">·</span>
              <span className="tabular-nums">© 2026</span>
            </p>
          </div>
        </footer>
      </div>

      {/* Modal Lupa Password */}
      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Permintaan Reset Kata Sandi"
        subtitle="Pengajuan akan diteruskan ke Super Admin untuk pembuatan kredensial baru"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleForgotSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              NIK Karyawan <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={resetNik}
                onChange={(e) => setResetNik(e.target.value)}
                placeholder="Masukkan NIK Anda (contoh: TEK-204)"
                className="w-full pl-9 pr-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Keterangan Tambahan
            </label>
            <textarea
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value)}
              rows={3}
              placeholder="Contoh: Lupa password setelah ganti perangkat HP lapangan..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {resetFeedback && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                resetFeedback.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {resetFeedback.text}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Kirim Permintaan Reset
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
