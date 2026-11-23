import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Info,
  PackageCheck,
  Share,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { formatFileSize } from '../../services/attachmentApi';
import { Modal } from './CommonUI';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full' | 'login';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isInIframe,
    swReady,
    apkInfo,
    apkLoading,
    install,
  } = usePWAInstall();

  const [modalOpen, setModalOpen] = useState(false);
  const [pwaFeedback, setPwaFeedback] = useState<string | null>(null);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [apkError, setApkError] = useState<string | null>(null);
  const [apkSuccess, setApkSuccess] = useState<string | null>(null);

  const handleInstallPWA = async () => {
    setPwaFeedback(null);
    if (isInstalled) {
      setModalOpen(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setPwaFeedback('PMS KONSTRUKSI berhasil dipasang ke perangkat Anda.');
        return;
      }
      if (outcome === 'dismissed') {
        setPwaFeedback('Dialog instalasi dibatalkan. Anda dapat memasang kapan saja dari tombol ini atau menu Chrome.');
        setModalOpen(true);
        return;
      }
    }

    setModalOpen(true);
  };

  const handleDownloadApk = async () => {
    setApkError(null);
    setApkSuccess(null);

    if (!apkInfo.available) {
      setModalOpen(true);
      setApkError('File APK belum dibuat atau belum tersedia di server.');
      return;
    }

    setDownloadingApk(true);
    setDownloadProgress(5);
    setModalOpen(true);

    try {
      const res = await fetch(apkInfo.downloadUrl, { cache: 'no-store' });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();

      if (!res.ok || contentType.includes('text/html') || contentType.includes('application/json')) {
        let msg = 'File APK belum tersedia atau gagal diunduh dari server.';
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(() => null);
          if (data?.message) msg = data.message;
        }
        throw new Error(msg);
      }

      const contentLength = Number(res.headers.get('content-length') || apkInfo.sizeBytes || 0);
      const reader = res.body?.getReader();

      let blob: Blob;
      if (reader) {
        const chunks: BlobPart[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (contentLength > 0) {
              setDownloadProgress(Math.min(99, Math.round((received / contentLength) * 100)));
            }
          }
        }
        blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      } else {
        blob = await res.blob();
      }

      // Verify APK ZIP magic header (PK\x03\x04) to ensure non-HTML valid APK binary
      const headBuf = await blob.slice(0, 4).arrayBuffer();
      const head = new Uint8Array(headBuf);
      if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
        throw new Error('Berkas yang diterima server bukan paket APK Android yang valid.');
      }

      setDownloadProgress(100);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = apkInfo.fileName || 'pms-konstruksi.apk';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

      setApkSuccess(
        `File ${apkInfo.fileName} (${formatFileSize(blob.size)}) selesai diunduh. Buka file dari notifikasi browser atau folder Unduhan untuk memasang di Android.`
      );
    } catch (err) {
      setApkError(err instanceof Error ? err.message : 'Gagal mengunduh file APK.');
    } finally {
      setDownloadingApk(false);
    }
  };

  const renderDownloadModal = () => (
    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      title="Download & Instal Aplikasi"
      subtitle="Pilih pemasangan instan via browser (PWA) atau unduh installer Android (.apk)"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs text-slate-700">
        {/* App Header Card */}
        <div className="rounded-2xl bg-[#13233C] text-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Ikon Aplikasi PMS Konstruksi"
              className="w-11 h-11 rounded-xl bg-white p-0.5 object-contain shrink-0 shadow-sm"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-white truncate">PMS KONSTRUKSI</p>
              <p className="text-[11px] text-slate-300 truncate">
                {apkInfo.packageId} · PT. Wilwa Abiyasa Sejahtera
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-white/15 text-[#FBC02D] font-mono text-[11px] font-bold">
              v{apkInfo.version}
            </span>
            {isInstalled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Aplikasi Terinstal</span>
              </span>
            )}
          </div>
        </div>

        {/* Two Distinct Download Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option A: INSTALL APP (PWA) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#13233C] text-xs">
                  <Smartphone className="w-4 h-4 text-[#1D7AFC]" />
                  <span>A. INSTALL APP (PWA)</span>
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  Instan
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Pasang langsung melalui Google Chrome / Edge tanpa mengunduh file installer. Mendukung mode layar penuh (standalone) dan cache offline.
              </p>
              <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>SW: {swReady ? 'Aktif' : 'Menunggu'}</span>
                <span>·</span>
                <span>Prompt: {isInstallable ? 'Siap' : isInstalled ? 'Terinstal' : 'Manual'}</span>
              </div>
            </div>

            {isInstalled ? (
              <div className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aplikasi Terinstal</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleInstallPWA}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#FBC02D] hover:bg-[#F59E0B] text-[#13233C] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>{isInstallable ? 'INSTALL APP SEKARANG' : 'INSTALL APP (PWA)'}</span>
              </button>
            )}
          </div>

          {/* Option B: DOWNLOAD APK ANDROID */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#13233C] text-xs">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>B. DOWNLOAD APK</span>
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  .APK
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Paket installer Android resmi ({apkInfo.fileName}) hasil build Android native (Capacitor). Cocok untuk distribusi internal HP lapangan.
              </p>
              <div className="text-[10px] font-mono text-slate-600">
                {apkLoading ? (
                  <span>Memeriksa ketersediaan APK...</span>
                ) : apkInfo.available ? (
                  <span>
                    Versi {apkInfo.version} · Ukuran: <strong>{formatFileSize(apkInfo.sizeBytes)}</strong>
                  </span>
                ) : (
                  <span className="text-amber-700 font-sans font-semibold">
                    File APK belum dibuat di server.
                  </span>
                )}
              </div>
            </div>

            {apkInfo.available ? (
              <button
                type="button"
                disabled={downloadingApk}
                onClick={handleDownloadApk}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60 transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {downloadingApk
                    ? `Mengunduh (${downloadProgress}%)`
                    : `DOWNLOAD APK (${formatFileSize(apkInfo.sizeBytes)})`}
                </span>
              </button>
            ) : (
              <div className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>APK Belum Tersedia</span>
              </div>
            )}
          </div>
        </div>

        {/* APK Download Progress */}
        {downloadingApk && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span>Mengunduh {apkInfo.fileName}...</span>
              <span className="font-mono tabular-nums">{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1D7AFC] transition-all duration-150 rounded-full"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Feedback banners */}
        {pwaFeedback && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{pwaFeedback}</span>
          </div>
        )}

        {apkSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <div className="space-y-1">
              <p className="font-semibold">{apkSuccess}</p>
              <a
                href={apkInfo.downloadUrl}
                download={apkInfo.fileName}
                className="inline-flex items-center gap-1 text-emerald-800 underline font-semibold"
              >
                <span>Klik di sini jika unduhan otomatis belum muncul</span>
              </a>
            </div>
          </div>
        )}

        {apkError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{apkError}</span>
          </div>
        )}

        {/* Iframe Notice for PWA prompt */}
        {!isInstallable && !isInstalled && isInIframe && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
            <ExternalLink className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Browser tidak memunculkan dialog otomatis PWA saat aplikasi dibuka di dalam frame pratinjau. Buka langsung URL aplikasi di tab utama Chrome Android/Desktop agar tombol{' '}
              <strong>INSTALL APP</strong> memicu dialog pemasangan otomatis.
            </span>
          </div>
        )}

        {/* Installation Instructions */}
        <div className="space-y-2.5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Petunjuk Pemasangan File APK Android:
            </p>
            <p>1. Tekan tombol <strong>DOWNLOAD APK</strong> di atas untuk mengunduh <strong>{apkInfo.fileName}</strong>.</p>
            <p>2. Buka file APK dari bilah notifikasi atau aplikasi <strong>File Manager → Unduhan</strong>.</p>
            <p>3. Jika diminta izin keamanan, aktifkan <strong>Izinkan dari sumber ini (Allow from this source)</strong> lalu ketuk <strong>Pasang (Install)</strong>.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              {isIOS ? <Share className="w-4 h-4 text-[#1D7AFC]" /> : <Smartphone className="w-4 h-4 text-[#1D7AFC]" />}
              Petunjuk Manual PWA (Chrome Android / iOS Safari):
            </p>
            {isIOS ? (
              <>
                <p>1. Ketuk ikon <strong>Bagikan (Share)</strong> pada Safari.</p>
                <p>2. Pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong> → <strong>Tambah</strong>.</p>
              </>
            ) : (
              <>
                <p>1. Di Google Chrome Android, ketuk menu titik tiga (⋮) di pojok kanan atas.</p>
                <p>2. Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke Layar Utama</strong> → <strong>Instal</strong>.</p>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#13233C] hover:bg-[#1D304D] rounded-xl cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs bg-[#FBC02D] hover:bg-[#F59E0B] text-[#13233C] font-bold rounded-xl shadow-xs inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${className}`}
          title="Install PWA atau Download APK Android PMS KONSTRUKSI"
        >
          {isInstalled ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
          ) : (
            <Download className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{isInstalled ? 'Terinstal / APK' : 'INSTALL APP'}</span>
        </button>
        {renderDownloadModal()}
      </>
    );
  }

  // Full & Login variants display both distinct action buttons directly
  return (
    <>
      <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
        {isInstalled ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Aplikasi Terinstal (PWA)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleInstallPWA}
            className="min-h-[40px] px-3.5 py-2 text-xs bg-[#FBC02D] hover:bg-[#F59E0B] text-[#13233C] font-bold rounded-xl shadow-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>INSTALL APP (PWA)</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadApk}
          disabled={downloadingApk}
          className="min-h-[40px] px-3.5 py-2 text-xs bg-[#1D7AFC] hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
        >
          <PackageCheck className="w-4 h-4 shrink-0" />
          <span>
            {downloadingApk
              ? `Unduh APK (${downloadProgress}%)`
              : apkInfo.available
              ? `DOWNLOAD APK (${formatFileSize(apkInfo.sizeBytes)})`
              : 'DOWNLOAD APK'}
          </span>
        </button>
      </div>
      {renderDownloadModal()}
    </>
  );
};
