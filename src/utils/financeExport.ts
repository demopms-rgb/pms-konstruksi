import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FinancialCategory, FinancialTransaction, Project } from '../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from './format';
import { downloadPdfBytes, validatePdfBytes } from './pdfUtils';
import { ImportFinanceTransactionRowPayload } from '../services/financeApi';

export interface ProjectFinanceRecapRow {
  project_id: string;
  project_number: string;
  project_name: string;
  budget_total: number;
  income_total: number;
  expense_total: number;
  balance: number;
  unpaid_bills: number;
  tx_count: number;
}

export interface FinanceRecapExportOptions {
  periodLabel: string;
  projectLabel: string;
  preparedBy: string;
  summary: {
    totalBudget: number;
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
    unpaidBills: number;
  };
  projectRows: ProjectFinanceRecapRow[];
  transactions: FinancialTransaction[];
  projects: Project[];
}

function resolveProjectLabel(projects: Project[], projectId: string): string {
  const p = projects.find((item) => item.id === projectId);
  return p ? `${p.project_number} - ${p.name}` : projectId;
}

export function exportFinancePdf(opts: FinanceRecapExportOptions): Uint8Array {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(19, 35, 60);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(251, 192, 45);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PT. WILWA ABIYASA SEJAHTERA — DIVISI FINANCE', 14, 9);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('REKAP KEUANGAN & LAPORAN ARUS KAS PROYEK', 14, 17);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Proyek: ${opts.projectLabel}  |  Periode: ${opts.periodLabel}  |  Petugas: ${opts.preparedBy}  |  Dicetak: ${formatDateTimeID(new Date().toISOString())}`,
    14,
    31
  );

  // KPI strip
  autoTable(doc, {
    startY: 35,
    head: [['Total Anggaran (RAB/Kontrak)', 'Pemasukan Terverifikasi', 'Pengeluaran Terverifikasi', 'Saldo Kas Bersih', 'Sisa Tagihan Belum Lunas']],
    body: [[
      formatRupiah(opts.summary.totalBudget),
      formatRupiah(opts.summary.totalIncome),
      formatRupiah(opts.summary.totalExpense),
      formatRupiah(opts.summary.netBalance),
      formatRupiah(opts.summary.unpaidBills),
    ]],
    styles: { fontSize: 8.5, cellPadding: 3, fontStyle: 'bold', halign: 'right' },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], halign: 'left' },
    margin: { left: 14, right: 14 },
  });

  const afterKpiY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 55;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. Rekapitulasi Keuangan Per Proyek', 14, afterKpiY + 8);

  autoTable(doc, {
    startY: afterKpiY + 11,
    head: [['No. Proyek', 'Nama Proyek', 'Anggaran RAB', 'Pemasukan', 'Pengeluaran', 'Saldo Bersih', 'Sisa Tagihan', 'Transaksi']],
    body: opts.projectRows.map((r) => [
      r.project_number,
      r.project_name,
      formatRupiah(r.budget_total),
      formatRupiah(r.income_total),
      formatRupiah(r.expense_total),
      formatRupiah(r.balance),
      formatRupiah(r.unpaid_bills),
      String(r.tx_count),
    ]),
    styles: { fontSize: 8, cellPadding: 2.3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  const afterRecapY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 110;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. Rincian Transaksi Keuangan', 14, afterRecapY + 9);

  autoTable(doc, {
    startY: afterRecapY + 12,
    head: [['No. Transaksi', 'Tanggal', 'Proyek', 'Kategori', 'Jenis', 'Nominal', 'Status', 'Keterangan']],
    body: opts.transactions.map((t) => [
      t.transaction_no,
      formatDateID(t.date),
      resolveProjectLabel(opts.projects, t.project_id),
      t.category,
      t.type,
      formatRupiah(t.amount),
      t.status,
      t.description,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PMS Konstruksi PT. Wilwa Abiyasa Sejahtera — Rekap Keuangan | Halaman ${i} dari ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  validatePdfBytes(bytes);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdfBytes(bytes, `Rekap-Keuangan-PMS-${stamp}`);
  return bytes;
}

export function exportFinanceExcel(opts: FinanceRecapExportOptions): void {
  const wb = XLSX.utils.book_new();

  const recapSheetRows: (string | number)[][] = [
    ['PT. WILWA ABIYASA SEJAHTERA — REKAP KEUANGAN PROYEK'],
    [`Proyek: ${opts.projectLabel} | Periode: ${opts.periodLabel} | Dicetak: ${formatDateTimeID(new Date().toISOString())}`],
    [],
    ['No. Proyek', 'Nama Proyek', 'Anggaran RAB (Rp)', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Saldo Bersih (Rp)', 'Sisa Tagihan (Rp)', 'Jumlah Transaksi'],
    ...opts.projectRows.map((r) => [
      r.project_number,
      r.project_name,
      r.budget_total,
      r.income_total,
      r.expense_total,
      r.balance,
      r.unpaid_bills,
      r.tx_count,
    ]),
    [
      'TOTAL',
      'Semua Proyek Terfilter',
      opts.summary.totalBudget,
      opts.summary.totalIncome,
      opts.summary.totalExpense,
      opts.summary.netBalance,
      opts.summary.unpaidBills,
      opts.transactions.length,
    ],
  ];
  const wsRecap = XLSX.utils.aoa_to_sheet(recapSheetRows);
  wsRecap['!cols'] = [
    { wch: 16 },
    { wch: 36 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRecap, 'Rekap Proyek');

  const txSheetRows: (string | number)[][] = [
    ['No. Transaksi', 'Tanggal', 'Proyek', 'Kategori', 'Jenis', 'Nominal (Rp)', 'Status', 'Sumber', 'Referensi Bukti', 'Keterangan'],
    ...opts.transactions.map((t) => [
      t.transaction_no,
      t.date,
      resolveProjectLabel(opts.projects, t.project_id),
      t.category,
      t.type,
      t.amount,
      t.status,
      t.source_module || 'Manual',
      t.proof_ref,
      t.description,
    ]),
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txSheetRows);
  wsTx['!cols'] = [
    { wch: 20 },
    { wch: 13 },
    { wch: 34 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 24 },
    { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transaksi Keuangan');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Rekap-Keuangan-PMS-${stamp}.xlsx`);
}

export function downloadFinanceImportTemplateExcel(projects: Project[]): void {
  const sampleProjNo = projects.find((p) => !p.is_deleted)?.project_number || 'PRJ-2026-001';
  const rows = [
    ['Tanggal', 'Nomor Proyek', 'Jenis', 'Kategori', 'Nominal', 'Referensi Bukti', 'Keterangan', 'Status'],
    [new Date().toISOString().slice(0, 10), sampleProjNo, 'Pengeluaran', 'Biaya Operasional', 4500000, 'KW-OPS-101.pdf', 'Biaya sewa genset & operasional lapangan', 'Terverifikasi'],
    [new Date().toISOString().slice(0, 10), sampleProjNo, 'Pemasukan', 'Pembayaran Termin', 75000000, 'BKM-TRM-101.pdf', 'Penerimaan pembayaran termin proyek', 'Terverifikasi'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 16 },
    { wch: 20 },
    { wch: 42 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Impor Finance');
  XLSX.writeFile(wb, 'Template-Impor-Transaksi-Finance.xlsx');
}

export function downloadFinanceImportTemplateCsv(projects: Project[]): void {
  const sampleProjNo = projects.find((p) => !p.is_deleted)?.project_number || 'PRJ-2026-001';
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    'Tanggal,Nomor Proyek,Jenis,Kategori,Nominal,Referensi Bukti,Keterangan,Status',
    `${today},${sampleProjNo},Pengeluaran,Biaya Operasional,4500000,KW-OPS-101.pdf,"Biaya sewa genset & operasional lapangan",Terverifikasi`,
    `${today},${sampleProjNo},Pemasukan,Pembayaran Termin,75000000,BKM-TRM-101.pdf,"Penerimaan pembayaran termin proyek",Terverifikasi`,
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Template-Impor-Transaksi-Finance.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const VALID_CATEGORIES = new Set<FinancialCategory>([
  'Pembayaran Termin',
  'Pemasukan Proyek',
  'Pengeluaran Proyek',
  'Tagihan Vendor',
  'Biaya Operasional',
  'Pengadaan Material',
]);

function isValidIsoCalendarDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function normalizeExcelDate(val: unknown): string {
  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 90000) {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      return isValidIsoCalendarDate(iso) ? iso : '';
    }
  }
  const s = String(val ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isValidIsoCalendarDate(s) ? s : '';
  }
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    return isValidIsoCalendarDate(iso) ? iso : '';
  }
  return '';
}

function normalizeSignatureText(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isMeaningfulProofRef(val: string): boolean {
  const norm = normalizeSignatureText(val);
  if (!norm || norm === '-' || norm.startsWith('impor-')) return false;
  return true;
}

export async function parseFinanceImportFile(
  file: File,
  projects: Project[],
  existingTransactions: FinancialTransaction[] = []
): Promise<{
  validRows: ImportFinanceTransactionRowPayload[];
  errors: string[];
  duplicates: string[];
}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    return {
      validRows: [],
      errors: ['Format file tidak didukung. Gunakan file .csv, .xlsx, atau .xls.'],
      duplicates: [],
    };
  }

  let wb: XLSX.WorkBook;
  if (ext === 'csv') {
    const rawText = (await file.text()).replace(/^\uFEFF/, '');
    if (!rawText.trim()) {
      return {
        validRows: [],
        errors: ['File CSV kosong atau tidak memiliki data.'],
        duplicates: [],
      };
    }
    const firstLine = rawText.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    // Support semicolon-delimited CSV exports (common in Indonesian Excel)
    const normalizedCsv =
      firstLine.includes(';') && !firstLine.includes(',')
        ? rawText
            .split(/\r?\n/)
            .map((line) => line.replace(/;/g, ','))
            .join('\n')
        : rawText;
    wb = XLSX.read(normalizedCsv, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  }

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return {
      validRows: [],
      errors: ['File tidak memiliki sheet data yang dapat dibaca.'],
      duplicates: [],
    };
  }
  const sheet = wb.Sheets[firstSheetName];
  const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawObjects.length === 0) {
    return {
      validRows: [],
      errors: ['File Excel/CSV kosong atau tidak memiliki baris transaksi.'],
      duplicates: [],
    };
  }

  // Validate required header columns on the parsed sheet
  const firstHeaders = Object.keys(rawObjects[0]).map((h) => h.trim().toLowerCase());
  const hasDateHeader = firstHeaders.some((h) => ['tanggal', 'date', 'tgl'].includes(h));
  const hasProjectHeader = firstHeaders.some((h) =>
    ['nomor proyek', 'proyek', 'project_number', 'project_id'].includes(h)
  );
  const hasTypeHeader = firstHeaders.some((h) => ['jenis', 'type'].includes(h));
  const hasAmountHeader = firstHeaders.some((h) => ['nominal', 'amount', 'jumlah'].includes(h));
  const hasDescHeader = firstHeaders.some((h) =>
    ['keterangan', 'description', 'uraian'].includes(h)
  );
  if (!hasDateHeader || !hasProjectHeader || !hasTypeHeader || !hasAmountHeader || !hasDescHeader) {
    return {
      validRows: [],
      errors: [
        'Format header kolom tidak sesuai standar. Wajib memiliki kolom: Tanggal, Nomor Proyek, Jenis, Nominal, dan Keterangan.',
      ],
      duplicates: [],
    };
  }

  // Build existing transaction lookup indices across ALL integrated modules
  const existingByTxNo = new Map<string, FinancialTransaction>();
  const existingByDescSig = new Map<string, FinancialTransaction>();
  const existingByProofSig = new Map<string, FinancialTransaction>();

  for (const tx of existingTransactions) {
    const txNoKey = normalizeSignatureText(tx.transaction_no);
    if (txNoKey) existingByTxNo.set(txNoKey, tx);

    const descSig = `${tx.project_id}|${tx.date}|${tx.type}|${Math.round(tx.amount)}|${normalizeSignatureText(tx.description)}`;
    if (!existingByDescSig.has(descSig)) existingByDescSig.set(descSig, tx);

    if (isMeaningfulProofRef(tx.proof_ref)) {
      const proofSig = `${tx.project_id}|${tx.date}|${tx.type}|${Math.round(tx.amount)}|${normalizeSignatureText(tx.proof_ref)}`;
      if (!existingByProofSig.has(proofSig)) existingByProofSig.set(proofSig, tx);
    }
  }

  const batchTxNoSeen = new Map<string, number>();
  const batchDescSeen = new Map<string, number>();
  const batchProofSeen = new Map<string, number>();

  const activeProjects = projects.filter((p) => !p.is_deleted);
  const validRows: ImportFinanceTransactionRowPayload[] = [];
  const errors: string[] = [];
  const duplicates: string[] = [];

  rawObjects.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const lowered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      lowered[k.trim().toLowerCase()] = v;
    }

    // Skip completely blank trailing lines
    const hasAnyValue = Object.values(lowered).some((v) => String(v ?? '').trim() !== '');
    if (!hasAnyValue) return;

    const rawDate = lowered['tanggal'] ?? lowered['date'] ?? lowered['tgl'];
    const date = normalizeExcelDate(rawDate);
    if (!date) {
      errors.push(
        `Baris ${rowNo}: Format Tanggal "${String(rawDate ?? '').trim() || '-'}" tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY).`
      );
      return;
    }

    const projInput = String(
      lowered['nomor proyek'] ?? lowered['proyek'] ?? lowered['project_number'] ?? lowered['project_id'] ?? ''
    ).trim();
    const project = activeProjects.find(
      (p) =>
        p.project_number.toLowerCase() === projInput.toLowerCase() ||
        p.id.toLowerCase() === projInput.toLowerCase() ||
        p.name.toLowerCase() === projInput.toLowerCase()
    );
    if (!project) {
      errors.push(`Baris ${rowNo}: Nomor/Nama Proyek "${projInput || '-'}" tidak ditemukan.`);
      return;
    }

    const rawType = String(lowered['jenis'] ?? lowered['type'] ?? '').trim().toLowerCase();
    const type: 'Pemasukan' | 'Pengeluaran' | null =
      rawType === 'pemasukan' || rawType === 'masuk' || rawType === 'income'
        ? 'Pemasukan'
        : rawType === 'pengeluaran' || rawType === 'keluar' || rawType === 'expense'
        ? 'Pengeluaran'
        : null;
    if (!type) {
      errors.push(`Baris ${rowNo}: Jenis harus "Pemasukan" atau "Pengeluaran".`);
      return;
    }

    const rawCat = String(lowered['kategori'] ?? lowered['category'] ?? '').trim() as FinancialCategory;
    const category: FinancialCategory = VALID_CATEGORIES.has(rawCat)
      ? rawCat
      : type === 'Pemasukan'
      ? 'Pemasukan Proyek'
      : 'Pengeluaran Proyek';

    const rawAmountVal = lowered['nominal'] ?? lowered['amount'] ?? lowered['jumlah'] ?? '';
    const cleanedAmountStr =
      typeof rawAmountVal === 'number'
        ? String(rawAmountVal)
        : String(rawAmountVal)
            .replace(/rp\.?/gi, '')
            .replace(/\s+/g, '')
            .replace(/\.(?=\d{3}(?:\D|$))/g, '')
            .replace(/,/g, '.');
    const amount = Math.round(Number(cleanedAmountStr));
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Baris ${rowNo}: Nominal "${String(rawAmountVal)}" harus berupa angka lebih dari 0.`);
      return;
    }

    const description = String(lowered['keterangan'] ?? lowered['description'] ?? lowered['uraian'] ?? '').trim();
    if (!description) {
      errors.push(`Baris ${rowNo}: Kolom Keterangan wajib diisi.`);
      return;
    }

    const rawTxNo = String(lowered['no. transaksi'] ?? lowered['no transaksi'] ?? lowered['transaction_no'] ?? '').trim();
    const proofRef = String(lowered['referensi bukti'] ?? lowered['bukti'] ?? lowered['proof_ref'] ?? '').trim();
    const rawStatus = String(lowered['status'] ?? 'Terverifikasi').trim();
    if (rawStatus && !['Terverifikasi', 'Menunggu', 'Ditolak'].includes(rawStatus)) {
      errors.push(`Baris ${rowNo}: Status "${rawStatus}" tidak valid (gunakan Terverifikasi atau Menunggu).`);
      return;
    }
    const status = rawStatus === 'Menunggu' ? 'Menunggu' : 'Terverifikasi';

    // Duplicate Check 1: Transaction number match against DB (prevents re-importing exported system transactions)
    const txNoKey = normalizeSignatureText(rawTxNo);
    if (txNoKey) {
      const existingByNo = existingByTxNo.get(txNoKey);
      if (existingByNo) {
        duplicates.push(
          `Baris ${rowNo}: Nomor transaksi ${existingByNo.transaction_no} sudah tercatat (Sumber: ${existingByNo.source_module || 'Manual'}).`
        );
        return;
      }
      const prevRow = batchTxNoSeen.get(txNoKey);
      if (prevRow !== undefined) {
        duplicates.push(`Baris ${rowNo}: Duplikat No. Transaksi ${rawTxNo} dengan Baris ${prevRow} dalam file.`);
        return;
      }
      batchTxNoSeen.set(txNoKey, rowNo);
    }

    // Duplicate Check 2: Same project, date, type, amount, and normalized description
    const descSig = `${project.id}|${date}|${type}|${amount}|${normalizeSignatureText(description)}`;
    const existingDescMatch = existingByDescSig.get(descSig);
    if (existingDescMatch) {
      duplicates.push(
        `Baris ${rowNo}: Duplikat dengan transaksi ${existingDescMatch.transaction_no} (Sumber: ${existingDescMatch.source_module || 'Manual'} — ${formatDateID(date)}, ${formatRupiah(amount)}).`
      );
      return;
    }
    const prevDescRow = batchDescSeen.get(descSig);
    if (prevDescRow !== undefined) {
      duplicates.push(`Baris ${rowNo}: Duplikat data transaksi dengan Baris ${prevDescRow} pada file ini.`);
      return;
    }

    // Duplicate Check 3: Same project, date, type, amount, and meaningful proof reference
    const proofSig = isMeaningfulProofRef(proofRef)
      ? `${project.id}|${date}|${type}|${amount}|${normalizeSignatureText(proofRef)}`
      : '';
    if (proofSig) {
      const existingProofMatch = existingByProofSig.get(proofSig);
      if (existingProofMatch) {
        duplicates.push(
          `Baris ${rowNo}: Referensi bukti "${proofRef}" pada tanggal & nominal yang sama sudah tercatat di ${existingProofMatch.transaction_no} (Sumber: ${existingProofMatch.source_module || 'Manual'}).`
        );
        return;
      }
      const prevProofRow = batchProofSeen.get(proofSig);
      if (prevProofRow !== undefined) {
        duplicates.push(`Baris ${rowNo}: Duplikat referensi bukti "${proofRef}" dengan Baris ${prevProofRow} pada file ini.`);
        return;
      }
      batchProofSeen.set(proofSig, rowNo);
    }

    batchDescSeen.set(descSig, rowNo);

    validRows.push({
      transaction_no: rawTxNo || undefined,
      date,
      project_id: project.id,
      project_number: project.project_number,
      type,
      category,
      amount,
      proof_ref: proofRef || `Impor-${date}`,
      description,
      status,
    });
  });

  return { validRows, errors, duplicates };
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openFinancePrintA4Window(opts: FinanceRecapExportOptions): {
  ok: boolean;
  message?: string;
} {
  const printedAt = formatDateTimeID(new Date().toISOString());
  const projectRowsHtml = opts.projectRows
    .map(
      (r, idx) => `
      <tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(r.project_number)}</td>
        <td>${escapeHtml(r.project_name)}</td>
        <td class="num mono">${escapeHtml(formatRupiah(r.budget_total))}</td>
        <td class="num mono pos">${escapeHtml(formatRupiah(r.income_total))}</td>
        <td class="num mono neg">${escapeHtml(formatRupiah(r.expense_total))}</td>
        <td class="num mono">${escapeHtml(formatRupiah(r.balance))}</td>
        <td class="num mono warn">${escapeHtml(formatRupiah(r.unpaid_bills))}</td>
      </tr>`
    )
    .join('');

  const txRowsHtml = opts.transactions
    .map(
      (t, idx) => `
      <tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(t.transaction_no)}</td>
        <td>${escapeHtml(formatDateID(t.date))}</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, t.project_id))}</td>
        <td>${escapeHtml(t.category)}</td>
        <td>${escapeHtml(t.type)}</td>
        <td class="num mono ${t.type === 'Pemasukan' ? 'pos' : 'neg'}">${escapeHtml(formatRupiah(t.amount))}</td>
        <td>${escapeHtml(t.status)}</td>
        <td>${escapeHtml(t.description)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Cetak Rekap Keuangan — PT. Wilwa Abiyasa Sejahtera</title>
  <style>
    @page { size: A4 landscape; margin: 11mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f1f5f9; font-size: 10.5px; }
    .toolbar { position: sticky; top: 0; z-index: 20; background: #13233C; color: #fff; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #FBC02D; }
    .btn { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; padding: 6px 14px; border-radius: 7px; font-weight: 600; font-size: 12px; cursor: pointer; }
    .btn-primary { border-color: #FBC02D; background: #FBC02D; color: #13233C; }
    .wrap { padding: 16px; display: flex; justify-content: center; }
    .sheet { width: 100%; max-width: 272mm; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 18px rgba(15,23,42,.12); }
    .header { background: #13233C; color: #fff; padding: 14px 18px; border-bottom: 4px solid #FBC02D; display: flex; justify-content: space-between; align-items: center; }
    .brand-tag { color: #FBC02D; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .title { font-size: 15px; font-weight: 800; margin-top: 2px; }
    .sub { font-size: 10px; color: #cbd5e1; margin-top: 2px; }
    .body { padding: 16px 18px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-lbl { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .kpi-val { font-size: 12px; font-weight: 700; margin-top: 3px; font-family: ui-monospace, monospace; }
    h3 { font-size: 11px; margin: 12px 0 6px; color: #13233C; text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9.5px; }
    th { background: #13233C; color: #fff; text-align: left; padding: 6px 7px; font-weight: 600; }
    td { padding: 5.5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr.alt { background: #f8fafc; }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    .pos { color: #047857; font-weight: 600; }
    .neg { color: #b91c1c; font-weight: 600; }
    .warn { color: #b45309; font-weight: 600; }
    .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .wrap { padding: 0; }
      .sheet { box-shadow: none; max-width: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <div style="font-weight:700;font-size:12.5px">Pratinjau Cetak A4 — Rekap Keuangan PMS</div>
      <div style="font-size:11px;color:#cbd5e1">Proyek: ${escapeHtml(opts.projectLabel)} · Periode: ${escapeHtml(opts.periodLabel)}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="window.close()">Tutup</button>
      <button class="btn btn-primary" onclick="window.print()">Cetak Sekarang</button>
    </div>
  </div>
  <div class="wrap">
    <div class="sheet">
      <div class="header">
        <div>
          <div class="brand-tag">PT. WILWA ABIYASA SEJAHTERA — DIVISI FINANCE</div>
          <div class="title">REKAP KEUANGAN & ARUS KAS PROYEK</div>
          <div class="sub">Filter Proyek: ${escapeHtml(opts.projectLabel)} · Periode: ${escapeHtml(opts.periodLabel)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#cbd5e1">DISIAPKAN OLEH</div>
          <div style="font-weight:700;color:#FBC02D;font-size:12px">${escapeHtml(opts.preparedBy)}</div>
          <div class="sub">Dicetak: ${escapeHtml(printedAt)}</div>
        </div>
      </div>
      <div class="body">
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-lbl">Anggaran (RAB/Kontrak)</div><div class="kpi-val">${escapeHtml(formatRupiah(opts.summary.totalBudget))}</div></div>
          <div class="kpi"><div class="kpi-lbl">Pemasukan Terverifikasi</div><div class="kpi-val pos">${escapeHtml(formatRupiah(opts.summary.totalIncome))}</div></div>
          <div class="kpi"><div class="kpi-lbl">Pengeluaran Terverifikasi</div><div class="kpi-val neg">${escapeHtml(formatRupiah(opts.summary.totalExpense))}</div></div>
          <div class="kpi"><div class="kpi-lbl">Saldo Kas Bersih</div><div class="kpi-val">${escapeHtml(formatRupiah(opts.summary.netBalance))}</div></div>
          <div class="kpi"><div class="kpi-lbl">Tagihan Belum Lunas</div><div class="kpi-val warn">${escapeHtml(formatRupiah(opts.summary.unpaidBills))}</div></div>
        </div>
        <h3>1. Ringkasan Keuangan Per Proyek</h3>
        <table>
          <thead>
            <tr>
              <th>No. Proyek</th>
              <th>Nama Proyek</th>
              <th class="num">Anggaran RAB</th>
              <th class="num">Pemasukan</th>
              <th class="num">Pengeluaran</th>
              <th class="num">Saldo Bersih</th>
              <th class="num">Sisa Tagihan</th>
            </tr>
          </thead>
          <tbody>${projectRowsHtml || '<tr><td colspan="7" style="text-align:center;color:#64748b">Tidak ada data proyek.</td></tr>'}</tbody>
        </table>
        <h3>2. Daftar Transaksi Keuangan (${opts.transactions.length} baris)</h3>
        <table>
          <thead>
            <tr>
              <th>No. Transaksi</th>
              <th>Tanggal</th>
              <th>Proyek</th>
              <th>Kategori</th>
              <th>Jenis</th>
              <th class="num">Nominal</th>
              <th>Status</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>${txRowsHtml || '<tr><td colspan="8" style="text-align:center;color:#64748b">Tidak ada transaksi sesuai filter.</td></tr>'}</tbody>
        </table>
        <div class="footer">
          <span>PT. Wilwa Abiyasa Sejahtera — PMS Konstruksi Modul Finance</span>
          <span class="mono">Dicetak: ${escapeHtml(printedAt)}</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.print(); } catch (e) {}
      }, 250);
    });
  </script>
</body>
</html>`;

  const win = window.open(
    '',
    'pms_finance_print_window',
    'width=1120,height=780,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
  );
  if (!win) {
    try {
      window.print();
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'Pop-up cetak diblokir browser. Izinkan pop-up atau gunakan tombol Export PDF.',
      };
    }
  }
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return { ok: true };
  } catch {
    try {
      win.close();
    } catch {
      // ignore
    }
    return {
      ok: false,
      message: 'Gagal membuka jendela cetak A4. Silakan gunakan tombol Export PDF.',
    };
  }
}
