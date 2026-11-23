import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AttachmentMetadata } from '../types/attachment';
import {
  DocumentCategoryGroup,
  DocumentType,
  InternalDocument,
  ModuleKey,
  PMSState,
} from '../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from './format';
import { downloadBinaryFile, downloadPdfBytes, validatePdfBytes } from './pdfUtils';

export const DOC_CATEGORY_GROUPS: DocumentCategoryGroup[] = [
  'Surat Operasional',
  'Dokumen Proyek',
  'Surat Persetujuan',
  'Berita Acara',
  'Laporan Pekerjaan',
  'Surat Perusahaan',
];

export const DOC_TYPES_BY_CATEGORY: Record<DocumentCategoryGroup, DocumentType[]> = {
  'Surat Operasional': ['Surat Jalan', 'Surat Permintaan Material', 'Surat Permintaan Barang'],
  'Dokumen Proyek': ['RAB', 'Gambar Kerja', 'Spesifikasi Teknis', 'Dokumen Kontrak'],
  'Surat Persetujuan': ['Pengajuan Anggaran', 'Persetujuan Pekerjaan', 'Dokumen Persetujuan'],
  'Berita Acara': ['BAST', 'Berita Acara Pemeriksaan', 'Berita Acara'],
  'Laporan Pekerjaan': ['Laporan Progres', 'Laporan Penyelesaian', 'Laporan Pekerjaan'],
  'Surat Perusahaan': ['Surat Tugas', 'Surat Pemberitahuan'],
};

export const ALL_DOC_TYPES: DocumentType[] = DOC_CATEGORY_GROUPS.flatMap(
  (group) => DOC_TYPES_BY_CATEGORY[group]
);

export const DOC_TYPE_PREFIX_MAP: Record<DocumentType, string> = {
  'Surat Jalan': 'SJ',
  'Surat Permintaan Material': 'SPM',
  'Surat Permintaan Barang': 'SPB',
  RAB: 'RAB',
  'Gambar Kerja': 'GK',
  'Spesifikasi Teknis': 'SPK',
  'Dokumen Kontrak': 'KTR',
  'Pengajuan Anggaran': 'PA',
  'Persetujuan Pekerjaan': 'PP',
  'Dokumen Persetujuan': 'DP',
  BAST: 'BAST',
  'Berita Acara Pemeriksaan': 'BAP',
  'Berita Acara': 'BA',
  'Laporan Progres': 'LPR',
  'Laporan Penyelesaian': 'LPS',
  'Laporan Pekerjaan': 'LP',
  'Surat Tugas': 'ST',
  'Surat Pemberitahuan': 'SPB-P',
};

export const DOC_INFORMATIONAL_TYPES = new Set<DocumentType>([
  'RAB',
  'Gambar Kerja',
  'Spesifikasi Teknis',
  'Laporan Progres',
  'Laporan Penyelesaian',
  'Laporan Pekerjaan',
  'Surat Pemberitahuan',
]);

export function isApprovalRequiredDocType(docType: DocumentType): boolean {
  return !DOC_INFORMATIONAL_TYPES.has(docType);
}

export function getDocCategoryGroup(docType: string): DocumentCategoryGroup {
  for (const group of DOC_CATEGORY_GROUPS) {
    if (DOC_TYPES_BY_CATEGORY[group].includes(docType as DocumentType)) {
      return group;
    }
  }
  return 'Surat Perusahaan';
}

export interface DocTypeFormHint {
  recipientLabel: string;
  recipientPlaceholder: string;
  referenceLabel: string;
  referencePlaceholder: string;
  showAmount: boolean;
  amountLabel: string;
  detailsPlaceholder: string;
  itemsPlaceholder: string;
}

export function getDocTypeFormHint(docType: DocumentType): DocTypeFormHint {
  switch (docType) {
    case 'Surat Jalan':
      return {
        recipientLabel: 'Penerima / Lokasi Pengiriman',
        recipientPlaceholder: 'Contoh: Koordinator Lapangan Proyek X / Gudang Transit',
        referenceLabel: 'No. Referensi Pengiriman / Kendaraan',
        referencePlaceholder: 'Contoh: B 9124 KXA — Truk Engkel',
        showAmount: false,
        amountLabel: 'Nilai Muatan (Opsional)',
        detailsPlaceholder: 'Jelaskan tujuan pengiriman material/peralatan dan jadwal serah terima.',
        itemsPlaceholder: 'Contoh: Semen 100 Sak, Besi D13 50 Batang, Pipa PVC 20 Batang',
      };
    case 'Surat Permintaan Material':
    case 'Surat Permintaan Barang':
      return {
        recipientLabel: 'Ditujukan Kepada (Gudang / Pengadaan)',
        recipientPlaceholder: 'Contoh: Head Logistik & Gudang Sentral Depok',
        referenceLabel: 'Kode Kebutuhan / Paket Pekerjaan',
        referencePlaceholder: 'Contoh: Struktur Lantai 2 / Zona Barat',
        showAmount: true,
        amountLabel: 'Estimasi Nilai Pengadaan (Rp)',
        detailsPlaceholder: 'Jelaskan urgensi pengadaan material/barang serta jadwal penggunaan di lapangan.',
        itemsPlaceholder: 'Contoh: Pasir Beton 12 m3, Bata Ringan 8 m3, Kawat Bendrat 25 Kg',
      };
    case 'RAB':
    case 'Dokumen Kontrak':
    case 'Pengajuan Anggaran':
    case 'Dokumen Persetujuan':
      return {
        recipientLabel: 'Pihak Penyetuju / Rekanan',
        recipientPlaceholder: 'Contoh: Head Finance / Direktur Utama / Kontraktor Mitra',
        referenceLabel: 'Kode RAB / Nomor Kontrak Acuan',
        referencePlaceholder: 'Contoh: RAB-2026-01 atau KTR/WAS/2026/01',
        showAmount: true,
        amountLabel: 'Nilai Anggaran / Kontrak (Rp)',
        detailsPlaceholder: 'Uraikan dasar pengajuan anggaran, ruang lingkup biaya, dan rincian termin/paket.',
        itemsPlaceholder: 'Contoh: Pekerjaan Struktur Rp 350 Jt, MEP Rp 180 Jt, Finishing Rp 120 Jt',
      };
    case 'Gambar Kerja':
    case 'Spesifikasi Teknis':
      return {
        recipientLabel: 'Tim Pelaksana / Penerima Revisi Teknis',
        recipientPlaceholder: 'Contoh: Site Engineer & Mandor Struktur',
        referenceLabel: 'Kode Drawing / Revisi Gambar',
        referencePlaceholder: 'Contoh: DWG-STR-04 Rev.02',
        showAmount: false,
        amountLabel: 'Estimasi Biaya (Opsional)',
        detailsPlaceholder: 'Jelaskan ruang lingkup gambar kerja atau standar spesifikasi teknis yang berlaku.',
        itemsPlaceholder: 'Contoh: Denah Kolom K1-K4, Detail Tulangan Balok B2, Mutu Beton K-300',
      };
    case 'BAST':
    case 'Berita Acara Pemeriksaan':
    case 'Berita Acara':
      return {
        recipientLabel: 'Pihak Yang Melakukan Serah Terima / Diperiksa',
        recipientPlaceholder: 'Contoh: Owner Proyek / Perwakilan Klien / Subkontraktor',
        referenceLabel: 'Acuan Pekerjaan / Nomor SPK',
        referencePlaceholder: 'Contoh: Termin 3 — Penyelesaian Struktur & Atap 100%',
        showAmount: true,
        amountLabel: 'Nilai Bobot / Serah Terima (Rp, Opsional)',
        detailsPlaceholder: 'Catat hasil pemeriksaan fisik, kesesuaian mutu, serta catatan tindak lanjut.',
        itemsPlaceholder: 'Contoh: Instalasi Hydrant (Lulus Uji), Panel LVMDP (Baik), Finishing Fasad (98%)',
      };
    case 'Laporan Progres':
    case 'Laporan Penyelesaian':
    case 'Laporan Pekerjaan':
      return {
        recipientLabel: 'Ditujukan Kepada (Manajemen / Klien)',
        recipientPlaceholder: 'Contoh: Head Teknik & Project Manager',
        referenceLabel: 'Periode / Tahap Pelaporan',
        referencePlaceholder: 'Contoh: Minggu ke-4 November 2026 (Progres 78%)',
        showAmount: false,
        amountLabel: 'Nilai Terkait (Opsional)',
        detailsPlaceholder: 'Ringkas pencapaian pekerjaan, deviasi terhadap jadwal, serta kendala di lapangan.',
        itemsPlaceholder: 'Contoh: Pengecoran Slab Lt.3 100%, Pemasangan Dinding Bata 85%',
      };
    case 'Surat Tugas':
    case 'Surat Pemberitahuan':
    case 'Persetujuan Pekerjaan':
    default:
      return {
        recipientLabel: 'Penerima / Pejabat Terkait',
        recipientPlaceholder: 'Contoh: Seluruh Tim Lapangan / Kepala Divisi Terkait',
        referenceLabel: 'Nomor Memo / Referensi Internal',
        referencePlaceholder: 'Contoh: MEMO-DIR/XI/2026',
        showAmount: false,
        amountLabel: 'Nilai Nominal (Opsional)',
        detailsPlaceholder: 'Tuliskan isi surat resmi, instruksi kerja, atau pemberitahuan perusahaan secara lengkap.',
        itemsPlaceholder: 'Contoh: Penugasan Site Inspector, Jadwal Inspeksi K3, Lampiran SOP',
      };
  }
}

export function computeAutoDocNumberPreview(
  documents: InternalDocument[],
  docType: DocumentType,
  docDate?: string
): string {
  const prefix = DOC_TYPE_PREFIX_MAP[docType] || 'DOK';
  const parsedDate = docDate ? new Date(docDate) : new Date();
  const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = String(validDate.getFullYear());
  const month = String(validDate.getMonth() + 1).padStart(2, '0');
  const needle = `${prefix}/WAS/${year}/${month}/`;
  let maxSeq = 0;
  for (const d of documents) {
    if (d.doc_number.startsWith(needle)) {
      const part = Number.parseInt(d.doc_number.slice(needle.length), 10);
      if (Number.isFinite(part) && part > maxSeq) maxSeq = part;
    }
  }
  return `${needle}${String(maxSeq + 1).padStart(3, '0')}`;
}

export type UnifiedDocumentBucket = 'menunggu' | 'disetujui' | 'selesai' | 'draft' | 'revisi';

export function classifyDocumentBucket(status: string): UnifiedDocumentBucket {
  const s = (status || '').toLowerCase();
  if (s === 'draft') return 'draft';
  if (s.includes('revisi') || s.includes('ditolak') || s.includes('dibatalkan')) return 'revisi';
  if (
    s === 'disetujui' ||
    s === 'disetujui finance' ||
    s.includes('lulus uji')
  ) {
    return 'disetujui';
  }
  if (
    s === 'selesai' ||
    s === 'diarsipkan' ||
    s === 'dibayar' ||
    s === 'aktif' ||
    s === 'diterima gudang'
  ) {
    return 'selesai';
  }
  return 'menunggu';
}

export interface UnifiedDocumentRecord {
  id: string;
  doc_number: string;
  doc_type: string;
  category_group: DocumentCategoryGroup;
  title: string;
  details: string;
  items_summary: string;
  doc_date: string;
  project_id: string;
  project_label: string;
  creator_name: string;
  division_id: string;
  division_name: string;
  status: string;
  sourceType: 'internal' | 'integrated';
  sourceModule: string;
  originModuleKey: ModuleKey;
  recipient_name?: string;
  reference_code?: string;
  amount_value?: number;
  effective_date?: string;
  revision_no: number;
  approver_name?: string;
  approver_position?: string;
  approved_at?: string;
  digital_signature_hash?: string;
  electronic_signature_data_url?: string;
  internalDoc?: InternalDocument;
  linkedAttachments: AttachmentMetadata[];
  is_deleted?: boolean;
}

function resolveModuleDisplayLabel(moduleId: ModuleKey): {
  sourceModule: string;
  defaultCategory: DocumentCategoryGroup;
  defaultDocType: string;
} {
  switch (moduleId) {
    case 'proyek':
    case 'rab':
      return {
        sourceModule: 'Management Proyek',
        defaultCategory: 'Dokumen Proyek',
        defaultDocType: 'Dokumen Proyek',
      };
    case 'kontrak':
      return {
        sourceModule: 'Kontrak & Termin',
        defaultCategory: 'Dokumen Proyek',
        defaultDocType: 'Dokumen Kontrak',
      };
    case 'finance':
    case 'persetujuan':
      return {
        sourceModule: 'Finance & Persetujuan',
        defaultCategory: 'Surat Persetujuan',
        defaultDocType: 'Pengajuan Anggaran',
      };
    case 'teknik':
      return {
        sourceModule: 'Teknik & Lapangan',
        defaultCategory: 'Laporan Pekerjaan',
        defaultDocType: 'Laporan Pekerjaan',
      };
    case 'logistik':
    case 'gudang':
      return {
        sourceModule: 'Logistik & Gudang',
        defaultCategory: 'Surat Operasional',
        defaultDocType: 'Surat Operasional',
      };
    case 'aset':
      return {
        sourceModule: 'Aset Proyek',
        defaultCategory: 'Berita Acara',
        defaultDocType: 'Berita Acara',
      };
    case 'karyawan':
      return {
        sourceModule: 'SDM / Karyawan',
        defaultCategory: 'Surat Perusahaan',
        defaultDocType: 'Surat Tugas',
      };
    default:
      return {
        sourceModule: 'Arsip Dokumen Perusahaan',
        defaultCategory: 'Surat Perusahaan',
        defaultDocType: 'Surat Pemberitahuan',
      };
  }
}

function mapAttachmentCategoryToGroup(cat: string, fallback: DocumentCategoryGroup): DocumentCategoryGroup {
  const c = (cat || '').toLowerCase();
  if (c.includes('surat jalan') || c.includes('nota material')) return 'Surat Operasional';
  if (c.includes('gambar') || c.includes('rab') || c.includes('kontrak')) return 'Dokumen Proyek';
  if (c.includes('persetujuan') || c.includes('invoice') || c.includes('pembayaran')) return 'Surat Persetujuan';
  if (c.includes('berita acara') || c.includes('addendum')) return 'Berita Acara';
  if (c.includes('laporan') || c.includes('foto lapangan')) return 'Laporan Pekerjaan';
  return fallback;
}

export function buildUnifiedDocuments(params: {
  state: PMSState;
  attachments: AttachmentMetadata[];
}): UnifiedDocumentRecord[] {
  const { state, attachments } = params;
  const activeAttachments = attachments.filter((a) => a.status !== 'Diarsipkan');
  const claimedAttachmentIds = new Set<string>();

  const projectMap = new Map(state.projects.map((p) => [p.id, p]));
  const divisionMap = new Map(state.divisions.map((d) => [d.id, d]));
  const employeeMap = new Map(state.employees.map((e) => [e.id, e]));
  const materialMap = new Map(state.materials.map((m) => [m.id, m]));

  const resolveProjectLabel = (pid?: string) => {
    if (!pid) return 'Umum Perusahaan';
    const p = projectMap.get(pid);
    return p ? `${p.project_number} - ${p.name}` : pid;
  };
  const resolveDivisionName = (divId?: string) => {
    if (!divId) return 'Internal Perusahaan';
    return divisionMap.get(divId)?.name || divId;
  };
  const resolveEmployeeName = (empId?: string, fallback?: string) => {
    if (fallback) return fallback;
    if (!empId) return 'Sistem PMS';
    return employeeMap.get(empId)?.full_name || empId;
  };

  const claimMatchingAttachments = (
    predicate: (att: AttachmentMetadata) => boolean
  ): AttachmentMetadata[] => {
    const matched: AttachmentMetadata[] = [];
    for (const att of activeAttachments) {
      if (predicate(att)) {
        matched.push(att);
        claimedAttachmentIds.add(att.id);
      }
    }
    return matched;
  };

  const records: UnifiedDocumentRecord[] = [];

  // 1. Native Internal Documents (db.documents)
  for (const d of state.documents || []) {
    const matched = claimMatchingAttachments(
      (att) => att.module_id === 'dokumen' && att.entity_id === d.id
    );
    records.push({
      id: d.id,
      doc_number: d.doc_number,
      doc_type: d.doc_type,
      category_group: d.category_group || getDocCategoryGroup(d.doc_type),
      title: d.title,
      details: d.details,
      items_summary: d.items_summary || '-',
      doc_date: d.doc_date,
      project_id: d.project_id || '',
      project_label: resolveProjectLabel(d.project_id),
      creator_name: d.creator_name || resolveEmployeeName(d.creator_id),
      division_id: d.division_id,
      division_name: resolveDivisionName(d.division_id),
      status: d.status,
      sourceType: 'internal',
      sourceModule: 'Surat & Dokumen',
      originModuleKey: 'dokumen',
      recipient_name: d.recipient_name,
      reference_code: d.reference_code,
      amount_value: d.amount_value,
      effective_date: d.effective_date,
      revision_no: d.revision_no || 1,
      approver_name: d.approver_name || (d.approver_id ? resolveEmployeeName(d.approver_id) : undefined),
      approver_position: d.approver_position,
      approved_at: d.approved_at,
      digital_signature_hash: d.digital_signature_hash,
      electronic_signature_data_url: d.electronic_signature_data_url,
      internalDoc: d,
      linkedAttachments: matched,
      is_deleted: d.is_deleted,
    });
  }

  // 2. Logistik — Delivery Notes (Surat Jalan Digital)
  for (const dn of state.deliveryNotes || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        (att.module_id === 'logistik' || att.module_id === 'gudang') &&
        att.entity_id === dn.id
    );
    const itemsText =
      dn.items && dn.items.length > 0
        ? dn.items.map((it) => `${it.material_name} (${it.qty_sent} ${it.unit})`).join('; ')
        : '-';
    records.push({
      id: `int-dn-${dn.id}`,
      doc_number: dn.sj_number,
      doc_type: 'Surat Jalan',
      category_group: 'Surat Operasional',
      title: `Surat Jalan Pengiriman Material ke ${dn.destination_location || dn.project_name}`,
      details:
        dn.notes ||
        `Pengiriman material dari ${dn.source_warehouse_name || 'Gudang Sentral'} ke ${dn.destination_location}. Driver: ${dn.driver_name || '-'} (${dn.vehicle_info || '-'}).`,
      items_summary: itemsText,
      doc_date: dn.delivery_date,
      project_id: dn.project_id,
      project_label: dn.project_number ? `${dn.project_number} - ${dn.project_name}` : resolveProjectLabel(dn.project_id),
      creator_name: dn.sender_name,
      division_id: 'div-logistik',
      division_name: 'Logistik & Gudang',
      status: dn.status,
      sourceType: 'integrated',
      sourceModule: 'Logistik',
      originModuleKey: 'logistik',
      recipient_name: dn.recipient_name || dn.destination_location,
      reference_code: dn.supplier_sj_no || dn.vehicle_info,
      revision_no: dn.revision_no || 1,
      approver_name: dn.recipient_signature?.signer_name || dn.sender_signature?.signer_name,
      approved_at: dn.recipient_signature?.signed_at || dn.sender_signature?.signed_at,
      digital_signature_hash:
        dn.recipient_signature?.signature_hash || dn.sender_signature?.signature_hash,
      electronic_signature_data_url:
        dn.recipient_signature?.signature_data_url || dn.sender_signature?.signature_data_url,
      linkedAttachments: matched,
    });
  }

  // 3. Logistik — Material Requests (SPM)
  for (const mr of state.materialRequests || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        (att.module_id === 'logistik' || att.module_id === 'gudang') &&
        att.entity_id === mr.id
    );
    const itemsText =
      mr.items && mr.items.length > 0
        ? mr.items
            .map((it) => {
              const mat = materialMap.get(it.material_id);
              return `${mat ? mat.name : it.material_id} (${it.qty_requested} ${mat?.unit || 'Unit'})`;
            })
            .join('; ')
        : '-';
    records.push({
      id: `int-mr-${mr.id}`,
      doc_number: mr.request_number,
      doc_type: 'Surat Permintaan Material',
      category_group: 'Surat Operasional',
      title: `Permintaan Material Proyek (${mr.items.length} item)`,
      details: mr.notes || 'Pengajuan kebutuhan material lapangan menuju Gudang & Logistik.',
      items_summary: itemsText,
      doc_date: mr.request_date,
      project_id: mr.project_id,
      project_label: resolveProjectLabel(mr.project_id),
      creator_name: resolveEmployeeName(mr.requested_by_id),
      division_id: 'div-teknik',
      division_name: 'Teknik & Lapangan',
      status: mr.status,
      sourceType: 'integrated',
      sourceModule: 'Logistik',
      originModuleKey: 'logistik',
      recipient_name: 'Head Logistik & Gudang',
      effective_date: mr.needed_date,
      revision_no: 1,
      linkedAttachments: matched,
    });
  }

  // 4. Kontrak & Termin — Contracts & Addendums
  for (const c of state.contracts || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        (att.module_id === 'kontrak' || att.module_id === 'proyek') &&
        att.entity_id === c.id
    );
    records.push({
      id: `int-ktr-${c.id}`,
      doc_number: c.contract_number,
      doc_type: 'Dokumen Kontrak',
      category_group: 'Dokumen Proyek',
      title: c.work_name,
      details:
        c.contract_notes ||
        c.scope_description ||
        `Kontrak kerja sama dengan ${c.counterparty}. Periode ${c.start_date} s.d. ${c.end_date}.`,
      items_summary: `Pihak Mitra: ${c.counterparty} | Nilai Kontrak: ${formatRupiah(c.contract_value)}`,
      doc_date: c.contract_date || c.start_date,
      project_id: c.project_id,
      project_label: resolveProjectLabel(c.project_id),
      creator_name: c.pic_contract || 'Finance & Kontrak',
      division_id: 'div-finance',
      division_name: 'Finance & Kontrak',
      status: c.status,
      sourceType: 'integrated',
      sourceModule: 'Kontrak & Termin',
      originModuleKey: 'kontrak',
      recipient_name: c.counterparty,
      reference_code: c.document_ref,
      amount_value: c.contract_value,
      effective_date: c.end_date,
      revision_no: c.current_version || 1,
      approver_name: c.activated_by_name,
      approved_at: c.activated_at,
      linkedAttachments: matched,
    });
  }

  for (const add of state.contractAddendums || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        att.module_id === 'kontrak' &&
        (att.entity_id === add.id || add.attachment_ids?.includes(att.id))
    );
    const delta = (add.value_after || 0) - (add.value_before || 0);
    records.push({
      id: `int-add-${add.id}`,
      doc_number: add.addendum_number,
      doc_type: 'Berita Acara',
      category_group: 'Berita Acara',
      title: `Addendum Kontrak (${add.change_type}): ${add.reason}`,
      details: `Perubahan nilai kontrak sebesar ${formatRupiah(delta)}${add.end_date_after ? ` & penyesuaian akhir kontrak ke ${add.end_date_after}` : ''}.`,
      items_summary: `Nilai Kontrak Baru: ${formatRupiah(add.value_after)}`,
      doc_date: add.addendum_date,
      project_id: add.project_id,
      project_label: resolveProjectLabel(add.project_id),
      creator_name: add.approved_by_name,
      division_id: 'div-finance',
      division_name: 'Finance & Kontrak',
      status: 'Disetujui',
      sourceType: 'integrated',
      sourceModule: 'Kontrak & Termin',
      originModuleKey: 'kontrak',
      amount_value: delta,
      revision_no: 1,
      approver_name: add.approved_by_name,
      linkedAttachments: matched,
    });
  }

  // 5. Finance — Term Claims & Warehouse Procurement Orders
  for (const tc of state.termClaims || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        (att.module_id === 'finance' || att.module_id === 'kontrak') &&
        (att.entity_id === tc.id || tc.doc_attachment_ids?.includes(att.id))
    );
    records.push({
      id: `int-tc-${tc.id}`,
      doc_number: tc.claim_number,
      doc_type: 'Pengajuan Anggaran',
      category_group: 'Surat Persetujuan',
      title: `Klaim Termin Pembayaran (${tc.actual_progress}% Progres)`,
      details: tc.work_description || tc.notes || 'Pengajuan klaim pembayaran termin proyek untuk verifikasi Finance.',
      items_summary: `Nominal Klaim: ${formatRupiah(tc.claim_amount)} (Target ${tc.target_progress}%)`,
      doc_date: tc.claim_date,
      project_id: tc.project_id,
      project_label: resolveProjectLabel(tc.project_id),
      creator_name: tc.submitted_by_name,
      division_id: 'div-finance',
      division_name: 'Finance',
      status: tc.status,
      sourceType: 'integrated',
      sourceModule: 'Finance',
      originModuleKey: 'finance',
      amount_value: tc.claim_amount,
      revision_no: 1,
      approver_name: tc.decision_by_name,
      approved_at: tc.decision_at,
      linkedAttachments: matched,
    });
  }

  for (const wo of state.warehouseOrders || []) {
    const mat = materialMap.get(wo.material_id);
    const matched = claimMatchingAttachments(
      (att) =>
        (att.module_id === 'finance' || att.module_id === 'logistik' || att.module_id === 'gudang') &&
        (att.entity_id === wo.id || Boolean(wo.proof_attachment_ids?.includes(att.id)))
    );
    records.push({
      id: `int-wo-${wo.id}`,
      doc_number: wo.order_no,
      doc_type: 'Pengajuan Anggaran',
      category_group: 'Surat Persetujuan',
      title: `Order Pengadaan Gudang: ${mat ? mat.name : wo.material_id}`,
      details: wo.notes || `Pengadaan dari ${wo.source_name}. Qty rencana ${wo.qty_planned} ${wo.unit}.`,
      items_summary: `${mat ? mat.name : wo.material_id} (${wo.qty_planned} ${wo.unit}) — ${formatRupiah(wo.total_cost)}`,
      doc_date: wo.order_date,
      project_id: wo.project_id || '',
      project_label: resolveProjectLabel(wo.project_id),
      creator_name: wo.requested_by_name,
      division_id: 'div-logistik',
      division_name: 'Logistik & Finance',
      status: wo.status,
      sourceType: 'integrated',
      sourceModule: 'Finance',
      originModuleKey: 'finance',
      recipient_name: wo.source_name,
      reference_code: wo.proof_ref,
      amount_value: wo.total_cost,
      revision_no: 1,
      approver_name: wo.finance_approved_by_name,
      approved_at: wo.finance_approved_at,
      linkedAttachments: matched,
    });
  }

  // 6. Teknik — Evaluations, Technical Changes, Completions (RBAC already enforced server-side)
  for (const ev of state.teknikEvaluations || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        att.module_id === 'teknik' &&
        (att.entity_id === ev.id || ev.attachment_ids?.includes(att.id))
    );
    records.push({
      id: `int-ev-${ev.id}`,
      doc_number: ev.eval_no,
      doc_type: 'Berita Acara Pemeriksaan',
      category_group: 'Berita Acara',
      title: `Evaluasi Teknis: ${ev.work_package}`,
      details: `${ev.non_conformance_findings || 'Pemeriksaan kesesuaian gambar kerja & spesifikasi teknis.'} Rekomendasi: ${ev.recommendation || '-'}`,
      items_summary: `Kesesuaian: ${ev.drawing_spec_compliance} | Tindak Lanjut: ${ev.follow_up_action || '-'}`,
      doc_date: ev.evaluation_date,
      project_id: ev.project_id,
      project_label: resolveProjectLabel(ev.project_id),
      creator_name: ev.evaluator_name,
      division_id: 'div-teknik',
      division_name: 'Teknik',
      status: ev.status,
      sourceType: 'integrated',
      sourceModule: 'Teknik',
      originModuleKey: 'teknik',
      revision_no: 1,
      linkedAttachments: matched,
    });
  }

  for (const ch of state.teknikChanges || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        att.module_id === 'teknik' &&
        (att.entity_id === ch.id || ch.attachment_ids?.includes(att.id))
    );
    records.push({
      id: `int-ch-${ch.id}`,
      doc_number: ch.change_no,
      doc_type: 'Persetujuan Pekerjaan',
      category_group: 'Surat Persetujuan',
      title: `Perubahan Pekerjaan (${ch.change_category})`,
      details: `${ch.scope_change}. Alasan: ${ch.reason}. Catatan Teknis: ${ch.technical_notes || '-'}`,
      items_summary: ch.volume_material_change || '-',
      doc_date: ch.change_date,
      project_id: ch.project_id,
      project_label: resolveProjectLabel(ch.project_id),
      creator_name: ch.requested_by_name,
      division_id: 'div-teknik',
      division_name: 'Teknik',
      status: ch.status,
      sourceType: 'integrated',
      sourceModule: 'Teknik',
      originModuleKey: 'teknik',
      revision_no: 1,
      approver_name: ch.reviewer_name,
      approved_at: ch.reviewed_at,
      linkedAttachments: matched,
    });
  }

  for (const cmp of state.teknikCompletions || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        att.module_id === 'teknik' &&
        (att.entity_id === cmp.id || cmp.attachment_ids?.includes(att.id))
    );
    records.push({
      id: `int-cmp-${cmp.id}`,
      doc_number: cmp.completion_no,
      doc_type: 'Laporan Penyelesaian',
      category_group: 'Laporan Pekerjaan',
      title: `Penyelesaian Teknis: ${cmp.inspection_result}`,
      details: cmp.completed_work_summary,
      items_summary: cmp.defects_and_notes || '-',
      doc_date: cmp.inspection_date,
      project_id: cmp.project_id,
      project_label: resolveProjectLabel(cmp.project_id),
      creator_name: cmp.inspector_name,
      division_id: 'div-teknik',
      division_name: 'Teknik',
      status: cmp.status,
      sourceType: 'integrated',
      sourceModule: 'Teknik',
      originModuleKey: 'teknik',
      revision_no: 1,
      approver_name: cmp.verified_by_name,
      approved_at: cmp.verified_at,
      linkedAttachments: matched,
    });
  }

  // 7. Tim Lapangan — Workflow Field Reports
  for (const wf of state.workflows || []) {
    for (const fr of wf.field_reports || []) {
      const matched = claimMatchingAttachments(
        (att) =>
          (att.module_id === 'teknik' || att.module_id === 'proyek') &&
          (fr.attachment_ids?.includes(att.id) || att.entity_id === fr.id)
      );
      records.push({
        id: `int-fr-${fr.id}`,
        doc_number: `LAP-FLD/${fr.reported_at.slice(0, 10).replace(/-/g, '')}/${fr.id.slice(-4).toUpperCase()}`,
        doc_type: 'Laporan Progres',
        category_group: 'Laporan Pekerjaan',
        title: `Laporan Lapangan (${fr.progress_percent}%): ${fr.work_summary.slice(0, 64)}`,
        details: `${fr.work_summary}${fr.constraints && fr.constraints !== '-' ? ` | Kendala: ${fr.constraints}` : ''}${fr.follow_up && fr.follow_up !== '-' ? ` | Tindak Lanjut: ${fr.follow_up}` : ''}`,
        items_summary: `Progres Lapangan: ${fr.progress_percent}% | Biaya Harian: ${formatRupiah(fr.expense_amount || 0)}`,
        doc_date: fr.reported_at.slice(0, 10),
        project_id: fr.project_id,
        project_label: resolveProjectLabel(fr.project_id),
        creator_name: fr.reported_by_name,
        division_id: 'div-teknik',
        division_name: 'Tim Lapangan',
        status: 'Selesai',
        sourceType: 'integrated',
        sourceModule: 'Tim Lapangan',
        originModuleKey: 'proyek',
        amount_value: fr.expense_amount || undefined,
        revision_no: 1,
        linkedAttachments: matched,
      });
    }
  }

  // 8. Aset Proyek — Laporan Kerusakan/Kehilangan Aset
  for (const par of state.projectAssetReports || []) {
    const matched = claimMatchingAttachments(
      (att) =>
        att.module_id === 'aset' &&
        (att.entity_id === par.id || att.id === par.photo_attachment_id)
    );
    records.push({
      id: `int-par-${par.id}`,
      doc_number: par.report_no,
      doc_type: 'Berita Acara',
      category_group: 'Berita Acara',
      title: `Berita Acara Aset ${par.report_type}: ${par.asset_name} (${par.affected_qty} Unit)`,
      details: par.chronology,
      items_summary: `${par.asset_code} — ${par.asset_name} (${par.affected_qty} Unit ${par.report_type})`,
      doc_date: par.incident_date,
      project_id: par.project_id,
      project_label: resolveProjectLabel(par.project_id),
      creator_name: par.reported_by_name,
      division_id: 'div-teknik',
      division_name: 'Tim Lapangan',
      status: par.status,
      sourceType: 'integrated',
      sourceModule: 'Aset Proyek',
      originModuleKey: 'aset',
      revision_no: 1,
      approver_name: par.reviewed_by_name,
      approved_at: par.reviewed_at,
      linkedAttachments: matched,
    });
  }

  // 9. Any standalone module attachment files uploaded directly across PMS (Proyek, RAB, Kontrak, Finance, Teknik, Logistik, Gudang, Arsip Umum)
  const groupedLeftovers = new Map<string, AttachmentMetadata[]>();
  for (const att of activeAttachments) {
    if (claimedAttachmentIds.has(att.id)) continue;
    const key = `${att.module_id}::${att.entity_id}`;
    const list = groupedLeftovers.get(key) || [];
    list.push(att);
    groupedLeftovers.set(key, list);
  }

  for (const [, files] of groupedLeftovers.entries()) {
    const first = files[0];
    const modMeta = resolveModuleDisplayLabel(first.module_id);
    const catGroup = mapAttachmentCategoryToGroup(first.doc_category, modMeta.defaultCategory);
    const matchedProj = state.projects.find((p) => p.id === first.entity_id);
    records.push({
      id: `int-att-${first.id}`,
      doc_number: `ARSIP/${first.module_id.toUpperCase()}/${first.uploaded_at.slice(0, 7).replace('-', '/')}/${first.id.slice(-4).toUpperCase()}`,
      doc_type: first.doc_category || modMeta.defaultDocType,
      category_group: catGroup,
      title: first.entity_label || first.original_name,
      details:
        first.description ||
        `Dokumen / lampiran digital terunggah pada modul ${modMeta.sourceModule} (${files.length} berkas).`,
      items_summary: files.map((f) => `${f.original_name} (v${f.version})`).join('; '),
      doc_date: first.uploaded_at.slice(0, 10),
      project_id: matchedProj ? matchedProj.id : '',
      project_label: matchedProj ? `${matchedProj.project_number} - ${matchedProj.name}` : first.entity_label || 'Arsip Lintas Modul',
      creator_name: first.uploaded_by_name,
      division_id: first.division_id,
      division_name: resolveDivisionName(first.division_id),
      status: first.status === 'Diarsipkan' ? 'Diarsipkan' : 'Selesai',
      sourceType: 'integrated',
      sourceModule: modMeta.sourceModule,
      originModuleKey: first.module_id === 'dokumen' ? 'dokumen' : first.module_id,
      revision_no: first.version || 1,
      linkedAttachments: files,
    });
  }

  return records.sort((a, b) => (b.doc_date || '').localeCompare(a.doc_date || ''));
}

// =========================================================================
// OFFICIAL A4 PDF GENERATION FOR ANY UNIFIED DOCUMENT
// =========================================================================

export function generateOfficialDocumentPdfBytes(record: UnifiedDocumentRecord): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Kop Surat Header
  doc.setFillColor(19, 35, 60);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(251, 192, 45);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(251, 192, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI', margin, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(record.doc_type.toUpperCase(), margin, 18.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `No: ${record.doc_number}  |  Rev. v${record.revision_no}  |  Status: ${record.status}`,
    margin,
    24.5
  );

  // Document Metadata Box
  let y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(record.title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 5.5 + 3;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [19, 35, 60], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 52 },
      2: { cellWidth: 36, fontStyle: 'bold', fillColor: [248, 250, 252] },
      3: { cellWidth: 50 },
    },
    body: [
      ['Nomor Dokumen', record.doc_number, 'Tanggal Dokumen', formatDateID(record.doc_date)],
      ['Kategori', record.category_group, 'Sumber Modul', record.sourceModule],
      ['Proyek Terkait', record.project_label, 'Status', record.status],
      ['Pembuat', record.creator_name, 'Divisi', record.division_name],
      ...(record.recipient_name || record.reference_code
        ? [
            [
              'Tujuan / Penerima',
              record.recipient_name || '-',
              'Referensi / Kode',
              record.reference_code || '-',
            ],
          ]
        : []),
      ...(record.amount_value && record.amount_value > 0
        ? [['Nilai Nominal', formatRupiah(record.amount_value), 'Revisi Ke', `v${record.revision_no}`]]
        : []),
    ],
    margin: { left: margin, right: margin },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 36) + 8;

  // Section 1: Uraian / Isi Dokumen
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(19, 35, 60);
  doc.text('URAIAN / ISI DOKUMEN RESMI', margin, y);
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const detailLines = doc.splitTextToSize(record.details || '-', contentWidth);
  doc.text(detailLines, margin, y);
  y += detailLines.length * 4.5 + 6;

  // Section 2: Rincian Item / Lampiran
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(19, 35, 60);
  doc.text('RINCIAN ITEM, PEKERJAAN & LAMPIRAN', margin, y);
  y += 2;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const itemLines = doc.splitTextToSize(record.items_summary || '-', contentWidth);
  doc.text(itemLines, margin, y);
  y += itemLines.length * 4.5 + 4;

  if (record.linkedAttachments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Lampiran Berkas Terkait (${record.linkedAttachments.length} file):`, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    for (const att of record.linkedAttachments.slice(0, 8)) {
      doc.text(`• ${att.original_name} (${att.doc_category}, v${att.version})`, margin + 2, y);
      y += 4;
    }
    y += 3;
  }

  // Signature & Verification Block
  if (y > 225) {
    doc.addPage();
    y = 20;
  }

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 42, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('DIBUAT / DIAJUKAN OLEH:', margin + 5, y + 7);
  doc.text('PENGESAHAN & TANDA TANGAN ELEKTRONIK:', margin + contentWidth / 2 + 4, y + 7);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(record.creator_name, margin + 5, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Divisi ${record.division_name}`, margin + 5, y + 30);
  doc.text(`Tanggal: ${formatDateID(record.doc_date)}`, margin + 5, y + 35);

  const rightX = margin + contentWidth / 2 + 4;
  if (
    record.electronic_signature_data_url &&
    record.electronic_signature_data_url.startsWith('data:image/png;base64,')
  ) {
    try {
      doc.addImage(record.electronic_signature_data_url, 'PNG', rightX, y + 9, 36, 13);
    } catch {
      // ignore malformed image fallback
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(record.approver_name || '(Menunggu / Tanpa Otorisasi)', rightX, y + 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  if (record.approver_position) {
    doc.text(record.approver_position, rightX, y + 30.5);
  }
  if (record.digital_signature_hash) {
    doc.setTextColor(29, 122, 252);
    doc.text(`E-Sign Hash: ${record.digital_signature_hash}`, rightX, y + 36);
  }

  y += 49;

  // Approval / History log table if internal doc
  const history = record.internalDoc?.history || [];
  if (history.length > 0 && y < 255) {
    autoTable(doc, {
      startY: y,
      head: [['Waktu', 'Pelaku', 'Jabatan', 'Aksi', 'Catatan']],
      body: history.slice(-8).map((h) => [
        formatDateTimeID(h.timestamp),
        h.actor_name,
        h.role_label,
        h.action,
        h.note,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255] },
      margin: { left: margin, right: margin },
    });
  }

  const rawBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(rawBuffer);
  validatePdfBytes(bytes);
  return bytes;
}

// =========================================================================
// DIRECT STANDALONE PRINT WINDOW (NON-IFRAME-BLOCKED)
// =========================================================================

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openOfficialDocumentPrintWindow(record: UnifiedDocumentRecord): boolean {
  const historyRows = (record.internalDoc?.history || [])
    .map(
      (h) => `
      <tr>
        <td>${escapeHtml(formatDateTimeID(h.timestamp))}</td>
        <td>${escapeHtml(h.actor_name)} (${escapeHtml(h.role_label)})</td>
        <td><strong>${escapeHtml(h.action)}</strong></td>
        <td>${escapeHtml(h.note)}</td>
      </tr>`
    )
    .join('');

  const sigImgHtml =
    record.electronic_signature_data_url &&
    record.electronic_signature_data_url.startsWith('data:image/png;base64,')
      ? `<img src="${record.electronic_signature_data_url}" alt="Tanda Tangan Elektronik" style="height:56px;max-width:180px;object-fit:contain;margin:6px 0;" />`
      : `<div style="height:52px;display:flex;align-items:center;font-size:11px;color:#64748b;">${
          record.digital_signature_hash ? 'Disahkan secara digital' : '(Belum ditandatangani)'
        }</div>`;

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Cetak Dokumen — ${escapeHtml(record.doc_number)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.5; }
    .kop { background: #13233C; color: #fff; padding: 14px 18px; border-bottom: 4px solid #FBC02D; display: flex; justify-content: space-between; align-items: center; }
    .kop small { color: #FBC02D; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; display: block; }
    .kop h1 { margin: 3px 0 0; font-size: 16px; }
    .badge { border: 1px solid rgba(255,255,255,0.35); padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; text-align: right; }
    .title { font-size: 15px; font-weight: 700; margin: 14px 0 10px; color: #13233C; }
    table.meta { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    table.meta td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    table.meta td.lbl { width: 19%; background: #f8fafc; font-weight: 700; color: #334155; }
    .section { margin-bottom: 14px; }
    .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #13233C; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 0 0 6px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; page-break-inside: avoid; }
    .sig-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #fff; }
    .sig-hash { font-family: monospace; font-size: 10px; color: #1D7AFC; margin-top: 4px; word-break: break-all; }
    table.hist { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 14px; }
    table.hist th, table.hist td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
    table.hist th { background: #13233C; color: #fff; }
  </style>
</head>
<body>
  <div class="kop">
    <div>
      <small>PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI</small>
      <h1>${escapeHtml(record.doc_type.toUpperCase())}</h1>
    </div>
    <div class="badge">
      <div>${escapeHtml(record.doc_number)}</div>
      <div>Revisi v${record.revision_no} · ${escapeHtml(record.status)}</div>
    </div>
  </div>
  <div class="title">${escapeHtml(record.title)}</div>
  <table class="meta">
    <tr>
      <td class="lbl">Kategori</td><td>${escapeHtml(record.category_group)}</td>
      <td class="lbl">Tanggal</td><td>${escapeHtml(formatDateID(record.doc_date))}</td>
    </tr>
    <tr>
      <td class="lbl">Proyek Terkait</td><td>${escapeHtml(record.project_label)}</td>
      <td class="lbl">Sumber Modul</td><td>${escapeHtml(record.sourceModule)}</td>
    </tr>
    <tr>
      <td class="lbl">Pembuat</td><td>${escapeHtml(record.creator_name)}</td>
      <td class="lbl">Divisi</td><td>${escapeHtml(record.division_name)}</td>
    </tr>
    ${
      record.recipient_name || record.reference_code
        ? `<tr><td class="lbl">Tujuan / Pihak</td><td>${escapeHtml(record.recipient_name || '-')}</td><td class="lbl">Referensi</td><td>${escapeHtml(record.reference_code || '-')}</td></tr>`
        : ''
    }
    ${
      record.amount_value && record.amount_value > 0
        ? `<tr><td class="lbl">Nilai Nominal</td><td colspan="3"><strong>${escapeHtml(formatRupiah(record.amount_value))}</strong></td></tr>`
        : ''
    }
  </table>
  <div class="section">
    <h2>Uraian / Isi Dokumen</h2>
    <div class="box">${escapeHtml(record.details)}</div>
  </div>
  <div class="section">
    <h2>Rincian Item, Pekerjaan & Lampiran</h2>
    <div class="box">${escapeHtml(record.items_summary || '-')}</div>
  </div>
  ${
    record.linkedAttachments.length > 0
      ? `<div class="section"><h2>Berkas Lampiran (${record.linkedAttachments.length})</h2><div class="box">${record.linkedAttachments
          .map((a) => `• ${escapeHtml(a.original_name)} (${escapeHtml(a.doc_category)}, v${a.version})`)
          .join('\n')}</div></div>`
      : ''
  }
  <div class="sig-grid">
    <div class="sig-card">
      <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;">Dibuat / Diajukan Oleh</div>
      <div style="height:52px;"></div>
      <div style="font-weight:700;font-size:12px;">${escapeHtml(record.creator_name)}</div>
      <div style="color:#475569;">Divisi ${escapeHtml(record.division_name)}</div>
      <div style="color:#64748b;font-size:10px;">Tanggal: ${escapeHtml(formatDateID(record.doc_date))}</div>
    </div>
    <div class="sig-card">
      <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;">Pengesahan & Tanda Tangan Elektronik</div>
      ${sigImgHtml}
      <div style="font-weight:700;font-size:12px;">${escapeHtml(record.approver_name || 'Menunggu Pengesahan Pejabat Berwenang')}</div>
      ${record.approver_position ? `<div style="color:#475569;">${escapeHtml(record.approver_position)}</div>` : ''}
      ${record.digital_signature_hash ? `<div class="sig-hash">Hash: ${escapeHtml(record.digital_signature_hash)}</div>` : ''}
    </div>
  </div>
  ${
    historyRows
      ? `<table class="hist"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Catatan</th></tr></thead><tbody>${historyRows}</tbody></table>`
      : ''
  }
</body>
</html>`;

  const w = window.open('', 'pms_dokumen_print_window', 'width=900,height=780');
  if (!w) {
    window.print();
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      // ignore if user cancelled
    }
  }, 300);
  return true;
}

// =========================================================================
// REKAP EXPORT PDF, EXCEL (.xlsx), PRINT A4 & BUNDLE ZIP
// =========================================================================

export interface DokumenReportExportMeta {
  periodLabel: string;
  categoryLabel: string;
  projectLabel: string;
  statusLabel: string;
  preparedBy: string;
}

export function exportDokumenReportPdf(
  records: UnifiedDocumentRecord[],
  meta: DokumenReportExportMeta
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(19, 35, 60);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setTextColor(251, 192, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PT. WILWA ABIYASA SEJAHTERA — PUSAT SURAT & DOKUMEN PMS', 14, 9);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('LAPORAN ARSIP & REKAP DOKUMEN TERINTEGRASI', 14, 17);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Kategori: ${meta.categoryLabel}  |  Proyek: ${meta.projectLabel}  |  Status: ${meta.statusLabel}  |  Periode: ${meta.periodLabel}  |  Petugas: ${meta.preparedBy}`,
    14,
    30
  );

  autoTable(doc, {
    startY: 34,
    head: [
      [
        'No. Dokumen',
        'Kategori',
        'Jenis',
        'Judul Dokumen',
        'Proyek Terkait',
        'Pembuat & Divisi',
        'Sumber',
        'Tanggal',
        'Status',
      ],
    ],
    body: records.map((r) => [
      r.doc_number,
      r.category_group,
      r.doc_type,
      r.title,
      r.project_label,
      `${r.creator_name} (${r.division_name})`,
      r.sourceModule,
      formatDateID(r.doc_date),
      r.status,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.2 },
    headStyles: { fillColor: [19, 35, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  downloadPdfBytes(bytes, `Laporan-Dokumen-PMS-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportDokumenReportExcel(
  records: UnifiedDocumentRecord[],
  meta: DokumenReportExportMeta
): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ['PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI'],
    ['LAPORAN ARSIP & REKAP SURAT DOKUMEN'],
    ['Kategori Filter', meta.categoryLabel],
    ['Proyek Filter', meta.projectLabel],
    ['Status Filter', meta.statusLabel],
    ['Periode Filter', meta.periodLabel],
    ['Dicetak Oleh', meta.preparedBy],
    ['Total Dokumen', records.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  const detailRows = records.map((r, idx) => ({
    No: idx + 1,
    'Nomor Dokumen': r.doc_number,
    Kategori: r.category_group,
    'Jenis Dokumen': r.doc_type,
    'Judul Dokumen': r.title,
    'Proyek Terkait': r.project_label,
    Pembuat: r.creator_name,
    Divisi: r.division_name,
    'Sumber Modul': r.sourceModule,
    Tanggal: r.doc_date,
    Status: r.status,
    Revisi: `v${r.revision_no}`,
    'Jumlah Lampiran': r.linkedAttachments.length,
    'Nominal (Rp)': r.amount_value || 0,
    'Disahkan Oleh': r.approver_name || '-',
    'Hash Tanda Tangan': r.digital_signature_hash || '-',
  }));
  const wsData = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'Daftar Dokumen');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBinaryFile(
    new Uint8Array(out),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `Rekap-Dokumen-PMS-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export function openDokumenReportPrintA4Window(
  records: UnifiedDocumentRecord[],
  meta: DokumenReportExportMeta
): void {
  const rowsHtml = records
    .map(
      (r, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(r.doc_number)}</td>
        <td>${escapeHtml(r.category_group)}<br/><small style="color:#475569;">${escapeHtml(r.doc_type)}</small></td>
        <td><strong>${escapeHtml(r.title)}</strong></td>
        <td>${escapeHtml(r.project_label)}</td>
        <td>${escapeHtml(r.creator_name)}<br/><small style="color:#475569;">${escapeHtml(r.division_name)}</small></td>
        <td>${escapeHtml(r.sourceModule)}</td>
        <td>${escapeHtml(formatDateID(r.doc_date))}</td>
        <td><strong>${escapeHtml(r.status)}</strong></td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Rekap Surat & Dokumen PMS</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10px; margin: 0; }
    .hdr { background: #13233C; color: #fff; padding: 12px 16px; border-bottom: 3px solid #FBC02D; }
    .hdr small { color: #FBC02D; font-weight: 700; display: block; font-size: 9px; }
    .hdr h1 { margin: 2px 0 0; font-size: 14px; }
    .meta { margin: 8px 0 12px; color: #475569; font-size: 9.5px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; color: #13233C; font-weight: 700; }
  </style>
</head>
<body>
  <div class="hdr">
    <small>PT. WILWA ABIYASA SEJAHTERA — PMS KONSTRUKSI</small>
    <h1>REKAPITULASI SURAT & DOKUMEN PERUSAHAAN (${records.length} Dokumen)</h1>
  </div>
  <div class="meta">
    Kategori: ${escapeHtml(meta.categoryLabel)} | Proyek: ${escapeHtml(meta.projectLabel)} | Status: ${escapeHtml(meta.statusLabel)} | Periode: ${escapeHtml(meta.periodLabel)} | Petugas: ${escapeHtml(meta.preparedBy)}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px;">No</th>
        <th>Nomor Dokumen</th>
        <th>Kategori & Jenis</th>
        <th>Judul Dokumen</th>
        <th>Proyek Terkait</th>
        <th>Pembuat & Divisi</th>
        <th>Sumber</th>
        <th>Tanggal</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  const w = window.open('', 'pms_rekap_dokumen_print', 'width=1050,height=720');
  if (!w) {
    window.print();
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      // ignore
    }
  }, 300);
}

// =========================================================================
// UNCOMPRESSED ZIP ARCHIVE BUILDER (OFFICIAL PDF + ORIGINAL ATTACHMENTS)
// =========================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZipUint8Array(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const usedNames = new Set<string>();

  for (const entry of entries) {
    let safeName = entry.name.replace(/[/\\]+/g, '_');
    if (usedNames.has(safeName)) {
      safeName = `${usedNames.size}_${safeName}`;
    }
    usedNames.add(safeName);

    const nameBytes = encoder.encode(safeName);
    const data = entry.data;
    const sum = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

export function downloadDocumentBundleZip(
  zipFileName: string,
  entries: { name: string; data: Uint8Array }[]
): void {
  const bytes = buildZipUint8Array(entries);
  downloadBinaryFile(bytes, 'application/zip', zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`);
}
