import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DeliveryNote } from '../types/pms';
import { formatDateID, formatDateTimeID, formatNumber } from './format';
import { downloadPdfBytes, validatePdfBytes } from './pdfUtils';

export function buildDeliveryNotePdfBytes(dn: DeliveryNote): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Corporate Navy + Gold Header
  doc.setFillColor(19, 35, 60);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(251, 192, 45);
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  doc.setTextColor(251, 192, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PT. WILWA ABIYASA SEJAHTERA — DIVISI LOGISTIK & GUDANG', 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('SURAT JALAN DIGITAL PENGIRIMAN MATERIAL', 14, 18);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const revLabel = dn.revision_no > 0 ? `  |  Revisi ke-${dn.revision_no}` : '';
  doc.text(`No. Dokumen: ${dn.sj_number}${revLabel}  |  Status: ${dn.status}`, 14, 24);

  // Two-column Metadata Block
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 34, pageWidth - 28, 42, 2, 2, 'FD');

  doc.setFontSize(8.2);
  const leftX = 18;
  const rightX = 108;
  const drawMeta = (x: number, y: number, label: string, val: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`${label}:`, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(val || '-', 54)[0] || '-', x + 31, y);
  };

  drawMeta(leftX, 41, 'No. Surat Jalan', dn.sj_number);
  drawMeta(leftX, 47, 'Tgl. Pengiriman', formatDateID(dn.delivery_date));
  drawMeta(leftX, 53, 'Gudang Asal', dn.source_warehouse_name || 'Gudang Utama PT. Wilwa, Depok');
  drawMeta(leftX, 59, 'Proyek Tujuan', `${dn.project_number} - ${dn.project_name}`);
  drawMeta(leftX, 65, 'Lokasi Tujuan', dn.destination_location);
  drawMeta(leftX, 71, 'SJ Supplier', dn.supplier_sj_no || '-');

  drawMeta(rightX, 41, 'Pengirim', `${dn.sender_name} (${dn.sender_position})`);
  drawMeta(rightX, 47, 'Penerima', `${dn.recipient_name} (${dn.recipient_position})`);
  drawMeta(rightX, 53, 'Kendaraan', dn.vehicle_info);
  drawMeta(rightX, 59, 'Pengemudi', dn.driver_phone ? `${dn.driver_name} (${dn.driver_phone})` : dn.driver_name);
  drawMeta(rightX, 65, 'Status Stok', dn.stock_deducted ? 'Terkurang Otomatis' : 'Belum Dikeluarkan');

  let startY = 82;
  if (dn.notes) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(`Keterangan: ${dn.notes}`, pageWidth - 28) as string[];
    doc.text(noteLines, 14, 82);
    startY = 82 + noteLines.length * 4 + 3;
  }

  // Items Table
  autoTable(doc, {
    startY,
    head: [['No', 'Kode', 'Nama Barang / Material', 'Qty Kirim', 'Satuan', 'Qty Terima', 'Kondisi', 'Catatan']],
    body: dn.items.map((item, idx) => [
      String(idx + 1),
      item.material_code,
      item.material_name,
      formatNumber(item.qty_sent),
      item.unit,
      dn.status === 'Selesai' ? formatNumber(item.qty_received) : '-',
      item.condition_status,
      item.notes || '-',
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
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
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 24 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 18 },
      6: { cellWidth: 26 },
    },
    margin: { left: 14, right: 14 },
  });

  // Position Signatures Section
  const tableEndY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 150;
  let sigY = tableEndY + 10;
  if (sigY + 62 > pageHeight - 16) {
    doc.addPage();
    sigY = 20;
  }

  const boxWidth = (pageWidth - 36) / 2;
  const renderSignatureBox = (
    x: number,
    title: string,
    sig?: DeliveryNote['sender_signature'],
    fallbackName?: string,
    fallbackPos?: string
  ) => {
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, sigY, boxWidth, 52, 2, 2, 'FD');

    doc.setFillColor(241, 245, 249);
    doc.rect(x, sigY, boxWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(19, 35, 60);
    doc.text(title, x + 4, sigY + 4.8);

    if (sig?.signature_data_url && sig.signature_data_url.startsWith('data:image/png')) {
      try {
        doc.addImage(sig.signature_data_url, 'PNG', x + 12, sigY + 9, boxWidth - 24, 22);
      } catch {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('[Tanda Tangan Digital Terverifikasi]', x + 6, sigY + 21);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(sig.signer_name, x + 4, sigY + 37);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text(sig.signer_position, x + 4, sigY + 41.5);
      doc.text(`Waktu: ${formatDateTimeID(sig.signed_at)}`, x + 4, sigY + 45.8);
      doc.text(`Hash: ${sig.signature_hash}`, x + 4, sigY + 49.8);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Belum Ditandatangani', x + boxWidth / 2, sigY + 22, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Pihak: ${fallbackName || '-'}`, x + 4, sigY + 41);
      doc.text(`Jabatan: ${fallbackPos || '-'}`, x + 4, sigY + 46);
    }
  };

  renderSignatureBox(
    14,
    'PENGIRIM (DIVISI LOGISTIK)',
    dn.sender_signature,
    dn.sender_name,
    dn.sender_position
  );
  renderSignatureBox(
    14 + boxWidth + 8,
    'PENERIMA (TIM LAPANGAN)',
    dn.recipient_signature,
    dn.recipient_name,
    dn.recipient_position
  );

  // Security / Lock / Cancellation Notice
  const footerInfoY = sigY + 58;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  if (dn.status === 'Dibatalkan') {
    doc.setTextColor(185, 28, 28);
    doc.text(
      `DOKUMEN DIBATALKAN oleh ${dn.cancelled_by_name || '-'} — Alasan: ${dn.cancel_reason || '-'}`,
      14,
      Math.min(footerInfoY, pageHeight - 14)
    );
  } else if (dn.is_locked) {
    doc.setTextColor(4, 120, 87);
    doc.text(
      'DOKUMEN TERKUNCI SECARA DIGITAL: Tanda tangan Pengirim & Penerima lengkap dan sah.',
      14,
      Math.min(footerInfoY, pageHeight - 14)
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PT. Wilwa Abiyasa Sejahtera — Surat Jalan Digital ${dn.sj_number} | Halaman ${i} dari ${pageCount}`,
      14,
      pageHeight - 8
    );
  }

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  validatePdfBytes(bytes);
  return bytes;
}

export function getDeliveryNotePdfFilename(sjNumber: string): string {
  const safe = sjNumber.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-');
  return `Surat-Jalan-${safe}.pdf`;
}

export function downloadDeliveryNotePdf(dn: DeliveryNote): Uint8Array {
  const bytes = buildDeliveryNotePdfBytes(dn);
  downloadPdfBytes(bytes, getDeliveryNotePdfFilename(dn.sj_number));
  return bytes;
}
