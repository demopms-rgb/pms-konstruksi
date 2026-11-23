import React from 'react';
import { DeliveryNote } from '../../types/pms';
import { formatDateID, formatDateTimeID, formatNumber } from '../../utils/format';

export interface DeliveryNotePrintValidation {
  valid: boolean;
  missingFields: string[];
  message: string;
}

export function validateDeliveryNoteForPrint(
  dn: DeliveryNote | null | undefined
): DeliveryNotePrintValidation {
  if (!dn) {
    return {
      valid: false,
      missingFields: ['Dokumen Surat Jalan'],
      message: 'Data Surat Jalan belum dipilih atau belum tersimpan.',
    };
  }
  if (dn.is_deleted) {
    return {
      valid: false,
      missingFields: ['Dokumen Aktif'],
      message: 'Surat Jalan ini sudah dihapus dan tidak dapat dicetak.',
    };
  }

  const missing: string[] = [];
  if (!dn.id || !String(dn.sj_number || '').trim()) missing.push('Nomor Surat Jalan');
  if (!String(dn.delivery_date || '').trim()) missing.push('Tanggal Pengiriman');
  if (!String(dn.source_warehouse_name || dn.source_warehouse_id || '').trim()) {
    missing.push('Lokasi Gudang Asal');
  }
  if (!String(dn.project_number || '').trim() && !String(dn.project_name || '').trim()) {
    missing.push('Proyek Tujuan');
  }
  if (!String(dn.destination_location || '').trim()) missing.push('Lokasi Tujuan');
  if (!String(dn.sender_name || '').trim()) missing.push('Pengirim');
  if (!String(dn.recipient_name || '').trim()) missing.push('Penerima');
  if (!String(dn.vehicle_info || '').trim()) missing.push('Kendaraan');
  if (!String(dn.driver_name || '').trim()) missing.push('Pengemudi');
  if (!Array.isArray(dn.items) || dn.items.length === 0) {
    missing.push('Daftar Barang (minimal 1 item)');
  } else if (
    dn.items.some(
      (it) => !String(it.material_name || '').trim() || !Number.isFinite(it.qty_sent) || it.qty_sent <= 0
    )
  ) {
    missing.push('Rincian & Jumlah Barang yang Valid');
  }

  if (missing.length > 0) {
    return {
      valid: false,
      missingFields: missing,
      message: `Surat Jalan belum dapat dicetak karena data belum lengkap: ${missing.join(', ')}.`,
    };
  }

  return { valid: true, missingFields: [], message: '' };
}

function escapeHtmlTitle(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildStandaloneSuratJalanPrintHtml(
  portalInnerHtml: string,
  sjNumber: string
): string {
  const safeTitle = escapeHtmlTitle(`Cetak Surat Jalan — ${sjNumber}`);
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      color: #0f172a;
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      height: auto;
    }
    .sj-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: #13233C;
      color: #ffffff;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 3px solid #FBC02D;
    }
    .sj-toolbar-title {
      font-size: 12.5px;
      font-weight: 700;
    }
    .sj-toolbar-sub {
      font-size: 11px;
      color: #cbd5e1;
      margin-top: 2px;
    }
    .sj-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sj-btn {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      font-size: 12px;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
    }
    .sj-btn-primary {
      border-color: #FBC02D;
      background: #FBC02D;
      color: #13233C;
    }
    .sj-sheet-wrap {
      padding: 16px;
      display: flex;
      justify-content: center;
    }
    .sj-a4-page {
      width: 100%;
      max-width: 190mm;
      background: #ffffff;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.12);
      border-radius: 8px;
      overflow: hidden;
    }
    .sj-doc {
      width: 100%;
      background: #ffffff;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.45;
    }
    .sj-header {
      background: #13233C;
      color: #ffffff;
      padding: 16px 20px;
      border-bottom: 4px solid #FBC02D;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .sj-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .sj-logo-box {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: #1D304D;
      border: 1px solid rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sj-company-name {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #FBC02D;
    }
    .sj-doc-title {
      margin: 2px 0 0;
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }
    .sj-doc-subtitle {
      margin: 2px 0 0;
      font-size: 10px;
      color: #cbd5e1;
    }
    .sj-header-right {
      text-align: right;
      flex-shrink: 0;
    }
    .sj-number-label {
      margin: 0;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #cbd5e1;
    }
    .sj-number-val {
      margin: 2px 0 0;
      font-size: 14px;
      font-weight: 700;
      font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #FBC02D;
    }
    .sj-date-val {
      margin: 2px 0 0;
      font-size: 10px;
      color: #e2e8f0;
    }
    .sj-body {
      border-left: 1px solid #cbd5e1;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
      padding: 18px 20px;
    }
    .sj-body > * + * {
      margin-top: 14px;
    }
    .sj-cancel-box {
      border-radius: 6px;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      padding: 10px 14px;
      font-size: 10.5px;
      color: #991b1b;
    }
    .sj-cancel-box p { margin: 0; }
    .sj-cancel-box p + p { margin-top: 3px; }
    .sj-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 10.5px;
    }
    .sj-meta-col > * + * {
      margin-top: 5px;
    }
    .sj-meta-row {
      display: grid;
      grid-template-columns: 112px 1fr;
      gap: 6px;
      align-items: start;
    }
    .sj-meta-label {
      color: #475569;
      font-weight: 500;
    }
    .sj-meta-val {
      color: #0f172a;
      font-weight: 600;
      word-break: break-word;
    }
    .sj-mono {
      font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .sj-notes-box {
      border-radius: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px 14px;
      font-size: 10.5px;
      color: #1e293b;
    }
    .sj-table-wrap {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }
    .sj-print-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 10.5px;
    }
    .sj-print-table thead {
      display: table-header-group;
    }
    .sj-print-table thead tr {
      background: #13233C;
      color: #ffffff;
    }
    .sj-print-table th {
      padding: 8px 9px;
      font-weight: 600;
      border-bottom: 1px solid #cbd5e1;
    }
    .sj-print-table td {
      padding: 7px 9px;
      border-top: 1px solid #cbd5e1;
      vertical-align: top;
      color: #0f172a;
    }
    .sj-print-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .sj-print-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sj-text-center { text-align: center; }
    .sj-text-right { text-align: right; }
    .sj-sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding-top: 2px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sj-sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sj-sig-head {
      padding: 7px 12px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      font-weight: 700;
      color: #13233C;
    }
    .sj-sig-badge-ok {
      font-size: 9.5px;
      font-weight: 700;
      color: #047857;
    }
    .sj-sig-badge-wait {
      font-size: 9.5px;
      font-weight: 600;
      color: #64748b;
    }
    .sj-sig-canvas {
      padding: 10px 14px;
      min-height: 98px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
    }
    .sj-sig-img {
      max-height: 78px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .sj-sig-empty {
      font-size: 11px;
      font-style: italic;
      color: #94a3b8;
    }
    .sj-sig-foot {
      padding: 8px 12px;
      background: #f8fafc;
      border-top: 1px solid #cbd5e1;
      font-size: 10px;
      line-height: 1.35;
    }
    .sj-sig-foot p { margin: 0; }
    .sj-sig-foot p + p { margin-top: 2px; }
    .sj-sig-name { font-weight: 700; color: #0f172a; }
    .sj-sig-pos { color: #334155; }
    .sj-sig-time { font-size: 9.2px; color: #475569; font-family: "IBM Plex Mono", ui-monospace, monospace; }
    .sj-footer {
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 9.5px;
      color: #64748b;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sj-print-avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        height: auto !important;
        overflow: visible !important;
      }
      .no-print {
        display: none !important;
      }
      .sj-sheet-wrap {
        padding: 0 !important;
        display: block !important;
      }
      .sj-a4-page {
        max-width: none !important;
        width: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="sj-toolbar no-print">
    <div>
      <div class="sj-toolbar-title">Dokumen Cetak Surat Jalan Digital — ${escapeHtmlTitle(sjNumber)}</div>
      <div class="sj-toolbar-sub">Format A4 siap cetak atau simpan sebagai PDF melalui dialog cetak Chrome.</div>
    </div>
    <div class="sj-toolbar-actions">
      <button type="button" class="sj-btn sj-btn-primary" onclick="window.print()">Cetak / Simpan PDF</button>
      <button type="button" class="sj-btn" onclick="window.close()">Tutup</button>
    </div>
  </div>
  <div class="sj-sheet-wrap">
    <div class="sj-a4-page">
      ${portalInnerHtml}
    </div>
  </div>
  <script>
    (function () {
      var printed = false;
      function launchPrint() {
        if (printed) return;
        printed = true;
        try {
          window.focus();
          window.print();
        } catch (e) {}
      }
      window.addEventListener('afterprint', function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.focus();
          }
        } catch (e) {}
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 120);
      });
      function waitImagesAndPrint() {
        var imgs = Array.prototype.slice.call(document.images || []);
        if (imgs.length === 0) {
          requestAnimationFrame(function () { requestAnimationFrame(launchPrint); });
          return;
        }
        var pendingCount = imgs.length;
        var finished = 0;
        var timer = setTimeout(launchPrint, 400);
        function markReady() {
          finished += 1;
          if (finished >= pendingCount) {
            clearTimeout(timer);
            requestAnimationFrame(function () { requestAnimationFrame(launchPrint); });
          }
        }
        imgs.forEach(function (img) {
          if (img.complete) {
            if (typeof img.decode === 'function') {
              img.decode().then(markReady, markReady);
            } else {
              markReady();
            }
            return;
          }
          img.addEventListener('load', function () {
            if (typeof img.decode === 'function') {
              img.decode().then(markReady, markReady);
            } else {
              markReady();
            }
          }, { once: true });
          img.addEventListener('error', markReady, { once: true });
        });
      }
      if (document.readyState === 'complete') {
        waitImagesAndPrint();
      } else {
        window.addEventListener('load', waitImagesAndPrint, { once: true });
      }
    })();
  </script>
</body>
</html>`;
}

export const SuratJalanPrintDocument: React.FC<{ dn: DeliveryNote }> = ({ dn }) => {
  const printedAt = new Date().toISOString();

  const renderSignatureColumn = (
    title: string,
    sig: DeliveryNote['sender_signature'] | undefined,
    fallbackName: string,
    fallbackPosition: string
  ) => (
    <div className="sj-sig-box border border-slate-300 rounded-lg overflow-hidden bg-white flex flex-col justify-between sj-print-avoid-break">
      <div className="sj-sig-head px-3.5 py-2 bg-slate-100 border-b border-slate-300 flex items-center justify-between text-[11px] font-bold text-[#13233C]">
        <span>{title}</span>
        {sig ? (
          <span className="sj-sig-badge-ok text-[10px] font-bold text-emerald-700">
            TERVERIFIKASI DIGITAL
          </span>
        ) : (
          <span className="sj-sig-badge-wait text-[10px] font-medium text-slate-500">
            MENUNGGU TTD
          </span>
        )}
      </div>
      <div className="sj-sig-canvas px-4 py-3 min-h-[108px] flex flex-col items-center justify-center bg-white">
        {sig?.signature_data_url ? (
          <img
            src={sig.signature_data_url}
            alt={`Tanda tangan ${sig.signer_name}`}
            loading="eager"
            decoding="sync"
            className="sj-sig-img max-h-[82px] w-auto object-contain block"
          />
        ) : (
          <div className="sj-sig-empty text-center text-[11px] italic text-slate-400 py-4">
            Belum Ditandatangani
          </div>
        )}
      </div>
      <div className="sj-sig-foot px-3.5 py-2 bg-slate-50 border-t border-slate-300 text-[10.5px] leading-snug space-y-0.5">
        <p className="sj-sig-name font-bold text-slate-900">{sig?.signer_name || fallbackName || '-'}</p>
        <p className="sj-sig-pos text-slate-700">{sig?.signer_position || fallbackPosition || '-'}</p>
        {sig ? (
          <p className="sj-sig-time font-mono text-[9.5px] text-slate-600 tabular-nums">
            Waktu TTD: {formatDateTimeID(sig.signed_at)} · Hash: {sig.signature_hash}
          </p>
        ) : (
          <p className="sj-sig-time text-[9.5px] text-slate-400">
            Menunggu otorisasi tanda tangan digital
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="sj-doc w-full mx-auto bg-white text-slate-900 text-[11px] leading-relaxed">
      {/* Corporate Header with Inline SVG Emblem */}
      <div className="sj-header bg-[#13233C] text-white px-5 py-4 border-b-4 border-[#FBC02D] rounded-t-lg flex items-center justify-between gap-4">
        <div className="sj-brand flex items-center gap-3.5 min-w-0">
          <div className="sj-logo-box w-11 h-11 rounded-lg bg-[#1D304D] border border-white/15 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 48 48"
              width="32"
              height="32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8"
              aria-hidden="true"
            >
              <path d="M8 38V18L14 14V38H8Z" fill="#FBBF24" />
              <path d="M17 38V10L24 6V38H17Z" fill="#F59E0B" />
              <path d="M27 38V14L33 18V38H27Z" fill="#FBBF24" />
              <path d="M36 38V23L41 26V38H36Z" fill="#FCD34D" />
              <rect x="5" y="38" width="38" height="3" rx="1.5" fill="#FBBF24" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="sj-company-name text-[10px] font-bold tracking-wider text-[#FBC02D] uppercase">
              PT. WILWA ABIYASA SEJAHTERA — DIVISI LOGISTIK & GUDANG
            </p>
            <h1 className="sj-doc-title text-base font-extrabold tracking-tight text-white mt-0.5">
              SURAT JALAN DIGITAL PENGIRIMAN MATERIAL
            </h1>
            <p className="sj-doc-subtitle text-[10px] text-slate-300 mt-0.5">
              Dokumen Resmi Pengiriman Material Gudang & Proyek Konstruksi · Status: {dn.status}
              {dn.revision_no > 0 ? ` · Revisi ke-${dn.revision_no}` : ''}
            </p>
          </div>
        </div>
        <div className="sj-header-right text-right shrink-0">
          <p className="sj-number-label text-[9.5px] uppercase tracking-wider text-slate-300">
            Nomor Surat Jalan
          </p>
          <p className="sj-number-val text-sm font-mono font-bold text-[#FBC02D] mt-0.5">
            {dn.sj_number}
          </p>
          <p className="sj-date-val text-[10px] text-slate-200 mt-0.5 tabular-nums">
            Tgl: {formatDateID(dn.delivery_date)}
          </p>
        </div>
      </div>

      <div className="sj-body border-x border-b border-slate-300 rounded-b-lg p-5 space-y-4">
        {/* Cancellation Notice */}
        {dn.status === 'Dibatalkan' && (
          <div className="sj-cancel-box rounded-md bg-red-50 border border-red-300 px-3.5 py-2.5 text-[10.5px] text-red-800 sj-print-avoid-break">
            <p className="font-bold">
              DOKUMEN DIBATALKAN oleh {dn.cancelled_by_name || '-'} pada{' '}
              {dn.cancelled_at ? formatDateTimeID(dn.cancelled_at) : '-'}
            </p>
            <p className="mt-0.5">Alasan: {dn.cancel_reason || '-'}</p>
          </div>
        )}

        {/* Complete Metadata Grid */}
        <div className="sj-meta-grid grid grid-cols-2 gap-4 bg-slate-50 border border-slate-300 rounded-md p-3.5 text-[10.5px] sj-print-avoid-break">
          <div className="sj-meta-col space-y-1.5">
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">No. Surat Jalan</span>
              <span className="sj-meta-val sj-mono font-mono font-bold text-slate-900">
                : {dn.sj_number}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Tanggal Pengiriman</span>
              <span className="sj-meta-val font-semibold text-slate-900 tabular-nums">
                : {formatDateID(dn.delivery_date)}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Gudang Asal</span>
              <span className="sj-meta-val font-semibold text-[#13233C]">
                : {dn.source_warehouse_name || 'Gudang Utama PT. Wilwa, Depok'}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Proyek Tujuan</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.project_number} — {dn.project_name}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Lokasi Tujuan</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.destination_location}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[115px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">No. SJ Supplier</span>
              <span className="sj-meta-val sj-mono font-mono text-slate-800">
                : {dn.supplier_sj_no || '-'}
              </span>
            </div>
          </div>

          <div className="sj-meta-col space-y-1.5">
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Pengirim</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.sender_name} ({dn.sender_position})
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Penerima</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.recipient_name} ({dn.recipient_position})
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Kendaraan</span>
              <span className="sj-meta-val sj-mono font-mono font-semibold text-slate-900">
                : {dn.vehicle_info}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Pengemudi</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.driver_name}
                {dn.driver_phone ? ` (${dn.driver_phone})` : ''}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Status Stok</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                :{' '}
                {dn.stock_deducted
                  ? dn.stock_restored
                    ? 'Dikembalikan ke Gudang'
                    : 'Terkurang Otomatis dari Gudang'
                  : 'Belum Dikeluarkan'}
              </span>
            </div>
            <div className="sj-meta-row grid grid-cols-[110px_1fr] gap-1.5">
              <span className="sj-meta-label text-slate-600 font-medium">Status Dokumen</span>
              <span className="sj-meta-val font-semibold text-slate-900">
                : {dn.status}
                {dn.is_locked ? ' (Terkunci Digital)' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {dn.notes && (
          <div className="sj-notes-box rounded-md bg-slate-50 border border-slate-300 px-3.5 py-2 text-[10.5px] text-slate-800 sj-print-avoid-break">
            <span className="font-bold text-slate-900">Keterangan: </span>
            <span>{dn.notes}</span>
          </div>
        )}

        {/* Complete Items Table */}
        <div className="sj-table-wrap border border-slate-300 rounded-md overflow-visible">
          <table className="w-full border-collapse text-left text-[10.5px] sj-print-table">
            <thead>
              <tr className="bg-[#13233C] text-white">
                <th className="sj-text-center py-2 px-2.5 font-semibold text-center border-b border-slate-300 w-9">
                  No
                </th>
                <th className="py-2 px-2.5 font-semibold border-b border-slate-300 w-24">Kode</th>
                <th className="py-2 px-2.5 font-semibold border-b border-slate-300">
                  Nama Barang / Material
                </th>
                <th className="sj-text-right py-2 px-2.5 font-semibold text-right border-b border-slate-300 w-20">
                  Qty Kirim
                </th>
                <th className="sj-text-center py-2 px-2.5 font-semibold text-center border-b border-slate-300 w-16">
                  Satuan
                </th>
                <th className="sj-text-right py-2 px-2.5 font-semibold text-right border-b border-slate-300 w-20">
                  Qty Terima
                </th>
                <th className="py-2 px-2.5 font-semibold border-b border-slate-300 w-24">Kondisi</th>
                <th className="py-2 px-2.5 font-semibold border-b border-slate-300">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {dn.items.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                  <td className="sj-text-center py-2 px-2.5 text-center font-mono text-slate-600 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="sj-mono py-2 px-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                    {item.material_code}
                  </td>
                  <td className="py-2 px-2.5 font-semibold text-slate-900">{item.material_name}</td>
                  <td className="sj-text-right sj-mono py-2 px-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                    {formatNumber(item.qty_sent)}
                  </td>
                  <td className="sj-text-center py-2 px-2.5 text-center text-slate-700">{item.unit}</td>
                  <td className="sj-text-right sj-mono py-2 px-2.5 text-right font-mono font-bold text-emerald-800 tabular-nums">
                    {dn.status === 'Selesai' ? formatNumber(item.qty_received) : '-'}
                  </td>
                  <td className="py-2 px-2.5 text-slate-800">{item.condition_status}</td>
                  <td className="py-2 px-2.5 text-slate-600">{item.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Digital Signatures Side by Side */}
        <div className="sj-sig-grid grid grid-cols-2 gap-4 pt-1 sj-print-avoid-break">
          {renderSignatureColumn(
            'TANDA TANGAN PENGIRIM (DIVISI LOGISTIK)',
            dn.sender_signature,
            dn.sender_name,
            dn.sender_position
          )}
          {renderSignatureColumn(
            'TANDA TANGAN PENERIMA (TIM LAPANGAN)',
            dn.recipient_signature,
            dn.recipient_name,
            dn.recipient_position
          )}
        </div>

        {/* Footer Integrity Strip */}
        <div className="sj-footer pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-[9.5px] text-slate-500 sj-print-avoid-break">
          <span>
            PT. Wilwa Abiyasa Sejahtera — Surat Jalan Digital {dn.sj_number}
            {dn.is_locked ? ' · Dokumen Sah & Terkunci Digital' : ''}
          </span>
          <span className="sj-mono font-mono tabular-nums">Dicetak: {formatDateTimeID(printedAt)}</span>
        </div>
      </div>
    </div>
  );
};
