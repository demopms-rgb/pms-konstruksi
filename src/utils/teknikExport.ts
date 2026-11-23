import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Project,
  TeknikChangeReport,
  TeknikCompletionReport,
  TeknikConstraintRecord,
  TeknikEvaluationReport,
  TeknikProgressAssessment,
} from '../types/pms';
import { formatDateID, formatDateTimeID } from './format';
import { downloadPdfBytes, validatePdfBytes } from './pdfUtils';

export interface TeknikReportExportOptions {
  projectLabel: string;
  periodLabel: string;
  statusLabel: string;
  preparedBy: string;
  projects: Project[];
  evaluations: TeknikEvaluationReport[];
  constraints: TeknikConstraintRecord[];
  changes: TeknikChangeReport[];
  completions: TeknikCompletionReport[];
  assessments: TeknikProgressAssessment[];
}

function resolveProjectLabel(projects: Project[], projectId: string): string {
  const p = projects.find((item) => item.id === projectId);
  return p ? `${p.project_number} - ${p.name}` : projectId;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportTeknikReportPdf(opts: TeknikReportExportOptions): Uint8Array {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(19, 35, 60);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setTextColor(251, 192, 45);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PT. WILWA ABIYASA SEJAHTERA — DIVISI TEKNIK', 14, 8.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('LAPORAN PENGENDALIAN TEKNIS & REALISASI INDEKS PROGRES TEKNIK', 14, 16.5);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Proyek: ${opts.projectLabel}  |  Periode: ${opts.periodLabel}  |  Status: ${opts.statusLabel}  |  Penilai/Petugas: ${opts.preparedBy}`,
    14,
    30
  );

  // 1. Indeks Nilai Progres Teknik
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. Realisasi Indeks Nilai Progres Teknik (Terpisah dari Progres Fisik Lapangan)', 14, 36);

  autoTable(doc, {
    startY: 39,
    head: [['No. Penilaian', 'Proyek', 'Periode', 'Tgl Evaluasi', 'Target (%)', 'Nilai Teknik (%)', 'Pembanding Lapangan (%)', 'Indeks Teknis', 'Skor Mutu', 'Penilai']],
    body: opts.assessments.map((a) => [
      a.assessment_no,
      resolveProjectLabel(opts.projects, a.project_id),
      a.period_month,
      formatDateID(a.evaluation_date),
      `${a.target_progress_percent}%`,
      `${a.teknik_progress_percent}%`,
      `${a.field_progress_comparison}%`,
      a.technical_index.toFixed(2),
      `${a.quality_score}/100`,
      a.evaluator_name,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // 2. Evaluasi Teknis
  const afterAssY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 75;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Laporan Evaluasi Teknis (Kesesuaian Gambar Kerja & Spesifikasi)', 14, afterAssY + 8);

  autoTable(doc, {
    startY: afterAssY + 11,
    head: [['No. Eval', 'Proyek', 'Tanggal', 'Paket Pekerjaan', 'Kesesuaian', 'Temuan & Perubahan Vol/Spek', 'Rekomendasi & Tindak Lanjut', 'Status']],
    body: opts.evaluations.map((ev) => [
      ev.eval_no,
      resolveProjectLabel(opts.projects, ev.project_id),
      formatDateID(ev.evaluation_date),
      ev.work_package,
      ev.drawing_spec_compliance,
      `${ev.non_conformance_findings || '-'} | Vol/Spek: ${ev.volume_spec_changes || '-'}`,
      `${ev.recommendation || '-'} -> ${ev.follow_up_action || '-'}`,
      ev.status,
    ]),
    styles: { fontSize: 7.2, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // 3. Kendala Teknis
  const afterEvalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Laporan Kendala Teknis & Tindak Lanjut Lapangan', 14, afterEvalY + 8);

  autoTable(doc, {
    startY: afterEvalY + 11,
    head: [['No. Kendala', 'Sumber', 'Proyek', 'Tanggal', 'Area & Permasalahan', 'Analisis & Tindak Lanjut Teknik', 'PIC', 'Status']],
    body: opts.constraints.map((c) => [
      c.issue_no,
      c.source_type,
      resolveProjectLabel(opts.projects, c.project_id),
      formatDateID(c.reported_date),
      `${c.work_area}: ${c.problem_description}`,
      `${c.technical_analysis || '-'} | Tindak lanjut: ${c.follow_up_action}`,
      c.pic_name,
      c.status,
    ]),
    styles: { fontSize: 7.2, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // 4. Perubahan Pekerjaan
  const afterConY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 160;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Laporan Perubahan Pekerjaan (Lingkup, Volume & Material)', 14, afterConY + 8);

  autoTable(doc, {
    startY: afterConY + 11,
    head: [['No. Perubahan', 'Proyek', 'Tanggal', 'Kategori', 'Perubahan Lingkup & Volume/Material', 'Alasan & Catatan Teknis', 'Status']],
    body: opts.changes.map((ch) => [
      ch.change_no,
      resolveProjectLabel(opts.projects, ch.project_id),
      formatDateID(ch.change_date),
      ch.change_category,
      `${ch.scope_change} | ${ch.volume_material_change}`,
      `${ch.reason} (${ch.technical_notes || '-'})`,
      ch.status,
    ]),
    styles: { fontSize: 7.2, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // 5. Penyelesaian Teknis
  const afterChgY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 185;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Laporan Penyelesaian Teknis', 14, afterChgY + 8);

  autoTable(doc, {
    startY: afterChgY + 11,
    head: [['No. Laporan', 'Proyek', 'Tgl Pemeriksaan', 'Rekap Pekerjaan Selesai', 'Hasil Pemeriksaan', 'Kekurangan & Tindak Lanjut', 'Pemeriksa', 'Status']],
    body: opts.completions.map((cp) => [
      cp.completion_no,
      resolveProjectLabel(opts.projects, cp.project_id),
      formatDateID(cp.inspection_date),
      cp.completed_work_summary,
      cp.inspection_result,
      `${cp.defects_and_notes || '-'} -> ${cp.follow_up_action || '-'}`,
      cp.inspector_name,
      cp.status,
    ]),
    styles: { fontSize: 7.2, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PMS Konstruksi PT. Wilwa Abiyasa Sejahtera — Laporan Teknik | Dicetak ${formatDateTimeID(new Date().toISOString())} | Hal ${i} dari ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 7
    );
  }

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  validatePdfBytes(bytes);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdfBytes(bytes, `Laporan-Dashboard-Teknik-${stamp}`);
  return bytes;
}

export function exportTeknikReportExcel(opts: TeknikReportExportOptions): void {
  const wb = XLSX.utils.book_new();

  const sheetAssessments = XLSX.utils.aoa_to_sheet([
    ['No. Penilaian', 'Proyek', 'Periode', 'Tanggal Evaluasi', 'Target (%)', 'Nilai Teknik (%)', 'Pembanding Lapangan (%)', 'Indeks Kinerja', 'Skor Mutu', 'Nama Penilai', 'Catatan Penilaian'],
    ...opts.assessments.map((a) => [
      a.assessment_no,
      resolveProjectLabel(opts.projects, a.project_id),
      a.period_month,
      a.evaluation_date,
      a.target_progress_percent,
      a.teknik_progress_percent,
      a.field_progress_comparison,
      a.technical_index,
      a.quality_score,
      a.evaluator_name,
      a.notes,
    ]),
  ]);
  sheetAssessments['!cols'] = [
    { wch: 18 }, { wch: 32 }, { wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 11 }, { wch: 22 }, { wch: 38 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetAssessments, 'Indeks Progres Teknik');

  const sheetEvaluations = XLSX.utils.aoa_to_sheet([
    ['No. Evaluasi', 'Proyek', 'Tanggal', 'Paket Pekerjaan', 'Kesesuaian Gambar & Spek', 'Temuan Ketidaksesuaian', 'Perubahan Volume/Spek', 'Rekomendasi', 'Tindak Lanjut', 'Status', 'Penilai'],
    ...opts.evaluations.map((e) => [
      e.eval_no,
      resolveProjectLabel(opts.projects, e.project_id),
      e.evaluation_date,
      e.work_package,
      e.drawing_spec_compliance,
      e.non_conformance_findings,
      e.volume_spec_changes,
      e.recommendation,
      e.follow_up_action,
      e.status,
      e.evaluator_name,
    ]),
  ]);
  sheetEvaluations['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetEvaluations, 'Evaluasi Teknis');

  const sheetConstraints = XLSX.utils.aoa_to_sheet([
    ['No. Kendala', 'Sumber', 'Proyek', 'Tanggal Lapor', 'Pelapor', 'Area Pekerjaan', 'Permasalahan', 'Analisis Teknis', 'Tindak Lanjut', 'PIC', 'Target Selesai', 'Status'],
    ...opts.constraints.map((c) => [
      c.issue_no,
      c.source_type,
      resolveProjectLabel(opts.projects, c.project_id),
      c.reported_date,
      c.reported_by_name,
      c.work_area,
      c.problem_description,
      c.technical_analysis,
      c.follow_up_action,
      c.pic_name,
      c.target_resolution_date || '-',
      c.status,
    ]),
  ]);
  sheetConstraints['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 32 }, { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 13 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetConstraints, 'Kendala Teknis');

  const sheetChanges = XLSX.utils.aoa_to_sheet([
    ['No. Perubahan', 'Proyek', 'Tanggal', 'Kategori', 'Perubahan Lingkup', 'Perubahan Volume / Material', 'Alasan', 'Catatan Teknis', 'Status', 'Pengusul', 'Pemeriksa'],
    ...opts.changes.map((c) => [
      c.change_no,
      resolveProjectLabel(opts.projects, c.project_id),
      c.change_date,
      c.change_category,
      c.scope_change,
      c.volume_material_change,
      c.reason,
      c.technical_notes,
      c.status,
      c.requested_by_name,
      c.reviewer_name || '-',
    ]),
  ]);
  sheetChanges['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetChanges, 'Perubahan Pekerjaan');

  const sheetCompletions = XLSX.utils.aoa_to_sheet([
    ['No. Penyelesaian', 'Proyek', 'Tanggal Pemeriksaan', 'Rekap Pekerjaan Selesai', 'Hasil Pemeriksaan', 'Catatan Kekurangan', 'Tindak Lanjut', 'Status', 'Pemeriksa', 'Verifikator'],
    ...opts.completions.map((c) => [
      c.completion_no,
      resolveProjectLabel(opts.projects, c.project_id),
      c.inspection_date,
      c.completed_work_summary,
      c.inspection_result,
      c.defects_and_notes,
      c.follow_up_action,
      c.status,
      c.inspector_name,
      c.verified_by_name || '-',
    ]),
  ]);
  sheetCompletions['!cols'] = [
    { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 34 }, { wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetCompletions, 'Penyelesaian Teknis');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Laporan-Dashboard-Teknik-${stamp}.xlsx`);
}

export function openTeknikReportPrintA4Window(opts: TeknikReportExportOptions): {
  ok: boolean;
  message?: string;
} {
  const printedAt = formatDateTimeID(new Date().toISOString());

  const assessRows = opts.assessments
    .map(
      (a, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(a.assessment_no)}</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, a.project_id))}</td>
        <td class="mono">${escapeHtml(a.period_month)}</td>
        <td class="num mono">${a.target_progress_percent}%</td>
        <td class="num mono strong">${a.teknik_progress_percent}%</td>
        <td class="num mono muted">${a.field_progress_comparison}%</td>
        <td class="num mono">${a.technical_index.toFixed(2)}</td>
        <td class="num mono">${a.quality_score}/100</td>
        <td>${escapeHtml(a.evaluator_name)} (${escapeHtml(formatDateID(a.evaluation_date))})</td>
      </tr>`
    )
    .join('');

  const evalRows = opts.evaluations
    .map(
      (e, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(e.eval_no)}</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, e.project_id))}</td>
        <td>${escapeHtml(e.work_package)}</td>
        <td>${escapeHtml(e.drawing_spec_compliance)}</td>
        <td>${escapeHtml(e.non_conformance_findings || '-')}</td>
        <td>${escapeHtml(e.recommendation)} / ${escapeHtml(e.follow_up_action)}</td>
        <td>${escapeHtml(e.status)}</td>
      </tr>`
    )
    .join('');

  const conRows = opts.constraints
    .map(
      (c, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(c.issue_no)} (${escapeHtml(c.source_type)})</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, c.project_id))}</td>
        <td>${escapeHtml(c.work_area)}: ${escapeHtml(c.problem_description)}</td>
        <td>${escapeHtml(c.follow_up_action)}</td>
        <td>${escapeHtml(c.pic_name)}</td>
        <td>${escapeHtml(c.status)}</td>
      </tr>`
    )
    .join('');

  const chgRows = opts.changes
    .map(
      (c, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(c.change_no)}</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, c.project_id))}</td>
        <td>${escapeHtml(c.change_category)}</td>
        <td>${escapeHtml(c.scope_change)} · ${escapeHtml(c.volume_material_change)}</td>
        <td>${escapeHtml(c.reason)}</td>
        <td>${escapeHtml(c.status)}</td>
      </tr>`
    )
    .join('');

  const compRows = opts.completions
    .map(
      (c, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono">${escapeHtml(c.completion_no)}</td>
        <td>${escapeHtml(resolveProjectLabel(opts.projects, c.project_id))}</td>
        <td>${escapeHtml(c.completed_work_summary)}</td>
        <td>${escapeHtml(c.inspection_result)}</td>
        <td>${escapeHtml(c.defects_and_notes || '-')} -> ${escapeHtml(c.follow_up_action || '-')}</td>
        <td>${escapeHtml(c.status)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Laporan Dashboard Teknik — PT. Wilwa Abiyasa Sejahtera</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 11mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f1f5f9; font-size: 10px; }
    .toolbar { position: sticky; top: 0; z-index: 20; background: #13233C; color: #fff; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #FBC02D; }
    .btn { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; padding: 6px 14px; border-radius: 7px; font-weight: 600; font-size: 12px; cursor: pointer; }
    .btn-primary { border-color: #FBC02D; background: #FBC02D; color: #13233C; }
    .wrap { padding: 14px; display: flex; justify-content: center; }
    .sheet { width: 100%; max-width: 275mm; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 18px rgba(15,23,42,.12); }
    .header { background: #13233C; color: #fff; padding: 13px 16px; border-bottom: 4px solid #FBC02D; display: flex; justify-content: space-between; align-items: center; }
    .brand { color: #FBC02D; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .title { font-size: 14.5px; font-weight: 800; margin-top: 2px; }
    .sub { font-size: 9.5px; color: #cbd5e1; margin-top: 2px; }
    .body { padding: 14px 16px; }
    h3 { font-size: 10.5px; margin: 11px 0 5px; color: #13233C; text-transform: uppercase; letter-spacing: .03em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9px; }
    th { background: #13233C; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
    td { padding: 4.5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr.alt { background: #f8fafc; }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    .strong { font-weight: 700; color: #1d4ed8; }
    .muted { color: #64748b; }
    .footer { margin-top: 10px; padding-top: 7px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 8.5px; color: #64748b; }
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
      <div style="font-weight:700;font-size:12px">Pratinjau Cetak A4 — Laporan Dashboard Teknik</div>
      <div style="font-size:10.5px;color:#cbd5e1">Proyek: ${escapeHtml(opts.projectLabel)} · Periode: ${escapeHtml(opts.periodLabel)} · Status: ${escapeHtml(opts.statusLabel)}</div>
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
          <div class="brand">PT. WILWA ABIYASA SEJAHTERA — DIVISI TEKNIK</div>
          <div class="title">LAPORAN EVALUASI, PENGENDALIAN &amp; INDEKS PROGRES TEKNIK</div>
          <div class="sub">Proyek: ${escapeHtml(opts.projectLabel)} · Periode: ${escapeHtml(opts.periodLabel)} · Status: ${escapeHtml(opts.statusLabel)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:8.5px;color:#cbd5e1">DISIAPKAN OLEH</div>
          <div style="font-weight:700;color:#FBC02D;font-size:11.5px">${escapeHtml(opts.preparedBy)}</div>
          <div class="sub">Dicetak: ${escapeHtml(printedAt)}</div>
        </div>
      </div>
      <div class="body">
        <h3>1. Realisasi Indeks Nilai Progres Teknik (Terpisah dari Progres Fisik Lapangan)</h3>
        <table>
          <thead><tr><th>No. Penilaian</th><th>Proyek</th><th>Periode</th><th class="num">Target</th><th class="num">Nilai Teknik</th><th class="num">Pembanding Lapangan</th><th class="num">Indeks</th><th class="num">Skor Mutu</th><th>Penilai &amp; Tgl</th></tr></thead>
          <tbody>${assessRows || '<tr><td colspan="9" class="muted">Tidak ada data penilaian progres Teknik.</td></tr>'}</tbody>
        </table>
        <h3>2. Laporan Evaluasi Teknis</h3>
        <table>
          <thead><tr><th>No. Eval</th><th>Proyek</th><th>Paket Pekerjaan</th><th>Kesesuaian</th><th>Temuan Ketidaksesuaian</th><th>Rekomendasi &amp; Tindak Lanjut</th><th>Status</th></tr></thead>
          <tbody>${evalRows || '<tr><td colspan="7" class="muted">Tidak ada data evaluasi teknis.</td></tr>'}</tbody>
        </table>
        <h3>3. Laporan Kendala Teknis &amp; Tindak Lanjut</h3>
        <table>
          <thead><tr><th>No. / Sumber</th><th>Proyek</th><th>Area &amp; Permasalahan</th><th>Tindak Lanjut Teknik</th><th>PIC</th><th>Status</th></tr></thead>
          <tbody>${conRows || '<tr><td colspan="6" class="muted">Tidak ada data kendala teknis.</td></tr>'}</tbody>
        </table>
        <h3>4. Laporan Perubahan Pekerjaan</h3>
        <table>
          <thead><tr><th>No. Perubahan</th><th>Proyek</th><th>Kategori</th><th>Perubahan Lingkup &amp; Volume/Material</th><th>Alasan Perubahan</th><th>Status</th></tr></thead>
          <tbody>${chgRows || '<tr><td colspan="6" class="muted">Tidak ada data perubahan pekerjaan.</td></tr>'}</tbody>
        </table>
        <h3>5. Laporan Penyelesaian Teknis</h3>
        <table>
          <thead><tr><th>No. Laporan</th><th>Proyek</th><th>Rekap Pekerjaan Selesai</th><th>Hasil Pemeriksaan</th><th>Kekurangan &amp; Tindak Lanjut</th><th>Status</th></tr></thead>
          <tbody>${compRows || '<tr><td colspan="6" class="muted">Tidak ada data penyelesaian teknis.</td></tr>'}</tbody>
        </table>
        <div class="footer">
          <span>PT. Wilwa Abiyasa Sejahtera — PMS Konstruksi Dashboard Teknik</span>
          <span class="mono">Dicetak: ${escapeHtml(printedAt)}</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.print(); } catch (e) {} }, 250);
    });
  </script>
</body>
</html>`;

  const win = window.open(
    '',
    'pms_teknik_print_window',
    'width=1140,height=780,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
  );
  if (!win) {
    try {
      window.print();
      return { ok: true };
    } catch {
      return { ok: false, message: 'Pop-up cetak diblokir browser. Gunakan Export PDF.' };
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
    return { ok: false, message: 'Gagal membuka jendela cetak A4. Gunakan Export PDF.' };
  }
}
