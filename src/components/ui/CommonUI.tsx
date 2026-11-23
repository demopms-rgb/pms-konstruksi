import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { getStatusColorClass } from '../../utils/format';

export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase().trim();
  let Icon = Clock;
  if (
    s.includes('ditolak') ||
    s.includes('tidak sesuai') ||
    s.includes('kendala') ||
    s.includes('tertunda') ||
    s.includes('nonaktif') ||
    s.includes('ditangguhkan') ||
    s.includes('tidak aktif') ||
    s.includes('rusak') ||
    s.includes('hilang') ||
    s.includes('perlu pengadaan') ||
    s.includes('dibatalkan')
  ) {
    Icon = XCircle;
  } else if (
    s.includes('perhatian') ||
    s.includes('akan berakhir') ||
    s.includes('perbaikan data') ||
    s.includes('perlu perbaikan') ||
    s.includes('lulus bersyarat') ||
    s.includes('jatuh tempo') ||
    s === 'kurang'
  ) {
    Icon = AlertTriangle;
  } else if (
    s.includes('belum dibayar') ||
    s.includes('belum bayar') ||
    s.includes('belum ditagih') ||
    s.includes('belum dimulai') ||
    s.includes('dibayar sebagian') ||
    s === 'sebagian' ||
    s.includes('terbuka') ||
    s.includes('menunggu') ||
    s.includes('review') ||
    s.includes('diperiksa') ||
    s.includes('diajukan') ||
    s.includes('diproses') ||
    s.includes('proses') ||
    s.includes('berjalan') ||
    s.includes('dikerjakan') ||
    s.includes('digunakan') ||
    s.includes('perawatan') ||
    s.includes('diserahkan') ||
    s.includes('terjadwal') ||
    s.includes('dipesan') ||
    s.includes('revisi') ||
    s.includes('dalam pengerjaan') ||
    s.includes('dalam penanganan') ||
    s.includes('dalam pengiriman') ||
    s.includes('siap diajukan') ||
    s.includes('siap lapangan') ||
    s.includes('pelaksanaan') ||
    s.includes('pembuatan kontrak') ||
    s.includes('ditutup') ||
    s === 'draft'
  ) {
    Icon = Clock;
  } else if (
    s === 'lunas' ||
    (s.includes('lunas') && !s.includes('belum')) ||
    s === 'dibayar' ||
    s === 'sesuai' ||
    s.includes('lulus uji') ||
    s.includes('selesai') ||
    s.includes('disetujui') ||
    s.includes('terbayar') ||
    s.includes('terverifikasi') ||
    s.includes('aktif') ||
    s.includes('tersedia') ||
    s.includes('dikonfirmasi') ||
    s.includes('siap / tersedia') ||
    s.includes('diterima di gudang') ||
    s === 'baik'
  ) {
    Icon = CheckCircle2;
  }

  const colorClasses = getStatusColorClass(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap ${colorClasses}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-2xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-0 sm:p-4 no-print">
      <div
        className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  requireNote?: boolean;
  noteLabel?: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}> = ({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  danger = false,
  requireNote = false,
  noteLabel = 'Catatan / Alasan',
  onCancel,
  onConfirm,
}) => {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setNote('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (requireNote && !note.trim()) {
      setError('Mohon isi catatan terlebih dahulu.');
      return;
    }
    onConfirm(note.trim());
  };

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            {noteLabel} {requireNote && <span className="text-red-600">*</span>}
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
            rows={3}
            placeholder={requireNote ? 'Tuliskan alasan atau catatan keputusan...' : 'Catatan tambahan (opsional)...'}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer ${
              danger ? 'bg-red-700 hover:bg-red-800' : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const SearchInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Cari data...' }) => (
  <div className="relative flex-1 min-w-0 w-full sm:min-w-[200px]">
    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
    />
  </div>
);

export const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (p: number) => void;
}> = ({ page, totalPages, totalItems, onPageChange }) => {
  if (totalItems === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
      <span className="tabular-nums">
        Menampilkan halaman <strong>{page}</strong> dari <strong>{Math.max(1, totalPages)}</strong> ·{' '}
        {totalItems} total entri
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Sebelumnya
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
        >
          Berikutnya
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
    <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3">
      <Building2 className="w-5 h-5" />
    </div>
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-xl cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const FallbackImage: React.FC<{
  src?: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-full h-44 object-cover' }) => {
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 border border-slate-200 text-slate-500 p-4 ${className}`}
      >
        <Building2 className="w-6 h-6 mb-1.5 text-slate-400" />
        <span className="text-xs text-center font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
