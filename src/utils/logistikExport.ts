import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  DeliveryNote,
  Material,
  MaterialTransaction,
  Project,
  StockOpnameRecord,
  WarehouseLocation,
} from '../types/pms';
import { formatDateID, formatDateTimeID, formatNumber, formatRupiah } from './format';
import { downloadPdfBytes, validatePdfBytes } from './pdfUtils';

export type LogistikReportCategory =
  | 'persediaan'
  | 'mutasi'
  | 'distribusi'
  | 'opname'
  | 'pengiriman';

export interface ProjectMaterialDistRow {
  project_id: string;
  project_number: string;
  project_name: string;
  tx_count: number;
  qty_keluar: number;
  sj_count: number;
  sj_selesai: number;
  nilai_distribusi: number;
}

export interface LogistikReportExportOptions {
  reportCategory: LogistikReportCategory;
  reportTitle: string;
  projectLabel: string;
  warehouseLabel: string;
  periodLabel: string;
  txTypeLabel: string;
  preparedBy: string;
  selectedWarehouseId: string;
  summary: {
    totalMaterialJenis: number;
    totalStokUnit: number;
    totalStokMinimum: number;
    totalNilaiPersediaan: number;
    totalMasukQty: number;
    totalKeluarQty: number;
    totalOpnameCount: number;
    totalPengirimanCount: number;
  };
  materials: Material[];
  warehouses: WarehouseLocation[];
  projects: Project[];
  transactions: MaterialTransaction[];
  distributionRows: ProjectMaterialDistRow[];
  opnames: StockOpnameRecord[];
  deliveryNotes: DeliveryNote[];
}

function getWhStock(mat: Material, warehouseId: string): number {
  if (warehouseId === 'SEMUA') return mat.stock;
  if (mat.warehouse_stocks && typeof mat.warehouse_stocks === 'object') {
    return Number(mat.warehouse_stocks[warehouseId] ?? 0);
  }
  return (mat.default_warehouse_id || 'wh-depok') === warehouseId ? mat.stock : 0;
}

function resolveProjectLabel(projects: Project[], projectId?: string): string {
  if (!projectId) return 'Umum / Non-Proyek';
  const p = projects.find((item) => item.id === projectId);
  return p ? `${p.project_number} - ${p.name}` : projectId;
}

function resolveMaterialName(materials: Material[], materialId: string): string {
  const m = materials.find((item) => item.id === materialId);
  return m ? `${m.code} - ${m.name}` : materialId;
}

function resolveMaterialUnit(materials: Material[], materialId: string): string {
  return materials.find((item) => item.id === materialId)?.unit || 'Unit';
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportLogistikPdf(opts: LogistikReportExportOptions): Uint8Array {
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
  doc.text('PT. WILWA ABIYASA SEJAHTERA — DIVISI LOGISTIK', 14, 9);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(opts.reportTitle.toUpperCase(), 14, 17);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Proyek: ${opts.projectLabel}  |  Gudang: ${opts.warehouseLabel}  |  Periode: ${opts.periodLabel}  |  Jenis: ${opts.txTypeLabel}  |  Petugas: ${opts.preparedBy}`,
    14,
    31
  );

  autoTable(doc, {
    startY: 35,
    head: [
      [
        'Jenis Material',
        'Total Stok Tersedia',
        'Material Stok Minimum',
        'Nilai Persediaan',
        'Total Barang Masuk',
        'Total Barang Keluar',
      ],
    ],
    body: [
      [
        `${formatNumber(opts.summary.totalMaterialJenis)} Item`,
        `${formatNumber(opts.summary.totalStokUnit)} Unit`,
        `${formatNumber(opts.summary.totalStokMinimum)} Item`,
        formatRupiah(opts.summary.totalNilaiPersediaan),
        `${formatNumber(opts.summary.totalMasukQty)} Unit`,
        `${formatNumber(opts.summary.totalKeluarQty)} Unit`,
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.8, fontStyle: 'bold' },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  const startY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 52) + 8;

  if (opts.reportCategory === 'persediaan') {
    autoTable(doc, {
      startY,
      head: [['Kode', 'Nama Material', 'Kategori', 'Gudang', 'Stok', 'Min. Stok', 'Satuan', 'Harga Satuan', 'Nilai Stok', 'Status']],
      body: opts.materials.map((m) => {
        const qty = getWhStock(m, opts.selectedWarehouseId);
        const status = qty <= 0 ? 'Stok Habis' : qty <= m.min_stock ? 'Stok Minimum' : 'Stok Aman';
        return [
          m.code,
          m.name,
          m.category,
          m.warehouse_location,
          formatNumber(qty),
          formatNumber(m.min_stock),
          m.unit,
          formatRupiah(m.unit_cost),
          formatRupiah(qty * m.unit_cost),
          status,
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else if (opts.reportCategory === 'mutasi') {
    autoTable(doc, {
      startY,
      head: [['Tanggal', 'No. Referensi', 'Jenis', 'Material', 'Qty', 'Gudang', 'Proyek / Tujuan', 'Petugas']],
      body: opts.transactions.map((t) => [
        formatDateID(t.date),
        t.reference_no,
        t.type,
        resolveMaterialName(opts.materials, t.material_id),
        `${formatNumber(t.qty)} ${resolveMaterialUnit(opts.materials, t.material_id)}`,
        t.warehouse_name || '-',
        t.project_id ? resolveProjectLabel(opts.projects, t.project_id) : t.source_or_destination || '-',
        t.pic_name,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else if (opts.reportCategory === 'distribusi') {
    autoTable(doc, {
      startY,
      head: [['No. Proyek', 'Nama Proyek', 'Transaksi Keluar', 'Total Qty Disalurkan', 'Total Surat Jalan', 'SJ Selesai', 'Estimasi Nilai Material']],
      body: opts.distributionRows.map((r) => [
        r.project_number,
        r.project_name,
        formatNumber(r.tx_count),
        formatNumber(r.qty_keluar),
        formatNumber(r.sj_count),
        formatNumber(r.sj_selesai),
        formatRupiah(r.nilai_distribusi),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else if (opts.reportCategory === 'opname') {
    autoTable(doc, {
      startY,
      head: [['No. Opname', 'Tanggal', 'Material', 'Gudang', 'Stok Sistem', 'Stok Fisik', 'Selisih', 'Petugas', 'Alasan / Kondisi']],
      body: opts.opnames.map((o) => [
        o.opname_no,
        formatDateID(o.opname_date),
        resolveMaterialName(opts.materials, o.material_id),
        o.warehouse_name || '-',
        `${formatNumber(o.system_qty)} ${o.unit}`,
        `${formatNumber(o.physical_qty)} ${o.unit}`,
        `${o.variance_qty >= 0 ? '+' : ''}${formatNumber(o.variance_qty)} ${o.unit}`,
        o.officer_name,
        `${o.reason} (${o.condition_note})`,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else {
    autoTable(doc, {
      startY,
      head: [['No. Surat Jalan', 'Tanggal Kirim', 'Proyek Tujuan', 'Gudang Asal', 'Pengirim / Driver', 'Penerima Lapangan', 'Item', 'Status']],
      body: opts.deliveryNotes.map((d) => [
        d.sj_number,
        formatDateID(d.delivery_date),
        `${d.project_number} - ${d.project_name}`,
        d.source_warehouse_name || '-',
        `${d.sender_name} (${d.driver_name})`,
        d.recipient_name,
        `${d.items.length} item`,
        d.status,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 6: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PMS Konstruksi PT. Wilwa Abiyasa Sejahtera — Laporan Logistik | Halaman ${i} dari ${pageCount} | Dicetak: ${formatDateTimeID(new Date().toISOString())}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  validatePdfBytes(bytes);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdfBytes(bytes, `Laporan-Logistik-${opts.reportCategory}-${stamp}`);
  return bytes;
}

export function exportLogistikExcel(opts: LogistikReportExportOptions): void {
  const wb = XLSX.utils.book_new();

  const invRows: (string | number)[][] = [
    ['Kode', 'Nama Material', 'Kategori', 'Gudang Utama', 'Stok Tersedia', 'Stok Minimum', 'Satuan', 'Harga Satuan (Rp)', 'Nilai Persediaan (Rp)', 'Status Stok'],
    ...opts.materials.map((m) => {
      const qty = getWhStock(m, opts.selectedWarehouseId);
      const status = qty <= 0 ? 'Stok Habis' : qty <= m.min_stock ? 'Stok Minimum' : 'Stok Aman';
      return [m.code, m.name, m.category, m.warehouse_location, qty, m.min_stock, m.unit, m.unit_cost, qty * m.unit_cost, status];
    }),
  ];
  const wsInv = XLSX.utils.aoa_to_sheet(invRows);
  wsInv['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsInv, 'Persediaan Material');

  const mutasiRows: (string | number)[][] = [
    ['Tanggal', 'No. Referensi', 'Jenis Transaksi', 'Material', 'Qty', 'Satuan', 'Stok Sebelum', 'Stok Sesudah', 'Gudang', 'Proyek / Sumber-Tujuan', 'Petugas', 'Catatan'],
    ...opts.transactions.map((t) => [
      t.date,
      t.reference_no,
      t.type,
      resolveMaterialName(opts.materials, t.material_id),
      t.qty,
      resolveMaterialUnit(opts.materials, t.material_id),
      t.stock_before ?? '-',
      t.stock_after ?? '-',
      t.warehouse_name || '-',
      t.project_id ? resolveProjectLabel(opts.projects, t.project_id) : t.source_or_destination || '-',
      t.pic_name,
      t.notes,
    ]),
  ];
  const wsMutasi = XLSX.utils.aoa_to_sheet(mutasiRows);
  wsMutasi['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 32 }, { wch: 20 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, wsMutasi, 'Masuk & Keluar');

  const distRows: (string | number)[][] = [
    ['No. Proyek', 'Nama Proyek', 'Jumlah Transaksi Keluar', 'Total Qty Disalurkan', 'Total Surat Jalan', 'Surat Jalan Selesai', 'Estimasi Nilai Material (Rp)'],
    ...opts.distributionRows.map((r) => [
      r.project_number,
      r.project_name,
      r.tx_count,
      r.qty_keluar,
      r.sj_count,
      r.sj_selesai,
      r.nilai_distribusi,
    ]),
  ];
  const wsDist = XLSX.utils.aoa_to_sheet(distRows);
  wsDist['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsDist, 'Distribusi Proyek');

  const opnameRows: (string | number)[][] = [
    ['No. Opname', 'Tanggal', 'Material', 'Gudang', 'Stok Sistem', 'Stok Fisik', 'Selisih', 'Satuan', 'Petugas', 'Kondisi', 'Alasan'],
    ...opts.opnames.map((o) => [
      o.opname_no,
      o.opname_date,
      resolveMaterialName(opts.materials, o.material_id),
      o.warehouse_name || '-',
      o.system_qty,
      o.physical_qty,
      o.variance_qty,
      o.unit,
      o.officer_name,
      o.condition_note,
      o.reason,
    ]),
  ];
  const wsOpname = XLSX.utils.aoa_to_sheet(opnameRows);
  wsOpname['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 24 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsOpname, 'Stok Opname');

  const sjRows: (string | number)[][] = [
    ['No. Surat Jalan', 'Tanggal Kirim', 'Proyek', 'Gudang Asal', 'Tujuan', 'Pengirim', 'Driver', 'Penerima Lapangan', 'Jumlah Item', 'Status'],
    ...opts.deliveryNotes.map((d) => [
      d.sj_number,
      d.delivery_date,
      `${d.project_number} - ${d.project_name}`,
      d.source_warehouse_name || '-',
      d.destination_location,
      d.sender_name,
      d.driver_name,
      d.recipient_name,
      d.items.length,
      d.status,
    ]),
  ];
  const wsSj = XLSX.utils.aoa_to_sheet(sjRows);
  wsSj['!cols'] = [{ wch: 20 }, { wch: 13 }, { wch: 32 }, { wch: 26 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSj, 'Pengiriman Surat Jalan');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Laporan-Logistik-PMS-${stamp}.xlsx`);
}

export function openLogistikPrintA4Window(opts: LogistikReportExportOptions): {
  ok: boolean;
  message?: string;
} {
  const printedAt = formatDateTimeID(new Date().toISOString());

  let tableHeadHtml = '';
  let tableBodyHtml = '';

  if (opts.reportCategory === 'persediaan') {
    tableHeadHtml = `<tr>
      <th>Kode</th><th>Nama Material</th><th>Kategori</th><th>Lokasi Gudang</th>
      <th class="num">Stok</th><th class="num">Min. Stok</th><th class="num">Harga Satuan</th><th class="num">Nilai Stok</th><th>Status</th>
    </tr>`;
    tableBodyHtml = opts.materials
      .map((m, idx) => {
        const qty = getWhStock(m, opts.selectedWarehouseId);
        const status = qty <= 0 ? 'Stok Habis' : qty <= m.min_stock ? 'Stok Minimum' : 'Stok Aman';
        const cls = qty <= 0 ? 'neg' : qty <= m.min_stock ? 'warn' : 'pos';
        return `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="mono">${escapeHtml(m.code)}</td>
          <td>${escapeHtml(m.name)}</td>
          <td>${escapeHtml(m.category)}</td>
          <td>${escapeHtml(m.warehouse_location)}</td>
          <td class="num mono">${escapeHtml(formatNumber(qty))} ${escapeHtml(m.unit)}</td>
          <td class="num mono">${escapeHtml(formatNumber(m.min_stock))} ${escapeHtml(m.unit)}</td>
          <td class="num mono">${escapeHtml(formatRupiah(m.unit_cost))}</td>
          <td class="num mono">${escapeHtml(formatRupiah(qty * m.unit_cost))}</td>
          <td class="${cls}">${escapeHtml(status)}</td>
        </tr>`;
      })
      .join('');
  } else if (opts.reportCategory === 'mutasi') {
    tableHeadHtml = `<tr>
      <th>Tanggal</th><th>Referensi</th><th>Jenis</th><th>Material</th><th class="num">Qty</th><th>Gudang</th><th>Proyek / Tujuan</th><th>Petugas</th>
    </tr>`;
    tableBodyHtml = opts.transactions
      .map((t, idx) => {
        const unit = resolveMaterialUnit(opts.materials, t.material_id);
        const cls = t.type === 'Masuk' ? 'pos' : t.type === 'Penyesuaian Opname' ? 'warn' : 'neg';
        return `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td>${escapeHtml(formatDateID(t.date))}</td>
          <td class="mono">${escapeHtml(t.reference_no)}</td>
          <td class="${cls}">${escapeHtml(t.type)}</td>
          <td>${escapeHtml(resolveMaterialName(opts.materials, t.material_id))}</td>
          <td class="num mono">${escapeHtml(formatNumber(t.qty))} ${escapeHtml(unit)}</td>
          <td>${escapeHtml(t.warehouse_name || '-')}</td>
          <td>${escapeHtml(t.project_id ? resolveProjectLabel(opts.projects, t.project_id) : t.source_or_destination || '-')}</td>
          <td>${escapeHtml(t.pic_name)}</td>
        </tr>`;
      })
      .join('');
  } else if (opts.reportCategory === 'distribusi') {
    tableHeadHtml = `<tr>
      <th>No. Proyek</th><th>Nama Proyek</th><th class="num">Transaksi Keluar</th><th class="num">Qty Disalurkan</th><th class="num">Total SJ</th><th class="num">SJ Selesai</th><th class="num">Estimasi Nilai</th>
    </tr>`;
    tableBodyHtml = opts.distributionRows
      .map(
        (r, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="mono">${escapeHtml(r.project_number)}</td>
          <td>${escapeHtml(r.project_name)}</td>
          <td class="num mono">${escapeHtml(formatNumber(r.tx_count))}</td>
          <td class="num mono">${escapeHtml(formatNumber(r.qty_keluar))}</td>
          <td class="num mono">${escapeHtml(formatNumber(r.sj_count))}</td>
          <td class="num mono pos">${escapeHtml(formatNumber(r.sj_selesai))}</td>
          <td class="num mono">${escapeHtml(formatRupiah(r.nilai_distribusi))}</td>
        </tr>`
      )
      .join('');
  } else if (opts.reportCategory === 'opname') {
    tableHeadHtml = `<tr>
      <th>No. Opname</th><th>Tanggal</th><th>Material</th><th>Gudang</th><th class="num">Sistem</th><th class="num">Fisik</th><th class="num">Selisih</th><th>Petugas</th><th>Alasan & Kondisi</th>
    </tr>`;
    tableBodyHtml = opts.opnames
      .map((o, idx) => {
        const cls = o.variance_qty === 0 ? 'pos' : o.variance_qty > 0 ? 'warn' : 'neg';
        return `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="mono">${escapeHtml(o.opname_no)}</td>
          <td>${escapeHtml(formatDateID(o.opname_date))}</td>
          <td>${escapeHtml(resolveMaterialName(opts.materials, o.material_id))}</td>
          <td>${escapeHtml(o.warehouse_name || '-')}</td>
          <td class="num mono">${escapeHtml(formatNumber(o.system_qty))} ${escapeHtml(o.unit)}</td>
          <td class="num mono">${escapeHtml(formatNumber(o.physical_qty))} ${escapeHtml(o.unit)}</td>
          <td class="num mono ${cls}">${o.variance_qty >= 0 ? '+' : ''}${escapeHtml(formatNumber(o.variance_qty))} ${escapeHtml(o.unit)}</td>
          <td>${escapeHtml(o.officer_name)}</td>
          <td>${escapeHtml(o.reason)} (${escapeHtml(o.condition_note)})</td>
        </tr>`;
      })
      .join('');
  } else {
    tableHeadHtml = `<tr>
      <th>No. SJ</th><th>Tanggal</th><th>Proyek Tujuan</th><th>Gudang Asal</th><th>Pengirim / Driver</th><th>Penerima</th><th class="num">Item</th><th>Status</th>
    </tr>`;
    tableBodyHtml = opts.deliveryNotes
      .map(
        (d, idx) => `<tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="mono">${escapeHtml(d.sj_number)}</td>
          <td>${escapeHtml(formatDateID(d.delivery_date))}</td>
          <td>${escapeHtml(d.project_number)} — ${escapeHtml(d.project_name)}</td>
          <td>${escapeHtml(d.source_warehouse_name || '-')}</td>
          <td>${escapeHtml(d.sender_name)} · ${escapeHtml(d.driver_name)}</td>
          <td>${escapeHtml(d.recipient_name)}</td>
          <td class="num mono">${d.items.length}</td>
          <td>${escapeHtml(d.status)}</td>
        </tr>`
      )
      .join('');
  }

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(opts.reportTitle)} — PT. Wilwa Abiyasa Sejahtera</title>
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
    .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-lbl { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .kpi-val { font-size: 11.5px; font-weight: 700; margin-top: 3px; font-family: ui-monospace, monospace; }
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
      <div style="font-weight:700;font-size:12.5px">Pratinjau Cetak A4 — ${escapeHtml(opts.reportTitle)}</div>
      <div style="font-size:11px;color:#cbd5e1">Proyek: ${escapeHtml(opts.projectLabel)} · Gudang: ${escapeHtml(opts.warehouseLabel)} · Periode: ${escapeHtml(opts.periodLabel)}</div>
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
          <div class="brand-tag">PT. WILWA ABIYASA SEJAHTERA — DIVISI LOGISTIK</div>
          <div class="title">${escapeHtml(opts.reportTitle.toUpperCase())}</div>
          <div class="sub">Proyek: ${escapeHtml(opts.projectLabel)} · Gudang: ${escapeHtml(opts.warehouseLabel)} · Periode: ${escapeHtml(opts.periodLabel)} · Jenis: ${escapeHtml(opts.txTypeLabel)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#cbd5e1">DISIAPKAN OLEH</div>
          <div style="font-weight:700;color:#FBC02D;font-size:12px">${escapeHtml(opts.preparedBy)}</div>
          <div class="sub">Dicetak: ${escapeHtml(printedAt)}</div>
        </div>
      </div>
      <div class="body">
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-lbl">Jenis Material</div><div class="kpi-val">${escapeHtml(formatNumber(opts.summary.totalMaterialJenis))} Item</div></div>
          <div class="kpi"><div class="kpi-lbl">Stok Tersedia</div><div class="kpi-val">${escapeHtml(formatNumber(opts.summary.totalStokUnit))} Unit</div></div>
          <div class="kpi"><div class="kpi-lbl">Stok Minimum</div><div class="kpi-val warn">${escapeHtml(formatNumber(opts.summary.totalStokMinimum))} Item</div></div>
          <div class="kpi"><div class="kpi-lbl">Nilai Persediaan</div><div class="kpi-val">${escapeHtml(formatRupiah(opts.summary.totalNilaiPersediaan, true))}</div></div>
          <div class="kpi"><div class="kpi-lbl">Barang Masuk</div><div class="kpi-val pos">${escapeHtml(formatNumber(opts.summary.totalMasukQty))} Unit</div></div>
          <div class="kpi"><div class="kpi-lbl">Barang Keluar</div><div class="kpi-val neg">${escapeHtml(formatNumber(opts.summary.totalKeluarQty))} Unit</div></div>
        </div>
        <table>
          <thead>${tableHeadHtml}</thead>
          <tbody>${tableBodyHtml || '<tr><td colspan="9" style="text-align:center;color:#64748b">Tidak ada data sesuai filter laporan.</td></tr>'}</tbody>
        </table>
        <div class="footer">
          <span>PT. Wilwa Abiyasa Sejahtera — PMS Konstruksi Modul Logistik</span>
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
    'pms_logistik_print_window',
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
