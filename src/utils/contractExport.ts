import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateTimeID } from './format';
import { downloadPdfBytes, validatePdfBytes } from './pdfUtils';

export interface ExportTableOptions {
  title: string;
  subtitle?: string;
  fileName: string;
  headers: string[];
  rows: (string | number)[][];
  summaryRow?: (string | number)[];
  orientation?: 'portrait' | 'landscape';
}

export function buildContractReportPdfBytes(opts: ExportTableOptions): Uint8Array {
  const doc = new jsPDF({
    orientation: opts.orientation ?? 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Header Letterhead PT. Wilwa Abiyasa Sejahtera
  doc.setFillColor(19, 35, 60); // #13233C Navy
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
  doc.setTextColor(251, 192, 45); // #FBC02D Gold accent
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PT. WILWA ABIYASA SEJAHTERA - PMS KONSTRUKSI', 14, 9);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(opts.title, 14, 17);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const metaLine = [
    opts.subtitle,
    `Dicetak: ${formatDateTimeID(new Date().toISOString())}`,
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(metaLine, 14, 31);

  const bodyRows = opts.summaryRow ? [...opts.rows, opts.summaryRow] : opts.rows;

  autoTable(doc, {
    startY: 35,
    head: [opts.headers],
    body: bodyRows.map((r) => r.map((cell) => String(cell ?? '-'))),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [19, 35, 60],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      if (opts.summaryRow && data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [239, 246, 255];
      }
    },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PMS Konstruksi - PT. Wilwa Abiyasa Sejahtera | Halaman ${i} dari ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  validatePdfBytes(bytes);
  return bytes;
}

export function exportContractReportPdf(opts: ExportTableOptions): Uint8Array {
  const bytes = buildContractReportPdfBytes(opts);
  downloadPdfBytes(bytes, opts.fileName);
  return bytes;
}

export function exportContractReportExcel(opts: ExportTableOptions): void {
  const sheetData: (string | number)[][] = [
    ['PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI'],
    [opts.title],
    [opts.subtitle || `Dicetak pada ${formatDateTimeID(new Date().toISOString())}`],
    [],
    opts.headers,
    ...opts.rows,
  ];
  if (opts.summaryRow) {
    sheetData.push(opts.summaryRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = opts.headers.map((h, idx) => {
    const maxLen = Math.max(
      h.length,
      ...opts.rows.map((r) => String(r[idx] ?? '').length),
      12
    );
    return { wch: Math.min(maxLen + 4, 42) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
  XLSX.writeFile(wb, `${opts.fileName}.xlsx`);
}
