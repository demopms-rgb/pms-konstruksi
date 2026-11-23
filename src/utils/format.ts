export function formatRupiah(amount: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_000_000_000) {
      return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2).replace('.', ',')} M`;
    }
    if (abs >= 1_000_000) {
      return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace('.', ',')} Jt`;
    }
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}

export function formatDateID(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeID(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatMonthYearID(ym: string): string {
  if (!ym || !ym.includes('-')) return ym;
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

import type { WorkflowStage } from '../types/pms';

export function getWorkflowStageMeta(stage: WorkflowStage): {
  label: string;
  shortLabel: string;
  step: number;
  team: string;
  badgeClass: string;
} {
  switch (stage) {
    case 'DRAFT_TEKNIK':
      return {
        label: 'Draft Tim Teknik',
        shortLabel: 'Draft Teknik',
        step: 1,
        team: 'Tim Teknik',
        badgeClass: 'text-slate-700 bg-slate-100 border-slate-300',
      };
    case 'MENUNGGU_FINANCE':
      return {
        label: 'Menunggu Persetujuan Finance',
        shortLabel: 'Menunggu Finance',
        step: 2,
        team: 'Tim Finance',
        badgeClass: 'text-amber-800 bg-amber-50 border-amber-300',
      };
    case 'REVISI_TEKNIK':
      return {
        label: 'Revisi ke Tim Teknik',
        shortLabel: 'Revisi Teknik',
        step: 1,
        team: 'Tim Teknik',
        badgeClass: 'text-orange-800 bg-orange-50 border-orange-300',
      };
    case 'DITOLAK_FINANCE':
      return {
        label: 'Ditolak Finance (Kembali ke Teknik)',
        shortLabel: 'Ditolak Finance',
        step: 1,
        team: 'Tim Teknik',
        badgeClass: 'text-red-700 bg-red-50 border-red-300',
      };
    case 'MENUNGGU_KONTRAK':
      return {
        label: 'Disetujui Finance · Pembuatan Kontrak',
        shortLabel: 'Pembuatan Kontrak',
        step: 2,
        team: 'Admin / Finance',
        badgeClass: 'text-indigo-800 bg-indigo-50 border-indigo-300',
      };
    case 'MENUNGGU_LOGISTIK':
      return {
        label: 'Disetujui Finance · Siap Logistik',
        shortLabel: 'Menunggu Logistik',
        step: 3,
        team: 'Tim Logistik',
        badgeClass: 'text-blue-700 bg-blue-50 border-blue-300',
      };
    case 'PROSES_LOGISTIK':
      return {
        label: 'Proses Stok & Pengadaan Logistik',
        shortLabel: 'Proses Logistik',
        step: 3,
        team: 'Tim Logistik',
        badgeClass: 'text-indigo-700 bg-indigo-50 border-indigo-300',
      };
    case 'SIAP_LAPANGAN':
      return {
        label: 'Diteruskan ke Tim Lapangan',
        shortLabel: 'Siap Lapangan',
        step: 4,
        team: 'Tim Lapangan',
        badgeClass: 'text-cyan-800 bg-cyan-50 border-cyan-300',
      };
    case 'DALAM_PELAKSANAAN':
      return {
        label: 'Pelaksanaan Lapangan & Monitoring',
        shortLabel: 'Pelaksanaan',
        step: 4,
        team: 'Tim Lapangan',
        badgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-300',
      };
    case 'SELESAI':
      return {
        label: 'Selesai & Terdokumentasi',
        shortLabel: 'Selesai',
        step: 5,
        team: 'Monitoring',
        badgeClass: 'text-emerald-800 bg-emerald-100 border-emerald-300',
      };
  }
}

export type RealizationBadgeStatus =
  | 'Belum Dibayar'
  | 'Dibayar Sebagian'
  | 'Menunggu Verifikasi'
  | 'Lunas';

export function computeTermPaymentRealization(params: {
  approvedAmount?: number;
  term?: {
    id: string;
    term_value: number;
    paid_amount?: number;
    payment_status?: string;
  } | null;
  termPayments?: Array<{ term_id: string; paid_amount: number }>;
  claims?: Array<{ term_id: string; status: string }>;
}): {
  approvedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  statusRealization: RealizationBadgeStatus;
} {
  const approvedAmount = Math.max(
    0,
    Number(params.approvedAmount ?? params.term?.term_value ?? 0)
  );
  const termId = params.term?.id;
  const matchingPayments = termId
    ? (params.termPayments ?? []).filter((p) => p.term_id === termId)
    : [];
  const paidAmount =
    matchingPayments.length > 0
      ? matchingPayments.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0)
      : Number(params.term?.paid_amount ?? 0);
  const remainingAmount = Math.max(0, approvedAmount - paidAmount);

  const termClaims = termId
    ? (params.claims ?? []).filter((c) => c.term_id === termId)
    : [];
  const hasApprovedClaim = termClaims.some((c) => c.status === 'Disetujui');
  const hasPendingClaim = termClaims.some((c) => c.status === 'Menunggu Approval');

  let statusRealization: RealizationBadgeStatus = 'Belum Dibayar';
  if (approvedAmount > 0 && remainingAmount === 0 && paidAmount >= approvedAmount) {
    statusRealization = 'Lunas';
  } else if (paidAmount > 0 && remainingAmount > 0) {
    statusRealization = 'Dibayar Sebagian';
  } else if (
    hasPendingClaim ||
    (!hasApprovedClaim && params.term?.payment_status === 'Menunggu Verifikasi')
  ) {
    statusRealization = 'Menunggu Verifikasi';
  }

  return {
    approvedAmount,
    paidAmount,
    remainingAmount,
    statusRealization,
  };
}

export function getStatusColorClass(status: string): string {
  const s = status.toLowerCase().trim();

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
    s.includes('dibatalkan') ||
    s.includes('jatuh tempo') ||
    s === 'stok habis'
  ) {
    return 'text-red-700 bg-red-50 border-red-200';
  }

  if (
    s.includes('belum dibayar') ||
    s.includes('belum bayar') ||
    s.includes('belum ditagih') ||
    s.includes('belum dimulai') ||
    s.includes('ditutup') ||
    s === 'diarsipkan' ||
    s === 'draft'
  ) {
    return 'text-slate-700 bg-slate-100 border-slate-300';
  }

  if (
    s.includes('dibayar sebagian') ||
    s === 'sebagian' ||
    s.includes('revisi') ||
    s.includes('perbaikan data') ||
    s.includes('perlu perbaikan') ||
    s === 'kurang'
  ) {
    return 'text-orange-700 bg-orange-50 border-orange-200';
  }

  if (s.includes('menunggu verifikasi') || s.includes('menunggu approval')) {
    return 'text-yellow-800 bg-yellow-50 border-yellow-300';
  }

  if (
    s.includes('dalam pengerjaan') ||
    s.includes('dalam penanganan') ||
    s.includes('dalam pengiriman') ||
    s.includes('siap diajukan') ||
    s === 'diperiksa' ||
    s === 'diperiksa head' ||
    s === 'keluar' ||
    s === 'pemakaian'
  ) {
    return 'text-blue-700 bg-blue-50 border-blue-200';
  }

  if (
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
    s === 'baik' ||
    s === 'masuk' ||
    s === 'stok aman'
  ) {
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  }

  if (
    s.includes('menunggu') ||
    s.includes('terbuka') ||
    s.includes('lulus bersyarat') ||
    s.includes('review') ||
    s.includes('diperiksa') ||
    s.includes('diajukan') ||
    s.includes('diproses') ||
    s.includes('proses') ||
    s.includes('berjalan') ||
    s.includes('dikerjakan') ||
    s.includes('digunakan') ||
    s.includes('perawatan') ||
    s.includes('akan berakhir') ||
    s.includes('perlu perhatian') ||
    s.includes('diserahkan') ||
    s.includes('terjadwal') ||
    s.includes('dipesan') ||
    s.includes('siap lapangan') ||
    s.includes('pelaksanaan') ||
    s.includes('pembuatan kontrak') ||
    s.includes('opname') ||
    s === 'stok minimum'
  ) {
    return 'text-amber-800 bg-amber-50 border-amber-200';
  }

  return 'text-slate-700 bg-slate-100 border-slate-200';
}

export function generateSignatureHash(nik: string, docNumber: string): string {
  const raw = `${nik}:${docNumber}:2026`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `SIG-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}
