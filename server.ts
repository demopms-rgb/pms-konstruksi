import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DEMO_SEED_VERSION, INITIAL_PMS_DATA } from './src/data/seedData.ts';
import type {
  ActivityLog,
  AddendumChangeType,
  AppNotification,
  ApprovalRecord,
  BudgetItem,
  Contract,
  ContractAddendum,
  ContractTerm,
  DeliveryItemCondition,
  DeliveryNote,
  DeliveryNoteHistoryEntry,
  DeliveryNoteItem,
  DeliveryNoteStatus,
  DocumentCategoryGroup,
  DocumentHistoryItem,
  DocumentRevisionSnapshot,
  DocumentStatus,
  DocumentType,
  FinanceBill,
  FinanceBillCategory,
  FinanceBillStatus,
  FinancialCategory,
  FinancialTransaction,
  FinancialTxStatus,
  InternalDocument,
  Material,
  MaterialRequest,
  MaterialRequestStatus,
  MaterialTransaction,
  PMSState,
  Project,
  ProjectAsset,
  ProjectAssetCondition,
  ProjectAssetHistory,
  ProjectAssetReport,
  ProjectAssetReportStatus,
  ProjectAssetReportType,
  ProjectWorkflow,
  StockOpnameRecord,
  TeknikChangeReport,
  TeknikChangeStatus,
  TeknikCompletionInspectionResult,
  TeknikCompletionReport,
  TeknikCompletionStatus,
  TeknikConformanceStatus,
  TeknikConstraintRecord,
  TeknikEvaluationReport,
  TeknikFollowUpStatus,
  TeknikProgressAssessment,
  TermClaim,
  TermPayment,
  WarehouseAuditEntry,
  WarehouseLocation,
  WarehouseStockOrder,
  WorkItem,
  WorkflowFieldReport,
  WorkflowHistoryEntry,
  WorkflowMaterialNeed,
  WorkflowProcurement,
  WorkflowStage,
} from './src/types/pms.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const STORAGE_ROOT = path.resolve(__dirname, 'storage');
const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
const DB_FILE = path.join(STORAGE_ROOT, 'attachments-db.json');
const CONFIG_FILE = path.join(STORAGE_ROOT, 'upload-config.json');
const AUDIT_FILE = path.join(STORAGE_ROOT, 'file-audit-logs.json');
const OPERATIONAL_DB_FILE = path.join(STORAGE_ROOT, 'pms-operational-db.json');
const SIGNING_SECRET =
  process.env.FILE_SIGNING_SECRET ||
  crypto.createHash('sha256').update(`pms-konstruksi-${STORAGE_ROOT}`).digest('hex');

const MASTER_ALLOWED_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
];

const ALLOWED_MIME_MAP: Record<string, string[]> = {
  pdf: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
  jpg: ['image/jpeg', 'image/pjpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/pjpeg', 'image/jpg'],
  png: ['image/png', 'image/x-png'],
  webp: ['image/webp'],
  doc: ['application/msword', 'application/octet-stream', 'application/x-cfb', ''],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    '',
  ],
  xls: ['application/vnd.ms-excel', 'application/octet-stream', 'application/x-cfb', ''],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    '',
  ],
  ppt: ['application/vnd.ms-powerpoint', 'application/octet-stream', 'application/x-cfb', ''],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    '',
  ],
  zip: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', 'application/octet-stream'],
};

function resolveAttachmentExt(originalName: string, mimeType?: string): string {
  let ext = path.extname(originalName || '').replace('.', '').toLowerCase();
  if (ext === 'jfif') ext = 'jpg';
  if (!ext && mimeType) {
    const m = mimeType.toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('pdf')) return 'pdf';
  }
  return ext;
}

function getCanonicalMimeType(ext: string, fallbackMime?: string): string {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'application/pdf';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'doc') return 'application/msword';
  if (e === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (e === 'xls') return 'application/vnd.ms-excel';
  if (e === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (e === 'ppt') return 'application/vnd.ms-powerpoint';
  if (e === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (e === 'zip') return 'application/zip';
  return fallbackMime && fallbackMime !== 'application/octet-stream' ? fallbackMime : 'application/octet-stream';
}

function isAllowedUploadMime(ext: string, rawMime: string): boolean {
  const m = (rawMime || '').toLowerCase();
  const allowed = ALLOWED_MIME_MAP[ext] || [];
  if (allowed.includes(m)) return true;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return m.startsWith('image/') || m === 'application/octet-stream' || m === '';
  }
  return false;
}

const SENSITIVE_MODULES = new Set(['karyawan', 'kontrak', 'finance']);

interface ActorContext {
  employeeId: string;
  nik: string;
  roleCode: 'SUPER_ADMIN' | 'HEAD' | 'STAFF';
  divisionCode: 'TEKNIK' | 'LOGISTIK' | 'FINANCE' | 'DIREKSI';
  divisionId: string;
  fullName: string;
}

interface UploadConfig {
  maxFileSizeMb: number;
  maxFilesPerBatch: number;
  allowedExtensions: string[];
  requireDescription: boolean;
  updatedAt: string;
  updatedBy: string;
}

interface AttachmentVersion {
  version: number;
  original_name: string;
  storage_name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  uploaded_at: string;
  note: string;
}

interface AttachmentRecord {
  id: string;
  original_name: string;
  storage_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  module_id: string;
  entity_id: string;
  entity_label?: string;
  doc_category: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  division_id: string;
  uploaded_at: string;
  description: string;
  status: 'Aktif' | 'Diarsipkan';
  deleted_at?: string;
  deleted_by_id?: string;
  deleted_by_name?: string;
  delete_reason?: string;
  is_sensitive: boolean;
  is_demo?: boolean;
  version: number;
  versions: AttachmentVersion[];
}

interface FileAuditLog {
  id: string;
  timestamp: string;
  action:
    | 'UPLOAD'
    | 'NEW_VERSION'
    | 'PREVIEW'
    | 'DOWNLOAD'
    | 'UPDATE_META'
    | 'ARCHIVE'
    | 'RESTORE'
    | 'DELETE'
    | 'CONFIG_UPDATE';
  attachment_id?: string;
  file_name: string;
  module_id: string;
  entity_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_division: string;
  detail: string;
}

function ensureStorageDirs() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch {
    // ignore parse error and use fallback
  }
  return fallback;
}

function writeJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function getDefaultConfig(): UploadConfig {
  return {
    maxFileSizeMb: 15,
    maxFilesPerBatch: 10,
    allowedExtensions: [...MASTER_ALLOWED_EXTENSIONS],
    requireDescription: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistem Default',
  };
}

function buildMinimalPdfBuffer(title: string, bodyLine: string): Buffer {
  const safeTitle = title.replace(/[()\\]/g, '');
  const safeBody = bodyLine.replace(/[()\\]/g, '');
  const stream = `BT /F1 14 Tf 50 760 Td (${safeTitle}) Tj /F1 10 Tf 0 -24 Td (${safeBody}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf-8')} >> stream\n${stream}\nendstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf-8');
}

function initializeSeedStorage() {
  ensureStorageDirs();

  if (!fs.existsSync(CONFIG_FILE)) {
    writeJson(CONFIG_FILE, getDefaultConfig());
  }

  if (!fs.existsSync(AUDIT_FILE)) {
    writeJson(AUDIT_FILE, []);
  }

  const buildWilwaSeedAttachments = (): AttachmentRecord[] => {
    const seeded: AttachmentRecord[] = [];
    const now = new Date().toISOString();

    const copyAssetIfExists = (
      srcRel: string,
      originalName: string,
      moduleId: string,
      entityId: string,
      entityLabel: string,
      docCategory: string,
      description: string,
      divisionId: string
    ) => {
      const srcPath = path.resolve(__dirname, srcRel);
      if (!fs.existsSync(srcPath)) return;
      const ext = path.extname(originalName).replace('.', '').toLowerCase();
      const storageName = `seed-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const destPath = path.join(UPLOADS_DIR, storageName);
      fs.copyFileSync(srcPath, destPath);
      const stats = fs.statSync(destPath);
      seeded.push({
        id: `att-${crypto.randomUUID()}`,
        original_name: originalName,
        storage_name: storageName,
        extension: ext,
        mime_type: 'image/jpeg',
        size_bytes: stats.size,
        storage_path: `storage/uploads/${storageName}`,
        module_id: moduleId,
        entity_id: entityId,
        entity_label: entityLabel,
        doc_category: docCategory,
        uploaded_by_id: 'emp-03',
        uploaded_by_name: 'Rizky Pratama, S.T.',
        division_id: divisionId,
        uploaded_at: now,
        description,
        status: 'Aktif',
        is_sensitive: false,
        is_demo: true,
        version: 1,
        versions: [
          {
            version: 1,
            original_name: originalName,
            storage_name: storageName,
            size_bytes: stats.size,
            mime_type: 'image/jpeg',
            uploaded_by_id: 'emp-03',
            uploaded_by_name: 'Rizky Pratama, S.T.',
            uploaded_at: now,
            note: 'Dokumentasi awal proyek bangunan',
          },
        ],
      });
    };

    const seedPdf = (
      originalName: string,
      title: string,
      body: string,
      moduleId: string,
      entityId: string,
      entityLabel: string,
      docCategory: string,
      description: string,
      divisionId: string,
      isSensitive: boolean
    ) => {
      const storageName = `seed-${Date.now()}-${crypto.randomUUID()}.pdf`;
      const destPath = path.join(UPLOADS_DIR, storageName);
      const buf = buildMinimalPdfBuffer(title, body);
      fs.writeFileSync(destPath, buf);
      seeded.push({
        id: `att-${crypto.randomUUID()}`,
        original_name: originalName,
        storage_name: storageName,
        extension: 'pdf',
        mime_type: 'application/pdf',
        size_bytes: buf.length,
        storage_path: `storage/uploads/${storageName}`,
        module_id: moduleId,
        entity_id: entityId,
        entity_label: entityLabel,
        doc_category: docCategory,
        uploaded_by_id: 'emp-02',
        uploaded_by_name: 'Ir. Bambang Sutrisno',
        division_id: divisionId,
        uploaded_at: now,
        description,
        status: 'Aktif',
        is_sensitive: isSensitive,
        is_demo: true,
        version: 1,
        versions: [
          {
            version: 1,
            original_name: originalName,
            storage_name: storageName,
            size_bytes: buf.length,
            mime_type: 'application/pdf',
            uploaded_by_id: 'emp-02',
            uploaded_by_name: 'Ir. Bambang Sutrisno',
            uploaded_at: now,
            note: 'Dokumen awal proyek',
          },
        ],
      });
    };

    copyAssetIfExists(
      'src/assets/images/rumah_dinas_polri_1795015739198.jpg',
      'Foto-Progres-Rumah-Dinas-Polri-PRJ-001.jpg',
      'proyek',
      'prj-01',
      'PRJ-001',
      'Foto Lapangan',
      'Dokumentasi progres pembangunan rumah dinas 1 unit Polri (rangka atap & dinding)',
      'div-teknik'
    );
    copyAssetIfExists(
      'src/assets/images/renovasi_kantor_kedinasan_1795015740453.jpg',
      'Foto-Survey-Renovasi-Kantor-Kedinasan-PRJ-002.jpg',
      'proyek',
      'prj-02',
      'PRJ-002',
      'Foto Lapangan',
      'Foto survei kondisi atap, plafon, dan dinding gedung kantor kedinasan sebelum renovasi',
      'div-teknik'
    );
    copyAssetIfExists(
      'src/assets/images/perbaikan_mess_pegawai_1795015740757.jpg',
      'Foto-Selesai-Perbaikan-Mess-Pegawai-PRJ-003.jpg',
      'proyek',
      'prj-03',
      'PRJ-003',
      'Foto Lapangan',
      'Dokumentasi hasil akhir pemasangan keramik lantai dan perbaikan kamar mandi Mess Pegawai',
      'div-teknik'
    );

    seedPdf(
      'SPK-Rumah-Dinas-Polri-PRJ-001.pdf',
      'SURAT PERINTAH KERJA - SPK/WAS-POLRI/2026/001',
      'Kontrak Pembangunan Rumah Dinas Polri 1 Unit - PT. Wilwa Abiyasa Sejahtera (Rp350.000.000)',
      'kontrak',
      'ctr-01',
      'SPK/WAS-POLRI/2026/001',
      'Kontrak / SPK',
      'Dokumen SPK Pembangunan Rumah Dinas Polri (Akses Terbatas - Data Contoh)',
      'div-teknik',
      true
    );

    seedPdf(
      'RAB-Renovasi-Kantor-PRJ-002.pdf',
      'RENCANA ANGGARAN BIAYA (RAB) - PRJ-002',
      'Rincian RAB Perbaikan Atap, Plafon & Pengecatan Gedung Kantor Kedinasan (Rp125.000.000)',
      'rab',
      'prj-02',
      'RAB PRJ-002',
      'Dokumen RAB',
      'Dokumen RAB renovasi atap, plafon gypsum, dan pengecatan untuk review Tim Finance',
      'div-teknik',
      false
    );

    seedPdf(
      'Bukti-Termin1-PRJ-001.pdf',
      'BUKTI VERIFIKASI PEMBAYARAN - TRX-WAS-2026-001',
      'Kwitansi dan Bukti Transfer Termin I (DP 30%) Pembangunan Rumah Dinas Polri Rp105.000.000',
      'finance',
      'fin-01',
      'TRX-WAS-2026-001',
      'Invoice / Bukti Pembayaran',
      'Bukti verifikasi pembayaran termin proyek Rumah Dinas Polri (Dokumen Sensitif - Data Contoh)',
      'div-finance',
      true
    );

    return seeded;
  };

  if (!fs.existsSync(DB_FILE)) {
    writeJson(DB_FILE, buildWilwaSeedAttachments());
  } else {
    // Safe migration: replace ONLY old legacy mega-project seed attachments while preserving ALL user-uploaded production attachments
    const existingAttachments = readJson<AttachmentRecord[]>(DB_FILE, []);
    const isLegacySeedAttachment = (rec: AttachmentRecord): boolean => {
      const legacyText = `${rec.original_name} ${rec.entity_label || ''} ${rec.description}`;
      const matchesLegacySample =
        /PRJ-2026|Menara-Sudirman|Sudirman|Cikampek|KTR\/PMS\/2026\/014|TRX-FIN-2026-0912/i.test(
          legacyText
        );
      return rec.storage_name.startsWith('seed-') && (matchesLegacySample || Boolean(rec.is_demo));
    };

    const hasLegacySample = existingAttachments.some((rec) =>
      rec.storage_name.startsWith('seed-') &&
      /PRJ-2026|Menara-Sudirman|Sudirman|Cikampek/i.test(
        `${rec.original_name} ${rec.entity_label || ''} ${rec.description}`
      )
    );

    const ensureSeedFilesExist = (records: AttachmentRecord[]): boolean => {
      let modified = false;
      const seedAssetMap: { match: RegExp; srcRel: string }[] = [
        { match: /PRJ-001|Rumah-Dinas-Polri/i, srcRel: 'src/assets/images/rumah_dinas_polri_1795015739198.jpg' },
        { match: /PRJ-002|Renovasi-Kantor/i, srcRel: 'src/assets/images/renovasi_kantor_kedinasan_1795015740453.jpg' },
        { match: /PRJ-003|Mess-Pegawai/i, srcRel: 'src/assets/images/perbaikan_mess_pegawai_1795015740757.jpg' },
      ];
      const seedPdfMap: { match: RegExp; title: string; body: string }[] = [
        {
          match: /SPK-Rumah-Dinas-Polri/i,
          title: 'SURAT PERINTAH KERJA - SPK/WAS-POLRI/2026/001',
          body: 'Kontrak Pembangunan Rumah Dinas Polri 1 Unit - PT. Wilwa Abiyasa Sejahtera (Rp350.000.000)',
        },
        {
          match: /RAB-Renovasi-Kantor/i,
          title: 'RENCANA ANGGARAN BIAYA (RAB) - PRJ-002',
          body: 'Rincian RAB Perbaikan Atap, Plafon & Pengecatan Gedung Kantor Kedinasan (Rp125.000.000)',
        },
        {
          match: /Bukti-Termin1/i,
          title: 'BUKTI VERIFIKASI PEMBAYARAN - TRX-WAS-2026-001',
          body: 'Kwitansi dan Bukti Transfer Termin I (DP 30%) Pembangunan Rumah Dinas Polri Rp105.000.000',
        },
      ];

      for (const rec of records) {
        if (!rec.storage_name.startsWith('seed-') && !rec.is_demo) continue;
        const safeName = path.basename(rec.storage_name);
        const destPath = path.join(UPLOADS_DIR, safeName);
        const existsAndNonEmpty = fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
        if (existsAndNonEmpty) continue;

        const ext = (rec.extension || path.extname(safeName).replace('.', '')).toLowerCase();
        if (ext === 'pdf') {
          const pdfSpec = seedPdfMap.find((s) => s.match.test(rec.original_name));
          const buf = buildMinimalPdfBuffer(
            pdfSpec?.title || rec.original_name,
            pdfSpec?.body || rec.description || 'Dokumen PMS Konstruksi'
          );
          fs.writeFileSync(destPath, buf);
          rec.size_bytes = buf.length;
          if (rec.versions?.[0]) rec.versions[0].size_bytes = buf.length;
          modified = true;
        } else {
          const imgSpec = seedAssetMap.find(
            (s) => s.match.test(rec.original_name) || s.match.test(rec.entity_label || '')
          );
          if (imgSpec) {
            const srcPath = path.resolve(__dirname, imgSpec.srcRel);
            if (fs.existsSync(srcPath)) {
              fs.copyFileSync(srcPath, destPath);
              const size = fs.statSync(destPath).size;
              rec.size_bytes = size;
              rec.mime_type = getCanonicalMimeType(ext || 'jpg', rec.mime_type);
              if (rec.versions?.[0]) {
                rec.versions[0].size_bytes = size;
                rec.versions[0].mime_type = rec.mime_type;
              }
              modified = true;
            }
          }
        }
      }
      return modified;
    };

    if (hasLegacySample) {
      const userProductionAttachments = existingAttachments.filter((rec) => !isLegacySeedAttachment(rec));
      // Clean up replaced old seed physical files only
      existingAttachments.filter(isLegacySeedAttachment).forEach((oldRec) => {
        try {
          const oldFile = path.join(UPLOADS_DIR, oldRec.storage_name);
          if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
        } catch {
          // ignore cleanup failure
        }
      });
      const freshSeeds = buildWilwaSeedAttachments();
      const merged = [...userProductionAttachments, ...freshSeeds];
      ensureSeedFilesExist(merged);
      writeJson(DB_FILE, merged);
    } else if (ensureSeedFilesExist(existingAttachments)) {
      writeJson(DB_FILE, existingAttachments);
    }
  }

  ensureOperationalDb();
}

function cloneInitialPmsState(): PMSState {
  return JSON.parse(JSON.stringify(INITIAL_PMS_DATA)) as PMSState;
}

function createDefaultWorkflowForProject(project: Project): ProjectWorkflow {
  const now = new Date().toISOString();
  return {
    id: `wf-${project.id}`,
    project_id: project.id,
    stage: project.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
    submitter_id: project.pic_employee_id || 'emp-02',
    submitter_name: 'Tim Teknik',
    submitter_division_id: 'div-teknik',
    approved_budget_limit: 0,
    work_cost_estimate: 0,
    schedule_start: project.start_date,
    schedule_end: project.target_end_date,
    material_needs: [],
    procurements: [],
    field_reports: [],
    history: [
      {
        id: `wh-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        timestamp: now,
        from_stage: null,
        to_stage: project.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
        action: 'Inisialisasi Proyek',
        actor_id: 'system',
        actor_name: 'Sistem PMS',
        actor_role: 'SYSTEM',
        actor_division: 'TEKNIK',
        note: `Workflow operasional dibuat untuk proyek ${project.project_number}.`,
      },
    ],
    updated_at: now,
  };
}

function recomputeProcurementStatuses(
  wf: ProjectWorkflow,
  materials: Material[]
): WorkflowMaterialNeed[] {
  return wf.material_needs.map((need) => {
    const mat = materials.find((m) => m.id === need.material_id);
    const covered = need.qty_issued + need.qty_reserved;
    if (covered >= need.qty_needed && need.qty_needed > 0) {
      return { ...need, procurement_status: 'Siap / Tersedia' };
    }
    const activePo = wf.procurements.some(
      (po) => po.material_id === need.material_id && po.status !== 'Diterima di Gudang'
    );
    if (activePo) {
      return { ...need, procurement_status: 'Dalam Pengadaan' };
    }
    const remaining = Math.max(0, need.qty_needed - covered);
    const availableStock = mat?.stock ?? 0;
    return {
      ...need,
      procurement_status: availableStock >= remaining ? 'Stok Cukup' : 'Perlu Pengadaan',
    };
  });
}

const LEGACY_DEMO_IDS = {
  projects: new Set(['prj-01', 'prj-02', 'prj-03', 'prj-04']),
  contracts: new Set(['ctr-01', 'ctr-02', 'ctr-03', 'ctr-04']),
  contractTerms: new Set(['trm-01', 'trm-02', 'trm-03', 'trm-04', 'trm-05', 'trm-06', 'trm-07']),
  termClaims: new Set(['clm-01', 'clm-02', 'clm-03', 'clm-04']),
  termPayments: new Set(['pay-01', 'pay-02', 'pay-03', 'pay-04']),
  contractAddendums: new Set(['add-01']),
  budgets: new Set(['rab-01', 'rab-02', 'rab-03', 'rab-04', 'rab-05', 'rab-06', 'rab-07', 'rab-08', 'rab-09', 'rab-10']),
  projectMaterials: new Set(Array.from({ length: 16 }, (_, i) => `pm-${String(i + 1).padStart(2, '0')}`)),
  workItems: new Set(['wrk-01', 'wrk-02', 'wrk-03', 'wrk-04']),
  materials: new Set(Array.from({ length: 11 }, (_, i) => `mat-${String(i + 1).padStart(2, '0')}`)),
  materialRequests: new Set(['mr-01', 'mr-02', 'mr-03', 'mr-04', 'mr-05']),
  materialTransactions: new Set(['mtx-01', 'mtx-02', 'mtx-03', 'mtx-04', 'mtx-05']),
  companyAssets: new Set(['ast-01', 'ast-02', 'ast-03', 'ast-04', 'ast-05', 'ast-06']),
  assetMovements: new Set(['amv-01', 'amv-02', 'amv-03']),
  maintenanceRecords: new Set(['mnt-01', 'mnt-02', 'mnt-03']),
  financialTransactions: new Set(['fin-01', 'fin-02', 'fin-03', 'fin-04', 'fin-05', 'fin-06']),
  documents: new Set(['doc-01', 'doc-02', 'doc-03', 'doc-04']),
  approvals: new Set(['apr-01', 'apr-02', 'apr-03', 'apr-04', 'apr-05', 'apr-06']),
  notifications: new Set(['ntf-01', 'ntf-02', 'ntf-03', 'ntf-04', 'ntf-05', 'ntf-06', 'ntf-07']),
  activityLogs: new Set(['log-01', 'log-02', 'log-03', 'log-04', 'log-05']),
  workflows: new Set(['wf-prj-01', 'wf-prj-02', 'wf-prj-03', 'wf-prj-04']),
  projectAssets: new Set(['past-01', 'past-02', 'past-03', 'past-04', 'past-05', 'past-06']),
  projectAssetReports: new Set(['par-01', 'par-02']),
  projectAssetHistories: new Set(['pah-01', 'pah-02', 'pah-03', 'pah-04']),
  financeBills: new Set(['bill-01', 'bill-02', 'bill-03']),
  teknikEvaluations: new Set(['teval-01', 'teval-02']),
  teknikConstraints: new Set(['tcon-01', 'tcon-02']),
  teknikChanges: new Set(['tchg-01', 'tchg-02']),
  teknikCompletions: new Set(['tcmp-01', 'tcmp-02']),
  teknikProgressAssessments: new Set(['tprg-01', 'tprg-02', 'tprg-03', 'tprg-04']),
};

function mergePreservingProduction(existingDb: PMSState): PMSState {
  const fresh = cloneInitialPmsState();
  const filterProd = <T extends { id: string; is_demo?: boolean }>(
    list: T[] | undefined,
    demoIds: Set<string>
  ): T[] => {
    if (!Array.isArray(list)) return [];
    return list.filter((item) => !item.is_demo && !demoIds.has(item.id));
  };

  const keepEmployees = Array.isArray(existingDb.employees) ? existingDb.employees : fresh.employees;
  const freshEmpIds = new Set(keepEmployees.map((e) => e.id));
  const mergedEmployees = [
    ...keepEmployees,
    ...fresh.employees.filter((e) => !freshEmpIds.has(e.id)),
  ];

  const keepAccounts = Array.isArray(existingDb.accounts) ? existingDb.accounts : fresh.accounts;
  const freshAccIds = new Set(keepAccounts.map((a) => a.id));
  const mergedAccounts = [
    ...keepAccounts,
    ...fresh.accounts.filter((a) => !freshAccIds.has(a.id)),
  ];

  return {
    ...fresh,
    demo_seed_version: DEMO_SEED_VERSION,
    divisions: Array.isArray(existingDb.divisions) && existingDb.divisions.length > 0 ? existingDb.divisions : fresh.divisions,
    roles: Array.isArray(existingDb.roles) && existingDb.roles.length > 0 ? existingDb.roles : fresh.roles,
    employees: mergedEmployees,
    accounts: mergedAccounts,
    projects: [...filterProd(existingDb.projects, LEGACY_DEMO_IDS.projects), ...fresh.projects],
    contracts: [...filterProd(existingDb.contracts, LEGACY_DEMO_IDS.contracts), ...fresh.contracts],
    contractTerms: [...filterProd(existingDb.contractTerms, LEGACY_DEMO_IDS.contractTerms), ...fresh.contractTerms],
    termClaims: [...filterProd(existingDb.termClaims, LEGACY_DEMO_IDS.termClaims), ...fresh.termClaims],
    termPayments: [...filterProd(existingDb.termPayments, LEGACY_DEMO_IDS.termPayments), ...fresh.termPayments],
    contractAddendums: [...filterProd(existingDb.contractAddendums, LEGACY_DEMO_IDS.contractAddendums), ...fresh.contractAddendums],
    budgets: [...filterProd(existingDb.budgets, LEGACY_DEMO_IDS.budgets), ...fresh.budgets],
    projectMaterials: [...filterProd(existingDb.projectMaterials, LEGACY_DEMO_IDS.projectMaterials), ...fresh.projectMaterials],
    workItems: [...filterProd(existingDb.workItems, LEGACY_DEMO_IDS.workItems), ...fresh.workItems],
    materials: [...filterProd(existingDb.materials, LEGACY_DEMO_IDS.materials), ...fresh.materials],
    materialRequests: [...filterProd(existingDb.materialRequests, LEGACY_DEMO_IDS.materialRequests), ...fresh.materialRequests],
    materialTransactions: [...filterProd(existingDb.materialTransactions, LEGACY_DEMO_IDS.materialTransactions), ...fresh.materialTransactions],
    companyAssets: [...filterProd(existingDb.companyAssets, LEGACY_DEMO_IDS.companyAssets), ...fresh.companyAssets],
    assetMovements: [...filterProd(existingDb.assetMovements, LEGACY_DEMO_IDS.assetMovements), ...fresh.assetMovements],
    maintenanceRecords: [...filterProd(existingDb.maintenanceRecords, LEGACY_DEMO_IDS.maintenanceRecords), ...fresh.maintenanceRecords],
    financialTransactions: [...filterProd(existingDb.financialTransactions, LEGACY_DEMO_IDS.financialTransactions), ...fresh.financialTransactions],
    documents: [...filterProd(existingDb.documents, LEGACY_DEMO_IDS.documents), ...fresh.documents],
    approvals: [...filterProd(existingDb.approvals, LEGACY_DEMO_IDS.approvals), ...fresh.approvals],
    notifications: [...filterProd(existingDb.notifications, LEGACY_DEMO_IDS.notifications), ...fresh.notifications],
    activityLogs: [...filterProd(existingDb.activityLogs, LEGACY_DEMO_IDS.activityLogs), ...fresh.activityLogs],
    offlineDrafts: Array.isArray(existingDb.offlineDrafts) ? existingDb.offlineDrafts : [],
    workflows: [...filterProd(existingDb.workflows, LEGACY_DEMO_IDS.workflows), ...fresh.workflows],
    warehouses:
      Array.isArray(existingDb.warehouses) && existingDb.warehouses.length > 0
        ? existingDb.warehouses
        : fresh.warehouses || [],
    warehouseOrders: Array.isArray(existingDb.warehouseOrders) ? existingDb.warehouseOrders : [],
    stockOpnames: Array.isArray(existingDb.stockOpnames) ? existingDb.stockOpnames : [],
    warehouseAuditLogs: Array.isArray(existingDb.warehouseAuditLogs) ? existingDb.warehouseAuditLogs : [],
    deliveryNotes: Array.isArray(existingDb.deliveryNotes) ? existingDb.deliveryNotes : [],
    projectAssets: [
      ...filterProd(existingDb.projectAssets, LEGACY_DEMO_IDS.projectAssets),
      ...(fresh.projectAssets || []),
    ],
    projectAssetReports: [
      ...filterProd(existingDb.projectAssetReports, LEGACY_DEMO_IDS.projectAssetReports),
      ...(fresh.projectAssetReports || []),
    ],
    projectAssetHistories: [
      ...filterProd(existingDb.projectAssetHistories, LEGACY_DEMO_IDS.projectAssetHistories),
      ...(fresh.projectAssetHistories || []),
    ],
    financeBills: [
      ...filterProd(existingDb.financeBills, LEGACY_DEMO_IDS.financeBills),
      ...(fresh.financeBills || []),
    ],
    teknikEvaluations: [
      ...filterProd(existingDb.teknikEvaluations, LEGACY_DEMO_IDS.teknikEvaluations),
      ...(fresh.teknikEvaluations || []),
    ],
    teknikConstraints: [
      ...filterProd(existingDb.teknikConstraints, LEGACY_DEMO_IDS.teknikConstraints),
      ...(fresh.teknikConstraints || []),
    ],
    teknikChanges: [
      ...filterProd(existingDb.teknikChanges, LEGACY_DEMO_IDS.teknikChanges),
      ...(fresh.teknikChanges || []),
    ],
    teknikCompletions: [
      ...filterProd(existingDb.teknikCompletions, LEGACY_DEMO_IDS.teknikCompletions),
      ...(fresh.teknikCompletions || []),
    ],
    teknikProgressAssessments: [
      ...filterProd(existingDb.teknikProgressAssessments, LEGACY_DEMO_IDS.teknikProgressAssessments),
      ...(fresh.teknikProgressAssessments || []),
    ],
  };
}

function replaceBekasiWithDepokText(val: string | undefined): { value: string; changed: boolean } {
  const orig = String(val ?? '');
  const next = orig.replace(/bekasi\s+selatan/gi, 'Depok').replace(/bekasi/gi, 'Depok');
  return { value: next, changed: next !== orig };
}

function sumWarehouseStocksMap(stocks: Record<string, number> | undefined): number {
  if (!stocks) return 0;
  let total = 0;
  for (const val of Object.values(stocks)) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return Math.round(total * 100) / 100;
}

function resolveWarehouseInDb(
  db: PMSState,
  warehouseIdOrName?: string
): WarehouseLocation {
  const list = Array.isArray(db.warehouses) ? db.warehouses : [];
  const key = String(warehouseIdOrName || '').trim();
  if (key) {
    const byId = list.find((w) => w.id === key);
    if (byId) return byId;
    const lower = key.toLowerCase();
    const byName = list.find((w) => w.name.toLowerCase() === lower || w.code.toLowerCase() === lower);
    if (byName) return byName;
  }
  return (
    list.find((w) => w.id === 'wh-depok') ||
    list.find((w) => w.is_active) ||
    list[0] || {
      id: 'wh-depok',
      code: 'GDG-DPK-01',
      name: 'Gudang Utama PT. Wilwa, Depok',
      address: 'Kota Depok, Jawa Barat',
      pic_name: 'Bagus Santoso',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );
}

function getMatStockAtWarehouse(mat: Material, warehouseId: string): number {
  if (mat.warehouse_stocks && Object.keys(mat.warehouse_stocks).length > 0) {
    return Math.round(Number(mat.warehouse_stocks[warehouseId] ?? 0) * 100) / 100;
  }
  const fallbackId = mat.default_warehouse_id || 'wh-depok';
  return fallbackId === warehouseId ? Math.round(Number(mat.stock ?? 0) * 100) / 100 : 0;
}

function applyWarehouseStockDelta(
  mat: Material,
  warehouseId: string,
  delta: number
): { nextStocks: Record<string, number>; whBefore: number; whAfter: number; totalAfter: number } {
  const baseMap: Record<string, number> =
    mat.warehouse_stocks && Object.keys(mat.warehouse_stocks).length > 0
      ? { ...mat.warehouse_stocks }
      : { [mat.default_warehouse_id || 'wh-depok']: Number(mat.stock ?? 0) };
  const whBefore = Math.round(Number(baseMap[warehouseId] ?? 0) * 100) / 100;
  const whAfter = Math.max(0, Math.round((whBefore + delta) * 100) / 100);
  baseMap[warehouseId] = whAfter;
  const totalAfter = sumWarehouseStocksMap(baseMap);
  return { nextStocks: baseMap, whBefore, whAfter, totalAfter };
}

function migrateWarehouseLocationsAndBekasiToDepok(db: PMSState): boolean {
  let dirty = false;
  const seedWarehouses = cloneInitialPmsState().warehouses || [];

  if (!Array.isArray(db.warehouses) || db.warehouses.length === 0) {
    db.warehouses = seedWarehouses;
    dirty = true;
  }

  // Merge/rename any warehouse containing Bekasi into Depok without duplication
  const idRedirect = new Map<string, string>();
  const dedupedWarehouses: WarehouseLocation[] = [];
  const seenNames = new Map<string, WarehouseLocation>();

  for (const wh of db.warehouses) {
    const rName = replaceBekasiWithDepokText(wh.name);
    const rAddr = replaceBekasiWithDepokText(wh.address);
    const rNotes = replaceBekasiWithDepokText(wh.notes);
    if (rName.changed || rAddr.changed || rNotes.changed) dirty = true;

    const cleanWh: WarehouseLocation = {
      ...wh,
      name: rName.value,
      address: rAddr.value,
      notes: wh.notes !== undefined ? rNotes.value : undefined,
    };

    const nameKey = cleanWh.name.trim().toLowerCase();
    const existing = seenNames.get(nameKey);
    if (existing) {
      idRedirect.set(cleanWh.id, existing.id);
      dirty = true;
    } else {
      seenNames.set(nameKey, cleanWh);
      dedupedWarehouses.push(cleanWh);
    }
  }

  // Ensure primary Depok warehouse exists
  for (const sw of seedWarehouses) {
    if (!dedupedWarehouses.some((w) => w.id === sw.id || w.name.toLowerCase() === sw.name.toLowerCase())) {
      dedupedWarehouses.push(sw);
      dirty = true;
    }
  }
  db.warehouses = dedupedWarehouses;

  // Migrate materials -> Depok & per-warehouse stock dictionary without losing or duplicating stock
  db.materials = (db.materials || []).map((mat) => {
    const rLoc = replaceBekasiWithDepokText(mat.warehouse_location);
    if (rLoc.changed) dirty = true;

    const mappedDefaultId = mat.default_warehouse_id
      ? idRedirect.get(mat.default_warehouse_id) || mat.default_warehouse_id
      : undefined;
    const defaultWh = resolveWarehouseInDb(db, mappedDefaultId || rLoc.value);

    const nextStocks: Record<string, number> = {};
    if (mat.warehouse_stocks && Object.keys(mat.warehouse_stocks).length > 0) {
      for (const [k, v] of Object.entries(mat.warehouse_stocks)) {
        const targetId = idRedirect.get(k) || (db.warehouses!.some((w) => w.id === k) ? k : defaultWh.id);
        const qty = Math.max(0, Math.round(Number(v || 0) * 100) / 100);
        nextStocks[targetId] = Math.round(((nextStocks[targetId] || 0) + qty) * 100) / 100;
      }
      if (sumWarehouseStocksMap(nextStocks) === 0 && mat.stock > 0) {
        nextStocks[defaultWh.id] = Math.round(Number(mat.stock) * 100) / 100;
        dirty = true;
      }
    } else {
      nextStocks[defaultWh.id] = Math.max(0, Math.round(Number(mat.stock || 0) * 100) / 100);
      dirty = true;
    }

    const totalStock = sumWarehouseStocksMap(nextStocks);
    if (
      mat.default_warehouse_id !== defaultWh.id ||
      mat.warehouse_location !== defaultWh.name ||
      totalStock !== mat.stock
    ) {
      dirty = true;
    }

    return {
      ...mat,
      warehouse_location: defaultWh.name,
      default_warehouse_id: defaultWh.id,
      warehouse_stocks: nextStocks,
      stock: totalStock,
    };
  });

  // Migrate warehouseOrders
  db.warehouseOrders = (db.warehouseOrders || []).map((ord) => {
    const rName = replaceBekasiWithDepokText(ord.warehouse_name);
    const rNotes = replaceBekasiWithDepokText(ord.notes);
    const rFin = replaceBekasiWithDepokText(ord.finance_note);
    const rInsp = replaceBekasiWithDepokText(ord.inspection_note);
    const mat = db.materials.find((m) => m.id === ord.material_id);
    const mappedId = ord.warehouse_id ? idRedirect.get(ord.warehouse_id) || ord.warehouse_id : undefined;
    const wh = resolveWarehouseInDb(db, mappedId || mat?.default_warehouse_id || rName.value);
    if (
      rName.changed ||
      rNotes.changed ||
      rFin.changed ||
      rInsp.changed ||
      ord.warehouse_id !== wh.id ||
      ord.warehouse_name !== wh.name
    ) {
      dirty = true;
    }
    return {
      ...ord,
      warehouse_id: wh.id,
      warehouse_name: wh.name,
      notes: rNotes.value,
      finance_note: ord.finance_note !== undefined ? rFin.value : undefined,
      inspection_note: ord.inspection_note !== undefined ? rInsp.value : undefined,
    };
  });

  // Migrate materialTransactions
  db.materialTransactions = (db.materialTransactions || []).map((tx) => {
    const rWh = replaceBekasiWithDepokText(tx.warehouse_name);
    const rSrc = replaceBekasiWithDepokText(tx.source_or_destination);
    const rNotes = replaceBekasiWithDepokText(tx.notes);
    const mat = db.materials.find((m) => m.id === tx.material_id);
    const mappedId = tx.warehouse_id ? idRedirect.get(tx.warehouse_id) || tx.warehouse_id : undefined;
    const wh = resolveWarehouseInDb(db, mappedId || mat?.default_warehouse_id || rWh.value);
    if (
      rWh.changed ||
      rSrc.changed ||
      rNotes.changed ||
      tx.warehouse_id !== wh.id ||
      tx.warehouse_name !== wh.name
    ) {
      dirty = true;
    }
    return {
      ...tx,
      warehouse_id: wh.id,
      warehouse_name: wh.name,
      source_or_destination: tx.source_or_destination !== undefined ? rSrc.value : undefined,
      notes: rNotes.value,
    };
  });

  // Migrate stockOpnames
  db.stockOpnames = (db.stockOpnames || []).map((op) => {
    const rWh = replaceBekasiWithDepokText(op.warehouse_name);
    const rReason = replaceBekasiWithDepokText(op.reason);
    const rCond = replaceBekasiWithDepokText(op.condition_note);
    const mat = db.materials.find((m) => m.id === op.material_id);
    const mappedId = op.warehouse_id ? idRedirect.get(op.warehouse_id) || op.warehouse_id : undefined;
    const wh = resolveWarehouseInDb(db, mappedId || mat?.default_warehouse_id || rWh.value);
    if (
      rWh.changed ||
      rReason.changed ||
      rCond.changed ||
      op.warehouse_id !== wh.id ||
      op.warehouse_name !== wh.name
    ) {
      dirty = true;
    }
    return {
      ...op,
      warehouse_id: wh.id,
      warehouse_name: wh.name,
      reason: rReason.value,
      condition_note: rCond.value,
    };
  });

  // Migrate deliveryNotes
  db.deliveryNotes = (db.deliveryNotes || []).map((dn) => {
    const rWh = replaceBekasiWithDepokText(dn.source_warehouse_name);
    const rDest = replaceBekasiWithDepokText(dn.destination_location);
    const rNotes = replaceBekasiWithDepokText(dn.notes);
    const mappedId = dn.source_warehouse_id
      ? idRedirect.get(dn.source_warehouse_id) || dn.source_warehouse_id
      : undefined;
    const wh = resolveWarehouseInDb(db, mappedId || rWh.value);
    const nextHistory = (dn.history || []).map((h) => {
      const rH = replaceBekasiWithDepokText(h.note);
      if (rH.changed) dirty = true;
      return { ...h, note: rH.value };
    });
    if (
      rWh.changed ||
      rDest.changed ||
      rNotes.changed ||
      dn.source_warehouse_id !== wh.id ||
      dn.source_warehouse_name !== wh.name
    ) {
      dirty = true;
    }
    return {
      ...dn,
      source_warehouse_id: wh.id,
      source_warehouse_name: wh.name,
      destination_location: rDest.value,
      notes: rNotes.value,
      history: nextHistory,
    };
  });

  // Migrate remaining Bekasi strings in projects, assets, movements, maintenance, documents, audit & activity logs
  db.projects = (db.projects || []).map((p) => {
    const rLoc = replaceBekasiWithDepokText(p.location);
    if (rLoc.changed) dirty = true;
    return { ...p, location: rLoc.value };
  });
  db.materialRequests = (db.materialRequests || []).map((mr) => {
    const rNotes = replaceBekasiWithDepokText(mr.notes);
    if (rNotes.changed) dirty = true;
    const nextHist = (mr.history || []).map((h) => {
      const rH = replaceBekasiWithDepokText(h.note);
      if (rH.changed) dirty = true;
      return { ...h, note: rH.value };
    });
    return { ...mr, notes: rNotes.value, history: nextHist };
  });
  db.companyAssets = (db.companyAssets || []).map((a) => {
    const rLoc = replaceBekasiWithDepokText(a.location);
    if (rLoc.changed) dirty = true;
    return { ...a, location: rLoc.value };
  });
  db.assetMovements = (db.assetMovements || []).map((m) => {
    const rFrom = replaceBekasiWithDepokText(m.from_location);
    const rTo = replaceBekasiWithDepokText(m.to_location);
    if (rFrom.changed || rTo.changed) dirty = true;
    return { ...m, from_location: rFrom.value, to_location: rTo.value };
  });
  db.maintenanceRecords = (db.maintenanceRecords || []).map((m) => {
    const rTech = replaceBekasiWithDepokText(m.technician);
    if (rTech.changed) dirty = true;
    return { ...m, technician: rTech.value };
  });
  db.documents = (db.documents || []).map((d) => {
    const rDet = replaceBekasiWithDepokText(d.details);
    if (rDet.changed) dirty = true;
    const nextHist = (d.history || []).map((h) => {
      const rH = replaceBekasiWithDepokText(h.note);
      if (rH.changed) dirty = true;
      return { ...h, note: rH.value };
    });
    return { ...d, details: rDet.value, history: nextHist };
  });
  db.warehouseAuditLogs = (db.warehouseAuditLogs || []).map((a) => {
    const rDet = replaceBekasiWithDepokText(a.detail);
    if (rDet.changed) dirty = true;
    return { ...a, detail: rDet.value };
  });
  db.activityLogs = (db.activityLogs || []).map((l) => {
    const rDesc = replaceBekasiWithDepokText(l.description);
    if (rDesc.changed) dirty = true;
    return { ...l, description: rDesc.value };
  });

  return dirty;
}

function ensureOperationalDb(): PMSState {
  ensureStorageDirs();
  let db = readJson<PMSState | null>(OPERATIONAL_DB_FILE, null);
  let dirty = false;
  if (!db) {
    db = cloneInitialPmsState();
    dirty = true;
  } else if (db.demo_seed_version !== DEMO_SEED_VERSION) {
    db = mergePreservingProduction(db);
    dirty = true;
  }
  if (!Array.isArray(db.projects) || db.projects.length === 0) {
    db.projects = cloneInitialPmsState().projects;
    dirty = true;
  }
  if (!Array.isArray(db.workflows)) {
    db.workflows = cloneInitialPmsState().workflows;
    dirty = true;
  }
  if (!Array.isArray(db.projectMaterials)) {
    db.projectMaterials = cloneInitialPmsState().projectMaterials;
    dirty = true;
  }
  if (!Array.isArray(db.termClaims)) {
    db.termClaims = cloneInitialPmsState().termClaims;
    dirty = true;
  }
  if (!Array.isArray(db.termPayments)) {
    db.termPayments = cloneInitialPmsState().termPayments;
    dirty = true;
  }
  if (!Array.isArray(db.contractAddendums)) {
    db.contractAddendums = cloneInitialPmsState().contractAddendums;
    dirty = true;
  }
  if (!Array.isArray(db.warehouseOrders)) {
    db.warehouseOrders = [];
    dirty = true;
  }
  if (!Array.isArray(db.stockOpnames)) {
    db.stockOpnames = [];
    dirty = true;
  }
  if (!Array.isArray(db.warehouseAuditLogs)) {
    db.warehouseAuditLogs = [];
    dirty = true;
  }
  if (!Array.isArray(db.deliveryNotes)) {
    db.deliveryNotes = [];
    dirty = true;
  }
  if (!Array.isArray(db.projectAssets)) {
    db.projectAssets = cloneInitialPmsState().projectAssets || [];
    dirty = true;
  }
  if (!Array.isArray(db.projectAssetReports)) {
    db.projectAssetReports = cloneInitialPmsState().projectAssetReports || [];
    dirty = true;
  }
  if (!Array.isArray(db.projectAssetHistories)) {
    db.projectAssetHistories = cloneInitialPmsState().projectAssetHistories || [];
    dirty = true;
  }
  if (!Array.isArray(db.financeBills)) {
    db.financeBills = cloneInitialPmsState().financeBills || [];
    dirty = true;
  }
  if (!Array.isArray(db.teknikEvaluations)) {
    db.teknikEvaluations = cloneInitialPmsState().teknikEvaluations || [];
    dirty = true;
  }
  if (!Array.isArray(db.teknikConstraints)) {
    db.teknikConstraints = cloneInitialPmsState().teknikConstraints || [];
    dirty = true;
  }
  if (!Array.isArray(db.teknikChanges)) {
    db.teknikChanges = cloneInitialPmsState().teknikChanges || [];
    dirty = true;
  }
  if (!Array.isArray(db.teknikCompletions)) {
    db.teknikCompletions = cloneInitialPmsState().teknikCompletions || [];
    dirty = true;
  }
  if (!Array.isArray(db.teknikProgressAssessments)) {
    db.teknikProgressAssessments = cloneInitialPmsState().teknikProgressAssessments || [];
    dirty = true;
  }
  if (migrateWarehouseLocationsAndBekasiToDepok(db)) {
    dirty = true;
  }
  for (const prj of db.projects) {
    if (!db.workflows.some((w) => w.project_id === prj.id)) {
      const seedMatch = INITIAL_PMS_DATA.workflows.find((w) => w.project_id === prj.id);
      db.workflows.push(
        seedMatch
          ? (JSON.parse(JSON.stringify(seedMatch)) as ProjectWorkflow)
          : createDefaultWorkflowForProject(prj)
      );
      dirty = true;
    }
  }
  if (dirty) {
    writeJson(OPERATIONAL_DB_FILE, db);
  }
  return db;
}

function saveOperationalDb(db: PMSState) {
  writeJson(OPERATIONAL_DB_FILE, db);
}

function makeHistoryEntry(
  actor: ActorContext,
  from_stage: WorkflowStage | null,
  to_stage: WorkflowStage,
  action: string,
  note: string
): WorkflowHistoryEntry {
  return {
    id: `wh-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    timestamp: new Date().toISOString(),
    from_stage,
    to_stage,
    action,
    actor_id: actor.employeeId,
    actor_name: actor.fullName,
    actor_role: actor.roleCode,
    actor_division: actor.divisionCode,
    note,
  };
}

function makeOperationalLog(
  db: PMSState,
  actor: ActorContext,
  activity_type: string,
  description: string,
  projectId?: string
): ActivityLog {
  const div = db.divisions.find((d) => d.id === actor.divisionId);
  const prj = projectId ? db.projects.find((p) => p.id === projectId) : undefined;
  return {
    id: `log-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
    timestamp: new Date().toISOString(),
    employee_id: actor.employeeId,
    employee_name: actor.fullName,
    division_name: div?.name ?? actor.divisionCode,
    project_id: prj?.id,
    project_name: prj?.name,
    activity_type,
    description,
  };
}

function makeOperationalNotification(
  notif: Omit<AppNotification, 'id' | 'created_at' | 'read'>
): AppNotification {
  return {
    ...notif,
    id: `ntf-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
    created_at: new Date().toISOString(),
    read: false,
  };
}

function getActor(req: Request): ActorContext | null {
  const employeeId = String(req.headers['x-pms-employee-id'] || '').trim();
  const nik = String(req.headers['x-pms-nik'] || '').trim();
  const roleCode = String(req.headers['x-pms-role'] || '').trim() as ActorContext['roleCode'];
  const divisionCode = String(req.headers['x-pms-division'] || '').trim() as ActorContext['divisionCode'];
  const divisionId = String(req.headers['x-pms-division-id'] || '').trim();
  const rawName = String(req.headers['x-pms-name'] || 'Pengguna PMS').trim();
  let fullName = rawName;
  if (req.headers['x-pms-name-encoded'] === '1') {
    try {
      fullName = decodeURIComponent(rawName);
    } catch {
      fullName = rawName;
    }
  }

  if (!employeeId || !nik || !['SUPER_ADMIN', 'HEAD', 'STAFF'].includes(roleCode)) {
    return null;
  }
  return {
    employeeId,
    nik,
    roleCode,
    divisionCode: ['TEKNIK', 'LOGISTIK', 'FINANCE', 'DIREKSI'].includes(divisionCode)
      ? divisionCode
      : 'TEKNIK',
    divisionId: divisionId || 'div-teknik',
    fullName: fullName || 'Pengguna PMS',
  };
}

function resolveActorDbTruth(db: PMSState, actor: ActorContext) {
  const emp = db.employees.find((e) => e.id === actor.employeeId && e.nik === actor.nik);
  if (!emp || emp.status !== 'Aktif') return null;
  const acc = db.accounts.find((a) => a.employee_id === emp.id || a.nik === emp.nik);
  if (acc && acc.status !== 'Aktif') return null;
  const role = db.roles.find((r) => r.id === emp.role_id)?.code;
  const division = db.divisions.find((d) => d.id === emp.division_id)?.code;
  if (!role || !division) return null;
  return { emp, role, division };
}

function hasTeknikModuleAccess(role: string, division: string): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return division === 'TEKNIK' && (role === 'HEAD' || role === 'STAFF');
}

function hasLogistikModuleAccess(role: string, division: string): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return division === 'LOGISTIK' && (role === 'HEAD' || role === 'STAFF');
}

function sanitizeStateForActor(
  db: PMSState,
  truth: { role: string; division: string } | null
): PMSState {
  if (truth && hasTeknikModuleAccess(truth.role, truth.division)) {
    return db;
  }
  return {
    ...db,
    teknikEvaluations: [],
    teknikConstraints: [],
    teknikChanges: [],
    teknikCompletions: [],
    teknikProgressAssessments: [],
  };
}

function getAllowedModulesForActor(role: ActorContext['roleCode'], division: ActorContext['divisionCode']): string[] {
  if (role === 'SUPER_ADMIN') {
    return [
      'dashboard',
      'proyek',
      'kontrak',
      'gudang',
      'rab',
      'teknik',
      'logistik',
      'finance',
      'aset',
      'dokumen',
      'karyawan',
      'persetujuan',
      'laporan',
      'pengaturan',
    ];
  }
  if (role === 'HEAD') {
    const base = ['dashboard', 'proyek', 'dokumen', 'karyawan', 'persetujuan', 'laporan', 'pengaturan'];
    if (division === 'TEKNIK') return [...base, 'kontrak', 'gudang', 'rab', 'teknik', 'aset'];
    if (division === 'LOGISTIK') return [...base, 'gudang', 'logistik', 'aset'];
    if (division === 'FINANCE') return [...base, 'kontrak', 'gudang', 'rab', 'finance', 'aset'];
    if (division === 'DIREKSI') return [...base, 'gudang', 'aset'];
    return base;
  }
  const staffBase = ['dashboard', 'proyek', 'dokumen', 'persetujuan', 'laporan', 'pengaturan'];
  if (division === 'TEKNIK') return [...staffBase, 'kontrak', 'gudang', 'rab', 'teknik', 'aset'];
  if (division === 'LOGISTIK') return [...staffBase, 'gudang', 'logistik', 'aset'];
  if (division === 'FINANCE') return [...staffBase, 'kontrak', 'gudang', 'rab', 'finance', 'aset'];
  if (division === 'DIREKSI') return [...staffBase, 'gudang', 'aset'];
  return staffBase;
}

function canViewAttachment(actor: ActorContext, record: AttachmentRecord): boolean {
  const truth = resolveActorDbTruth(ensureOperationalDb(), actor);
  if (!truth) return false;
  if (truth.role === 'SUPER_ADMIN') return true;

  if (record.module_id === 'teknik') {
    return hasTeknikModuleAccess(truth.role, truth.division);
  }
  if (record.module_id === 'logistik') {
    return hasLogistikModuleAccess(truth.role, truth.division);
  }

  const allowedModules = getAllowedModulesForActor(truth.role, truth.division);
  if (record.module_id === 'karyawan') {
    if (truth.role === 'HEAD') {
      return record.division_id === truth.emp.division_id || record.entity_id === truth.emp.id;
    }
    return record.entity_id === truth.emp.id;
  }

  if (record.module_id === 'finance') {
    return truth.division === 'FINANCE';
  }

  if (!allowedModules.includes(record.module_id)) {
    return false;
  }

  return true;
}

function canUploadToTarget(actor: ActorContext, moduleId: string, entityId: string): boolean {
  const db = ensureOperationalDb();
  const truth = resolveActorDbTruth(db, actor);
  if (!truth) return false;
  if (truth.role === 'SUPER_ADMIN') return true;
  if (moduleId === 'teknik') {
    return hasTeknikModuleAccess(truth.role, truth.division);
  }
  if (moduleId === 'logistik') {
    return hasLogistikModuleAccess(truth.role, truth.division);
  }
  if (moduleId === 'karyawan') {
    if (truth.role === 'HEAD') return true;
    return entityId === truth.emp.id;
  }
  if (moduleId === 'finance') {
    return truth.division === 'FINANCE';
  }
  if (moduleId === 'aset') {
    return truth.division === 'FINANCE' || truth.division === 'TEKNIK';
  }
  if (moduleId === 'dokumen') {
    if (entityId === 'dokumen-arsip' || entityId.startsWith('doc-draft-')) return true;
    const doc = (db.documents || []).find((d) => d.id === entityId);
    if (!doc) return true;
    if (['Disetujui', 'Selesai', 'Diarsipkan', 'Dibatalkan'].includes(doc.status) || doc.is_final_locked) {
      return false;
    }
    return (
      doc.creator_id === truth.emp.id ||
      (truth.role === 'HEAD' &&
        (doc.division_id === truth.emp.division_id ||
          truth.division === 'DIREKSI' ||
          truth.division === 'FINANCE'))
    );
  }
  const allowedModules = getAllowedModulesForActor(truth.role, truth.division);
  return allowedModules.includes(moduleId);
}

function canMutateAttachment(actor: ActorContext, record: AttachmentRecord): boolean {
  const db = ensureOperationalDb();
  const truth = resolveActorDbTruth(db, actor);
  if (!truth) return false;
  if (truth.role === 'SUPER_ADMIN') return true;
  if (record.module_id === 'teknik') {
    if (!hasTeknikModuleAccess(truth.role, truth.division)) return false;
    return truth.role === 'HEAD' || record.uploaded_by_id === truth.emp.id;
  }
  if (record.module_id === 'logistik') {
    if (!hasLogistikModuleAccess(truth.role, truth.division)) return false;
    return truth.role === 'HEAD' || record.uploaded_by_id === truth.emp.id;
  }
  if (record.module_id === 'aset') {
    return truth.division === 'FINANCE' || record.uploaded_by_id === truth.emp.id;
  }
  if (record.module_id === 'dokumen') {
    const doc = (db.documents || []).find((d) => d.id === record.entity_id);
    if (
      doc &&
      (['Disetujui', 'Selesai', 'Diarsipkan', 'Dibatalkan'].includes(doc.status) || doc.is_final_locked)
    ) {
      return false;
    }
    if (truth.role === 'HEAD') {
      return !doc || doc.division_id === truth.emp.division_id || truth.division === 'DIREKSI';
    }
    return record.uploaded_by_id === truth.emp.id;
  }
  if (truth.role === 'HEAD') {
    if (record.module_id === 'finance') return truth.division === 'FINANCE';
    if (record.module_id === 'karyawan') return record.division_id === truth.emp.division_id;
    return canViewAttachment(actor, record);
  }
  return record.uploaded_by_id === truth.emp.id;
}

function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length === 0) return false;
  const hex = buffer.subarray(0, 12).toString('hex').toLowerCase();

  if (ext === 'pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (ext === 'png') {
    return hex.startsWith('89504e470d0a1a0a');
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    return hex.startsWith('ffd8ff');
  }
  if (ext === 'webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (ext === 'zip' || ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    return hex.startsWith('504b0304') || hex.startsWith('504b0506') || hex.startsWith('504b0708');
  }
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    return hex.startsWith('d0cf11e0a1b11ae1');
  }
  return false;
}

function appendFileAudit(entry: Omit<FileAuditLog, 'id' | 'timestamp'>) {
  const logs = readJson<FileAuditLog[]>(AUDIT_FILE, []);
  const next: FileAuditLog = {
    ...entry,
    id: `faud-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    timestamp: new Date().toISOString(),
  };
  writeJson(AUDIT_FILE, [next, ...logs].slice(0, 500));
}

function signAccessToken(attachmentId: string, actorId: string, expiresAtMs: number): string {
  const payload = `${attachmentId}:${actorId}:${expiresAtMs}`;
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyAccessToken(token: string, expectedAttachmentId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [attId, actorId, expStr, sig] = parts;
    if (attId !== expectedAttachmentId) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expectedSig = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${attId}:${actorId}:${exp}`)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

function sanitizeOriginalFilename(name: string): string {
  return path.basename(name).replace(/[\r\n<>:"/\\|?*]+/g, '_').slice(0, 180) || 'lampiran';
}

async function createAppServer() {
  initializeSeedStorage();

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024, // hard ceiling 100MB before dynamic config validation
      files: 25,
    },
  });

  // CORS & Security headers for API responses
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-pms-employee-id, x-pms-nik, x-pms-role, x-pms-division, x-pms-division-id, x-pms-name, x-pms-name-encoded'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'pms-konstruksi-files' });
  });

  // Android APK Metadata & Direct Binary Download
  const APK_FILE_PATH = path.resolve(__dirname, 'downloads', 'pms-konstruksi.apk');
  const getApkInspection = () => {
    try {
      if (!fs.existsSync(APK_FILE_PATH)) return null;
      const stat = fs.statSync(APK_FILE_PATH);
      if (!stat.isFile() || stat.size < 1024) return null;
      const fd = fs.openSync(APK_FILE_PATH, 'r');
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);
      // APK is a ZIP archive starting with PK\x03\x04
      if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
        return null;
      }
      return {
        sizeBytes: stat.size,
        builtAt: stat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  };

  app.get('/api/app-package/info', (_req: Request, res: Response) => {
    const info = getApkInspection();
    res.json({
      available: Boolean(info),
      appName: 'PMS KONSTRUKSI',
      version: '1.0.0',
      versionCode: 1,
      packageId: 'id.pmskonstruksi.app',
      fileName: 'pms-konstruksi.apk',
      downloadUrl: '/downloads/pms-konstruksi.apk',
      sizeBytes: info?.sizeBytes ?? 0,
      builtAt: info?.builtAt ?? null,
    });
  });

  app.get('/downloads/pms-konstruksi.apk', (_req: Request, res: Response) => {
    const info = getApkInspection();
    if (!info) {
      res.status(404).json({
        available: false,
        message: 'File APK PMS KONSTRUKSI belum dibuat atau belum tersedia di server.',
      });
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="pms-konstruksi.apk"');
    res.setHeader('Content-Length', String(info.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(APK_FILE_PATH).pipe(res);
  });

  // Get Upload Configuration & Storage Summary
  app.get('/api/attachments/config', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi pengguna diperlukan.' });
      return;
    }
    const config = readJson<UploadConfig>(CONFIG_FILE, getDefaultConfig());
    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const totalBytes = db.reduce((acc, item) => acc + item.size_bytes, 0);
    res.json({
      config,
      stats: {
        totalFiles: db.length,
        totalBytes,
        masterAllowedExtensions: MASTER_ALLOWED_EXTENSIONS,
      },
    });
  });

  // Update Upload Configuration (Super Admin / Head)
  app.put('/api/attachments/config', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi pengguna diperlukan.' });
      return;
    }
    if (actor.roleCode !== 'SUPER_ADMIN' && actor.roleCode !== 'HEAD') {
      res.status(403).json({ message: 'Hanya Super Admin atau Head yang dapat mengubah konfigurasi upload.' });
      return;
    }

    const body = req.body as Partial<UploadConfig>;
    const current = readJson<UploadConfig>(CONFIG_FILE, getDefaultConfig());

    const maxFileSizeMb = Math.min(50, Math.max(1, Number(body.maxFileSizeMb ?? current.maxFileSizeMb)));
    const maxFilesPerBatch = Math.min(20, Math.max(1, Number(body.maxFilesPerBatch ?? current.maxFilesPerBatch)));
    const requestedExts = Array.isArray(body.allowedExtensions)
      ? body.allowedExtensions.map((e) => String(e).toLowerCase().trim()).filter((e) => MASTER_ALLOWED_EXTENSIONS.includes(e))
      : current.allowedExtensions;

    if (requestedExts.length === 0) {
      res.status(400).json({ message: 'Minimal satu ekstensi file harus diizinkan.' });
      return;
    }

    const updated: UploadConfig = {
      maxFileSizeMb,
      maxFilesPerBatch,
      allowedExtensions: Array.from(new Set(requestedExts)),
      requireDescription: Boolean(body.requireDescription ?? current.requireDescription),
      updatedAt: new Date().toISOString(),
      updatedBy: `${actor.fullName} (${actor.nik})`,
    };

    writeJson(CONFIG_FILE, updated);
    appendFileAudit({
      action: 'CONFIG_UPDATE',
      file_name: 'upload-config.json',
      module_id: 'pengaturan',
      entity_id: 'config',
      actor_id: actor.employeeId,
      actor_name: actor.fullName,
      actor_role: actor.roleCode,
      actor_division: actor.divisionCode,
      detail: `Batas ukuran ${updated.maxFileSizeMb} MB, maks ${updated.maxFilesPerBatch} file/batch`,
    });

    res.json({ config: updated });
  });

  // Get File Audit Logs
  app.get('/api/attachments/audit', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const logs = readJson<FileAuditLog[]>(AUDIT_FILE, []);
    const visible =
      actor.roleCode === 'SUPER_ADMIN'
        ? logs
        : actor.roleCode === 'HEAD'
        ? logs.filter((l) => l.actor_division === actor.divisionCode || l.actor_id === actor.employeeId)
        : logs.filter((l) => l.actor_id === actor.employeeId);
    res.json({ logs: visible });
  });

  // List Attachments (filtered by RBAC, module_id, entity_id, category, search)
  app.get('/api/attachments', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi pengguna diperlukan.' });
      return;
    }
    const moduleId = req.query.module_id ? String(req.query.module_id) : '';
    const entityId = req.query.entity_id ? String(req.query.entity_id) : '';
    const category = req.query.category ? String(req.query.category) : '';
    const search = req.query.search ? String(req.query.search).toLowerCase().trim() : '';

    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const filtered = db.filter((item) => {
      if (!canViewAttachment(actor, item)) return false;
      if (moduleId && item.module_id !== moduleId) return false;
      if (entityId && item.entity_id !== entityId) return false;
      if (category && category !== 'SEMUA' && item.doc_category !== category) return false;
      if (search) {
        const hit =
          item.original_name.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search) ||
          item.doc_category.toLowerCase().includes(search) ||
          item.uploaded_by_name.toLowerCase().includes(search);
        if (!hit) return false;
      }
      return true;
    });

    res.json({ attachments: filtered });
  });

  // Upload Single or Multiple Files
  app.post('/api/attachments/upload', uploadMemory.array('files', 25), (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Sesi pengguna tidak valid untuk mengunggah file.' });
      return;
    }

    const config = readJson<UploadConfig>(CONFIG_FILE, getDefaultConfig());
    const files = (req.files as Express.Multer.File[]) || [];
    const moduleId = String(req.body.module_id || '').trim();
    const entityId = String(req.body.entity_id || '').trim();
    const entityLabel = String(req.body.entity_label || '').trim();
    const docCategory = String(req.body.doc_category || 'Lampiran Umum').trim();
    const description = String(req.body.description || '').trim();
    const divisionId = String(req.body.division_id || actor.divisionId).trim();

    if (!moduleId || !entityId) {
      res.status(400).json({ message: 'ID modul dan ID data terkait wajib disertakan.' });
      return;
    }

    if (!canUploadToTarget(actor, moduleId, entityId)) {
      res.status(403).json({ message: 'Anda tidak memiliki hak akses upload pada modul/data ini.' });
      return;
    }

    if (files.length === 0) {
      res.status(400).json({ message: 'Tidak ada file yang dipilih untuk diunggah.' });
      return;
    }

    if (files.length > config.maxFilesPerBatch) {
      res.status(400).json({
        message: `Maksimal ${config.maxFilesPerBatch} file dalam satu kali upload.`,
      });
      return;
    }

    if (config.requireDescription && !description) {
      res.status(400).json({ message: 'Keterangan file wajib diisi sesuai pengaturan sistem.' });
      return;
    }

    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    const errors: string[] = [];

    for (const f of files) {
      const ext = resolveAttachmentExt(f.originalname, f.mimetype);
      if (!ext || !config.allowedExtensions.includes(ext)) {
        errors.push(`"${f.originalname}": ekstensi .${ext || '?'} tidak diizinkan.`);
        continue;
      }
      if (f.size > maxBytes) {
        errors.push(
          `"${f.originalname}": ukuran ${(f.size / (1024 * 1024)).toFixed(2)} MB melebihi batas ${config.maxFileSizeMb} MB.`
        );
        continue;
      }
      if (!isAllowedUploadMime(ext, f.mimetype)) {
        errors.push(`"${f.originalname}": MIME type (${f.mimetype}) tidak valid untuk .${ext}.`);
        continue;
      }
      if (!validateMagicBytes(f.buffer, ext)) {
        errors.push(
          `"${f.originalname}": isi file tidak sesuai format .${ext} yang aman (ditolak oleh validasi keamanan).`
        );
        continue;
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ message: errors.join(' ') });
      return;
    }

    ensureStorageDirs();
    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const created: AttachmentRecord[] = [];
    const now = new Date().toISOString();

    for (const f of files) {
      const ext = resolveAttachmentExt(f.originalname, f.mimetype);
      const canonicalMime = getCanonicalMimeType(ext, f.mimetype);
      const safeOriginal = sanitizeOriginalFilename(f.originalname);
      const storageName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const absPath = path.join(UPLOADS_DIR, storageName);
      fs.writeFileSync(absPath, f.buffer);
      if (!fs.existsSync(absPath) || fs.statSync(absPath).size === 0) {
        res.status(500).json({ message: `Gagal menyimpan file "${safeOriginal}" ke storage server.` });
        return;
      }

      const isSensitive =
        SENSITIVE_MODULES.has(moduleId) ||
        /ktp|kontrak|invoice|kwitansi|transfer|bukti|faktur/i.test(docCategory + ' ' + safeOriginal);

      const record: AttachmentRecord = {
        id: `att-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        original_name: safeOriginal,
        storage_name: storageName,
        extension: ext,
        mime_type: canonicalMime,
        size_bytes: f.size,
        storage_path: `storage/uploads/${storageName}`,
        module_id: moduleId,
        entity_id: entityId,
        entity_label: entityLabel || undefined,
        doc_category: docCategory,
        uploaded_by_id: actor.employeeId,
        uploaded_by_name: actor.fullName,
        division_id: divisionId,
        uploaded_at: now,
        description: description || `Lampiran ${docCategory}`,
        status: 'Aktif',
        is_sensitive: isSensitive,
        version: 1,
        versions: [
          {
            version: 1,
            original_name: safeOriginal,
            storage_name: storageName,
            size_bytes: f.size,
            mime_type: canonicalMime,
            uploaded_by_id: actor.employeeId,
            uploaded_by_name: actor.fullName,
            uploaded_at: now,
            note: description || 'Versi awal diunggah',
          },
        ],
      };

      created.push(record);
      appendFileAudit({
        action: 'UPLOAD',
        attachment_id: record.id,
        file_name: safeOriginal,
        module_id: moduleId,
        entity_id: entityId,
        actor_id: actor.employeeId,
        actor_name: actor.fullName,
        actor_role: actor.roleCode,
        actor_division: actor.divisionCode,
        detail: `Mengunggah ${safeOriginal} (${(f.size / 1024).toFixed(1)} KB) ke ${moduleId}/${entityId}`,
      });
    }

    writeJson(DB_FILE, [...created, ...db]);
    res.status(201).json({ attachments: created });
  });

  // Upload New Version of an Existing Document
  app.post('/api/attachments/:id/version', uploadMemory.single('file'), (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }

    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const idx = db.findIndex((item) => item.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Lampiran tidak ditemukan.' });
      return;
    }

    const target = db[idx];
    if (!canMutateAttachment(actor, target) && !canUploadToTarget(actor, target.module_id, target.entity_id)) {
      res.status(403).json({ message: 'Anda tidak berwenang memperbarui versi dokumen ini.' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'Pilih file versi terbaru terlebih dahulu.' });
      return;
    }

    const config = readJson<UploadConfig>(CONFIG_FILE, getDefaultConfig());
    const ext = resolveAttachmentExt(file.originalname, file.mimetype);
    if (!ext || !config.allowedExtensions.includes(ext)) {
      res.status(400).json({ message: `Ekstensi .${ext} tidak diizinkan.` });
      return;
    }
    if (file.size > config.maxFileSizeMb * 1024 * 1024) {
      res.status(400).json({ message: `Ukuran file melebihi batas ${config.maxFileSizeMb} MB.` });
      return;
    }
    if (!isAllowedUploadMime(ext, file.mimetype) || !validateMagicBytes(file.buffer, ext)) {
      res.status(400).json({ message: 'File tidak lolos validasi keamanan MIME/signature.' });
      return;
    }

    const canonicalMime = getCanonicalMimeType(ext, file.mimetype);
    const safeOriginal = sanitizeOriginalFilename(file.originalname);
    const storageName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, storageName), file.buffer);

    const nextVersion = target.version + 1;
    const note = String(req.body.note || `Pembaruan versi v${nextVersion}`).trim();
    const now = new Date().toISOString();

    const updated: AttachmentRecord = {
      ...target,
      original_name: safeOriginal,
      storage_name: storageName,
      extension: ext,
      mime_type: canonicalMime,
      size_bytes: file.size,
      storage_path: `storage/uploads/${storageName}`,
      uploaded_at: now,
      version: nextVersion,
      versions: [
        {
          version: nextVersion,
          original_name: safeOriginal,
          storage_name: storageName,
          size_bytes: file.size,
          mime_type: canonicalMime,
          uploaded_by_id: actor.employeeId,
          uploaded_by_name: actor.fullName,
          uploaded_at: now,
          note,
        },
        ...target.versions,
      ],
    };

    db[idx] = updated;
    writeJson(DB_FILE, db);
    appendFileAudit({
      action: 'NEW_VERSION',
      attachment_id: updated.id,
      file_name: safeOriginal,
      module_id: updated.module_id,
      entity_id: updated.entity_id,
      actor_id: actor.employeeId,
      actor_name: actor.fullName,
      actor_role: actor.roleCode,
      actor_division: actor.divisionCode,
      detail: `Mengunggah versi v${nextVersion} untuk ${safeOriginal}`,
    });

    res.json({ attachment: updated });
  });

  // Update Metadata (Description / Category / Status)
  app.patch('/api/attachments/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }

    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const idx = db.findIndex((item) => item.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Lampiran tidak ditemukan.' });
      return;
    }

    const target = db[idx];
    if (!canMutateAttachment(actor, target)) {
      res.status(403).json({ message: 'Anda tidak memiliki izin mengubah keterangan file ini.' });
      return;
    }

    const body = req.body as {
      description?: string;
      doc_category?: string;
      status?: 'Aktif' | 'Diarsipkan';
      delete_reason?: string;
    };

    const isArchiving = body.status === 'Diarsipkan' && target.status !== 'Diarsipkan';
    const isRestoring = body.status === 'Aktif' && target.status === 'Diarsipkan';

    if (isRestoring && actor.roleCode !== 'SUPER_ADMIN' && actor.roleCode !== 'HEAD') {
      res.status(403).json({
        message: 'Hanya Super Admin atau Head Divisi yang berwenang memulihkan dokumen terarsip.',
      });
      return;
    }

    const updated: AttachmentRecord = {
      ...target,
      description: body.description !== undefined ? String(body.description).trim() : target.description,
      doc_category: body.doc_category !== undefined ? String(body.doc_category).trim() : target.doc_category,
      status: body.status === 'Diarsipkan' ? 'Diarsipkan' : 'Aktif',
      deleted_at: isArchiving
        ? new Date().toISOString()
        : isRestoring
        ? undefined
        : target.deleted_at,
      deleted_by_id: isArchiving
        ? actor.employeeId
        : isRestoring
        ? undefined
        : target.deleted_by_id,
      deleted_by_name: isArchiving
        ? actor.fullName
        : isRestoring
        ? undefined
        : target.deleted_by_name,
      delete_reason: isArchiving
        ? String(body.delete_reason || 'Diarsipkan oleh pengguna').trim()
        : isRestoring
        ? undefined
        : target.delete_reason,
    };

    db[idx] = updated;
    writeJson(DB_FILE, db);
    appendFileAudit({
      action: isArchiving ? 'ARCHIVE' : isRestoring ? 'RESTORE' : 'UPDATE_META',
      attachment_id: updated.id,
      file_name: updated.original_name,
      module_id: updated.module_id,
      entity_id: updated.entity_id,
      actor_id: actor.employeeId,
      actor_name: actor.fullName,
      actor_role: actor.roleCode,
      actor_division: actor.divisionCode,
      detail: isArchiving
        ? `Mengarsipkan (soft delete) ${updated.original_name}. Alasan: ${updated.delete_reason}`
        : isRestoring
        ? `Memulihkan dokumen ${updated.original_name} dari arsip`
        : `Memperbarui keterangan/kategori lampiran ${updated.original_name}`,
    });

    res.json({ attachment: updated });
  });

  // Issue Temporary Signed Access URL (5 minutes TTL)
  app.get('/api/attachments/:id/sign', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const target = db.find((item) => item.id === req.params.id);
    if (!target) {
      res.status(404).json({ message: 'File tidak ditemukan.' });
      return;
    }
    if (!canViewAttachment(actor, target)) {
      res.status(403).json({ message: 'Akses ditolak: Anda tidak berwenang mengakses dokumen privat ini.' });
      return;
    }
    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const token = signAccessToken(target.id, actor.employeeId, expiresAt);
    const url = `/api/attachments/${target.id}/content?token=${encodeURIComponent(token)}&disposition=${disposition}`;
    res.json({ url, expiresAt });
  });

  // Stream Private File Content (Protected by Signed Token OR Auth Headers + RBAC)
  app.get('/api/attachments/:id/content', (req: Request, res: Response) => {
    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const target = db.find((item) => item.id === req.params.id);
    if (!target) {
      res.status(404).json({ message: 'File tidak ditemukan.' });
      return;
    }

    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const actor = getActor(req);
    const tokenValid = token ? verifyAccessToken(token, target.id) : false;

    if (!tokenValid) {
      if (!actor) {
        res.status(401).json({ message: 'Akses file privat ditolak: token sementara atau sesi tidak valid.' });
        return;
      }
      if (!canViewAttachment(actor, target)) {
        res.status(403).json({ message: 'Akses ditolak berdasarkan hak akses role dan divisi.' });
        return;
      }
    }

    const storageFile =
      typeof req.query.storage_name === 'string' &&
      target.versions.some((v) => v.storage_name === req.query.storage_name)
        ? String(req.query.storage_name)
        : target.storage_name;

    let absPath = path.resolve(UPLOADS_DIR, path.basename(storageFile));
    if ((!absPath.startsWith(UPLOADS_DIR) || !fs.existsSync(absPath)) && target.storage_path) {
      const candidatePath = path.resolve(__dirname, target.storage_path);
      if (candidatePath.startsWith(STORAGE_ROOT) && fs.existsSync(candidatePath)) {
        absPath = candidatePath;
      }
    }
    if (!absPath.startsWith(STORAGE_ROOT) || !fs.existsSync(absPath)) {
      res.status(404).json({ message: 'Berkas fisik tidak ditemukan di penyimpanan.' });
      return;
    }

    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size === 0) {
      res.status(422).json({ message: 'Berkas fisik kosong atau rusak.' });
      return;
    }

    const ext = (target.extension || path.extname(storageFile).replace('.', '')).toLowerCase();
    if (ext === 'pdf') {
      const fd = fs.openSync(absPath, 'r');
      const sigBuf = Buffer.alloc(5);
      try {
        fs.readSync(fd, sigBuf, 0, 5, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (sigBuf.toString('ascii') !== '%PDF-') {
        res.status(422).json({ message: 'Berkas PDF tidak valid atau corrupt (signature %PDF- tidak ditemukan).' });
        return;
      }
    }

    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const safeDownloadName = encodeURIComponent(target.original_name);
    const contentType = getCanonicalMimeType(ext, target.mime_type);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${target.original_name.replace(/"/g, '')}"; filename*=UTF-8''${safeDownloadName}`
    );

    if (actor) {
      appendFileAudit({
        action: disposition === 'attachment' ? 'DOWNLOAD' : 'PREVIEW',
        attachment_id: target.id,
        file_name: target.original_name,
        module_id: target.module_id,
        entity_id: target.entity_id,
        actor_id: actor.employeeId,
        actor_name: actor.fullName,
        actor_role: actor.roleCode,
        actor_division: actor.divisionCode,
        detail: `${disposition === 'attachment' ? 'Mengunduh' : 'Membuka preview'} ${target.original_name}`,
      });
    }

    const stream = fs.createReadStream(absPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ message: 'Gagal membaca berkas dari penyimpanan.' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  // Delete Attachment
  app.delete('/api/attachments/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }

    const db = readJson<AttachmentRecord[]>(DB_FILE, []);
    const idx = db.findIndex((item) => item.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Lampiran tidak ditemukan.' });
      return;
    }

    const target = db[idx];
    if (!canMutateAttachment(actor, target)) {
      res.status(403).json({ message: 'Anda tidak berwenang menghapus lampiran ini.' });
      return;
    }

    // Remove all stored versions from disk safely
    for (const v of target.versions) {
      const absPath = path.resolve(UPLOADS_DIR, path.basename(v.storage_name));
      if (absPath.startsWith(UPLOADS_DIR) && fs.existsSync(absPath)) {
        try {
          fs.unlinkSync(absPath);
        } catch {
          // ignore unlink error
        }
      }
    }

    const nextDb = db.filter((item) => item.id !== target.id);
    writeJson(DB_FILE, nextDb);

    appendFileAudit({
      action: 'DELETE',
      attachment_id: target.id,
      file_name: target.original_name,
      module_id: target.module_id,
      entity_id: target.entity_id,
      actor_id: actor.employeeId,
      actor_name: actor.fullName,
      actor_role: actor.roleCode,
      actor_division: actor.divisionCode,
      detail: `Menghapus permanen ${target.original_name} dari ${target.module_id}/${target.entity_id}`,
    });

    res.json({ ok: true, id: target.id });
  });

  // ============================================================================
  // INTEGRATED 5-STAGE OPERATIONAL WORKFLOW API
  // TIM TEKNIK -> TIM FINANCE -> TIM LOGISTIK -> TIM LAPANGAN -> MONITORING
  // ============================================================================

  app.get('/api/workflow/state', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan untuk memuat data operasional.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }
    res.json({ state: sanitizeStateForActor(db, truth) });
  });

  app.put('/api/workflow/sync-core', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const incoming = req.body as Partial<PMSState>;
    const current = ensureOperationalDb();
    const truth = resolveActorDbTruth(current, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }
    const canMutateTeknikData = hasTeknikModuleAccess(truth.role, truth.division);

    const merged: PMSState = {
      ...current,
      employees: Array.isArray(incoming.employees) ? incoming.employees : current.employees,
      accounts: Array.isArray(incoming.accounts) ? incoming.accounts : current.accounts,
      projects:
        Array.isArray(incoming.projects) &&
        (incoming.projects.length > 0 || current.projects.length === 0)
          ? incoming.projects
          : current.projects,
      contracts: Array.isArray(incoming.contracts) ? incoming.contracts : current.contracts,
      contractTerms: Array.isArray(incoming.contractTerms)
        ? incoming.contractTerms
        : current.contractTerms,
      termClaims: Array.isArray(incoming.termClaims) ? incoming.termClaims : current.termClaims || [],
      termPayments: Array.isArray(incoming.termPayments) ? incoming.termPayments : current.termPayments || [],
      contractAddendums: Array.isArray(incoming.contractAddendums)
        ? incoming.contractAddendums
        : current.contractAddendums || [],
      budgets: Array.isArray(incoming.budgets) ? incoming.budgets : current.budgets,
      workItems:
        canMutateTeknikData && Array.isArray(incoming.workItems)
          ? incoming.workItems
          : current.workItems,
      materials: Array.isArray(incoming.materials) ? incoming.materials : current.materials,
      materialRequests: Array.isArray(incoming.materialRequests)
        ? incoming.materialRequests
        : current.materialRequests,
      materialTransactions: Array.isArray(incoming.materialTransactions)
        ? incoming.materialTransactions
        : current.materialTransactions,
      companyAssets: Array.isArray(incoming.companyAssets)
        ? incoming.companyAssets
        : current.companyAssets,
      assetMovements: Array.isArray(incoming.assetMovements)
        ? incoming.assetMovements
        : current.assetMovements,
      maintenanceRecords: Array.isArray(incoming.maintenanceRecords)
        ? incoming.maintenanceRecords
        : current.maintenanceRecords,
      financialTransactions: Array.isArray(incoming.financialTransactions)
        ? incoming.financialTransactions
        : current.financialTransactions,
      documents: current.documents || [],
      approvals: Array.isArray(incoming.approvals) ? incoming.approvals : current.approvals,
      notifications: Array.isArray(incoming.notifications)
        ? incoming.notifications
        : current.notifications,
      activityLogs: Array.isArray(incoming.activityLogs)
        ? incoming.activityLogs
        : current.activityLogs,
      offlineDrafts: Array.isArray(incoming.offlineDrafts)
        ? incoming.offlineDrafts
        : current.offlineDrafts,
      projectMaterials: Array.isArray(incoming.projectMaterials)
        ? incoming.projectMaterials
        : current.projectMaterials || [],
      workflows: current.workflows,
      warehouses: current.warehouses || [],
      warehouseOrders: current.warehouseOrders || [],
      stockOpnames: current.stockOpnames || [],
      warehouseAuditLogs: current.warehouseAuditLogs || [],
      deliveryNotes: current.deliveryNotes || [],
      projectAssets: current.projectAssets || [],
      projectAssetReports: current.projectAssetReports || [],
      projectAssetHistories: current.projectAssetHistories || [],
      financeBills: current.financeBills || [],
      teknikEvaluations: current.teknikEvaluations || [],
      teknikConstraints: current.teknikConstraints || [],
      teknikChanges: current.teknikChanges || [],
      teknikCompletions: current.teknikCompletions || [],
      teknikProgressAssessments: current.teknikProgressAssessments || [],
    };
    migrateWarehouseLocationsAndBekasiToDepok(merged);

    const incomingWorkflows = Array.isArray(incoming.workflows) ? incoming.workflows : [];
    for (const prj of merged.projects) {
      if (!merged.workflows.some((w) => w.project_id === prj.id)) {
        const matched = incomingWorkflows.find((w) => w.project_id === prj.id);
        merged.workflows.push(matched ?? createDefaultWorkflowForProject(prj));
      }
    }

    saveOperationalDb(merged);
    res.json({ state: sanitizeStateForActor(merged, truth) });
  });

  // PROJECTS CRUD ENDPOINTS (Persisted directly to operational DB)
  app.post('/api/projects', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan untuk menambah proyek.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' && actor.divisionCode === 'TEKNIK');
    if (!allowed) {
      res.status(403).json({
        message: 'Hanya Super Admin atau Head Divisi Teknik yang berwenang membuat proyek baru.',
      });
      return;
    }

    const body = req.body as Partial<Project>;
    const projectNumber = String(body.project_number || '').trim();
    const name = String(body.name || '').trim();
    const clientName = String(body.client_name || '').trim();
    const location = String(body.location || '').trim();
    const startDate = String(body.start_date || '').trim();
    const targetEndDate = String(body.target_end_date || '').trim();
    const description = String(body.description || '').trim();
    const contractValue = Number(body.contract_value ?? 0);

    if (!projectNumber || !name || !clientName || !location || !startDate || !targetEndDate) {
      res.status(400).json({
        message: 'Kode proyek, nama proyek, instansi/klien, lokasi, dan jadwal wajib diisi.',
      });
      return;
    }
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      res.status(400).json({ message: 'Nilai kontrak/anggaran proyek tidak valid.' });
      return;
    }

    const db = ensureOperationalDb();
    const duplicate = db.projects.find(
      (p) => !p.is_deleted && p.project_number.trim().toLowerCase() === projectNumber.toLowerCase()
    );
    if (duplicate) {
      res.status(409).json({
        message: `Kode proyek "${projectNumber}" sudah terdaftar. Gunakan tombol Generate Ulang untuk kode baru.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const newId = `prj-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
    const picEmployeeId =
      String(body.pic_employee_id || '').trim() ||
      db.employees.find((e) => e.division_id === 'div-teknik' && e.status === 'Aktif')?.id ||
      actor.employeeId;

    const createdProject: Project = {
      id: newId,
      project_number: projectNumber,
      name,
      client_name: clientName,
      work_type: body.work_type || 'Pembangunan',
      location,
      pic_employee_id: picEmployeeId,
      division_ids:
        Array.isArray(body.division_ids) && body.division_ids.length > 0
          ? body.division_ids
          : ['div-teknik', 'div-logistik', 'div-finance'],
      start_date: startDate,
      target_end_date: targetEndDate,
      status: body.status || 'Perencanaan',
      contract_value: contractValue,
      progress_percent: Number.isFinite(Number(body.progress_percent))
        ? Math.max(0, Math.min(100, Number(body.progress_percent)))
        : 0,
      image_url: String(body.image_url || '').trim(),
      description: description || `Pekerjaan ${name}`,
    };

    const initialStage: WorkflowStage =
      createdProject.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK';

    const newWorkflow: ProjectWorkflow = {
      id: `wf-${newId}`,
      project_id: newId,
      stage: initialStage,
      submitter_id: actor.employeeId || picEmployeeId,
      submitter_name: actor.fullName,
      submitter_division_id: actor.divisionId || 'div-teknik',
      approved_budget_limit: 0,
      work_cost_estimate: 0,
      schedule_start: createdProject.start_date,
      schedule_end: createdProject.target_end_date,
      material_needs: [],
      procurements: [],
      field_reports: [],
      history: [
        makeHistoryEntry(
          actor,
          null,
          initialStage,
          'Proyek Dibuat',
          `Proyek ${createdProject.project_number} (${createdProject.work_type ?? 'Pembangunan'}) didaftarkan dalam sistem.`
        ),
      ],
      updated_at: now,
    };

    db.projects = [createdProject, ...db.projects];
    db.workflows = [newWorkflow, ...db.workflows];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Proyek Baru',
        `Menambahkan proyek ${createdProject.project_number} — ${createdProject.name}`,
        createdProject.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ project: createdProject, workflow: newWorkflow, state: db });
  });

  app.put('/api/projects/:projectId', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan untuk memperbarui proyek.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' && actor.divisionCode === 'TEKNIK');
    if (!allowed) {
      res.status(403).json({
        message: 'Hanya Super Admin atau Head Divisi Teknik yang berwenang memperbarui proyek.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const targetIdx = db.projects.findIndex((p) => p.id === req.params.projectId);
    if (targetIdx === -1) {
      res.status(404).json({ message: 'Data proyek tidak ditemukan.' });
      return;
    }

    const existing = db.projects[targetIdx];
    const body = req.body as Partial<Project>;
    const updated: Project = {
      ...existing,
      ...body,
      id: existing.id,
      project_number: String(body.project_number ?? existing.project_number).trim() || existing.project_number,
      name: String(body.name ?? existing.name).trim() || existing.name,
      client_name: String(body.client_name ?? existing.client_name).trim() || existing.client_name,
      location: String(body.location ?? existing.location).trim() || existing.location,
      contract_value: Number.isFinite(Number(body.contract_value))
        ? Math.max(0, Number(body.contract_value))
        : existing.contract_value,
    };

    db.projects[targetIdx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembaruan Proyek',
        `Memperbarui data proyek ${updated.project_number}`,
        updated.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ project: updated, state: db });
  });

  // STAGE 1: TIM TEKNIK — Prepare/Update Project, RAB, Material Needs, Work Cost & Schedule
  app.post('/api/workflow/teknik/prepare', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const teknikTruth = resolveTeknikActorTruth(db, actor);
    if (!teknikTruth) {
      res.status(403).json({
        message: 'Hanya Head Teknik, Staff Teknik, atau Super Admin yang dapat menyiapkan dokumen & kebutuhan proyek.',
      });
      return;
    }

    const body = req.body as {
      projectId: string;
      projectPatch?: Partial<Project>;
      upsertBudgetItem?: Omit<BudgetItem, 'id'> & { id?: string };
      removeBudgetId?: string;
      work_cost_estimate?: number;
      schedule_start?: string;
      schedule_end?: string;
      material_needs?: Array<{ id?: string; material_id: string; qty_needed: number; notes?: string }>;
    };

    const projectIdx = db.projects.findIndex((p) => p.id === body.projectId);
    if (projectIdx === -1) {
      res.status(404).json({ message: 'Data proyek tidak ditemukan.' });
      return;
    }

    const project = db.projects[projectIdx];
    let wfIdx = db.workflows.findIndex((w) => w.project_id === project.id);
    if (wfIdx === -1) {
      db.workflows.push(createDefaultWorkflowForProject(project));
      wfIdx = db.workflows.length - 1;
    }
    const wf = db.workflows[wfIdx];

    if (
      actor.roleCode !== 'SUPER_ADMIN' &&
      !['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE'].includes(wf.stage)
    ) {
      res.status(400).json({
        message: `Proyek berada pada tahap "${wf.stage}" dan tidak dapat diubah sebelum dikembalikan ke Tim Teknik.`,
      });
      return;
    }

    if (body.projectPatch) {
      db.projects[projectIdx] = {
        ...project,
        ...body.projectPatch,
        id: project.id,
        start_date: body.schedule_start || body.projectPatch.start_date || project.start_date,
        target_end_date:
          body.schedule_end || body.projectPatch.target_end_date || project.target_end_date,
      };
    } else if (body.schedule_start || body.schedule_end) {
      db.projects[projectIdx] = {
        ...project,
        start_date: body.schedule_start || project.start_date,
        target_end_date: body.schedule_end || project.target_end_date,
      };
    }

    if (body.removeBudgetId) {
      db.budgets = db.budgets.filter((b) => b.id !== body.removeBudgetId);
    }

    if (body.upsertBudgetItem) {
      const bItem = body.upsertBudgetItem;
      const totalCost =
        bItem.total_cost > 0 ? bItem.total_cost : Number(bItem.volume || 0) * Number(bItem.unit_price || 0);
      if (bItem.id && db.budgets.some((b) => b.id === bItem.id)) {
        db.budgets = db.budgets.map((b) =>
          b.id === bItem.id ? { ...b, ...bItem, total_cost: totalCost } : b
        );
      } else {
        db.budgets = [
          {
            ...bItem,
            id: `rab-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
            project_id: project.id,
            total_cost: totalCost,
          },
          ...db.budgets,
        ];
      }
    }

    let nextNeeds = wf.material_needs;
    if (Array.isArray(body.material_needs)) {
      nextNeeds = body.material_needs
        .filter((n) => n.material_id && Number(n.qty_needed) > 0)
        .map((n) => {
          const existing = wf.material_needs.find((ex) => ex.material_id === n.material_id);
          const mat = db.materials.find((m) => m.id === n.material_id);
          return {
            id: n.id || existing?.id || `wmn-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
            material_id: n.material_id,
            qty_needed: Number(n.qty_needed),
            qty_reserved: existing?.qty_reserved ?? 0,
            qty_issued: existing?.qty_issued ?? 0,
            qty_used: existing?.qty_used ?? 0,
            qty_procured: existing?.qty_procured ?? 0,
            estimated_unit_cost: mat?.unit_cost ?? existing?.estimated_unit_cost ?? 0,
            procurement_status: existing?.procurement_status ?? 'Belum Dicek',
            notes: n.notes ?? existing?.notes ?? '',
          };
        });
    }

    const rabTotal = db.budgets
      .filter((b) => b.project_id === project.id)
      .reduce((acc, b) => acc + b.total_cost, 0);

    const updatedWf: ProjectWorkflow = {
      ...wf,
      submitter_id: actor.employeeId,
      submitter_name: actor.fullName,
      schedule_start: body.schedule_start || wf.schedule_start || db.projects[projectIdx].start_date,
      schedule_end:
        body.schedule_end || wf.schedule_end || db.projects[projectIdx].target_end_date,
      work_cost_estimate:
        typeof body.work_cost_estimate === 'number' && body.work_cost_estimate > 0
          ? body.work_cost_estimate
          : rabTotal || wf.work_cost_estimate,
      material_needs: nextNeeds,
      updated_at: new Date().toISOString(),
    };
    updatedWf.material_needs = recomputeProcurementStatuses(updatedWf, db.materials);
    db.workflows[wfIdx] = updatedWf;

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Persiapan Teknis Proyek',
        `Memperbarui RAB, jadwal kerja, dan kebutuhan material proyek ${project.project_number}`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, workflow: updatedWf });
  });

  // STAGE 1 -> 2: TIM TEKNIK clicks "AJUKAN KE FINANCE"
  app.post('/api/workflow/:projectId/submit-finance', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const teknikTruth = resolveTeknikActorTruth(db, actor);
    if (!teknikTruth) {
      res.status(403).json({
        message: 'Hanya Head Teknik, Staff Teknik, atau Super Admin yang dapat mengajukan proyek ke Tim Finance.',
      });
      return;
    }

    const { projectId } = req.params;
    const body = req.body as { note?: string; work_cost_estimate?: number };

    const project = db.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ message: 'Proyek tidak ditemukan.' });
      return;
    }

    const wfIdx = db.workflows.findIndex((w) => w.project_id === projectId);
    const wf = wfIdx >= 0 ? db.workflows[wfIdx] : createDefaultWorkflowForProject(project);
    if (wfIdx === -1) db.workflows.push(wf);

    if (!['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE'].includes(wf.stage)) {
      res.status(400).json({
        message: `Proyek sedang berada pada status "${wf.stage}" sehingga tidak dapat diajukan ulang saat ini.`,
      });
      return;
    }

    const projectRab = db.budgets.filter((b) => b.project_id === projectId);
    if (projectRab.length === 0) {
      res.status(400).json({
        message: 'Lengkapi minimal 1 pos RAB terlebih dahulu sebelum mengajukan proyek ke Tim Finance.',
      });
      return;
    }

    if (!wf.schedule_start || !wf.schedule_end) {
      res.status(400).json({
        message: 'Jadwal mulai dan target selesai proyek wajib dilengkapi sebelum pengajuan.',
      });
      return;
    }

    const rabTotal = projectRab.reduce((acc, b) => acc + b.total_cost, 0);
    const now = new Date().toISOString();
    const prevStage = wf.stage;

    const updatedWf: ProjectWorkflow = {
      ...wf,
      stage: 'MENUNGGU_FINANCE',
      submitter_id: actor.employeeId,
      submitter_name: actor.fullName,
      submitter_division_id: actor.divisionId || 'div-teknik',
      work_cost_estimate:
        typeof body.work_cost_estimate === 'number' && body.work_cost_estimate > 0
          ? body.work_cost_estimate
          : rabTotal,
      submitted_at: now,
      returned_reason: undefined,
      updated_at: now,
      history: [
        ...wf.history,
        makeHistoryEntry(
          actor,
          prevStage,
          'MENUNGGU_FINANCE',
          'Ajukan ke Finance',
          body.note?.trim() ||
            `Mengajukan proyek ${project.project_number} ke Tim Finance (RAB ${projectRab.length} pos, ${wf.material_needs.length} material).`
        ),
      ],
    };
    updatedWf.material_needs = recomputeProcurementStatuses(updatedWf, db.materials);
    const targetIdx = db.workflows.findIndex((w) => w.project_id === projectId);
    db.workflows[targetIdx] = updatedWf;

    const approvalId = `apr-wf-${projectId}`;
    const approvalPayload: ApprovalRecord = {
      id: approvalId,
      entity_type: 'ProjectWorkflow',
      entity_id: projectId,
      reference_no: project.project_number,
      title: `Pengajuan Proyek & RAB: ${project.name}`,
      division_id: 'div-finance',
      requester_id: actor.employeeId,
      status: 'Menunggu',
      requested_at: now,
      notes:
        body.note?.trim() ||
        `RAB Rp ${rabTotal.toLocaleString('id-ID')} · ${wf.material_needs.length} kebutuhan material diajukan untuk pemeriksaan Finance.`,
    };
    const existingAprIdx = db.approvals.findIndex(
      (a) => a.entity_type === 'ProjectWorkflow' && a.entity_id === projectId
    );
    if (existingAprIdx >= 0) {
      db.approvals[existingAprIdx] = approvalPayload;
    } else {
      db.approvals = [approvalPayload, ...db.approvals];
    }

    db.notifications = [
      makeOperationalNotification({
        type: 'Workflow Proyek',
        title: `Pengajuan Proyek ke Finance (${project.project_number})`,
        message: `${actor.fullName} mengajukan RAB & kebutuhan material ${project.name} untuk diperiksa Tim Finance.`,
        target_role: 'ALL',
        target_division_id: 'div-finance',
        project_id: projectId,
        link_module: 'finance',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Ajukan ke Finance',
        `Mengajukan proyek ${project.project_number} (${project.name}) ke Tim Finance.`,
        projectId
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, workflow: updatedWf });
  });

  // STAGE 2 -> 3 (or Back to Stage 1): TIM FINANCE APPROVE / REJECT / REQUEST REVISION
  app.post('/api/workflow/:projectId/finance-decision', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (actor.roleCode !== 'SUPER_ADMIN' && actor.divisionCode !== 'FINANCE') {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Finance atau Super Admin yang dapat memutus pengajuan RAB & pembiayaan.',
      });
      return;
    }

    const { projectId } = req.params;
    const body = req.body as {
      decision: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
      note?: string;
      approved_budget_limit?: number;
    };

    const db = ensureOperationalDb();
    const projectIdx = db.projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) {
      res.status(404).json({ message: 'Proyek tidak ditemukan.' });
      return;
    }
    const project = db.projects[projectIdx];

    const wfIdx = db.workflows.findIndex((w) => w.project_id === projectId);
    if (wfIdx === -1) {
      res.status(404).json({ message: 'Data workflow proyek tidak ditemukan.' });
      return;
    }
    const wf = db.workflows[wfIdx];

    if (wf.stage !== 'MENUNGGU_FINANCE') {
      res.status(400).json({
        message: `Keputusan Finance tidak dapat diproses karena status proyek saat ini adalah "${wf.stage}".`,
      });
      return;
    }

    const note = String(body.note || '').trim();
    if ((body.decision === 'REQUEST_REVISION' || body.decision === 'REJECT') && !note) {
      res.status(400).json({
        message: 'Catatan alasan penolakan atau permintaan revisi wajib diisi agar Tim Teknik dapat menindaklanjuti.',
      });
      return;
    }

    const now = new Date().toISOString();
    const rabTotal = db.budgets
      .filter((b) => b.project_id === projectId)
      .reduce((acc, b) => acc + b.total_cost, 0);

    const hasActiveContract = db.contracts.some(
      (c) => c.project_id === projectId && c.status === 'Aktif'
    );

    let nextStage: WorkflowStage = hasActiveContract ? 'MENUNGGU_LOGISTIK' : 'MENUNGGU_KONTRAK';
    let actionLabel = 'Disetujui Tim Finance';
    if (body.decision === 'REQUEST_REVISION') {
      nextStage = 'REVISI_TEKNIK';
      actionLabel = 'Minta Revisi ke Tim Teknik';
    } else if (body.decision === 'REJECT') {
      nextStage = 'DITOLAK_FINANCE';
      actionLabel = 'Ditolak Tim Finance';
    }

    const updatedWf: ProjectWorkflow = {
      ...wf,
      stage: nextStage,
      finance_reviewer_id: actor.employeeId,
      finance_reviewer_name: actor.fullName,
      finance_decision_note: note || 'RAB, anggaran proyek, dan kebutuhan material disetujui Finance.',
      finance_decided_at: now,
      approved_budget_limit:
        body.decision === 'APPROVE'
          ? Number(body.approved_budget_limit || rabTotal || wf.work_cost_estimate)
          : wf.approved_budget_limit,
      returned_reason: body.decision === 'APPROVE' ? undefined : note,
      updated_at: now,
      history: [
        ...wf.history,
        makeHistoryEntry(
          actor,
          'MENUNGGU_FINANCE',
          nextStage,
          actionLabel,
          note ||
            (hasActiveContract
              ? 'Disetujui dan diteruskan ke Tim Logistik.'
              : 'Anggaran disetujui Finance. Proyek masuk tahap Pembuatan & Aktivasi Kontrak sebelum ke Logistik.')
        ),
      ],
    };
    updatedWf.material_needs = recomputeProcurementStatuses(updatedWf, db.materials);
    db.workflows[wfIdx] = updatedWf;

    if (body.decision === 'APPROVE') {
      if (project.status === 'Perencanaan' || project.status === 'Review Finance') {
        db.projects[projectIdx] = { ...project, status: 'Berjalan' };
      }

      // Auto-sync MaterialRequest for Logistik module visibility
      if (updatedWf.material_needs.length > 0) {
        const mrId = `mr-wf-${projectId}`;
        const existingMrIdx = db.materialRequests.findIndex((m) => m.id === mrId);
        const mrPayload: MaterialRequest = {
          id: mrId,
          request_number: `SPM/WF/${project.project_number}`,
          project_id: projectId,
          requested_by_id: updatedWf.submitter_id,
          head_reviewer_id: actor.employeeId,
          request_date: now.slice(0, 10),
          needed_date: updatedWf.schedule_start || now.slice(0, 10),
          status: 'Disetujui Head',
          notes: `Disetujui Finance untuk kebutuhan material ${project.name}.`,
          items: updatedWf.material_needs.map((n) => ({
            material_id: n.material_id,
            qty_requested: n.qty_needed,
            qty_approved: n.qty_needed,
            qty_delivered: n.qty_issued,
          })),
          history: [
            {
              timestamp: now,
              actor_name: actor.fullName,
              action: 'Disetujui Tim Finance',
              note: note || 'Permintaan pengeluaran stok material disetujui Finance.',
            },
          ],
        };
        if (existingMrIdx >= 0) {
          db.materialRequests[existingMrIdx] = mrPayload;
        } else {
          db.materialRequests = [mrPayload, ...db.materialRequests];
        }
      }

      db.notifications = [
        hasActiveContract
          ? makeOperationalNotification({
              type: 'Workflow Proyek',
              title: `Siap Diproses Logistik: ${project.project_number}`,
              message: `${actor.fullName} (Finance) menyetujui proyek ${project.name}. Silakan periksa stok, reservasi, atau pengadaan material.`,
              target_role: 'ALL',
              target_division_id: 'div-logistik',
              project_id: projectId,
              link_module: 'logistik',
            })
          : makeOperationalNotification({
              type: 'Workflow Proyek',
              title: `Pembuatan Kontrak Diperlukan: ${project.project_number}`,
              message: `${actor.fullName} (Finance) menyetujui anggaran ${project.name}. Lengkapi dan aktifkan kontrak sebelum diteruskan ke Logistik.`,
              target_role: 'ALL',
              target_division_id: 'div-finance',
              project_id: projectId,
              link_module: 'kontrak',
            }),
        makeOperationalNotification({
          type: 'Permintaan Disetujui',
          title: `Pengajuan ${project.project_number} Disetujui Finance`,
          message: hasActiveContract
            ? `Pekerjaan telah diteruskan ke Tim Logistik untuk persiapan material.`
            : `Proyek masuk tahap Pembuatan Kontrak. Aktifkan kontrak pada modul Kontrak & Termin.`,
          target_role: 'ALL',
          target_division_id: 'div-teknik',
          project_id: projectId,
          link_module: 'kontrak',
        }),
        ...db.notifications,
      ];
    } else {
      db.notifications = [
        makeOperationalNotification({
          type: body.decision === 'REQUEST_REVISION' ? 'Revisi Pengajuan' : 'Permintaan Ditolak',
          title:
            body.decision === 'REQUEST_REVISION'
              ? `Revisi Diminta Finance: ${project.project_number}`
              : `Pengajuan Ditolak Finance: ${project.project_number}`,
          message: `${actor.fullName}: ${note}`,
          target_role: 'ALL',
          target_division_id: 'div-teknik',
          project_id: projectId,
          link_module: 'teknik',
        }),
        ...db.notifications,
      ];
    }

    db.approvals = db.approvals.map((a) =>
      a.entity_type === 'ProjectWorkflow' && a.entity_id === projectId
        ? {
            ...a,
            status: body.decision === 'APPROVE' ? 'Disetujui' : 'Ditolak',
            approver_id: actor.employeeId,
            decided_at: now,
            notes: note || a.notes,
          }
        : a
    );

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        actionLabel,
        `${actionLabel} untuk proyek ${project.project_number}${note ? `: ${note}` : ''}`,
        projectId
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, workflow: updatedWf });
  });

  // STAGE 3 -> 4: TIM LOGISTIK checks stock, reserves/issues, creates/receives procurement PO, forwards to Field
  app.post('/api/workflow/:projectId/logistics-process', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (actor.roleCode !== 'SUPER_ADMIN' && actor.divisionCode !== 'LOGISTIK') {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Logistik atau Super Admin yang dapat memproses stok & pengadaan material.',
      });
      return;
    }

    const { projectId } = req.params;
    const body = req.body as {
      action: 'RESERVE_ISSUE' | 'CREATE_PROCUREMENT' | 'RECEIVE_PROCUREMENT' | 'FORWARD_FIELD';
      material_id?: string;
      qty?: number;
      supplier_name?: string;
      estimated_cost?: number;
      procurement_id?: string;
      note?: string;
    };

    const db = ensureOperationalDb();
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ message: 'Proyek tidak ditemukan.' });
      return;
    }

    const wfIdx = db.workflows.findIndex((w) => w.project_id === projectId);
    if (wfIdx === -1) {
      res.status(404).json({ message: 'Data workflow proyek tidak ditemukan.' });
      return;
    }
    const wf = db.workflows[wfIdx];

    const hasActiveContract = db.contracts.some(
      (c) => !c.is_deleted && c.project_id === projectId && c.status === 'Aktif'
    );
    if (!hasActiveContract) {
      res.status(400).json({
        message: 'Proyek tidak boleh masuk tahap Logistik sebelum memiliki kontrak berstatus Aktif.',
      });
      return;
    }

    if (!['MENUNGGU_LOGISTIK', 'PROSES_LOGISTIK'].includes(wf.stage)) {
      res.status(400).json({
        message: `Tahap saat ini adalah "${wf.stage}". Logistik hanya memproses proyek yang telah disetujui Finance dan kontraknya Aktif.`,
      });
      return;
    }

    const now = new Date().toISOString();
    let updatedWf: ProjectWorkflow = { ...wf, logistics_pic_id: actor.employeeId, logistics_pic_name: actor.fullName, updated_at: now };

    if (body.action === 'RESERVE_ISSUE') {
      const matIdx = db.materials.findIndex((m) => m.id === body.material_id);
      if (matIdx === -1) {
        res.status(404).json({ message: 'Material tidak ditemukan.' });
        return;
      }
      const mat = db.materials[matIdx];
      const needIdx = updatedWf.material_needs.findIndex((n) => n.material_id === mat.id);
      if (needIdx === -1) {
        res.status(400).json({ message: 'Material ini tidak terdaftar dalam kebutuhan proyek.' });
        return;
      }
      const need = updatedWf.material_needs[needIdx];
      const remainingNeed = Math.max(0, need.qty_needed - need.qty_issued);
      const requestedQty = Number(body.qty || remainingNeed || 0);
      const issueQty = Math.min(mat.stock, Math.max(0, requestedQty));

      if (issueQty <= 0) {
        res.status(400).json({
          message: `Stok gudang untuk ${mat.name} saat ini 0 ${mat.unit}. Buat Pengadaan (PO) terlebih dahulu.`,
        });
        return;
      }

      const nextStock = mat.stock - issueQty;
      db.materials[matIdx] = { ...mat, stock: nextStock };

      updatedWf.material_needs = updatedWf.material_needs.map((n, i) =>
        i === needIdx
          ? {
              ...n,
              qty_reserved: n.qty_reserved + issueQty,
              qty_issued: n.qty_issued + issueQty,
            }
          : n
      );
      updatedWf.stage = 'PROSES_LOGISTIK';

      const refNo = `SJ/PMS/${project.project_number.slice(-3)}/${String(db.materialTransactions.length + 101)}`;
      db.materialTransactions = [
        {
          id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          material_id: mat.id,
          project_id: projectId,
          request_id: `mr-wf-${projectId}`,
          type: 'Keluar',
          qty: issueQty,
          date: now.slice(0, 10),
          pic_name: actor.fullName,
          reference_no: refNo,
          notes: body.note?.trim() || `Reservasi & pengeluaran stok untuk ${project.project_number}`,
        },
        ...db.materialTransactions,
      ];

      if (nextStock <= mat.min_stock) {
        db.notifications = [
          makeOperationalNotification({
            type: 'Stok Minimum',
            title: `Stok Minimum: ${mat.name}`,
            message: `Sisa stok gudang ${nextStock} ${mat.unit} (batas aman ${mat.min_stock} ${mat.unit}).`,
            target_role: 'ALL',
            target_division_id: 'div-logistik',
            project_id: projectId,
            link_module: 'logistik',
          }),
          ...db.notifications,
        ];
      }

      updatedWf.history = [
        ...updatedWf.history,
        makeHistoryEntry(
          actor,
          wf.stage,
          'PROSES_LOGISTIK',
          'Pengeluaran / Reservasi Stok',
          `Mengeluarkan ${issueQty} ${mat.unit} ${mat.name} (${refNo}).`
        ),
      ];
      db.activityLogs = [
        makeOperationalLog(
          db,
          actor,
          'Pengeluaran Stok Logistik',
          `Mengeluarkan ${issueQty} ${mat.unit} ${mat.name} ke proyek ${project.project_number}.`,
          projectId
        ),
        ...db.activityLogs,
      ];
    } else if (body.action === 'CREATE_PROCUREMENT') {
      const mat = db.materials.find((m) => m.id === body.material_id);
      if (!mat) {
        res.status(404).json({ message: 'Material tidak ditemukan.' });
        return;
      }
      const qtyOrder = Math.max(1, Number(body.qty || 0));
      const supplier = String(body.supplier_name || '').trim() || 'Supplier Mitra Material';
      const estCost = Number(body.estimated_cost || qtyOrder * mat.unit_cost);
      const poNumber = `PO/PMS/2026/${String(updatedWf.procurements.length + db.materialTransactions.length + 101).padStart(3, '0')}`;

      const newPo: WorkflowProcurement = {
        id: `po-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        po_number: poNumber,
        project_id: projectId,
        material_id: mat.id,
        qty_order: qtyOrder,
        estimated_cost: estCost,
        supplier_name: supplier,
        status: 'Dipesan ke Supplier',
        requested_by_name: actor.fullName,
        created_at: now,
        notes: body.note?.trim() || `Pengadaan kekurangan stok ${mat.name} untuk ${project.project_number}.`,
      };

      updatedWf.procurements = [newPo, ...updatedWf.procurements];
      updatedWf.material_needs = updatedWf.material_needs.map((n) =>
        n.material_id === mat.id
          ? { ...n, qty_procured: n.qty_procured + qtyOrder, procurement_status: 'Dalam Pengadaan' }
          : n
      );
      updatedWf.stage = 'PROSES_LOGISTIK';
      updatedWf.history = [
        ...updatedWf.history,
        makeHistoryEntry(
          actor,
          wf.stage,
          'PROSES_LOGISTIK',
          'Buat Pengadaan (PO)',
          `Membuat PO ${poNumber} untuk ${qtyOrder} ${mat.unit} ${mat.name} ke ${supplier}.`
        ),
      ];

      db.notifications = [
        makeOperationalNotification({
          type: 'Pengadaan Material',
          title: `Pengadaan Material Baru ${poNumber}`,
          message: `Logistik membuat PO ${qtyOrder} ${mat.unit} ${mat.name} (${supplier}) untuk ${project.project_number}.`,
          target_role: 'ALL',
          target_division_id: 'div-finance',
          project_id: projectId,
          link_module: 'logistik',
        }),
        ...db.notifications,
      ];
      db.activityLogs = [
        makeOperationalLog(
          db,
          actor,
          'Pengadaan Material (PO)',
          `Membuat PO ${poNumber}: ${qtyOrder} ${mat.unit} ${mat.name} ke ${supplier}.`,
          projectId
        ),
        ...db.activityLogs,
      ];
    } else if (body.action === 'RECEIVE_PROCUREMENT') {
      const poIdx = updatedWf.procurements.findIndex((p) => p.id === body.procurement_id);
      if (poIdx === -1) {
        res.status(404).json({ message: 'Data PO pengadaan tidak ditemukan.' });
        return;
      }
      const po = updatedWf.procurements[poIdx];
      if (po.status === 'Diterima di Gudang') {
        res.status(400).json({ message: 'PO ini sudah diterima di gudang sebelumnya.' });
        return;
      }
      const matIdx = db.materials.findIndex((m) => m.id === po.material_id);
      if (matIdx >= 0) {
        db.materials[matIdx] = {
          ...db.materials[matIdx],
          stock: db.materials[matIdx].stock + po.qty_order,
        };
      }
      updatedWf.procurements = updatedWf.procurements.map((p, i) =>
        i === poIdx ? { ...p, status: 'Diterima di Gudang', received_at: now } : p
      );
      db.materialTransactions = [
        {
          id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          material_id: po.material_id,
          project_id: projectId,
          type: 'Masuk',
          qty: po.qty_order,
          date: now.slice(0, 10),
          pic_name: actor.fullName,
          reference_no: po.po_number,
          notes: body.note?.trim() || `Penerimaan barang PO ${po.po_number} dari ${po.supplier_name}.`,
        },
        ...db.materialTransactions,
      ];
      updatedWf.history = [
        ...updatedWf.history,
        makeHistoryEntry(
          actor,
          wf.stage,
          updatedWf.stage,
          'Terima Barang PO',
          `Barang PO ${po.po_number} (${po.qty_order} unit) diterima di gudang.`
        ),
      ];
      db.activityLogs = [
        makeOperationalLog(
          db,
          actor,
          'Penerimaan Barang PO',
          `Menerima ${po.qty_order} unit untuk PO ${po.po_number} di gudang.`,
          projectId
        ),
        ...db.activityLogs,
      ];
    } else if (body.action === 'FORWARD_FIELD') {
      updatedWf.stage = 'SIAP_LAPANGAN';
      updatedWf.logistics_ready_at = now;
      updatedWf.logistics_note =
        body.note?.trim() || 'Kebutuhan material proyek telah disiapkan dan diteruskan ke Tim Lapangan.';
      updatedWf.history = [
        ...updatedWf.history,
        makeHistoryEntry(
          actor,
          wf.stage,
          'SIAP_LAPANGAN',
          'Teruskan ke Lapangan',
          updatedWf.logistics_note
        ),
      ];

      // Update linked MaterialRequest if exists
      const mrId = `mr-wf-${projectId}`;
      db.materialRequests = db.materialRequests.map((mr) =>
        mr.id === mrId
          ? {
              ...mr,
              status: 'Diserahkan',
              logistics_processor_id: actor.employeeId,
              items: mr.items.map((it) => {
                const match = updatedWf.material_needs.find((n) => n.material_id === it.material_id);
                return { ...it, qty_delivered: match?.qty_issued ?? it.qty_approved };
              }),
              history: [
                ...mr.history,
                {
                  timestamp: now,
                  actor_name: actor.fullName,
                  action: 'Diteruskan ke Lapangan',
                  note: updatedWf.logistics_note || 'Siap dilaksanakan di lokasi proyek.',
                },
              ],
            }
          : mr
      );

      // Ensure at least one WorkItem exists for the field execution team
      if (!db.workItems.some((w) => w.project_id === projectId)) {
        const firstRab = db.budgets.find((b) => b.project_id === projectId);
        const newWork: WorkItem = {
          id: `wrk-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          project_id: projectId,
          budget_id: firstRab?.id || '',
          title: `Pelaksanaan Paket Utama — ${project.name}`,
          division_id: 'div-teknik',
          pic_employee_id: project.pic_employee_id || 'emp-03',
          start_date: updatedWf.schedule_start || project.start_date,
          due_date: updatedWf.schedule_end || project.target_end_date,
          weight_percent: 100,
          daily_progress: 0,
          weekly_progress: 0,
          monthly_progress: project.progress_percent,
          overall_progress: project.progress_percent,
          status: 'Terjadwal',
          constraints: '-',
          follow_up: 'Siap eksekusi Tim Lapangan.',
          field_photo_url: project.image_url,
          updated_at: now,
        };
        db.workItems = [newWork, ...db.workItems];
      }

      db.notifications = [
        makeOperationalNotification({
          type: 'Workflow Proyek',
          title: `Siap Dikerjakan Lapangan: ${project.project_number}`,
          message: `Tim Logistik meneruskan pekerjaan ${project.name} ke Tim Lapangan. Material dan kebutuhan proyek sudah siap.`,
          target_role: 'ALL',
          target_division_id: 'div-teknik',
          project_id: projectId,
          link_module: 'teknik',
        }),
        makeOperationalNotification({
          type: 'Workflow Proyek',
          title: `Proyek Diteruskan ke Lapangan (${project.project_number})`,
          message: `${project.name} telah memasuki tahap pelaksanaan lapangan.`,
          target_role: 'SUPER_ADMIN',
          project_id: projectId,
          link_module: 'proyek',
        }),
        ...db.notifications,
      ];
      db.activityLogs = [
        makeOperationalLog(
          db,
          actor,
          'Teruskan ke Lapangan',
          `Logistik menyelesaikan persiapan material dan meneruskan ${project.project_number} ke Tim Lapangan.`,
          projectId
        ),
        ...db.activityLogs,
      ];
    } else {
      res.status(400).json({ message: 'Aksi logistik tidak dikenali.' });
      return;
    }

    updatedWf.material_needs = recomputeProcurementStatuses(updatedWf, db.materials);
    db.workflows[wfIdx] = updatedWf;
    saveOperationalDb(db);
    res.json({ state: db, workflow: updatedWf });
  });

  // STAGE 4 -> 5: TIM LAPANGAN submits field progress report, material consumption, constraints & photo docs
  app.post('/api/workflow/:projectId/field-report', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const teknikTruth = resolveTeknikActorTruth(db, actor);
    if (!teknikTruth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik (Head/Staff) atau Super Admin yang dapat menginput laporan lapangan.',
      });
      return;
    }

    const { projectId } = req.params;
    const body = req.body as {
      work_summary: string;
      progress_percent: number;
      material_usages?: Array<{ material_id: string; qty_used: number }>;
      expense_amount?: number;
      expense_note?: string;
      constraints?: string;
      follow_up?: string;
      attachment_ids?: string[];
      mark_completed?: boolean;
    };

    const projectIdx = db.projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) {
      res.status(404).json({ message: 'Proyek tidak ditemukan.' });
      return;
    }
    const project = db.projects[projectIdx];

    const wfIdx = db.workflows.findIndex((w) => w.project_id === projectId);
    if (wfIdx === -1) {
      res.status(404).json({ message: 'Data workflow proyek tidak ditemukan.' });
      return;
    }
    const wf = db.workflows[wfIdx];

    if (!['SIAP_LAPANGAN', 'DALAM_PELAKSANAAN'].includes(wf.stage)) {
      res.status(400).json({
        message: `Laporan lapangan hanya dapat diinput setelah Logistik meneruskan proyek ke Lapangan (status saat ini: ${wf.stage}).`,
      });
      return;
    }

    if (!String(body.work_summary || '').trim()) {
      res.status(400).json({ message: 'Ringkasan pelaksanaan pekerjaan lapangan wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    const clampedProgress = Math.min(100, Math.max(0, Number(body.progress_percent ?? project.progress_percent)));
    const isCompleted = Boolean(body.mark_completed) || clampedProgress >= 100;
    const nextStage: WorkflowStage = isCompleted ? 'SELESAI' : 'DALAM_PELAKSANAAN';

    const validUsages = (Array.isArray(body.material_usages) ? body.material_usages : [])
      .map((u) => ({ material_id: u.material_id, qty_used: Math.max(0, Number(u.qty_used || 0)) }))
      .filter((u) => u.material_id && u.qty_used > 0);

    const newReport: WorkflowFieldReport = {
      id: `wfr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: projectId,
      reported_by_id: actor.employeeId,
      reported_by_name: actor.fullName,
      reported_at: now,
      work_summary: body.work_summary.trim(),
      progress_percent: clampedProgress,
      material_usages: validUsages,
      expense_amount: Math.max(0, Number(body.expense_amount || 0)),
      expense_note: body.expense_note?.trim(),
      constraints: String(body.constraints || '-').trim() || '-',
      follow_up: String(body.follow_up || '-').trim() || '-',
      attachment_ids: Array.isArray(body.attachment_ids) ? body.attachment_ids : [],
    };

    // Update material usage & record Pemakaian transactions
    let updatedNeeds = [...wf.material_needs];
    for (const usage of validUsages) {
      const mat = db.materials.find((m) => m.id === usage.material_id);
      const existingNeedIdx = updatedNeeds.findIndex((n) => n.material_id === usage.material_id);
      if (existingNeedIdx >= 0) {
        updatedNeeds[existingNeedIdx] = {
          ...updatedNeeds[existingNeedIdx],
          qty_used: updatedNeeds[existingNeedIdx].qty_used + usage.qty_used,
        };
      } else if (mat) {
        updatedNeeds.push({
          id: `wmn-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          material_id: mat.id,
          qty_needed: usage.qty_used,
          qty_reserved: 0,
          qty_issued: 0,
          qty_used: usage.qty_used,
          qty_procured: 0,
          estimated_unit_cost: mat.unit_cost,
          procurement_status: 'Siap / Tersedia',
          notes: 'Pemakaian langsung di lapangan',
        });
      }

      db.materialTransactions = [
        {
          id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          material_id: usage.material_id,
          project_id: projectId,
          type: 'Pemakaian',
          qty: usage.qty_used,
          date: now.slice(0, 10),
          pic_name: actor.fullName,
          reference_no: `LP-MAT/${project.project_number.slice(-3)}/${now.slice(5, 10).replace('-', '')}`,
          notes: `Pemakaian lapangan: ${newReport.work_summary}`,
        },
        ...db.materialTransactions,
      ];
    }

    // Optional field expenditure recorded for Finance verification
    if (newReport.expense_amount > 0) {
      const txId = `fin-${Date.now()}`;
      const txNo = `TRX-FIN-2026-${String(db.financialTransactions.length + 950).padStart(4, '0')}`;
      const finTx: FinancialTransaction = {
        id: txId,
        project_id: projectId,
        transaction_no: txNo,
        date: now.slice(0, 10),
        category: 'Pengeluaran Proyek',
        type: 'Pengeluaran',
        amount: newReport.expense_amount,
        status: 'Menunggu',
        proof_ref: newReport.attachment_ids[0] || 'Laporan-Lapangan.pdf',
        description: newReport.expense_note || `Biaya pelaksanaan lapangan: ${newReport.work_summary}`,
        created_by_id: actor.employeeId,
      };
      db.financialTransactions = [finTx, ...db.financialTransactions];
      db.approvals = [
        {
          id: `apr-${Date.now()}`,
          entity_type: 'Finance',
          entity_id: txId,
          reference_no: txNo,
          title: `Verifikasi Biaya Lapangan: ${project.project_number}`,
          division_id: 'div-finance',
          requester_id: actor.employeeId,
          status: 'Menunggu',
          requested_at: now,
          notes: finTx.description,
        },
        ...db.approvals,
      ];
    }

    // Update project progress & status
    db.projects[projectIdx] = {
      ...project,
      progress_percent: clampedProgress,
      status: isCompleted ? 'Selesai' : 'Berjalan',
    };

    // Update or create WorkItem reflecting latest progress
    const existingWorkIdx = db.workItems.findIndex((w) => w.project_id === projectId);
    if (existingWorkIdx >= 0) {
      const existingWork = db.workItems[existingWorkIdx];
      const delta = Math.max(0, clampedProgress - existingWork.overall_progress);
      db.workItems[existingWorkIdx] = {
        ...existingWork,
        daily_progress: delta,
        overall_progress: clampedProgress,
        status: isCompleted ? 'Selesai' : newReport.constraints !== '-' ? 'Kendala' : 'Dikerjakan',
        constraints: newReport.constraints,
        follow_up: newReport.follow_up,
        updated_at: now,
      };
    } else {
      const firstRab = db.budgets.find((b) => b.project_id === projectId);
      db.workItems = [
        {
          id: `wrk-${Date.now()}`,
          project_id: projectId,
          budget_id: firstRab?.id || '',
          title: `Pelaksanaan Lapangan — ${project.name}`,
          division_id: 'div-teknik',
          pic_employee_id: actor.employeeId,
          start_date: wf.schedule_start || project.start_date,
          due_date: wf.schedule_end || project.target_end_date,
          weight_percent: 100,
          daily_progress: clampedProgress,
          weekly_progress: clampedProgress,
          monthly_progress: clampedProgress,
          overall_progress: clampedProgress,
          status: isCompleted ? 'Selesai' : 'Dikerjakan',
          constraints: newReport.constraints,
          follow_up: newReport.follow_up,
          field_photo_url: project.image_url,
          updated_at: now,
        },
        ...db.workItems,
      ];
    }

    const updatedWf: ProjectWorkflow = {
      ...wf,
      stage: nextStage,
      field_pic_id: actor.employeeId,
      field_pic_name: actor.fullName,
      field_started_at: wf.field_started_at || now,
      material_needs: recomputeProcurementStatuses({ ...wf, material_needs: updatedNeeds }, db.materials),
      field_reports: [newReport, ...wf.field_reports],
      updated_at: now,
      history: [
        ...wf.history,
        makeHistoryEntry(
          actor,
          wf.stage,
          nextStage,
          isCompleted ? 'Proyek Selesai 100%' : `Laporan Lapangan (${clampedProgress}%)`,
          `${newReport.work_summary}${newReport.constraints !== '-' ? ` · Kendala: ${newReport.constraints}` : ''}`
        ),
      ],
    };
    db.workflows[wfIdx] = updatedWf;

    db.notifications = [
      makeOperationalNotification({
        type: 'Laporan Lapangan',
        title: `Update Lapangan ${project.project_number} (${clampedProgress}%)`,
        message: `${actor.fullName}: ${newReport.work_summary}`,
        target_role: 'ALL',
        project_id: projectId,
        link_module: 'proyek',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        isCompleted ? 'Penyelesaian Proyek' : 'Laporan Lapangan',
        `Progres ${project.project_number} diperbarui menjadi ${clampedProgress}% — ${newReport.work_summary}`,
        projectId
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, workflow: updatedWf });
  });

  // ============================================================================
  // KONTRAK & TERMIN ENDPOINTS
  // ============================================================================

  app.post('/api/contracts', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed = actor.roleCode === 'SUPER_ADMIN' || actor.divisionCode === 'FINANCE';
    if (!allowed) {
      res.status(403).json({
        message: 'Anda tidak memiliki hak akses untuk membuat kontrak',
      });
      return;
    }

    const body = req.body as Partial<Contract>;
    const db = ensureOperationalDb();
    const project = db.projects.find((p) => p.id === body.project_id && !p.is_deleted);
    if (!project) {
      res.status(404).json({ message: 'Proyek terkait tidak ditemukan.' });
      return;
    }

    const wf = db.workflows.find((w) => w.project_id === project.id);
    const isFinanceApproved = Boolean(
      wf &&
        (wf.finance_decided_at && !['DRAFT_TEKNIK', 'REVISI_TEKNIK', 'DITOLAK_FINANCE', 'MENUNGGU_FINANCE'].includes(wf.stage))
    ) || ['Berjalan', 'Dalam Pengerjaan', 'Selesai'].includes(project.status);

    if (!isFinanceApproved) {
      res.status(400).json({
        message: 'Kontrak tidak boleh dibuat dari proyek yang belum disetujui Tim Finance.',
      });
      return;
    }

    const contractNumber = String(body.contract_number || '').trim();
    if (!contractNumber) {
      res.status(400).json({ message: 'Nomor kontrak/SPK wajib diisi.' });
      return;
    }
    if (
      db.contracts.some(
        (c) => !c.is_deleted && c.contract_number.trim().toLowerCase() === contractNumber.toLowerCase()
      )
    ) {
      res.status(400).json({
        message: `Nomor kontrak "${contractNumber}" sudah terdaftar. Gunakan nomor kontrak unik.`,
      });
      return;
    }

    const contractValue = Number(body.contract_value || 0);
    if (!Number.isFinite(contractValue) || contractValue <= 0) {
      res.status(400).json({ message: 'Nilai kontrak final harus lebih dari Rp 0.' });
      return;
    }

    const startDate = String(body.start_date || '').trim();
    const endDate = String(body.end_date || '').trim();
    if (!startDate || !endDate || endDate < startDate) {
      res.status(400).json({
        message: 'Tanggal selesai pekerjaan tidak boleh lebih awal dari tanggal mulai.',
      });
      return;
    }

    const now = new Date().toISOString();
    const rabApproved =
      Number(body.rab_approved_value || 0) ||
      wf?.approved_budget_limit ||
      db.budgets
        .filter((b) => b.project_id === project.id && !b.is_deleted)
        .reduce((acc, b) => acc + b.total_cost, 0) ||
      project.contract_value;

    const newContract: Contract = {
      id: `ctr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: project.id,
      contract_number: contractNumber,
      work_name: String(body.work_name || project.name).trim(),
      contract_value: contractValue,
      rab_approved_value: rabApproved,
      contract_date: String(body.contract_date || now.slice(0, 10)),
      start_date: startDate,
      end_date: endDate,
      counterparty: String(body.counterparty || body.first_party_name || project.client_name).trim(),
      first_party_name: String(body.first_party_name || project.client_name).trim(),
      second_party_name: String(body.second_party_name || 'PT. Wilwa Abiyasa Sejahtera').trim(),
      pic_contract: String(body.pic_contract || actor.fullName).trim(),
      scope_description: String(body.scope_description || project.description || '').trim(),
      contract_notes: String(body.contract_notes || '').trim(),
      finance_approved_date: wf?.finance_decided_at?.slice(0, 10) || body.finance_approved_date || now.slice(0, 10),
      document_ref: String(body.document_ref || 'Dokumen-Kontrak.pdf').trim(),
      document_verified: Boolean(body.document_verified),
      status: 'Draft',
      current_version: 1,
      versions: [
        {
          version: 1,
          timestamp: now,
          changed_by_name: actor.fullName,
          reason: `Pembuatan kontrak awal ${contractNumber} (RAB disetujui: ${rabApproved}, Kontrak final: ${contractValue})`,
          contract_number: contractNumber,
          contract_value: contractValue,
          start_date: startDate,
          end_date: endDate,
          scope_description: String(body.scope_description || project.description || '').trim(),
          term_snapshot: [],
        },
      ],
      updated_at: now,
    };

    db.contracts = [newContract, ...db.contracts];
    const rabDelta = contractValue - rabApproved;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembuatan Kontrak',
        `Membuat kontrak ${contractNumber} (Draft) senilai Rp ${contractValue.toLocaleString('id-ID')} · Selisih vs RAB: Rp ${rabDelta.toLocaleString('id-ID')}`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, contract: newContract });
  });

  app.post('/api/contracts/:contractId/activate', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' && actor.divisionCode === 'FINANCE');
    if (!allowed) {
      res.status(403).json({
        message: 'Hanya Super Admin atau Head Finance yang berwenang mengaktifkan kontrak resmi.',
      });
      return;
    }

    const { contractId } = req.params;
    const body = req.body as { document_verified?: boolean; note?: string };
    const db = ensureOperationalDb();
    const idx = db.contracts.findIndex((c) => c.id === contractId);
    if (idx === -1) {
      res.status(404).json({ message: 'Kontrak tidak ditemukan.' });
      return;
    }
    const ctr = db.contracts[idx];

    const attachments = readJson<AttachmentRecord[]>(DB_FILE, []);
    const hasUploadedPdf = attachments.some(
      (a) =>
        a.status === 'Aktif' &&
        a.extension === 'pdf' &&
        (a.entity_id === ctr.id || a.entity_id === ctr.project_id)
    );
    const verifiedFlag = body.document_verified ?? ctr.document_verified;
    if (!verifiedFlag || (!hasUploadedPdf && !ctr.document_ref.toLowerCase().endsWith('.pdf'))) {
      res.status(400).json({
        message: 'Kontrak tidak dapat diaktifkan sebelum dokumen PDF kontrak wajib dilengkapi dan diverifikasi.',
      });
      return;
    }

    const terms = db.contractTerms.filter((t) => t.contract_id === ctr.id);
    const totalPct = terms.reduce((s, t) => s + Number(t.payment_percentage || 0), 0);
    const totalVal = terms.reduce((s, t) => s + Number(t.term_value || 0), 0);
    if (terms.length === 0 || Math.abs(totalPct - 100) > 0.01 || Math.abs(totalVal - ctr.contract_value) > 100) {
      res.status(400).json({
        message: `Jadwal termin harus lengkap 100% dan total nominal sama dengan nilai kontrak (saat ini ${totalPct}% / Rp ${totalVal.toLocaleString('id-ID')}).`,
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedCtr: Contract = {
      ...ctr,
      document_verified: true,
      status: 'Aktif',
      activated_at: now,
      activated_by_name: actor.fullName,
      updated_at: now,
    };
    db.contracts[idx] = updatedCtr;

    // Advance workflow MENUNGGU_KONTRAK -> MENUNGGU_LOGISTIK
    const wfIdx = db.workflows.findIndex((w) => w.project_id === ctr.project_id);
    if (wfIdx !== -1 && db.workflows[wfIdx].stage === 'MENUNGGU_KONTRAK') {
      const wf = db.workflows[wfIdx];
      db.workflows[wfIdx] = {
        ...wf,
        stage: 'MENUNGGU_LOGISTIK',
        updated_at: now,
        history: [
          ...wf.history,
          makeHistoryEntry(
            actor,
            'MENUNGGU_KONTRAK',
            'MENUNGGU_LOGISTIK',
            'Kontrak Aktif · Teruskan ke Logistik',
            body.note || `Kontrak ${ctr.contract_number} resmi aktif. Proyek diteruskan ke Tim Logistik.`
          ),
        ],
      };
      const prj = db.projects.find((p) => p.id === ctr.project_id);
      db.notifications = [
        makeOperationalNotification({
          type: 'Workflow Proyek',
          title: `Kontrak Aktif · Siap Logistik: ${prj?.project_number ?? ctr.contract_number}`,
          message: `Kontrak ${ctr.contract_number} telah aktif. Tim Logistik dapat memproses material proyek.`,
          target_role: 'ALL',
          target_division_id: 'div-logistik',
          project_id: ctr.project_id,
          link_module: 'logistik',
        }),
        ...db.notifications,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Aktivasi Kontrak',
        `Mengaktifkan kontrak ${ctr.contract_number}${body.note ? ` — ${body.note}` : ''}`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, contract: updatedCtr });
  });

  app.post('/api/contracts/:contractId/close', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' && actor.divisionCode === 'FINANCE');
    if (!allowed) {
      res.status(403).json({
        message: 'Hanya Super Admin atau Head Finance yang berwenang menutup kontrak.',
      });
      return;
    }

    const { contractId } = req.params;
    const body = req.body as { close_note?: string };
    const db = ensureOperationalDb();
    const idx = db.contracts.findIndex((c) => c.id === contractId);
    if (idx === -1) {
      res.status(404).json({ message: 'Kontrak tidak ditemukan.' });
      return;
    }
    const ctr = db.contracts[idx];
    const terms = db.contractTerms.filter((t) => t.contract_id === ctr.id);
    const totalPaid = terms.reduce((s, t) => s + Number(t.paid_amount ?? (t.payment_status === 'Terbayar' ? t.term_value : 0)), 0);
    if (totalPaid < ctr.contract_value) {
      res.status(400).json({
        message: `Kontrak belum dapat ditutup karena masih terdapat sisa pembayaran Rp ${(ctr.contract_value - totalPaid).toLocaleString('id-ID')}.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedCtr: Contract = {
      ...ctr,
      status: 'Selesai',
      closed_at: now,
      closed_by_name: actor.fullName,
      close_note: String(body.close_note || 'Seluruh kewajiban pekerjaan & pembayaran termin telah lunas.').trim(),
      updated_at: now,
    };
    db.contracts[idx] = updatedCtr;

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Penutupan Kontrak',
        `Menutup kontrak ${ctr.contract_number} (Selesai & Lunas): ${updatedCtr.close_note}`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, contract: updatedCtr });
  });

  const handleSoftDeleteContract = (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' &&
        (actor.divisionCode === 'FINANCE' || actor.divisionCode === 'TEKNIK'));
    if (!allowed) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Super Admin, Head Finance, atau Head Teknik yang berwenang menghapus kontrak.',
      });
      return;
    }

    const { contractId } = req.params;
    const reason = String((req.body as { reason?: string } | undefined)?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan penghapusan kontrak wajib diisi.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = db.contracts.findIndex((c) => c.id === contractId && !c.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Data kontrak tidak ditemukan atau sudah dihapus.' });
      return;
    }

    const ctr = db.contracts[idx];
    const terms = db.contractTerms.filter((t) => t.contract_id === ctr.id);
    const termIds = new Set(terms.map((t) => t.id));

    const hasPayments = db.termPayments.some((p) => p.contract_id === ctr.id);
    const hasClaims = db.termClaims.some((cl) => cl.contract_id === ctr.id);
    const hasPaidTerms = terms.some(
      (t) =>
        Number(t.paid_amount ?? 0) > 0 ||
        t.payment_status === 'Terbayar' ||
        t.timeline_status === 'Dibayar' ||
        t.payment_realization_status === 'Lunas' ||
        t.payment_realization_status === 'Dibayar Sebagian'
    );
    const hasLinkedFinanceTx = db.financialTransactions.some(
      (ft) => ft.contract_term_id && termIds.has(ft.contract_term_id)
    );

    if (hasPayments || hasClaims || hasPaidTerms || hasLinkedFinanceTx) {
      res.status(400).json({
        message: `Kontrak "${ctr.contract_number}" tidak dapat dihapus karena sudah memiliki transaksi pembayaran, DP, pengajuan termin, atau catatan keuangan terkait. Gunakan alur penutupan/pembatalan kontrak agar jejak audit tetap terjaga.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const deletedContract: Contract = {
      ...ctr,
      is_deleted: true,
      deleted_at: now,
      deleted_by_id: actor.employeeId,
      deleted_by_name: actor.fullName,
      delete_reason: reason,
      updated_at: now,
    };

    db.contracts[idx] = deletedContract;

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Hapus Kontrak (Soft Delete)',
        `Menghapus kontrak ${ctr.contract_number} (${ctr.work_name}) oleh ${actor.fullName} pada ${now}. Alasan: ${reason}`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, contract: deletedContract });
  };

  app.post('/api/contracts/:contractId/delete', handleSoftDeleteContract);
  app.delete('/api/contracts/:contractId', handleSoftDeleteContract);

  app.put('/api/contracts/:contractId/terms', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      actor.divisionCode === 'FINANCE' ||
      (actor.roleCode === 'HEAD' && actor.divisionCode === 'TEKNIK');
    if (!allowed) {
      res.status(403).json({
        message: 'Anda tidak memiliki hak akses untuk mengubah jadwal termin kontrak.',
      });
      return;
    }

    const { contractId } = req.params;
    const body = req.body as {
      terms: Array<{
        id?: string;
        term_number: string;
        title?: string;
        period_month: string;
        execution_date: string;
        payment_percentage: number;
        target_progress: number;
        requirements_desc?: string;
        notes?: string;
      }>;
    };

    const db = ensureOperationalDb();
    const ctr = db.contracts.find((c) => c.id === contractId);
    if (!ctr) {
      res.status(404).json({ message: 'Kontrak tidak ditemukan.' });
      return;
    }
    if (!Array.isArray(body.terms) || body.terms.length === 0) {
      res.status(400).json({ message: 'Minimal harus terdapat 1 termin pada jadwal pembayaran.' });
      return;
    }

    for (const t of body.terms) {
      if (Number(t.payment_percentage) <= 0 || Number(t.target_progress) < 0 || Number(t.target_progress) > 100) {
        res.status(400).json({
          message: 'Persentase termin harus bernilai positif dan target progres antara 0–100%.',
        });
        return;
      }
    }

    const totalPct = body.terms.reduce((s, t) => s + Number(t.payment_percentage), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      res.status(400).json({
        message: `Total persentase seluruh termin wajib tepat 100% (saat ini ${totalPct}%).`,
      });
      return;
    }

    const existingTerms = db.contractTerms.filter((t) => t.contract_id === contractId);
    let allocated = 0;
    const nextTermsForContract: ContractTerm[] = body.terms.map((t, idx) => {
      const prev = t.id ? existingTerms.find((ex) => ex.id === t.id) : undefined;
      const pct = Number(t.payment_percentage);
      const val =
        idx === body.terms.length - 1
          ? Math.max(0, ctr.contract_value - allocated)
          : Math.round((pct / 100) * ctr.contract_value);
      allocated += val;
      const paid = prev?.paid_amount ?? (prev?.payment_status === 'Terbayar' ? val : 0);
      return {
        id: prev?.id || `trm-${Date.now()}-${idx + 1}`,
        contract_id: contractId,
        term_number: String(t.term_number || `Termin ${idx + 1}`).trim(),
        title: String(t.title || t.term_number || `Termin ${idx + 1}`).trim(),
        period_month: String(t.period_month || ctr.start_date.slice(0, 7)),
        execution_date: String(t.execution_date || ctr.start_date),
        payment_percentage: pct,
        term_value: val,
        target_progress: Number(t.target_progress),
        actual_progress: prev?.actual_progress ?? 0,
        paid_amount: paid,
        work_status: prev?.work_status ?? 'Belum Dimulai',
        payment_status: paid >= val && val > 0 ? 'Terbayar' : prev?.payment_status ?? 'Belum Ditagih',
        timeline_status: prev?.timeline_status ?? 'Terjadwal',
        payment_realization_status:
          paid >= val && val > 0
            ? 'Lunas'
            : paid > 0
            ? 'Dibayar Sebagian'
            : 'Belum Dibayar',
        requirements_desc: String(t.requirements_desc || '').trim(),
        notes: String(t.notes || '').trim(),
        evidence_ref: prev?.evidence_ref ?? '-',
      };
    });

    db.contractTerms = [
      ...db.contractTerms.filter((t) => t.contract_id !== contractId),
      ...nextTermsForContract,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Jadwal Termin Kontrak',
        `Memperbarui ${nextTermsForContract.length} termin pada kontrak ${ctr.contract_number} (Total 100% = Rp ${ctr.contract_value.toLocaleString('id-ID')})`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db });
  });

  app.post('/api/contracts/:contractId/claims', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      actor.divisionCode === 'TEKNIK' ||
      actor.divisionCode === 'FINANCE';
    if (!allowed) {
      res.status(403).json({
        message: 'Akses ditolak untuk mengajukan pencairan termin.',
      });
      return;
    }

    const { contractId } = req.params;
    const body = req.body as {
      term_id: string;
      actual_progress: number;
      claim_date: string;
      work_description: string;
      notes?: string;
      field_report_id?: string;
      field_verified?: boolean;
      field_verified_by_name?: string;
      doc_attachment_ids?: string[];
    };

    const db = ensureOperationalDb();
    const ctr = db.contracts.find((c) => c.id === contractId);
    if (!ctr) {
      res.status(404).json({ message: 'Kontrak tidak ditemukan.' });
      return;
    }
    if (ctr.status !== 'Aktif') {
      res.status(400).json({
        message: 'Pengajuan termin hanya dapat diproses untuk kontrak yang berstatus Aktif.',
      });
      return;
    }

    const termIdx = db.contractTerms.findIndex(
      (t) => t.id === body.term_id && t.contract_id === contractId
    );
    if (termIdx === -1) {
      res.status(404).json({ message: 'Termin kontrak tidak ditemukan.' });
      return;
    }
    const term = db.contractTerms[termIdx];

    if (
      db.termClaims.some(
        (cl) => cl.term_id === term.id && (cl.status === 'Menunggu Approval' || cl.status === 'Disetujui')
      )
    ) {
      res.status(400).json({
        message: `Termin "${term.term_number}" sudah memiliki pengajuan yang sedang diproses atau disetujui.`,
      });
      return;
    }

    const actualProg = Number(body.actual_progress ?? 0);
    if (!body.field_verified) {
      res.status(400).json({
        message: 'Pengajuan termin memerlukan verifikasi kesiapan & realisasi progres dari Admin/Pelaksana Lapangan.',
      });
      return;
    }
    if (actualProg < term.target_progress) {
      res.status(400).json({
        message: `Syarat termin belum terpenuhi: realisasi progres (${actualProg}%) belum mencapai target termin (${term.target_progress}%).`,
      });
      return;
    }

    if (!String(body.work_description || '').trim()) {
      res.status(400).json({ message: 'Deskripsi pekerjaan yang sudah diselesaikan wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    const seq = String(db.termClaims.length + 1).padStart(3, '0');
    const newClaim: TermClaim = {
      id: `clm-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      claim_number: `CLM/WAS/${new Date().getFullYear()}/${seq}`,
      contract_id: ctr.id,
      term_id: term.id,
      project_id: ctr.project_id,
      target_progress: term.target_progress,
      actual_progress: actualProg,
      claim_amount: term.term_value,
      claim_date: String(body.claim_date || now.slice(0, 10)),
      work_description: String(body.work_description).trim(),
      notes: String(body.notes || '').trim(),
      field_report_id: body.field_report_id,
      field_verified_by_id: actor.employeeId,
      field_verified_by_name: String(body.field_verified_by_name || actor.fullName).trim(),
      field_verified_at: now,
      submitted_by_id: actor.employeeId,
      submitted_by_name: actor.fullName,
      doc_attachment_ids: Array.isArray(body.doc_attachment_ids) ? body.doc_attachment_ids : [],
      status: 'Menunggu Approval',
      history: [
        {
          timestamp: now,
          actor_name: actor.fullName,
          actor_role: `${actor.roleCode} ${actor.divisionCode}`,
          action: 'Pengajuan Termin',
          note: `Mengajukan ${term.term_number} senilai Rp ${term.term_value.toLocaleString('id-ID')} (Progres ${actualProg}%).`,
        },
      ],
    };

    db.termClaims = [newClaim, ...db.termClaims];
    db.contractTerms[termIdx] = {
      ...term,
      actual_progress: Math.max(term.actual_progress, actualProg),
      timeline_status: 'Menunggu Approval',
      payment_status: 'Menunggu Verifikasi',
      work_status: actualProg >= 100 ? 'Selesai' : 'Berjalan',
    };

    db.notifications = [
      makeOperationalNotification({
        type: 'Termin Pembayaran',
        title: `Pengajuan Termin Baru: ${ctr.contract_number}`,
        message: `${actor.fullName} mengajukan ${term.term_number} (Rp ${term.term_value.toLocaleString('id-ID')}) menunggu approval Finance.`,
        target_role: 'HEAD',
        target_division_id: 'div-finance',
        project_id: ctr.project_id,
        link_module: 'kontrak',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pengajuan Termin',
        `Mengajukan ${newClaim.claim_number} untuk ${term.term_number} (${ctr.contract_number}) sebesar Rp ${term.term_value.toLocaleString('id-ID')}`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, claim: newClaim });
  });

  app.post('/api/contracts/claims/:claimId/decide', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.divisionCode === 'FINANCE' && actor.roleCode === 'HEAD');
    if (!allowed) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Finance atau Super Admin yang berwenang memutus approval termin.',
      });
      return;
    }

    const { claimId } = req.params;
    const body = req.body as {
      decision: 'APPROVE' | 'REJECT' | 'REVISION';
      note?: string;
    };

    const db = ensureOperationalDb();
    const claimIdx = db.termClaims.findIndex((c) => c.id === claimId);
    if (claimIdx === -1) {
      res.status(404).json({ message: 'Pengajuan termin tidak ditemukan.' });
      return;
    }
    const claim = db.termClaims[claimIdx];
    if (claim.status !== 'Menunggu Approval') {
      res.status(400).json({
        message: `Keputusan tidak dapat diubah karena pengajuan sudah berstatus "${claim.status}".`,
      });
      return;
    }

    const note = String(body.note || '').trim();
    if ((body.decision === 'REJECT' || body.decision === 'REVISION') && !note) {
      res.status(400).json({
        message: 'Alasan penolakan atau catatan revisi wajib diisi.',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextClaimStatus =
      body.decision === 'APPROVE'
        ? 'Disetujui'
        : body.decision === 'REJECT'
        ? 'Ditolak'
        : 'Revisi';
    const nextTimelineStatus =
      body.decision === 'APPROVE'
        ? 'Disetujui'
        : body.decision === 'REJECT'
        ? 'Ditolak'
        : 'Revisi';
    const actionLabel =
      body.decision === 'APPROVE'
        ? 'Disetujui Finance'
        : body.decision === 'REJECT'
        ? 'Ditolak Finance'
        : 'Dikembalikan untuk Revisi';

    const updatedClaim: TermClaim = {
      ...claim,
      status: nextClaimStatus,
      decision_by_id: actor.employeeId,
      decision_by_name: actor.fullName,
      decision_at: now,
      decision_note: note || 'Pengajuan termin disetujui. Menunggu pencatatan realisasi pembayaran.',
      history: [
        ...claim.history,
        {
          timestamp: now,
          actor_name: actor.fullName,
          actor_role: `${actor.roleCode} ${actor.divisionCode}`,
          action: actionLabel,
          note: note || actionLabel,
        },
      ],
    };
    db.termClaims[claimIdx] = updatedClaim;

    // IMPORTANT: Approval does NOT mark payment as Lunas / Dibayar!
    const termIdx = db.contractTerms.findIndex((t) => t.id === claim.term_id);
    if (termIdx !== -1) {
      const term = db.contractTerms[termIdx];
      db.contractTerms[termIdx] = {
        ...term,
        timeline_status: nextTimelineStatus,
        payment_status: body.decision === 'APPROVE' ? 'Menunggu Verifikasi' : 'Belum Ditagih',
      };
    }

    const ctr = db.contracts.find((c) => c.id === claim.contract_id);
    db.notifications = [
      makeOperationalNotification({
        type: body.decision === 'APPROVE' ? 'Permintaan Disetujui' : 'Revisi Pengajuan',
        title: `${actionLabel}: ${claim.claim_number}`,
        message: `${actor.fullName}: ${updatedClaim.decision_note}`,
        target_role: 'ALL',
        target_division_id: 'div-teknik',
        project_id: claim.project_id,
        link_module: 'kontrak',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Approval Termin',
        `${actionLabel} untuk ${claim.claim_number} (${ctr?.contract_number ?? ''})${note ? `: ${note}` : ''}`,
        claim.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, claim: updatedClaim });
  });

  app.post('/api/contracts/claims/:claimId/payments', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed = actor.roleCode === 'SUPER_ADMIN' || actor.divisionCode === 'FINANCE';
    if (!allowed) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Finance atau Super Admin yang dapat mencatat realisasi pembayaran.',
      });
      return;
    }

    const { claimId } = req.params;
    const body = req.body as {
      paid_amount: number;
      payment_date: string;
      payment_method: TermPayment['payment_method'];
      transaction_ref: string;
      proof_attachment_ids?: string[];
      notes?: string;
    };

    const db = ensureOperationalDb();
    const claim = db.termClaims.find((c) => c.id === claimId);
    if (!claim) {
      res.status(404).json({ message: 'Pengajuan termin tidak ditemukan.' });
      return;
    }
    if (claim.status !== 'Disetujui') {
      res.status(400).json({
        message: 'Pembayaran hanya dapat dicatat untuk pengajuan termin yang sudah disetujui Finance.',
      });
      return;
    }

    const termIdx = db.contractTerms.findIndex((t) => t.id === claim.term_id);
    if (termIdx === -1) {
      res.status(404).json({ message: 'Termin kontrak terkait tidak ditemukan.' });
      return;
    }
    const term = db.contractTerms[termIdx];
    const ctr = db.contracts.find((c) => c.id === claim.contract_id);

    const existingPaid = Number(term.paid_amount ?? 0);
    const amountNow = Number(body.paid_amount || 0);
    if (!Number.isFinite(amountNow) || amountNow <= 0) {
      res.status(400).json({ message: 'Nominal pembayaran aktual harus lebih dari Rp 0.' });
      return;
    }
    if (existingPaid + amountNow > term.term_value + 1) {
      res.status(400).json({
        message: `Nominal melebihi sisa tagihan termin (Sisa: Rp ${Math.max(0, term.term_value - existingPaid).toLocaleString('id-ID')}).`,
      });
      return;
    }
    if (!String(body.transaction_ref || '').trim()) {
      res.status(400).json({ message: 'Nomor referensi transaksi pembayaran wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    const seq = String(db.termPayments.length + 1).padStart(3, '0');
    const newPayment: TermPayment = {
      id: `pay-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      payment_no: `PAY/WAS/${new Date().getFullYear()}/${seq}`,
      contract_id: claim.contract_id,
      term_id: term.id,
      claim_id: claim.id,
      approved_amount: claim.claim_amount,
      paid_amount: amountNow,
      payment_date: String(body.payment_date || now.slice(0, 10)),
      payment_method: body.payment_method || 'Transfer Bank',
      transaction_ref: String(body.transaction_ref).trim(),
      proof_attachment_ids: Array.isArray(body.proof_attachment_ids) ? body.proof_attachment_ids : [],
      notes: String(body.notes || '').trim(),
      recorded_by_id: actor.employeeId,
      recorded_by_name: actor.fullName,
      created_at: now,
    };
    db.termPayments = [newPayment, ...db.termPayments];

    const totalPaidAfter = existingPaid + amountNow;
    const isLunas = totalPaidAfter >= term.term_value;
    db.contractTerms[termIdx] = {
      ...term,
      paid_amount: totalPaidAfter,
      payment_realization_status: isLunas ? 'Lunas' : 'Dibayar Sebagian',
      payment_status: isLunas ? 'Terbayar' : 'Menunggu Verifikasi',
      timeline_status: isLunas ? 'Dibayar' : 'Disetujui',
      evidence_ref: newPayment.transaction_ref,
    };

    // Sync to FinancialTransaction ledger
    const finTx: FinancialTransaction = {
      id: `fin-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: claim.project_id,
      contract_term_id: term.id,
      transaction_no: newPayment.transaction_ref,
      date: newPayment.payment_date,
      category: 'Pembayaran Termin',
      type: 'Pemasukan',
      amount: amountNow,
      status: 'Terverifikasi',
      proof_ref: newPayment.payment_no,
      description: `Realisasi pembayaran ${term.term_number} (${ctr?.contract_number ?? ''})${isLunas ? ' - Lunas' : ' - Bertahap'}`,
      created_by_id: actor.employeeId,
    };
    db.financialTransactions = [finTx, ...db.financialTransactions];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Realisasi Pembayaran Termin',
        `Mencatat pembayaran ${newPayment.payment_no} untuk ${term.term_number} sebesar Rp ${amountNow.toLocaleString('id-ID')} (${isLunas ? 'Lunas' : 'Dibayar Sebagian'})`,
        claim.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, payment: newPayment });
  });

  app.post('/api/contracts/:contractId/addendums', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const allowed =
      actor.roleCode === 'SUPER_ADMIN' ||
      (actor.roleCode === 'HEAD' && (actor.divisionCode === 'FINANCE' || actor.divisionCode === 'TEKNIK'));
    if (!allowed) {
      res.status(403).json({
        message: 'Hanya Super Admin, Head Finance, atau Head Teknik yang berwenang menerbitkan addendum kontrak.',
      });
      return;
    }

    const { contractId } = req.params;
    const body = req.body as {
      addendum_number: string;
      addendum_date: string;
      change_type: AddendumChangeType;
      value_after: number;
      end_date_after?: string;
      scope_after?: string;
      reason: string;
      approved_by_name?: string;
      attachment_ids?: string[];
      adjusted_terms?: Array<{
        term_id: string;
        payment_percentage: number;
        execution_date: string;
      }>;
    };

    const db = ensureOperationalDb();
    const ctrIdx = db.contracts.findIndex((c) => c.id === contractId);
    if (ctrIdx === -1) {
      res.status(404).json({ message: 'Kontrak tidak ditemukan.' });
      return;
    }
    const ctr = db.contracts[ctrIdx];

    const addNo = String(body.addendum_number || '').trim();
    if (!addNo) {
      res.status(400).json({ message: 'Nomor addendum wajib diisi.' });
      return;
    }
    if (db.contractAddendums.some((a) => a.addendum_number.toLowerCase() === addNo.toLowerCase())) {
      res.status(400).json({ message: `Nomor addendum "${addNo}" sudah digunakan.` });
      return;
    }
    if (!String(body.reason || '').trim()) {
      res.status(400).json({ message: 'Alasan perubahan addendum wajib diisi.' });
      return;
    }

    const newVal = Number(body.value_after || ctr.contract_value);
    if (!Number.isFinite(newVal) || newVal <= 0) {
      res.status(400).json({ message: 'Nilai kontrak setelah addendum harus lebih dari Rp 0.' });
      return;
    }
    const newEndDate = String(body.end_date_after || ctr.end_date);
    if (newEndDate < ctr.start_date) {
      res.status(400).json({ message: 'Tanggal selesai baru tidak boleh lebih awal dari tanggal mulai.' });
      return;
    }

    const now = new Date().toISOString();
    const currentTerms = db.contractTerms.filter((t) => t.contract_id === ctr.id);
    const snapshotVersion = ctr.current_version ?? 1;
    const snapshot = {
      version: snapshotVersion,
      timestamp: now,
      changed_by_name: actor.fullName,
      reason: `Sebelum Addendum ${addNo}: ${String(body.reason).trim()}`,
      contract_number: ctr.contract_number,
      contract_value: ctr.contract_value,
      start_date: ctr.start_date,
      end_date: ctr.end_date,
      scope_description: ctr.scope_description || ctr.work_name,
      term_snapshot: currentTerms.map((t) => ({
        id: t.id,
        term_number: t.term_number,
        payment_percentage: t.payment_percentage,
        term_value: t.term_value,
        execution_date: t.execution_date,
      })),
    };

    const adjustments: NonNullable<ContractAddendum['term_adjustments']> = [];
    if (currentTerms.length > 0) {
      const pctSum = Array.isArray(body.adjusted_terms) && body.adjusted_terms.length === currentTerms.length
        ? body.adjusted_terms.reduce((s, a) => s + Number(a.payment_percentage), 0)
        : currentTerms.reduce((s, t) => s + Number(t.payment_percentage), 0);

      if (Math.abs(pctSum - 100) > 0.01) {
        res.status(400).json({
          message: `Total persentase termin penyesuaian wajib 100% (saat ini ${pctSum}%).`,
        });
        return;
      }

      let allocated = 0;
      const updatedTermsForCtr = currentTerms.map((t, idx) => {
        const adjInput = body.adjusted_terms?.find((a) => a.term_id === t.id);
        const nextPct = adjInput ? Number(adjInput.payment_percentage) : t.payment_percentage;
        const nextDate = adjInput ? String(adjInput.execution_date || t.execution_date) : t.execution_date;
        const nextVal =
          idx === currentTerms.length - 1
            ? Math.max(0, newVal - allocated)
            : Math.round((nextPct / 100) * newVal);
        allocated += nextVal;
        adjustments.push({
          term_id: t.id,
          term_number: t.term_number,
          old_value: t.term_value,
          new_value: nextVal,
          old_percentage: t.payment_percentage,
          new_percentage: nextPct,
          old_date: t.execution_date,
          new_date: nextDate,
        });
        const paid = Number(t.paid_amount ?? 0);
        return {
          ...t,
          payment_percentage: nextPct,
          term_value: nextVal,
          execution_date: nextDate,
          period_month: nextDate.slice(0, 7),
          payment_realization_status:
            paid >= nextVal && nextVal > 0
              ? ('Lunas' as const)
              : paid > 0
              ? ('Dibayar Sebagian' as const)
              : ('Belum Dibayar' as const),
          payment_status: paid >= nextVal && nextVal > 0 ? ('Terbayar' as const) : ('Belum Ditagih' as const),
        };
      });

      db.contractTerms = [
        ...db.contractTerms.filter((t) => t.contract_id !== ctr.id),
        ...updatedTermsForCtr,
      ];
    }

    const addendumRecord: ContractAddendum = {
      id: `add-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      addendum_number: addNo,
      contract_id: ctr.id,
      project_id: ctr.project_id,
      addendum_date: String(body.addendum_date || now.slice(0, 10)),
      change_type: body.change_type || 'Perubahan Nilai Kontrak',
      value_before: ctr.contract_value,
      value_after: newVal,
      end_date_before: ctr.end_date,
      end_date_after: newEndDate,
      scope_after: String(body.scope_after || ctr.scope_description || '').trim(),
      reason: String(body.reason).trim(),
      approved_by_id: actor.employeeId,
      approved_by_name: String(body.approved_by_name || actor.fullName).trim(),
      attachment_ids: Array.isArray(body.attachment_ids) ? body.attachment_ids : [],
      term_adjustments: adjustments,
      created_at: now,
    };

    db.contractAddendums = [addendumRecord, ...db.contractAddendums];
    db.contracts[ctrIdx] = {
      ...ctr,
      contract_value: newVal,
      end_date: newEndDate,
      scope_description: addendumRecord.scope_after || ctr.scope_description,
      current_version: snapshotVersion + 1,
      versions: [snapshot, ...(ctr.versions || [])],
      updated_at: now,
    };

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Addendum Kontrak',
        `Menerbitkan ${addNo} (${addendumRecord.change_type}) untuk ${ctr.contract_number}: Rp ${ctr.contract_value.toLocaleString('id-ID')} -> Rp ${newVal.toLocaleString('id-ID')}`,
        ctr.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, addendum: addendumRecord });
  });

  // ============================================================================
  // GUDANG & PERSEDIAAN (WAREHOUSE & INVENTORY) TRANSACTIONAL API
  // Alur Penambahan Stok: Finance Menyetujui Pengadaan -> Logistik Konfirmasi Barang Diterima -> Stok Bertambah
  // ============================================================================

  const roundQty = (n: number): number => Math.round(n * 100) / 100;

  const isFinanceActor = (actor: ActorContext) => {
    const truth = resolveActorDbTruth(ensureOperationalDb(), actor);
    if (!truth) return false;
    return truth.role === 'SUPER_ADMIN' || truth.division === 'FINANCE';
  };
  const isLogisticsActor = (actor: ActorContext) => {
    const truth = resolveActorDbTruth(ensureOperationalDb(), actor);
    if (!truth) return false;
    return hasLogistikModuleAccess(truth.role, truth.division);
  };
  const isHeadLogisticsActor = (db: PMSState, actor: ActorContext) => {
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) return false;
    return truth.role === 'HEAD' && truth.division === 'LOGISTIK';
  };
  const isFieldRequestActor = (actor: ActorContext) => {
    const truth = resolveActorDbTruth(ensureOperationalDb(), actor);
    if (!truth) return false;
    return (
      truth.role === 'SUPER_ADMIN' ||
      truth.division === 'TEKNIK' ||
      truth.division === 'LOGISTIK'
    );
  };

  const appendWarehouseAudit = (
    db: PMSState,
    actor: ActorContext,
    entry: Omit<WarehouseAuditEntry, 'id' | 'timestamp' | 'actor_id' | 'actor_name' | 'actor_role' | 'actor_division'>
  ) => {
    const rec: WarehouseAuditEntry = {
      ...entry,
      id: `wh-aud-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
      timestamp: new Date().toISOString(),
      actor_id: actor.employeeId,
      actor_name: actor.fullName,
      actor_role: actor.roleCode,
      actor_division: actor.divisionCode,
    };
    db.warehouseAuditLogs = [rec, ...(db.warehouseAuditLogs || [])];
  };

  // 0. Master Data Lokasi Gudang (Kelola Beberapa Gudang)
  app.get('/api/warehouse/locations', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    res.json({ warehouses: db.warehouses || [] });
  });

  app.post('/api/warehouse/locations', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor) && !isFinanceActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik, Finance, atau Super Admin yang berwenang menambah lokasi gudang.',
      });
      return;
    }

    const body = req.body as {
      code?: string;
      name?: string;
      address?: string;
      pic_name?: string;
      notes?: string;
      is_active?: boolean;
    };
    const name = replaceBekasiWithDepokText(String(body.name || '').trim()).value;
    const address = replaceBekasiWithDepokText(String(body.address || '').trim()).value;
    const picName = String(body.pic_name || '').trim() || actor.fullName;
    const notes = body.notes ? replaceBekasiWithDepokText(String(body.notes).trim()).value : undefined;

    if (!name || !address) {
      res.status(400).json({ message: 'Nama gudang dan alamat lokasi wajib diisi.' });
      return;
    }

    const db = ensureOperationalDb();
    const list = db.warehouses || [];
    const nextCode =
      String(body.code || '').trim() ||
      `GDG-DPK-${String(list.length + 1).padStart(2, '0')}`;

    const dupCode = list.find((w) => w.code.toLowerCase() === nextCode.toLowerCase());
    if (dupCode) {
      res.status(409).json({ message: `Kode gudang "${nextCode}" sudah digunakan.` });
      return;
    }
    const dupName = list.find((w) => w.name.toLowerCase() === name.toLowerCase());
    if (dupName) {
      res.status(409).json({ message: `Nama gudang "${name}" sudah terdaftar.` });
      return;
    }

    const now = new Date().toISOString();
    const created: WarehouseLocation = {
      id: `wh-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      code: nextCode,
      name,
      address,
      pic_name: picName,
      notes,
      is_active: body.is_active !== false,
      created_at: now,
      updated_at: now,
    };

    db.warehouses = [...list, created];
    appendWarehouseAudit(db, actor, {
      action: 'MASTER_GUDANG_BARU',
      material_id: created.id,
      material_name: `${created.code} — ${created.name}`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: created.code,
      detail: `Menambahkan lokasi gudang baru "${created.name}" (${created.address}, PIC ${created.pic_name}).`,
    });
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Lokasi Gudang',
        `Menambahkan lokasi gudang baru ${created.code} — ${created.name} (${created.address}).`
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, warehouse: created });
  });

  app.put('/api/warehouse/locations/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor) && !isFinanceActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik, Finance, atau Super Admin yang berwenang mengubah lokasi gudang.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const list = db.warehouses || [];
    const idx = list.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Lokasi gudang tidak ditemukan.' });
      return;
    }

    const current = list[idx];
    const body = req.body as {
      code?: string;
      name?: string;
      address?: string;
      pic_name?: string;
      notes?: string;
      is_active?: boolean;
    };
    const nextCode = body.code !== undefined ? String(body.code).trim() : current.code;
    const nextName =
      body.name !== undefined
        ? replaceBekasiWithDepokText(String(body.name).trim()).value
        : current.name;
    const nextAddr =
      body.address !== undefined
        ? replaceBekasiWithDepokText(String(body.address).trim()).value
        : current.address;
    const nextPic = body.pic_name !== undefined ? String(body.pic_name).trim() : current.pic_name;
    const nextNotes =
      body.notes !== undefined
        ? replaceBekasiWithDepokText(String(body.notes).trim()).value
        : current.notes;
    const nextActive = body.is_active !== undefined ? Boolean(body.is_active) : current.is_active;

    if (!nextCode || !nextName || !nextAddr) {
      res.status(400).json({ message: 'Kode, nama gudang, dan alamat lokasi wajib diisi.' });
      return;
    }

    const dupCode = list.find(
      (w) => w.id !== current.id && w.code.toLowerCase() === nextCode.toLowerCase()
    );
    if (dupCode) {
      res.status(409).json({ message: `Kode gudang "${nextCode}" sudah digunakan.` });
      return;
    }
    const dupName = list.find(
      (w) => w.id !== current.id && w.name.toLowerCase() === nextName.toLowerCase()
    );
    if (dupName) {
      res.status(409).json({ message: `Nama gudang "${nextName}" sudah digunakan.` });
      return;
    }

    if (!nextActive) {
      const otherActive = list.some((w) => w.id !== current.id && w.is_active);
      if (!otherActive) {
        res.status(400).json({ message: 'Minimal satu lokasi gudang harus tetap aktif.' });
        return;
      }
    }

    const updated: WarehouseLocation = {
      ...current,
      code: nextCode,
      name: nextName,
      address: nextAddr,
      pic_name: nextPic || current.pic_name,
      notes: nextNotes,
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    };
    list[idx] = updated;
    db.warehouses = list;

    // Sinkronkan label lokasi pada material & transaksi terkait jika nama gudang berubah
    if (nextName !== current.name) {
      db.materials = db.materials.map((m) =>
        m.default_warehouse_id === updated.id
          ? { ...m, warehouse_location: updated.name }
          : m
      );
      db.materialTransactions = db.materialTransactions.map((t) =>
        t.warehouse_id === updated.id ? { ...t, warehouse_name: updated.name } : t
      );
      db.warehouseOrders = (db.warehouseOrders || []).map((o) =>
        o.warehouse_id === updated.id ? { ...o, warehouse_name: updated.name } : o
      );
      db.stockOpnames = (db.stockOpnames || []).map((o) =>
        o.warehouse_id === updated.id ? { ...o, warehouse_name: updated.name } : o
      );
      db.deliveryNotes = (db.deliveryNotes || []).map((dn) =>
        dn.source_warehouse_id === updated.id
          ? { ...dn, source_warehouse_name: updated.name }
          : dn
      );
    }

    appendWarehouseAudit(db, actor, {
      action: 'UPDATE_MASTER_GUDANG',
      material_id: updated.id,
      material_name: `${updated.code} — ${updated.name}`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: updated.code,
      detail: `Memperbarui lokasi gudang "${updated.name}" (status: ${updated.is_active ? 'Aktif' : 'Nonaktif'}).`,
    });

    saveOperationalDb(db);
    res.json({ state: db, warehouse: updated });
  });

  // 1. Create Master Data Barang (Logistik & Super Admin only; stock starts at 0)
  app.post('/api/warehouse/materials', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mengelola Data Barang.',
      });
      return;
    }

    const body = req.body as Partial<Material>;
    const code = String(body.code || '').trim();
    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim() || 'Umum';
    const unit = String(body.unit || '').trim() || 'Unit';
    const requestedWhKey = String(body.default_warehouse_id || body.warehouse_location || '').trim();
    const minStock = Number(body.min_stock ?? 0);
    const unitCost = Number(body.unit_cost ?? 0);
    const skuNotes = String(body.sku_notes || '').trim();

    if (!code || !name || !unit) {
      res.status(400).json({ message: 'Kode barang, nama barang, dan satuan wajib diisi.' });
      return;
    }
    if (!requestedWhKey) {
      res.status(400).json({ message: 'Lokasi gudang wajib dipilih dari Data Gudang.' });
      return;
    }
    if (!Number.isFinite(minStock) || minStock < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      res.status(400).json({ message: 'Stok minimum dan harga satuan tidak boleh bernilai negatif.' });
      return;
    }

    const db = ensureOperationalDb();
    const targetWh = (db.warehouses || []).find(
      (w) =>
        w.id === requestedWhKey ||
        w.name.toLowerCase() === requestedWhKey.toLowerCase() ||
        w.code.toLowerCase() === requestedWhKey.toLowerCase()
    );
    if (!targetWh) {
      res.status(400).json({ message: 'Lokasi gudang yang dipilih tidak ditemukan di Data Gudang.' });
      return;
    }

    const dupCode = db.materials.find((m) => m.code.toLowerCase() === code.toLowerCase());
    if (dupCode) {
      res.status(409).json({ message: `Kode barang "${code}" sudah terdaftar.` });
      return;
    }

    const now = new Date().toISOString();
    const created: Material = {
      id: `mat-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      code,
      name,
      category,
      unit,
      stock: 0,
      min_stock: roundQty(minStock),
      default_warehouse_id: targetWh.id,
      warehouse_location: targetWh.name,
      warehouse_stocks: { [targetWh.id]: 0 },
      unit_cost: Math.round(unitCost),
      sku_notes: skuNotes || undefined,
      updated_at: now,
      updated_by_name: actor.fullName,
    };

    db.materials = [created, ...db.materials];
    appendWarehouseAudit(db, actor, {
      action: 'MASTER_BARANG_BARU',
      material_id: created.id,
      material_name: `${created.code} — ${created.name}`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: created.code,
      detail: `Mendaftarkan master barang baru (${created.unit}, min. stok ${created.min_stock} ${created.unit}) di gudang ${targetWh.name}.`,
    });
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Data Barang Gudang',
        `Mendaftarkan master barang ${created.code} — ${created.name} di ${targetWh.name} (stok awal 0, menunggu pengadaan Finance + konfirmasi Logistik).`
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, material: created });
  });

  // 2. Update Master Data Barang (Logistik & Super Admin only; cannot directly mutate stock)
  app.put('/api/warehouse/materials/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mengubah Data Barang.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const idx = db.materials.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data barang tidak ditemukan.' });
      return;
    }

    const current = db.materials[idx];
    const body = req.body as Partial<Material>;
    const nextCode = body.code !== undefined ? String(body.code).trim() : current.code;
    const nextName = body.name !== undefined ? String(body.name).trim() : current.name;
    const nextMin = body.min_stock !== undefined ? Number(body.min_stock) : current.min_stock;
    const nextCost = body.unit_cost !== undefined ? Number(body.unit_cost) : current.unit_cost;

    if (!nextCode || !nextName) {
      res.status(400).json({ message: 'Kode dan nama barang wajib diisi.' });
      return;
    }
    if (!Number.isFinite(nextMin) || nextMin < 0 || !Number.isFinite(nextCost) || nextCost < 0) {
      res.status(400).json({ message: 'Stok minimum dan harga satuan tidak boleh negatif.' });
      return;
    }
    const dupCode = db.materials.find(
      (m) => m.id !== current.id && m.code.toLowerCase() === nextCode.toLowerCase()
    );
    if (dupCode) {
      res.status(409).json({ message: `Kode barang "${nextCode}" sudah digunakan item lain.` });
      return;
    }

    const requestedWhKey =
      body.default_warehouse_id !== undefined || body.warehouse_location !== undefined
        ? String(body.default_warehouse_id || body.warehouse_location || '').trim()
        : '';
    const resolvedWh = requestedWhKey
      ? (db.warehouses || []).find(
          (w) =>
            w.id === requestedWhKey ||
            w.name.toLowerCase() === requestedWhKey.toLowerCase() ||
            w.code.toLowerCase() === requestedWhKey.toLowerCase()
        )
      : resolveWarehouseInDb(db, current.default_warehouse_id || current.warehouse_location);
    if (requestedWhKey && !resolvedWh) {
      res.status(400).json({ message: 'Lokasi gudang yang dipilih tidak ditemukan di Data Gudang.' });
      return;
    }
    const targetWh = resolvedWh!;

    const updated: Material = {
      ...current,
      code: nextCode,
      name: nextName,
      category: body.category !== undefined ? String(body.category).trim() || current.category : current.category,
      unit: body.unit !== undefined ? String(body.unit).trim() || current.unit : current.unit,
      min_stock: roundQty(nextMin),
      default_warehouse_id: targetWh.id,
      warehouse_location: targetWh.name,
      unit_cost: Math.round(nextCost),
      sku_notes: body.sku_notes !== undefined ? String(body.sku_notes).trim() : current.sku_notes,
      updated_at: new Date().toISOString(),
      updated_by_name: actor.fullName,
    };

    db.materials[idx] = updated;
    appendWarehouseAudit(db, actor, {
      action: 'UPDATE_MASTER_BARANG',
      material_id: updated.id,
      material_name: `${updated.code} — ${updated.name}`,
      qty_delta: 0,
      stock_before: updated.stock,
      stock_after: updated.stock,
      ref_no: updated.code,
      detail: `Memperbarui metadata master barang (min. stok ${updated.min_stock} ${updated.unit}, lokasi ${updated.warehouse_location}).`,
    });

    saveOperationalDb(db);
    res.json({ state: db, material: updated });
  });

  // 3. Create Stock Addition / Procurement Order
  // Finance (Tambah Qty / Pengadaan) -> directly 'Disetujui Finance' (awaiting Logistics receipt)
  // Logistik (Ajukan Pengadaan) -> 'Menunggu Persetujuan Finance'
  app.post('/api/warehouse/orders', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isFinanceActor(actor) && !isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Finance, Divisi Logistik, atau Super Admin yang dapat membuat pengadaan/penambahan stok.',
      });
      return;
    }

    const body = req.body as {
      material_id?: string;
      warehouse_id?: string;
      qty_planned?: number;
      order_date?: string;
      source_name?: string;
      proof_ref?: string;
      unit_cost?: number;
      project_id?: string;
      rab_item_id?: string;
      proof_attachment_ids?: string[];
      notes?: string;
    };

    const materialId = String(body.material_id || '').trim();
    const warehouseIdInput = String(body.warehouse_id || '').trim();
    const qtyPlanned = Number(body.qty_planned ?? 0);
    const orderDate = String(body.order_date || '').trim();
    const sourceName = String(body.source_name || '').trim();
    const proofRef = String(body.proof_ref || '').trim();

    if (!materialId || !warehouseIdInput || !orderDate || !sourceName || !proofRef) {
      res.status(400).json({
        message: 'Nama barang, lokasi gudang tujuan, tanggal, sumber barang, dan referensi bukti transaksi wajib diisi.',
      });
      return;
    }
    if (!Number.isFinite(qtyPlanned) || qtyPlanned <= 0) {
      res.status(400).json({ message: 'Qty penambahan stok harus lebih besar dari 0.' });
      return;
    }

    const db = ensureOperationalDb();
    const mat = db.materials.find((m) => m.id === materialId);
    if (!mat) {
      res.status(404).json({ message: 'Data barang tidak ditemukan di master gudang.' });
      return;
    }
    const targetWh = (db.warehouses || []).find(
      (w) => w.id === warehouseIdInput || w.name.toLowerCase() === warehouseIdInput.toLowerCase()
    );
    if (!targetWh) {
      res.status(400).json({ message: 'Lokasi gudang tujuan tidak ditemukan di Data Gudang.' });
      return;
    }
    if (!targetWh.is_active) {
      res.status(400).json({ message: `Gudang "${targetWh.name}" sedang nonaktif dan tidak dapat menerima stok baru.` });
      return;
    }

    const unitCost =
      body.unit_cost !== undefined && Number.isFinite(Number(body.unit_cost)) && Number(body.unit_cost) >= 0
        ? Math.round(Number(body.unit_cost))
        : mat.unit_cost;

    const now = new Date().toISOString();
    const financeInitiated = isFinanceActor(actor);
    const orderNo = `PGD-${now.slice(0, 7).replace('-', '')}-${String((db.warehouseOrders || []).length + 1).padStart(3, '0')}`;

    const order: WarehouseStockOrder = {
      id: `pgd-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      order_no: orderNo,
      material_id: mat.id,
      warehouse_id: targetWh.id,
      warehouse_name: targetWh.name,
      project_id: body.project_id ? String(body.project_id).trim() || undefined : undefined,
      rab_item_id: body.rab_item_id ? String(body.rab_item_id).trim() || undefined : undefined,
      qty_planned: roundQty(qtyPlanned),
      qty_actual: 0,
      unit: mat.unit,
      order_date: orderDate,
      source_name: sourceName,
      unit_cost: unitCost,
      total_cost: Math.round(qtyPlanned * unitCost),
      proof_ref: proofRef,
      proof_attachment_ids: Array.isArray(body.proof_attachment_ids) ? body.proof_attachment_ids : [],
      status: financeInitiated ? 'Disetujui Finance' : 'Menunggu Persetujuan Finance',
      initiated_by_role: `${actor.roleCode}/${actor.divisionCode}`,
      requested_by_id: actor.employeeId,
      requested_by_name: actor.fullName,
      finance_approved_by_id: financeInitiated ? actor.employeeId : undefined,
      finance_approved_by_name: financeInitiated ? actor.fullName : undefined,
      finance_approved_at: financeInitiated ? now : undefined,
      finance_note: financeInitiated
        ? `Tambah Qty stok ke ${targetWh.name} disetujui oleh Finance (${actor.fullName}). Menunggu konfirmasi penerimaan Logistik.`
        : undefined,
      notes: String(body.notes || '').trim(),
      stock_applied: false,
      created_at: now,
    };

    db.warehouseOrders = [order, ...(db.warehouseOrders || [])];

    appendWarehouseAudit(db, actor, {
      action: financeInitiated ? 'FINANCE_TAMBAH_QTY_DISETUJUI' : 'PENGAJUAN_PENGADAAN_BARU',
      material_id: mat.id,
      material_name: `${mat.code} — ${mat.name}`,
      qty_delta: 0,
      stock_before: mat.stock,
      stock_after: mat.stock,
      ref_no: orderNo,
      detail: financeInitiated
        ? `Finance menyetujui penambahan ${order.qty_planned} ${mat.unit} ke ${targetWh.name} dari ${sourceName} (bukti: ${proofRef}). Menunggu konfirmasi penerimaan Logistik.`
        : `Logistik mengajukan pengadaan ${order.qty_planned} ${mat.unit} untuk ${targetWh.name} dari ${sourceName} (bukti: ${proofRef}).`,
    });

    db.notifications = [
      makeOperationalNotification({
        type: 'Pengadaan Material',
        title: financeInitiated
          ? `Siap Diterima Logistik: ${orderNo}`
          : `Approval Pengadaan Diperlukan: ${orderNo}`,
        message: financeInitiated
          ? `Finance (${actor.fullName}) menyetujui tambah Qty ${order.qty_planned} ${mat.unit} ${mat.name} ke ${targetWh.name}. Logistik harap konfirmasi barang diterima.`
          : `Logistik mengajukan pengadaan ${order.qty_planned} ${mat.unit} ${mat.name} ke ${targetWh.name} untuk persetujuan Finance.`,
        target_role: 'ALL',
        target_division_id: financeInitiated ? 'div-logistik' : 'div-finance',
        project_id: order.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        financeInitiated ? 'Finance Tambah Qty Stok' : 'Pengajuan Pengadaan Gudang',
        `${orderNo}: ${order.qty_planned} ${mat.unit} ${mat.name} -> ${targetWh.name} (${sourceName}, bukti ${proofRef}).`,
        order.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, order });
  });

  // 4. Finance Decision on Pending Procurement Order (Finance & Super Admin only)
  app.post('/api/warehouse/orders/:id/decide-finance', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isFinanceActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Finance atau Super Admin yang berwenang menyetujui/menolak pengadaan stok.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const orders = db.warehouseOrders || [];
    const idx = orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data pengadaan tidak ditemukan.' });
      return;
    }

    const current = orders[idx];
    if (current.status !== 'Menunggu Persetujuan Finance') {
      res.status(409).json({
        message: `Pengadaan ${current.order_no} sudah berstatus "${current.status}" dan tidak dapat diputuskan ulang.`,
      });
      return;
    }

    const body = req.body as { decision?: 'APPROVE' | 'REJECT'; note?: string };
    if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') {
      res.status(400).json({ message: 'Keputusan harus APPROVE atau REJECT.' });
      return;
    }

    const now = new Date().toISOString();
    const nextStatus = body.decision === 'APPROVE' ? 'Disetujui Finance' : 'Ditolak Finance';
    const updated: WarehouseStockOrder = {
      ...current,
      status: nextStatus,
      finance_approved_by_id: actor.employeeId,
      finance_approved_by_name: actor.fullName,
      finance_approved_at: now,
      finance_note: String(body.note || '').trim() || `Diputuskan ${nextStatus} oleh ${actor.fullName}.`,
    };

    orders[idx] = updated;
    db.warehouseOrders = orders;

    const mat = db.materials.find((m) => m.id === current.material_id);
    appendWarehouseAudit(db, actor, {
      action: body.decision === 'APPROVE' ? 'APPROVE_PENGADAAN_FINANCE' : 'TOLAK_PENGADAAN_FINANCE',
      material_id: current.material_id,
      material_name: mat ? `${mat.code} — ${mat.name}` : current.material_id,
      qty_delta: 0,
      stock_before: mat?.stock ?? 0,
      stock_after: mat?.stock ?? 0,
      ref_no: current.order_no,
      detail: `${nextStatus} untuk ${current.qty_planned} ${current.unit}. ${updated.finance_note || ''}`,
    });

    db.notifications = [
      makeOperationalNotification({
        type: body.decision === 'APPROVE' ? 'Permintaan Disetujui' : 'Permintaan Ditolak',
        title: `${current.order_no} ${nextStatus}`,
        message:
          body.decision === 'APPROVE'
            ? `Pengadaan ${mat?.name ?? ''} (${current.qty_planned} ${current.unit}) disetujui Finance. Logistik silakan konfirmasi penerimaan barang.`
            : `Pengadaan ${mat?.name ?? ''} (${current.qty_planned} ${current.unit}) ditolak Finance.`,
        target_role: 'ALL',
        target_division_id: 'div-logistik',
        project_id: current.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Approval Pengadaan Gudang',
        `${current.order_no} ${nextStatus} (${current.qty_planned} ${current.unit}).`,
        current.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, order: updated });
  });

  // 5. Logistics Confirm Goods Received -> Stock Automatically Increases by Actual Qty
  // Strictly requires Finance approval first & blocks duplicate confirmation!
  app.post('/api/warehouse/orders/:id/confirm-receipt', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mengonfirmasi penerimaan barang masuk.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const orders = db.warehouseOrders || [];
    const idx = orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data pengadaan / tambah stok tidak ditemukan.' });
      return;
    }

    const order = orders[idx];
    if (order.stock_applied || order.status === 'Diterima Gudang') {
      res.status(409).json({
        message: `Penerimaan ${order.order_no} sudah dikonfirmasi sebelumnya (pencegahan penambahan stok ganda).`,
      });
      return;
    }
    if (order.status !== 'Disetujui Finance') {
      res.status(400).json({
        message: `Barang belum disetujui Finance (status saat ini: ${order.status}). Stok hanya dapat bertambah setelah persetujuan Finance.`,
      });
      return;
    }

    const body = req.body as {
      warehouse_id?: string;
      qty_actual?: number;
      received_date?: string;
      source_name?: string;
      proof_ref?: string;
      inspection_note?: string;
      proof_attachment_ids?: string[];
    };

    const qtyActual = Number(body.qty_actual ?? 0);
    const receivedDate = String(body.received_date || '').trim() || new Date().toISOString().slice(0, 10);
    const sourceName = String(body.source_name || order.source_name).trim();
    const proofRef = String(body.proof_ref || order.proof_ref).trim();

    if (!Number.isFinite(qtyActual) || qtyActual <= 0) {
      res.status(400).json({ message: 'Qty aktual yang diterima harus lebih besar dari 0.' });
      return;
    }
    if (!sourceName || !proofRef) {
      res.status(400).json({ message: 'Sumber barang dan bukti transaksi wajib diisi.' });
      return;
    }

    const matIdx = db.materials.findIndex((m) => m.id === order.material_id);
    if (matIdx === -1) {
      res.status(404).json({ message: 'Master barang terkait tidak ditemukan.' });
      return;
    }

    const mat = db.materials[matIdx];
    const targetWhKey = String(body.warehouse_id || order.warehouse_id || mat.default_warehouse_id || '').trim();
    const targetWh = resolveWarehouseInDb(db, targetWhKey);
    const deltaRes = applyWarehouseStockDelta(mat, targetWh.id, roundQty(qtyActual));
    const stockBefore = deltaRes.whBefore;
    const stockAfter = deltaRes.whAfter;
    const now = new Date().toISOString();

    db.materials[matIdx] = {
      ...mat,
      warehouse_stocks: deltaRes.nextStocks,
      stock: deltaRes.totalAfter,
      updated_at: now,
      updated_by_name: actor.fullName,
    };

    const updatedOrder: WarehouseStockOrder = {
      ...order,
      warehouse_id: targetWh.id,
      warehouse_name: targetWh.name,
      qty_actual: roundQty(qtyActual),
      received_date: receivedDate,
      source_name: sourceName,
      proof_ref: proofRef,
      proof_attachment_ids:
        Array.isArray(body.proof_attachment_ids) && body.proof_attachment_ids.length > 0
          ? body.proof_attachment_ids
          : order.proof_attachment_ids,
      status: 'Diterima Gudang',
      received_by_id: actor.employeeId,
      received_by_name: actor.fullName,
      received_at: now,
      inspection_note: String(body.inspection_note || '').trim() || 'Kondisi baik & sesuai jumlah aktual.',
      stock_applied: true,
    };
    orders[idx] = updatedOrder;
    db.warehouseOrders = orders;

    const tx: MaterialTransaction = {
      id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      material_id: mat.id,
      project_id: order.project_id || '',
      warehouse_id: targetWh.id,
      warehouse_name: targetWh.name,
      order_id: order.id,
      rab_item_id: order.rab_item_id,
      type: 'Masuk',
      qty: roundQty(qtyActual),
      stock_before: stockBefore,
      stock_after: stockAfter,
      date: receivedDate,
      pic_name: actor.fullName,
      source_or_destination: `${sourceName} → ${targetWh.name}`,
      proof_ref: proofRef,
      reference_no: order.order_no,
      notes: `Barang masuk ke ${targetWh.name} diterima Logistik (${updatedOrder.inspection_note}). Disetujui Finance: ${order.finance_approved_by_name || '-'}.`,
    };
    db.materialTransactions = [tx, ...db.materialTransactions];

    // Update linked project workflow procurement status if tied to a project
    if (order.project_id) {
      const wfIdx = db.workflows.findIndex((w) => w.project_id === order.project_id);
      if (wfIdx >= 0) {
        db.workflows[wfIdx].material_needs = recomputeProcurementStatuses(
          db.workflows[wfIdx],
          db.materials
        );
      }
    }

    appendWarehouseAudit(db, actor, {
      action: 'KONFIRMASI_BARANG_MASUK',
      material_id: mat.id,
      material_name: `${mat.code} — ${mat.name}`,
      qty_delta: roundQty(qtyActual),
      stock_before: stockBefore,
      stock_after: stockAfter,
      ref_no: order.order_no,
      detail: `Logistik mengonfirmasi penerimaan ${qtyActual} ${mat.unit} di ${targetWh.name} dari ${sourceName} (Bukti: ${proofRef}). Stok gudang tersebut: ${stockBefore} -> ${stockAfter} ${mat.unit} (Total semua gudang: ${deltaRes.totalAfter} ${mat.unit}).`,
    });

    db.notifications = [
      makeOperationalNotification({
        type: 'Pengadaan Material',
        title: `Stok Bertambah: ${mat.name} (+${qtyActual} ${mat.unit})`,
        message: `Logistik (${actor.fullName}) mengonfirmasi penerimaan ${order.order_no} ke ${targetWh.name}. Stok di gudang ini kini ${stockAfter} ${mat.unit}.`,
        target_role: 'ALL',
        target_division_id: 'div-finance',
        project_id: order.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Konfirmasi Barang Masuk Gudang',
        `${order.order_no}: +${qtyActual} ${mat.unit} ${mat.name} ke ${targetWh.name} dari ${sourceName} (${stockBefore} -> ${stockAfter}).`,
        order.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, order: updatedOrder, transaction: tx });
  });

  // 6. Issue Outgoing Goods (Barang Keluar) — Logistik & Super Admin only
  // Prevents negative stock & duplicate deduction per MaterialRequest!
  app.post('/api/warehouse/issue', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mencatat Barang Keluar.',
      });
      return;
    }

    const body = req.body as {
      material_id?: string;
      warehouse_id?: string;
      project_id?: string;
      rab_item_id?: string;
      request_id?: string;
      qty?: number;
      date?: string;
      source_or_destination?: string;
      proof_ref?: string;
      notes?: string;
    };

    const materialId = String(body.material_id || '').trim();
    const projectId = String(body.project_id || '').trim();
    const rabItemId = body.rab_item_id ? String(body.rab_item_id).trim() || undefined : undefined;
    const requestId = body.request_id ? String(body.request_id).trim() || undefined : undefined;
    const qty = Number(body.qty ?? 0);
    const date = String(body.date || '').trim() || new Date().toISOString().slice(0, 10);
    const destination = String(body.source_or_destination || '').trim();
    const proofRef = String(body.proof_ref || '').trim();

    if (!materialId || !projectId || !proofRef) {
      res.status(400).json({ message: 'Barang, proyek tujuan, dan nomor bukti/surat jalan wajib diisi.' });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ message: 'Jumlah barang keluar harus lebih besar dari 0.' });
      return;
    }

    const db = ensureOperationalDb();
    const matIdx = db.materials.findIndex((m) => m.id === materialId);
    if (matIdx === -1) {
      res.status(404).json({ message: 'Master barang tidak ditemukan.' });
      return;
    }

    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(404).json({ message: 'Proyek tujuan tidak ditemukan.' });
      return;
    }

    if (requestId) {
      const reqMatch = db.materialRequests.find((r) => r.id === requestId);
      if (!reqMatch) {
        res.status(404).json({ message: 'Permintaan material terkait tidak ditemukan.' });
        return;
      }
      if (
        reqMatch.stock_deducted ||
        reqMatch.status === 'Diserahkan' ||
        reqMatch.status === 'Dikonfirmasi Penerima'
      ) {
        res.status(409).json({
          message: `Permintaan ${reqMatch.request_number} sudah diserahkan & stoknya telah dikurangi sebelumnya (pencegahan pengurangan ganda).`,
        });
        return;
      }
    }

    const mat = db.materials[matIdx];
    const targetWh = resolveWarehouseInDb(db, body.warehouse_id || mat.default_warehouse_id);
    const whAvail = getMatStockAtWarehouse(mat, targetWh.id);
    if (qty > whAvail) {
      res.status(400).json({
        message: `Stok ${mat.name} di ${targetWh.name} tidak mencukupi (tersedia ${whAvail} ${mat.unit}, diminta ${qty} ${mat.unit}). Pengeluaran stok ditolak untuk mencegah stok minus.`,
      });
      return;
    }

    const deltaRes = applyWarehouseStockDelta(mat, targetWh.id, -roundQty(qty));
    const stockBefore = deltaRes.whBefore;
    const stockAfter = deltaRes.whAfter;
    const now = new Date().toISOString();

    db.materials[matIdx] = {
      ...mat,
      warehouse_stocks: deltaRes.nextStocks,
      stock: deltaRes.totalAfter,
      updated_at: now,
      updated_by_name: actor.fullName,
    };

    const destLabel = destination || `${project.project_number} — ${project.name}`;
    const txId = `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
    const tx: MaterialTransaction = {
      id: txId,
      material_id: mat.id,
      project_id: project.id,
      warehouse_id: targetWh.id,
      warehouse_name: targetWh.name,
      request_id: requestId,
      rab_item_id: rabItemId,
      type: 'Keluar',
      qty: roundQty(qty),
      stock_before: stockBefore,
      stock_after: stockAfter,
      date,
      pic_name: actor.fullName,
      source_or_destination: `${targetWh.name} → ${destLabel}`,
      proof_ref: proofRef,
      reference_no: proofRef,
      notes: String(body.notes || '').trim() || `Pengeluaran barang dari ${targetWh.name} ke ${destLabel}.`,
    };
    db.materialTransactions = [tx, ...db.materialTransactions];

    // Mark linked MaterialRequest if provided
    if (requestId) {
      db.materialRequests = db.materialRequests.map((mr) =>
        mr.id === requestId
          ? {
              ...mr,
              status: 'Diserahkan',
              logistics_processor_id: actor.employeeId,
              stock_deducted: true,
              issued_tx_ids: [...(mr.issued_tx_ids || []), txId],
              items: mr.items.map((it) =>
                it.material_id === mat.id
                  ? { ...it, qty_delivered: roundQty(it.qty_delivered + qty) }
                  : it
              ),
              history: [
                ...mr.history,
                {
                  timestamp: now,
                  actor_name: actor.fullName,
                  action: 'Diserahkan',
                  note: `Barang keluar dari ${targetWh.name} dicatat (${qty} ${mat.unit}, ref: ${proofRef}).`,
                },
              ],
            }
          : mr
      );
    }

    // Sync project workflow material_needs issued count
    const wfIdx = db.workflows.findIndex((w) => w.project_id === project.id);
    if (wfIdx >= 0) {
      const wf = db.workflows[wfIdx];
      const hasNeed = wf.material_needs.some((n) => n.material_id === mat.id);
      if (hasNeed) {
        wf.material_needs = wf.material_needs.map((n) =>
          n.material_id === mat.id ? { ...n, qty_issued: roundQty(n.qty_issued + qty) } : n
        );
      }
      wf.material_needs = recomputeProcurementStatuses(wf, db.materials);
      db.workflows[wfIdx] = wf;
    }

    appendWarehouseAudit(db, actor, {
      action: 'BARANG_KELUAR',
      material_id: mat.id,
      material_name: `${mat.code} — ${mat.name}`,
      qty_delta: -roundQty(qty),
      stock_before: stockBefore,
      stock_after: stockAfter,
      ref_no: proofRef,
      detail: `Pengeluaran ${qty} ${mat.unit} dari ${targetWh.name} untuk ${destLabel} (Bukti: ${proofRef}). Stok gudang ini: ${stockBefore} -> ${stockAfter} ${mat.unit}.`,
    });

    if (deltaRes.totalAfter <= mat.min_stock) {
      db.notifications = [
        makeOperationalNotification({
          type: 'Stok Minimum',
          title: `Peringatan Stok Minimum: ${mat.name}`,
          message: `Total stok ${mat.name} tersisa ${deltaRes.totalAfter} ${mat.unit} (batas minimum ${mat.min_stock} ${mat.unit}). Segera lakukan pengadaan.`,
          target_role: 'ALL',
          target_division_id: 'div-logistik',
          project_id: project.id,
          link_module: 'gudang',
        }),
        ...db.notifications,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Barang Keluar Gudang',
        `Mengeluarkan ${qty} ${mat.unit} ${mat.name} dari ${targetWh.name} untuk ${project.project_number} (Bukti: ${proofRef}).`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, transaction: tx });
  });

  // 7. Create Material Request (Tim Lapangan / Teknik, Logistik, Super Admin)
  app.post('/api/warehouse/material-requests', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isFieldRequestActor(actor)) {
      res.status(403).json({
        message: 'Hanya Tim Lapangan / Teknik, Logistik, atau Super Admin yang dapat mengajukan permintaan material.',
      });
      return;
    }

    const body = req.body as {
      project_id?: string;
      rab_item_id?: string;
      needed_date?: string;
      notes?: string;
      items?: Array<{ material_id: string; qty_requested: number }>;
    };

    const projectId = String(body.project_id || '').trim();
    const rabItemId = body.rab_item_id ? String(body.rab_item_id).trim() || undefined : undefined;
    const neededDate = String(body.needed_date || '').trim();
    const notes = String(body.notes || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!projectId || !neededDate || items.length === 0) {
      res.status(400).json({ message: 'Proyek, tanggal dibutuhkan, dan minimal 1 item material wajib diisi.' });
      return;
    }

    const db = ensureOperationalDb();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(404).json({ message: 'Proyek tidak ditemukan.' });
      return;
    }

    const cleanItems = [];
    for (const it of items) {
      const mat = db.materials.find((m) => m.id === it.material_id);
      const q = Number(it.qty_requested ?? 0);
      if (!mat) {
        res.status(404).json({ message: `Material ${it.material_id} tidak ditemukan.` });
        return;
      }
      if (!Number.isFinite(q) || q <= 0) {
        res.status(400).json({ message: `Qty permintaan untuk ${mat.name} harus lebih dari 0.` });
        return;
      }
      cleanItems.push({
        material_id: mat.id,
        qty_requested: roundQty(q),
        qty_approved: 0,
        qty_delivered: 0,
      });
    }

    const now = new Date().toISOString();
    const seq = String(db.materialRequests.length + 15).padStart(3, '0');
    const reqNo = `SPM/2026/11/${seq}`;
    const newId = `mr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;

    const newReq: MaterialRequest = {
      id: newId,
      request_number: reqNo,
      project_id: project.id,
      rab_item_id: rabItemId,
      requested_by_id: actor.employeeId,
      request_date: now.slice(0, 10),
      needed_date: neededDate,
      status: 'Menunggu Head',
      notes: notes || `Permintaan material proyek ${project.project_number}.`,
      items: cleanItems,
      stock_deducted: false,
      history: [
        {
          timestamp: now,
          actor_name: actor.fullName,
          action: 'Membuat Permintaan',
          note: notes || 'Permintaan material diajukan dari lapangan.',
        },
      ],
    };

    db.materialRequests = [newReq, ...db.materialRequests];
    db.approvals = [
      {
        id: `apr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        entity_type: 'MaterialRequest',
        entity_id: newId,
        reference_no: reqNo,
        title: `Permintaan Material ${reqNo}`,
        division_id: actor.divisionId || 'div-teknik',
        requester_id: actor.employeeId,
        status: 'Menunggu',
        requested_at: now,
        notes: newReq.notes,
      },
      ...db.approvals,
    ];

    db.notifications = [
      makeOperationalNotification({
        type: 'Permintaan Baru',
        title: `Permintaan Material Baru ${reqNo}`,
        message: `${actor.fullName} mengajukan permintaan material untuk ${project.project_number}.`,
        target_role: 'HEAD',
        target_division_id: actor.divisionId || 'div-teknik',
        project_id: project.id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];

    appendWarehouseAudit(db, actor, {
      action: 'PERMINTAAN_MATERIAL_BARU',
      material_id: cleanItems[0]?.material_id,
      material_name: cleanItems
        .map((ci) => {
          const m = db.materials.find((x) => x.id === ci.material_id);
          return `${m?.name ?? ci.material_id} (${ci.qty_requested} ${m?.unit ?? ''})`;
        })
        .join(', '),
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: reqNo,
      detail: `Mengajukan ${reqNo} untuk proyek ${project.project_number}.`,
    });

    db.activityLogs = [
      makeOperationalLog(db, actor, 'Permintaan Material', `Mengajukan ${reqNo} (${project.project_number}).`, project.id),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, request: newReq });
  });

  // 8. Advance Material Request Workflow (Guards against unauthorized roles, negative stock & double deduction)
  app.post('/api/warehouse/material-requests/:id/advance', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }

    const body = req.body as { next_status?: MaterialRequestStatus; note?: string };
    const nextStatus = body.next_status;
    if (!nextStatus) {
      res.status(400).json({ message: 'Status tujuan wajib disertakan.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = db.materialRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Permintaan material tidak ditemukan.' });
      return;
    }

    const target = db.materialRequests[idx];
    const now = new Date().toISOString();
    const note = String(body.note || '').trim();

    if (nextStatus === 'Disetujui Head' || nextStatus === 'Ditolak Head') {
      const canHead =
        actor.roleCode === 'SUPER_ADMIN' ||
        (actor.roleCode === 'HEAD' &&
          (actor.divisionCode === 'TEKNIK' || actor.divisionCode === 'LOGISTIK'));
      if (!canHead) {
        res.status(403).json({
          message: 'Hanya Head Teknik, Head Logistik, atau Super Admin yang berwenang memutuskan permintaan material.',
        });
        return;
      }
      if (target.status !== 'Menunggu Head') {
        res.status(409).json({ message: `Permintaan ${target.request_number} sudah berstatus "${target.status}".` });
        return;
      }
    } else if (nextStatus === 'Diproses Logistik' || nextStatus === 'Diserahkan') {
      if (!isLogisticsActor(actor)) {
        res.status(403).json({
          message: 'Hanya Divisi Logistik atau Super Admin yang berwenang memproses & menyerahkan material gudang.',
        });
        return;
      }
      if (nextStatus === 'Diproses Logistik' && target.status !== 'Disetujui Head') {
        res.status(400).json({ message: 'Permintaan harus disetujui Head terlebih dahulu.' });
        return;
      }
      if (
        nextStatus === 'Diserahkan' &&
        target.status !== 'Disetujui Head' &&
        target.status !== 'Diproses Logistik'
      ) {
        res.status(409).json({
          message: `Permintaan ${target.request_number} sudah berstatus "${target.status}" atau tidak dapat diserahkan.`,
        });
        return;
      }
    } else if (nextStatus === 'Dikonfirmasi Penerima') {
      if (!isFieldRequestActor(actor)) {
        res.status(403).json({
          message: 'Hanya Tim Lapangan / Teknik, Logistik, atau Super Admin yang dapat mengonfirmasi penerimaan di lokasi.',
        });
        return;
      }
      if (target.status !== 'Diserahkan') {
        res.status(400).json({ message: 'Material harus berstatus Diserahkan sebelum dikonfirmasi penerima.' });
        return;
      }
    } else {
      res.status(400).json({ message: 'Status tujuan permintaan tidak valid.' });
      return;
    }

    const newTxs: MaterialTransaction[] = [];
    const newTxIds: string[] = [];

    if (nextStatus === 'Diserahkan') {
      if (target.stock_deducted) {
        res.status(409).json({
          message: `Stok untuk ${target.request_number} sudah pernah dikurangi sebelumnya (pencegahan pengurangan ganda).`,
        });
        return;
      }

      // Pre-validate sufficient stock for ALL items before mutating anything
      for (const item of target.items) {
        const mat = db.materials.find((m) => m.id === item.material_id);
        const qtyOut = item.qty_approved || item.qty_requested;
        if (!mat) {
          res.status(404).json({ message: `Material ${item.material_id} tidak ditemukan.` });
          return;
        }
        if (qtyOut > mat.stock) {
          res.status(400).json({
            message: `Stok ${mat.name} tidak mencukupi untuk penyerahan (tersedia ${mat.stock} ${mat.unit}, diminta ${qtyOut} ${mat.unit}).`,
          });
          return;
        }
      }

      const prj = db.projects.find((p) => p.id === target.project_id);
      const destLabel = prj ? `${prj.project_number} — ${prj.name}` : target.project_id;

      for (const item of target.items) {
        const matIdx = db.materials.findIndex((m) => m.id === item.material_id);
        const mat = db.materials[matIdx];
        const qtyOut = roundQty(item.qty_approved || item.qty_requested);
        // Deduct from default warehouse (or first warehouse holding sufficient stock)
        let targetWh = resolveWarehouseInDb(db, mat.default_warehouse_id);
        if (getMatStockAtWarehouse(mat, targetWh.id) < qtyOut && mat.warehouse_stocks) {
          const altId = Object.keys(mat.warehouse_stocks).find(
            (k) => (mat.warehouse_stocks?.[k] ?? 0) >= qtyOut
          );
          if (altId) targetWh = resolveWarehouseInDb(db, altId);
        }
        const deltaRes = applyWarehouseStockDelta(mat, targetWh.id, -qtyOut);
        const stockBefore = deltaRes.whBefore;
        const stockAfter = deltaRes.whAfter;

        db.materials[matIdx] = {
          ...mat,
          warehouse_stocks: deltaRes.nextStocks,
          stock: deltaRes.totalAfter,
          updated_at: now,
          updated_by_name: actor.fullName,
        };

        const txId = `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
        newTxIds.push(txId);
        newTxs.push({
          id: txId,
          material_id: mat.id,
          project_id: target.project_id,
          warehouse_id: targetWh.id,
          warehouse_name: targetWh.name,
          request_id: target.id,
          rab_item_id: target.rab_item_id,
          type: 'Keluar',
          qty: qtyOut,
          stock_before: stockBefore,
          stock_after: stockAfter,
          date: now.slice(0, 10),
          pic_name: actor.fullName,
          source_or_destination: `${targetWh.name} → ${destLabel}`,
          proof_ref: target.request_number,
          reference_no: target.request_number,
          notes: note || `Penyerahan material dari ${targetWh.name} untuk ${target.request_number}.`,
        });

        appendWarehouseAudit(db, actor, {
          action: 'SERAH_TERIMA_PERMINTAAN_KELUAR',
          material_id: mat.id,
          material_name: `${mat.code} — ${mat.name}`,
          qty_delta: -qtyOut,
          stock_before: stockBefore,
          stock_after: stockAfter,
          ref_no: target.request_number,
          detail: `Penyerahan ${qtyOut} ${mat.unit} dari ${targetWh.name} ke ${destLabel}. Stok: ${stockBefore} -> ${stockAfter} ${mat.unit}.`,
        });

        if (deltaRes.totalAfter <= mat.min_stock) {
          db.notifications = [
            makeOperationalNotification({
              type: 'Stok Minimum',
              title: `Stok Minimum: ${mat.name}`,
              message: `Sisa total stok ${deltaRes.totalAfter} ${mat.unit} (batas minimum ${mat.min_stock} ${mat.unit}).`,
              target_role: 'ALL',
              target_division_id: 'div-logistik',
              project_id: target.project_id,
              link_module: 'gudang',
            }),
            ...db.notifications,
          ];
        }
      }

      db.materialTransactions = [...newTxs, ...db.materialTransactions];
    }

    const updatedItems = target.items.map((it) => {
      if (nextStatus === 'Disetujui Head') {
        return { ...it, qty_approved: it.qty_requested };
      }
      if (nextStatus === 'Diserahkan' || nextStatus === 'Dikonfirmasi Penerima') {
        return { ...it, qty_delivered: it.qty_approved || it.qty_requested };
      }
      return it;
    });

    const updatedReq: MaterialRequest = {
      ...target,
      status: nextStatus,
      head_reviewer_id:
        nextStatus === 'Disetujui Head' || nextStatus === 'Ditolak Head'
          ? actor.employeeId
          : target.head_reviewer_id,
      logistics_processor_id:
        nextStatus === 'Diproses Logistik' || nextStatus === 'Diserahkan'
          ? actor.employeeId
          : target.logistics_processor_id,
      recipient_id: nextStatus === 'Dikonfirmasi Penerima' ? actor.employeeId : target.recipient_id,
      stock_deducted: target.stock_deducted || nextStatus === 'Diserahkan',
      issued_tx_ids: [...(target.issued_tx_ids || []), ...newTxIds],
      items: updatedItems,
      history: [
        ...target.history,
        {
          timestamp: now,
          actor_name: actor.fullName,
          action: nextStatus,
          note: note || `Status diperbarui ke ${nextStatus}.`,
        },
      ],
    };

    db.materialRequests[idx] = updatedReq;
    db.approvals = db.approvals.map((a) => {
      if (a.entity_type === 'MaterialRequest' && a.entity_id === target.id) {
        if (nextStatus === 'Disetujui Head' || nextStatus === 'Ditolak Head') {
          return {
            ...a,
            status: nextStatus === 'Disetujui Head' ? 'Disetujui' : 'Ditolak',
            approver_id: actor.employeeId,
            decided_at: now,
            notes: note || a.notes,
          };
        }
      }
      return a;
    });

    if (nextStatus === 'Disetujui Head') {
      db.notifications = [
        makeOperationalNotification({
          type: 'Permintaan Disetujui',
          title: `${target.request_number} Disetujui Head`,
          message: 'Permintaan material siap diproses oleh Divisi Logistik di Gudang & Persediaan.',
          target_role: 'ALL',
          target_division_id: 'div-logistik',
          project_id: target.project_id,
          link_module: 'gudang',
        }),
        ...db.notifications,
      ];
    } else if (nextStatus === 'Ditolak Head') {
      db.notifications = [
        makeOperationalNotification({
          type: 'Permintaan Ditolak',
          title: `${target.request_number} Ditolak`,
          message: note || 'Permintaan material ditolak oleh Head.',
          target_role: 'ALL',
          project_id: target.project_id,
          link_module: 'gudang',
        }),
        ...db.notifications,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Alur Permintaan Material',
        `${target.request_number} berubah status menjadi "${nextStatus}".`,
        target.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, request: updatedReq });
  });

  // 9. Stock Opname Reconciliation (Logistik & Super Admin only)
  app.post('/api/warehouse/opname', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang melakukan Stok Opname.',
      });
      return;
    }

    const body = req.body as {
      material_id?: string;
      warehouse_id?: string;
      opname_date?: string;
      physical_qty?: number;
      condition_note?: string;
      reason?: string;
      proof_ref?: string;
      proof_attachment_ids?: string[];
    };

    const materialId = String(body.material_id || '').trim();
    const opnameDate = String(body.opname_date || '').trim() || new Date().toISOString().slice(0, 10);
    const physicalQty = Number(body.physical_qty);
    const conditionNote = String(body.condition_note || '').trim() || 'Sesuai pemeriksaan fisik gudang';
    const reason = String(body.reason || '').trim();
    const proofRef = String(body.proof_ref || '').trim();

    if (!materialId || !reason) {
      res.status(400).json({ message: 'Barang dan alasan/keterangan hasil opname wajib diisi.' });
      return;
    }
    if (!Number.isFinite(physicalQty) || physicalQty < 0) {
      res.status(400).json({ message: 'Stok fisik hasil opname tidak boleh bernilai negatif.' });
      return;
    }

    const db = ensureOperationalDb();
    const matIdx = db.materials.findIndex((m) => m.id === materialId);
    if (matIdx === -1) {
      res.status(404).json({ message: 'Data barang tidak ditemukan.' });
      return;
    }

    const mat = db.materials[matIdx];
    const targetWh = resolveWarehouseInDb(db, body.warehouse_id || mat.default_warehouse_id);
    const systemQty = getMatStockAtWarehouse(mat, targetWh.id);
    const cleanPhysical = roundQty(physicalQty);
    const variance = roundQty(cleanPhysical - systemQty);
    const now = new Date().toISOString();
    const opnameNo = `OPN-${opnameDate.slice(0, 7).replace('-', '')}-${String((db.stockOpnames || []).length + 1).padStart(3, '0')}`;

    const nextStocks = {
      ...(mat.warehouse_stocks && Object.keys(mat.warehouse_stocks).length > 0
        ? mat.warehouse_stocks
        : { [mat.default_warehouse_id || 'wh-depok']: mat.stock }),
      [targetWh.id]: cleanPhysical,
    };
    const totalAfter = sumWarehouseStocksMap(nextStocks);

    db.materials[matIdx] = {
      ...mat,
      warehouse_stocks: nextStocks,
      stock: totalAfter,
      updated_at: now,
      updated_by_name: actor.fullName,
    };

    const record: StockOpnameRecord = {
      id: `opn-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      opname_no: opnameNo,
      opname_date: opnameDate,
      material_id: mat.id,
      warehouse_id: targetWh.id,
      warehouse_name: targetWh.name,
      system_qty: systemQty,
      physical_qty: cleanPhysical,
      variance_qty: variance,
      unit: mat.unit,
      condition_note: conditionNote,
      reason,
      officer_id: actor.employeeId,
      officer_name: actor.fullName,
      proof_ref: proofRef || opnameNo,
      proof_attachment_ids: Array.isArray(body.proof_attachment_ids) ? body.proof_attachment_ids : [],
      applied: true,
      created_at: now,
    };

    db.stockOpnames = [record, ...(db.stockOpnames || [])];
    db.materialTransactions = [
      {
        id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        material_id: mat.id,
        project_id: '',
        warehouse_id: targetWh.id,
        warehouse_name: targetWh.name,
        opname_id: record.id,
        type: 'Penyesuaian Opname',
        qty: Math.abs(variance),
        stock_before: systemQty,
        stock_after: cleanPhysical,
        date: opnameDate,
        pic_name: actor.fullName,
        source_or_destination: targetWh.name,
        proof_ref: proofRef || opnameNo,
        reference_no: opnameNo,
        notes: `Stok Opname di ${targetWh.name} (${variance >= 0 ? `+${variance}` : variance} ${mat.unit}): ${reason}. Kondisi: ${conditionNote}.`,
      },
      ...db.materialTransactions,
    ];

    appendWarehouseAudit(db, actor, {
      action: 'STOK_OPNAME',
      material_id: mat.id,
      material_name: `${mat.code} — ${mat.name}`,
      qty_delta: variance,
      stock_before: systemQty,
      stock_after: cleanPhysical,
      ref_no: opnameNo,
      detail: `Stok opname di ${targetWh.name}: fisik ${cleanPhysical} ${mat.unit} vs sistem ${systemQty} ${mat.unit} (selisih ${variance >= 0 ? `+${variance}` : variance}). ${reason}`,
    });

    if (totalAfter <= mat.min_stock) {
      db.notifications = [
        makeOperationalNotification({
          type: 'Stok Minimum',
          title: `Stok Minimum Pasca Opname: ${mat.name}`,
          message: `Hasil opname ${mat.name} di ${targetWh.name}: ${cleanPhysical} ${mat.unit} (total ${totalAfter} ${mat.unit}, batas minimum ${mat.min_stock} ${mat.unit}).`,
          target_role: 'ALL',
          target_division_id: 'div-logistik',
          link_module: 'gudang',
        }),
        ...db.notifications,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Stok Opname Gudang',
        `${opnameNo} (${targetWh.name}): ${mat.name} disesuaikan ${systemQty} -> ${cleanPhysical} ${mat.unit}.`
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, opname: record });
  });

  // 10. Surat Jalan Digital (Delivery Notes) Endpoints
  const isValidPngDataUrl = (val: unknown): val is string => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return (
      trimmed.startsWith('data:image/png;base64,') &&
      trimmed.length > 64 &&
      trimmed.length <= 800_000
    );
  };

  const getEmployeePosition = (db: PMSState, actor: ActorContext): string => {
    const emp = db.employees.find((e) => e.id === actor.employeeId);
    if (emp?.position) return emp.position;
    return `${actor.roleCode} · ${actor.divisionCode}`;
  };

  const generateUniqueSjNumber = (db: PMSState, dateStr: string): string => {
    const ym = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 7).replace('-', '');
    const prefix = `SJ/WAS/${ym}/`;
    const existing = new Set((db.deliveryNotes || []).map((d) => d.sj_number.toUpperCase()));
    let seq = (db.deliveryNotes || []).length + 1;
    let candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    while (existing.has(candidate.toUpperCase())) {
      seq += 1;
      candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    }
    return candidate;
  };

  const buildDnHistory = (
    actor: ActorContext,
    action: string,
    fromStatus: DeliveryNoteStatus | null,
    toStatus: DeliveryNoteStatus,
    note: string
  ): DeliveryNoteHistoryEntry => ({
    id: `sjh-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
    timestamp: new Date().toISOString(),
    action,
    from_status: fromStatus,
    to_status: toStatus,
    actor_id: actor.employeeId,
    actor_name: actor.fullName,
    actor_role: actor.roleCode,
    actor_division: actor.divisionCode,
    note,
  });

  app.get('/api/warehouse/delivery-notes', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    res.json({ deliveryNotes: (db.deliveryNotes || []).filter((d) => !d.is_deleted) });
  });

  // Create Surat Jalan Digital (Draft) — Logistik & Super Admin only (stock NOT reduced yet)
  app.post('/api/warehouse/delivery-notes', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang membuat Surat Jalan.',
      });
      return;
    }

    const body = req.body as {
      delivery_date?: string;
      project_id?: string;
      source_warehouse_id?: string;
      destination_location?: string;
      sender_name?: string;
      sender_position?: string;
      recipient_id?: string;
      recipient_name?: string;
      recipient_position?: string;
      vehicle_info?: string;
      driver_name?: string;
      driver_phone?: string;
      request_id?: string;
      supplier_sj_no?: string;
      notes?: string;
      items?: Array<{ material_id?: string; qty_sent?: number; rab_item_id?: string; notes?: string }>;
    };

    const projectId = String(body.project_id || '').trim();
    const deliveryDate = String(body.delivery_date || '').trim() || new Date().toISOString().slice(0, 10);
    const destLocation = String(body.destination_location || '').trim();
    const recipientName = String(body.recipient_name || '').trim();
    const recipientPosition = String(body.recipient_position || '').trim() || 'Tim Lapangan';
    const vehicleInfo = String(body.vehicle_info || '').trim();
    const driverName = String(body.driver_name || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!projectId || !destLocation || !recipientName || !vehicleInfo || !driverName) {
      res.status(400).json({
        message: 'Proyek tujuan, lokasi pengiriman, penerima, kendaraan, dan pengemudi wajib diisi.',
      });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ message: 'Pilih minimal 1 barang dari Data Barang Gudang.' });
      return;
    }

    const db = ensureOperationalDb();
    const sourceWh = resolveWarehouseInDb(db, body.source_warehouse_id);
    if (!sourceWh.is_active) {
      res.status(400).json({ message: `Gudang asal "${sourceWh.name}" sedang nonaktif.` });
      return;
    }

    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(404).json({ message: 'Proyek tujuan tidak ditemukan.' });
      return;
    }

    // Aggregate requested quantities per material to ensure total never exceeds stock at selected source warehouse
    const qtyByMaterial = new Map<string, number>();
    const cleanItems: DeliveryNoteItem[] = [];
    for (const raw of rawItems) {
      const matId = String(raw.material_id || '').trim();
      const qtySent = Number(raw.qty_sent ?? 0);
      if (!matId || !Number.isFinite(qtySent) || qtySent <= 0) {
        res.status(400).json({ message: 'Setiap barang wajib dipilih dengan jumlah pengiriman > 0.' });
        return;
      }
      const mat = db.materials.find((m) => m.id === matId);
      if (!mat) {
        res.status(404).json({ message: 'Salah satu barang tidak ditemukan di Data Barang Gudang.' });
        return;
      }
      const whAvail = getMatStockAtWarehouse(mat, sourceWh.id);
      const acc = roundQty((qtyByMaterial.get(matId) || 0) + qtySent);
      if (acc > whAvail) {
        res.status(400).json({
          message: `Jumlah pengiriman ${mat.name} (${acc} ${mat.unit}) melebihi stok tersedia di ${sourceWh.name} (${whAvail} ${mat.unit}).`,
        });
        return;
      }
      qtyByMaterial.set(matId, acc);
      cleanItems.push({
        id: `sji-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        material_id: mat.id,
        material_code: mat.code,
        material_name: mat.name,
        unit: mat.unit,
        qty_sent: roundQty(qtySent),
        qty_received: 0,
        condition_status: 'Belum Diperiksa',
        rab_item_id: raw.rab_item_id ? String(raw.rab_item_id).trim() || undefined : undefined,
        notes: raw.notes ? String(raw.notes).trim() : undefined,
      });
    }

    const now = new Date().toISOString();
    const sjNumber = generateUniqueSjNumber(db, deliveryDate);
    const dn: DeliveryNote = {
      id: `sj-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      sj_number: sjNumber,
      revision_no: 0,
      delivery_date: deliveryDate,
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      source_warehouse_id: sourceWh.id,
      source_warehouse_name: sourceWh.name,
      destination_location: destLocation,
      sender_id: actor.employeeId,
      sender_name: String(body.sender_name || '').trim() || actor.fullName,
      sender_position: String(body.sender_position || '').trim() || getEmployeePosition(db, actor),
      recipient_id: body.recipient_id ? String(body.recipient_id).trim() || undefined : undefined,
      recipient_name: recipientName,
      recipient_position: recipientPosition,
      vehicle_info: vehicleInfo,
      driver_name: driverName,
      driver_phone: body.driver_phone ? String(body.driver_phone).trim() || undefined : undefined,
      request_id: body.request_id ? String(body.request_id).trim() || undefined : undefined,
      supplier_sj_no: body.supplier_sj_no ? String(body.supplier_sj_no).trim() || undefined : undefined,
      notes: String(body.notes || '').trim(),
      status: 'Draft',
      items: cleanItems,
      stock_deducted: false,
      stock_restored: false,
      issued_tx_ids: [],
      is_locked: false,
      history: [
        buildDnHistory(
          actor,
          'Buat Draft Surat Jalan',
          null,
          'Draft',
          `Surat Jalan ${sjNumber} dibuat dari ${sourceWh.name} tujuan ${project.project_number} (${cleanItems.length} item). Stok belum dikurangi.`
        ),
      ],
      created_at: now,
      updated_at: now,
    };

    db.deliveryNotes = [dn, ...(db.deliveryNotes || [])];
    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_DIBUAT',
      material_name: `${cleanItems.length} Item Surat Jalan`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: sjNumber,
      detail: `Membuat Draft Surat Jalan ${sjNumber} dari ${sourceWh.name} tujuan ${project.project_number} (${cleanItems.map((i) => `${i.material_name} ${i.qty_sent} ${i.unit}`).join(', ')}).`,
    });
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Surat Jalan Digital',
        `Membuat draft Surat Jalan ${sjNumber} dari ${sourceWh.name} untuk ${project.project_number}.`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, deliveryNote: dn });
  });

  // Update Draft Surat Jalan — Logistik & Super Admin only, blocked once published or locked
  app.put('/api/warehouse/delivery-notes/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mengubah Surat Jalan.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }

    const existing = db.deliveryNotes![idx];
    if (existing.is_locked || existing.status !== 'Draft') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} berstatus "${existing.status}" dan terkunci dari pengeditan langsung. Gunakan proses Pembatalan atau Revisi jika perlu koreksi.`,
      });
      return;
    }

    const body = req.body as {
      delivery_date?: string;
      project_id?: string;
      source_warehouse_id?: string;
      destination_location?: string;
      sender_name?: string;
      sender_position?: string;
      recipient_id?: string;
      recipient_name?: string;
      recipient_position?: string;
      vehicle_info?: string;
      driver_name?: string;
      driver_phone?: string;
      request_id?: string;
      supplier_sj_no?: string;
      notes?: string;
      items?: Array<{ material_id?: string; qty_sent?: number; rab_item_id?: string; notes?: string }>;
    };

    const sourceWh = resolveWarehouseInDb(db, body.source_warehouse_id || existing.source_warehouse_id);
    if (!sourceWh.is_active) {
      res.status(400).json({ message: `Gudang asal "${sourceWh.name}" sedang nonaktif.` });
      return;
    }

    const projectId = String(body.project_id || existing.project_id).trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(404).json({ message: 'Proyek tujuan tidak ditemukan.' });
      return;
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ message: 'Pilih minimal 1 barang dari Data Barang Gudang.' });
      return;
    }

    const qtyByMaterial = new Map<string, number>();
    const cleanItems: DeliveryNoteItem[] = [];
    for (const raw of rawItems) {
      const matId = String(raw.material_id || '').trim();
      const qtySent = Number(raw.qty_sent ?? 0);
      if (!matId || !Number.isFinite(qtySent) || qtySent <= 0) {
        res.status(400).json({ message: 'Jumlah setiap barang harus lebih besar dari 0.' });
        return;
      }
      const mat = db.materials.find((m) => m.id === matId);
      if (!mat) {
        res.status(404).json({ message: 'Salah satu barang tidak ditemukan di Data Barang Gudang.' });
        return;
      }
      const whAvail = getMatStockAtWarehouse(mat, sourceWh.id);
      const acc = roundQty((qtyByMaterial.get(matId) || 0) + qtySent);
      if (acc > whAvail) {
        res.status(400).json({
          message: `Jumlah pengiriman ${mat.name} (${acc} ${mat.unit}) melebihi stok tersedia di ${sourceWh.name} (${whAvail} ${mat.unit}).`,
        });
        return;
      }
      qtyByMaterial.set(matId, acc);
      cleanItems.push({
        id: `sji-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        material_id: mat.id,
        material_code: mat.code,
        material_name: mat.name,
        unit: mat.unit,
        qty_sent: roundQty(qtySent),
        qty_received: 0,
        condition_status: 'Belum Diperiksa',
        rab_item_id: raw.rab_item_id ? String(raw.rab_item_id).trim() || undefined : undefined,
        notes: raw.notes ? String(raw.notes).trim() : undefined,
      });
    }

    const now = new Date().toISOString();
    const updated: DeliveryNote = {
      ...existing,
      delivery_date: String(body.delivery_date || existing.delivery_date).trim(),
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      source_warehouse_id: sourceWh.id,
      source_warehouse_name: sourceWh.name,
      destination_location: String(body.destination_location || existing.destination_location).trim(),
      sender_name: String(body.sender_name || existing.sender_name).trim(),
      sender_position: String(body.sender_position || existing.sender_position).trim(),
      recipient_id: body.recipient_id !== undefined ? String(body.recipient_id || '').trim() || undefined : existing.recipient_id,
      recipient_name: String(body.recipient_name || existing.recipient_name).trim(),
      recipient_position: String(body.recipient_position || existing.recipient_position).trim(),
      vehicle_info: String(body.vehicle_info || existing.vehicle_info).trim(),
      driver_name: String(body.driver_name || existing.driver_name).trim(),
      driver_phone: body.driver_phone !== undefined ? String(body.driver_phone || '').trim() || undefined : existing.driver_phone,
      request_id: body.request_id !== undefined ? String(body.request_id || '').trim() || undefined : existing.request_id,
      supplier_sj_no: body.supplier_sj_no !== undefined ? String(body.supplier_sj_no || '').trim() || undefined : existing.supplier_sj_no,
      notes: String(body.notes ?? existing.notes).trim(),
      items: cleanItems,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Perbarui Draft',
          existing.status,
          'Draft',
          `Draft Surat Jalan ${existing.sj_number} diperbarui dari ${sourceWh.name} (${cleanItems.length} item).`
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Prepare Goods -> Menunggu Pengiriman (Logistik & Super Admin only)
  app.post('/api/warehouse/delivery-notes/:id/prepare', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({ message: 'Hanya Divisi Logistik yang dapat menyiapkan barang Surat Jalan.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.is_locked || existing.status !== 'Draft') {
      res.status(409).json({
        message: `Hanya Surat Jalan berstatus Draft yang dapat disiapkan (status saat ini: ${existing.status}).`,
      });
      return;
    }

    // Validate stock availability before staging
    const needed = new Map<string, number>();
    for (const item of existing.items) {
      needed.set(item.material_id, roundQty((needed.get(item.material_id) || 0) + item.qty_sent));
    }
    for (const [matId, qty] of needed.entries()) {
      const mat = db.materials.find((m) => m.id === matId);
      if (!mat || qty > mat.stock) {
        res.status(400).json({
          message: `Stok ${mat?.name || 'barang'} tidak mencukupi untuk persiapan pengiriman (tersedia ${mat?.stock ?? 0}, butuh ${qty}).`,
        });
        return;
      }
    }

    const note = String((req.body as { note?: string })?.note || '').trim();
    const now = new Date().toISOString();
    const updated: DeliveryNote = {
      ...existing,
      status: 'Menunggu Pengiriman',
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Barang Disiapkan',
          'Draft',
          'Menunggu Pengiriman',
          note || 'Barang disiapkan di area loading gudang, siap ditandatangani & dikirim.'
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_DISIAPKAN',
      material_name: `${existing.items.length} Item`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: existing.sj_number,
      detail: `Barang untuk Surat Jalan ${existing.sj_number} telah disiapkan (Menunggu Pengiriman).`,
    });

    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Dispatch & Sender Digital Signature -> Atomically Deducts Stock & moves to 'Dalam Pengiriman'
  app.post('/api/warehouse/delivery-notes/:id/dispatch', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang mengeluarkan barang & menandatangani sebagai Pengirim.',
      });
      return;
    }

    const body = req.body as {
      signature_data_url?: string;
      sender_position?: string;
      note?: string;
    };
    if (!isValidPngDataUrl(body.signature_data_url)) {
      res.status(400).json({ message: 'Tanda tangan digital Pengirim (Logistik) wajib diisi dengan valid.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.is_locked || existing.status === 'Selesai' || existing.status === 'Dibatalkan') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} sudah terkunci (${existing.status}).`,
      });
      return;
    }
    if (existing.stock_deducted) {
      res.status(409).json({
        message: `Stok untuk Surat Jalan ${existing.sj_number} sudah dikeluarkan sebelumnya (pencegahan pengurangan stok ganda).`,
      });
      return;
    }
    if (existing.status !== 'Draft' && existing.status !== 'Menunggu Pengiriman') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} sudah berstatus "${existing.status}".`,
      });
      return;
    }

    // Validate aggregate stock availability at source warehouse BEFORE mutating anything
    const sourceWh = resolveWarehouseInDb(db, existing.source_warehouse_id || existing.source_warehouse_name);
    const aggregateQty = new Map<string, number>();
    for (const item of existing.items) {
      aggregateQty.set(item.material_id, roundQty((aggregateQty.get(item.material_id) || 0) + item.qty_sent));
    }
    for (const [matId, qty] of aggregateQty.entries()) {
      const mat = db.materials.find((m) => m.id === matId);
      if (!mat) {
        res.status(404).json({ message: 'Data barang pada Surat Jalan tidak ditemukan di master gudang.' });
        return;
      }
      const whAvail = getMatStockAtWarehouse(mat, sourceWh.id);
      if (qty > whAvail) {
        res.status(400).json({
          message: `Stok ${mat.name} di ${sourceWh.name} tidak mencukupi (tersedia ${whAvail} ${mat.unit}, dibutuhkan ${qty} ${mat.unit}). Pengiriman dibatalkan untuk mencegah stok minus.`,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const txDate = existing.delivery_date || now.slice(0, 10);
    const createdTxIds: string[] = [];
    const wfIdx = db.workflows.findIndex((w) => w.project_id === existing.project_id);

    for (const item of existing.items) {
      const matIdx = db.materials.findIndex((m) => m.id === item.material_id);
      const mat = db.materials[matIdx];
      const deltaRes = applyWarehouseStockDelta(mat, sourceWh.id, -item.qty_sent);
      const stockBefore = deltaRes.whBefore;
      const stockAfter = deltaRes.whAfter;

      db.materials[matIdx] = {
        ...mat,
        warehouse_stocks: deltaRes.nextStocks,
        stock: deltaRes.totalAfter,
        updated_at: now,
        updated_by_name: actor.fullName,
      };

      const txId = `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
      createdTxIds.push(txId);
      db.materialTransactions = [
        {
          id: txId,
          material_id: mat.id,
          project_id: existing.project_id,
          warehouse_id: sourceWh.id,
          warehouse_name: sourceWh.name,
          request_id: existing.request_id,
          delivery_note_id: existing.id,
          rab_item_id: item.rab_item_id,
          type: 'Keluar',
          qty: item.qty_sent,
          stock_before: stockBefore,
          stock_after: stockAfter,
          date: txDate,
          pic_name: actor.fullName,
          source_or_destination: `${sourceWh.name} → ${existing.project_number} — ${existing.destination_location}`,
          proof_ref: existing.sj_number,
          reference_no: existing.sj_number,
          notes: `Pengeluaran dari ${sourceWh.name} via Surat Jalan ${existing.sj_number} (Pengemudi: ${existing.driver_name}, Kendaraan: ${existing.vehicle_info}).`,
        },
        ...db.materialTransactions,
      ];

      if (wfIdx >= 0) {
        const wf = db.workflows[wfIdx];
        wf.material_needs = wf.material_needs.map((n) =>
          n.material_id === mat.id ? { ...n, qty_issued: roundQty(n.qty_issued + item.qty_sent) } : n
        );
        db.workflows[wfIdx] = wf;
      }

      appendWarehouseAudit(db, actor, {
        action: 'SURAT_JALAN_BARANG_KELUAR',
        material_id: mat.id,
        material_name: `${mat.code} — ${mat.name}`,
        qty_delta: -item.qty_sent,
        stock_before: stockBefore,
        stock_after: stockAfter,
        ref_no: existing.sj_number,
        detail: `Pengeluaran ${item.qty_sent} ${mat.unit} dari ${sourceWh.name} via Surat Jalan ${existing.sj_number} ke ${existing.project_number}.`,
      });

      if (deltaRes.totalAfter <= mat.min_stock) {
        db.notifications = [
          makeOperationalNotification({
            type: 'Stok Minimum',
            title: `Peringatan Stok Minimum: ${mat.name}`,
            message: `Setelah pengiriman ${existing.sj_number}, total stok ${mat.name} tersisa ${deltaRes.totalAfter} ${mat.unit} (min. ${mat.min_stock} ${mat.unit}).`,
            target_role: 'ALL',
            target_division_id: 'div-logistik',
            project_id: existing.project_id,
            link_module: 'gudang',
          }),
          ...db.notifications,
        ];
      }
    }

    if (wfIdx >= 0) {
      db.workflows[wfIdx].material_needs = recomputeProcurementStatuses(
        db.workflows[wfIdx],
        db.materials
      );
    }

    const senderPos = String(body.sender_position || existing.sender_position || '').trim() || getEmployeePosition(db, actor);
    const sigHash = crypto
      .createHash('sha256')
      .update(`${existing.id}|SENDER|${actor.employeeId}|${now}|${body.signature_data_url.slice(0, 128)}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const updated: DeliveryNote = {
      ...existing,
      sender_id: actor.employeeId,
      sender_name: actor.fullName,
      sender_position: senderPos,
      sender_signature: {
        signer_id: actor.employeeId,
        signer_name: actor.fullName,
        signer_position: senderPos,
        signer_role: actor.roleCode,
        signer_division: actor.divisionCode,
        signed_at: now,
        signature_data_url: body.signature_data_url,
        signature_hash: sigHash,
      },
      status: 'Dalam Pengiriman',
      stock_deducted: true,
      issued_tx_ids: createdTxIds,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Pengirim Menandatangani & Barang Dikirim',
          existing.status,
          'Dalam Pengiriman',
          String(body.note || '').trim() ||
            `Barang dikeluarkan dari gudang & ditandatangani oleh ${actor.fullName}. Stok gudang otomatis berkurang.`
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    db.notifications = [
      makeOperationalNotification({
        type: 'Pengadaan Material',
        title: `Barang Dalam Pengiriman — ${existing.sj_number}`,
        message: `${existing.items.length} item material dikirim ke ${existing.project_number} (${existing.driver_name} · ${existing.vehicle_info}). Mohon Tim Lapangan periksa & tanda tangani saat tiba.`,
        target_role: 'ALL',
        target_division_id: 'div-teknik',
        project_id: existing.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pengiriman Surat Jalan',
        `Mengeluarkan barang & menandatangani Surat Jalan ${existing.sj_number} (${existing.project_number}).`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Mark Arrived at Site -> Menunggu Konfirmasi Penerimaan (Logistik or Tim Lapangan / Super Admin)
  app.post('/api/warehouse/delivery-notes/:id/arrive', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor) && !isFieldRequestActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Tim Lapangan yang dapat memperbarui status kedatangan barang.',
      });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.is_locked || existing.status !== 'Dalam Pengiriman') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} tidak sedang Dalam Pengiriman (status: ${existing.status}).`,
      });
      return;
    }

    const note = String((req.body as { note?: string })?.note || '').trim();
    const now = new Date().toISOString();
    const updated: DeliveryNote = {
      ...existing,
      status: 'Menunggu Konfirmasi Penerimaan',
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Tiba di Lokasi Proyek',
          'Dalam Pengiriman',
          'Menunggu Konfirmasi Penerimaan',
          note || `Armada ${existing.vehicle_info} tiba di ${existing.destination_location}. Menunggu pemeriksaan fisik & tanda tangan Tim Lapangan.`
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    db.notifications = [
      makeOperationalNotification({
        type: 'Pengadaan Material',
        title: `Menunggu Konfirmasi Penerimaan — ${existing.sj_number}`,
        message: `Pengiriman ${existing.sj_number} tiba di ${existing.project_number}. Silakan lakukan pemeriksaan barang dan tanda tangan Penerima.`,
        target_role: 'ALL',
        target_division_id: 'div-teknik',
        project_id: existing.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];

    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Field Team (TEKNIK) Inspects Items & Signs as Recipient -> Selesai & Locked!
  app.post('/api/warehouse/delivery-notes/:id/confirm-receive', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const truth = resolveActorDbTruth(ensureOperationalDb(), actor);
    const allowedReceiver = Boolean(
      truth && (truth.role === 'SUPER_ADMIN' || truth.division === 'TEKNIK')
    );
    if (!allowedReceiver) {
      res.status(403).json({
        message: 'Hanya Tim Lapangan (Divisi Teknik) atau Super Admin yang berwenang memeriksa & menandatangani penerimaan Surat Jalan.',
      });
      return;
    }

    const body = req.body as {
      signature_data_url?: string;
      recipient_position?: string;
      note?: string;
      items?: Array<{
        id?: string;
        qty_received?: number;
        condition_status?: DeliveryItemCondition;
        notes?: string;
      }>;
    };

    if (!isValidPngDataUrl(body.signature_data_url)) {
      res.status(400).json({ message: 'Tanda tangan digital Penerima (Tim Lapangan) wajib diisi.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.is_locked || existing.status === 'Selesai' || existing.status === 'Dibatalkan') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} sudah terkunci (${existing.status}).`,
      });
      return;
    }
    if (
      existing.status !== 'Dalam Pengiriman' &&
      existing.status !== 'Menunggu Konfirmasi Penerimaan'
    ) {
      res.status(400).json({
        message: `Barang belum dikirim atau belum ditandatangani Pengirim Logistik (status saat ini: ${existing.status}).`,
      });
      return;
    }
    if (!existing.sender_signature) {
      res.status(400).json({ message: 'Tanda tangan Pengirim (Logistik) wajib ada sebelum Penerima menandatangani.' });
      return;
    }

    const incomingItems = Array.isArray(body.items) ? body.items : [];
    const allowedConditions = new Set<DeliveryItemCondition>(['Baik', 'Kurang', 'Rusak Sebagian']);
    const updatedItems: DeliveryNoteItem[] = [];

    for (const origItem of existing.items) {
      const match = incomingItems.find((i) => i.id === origItem.id);
      const qtyReceived = Number(match?.qty_received ?? origItem.qty_sent);
      const cond = (match?.condition_status || 'Baik') as DeliveryItemCondition;
      if (!Number.isFinite(qtyReceived) || qtyReceived < 0 || qtyReceived > origItem.qty_sent) {
        res.status(400).json({
          message: `Qty diterima untuk ${origItem.material_name} tidak valid (harus 0 s/d ${origItem.qty_sent} ${origItem.unit}).`,
        });
        return;
      }
      if (!allowedConditions.has(cond)) {
        res.status(400).json({
          message: `Status kondisi barang "${origItem.material_name}" wajib diisi (Baik / Kurang / Rusak Sebagian).`,
        });
        return;
      }
      updatedItems.push({
        ...origItem,
        qty_received: roundQty(qtyReceived),
        condition_status: cond,
        notes: match?.notes !== undefined ? String(match.notes).trim() : origItem.notes,
      });
    }

    const now = new Date().toISOString();
    const recPos = String(body.recipient_position || existing.recipient_position || '').trim() || getEmployeePosition(db, actor);
    const sigHash = crypto
      .createHash('sha256')
      .update(`${existing.id}|RECIPIENT|${actor.employeeId}|${now}|${body.signature_data_url.slice(0, 128)}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const updated: DeliveryNote = {
      ...existing,
      recipient_id: actor.employeeId,
      recipient_name: actor.fullName,
      recipient_position: recPos,
      items: updatedItems,
      recipient_signature: {
        signer_id: actor.employeeId,
        signer_name: actor.fullName,
        signer_position: recPos,
        signer_role: actor.roleCode,
        signer_division: actor.divisionCode,
        signed_at: now,
        signature_data_url: body.signature_data_url,
        signature_hash: sigHash,
      },
      status: 'Selesai',
      is_locked: true,
      completed_at: now,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Konfirmasi Penerimaan & Kunci Dokumen',
          existing.status,
          'Selesai',
          String(body.note || '').trim() ||
            `Barang diperiksa dan diterima oleh ${actor.fullName}. Kedua tanda tangan lengkap — dokumen dikunci.`
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_SELESAI',
      material_name: `${updatedItems.length} Item Diterima`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: existing.sj_number,
      detail: `Surat Jalan ${existing.sj_number} dikonfirmasi & ditandatangani Penerima ${actor.fullName}. Dokumen terkunci permanen.`,
    });

    db.notifications = [
      makeOperationalNotification({
        type: 'Permintaan Disetujui',
        title: `Surat Jalan Selesai — ${existing.sj_number}`,
        message: `Penerimaan barang ${existing.sj_number} dikonfirmasi & ditandatangani oleh ${actor.fullName} (${existing.project_number}).`,
        target_role: 'ALL',
        target_division_id: 'div-logistik',
        project_id: existing.project_id,
        link_module: 'gudang',
      }),
      ...db.notifications,
    ];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Konfirmasi Penerimaan Surat Jalan',
        `Memeriksa & menandatangani Surat Jalan ${existing.sj_number} hingga status Selesai.`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Cancel Surat Jalan with Reason (Logistik & Super Admin only; atomically restores stock once if already deducted!)
  const restoreStockOnDeliveryCancellation = (
    db: PMSState,
    actor: ActorContext,
    dn: DeliveryNote,
    reason: string,
    actionLabel: string
  ) => {
    const now = new Date().toISOString();
    if (dn.stock_deducted && !dn.stock_restored) {
      const sourceWh = resolveWarehouseInDb(db, dn.source_warehouse_id || dn.source_warehouse_name);
      const wfIdx = db.workflows.findIndex((w) => w.project_id === dn.project_id);
      for (const item of dn.items) {
        const matIdx = db.materials.findIndex((m) => m.id === item.material_id);
        if (matIdx === -1) continue;
        const mat = db.materials[matIdx];
        const deltaRes = applyWarehouseStockDelta(mat, sourceWh.id, item.qty_sent);
        const stockBefore = deltaRes.whBefore;
        const stockAfter = deltaRes.whAfter;

        db.materials[matIdx] = {
          ...mat,
          warehouse_stocks: deltaRes.nextStocks,
          stock: deltaRes.totalAfter,
          updated_at: now,
          updated_by_name: actor.fullName,
        };

        db.materialTransactions = [
          {
            id: `mtx-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
            material_id: mat.id,
            project_id: dn.project_id,
            warehouse_id: sourceWh.id,
            warehouse_name: sourceWh.name,
            delivery_note_id: dn.id,
            rab_item_id: item.rab_item_id,
            type: 'Masuk',
            qty: item.qty_sent,
            stock_before: stockBefore,
            stock_after: stockAfter,
            date: now.slice(0, 10),
            pic_name: actor.fullName,
            source_or_destination: `Pembatalan ${dn.sj_number} → ${sourceWh.name}`,
            proof_ref: `${dn.sj_number}-BTL`,
            reference_no: `${dn.sj_number}-BTL`,
            notes: `Pengembalian stok otomatis ke ${sourceWh.name} karena ${actionLabel} Surat Jalan ${dn.sj_number}. Alasan: ${reason}`,
          },
          ...db.materialTransactions,
        ];

        if (wfIdx >= 0) {
          const wf = db.workflows[wfIdx];
          wf.material_needs = wf.material_needs.map((n) =>
            n.material_id === mat.id
              ? { ...n, qty_issued: Math.max(0, roundQty(n.qty_issued - item.qty_sent)) }
              : n
          );
          db.workflows[wfIdx] = wf;
        }

        appendWarehouseAudit(db, actor, {
          action: 'SURAT_JALAN_PENGEMBALIAN_STOK',
          material_id: mat.id,
          material_name: `${mat.code} — ${mat.name}`,
          qty_delta: item.qty_sent,
          stock_before: stockBefore,
          stock_after: stockAfter,
          ref_no: `${dn.sj_number}-BTL`,
          detail: `Pengembalian +${item.qty_sent} ${mat.unit} ke ${sourceWh.name} akibat ${actionLabel} ${dn.sj_number} (${reason}).`,
        });
      }
      if (wfIdx >= 0) {
        db.workflows[wfIdx].material_needs = recomputeProcurementStatuses(
          db.workflows[wfIdx],
          db.materials
        );
      }
      return true;
    }
    return Boolean(dn.stock_restored);
  };

  app.post('/api/warehouse/delivery-notes/:id/cancel', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang membatalkan Surat Jalan.',
      });
      return;
    }

    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan pembatalan wajib diisi untuk jejak audit.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.status === 'Dibatalkan') {
      res.status(409).json({ message: `Surat Jalan ${existing.sj_number} sudah dibatalkan sebelumnya.` });
      return;
    }

    const restored = restoreStockOnDeliveryCancellation(db, actor, existing, reason, 'pembatalan');
    const now = new Date().toISOString();

    const updated: DeliveryNote = {
      ...existing,
      status: 'Dibatalkan',
      is_locked: true,
      stock_restored: restored,
      cancel_reason: reason,
      cancelled_at: now,
      cancelled_by_name: actor.fullName,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Surat Jalan Dibatalkan',
          existing.status,
          'Dibatalkan',
          `Dibatalkan oleh ${actor.fullName}. Alasan: ${reason}${restored ? ' (Stok dikembalikan otomatis ke gudang).' : ''}`
        ),
      ],
    };

    db.deliveryNotes![idx] = updated;
    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_DIBATALKAN',
      material_name: `${existing.items.length} Item`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: existing.sj_number,
      detail: `Membatalkan Surat Jalan ${existing.sj_number}. Alasan: ${reason}`,
    });
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembatalan Surat Jalan',
        `Membatalkan Surat Jalan ${existing.sj_number}: ${reason}.`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, deliveryNote: updated });
  });

  // Revise Surat Jalan with Reason -> Cancels/Locks prior SJ cleanly (restoring stock once if deducted) & spawns editable Draft R1/R2/...
  app.post('/api/warehouse/delivery-notes/:id/revise', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (!isLogisticsActor(actor)) {
      res.status(403).json({
        message: 'Hanya Divisi Logistik atau Super Admin yang berwenang menerbitkan revisi Surat Jalan.',
      });
      return;
    }

    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan revisi wajib diisi untuk riwayat audit.' });
      return;
    }

    const db = ensureOperationalDb();
    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan.' });
      return;
    }
    const existing = db.deliveryNotes![idx];
    if (existing.status === 'Dibatalkan') {
      res.status(409).json({
        message: `Surat Jalan ${existing.sj_number} sudah dibatalkan/direvisi sebelumnya.`,
      });
      return;
    }

    const restored = restoreStockOnDeliveryCancellation(db, actor, existing, reason, 'revisi');
    const now = new Date().toISOString();
    const baseNumber = existing.sj_number.replace(/-R\d+$/i, '');
    const nextRev = (existing.revision_no || 0) + 1;
    let revisedNumber = `${baseNumber}-R${nextRev}`;
    const existingNums = new Set((db.deliveryNotes || []).map((d) => d.sj_number.toUpperCase()));
    let suffix = nextRev;
    while (existingNums.has(revisedNumber.toUpperCase())) {
      suffix += 1;
      revisedNumber = `${baseNumber}-R${suffix}`;
    }

    const closedOld: DeliveryNote = {
      ...existing,
      status: 'Dibatalkan',
      is_locked: true,
      stock_restored: restored,
      cancel_reason: `Direvisi menjadi ${revisedNumber}: ${reason}`,
      cancelled_at: now,
      cancelled_by_name: actor.fullName,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          `Direvisi menjadi ${revisedNumber}`,
          existing.status,
          'Dibatalkan',
          `Dokumen digantikan oleh revisi ${revisedNumber}. Alasan: ${reason}`
        ),
      ],
    };

    const revisedDraft: DeliveryNote = {
      id: `sj-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      sj_number: revisedNumber,
      revision_no: suffix,
      revised_from_id: existing.id,
      revised_from_number: existing.sj_number,
      delivery_date: existing.delivery_date,
      project_id: existing.project_id,
      project_number: existing.project_number,
      project_name: existing.project_name,
      source_warehouse_id: existing.source_warehouse_id,
      source_warehouse_name: existing.source_warehouse_name,
      destination_location: existing.destination_location,
      sender_id: actor.employeeId,
      sender_name: actor.fullName,
      sender_position: getEmployeePosition(db, actor),
      recipient_id: existing.recipient_id,
      recipient_name: existing.recipient_name,
      recipient_position: existing.recipient_position,
      vehicle_info: existing.vehicle_info,
      driver_name: existing.driver_name,
      driver_phone: existing.driver_phone,
      request_id: existing.request_id,
      supplier_sj_no: existing.supplier_sj_no,
      notes: existing.notes,
      status: 'Draft',
      items: existing.items.map((it) => ({
        ...it,
        id: `sji-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        qty_received: 0,
        condition_status: 'Belum Diperiksa',
      })),
      stock_deducted: false,
      stock_restored: false,
      issued_tx_ids: [],
      is_locked: false,
      history: [
        buildDnHistory(
          actor,
          `Dibuat dari Revisi ${existing.sj_number}`,
          null,
          'Draft',
          `Revisi ke-${suffix} dari ${existing.sj_number}. Alasan: ${reason}`
        ),
      ],
      created_at: now,
      updated_at: now,
    };

    db.deliveryNotes![idx] = closedOld;
    db.deliveryNotes = [revisedDraft, ...db.deliveryNotes!];

    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_REVISI',
      material_name: `${revisedDraft.items.length} Item`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: revisedNumber,
      detail: `Menerbitkan revisi ${revisedNumber} atas ${existing.sj_number}. Alasan: ${reason}`,
    });
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Revisi Surat Jalan Digital',
        `Menerbitkan revisi ${revisedNumber} (dari ${existing.sj_number}): ${reason}.`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, deliveryNote: revisedDraft, previousDeliveryNote: closedOld });
  });

  // Soft-Delete Cancelled Surat Jalan — STRICTLY Head Logistik ONLY (Super Admin & other roles/divisions blocked)
  const handleSoftDeleteDeliveryNote = (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }

    const db = ensureOperationalDb();
    if (!isHeadLogisticsActor(db, actor)) {
      res.status(403).json({
        message: 'Anda tidak memiliki hak akses. Penghapusan Surat Jalan hanya dapat dilakukan oleh Head Logistik.',
      });
      return;
    }

    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan penghapusan Surat Jalan wajib diisi.' });
      return;
    }

    const idx = (db.deliveryNotes || []).findIndex((d) => d.id === req.params.id);
    if (idx === -1 || db.deliveryNotes![idx].is_deleted) {
      res.status(404).json({ message: 'Surat Jalan tidak ditemukan atau sudah dihapus.' });
      return;
    }

    const existing = db.deliveryNotes![idx];
    if (existing.status !== 'Dibatalkan') {
      res.status(400).json({
        message: `Hanya Surat Jalan berstatus "Dibatalkan" yang dapat dihapus (status saat ini: ${existing.status}).`,
      });
      return;
    }

    const now = new Date().toISOString();
    const updated: DeliveryNote = {
      ...existing,
      is_deleted: true,
      deleted_at: now,
      deleted_by_id: actor.employeeId,
      deleted_by_name: actor.fullName,
      deleted_by_role: 'Head Logistik',
      delete_reason: reason,
      updated_at: now,
      history: [
        ...existing.history,
        buildDnHistory(
          actor,
          'Surat Jalan Dihapus (Soft Delete)',
          'Dibatalkan',
          'Dibatalkan',
          `Dihapus dari daftar dan riwayat normal oleh ${actor.fullName} (Head Logistik). Alasan: ${reason}`
        ),
      ],
    };

    // Preserve record in db.deliveryNotes with is_deleted: true; NEVER mutate materials or materialTransactions
    db.deliveryNotes![idx] = updated;

    appendWarehouseAudit(db, actor, {
      action: 'SURAT_JALAN_DIHAPUS',
      material_name: `${existing.items.length} Item`,
      qty_delta: 0,
      stock_before: 0,
      stock_after: 0,
      ref_no: existing.sj_number,
      detail: `Penghapusan (soft delete) Surat Jalan ${existing.sj_number} oleh ${actor.fullName} (Head Logistik) pada ${now}. Alasan: ${reason}. Riwayat stok dan transaksi tidak berubah.`,
    });

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Hapus Surat Jalan Digital',
        `Menghapus (soft delete) Surat Jalan ${existing.sj_number} (status Dibatalkan) oleh ${actor.fullName} (Head Logistik) pada ${now}. Alasan: ${reason}.`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({
      state: db,
      deletedDeliveryNote: updated,
      message: `Surat Jalan ${existing.sj_number} berhasil dihapus dari daftar dan riwayat normal (catatan audit tersimpan).`,
    });
  };

  app.post('/api/warehouse/delivery-notes/:id/delete', handleSoftDeleteDeliveryNote);
  app.delete('/api/warehouse/delivery-notes/:id', handleSoftDeleteDeliveryNote);

  // ============================================================================
  // ASET PROYEK (PROJECT ASSETS, LOSS/DAMAGE REPORTS, FINANCE REVIEW & HISTORY)
  // ============================================================================

  const resolveProjectAssetActorTruth = (db: PMSState, actor: ActorContext) => {
    const emp = db.employees.find((e) => e.id === actor.employeeId && e.nik === actor.nik);
    if (!emp || emp.status !== 'Aktif') return null;
    const role = db.roles.find((r) => r.id === emp.role_id)?.code || actor.roleCode;
    const division = db.divisions.find((d) => d.id === emp.division_id)?.code || actor.divisionCode;
    return { emp, role, division };
  };

  const computeProjectAssetCondition = (
    qtyAvailable: number,
    qtyDamaged: number,
    qtyLost: number
  ): ProjectAssetCondition => {
    if (qtyAvailable === 0 && qtyLost > 0 && qtyDamaged === 0) return 'Hilang';
    if (qtyDamaged > 0) return 'Rusak';
    if (qtyLost > 0) return 'Hilang';
    return 'Baik';
  };

  const verifyImageAttachment = (attachmentId: string | undefined): AttachmentRecord | null => {
    const id = String(attachmentId || '').trim();
    if (!id) return null;
    const attDb = readJson<AttachmentRecord[]>(DB_FILE, []);
    const found = attDb.find((a) => a.id === id && a.status !== 'Diarsipkan');
    if (!found) return null;
    const isImg = ['jpg', 'jpeg', 'png', 'webp', 'jfif'].includes(
      String(found.extension || '').toLowerCase()
    );
    return isImg ? found : null;
  };

  const ALLOWED_ASSET_CONDITIONS = new Set<ProjectAssetCondition>(['Baik', 'Rusak', 'Hilang']);
  const ALLOWED_REPORT_TYPES = new Set<ProjectAssetReportType>(['Hilang', 'Rusak']);
  const ALLOWED_REPORT_STATUSES = new Set<ProjectAssetReportStatus>([
    'Menunggu Pemeriksaan',
    'Disetujui',
    'Perlu Perbaikan Data',
  ]);

  // 1. Tambah Aset Proyek Manual (Finance & Super Admin)
  app.post('/api/project-assets', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.division !== 'FINANCE')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat menambah aset proyek.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      asset_code?: string;
      project_id?: string;
      name?: string;
      category?: string;
      qty?: number;
      unit?: string;
      recorded_date?: string;
      initial_condition?: ProjectAssetCondition;
      notes?: string;
      photo_attachment_id?: string;
    };

    const projectId = String(body.project_id || '').trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek wajib dipilih dan harus proyek aktif.' });
      return;
    }

    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim();
    const unit = String(body.unit || '').trim();
    const recordedDate = String(body.recorded_date || '').trim() || new Date().toISOString().slice(0, 10);
    const initialCondition = (body.initial_condition || 'Baik') as ProjectAssetCondition;
    const qty = Math.round(Number(body.qty));
    const notes = String(body.notes || '').trim();

    if (!name) {
      res.status(400).json({ message: 'Nama aset atau peralatan kerja wajib diisi.' });
      return;
    }
    if (!category) {
      res.status(400).json({ message: 'Kategori aset wajib dipilih.' });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ message: 'Jumlah (Qty) aset harus lebih dari 0.' });
      return;
    }
    if (!unit) {
      res.status(400).json({ message: 'Satuan aset wajib diisi.' });
      return;
    }
    if (!ALLOWED_ASSET_CONDITIONS.has(initialCondition)) {
      res.status(400).json({ message: 'Kondisi awal aset tidak valid (Baik / Rusak / Hilang).' });
      return;
    }

    let verifiedPhoto: AttachmentRecord | null = null;
    if (body.photo_attachment_id) {
      verifiedPhoto = verifyImageAttachment(body.photo_attachment_id);
      if (!verifiedPhoto) {
        res.status(400).json({ message: 'Foto aset yang dilampirkan tidak valid atau bukan file gambar.' });
        return;
      }
    }

    const existingList = db.projectAssets || [];
    const customId = String(body.id || '').trim();
    const assetId =
      customId && /^[a-zA-Z0-9_-]{4,64}$/.test(customId) && !existingList.some((a) => a.id === customId)
        ? customId
        : `past-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;

    const nextSeq = existingList.length + 1;
    const requestedCode = String(body.asset_code || '').trim().toUpperCase();
    const assetCode =
      requestedCode && !existingList.some((a) => a.asset_code === requestedCode)
        ? requestedCode
        : `AST-PRJ-${String(nextSeq).padStart(3, '0')}`;

    const qtyAvailable = initialCondition === 'Baik' ? qty : 0;
    const qtyDamaged = initialCondition === 'Rusak' ? qty : 0;
    const qtyLost = initialCondition === 'Hilang' ? qty : 0;
    const now = new Date().toISOString();

    const newAsset: ProjectAsset = {
      id: assetId,
      asset_code: assetCode,
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      name,
      category,
      qty_total: qty,
      qty_available: qtyAvailable,
      qty_damaged: qtyDamaged,
      qty_lost: qtyLost,
      unit,
      recorded_date: recordedDate,
      initial_condition: initialCondition,
      condition: initialCondition,
      notes: notes || '-',
      photo_attachment_id: verifiedPhoto?.id,
      photo_name: verifiedPhoto?.original_name,
      created_by_id: truth.emp.id,
      created_by_name: truth.emp.full_name,
      created_at: now,
      updated_at: now,
    };

    const historyEntry: ProjectAssetHistory = {
      id: `pah-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      asset_id: newAsset.id,
      asset_code: newAsset.asset_code,
      asset_name: newAsset.name,
      action_type: 'Penambahan Aset',
      qty_change_available: qtyAvailable,
      qty_change_damaged: qtyDamaged,
      qty_change_lost: qtyLost,
      condition_after: initialCondition,
      description: `Penambahan aset ${newAsset.name} (${qty} ${unit}, kondisi awal ${initialCondition}) pada proyek ${project.project_number}.`,
      attachment_id: verifiedPhoto?.id,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      actor_role: truth.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Finance',
      created_at: now,
    };

    db.projectAssets = [newAsset, ...existingList];
    db.projectAssetHistories = [historyEntry, ...(db.projectAssetHistories || [])];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Aset Proyek',
        `Menambahkan aset proyek ${newAsset.asset_code} — ${newAsset.name} (${qty} ${unit}) ke ${project.project_number}.`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, asset: newAsset });
  });

  // 2. Edit / Kelola Aset Proyek (Finance & Super Admin)
  app.patch('/api/project-assets/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.division !== 'FINANCE')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat mengubah data aset proyek.',
      });
      return;
    }

    const idx = (db.projectAssets || []).findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data aset proyek tidak ditemukan.' });
      return;
    }

    const existing = db.projectAssets![idx];
    const body = req.body as {
      project_id?: string;
      name?: string;
      category?: string;
      unit?: string;
      recorded_date?: string;
      qty_available?: number;
      qty_damaged?: number;
      qty_lost?: number;
      notes?: string;
      photo_attachment_id?: string;
    };

    let nextProjectId = existing.project_id;
    let nextProjectNumber = existing.project_number;
    let nextProjectName = existing.project_name;
    if (body.project_id && body.project_id !== existing.project_id) {
      const targetPrj = db.projects.find((p) => p.id === body.project_id && !p.is_deleted);
      if (!targetPrj) {
        res.status(400).json({ message: 'Proyek tujuan tidak ditemukan atau tidak aktif.' });
        return;
      }
      nextProjectId = targetPrj.id;
      nextProjectNumber = targetPrj.project_number;
      nextProjectName = targetPrj.name;
    }

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const category = body.category !== undefined ? String(body.category).trim() : existing.category;
    const unit = body.unit !== undefined ? String(body.unit).trim() : existing.unit;
    const recordedDate =
      body.recorded_date !== undefined ? String(body.recorded_date).trim() : existing.recorded_date;
    const notes = body.notes !== undefined ? String(body.notes).trim() : existing.notes;

    const nextAvailable =
      body.qty_available !== undefined ? Math.round(Number(body.qty_available)) : existing.qty_available;
    const nextDamaged =
      body.qty_damaged !== undefined ? Math.round(Number(body.qty_damaged)) : existing.qty_damaged;
    const nextLost = body.qty_lost !== undefined ? Math.round(Number(body.qty_lost)) : existing.qty_lost;

    if (!name || !category || !unit) {
      res.status(400).json({ message: 'Nama aset, kategori, dan satuan wajib diisi.' });
      return;
    }
    if (
      !Number.isFinite(nextAvailable) ||
      !Number.isFinite(nextDamaged) ||
      !Number.isFinite(nextLost) ||
      nextAvailable < 0 ||
      nextDamaged < 0 ||
      nextLost < 0
    ) {
      res.status(400).json({ message: 'Jumlah aset tersedia, rusak, dan hilang tidak boleh bernilai negatif.' });
      return;
    }
    const nextTotal = nextAvailable + nextDamaged + nextLost;
    if (nextTotal <= 0) {
      res.status(400).json({ message: 'Total jumlah aset harus lebih dari 0.' });
      return;
    }

    let photoAttachmentId = existing.photo_attachment_id;
    let photoName = existing.photo_name;
    if (body.photo_attachment_id !== undefined) {
      if (body.photo_attachment_id === '') {
        photoAttachmentId = undefined;
        photoName = undefined;
      } else {
        const verified = verifyImageAttachment(body.photo_attachment_id);
        if (!verified) {
          res.status(400).json({ message: 'Foto aset tidak valid atau bukan file gambar.' });
          return;
        }
        photoAttachmentId = verified.id;
        photoName = verified.original_name;
      }
    }

    const nextCondition = computeProjectAssetCondition(nextAvailable, nextDamaged, nextLost);
    const now = new Date().toISOString();

    const updated: ProjectAsset = {
      ...existing,
      project_id: nextProjectId,
      project_number: nextProjectNumber,
      project_name: nextProjectName,
      name,
      category,
      unit,
      recorded_date: recordedDate || existing.recorded_date,
      qty_total: nextTotal,
      qty_available: nextAvailable,
      qty_damaged: nextDamaged,
      qty_lost: nextLost,
      condition: nextCondition,
      notes: notes || '-',
      photo_attachment_id: photoAttachmentId,
      photo_name: photoName,
      updated_by_id: truth.emp.id,
      updated_by_name: truth.emp.full_name,
      updated_at: now,
    };

    const deltaAvail = nextAvailable - existing.qty_available;
    const deltaDmg = nextDamaged - existing.qty_damaged;
    const deltaLost = nextLost - existing.qty_lost;
    const condChanged = nextCondition !== existing.condition;

    const historyEntry: ProjectAssetHistory = {
      id: `pah-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: updated.project_id,
      project_number: updated.project_number,
      project_name: updated.project_name,
      asset_id: updated.id,
      asset_code: updated.asset_code,
      asset_name: updated.name,
      action_type: condChanged ? 'Perubahan Kondisi' : 'Pembaruan Aset',
      qty_change_available: deltaAvail,
      qty_change_damaged: deltaDmg,
      qty_change_lost: deltaLost,
      condition_before: existing.condition,
      condition_after: nextCondition,
      description: `Pembaruan data aset ${updated.name}: Total ${nextTotal} ${unit} (Tersedia ${nextAvailable}, Rusak ${nextDamaged}, Hilang ${nextLost}).`,
      attachment_id: photoAttachmentId,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      actor_role: truth.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Finance',
      created_at: now,
    };

    db.projectAssets![idx] = updated;
    db.projectAssetHistories = [historyEntry, ...(db.projectAssetHistories || [])];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembaruan Aset Proyek',
        `Memperbarui aset ${updated.asset_code} — ${updated.name} (Tersedia: ${nextAvailable}, Rusak: ${nextDamaged}, Hilang: ${nextLost}).`,
        updated.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, asset: updated });
  });

  // 3. Buat Laporan Kehilangan atau Kerusakan (Tim Lapangan / Divisi Teknik & Super Admin)
  app.post('/api/project-assets/reports', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.division !== 'TEKNIK')) {
      res.status(403).json({
        message:
          'Akses ditolak: Hanya Tim Lapangan (Divisi Teknik) atau Super Admin yang dapat membuat laporan kehilangan atau kerusakan aset.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      asset_id?: string;
      report_type?: ProjectAssetReportType;
      affected_qty?: number;
      incident_date?: string;
      chronology?: string;
      photo_attachment_id?: string;
    };

    const projectId = String(body.project_id || '').trim();
    const assetId = String(body.asset_id || '').trim();
    const reportType = body.report_type as ProjectAssetReportType;
    const affectedQty = Math.round(Number(body.affected_qty));
    const incidentDate = String(body.incident_date || '').trim() || new Date().toISOString().slice(0, 10);
    const chronology = String(body.chronology || '').trim();

    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek wajib dipilih.' });
      return;
    }

    const asset = (db.projectAssets || []).find((a) => a.id === assetId);
    if (!asset) {
      res.status(404).json({ message: 'Aset yang dilaporkan tidak ditemukan.' });
      return;
    }
    if (asset.project_id !== project.id) {
      res.status(400).json({
        message: 'Aset yang dipilih tidak terdaftar pada proyek tersebut. Data aset tiap proyek terpisah.',
      });
      return;
    }
    if (!ALLOWED_REPORT_TYPES.has(reportType)) {
      res.status(400).json({ message: 'Jenis laporan harus "Hilang" atau "Rusak".' });
      return;
    }
    if (!Number.isFinite(affectedQty) || affectedQty <= 0) {
      res.status(400).json({ message: 'Jumlah aset terdampak harus lebih dari 0.' });
      return;
    }
    if (affectedQty > asset.qty_available) {
      res.status(400).json({
        message: `Jumlah terdampak (${affectedQty} ${asset.unit}) melebihi jumlah tersedia saat ini (${asset.qty_available} ${asset.unit}).`,
      });
      return;
    }
    if (!chronology) {
      res.status(400).json({ message: 'Kronologi atau keterangan kejadian wajib diisi.' });
      return;
    }

    let verifiedPhoto: AttachmentRecord | null = null;
    if (body.photo_attachment_id) {
      verifiedPhoto = verifyImageAttachment(body.photo_attachment_id);
      if (!verifiedPhoto) {
        res.status(400).json({ message: 'File foto bukti yang dilampirkan tidak valid atau bukan gambar.' });
        return;
      }
    }
    if (reportType === 'Rusak' && !verifiedPhoto) {
      res.status(400).json({
        message: 'Upload foto bukti wajib diisi untuk laporan kerusakan aset.',
      });
      return;
    }

    const existingReports = db.projectAssetReports || [];
    const customId = String(body.id || '').trim();
    const reportId =
      customId && /^[a-zA-Z0-9_-]{4,64}$/.test(customId) && !existingReports.some((r) => r.id === customId)
        ? customId
        : `par-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
    const reportNo = `LPR-AST-${new Date().getFullYear()}-${String(existingReports.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const newReport: ProjectAssetReport = {
      id: reportId,
      report_no: reportNo,
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      unit: asset.unit,
      report_type: reportType,
      affected_qty: affectedQty,
      incident_date: incidentDate,
      chronology,
      photo_attachment_id: verifiedPhoto?.id,
      photo_name: verifiedPhoto?.original_name,
      reported_by_id: truth.emp.id,
      reported_by_name: truth.emp.full_name,
      reported_by_role: truth.emp.position || 'Tim Lapangan',
      reported_at: now,
      status: 'Menunggu Pemeriksaan',
      applied_to_asset: false,
      updated_at: now,
    };

    const historyEntry: ProjectAssetHistory = {
      id: `pah-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.name,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      report_id: newReport.id,
      action_type: reportType === 'Rusak' ? 'Laporan Kerusakan' : 'Laporan Kehilangan',
      qty_change_available: 0,
      qty_change_damaged: 0,
      qty_change_lost: 0,
      description: `Laporan ${reportNo} (${reportType} ${affectedQty} ${asset.unit}) oleh ${truth.emp.full_name} — menunggu pemeriksaan Finance.`,
      attachment_id: verifiedPhoto?.id,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      actor_role: truth.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Tim Lapangan',
      created_at: now,
    };

    // Asset quantity & condition are NOT mutated automatically on report submission;
    // Finance review decides the update!
    db.projectAssetReports = [newReport, ...existingReports];
    db.projectAssetHistories = [historyEntry, ...(db.projectAssetHistories || [])];
    db.notifications = [
      makeOperationalNotification({
        type: 'Laporan Lapangan',
        title: `Laporan Aset ${reportType} — ${reportNo}`,
        message: `${truth.emp.full_name} melaporkan ${affectedQty} ${asset.unit} ${asset.name} ${reportType.toLowerCase()} pada ${project.project_number}. Menunggu pemeriksaan Finance.`,
        target_role: 'ALL',
        target_division_id: 'div-finance',
        project_id: project.id,
        link_module: 'aset',
      }),
      ...db.notifications,
    ];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        `Laporan Aset ${reportType}`,
        `Mengirim laporan ${reportNo}: ${affectedQty} ${asset.unit} ${asset.name} (${reportType}) di ${project.project_number}.`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, report: newReport });
  });

  // 4. Perbaiki Data Laporan yang Diminta Perbaikan oleh Finance (Tim Lapangan / Super Admin)
  app.patch('/api/project-assets/reports/:id/resubmit', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.division !== 'TEKNIK')) {
      res.status(403).json({
        message: 'Hanya Tim Lapangan (Divisi Teknik) atau Super Admin yang dapat memperbaiki data laporan.',
      });
      return;
    }

    const idx = (db.projectAssetReports || []).findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Laporan aset tidak ditemukan.' });
      return;
    }

    const existing = db.projectAssetReports![idx];
    if (existing.status !== 'Perlu Perbaikan Data' || existing.applied_to_asset) {
      res.status(400).json({
        message: 'Hanya laporan berstatus "Perlu Perbaikan Data" yang dapat diperbaiki dan dikirim ulang.',
      });
      return;
    }

    const asset = (db.projectAssets || []).find((a) => a.id === existing.asset_id);
    if (!asset) {
      res.status(404).json({ message: 'Aset terkait tidak ditemukan.' });
      return;
    }

    const body = req.body as {
      affected_qty?: number;
      incident_date?: string;
      chronology?: string;
      photo_attachment_id?: string;
    };

    const affectedQty =
      body.affected_qty !== undefined ? Math.round(Number(body.affected_qty)) : existing.affected_qty;
    const incidentDate =
      body.incident_date !== undefined ? String(body.incident_date).trim() : existing.incident_date;
    const chronology =
      body.chronology !== undefined ? String(body.chronology).trim() : existing.chronology;

    if (!Number.isFinite(affectedQty) || affectedQty <= 0 || affectedQty > asset.qty_available) {
      res.status(400).json({
        message: `Jumlah terdampak harus antara 1 s/d ${asset.qty_available} ${asset.unit}.`,
      });
      return;
    }
    if (!chronology) {
      res.status(400).json({ message: 'Kronologi atau keterangan kejadian wajib diisi.' });
      return;
    }

    let photoAttachmentId = existing.photo_attachment_id;
    let photoName = existing.photo_name;
    if (body.photo_attachment_id) {
      const verified = verifyImageAttachment(body.photo_attachment_id);
      if (!verified) {
        res.status(400).json({ message: 'Foto bukti tidak valid atau bukan gambar.' });
        return;
      }
      photoAttachmentId = verified.id;
      photoName = verified.original_name;
    }

    if (existing.report_type === 'Rusak' && !photoAttachmentId) {
      res.status(400).json({ message: 'Foto bukti wajib dilampirkan untuk laporan kerusakan.' });
      return;
    }

    const now = new Date().toISOString();
    const updated: ProjectAssetReport = {
      ...existing,
      affected_qty: affectedQty,
      incident_date: incidentDate || existing.incident_date,
      chronology,
      photo_attachment_id: photoAttachmentId,
      photo_name: photoName,
      status: 'Menunggu Pemeriksaan',
      updated_at: now,
    };

    const historyEntry: ProjectAssetHistory = {
      id: `pah-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: existing.project_id,
      project_number: existing.project_number,
      project_name: existing.project_name,
      asset_id: existing.asset_id,
      asset_code: existing.asset_code,
      asset_name: existing.asset_name,
      report_id: existing.id,
      action_type: existing.report_type === 'Rusak' ? 'Laporan Kerusakan' : 'Laporan Kehilangan',
      qty_change_available: 0,
      qty_change_damaged: 0,
      qty_change_lost: 0,
      description: `Perbaikan data laporan ${existing.report_no} oleh ${truth.emp.full_name} — dikirim ulang ke Finance untuk pemeriksaan.`,
      attachment_id: photoAttachmentId,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      actor_role: truth.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Tim Lapangan',
      created_at: now,
    };

    db.projectAssetReports![idx] = updated;
    db.projectAssetHistories = [historyEntry, ...(db.projectAssetHistories || [])];
    db.notifications = [
      makeOperationalNotification({
        type: 'Laporan Lapangan',
        title: `Perbaikan Laporan ${existing.report_no}`,
        message: `${truth.emp.full_name} memperbarui data laporan ${existing.report_no} (${existing.asset_name}). Siap diperiksa kembali oleh Finance.`,
        target_role: 'ALL',
        target_division_id: 'div-finance',
        project_id: existing.project_id,
        link_module: 'aset',
      }),
      ...db.notifications,
    ];

    saveOperationalDb(db);
    res.json({ state: db, report: updated });
  });

  // 5. Pemeriksaan & Tindak Lanjut Laporan Kehilangan/Kerusakan (Finance & Super Admin)
  app.post('/api/project-assets/reports/:id/review', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.division !== 'FINANCE')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang berwenang memeriksa laporan aset.',
      });
      return;
    }

    const repIdx = (db.projectAssetReports || []).findIndex((r) => r.id === req.params.id);
    if (repIdx === -1) {
      res.status(404).json({ message: 'Laporan aset tidak ditemukan.' });
      return;
    }

    const existingReport = db.projectAssetReports![repIdx];
    const body = req.body as {
      status?: ProjectAssetReportStatus;
      follow_up_note?: string;
      approved_qty?: number;
    };

    const nextStatus = body.status as ProjectAssetReportStatus;
    const followUpNote = String(body.follow_up_note || '').trim();

    if (!ALLOWED_REPORT_STATUSES.has(nextStatus)) {
      res.status(400).json({
        message: 'Status pemeriksaan harus: Menunggu Pemeriksaan, Disetujui, atau Perlu Perbaikan Data.',
      });
      return;
    }

    if (existingReport.applied_to_asset) {
      res.status(400).json({
        message: `Laporan ${existingReport.report_no} sudah disetujui dan diterapkan ke jumlah aset sebelumnya.`,
      });
      return;
    }

    if (nextStatus === 'Perlu Perbaikan Data' && !followUpNote) {
      res.status(400).json({
        message: 'Catatan tindak lanjut wajib diisi saat meminta perbaikan data laporan.',
      });
      return;
    }

    const assetIdx = (db.projectAssets || []).findIndex((a) => a.id === existingReport.asset_id);
    if (assetIdx === -1) {
      res.status(404).json({ message: 'Aset proyek terkait tidak ditemukan.' });
      return;
    }
    const asset = db.projectAssets![assetIdx];
    const now = new Date().toISOString();

    let updatedAsset = asset;
    let deltaAvailable = 0;
    let deltaDamaged = 0;
    let deltaLost = 0;
    let approvedQty: number | undefined = existingReport.approved_qty;
    let applied = false;

    if (nextStatus === 'Disetujui') {
      const qtyToApply =
        body.approved_qty !== undefined
          ? Math.round(Number(body.approved_qty))
          : existingReport.affected_qty;

      if (!Number.isFinite(qtyToApply) || qtyToApply <= 0) {
        res.status(400).json({ message: 'Jumlah aset yang disetujui harus lebih dari 0.' });
        return;
      }
      if (qtyToApply > asset.qty_available) {
        res.status(400).json({
          message: `Jumlah disetujui (${qtyToApply} ${asset.unit}) melebihi stok tersedia (${asset.qty_available} ${asset.unit}).`,
        });
        return;
      }

      approvedQty = qtyToApply;
      applied = true;
      deltaAvailable = -qtyToApply;
      const nextAvailable = asset.qty_available - qtyToApply;
      let nextDamaged = asset.qty_damaged;
      let nextLost = asset.qty_lost;

      if (existingReport.report_type === 'Rusak') {
        nextDamaged += qtyToApply;
        deltaDamaged = qtyToApply;
      } else {
        nextLost += qtyToApply;
        deltaLost = qtyToApply;
      }

      const nextCondition = computeProjectAssetCondition(nextAvailable, nextDamaged, nextLost);
      updatedAsset = {
        ...asset,
        qty_available: nextAvailable,
        qty_damaged: nextDamaged,
        qty_lost: nextLost,
        condition: nextCondition,
        updated_by_id: truth.emp.id,
        updated_by_name: truth.emp.full_name,
        updated_at: now,
      };
      db.projectAssets![assetIdx] = updatedAsset;
    }

    const updatedReport: ProjectAssetReport = {
      ...existingReport,
      status: nextStatus,
      reviewed_by_id: truth.emp.id,
      reviewed_by_name: truth.emp.full_name,
      reviewed_at: now,
      follow_up_note: followUpNote || existingReport.follow_up_note || '-',
      approved_qty: approvedQty,
      applied_to_asset: applied,
      updated_at: now,
    };
    db.projectAssetReports![repIdx] = updatedReport;

    const historyDesc =
      nextStatus === 'Disetujui'
        ? `Laporan ${existingReport.report_no} disetujui Finance (${approvedQty} ${asset.unit} ${existingReport.report_type}). Tersedia: ${asset.qty_available} → ${updatedAsset.qty_available}. Catatan: ${updatedReport.follow_up_note}`
        : nextStatus === 'Perlu Perbaikan Data'
        ? `Laporan ${existingReport.report_no} dikembalikan untuk perbaikan data oleh Finance. Catatan: ${updatedReport.follow_up_note}`
        : `Status laporan ${existingReport.report_no} ditetapkan Menunggu Pemeriksaan. Catatan: ${updatedReport.follow_up_note}`;

    const historyEntry: ProjectAssetHistory = {
      id: `pah-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: existingReport.project_id,
      project_number: existingReport.project_number,
      project_name: existingReport.project_name,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      report_id: existingReport.id,
      action_type:
        nextStatus === 'Disetujui'
          ? 'Pemeriksaan Disetujui'
          : nextStatus === 'Perlu Perbaikan Data'
          ? 'Perlu Perbaikan Data'
          : 'Perubahan Kondisi',
      qty_change_available: deltaAvailable,
      qty_change_damaged: deltaDamaged,
      qty_change_lost: deltaLost,
      condition_before: asset.condition,
      condition_after: updatedAsset.condition,
      description: historyDesc,
      attachment_id: existingReport.photo_attachment_id,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      actor_role: truth.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Finance',
      created_at: now,
    };

    db.projectAssetHistories = [historyEntry, ...(db.projectAssetHistories || [])];
    db.notifications = [
      makeOperationalNotification({
        type: nextStatus === 'Disetujui' ? 'Permintaan Disetujui' : 'Revisi Pengajuan',
        title: `Hasil Pemeriksaan ${existingReport.report_no}: ${nextStatus}`,
        message: `${truth.emp.full_name} menindaklanjuti laporan ${existingReport.asset_name} (${existingReport.project_number}): ${nextStatus}. ${updatedReport.follow_up_note || ''}`,
        target_role: 'ALL',
        target_division_id: 'div-teknik',
        project_id: existingReport.project_id,
        link_module: 'aset',
      }),
      ...db.notifications,
    ];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pemeriksaan Laporan Aset',
        `Memeriksa laporan ${existingReport.report_no} (${existingReport.asset_name}) → ${nextStatus}.`,
        existingReport.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, report: updatedReport, asset: updatedAsset });
  });

  // 6. Hapus Permanen Aset Proyek (Hanya Super Admin & Head)
  app.delete('/api/project-assets/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveProjectAssetActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Super Admin dan Head yang berwenang menghapus aset proyek.',
      });
      return;
    }

    const idx = (db.projectAssets || []).findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data aset proyek tidak ditemukan.' });
      return;
    }

    const target = db.projectAssets![idx];
    db.projectAssets = (db.projectAssets || []).filter((a) => a.id !== target.id);
    db.projectAssetReports = (db.projectAssetReports || []).filter((r) => r.asset_id !== target.id);
    db.projectAssetHistories = (db.projectAssetHistories || []).filter(
      (h) => h.asset_id !== target.id
    );
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Aset Proyek',
        `Menghapus permanen aset proyek ${target.asset_code} — ${target.name} (${target.project_number}).`,
        target.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ ok: true, id: target.id, state: db });
  });

  // ============================================================================
  // FINANCE MODULE ENDPOINTS (Transaksi Keuangan, Verifikasi, Impor & Tagihan)
  // Hanya dapat diakses oleh Divisi Finance (Head/Staff) & Super Admin
  // ============================================================================

  const resolveFinanceActorTruth = (db: PMSState, actor: ActorContext) => {
    const emp = db.employees.find((e) => e.id === actor.employeeId && e.nik === actor.nik);
    if (!emp || emp.status !== 'Aktif') return null;
    const role = db.roles.find((r) => r.id === emp.role_id)?.code || actor.roleCode;
    const division = db.divisions.find((d) => d.id === emp.division_id)?.code || actor.divisionCode;
    if (role !== 'SUPER_ADMIN' && division !== 'FINANCE') return null;
    return { emp, role, division };
  };

  const ALLOWED_FIN_CATEGORIES = new Set<FinancialCategory>([
    'Pembayaran Termin',
    'Pemasukan Proyek',
    'Pengeluaran Proyek',
    'Tagihan Vendor',
    'Biaya Operasional',
    'Pengadaan Material',
  ]);

  const ALLOWED_BILL_CATEGORIES = new Set<FinanceBillCategory>([
    'Tagihan Supplier',
    'Pembayaran Material',
    'Biaya Operasional Proyek',
  ]);

  const verifyFinanceProofAttachment = (attachmentId: string | undefined): AttachmentRecord | null => {
    const id = String(attachmentId || '').trim();
    if (!id) return null;
    const attDb = readJson<AttachmentRecord[]>(DB_FILE, []);
    const found = attDb.find((a) => a.id === id && a.status !== 'Diarsipkan');
    if (!found) return null;
    const allowedExt = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'jfif', 'doc', 'docx', 'xls', 'xlsx']);
    return allowedExt.has(String(found.extension || '').toLowerCase()) ? found : null;
  };

  const computeNextBillStatus = (
    amount: number,
    paidAmount: number,
    dueDate: string
  ): FinanceBillStatus => {
    if (paidAmount >= amount && amount > 0) return 'Lunas';
    const todayIso = new Date().toISOString().slice(0, 10);
    if (dueDate && dueDate < todayIso) return 'Jatuh Tempo';
    if (paidAmount > 0) return 'Sebagian';
    return 'Belum Bayar';
  };

  // 1. Create Financial Transaction
  app.post('/api/finance/transactions', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Finance, Staff Finance, atau Super Admin yang dapat mengakses modul Finance.',
      });
      return;
    }

    const body = req.body as {
      project_id?: string;
      category?: FinancialCategory;
      type?: 'Pemasukan' | 'Pengeluaran';
      date?: string;
      amount?: number;
      proof_ref?: string;
      proof_attachment_id?: string;
      description?: string;
      status?: FinancialTxStatus;
      source_module?: FinancialTransaction['source_module'];
    };

    const projectId = String(body.project_id || '').trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }

    const category = body.category as FinancialCategory;
    if (!ALLOWED_FIN_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Kategori transaksi keuangan tidak valid.' });
      return;
    }

    const txType = body.type;
    if (txType !== 'Pemasukan' && txType !== 'Pengeluaran') {
      res.status(400).json({ message: 'Jenis transaksi harus Pemasukan atau Pengeluaran.' });
      return;
    }

    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ message: 'Nominal transaksi harus lebih dari 0.' });
      return;
    }

    const date = String(body.date || '').trim() || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: 'Format tanggal transaksi tidak valid (YYYY-MM-DD).' });
      return;
    }

    const description = String(body.description || '').trim();
    if (!description) {
      res.status(400).json({ message: 'Keterangan transaksi wajib diisi.' });
      return;
    }

    let verifiedAtt: AttachmentRecord | null = null;
    if (body.proof_attachment_id) {
      verifiedAtt = verifyFinanceProofAttachment(body.proof_attachment_id);
      if (!verifiedAtt) {
        res.status(400).json({ message: 'Lampiran bukti transaksi tidak valid atau tidak ditemukan.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const txId = `fin-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
    const txNo = `TRX-FIN-${new Date().getFullYear()}-${String(db.financialTransactions.length + 950).padStart(4, '0')}`;
    const initialStatus: FinancialTxStatus =
      body.status && ['Terverifikasi', 'Menunggu', 'Ditolak'].includes(body.status)
        ? truth.role === 'STAFF' && body.status === 'Terverifikasi'
          ? 'Menunggu'
          : body.status
        : truth.role === 'STAFF'
        ? 'Menunggu'
        : 'Terverifikasi';

    const newTx: FinancialTransaction = {
      id: txId,
      project_id: project.id,
      transaction_no: txNo,
      date,
      category,
      type: txType,
      amount,
      status: initialStatus,
      proof_ref: verifiedAtt?.original_name || String(body.proof_ref || '').trim() || '-',
      proof_attachment_id: verifiedAtt?.id,
      source_module: body.source_module || 'Manual',
      description,
      created_by_id: truth.emp.id,
      verified_by_id: initialStatus === 'Terverifikasi' ? truth.emp.id : undefined,
      verified_by_name: initialStatus === 'Terverifikasi' ? truth.emp.full_name : undefined,
      verified_at: initialStatus === 'Terverifikasi' ? now : undefined,
      updated_at: now,
    };

    db.financialTransactions = [newTx, ...db.financialTransactions];

    if (initialStatus === 'Menunggu') {
      db.approvals = [
        {
          id: `apr-${Date.now()}`,
          entity_type: 'Finance',
          entity_id: txId,
          reference_no: txNo,
          title: `${category}: ${description}`,
          division_id: 'div-finance',
          requester_id: truth.emp.id,
          status: 'Menunggu',
          requested_at: now,
          notes: description,
        },
        ...db.approvals,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Transaksi Keuangan',
        `Mencatat ${txType} ${txNo} (${category}) untuk ${project.project_number} senilai Rp ${amount.toLocaleString('id-ID')}.`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, transaction: newTx });
  });

  // 2. Update Financial Transaction
  app.patch('/api/finance/transactions/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang berwenang mengubah transaksi keuangan.',
      });
      return;
    }

    const idx = db.financialTransactions.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Transaksi keuangan tidak ditemukan.' });
      return;
    }

    const existing = db.financialTransactions[idx];
    const body = req.body as {
      project_id?: string;
      category?: FinancialCategory;
      type?: 'Pemasukan' | 'Pengeluaran';
      date?: string;
      amount?: number;
      proof_ref?: string;
      proof_attachment_id?: string | null;
      description?: string;
    };

    const projectId = String(body.project_id ?? existing.project_id).trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait tidak valid.' });
      return;
    }

    const category = (body.category ?? existing.category) as FinancialCategory;
    if (!ALLOWED_FIN_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Kategori transaksi tidak valid.' });
      return;
    }

    const txType = body.type ?? existing.type;
    if (txType !== 'Pemasukan' && txType !== 'Pengeluaran') {
      res.status(400).json({ message: 'Jenis transaksi tidak valid.' });
      return;
    }

    const amount = body.amount !== undefined ? Math.round(Number(body.amount)) : existing.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ message: 'Nominal transaksi harus lebih dari 0.' });
      return;
    }

    const date = String(body.date ?? existing.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: 'Format tanggal transaksi tidak valid.' });
      return;
    }

    const description = String(body.description ?? existing.description).trim();
    if (!description) {
      res.status(400).json({ message: 'Keterangan transaksi wajib diisi.' });
      return;
    }

    let nextAttId = existing.proof_attachment_id;
    let nextProofRef = String(body.proof_ref ?? existing.proof_ref).trim();
    if (body.proof_attachment_id === null || body.proof_attachment_id === '') {
      nextAttId = undefined;
    } else if (body.proof_attachment_id && body.proof_attachment_id !== existing.proof_attachment_id) {
      const verifiedAtt = verifyFinanceProofAttachment(body.proof_attachment_id);
      if (!verifiedAtt) {
        res.status(400).json({ message: 'Lampiran bukti transaksi tidak valid.' });
        return;
      }
      nextAttId = verifiedAtt.id;
      nextProofRef = verifiedAtt.original_name;
    }

    const now = new Date().toISOString();
    const updated: FinancialTransaction = {
      ...existing,
      project_id: project.id,
      category,
      type: txType,
      date,
      amount,
      proof_ref: nextProofRef || '-',
      proof_attachment_id: nextAttId,
      description,
      updated_at: now,
    };

    db.financialTransactions[idx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembaruan Transaksi Keuangan',
        `Memperbarui ${updated.transaction_no} (${updated.category}, Rp ${updated.amount.toLocaleString('id-ID')}).`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, transaction: updated });
  });

  // 3. Verify / Reject Financial Transaction (Head Finance & Super Admin)
  app.post('/api/finance/transactions/:id/decide', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Finance atau Super Admin yang dapat memverifikasi atau menolak transaksi.',
      });
      return;
    }

    const idx = db.financialTransactions.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Transaksi keuangan tidak ditemukan.' });
      return;
    }

    const body = req.body as { decision?: 'Terverifikasi' | 'Ditolak'; note?: string };
    const decision = body.decision;
    if (decision !== 'Terverifikasi' && decision !== 'Ditolak') {
      res.status(400).json({ message: 'Keputusan verifikasi harus Terverifikasi atau Ditolak.' });
      return;
    }
    const note = String(body.note || '').trim();
    if (decision === 'Ditolak' && !note) {
      res.status(400).json({ message: 'Alasan penolakan transaksi wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    const target = db.financialTransactions[idx];
    const updated: FinancialTransaction = {
      ...target,
      status: decision,
      verified_by_id: truth.emp.id,
      verified_by_name: truth.emp.full_name,
      verified_at: now,
      decision_note: note || target.decision_note,
      updated_at: now,
    };

    db.financialTransactions[idx] = updated;
    db.approvals = db.approvals.map((a) =>
      a.entity_type === 'Finance' && a.entity_id === target.id
        ? {
            ...a,
            status: decision === 'Terverifikasi' ? 'Disetujui' : 'Ditolak',
            approver_id: truth.emp.id,
            decided_at: now,
            notes: note || a.notes,
          }
        : a
    );
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Verifikasi Keuangan',
        `${target.transaction_no} dinyatakan ${decision}${note ? ` (${note})` : ''}.`,
        target.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, transaction: updated });
  });

  // 4. Delete Financial Transaction (Head Finance & Super Admin)
  app.delete('/api/finance/transactions/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Finance atau Super Admin yang dapat menghapus transaksi keuangan.',
      });
      return;
    }

    const idx = db.financialTransactions.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Transaksi keuangan tidak ditemukan.' });
      return;
    }

    const target = db.financialTransactions[idx];
    db.financialTransactions = db.financialTransactions.filter((f) => f.id !== target.id);
    db.approvals = db.approvals.filter(
      (a) => !(a.entity_type === 'Finance' && a.entity_id === target.id)
    );
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Hapus Transaksi Keuangan',
        `Menghapus transaksi ${target.transaction_no} (${target.category}, Rp ${target.amount.toLocaleString('id-ID')}).`,
        target.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ ok: true, id: target.id, state: db });
  });

  // 5. Batch Import Financial Transactions (Excel / CSV parsed rows)
  app.post('/api/finance/transactions/import', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat mengimpor data keuangan.',
      });
      return;
    }

    const body = req.body as {
      rows?: Array<{
        transaction_no?: string;
        date?: string;
        project_id?: string;
        project_number?: string;
        type?: string;
        category?: string;
        amount?: number;
        proof_ref?: string;
        description?: string;
        status?: string;
      }>;
    };

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      res.status(400).json({ message: 'Tidak ada baris data transaksi yang dikirim untuk diimpor.' });
      return;
    }
    if (rows.length > 500) {
      res.status(400).json({ message: 'Maksimal 500 baris transaksi per batch impor.' });
      return;
    }

    const normSig = (v: unknown) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    const isMeaningfulProof = (v: string) => {
      const n = normSig(v);
      return Boolean(n && n !== '-' && !n.startsWith('impor-'));
    };
    const isValidIsoCalendar = (iso: string) => {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return false;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
      const dt = new Date(Date.UTC(y, mo - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    };

    // Build lookup indexes across ALL existing transactions (Manual, Kontrak, Gudang, Lapangan, Tagihan, Impor)
    const existingTxNoMap = new Map<string, FinancialTransaction>();
    const existingDescSigMap = new Map<string, FinancialTransaction>();
    const existingProofSigMap = new Map<string, FinancialTransaction>();
    for (const existingTx of db.financialTransactions) {
      const noKey = normSig(existingTx.transaction_no);
      if (noKey) existingTxNoMap.set(noKey, existingTx);

      const dSig = `${existingTx.project_id}|${existingTx.date}|${existingTx.type}|${Math.round(existingTx.amount)}|${normSig(existingTx.description)}`;
      if (!existingDescSigMap.has(dSig)) existingDescSigMap.set(dSig, existingTx);

      if (isMeaningfulProof(existingTx.proof_ref)) {
        const pSig = `${existingTx.project_id}|${existingTx.date}|${existingTx.type}|${Math.round(existingTx.amount)}|${normSig(existingTx.proof_ref)}`;
        if (!existingProofSigMap.has(pSig)) existingProofSigMap.set(pSig, existingTx);
      }
    }

    const seenBatchTxNo = new Set<string>();
    const seenBatchDescSig = new Set<string>();
    const seenBatchProofSig = new Set<string>();

    const activeProjects = db.projects.filter((p) => !p.is_deleted);
    const now = new Date().toISOString();
    const imported: FinancialTransaction[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const rowNum = i + 1;
      const projKey = String(r.project_id || r.project_number || '').trim().toLowerCase();
      const project = activeProjects.find(
        (p) =>
          p.id.toLowerCase() === projKey ||
          p.project_number.toLowerCase() === projKey ||
          p.name.toLowerCase() === projKey
      );
      if (!project) {
        res.status(400).json({
          message: `Baris #${rowNum}: Proyek "${r.project_number || r.project_id || '-'}" tidak ditemukan.`,
        });
        return;
      }

      const rawType = String(r.type || '').trim().toLowerCase();
      const txType: 'Pemasukan' | 'Pengeluaran' | null =
        rawType === 'pemasukan' || rawType === 'masuk' || rawType === 'income'
          ? 'Pemasukan'
          : rawType === 'pengeluaran' || rawType === 'keluar' || rawType === 'expense'
          ? 'Pengeluaran'
          : null;
      if (!txType) {
        res.status(400).json({
          message: `Baris #${rowNum}: Jenis transaksi harus "Pemasukan" atau "Pengeluaran".`,
        });
        return;
      }

      const rawCat = String(r.category || '').trim() as FinancialCategory;
      const category: FinancialCategory = ALLOWED_FIN_CATEGORIES.has(rawCat)
        ? rawCat
        : txType === 'Pemasukan'
        ? 'Pemasukan Proyek'
        : 'Pengeluaran Proyek';

      const amount = Math.round(Number(r.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ message: `Baris #${rowNum}: Nominal harus lebih dari 0.` });
        return;
      }

      const date = String(r.date || '').trim();
      if (!date || !isValidIsoCalendar(date)) {
        res.status(400).json({
          message: `Baris #${rowNum}: Tanggal wajib diisi dengan format kalender valid YYYY-MM-DD (${date || '-'}).`,
        });
        return;
      }

      const description = String(r.description || '').trim();
      if (!description) {
        res.status(400).json({ message: `Baris #${rowNum}: Keterangan transaksi wajib diisi.` });
        return;
      }

      const rawTxNo = normSig(r.transaction_no);
      if (rawTxNo) {
        const dupByNo = existingTxNoMap.get(rawTxNo);
        if (dupByNo) {
          res.status(409).json({
            message: `Baris #${rowNum} terdeteksi duplikat dengan transaksi ${dupByNo.transaction_no} (Sumber: ${dupByNo.source_module || 'Manual'}). Transaksi yang sudah tercatat tidak dapat diimpor ulang.`,
          });
          return;
        }
        if (seenBatchTxNo.has(rawTxNo)) {
          res.status(409).json({
            message: `Baris #${rowNum}: Duplikat No. Transaksi "${r.transaction_no}" ditemukan dalam batch impor yang sama.`,
          });
          return;
        }
        seenBatchTxNo.add(rawTxNo);
      }

      const descSig = `${project.id}|${date}|${txType}|${amount}|${normSig(description)}`;
      const dupByDesc = existingDescSigMap.get(descSig);
      if (dupByDesc) {
        res.status(409).json({
          message: `Baris #${rowNum} terdeteksi duplikat dengan transaksi ${dupByDesc.transaction_no} (Sumber: ${dupByDesc.source_module || 'Manual'}). Transaksi yang sudah tercatat otomatis dari modul lain tidak dapat diimpor ulang.`,
        });
        return;
      }
      if (seenBatchDescSig.has(descSig)) {
        res.status(409).json({
          message: `Baris #${rowNum}: Duplikat transaksi ditemukan dalam batch file impor yang sama.`,
        });
        return;
      }

      const proofRefVal = String(r.proof_ref || '').trim() || `Impor-${date}`;
      const proofSig = isMeaningfulProof(proofRefVal)
        ? `${project.id}|${date}|${txType}|${amount}|${normSig(proofRefVal)}`
        : '';
      if (proofSig) {
        const dupByProof = existingProofSigMap.get(proofSig);
        if (dupByProof) {
          res.status(409).json({
            message: `Baris #${rowNum} terdeteksi duplikat referensi bukti "${proofRefVal}" dengan transaksi ${dupByProof.transaction_no} (Sumber: ${dupByProof.source_module || 'Manual'}).`,
          });
          return;
        }
        if (seenBatchProofSig.has(proofSig)) {
          res.status(409).json({
            message: `Baris #${rowNum}: Duplikat referensi bukti "${proofRefVal}" dalam batch impor yang sama.`,
          });
          return;
        }
        seenBatchProofSig.add(proofSig);
      }
      seenBatchDescSig.add(descSig);

      const txNo = `TRX-IMP-${new Date().getFullYear()}-${String(db.financialTransactions.length + imported.length + 1001).padStart(4, '0')}`;
      const statusVal: FinancialTxStatus =
        truth.role === 'STAFF'
          ? 'Menunggu'
          : r.status === 'Menunggu'
          ? 'Menunggu'
          : 'Terverifikasi';

      imported.push({
        id: `fin-imp-${Date.now()}-${i}-${crypto.randomUUID().slice(0, 4)}`,
        project_id: project.id,
        transaction_no: txNo,
        date,
        category,
        type: txType,
        amount,
        status: statusVal,
        proof_ref: proofRefVal,
        source_module: 'Impor',
        description,
        created_by_id: truth.emp.id,
        verified_by_id: statusVal === 'Terverifikasi' ? truth.emp.id : undefined,
        verified_by_name: statusVal === 'Terverifikasi' ? truth.emp.full_name : undefined,
        verified_at: statusVal === 'Terverifikasi' ? now : undefined,
        updated_at: now,
      });
    }

    db.financialTransactions = [...imported.reverse(), ...db.financialTransactions];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Impor Data Keuangan',
        `Mengimpor ${imported.length} transaksi keuangan dari file CSV/Excel.`
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, importedCount: imported.length });
  });

  // 6. Create Finance Bill (Tagihan Supplier / Pembayaran Material / Biaya Operasional)
  app.post('/api/finance/bills', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat mencatat tagihan.',
      });
      return;
    }

    const body = req.body as {
      project_id?: string;
      category?: FinanceBillCategory;
      vendor_name?: string;
      bill_date?: string;
      due_date?: string;
      amount?: number;
      paid_amount?: number;
      proof_ref?: string;
      proof_attachment_id?: string;
      description?: string;
    };

    const projectId = String(body.project_id || '').trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait tagihan wajib dipilih.' });
      return;
    }

    const category = body.category as FinanceBillCategory;
    if (!ALLOWED_BILL_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Kategori tagihan tidak valid.' });
      return;
    }

    const vendorName = String(body.vendor_name || '').trim();
    if (!vendorName) {
      res.status(400).json({ message: 'Nama supplier / penerima pembayaran wajib diisi.' });
      return;
    }

    const billDate = String(body.bill_date || '').trim() || new Date().toISOString().slice(0, 10);
    const dueDate = String(body.due_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      res.status(400).json({ message: 'Tanggal tagihan dan tanggal jatuh tempo wajib diisi (YYYY-MM-DD).' });
      return;
    }

    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ message: 'Nominal tagihan harus lebih dari 0.' });
      return;
    }

    const paidAmount = Math.max(0, Math.round(Number(body.paid_amount || 0)));
    if (paidAmount > amount) {
      res.status(400).json({ message: 'Jumlah terbayar awal tidak boleh melebihi nominal tagihan.' });
      return;
    }

    const description = String(body.description || '').trim();
    if (!description) {
      res.status(400).json({ message: 'Keterangan tagihan wajib diisi.' });
      return;
    }

    let verifiedAtt: AttachmentRecord | null = null;
    if (body.proof_attachment_id) {
      verifiedAtt = verifyFinanceProofAttachment(body.proof_attachment_id);
      if (!verifiedAtt) {
        res.status(400).json({ message: 'Dokumen bukti tagihan tidak valid.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const existingBills = db.financeBills || [];
    const billId = `bill-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`;
    const billNo = `TGH-${new Date().getFullYear()}-${String(existingBills.length + 1).padStart(3, '0')}`;
    const status = computeNextBillStatus(amount, paidAmount, dueDate);

    const newBill: FinanceBill = {
      id: billId,
      bill_no: billNo,
      project_id: project.id,
      category,
      vendor_name: vendorName,
      bill_date: billDate,
      due_date: dueDate,
      amount,
      paid_amount: paidAmount,
      status,
      proof_ref: verifiedAtt?.original_name || String(body.proof_ref || '').trim() || '-',
      proof_attachment_id: verifiedAtt?.id,
      description,
      created_by_id: truth.emp.id,
      created_by_name: truth.emp.full_name,
      paid_at: status === 'Lunas' ? now : undefined,
      created_at: now,
      updated_at: now,
    };

    db.financeBills = [newBill, ...existingBills];

    // Record initial payment as verified expenditure if paidAmount > 0
    if (paidAmount > 0) {
      const finCategory: FinancialCategory =
        category === 'Pembayaran Material'
          ? 'Pengadaan Material'
          : category === 'Biaya Operasional Proyek'
          ? 'Biaya Operasional'
          : 'Tagihan Vendor';
      const txNo = `TRX-FIN-${new Date().getFullYear()}-${String(db.financialTransactions.length + 950).padStart(4, '0')}`;
      db.financialTransactions = [
        {
          id: `fin-bill-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          project_id: project.id,
          bill_id: billId,
          transaction_no: txNo,
          date: billDate,
          category: finCategory,
          type: 'Pengeluaran',
          amount: paidAmount,
          status: 'Terverifikasi',
          proof_ref: newBill.proof_ref || billNo,
          proof_attachment_id: newBill.proof_attachment_id,
          source_module: 'Tagihan',
          description: `Pembayaran ${billNo} (${vendorName}) — ${description}`,
          created_by_id: truth.emp.id,
          verified_by_id: truth.emp.id,
          verified_by_name: truth.emp.full_name,
          verified_at: now,
          updated_at: now,
        },
        ...db.financialTransactions,
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Tagihan & Pembayaran',
        `Mencatat tagihan ${billNo} (${vendorName}) senilai Rp ${amount.toLocaleString('id-ID')} untuk ${project.project_number}.`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: db, bill: newBill });
  });

  // 7. Update Finance Bill
  app.patch('/api/finance/bills/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat mengubah data tagihan.',
      });
      return;
    }

    const bills = db.financeBills || [];
    const idx = bills.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data tagihan tidak ditemukan.' });
      return;
    }

    const existing = bills[idx];
    const body = req.body as {
      project_id?: string;
      category?: FinanceBillCategory;
      vendor_name?: string;
      bill_date?: string;
      due_date?: string;
      amount?: number;
      proof_ref?: string;
      proof_attachment_id?: string | null;
      description?: string;
    };

    const projectId = String(body.project_id ?? existing.project_id).trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait tidak valid.' });
      return;
    }

    const category = (body.category ?? existing.category) as FinanceBillCategory;
    if (!ALLOWED_BILL_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Kategori tagihan tidak valid.' });
      return;
    }

    const vendorName = String(body.vendor_name ?? existing.vendor_name).trim();
    if (!vendorName) {
      res.status(400).json({ message: 'Nama supplier / vendor wajib diisi.' });
      return;
    }

    const billDate = String(body.bill_date ?? existing.bill_date).trim();
    const dueDate = String(body.due_date ?? existing.due_date).trim();
    const amount = body.amount !== undefined ? Math.round(Number(body.amount)) : existing.amount;
    if (!Number.isFinite(amount) || amount <= 0 || amount < existing.paid_amount) {
      res.status(400).json({
        message: `Nominal tagihan harus lebih dari 0 dan minimal sebesar jumlah yang sudah terbayar (Rp ${existing.paid_amount.toLocaleString('id-ID')}).`,
      });
      return;
    }

    const description = String(body.description ?? existing.description).trim();
    if (!description) {
      res.status(400).json({ message: 'Keterangan tagihan wajib diisi.' });
      return;
    }

    let nextAttId = existing.proof_attachment_id;
    let nextProofRef = String(body.proof_ref ?? existing.proof_ref ?? '').trim();
    if (body.proof_attachment_id === null || body.proof_attachment_id === '') {
      nextAttId = undefined;
    } else if (body.proof_attachment_id && body.proof_attachment_id !== existing.proof_attachment_id) {
      const verifiedAtt = verifyFinanceProofAttachment(body.proof_attachment_id);
      if (!verifiedAtt) {
        res.status(400).json({ message: 'Dokumen bukti tagihan tidak valid.' });
        return;
      }
      nextAttId = verifiedAtt.id;
      nextProofRef = verifiedAtt.original_name;
    }

    const nextStatus = computeNextBillStatus(amount, existing.paid_amount, dueDate);
    const now = new Date().toISOString();
    const updated: FinanceBill = {
      ...existing,
      project_id: project.id,
      category,
      vendor_name: vendorName,
      bill_date: billDate,
      due_date: dueDate,
      amount,
      status: nextStatus,
      proof_ref: nextProofRef || '-',
      proof_attachment_id: nextAttId,
      description,
      updated_at: now,
    };

    bills[idx] = updated;
    db.financeBills = bills;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembaruan Tagihan',
        `Memperbarui tagihan ${updated.bill_no} (${updated.vendor_name}).`,
        project.id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, bill: updated });
  });

  // 8. Pay Finance Bill (Creates verified Pengeluaran transaction synced to cashflow)
  app.post('/api/finance/bills/:id/pay', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Divisi Finance atau Super Admin yang dapat memproses pembayaran tagihan.',
      });
      return;
    }

    const bills = db.financeBills || [];
    const idx = bills.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Tagihan tidak ditemukan.' });
      return;
    }

    const existing = bills[idx];
    const remaining = Math.max(0, existing.amount - existing.paid_amount);
    if (remaining <= 0) {
      res.status(400).json({ message: 'Tagihan ini sudah berstatus Lunas.' });
      return;
    }

    const body = req.body as {
      pay_amount?: number;
      payment_date?: string;
      proof_ref?: string;
      proof_attachment_id?: string;
      note?: string;
    };

    const payAmount = Math.round(Number(body.pay_amount));
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      res.status(400).json({ message: 'Nominal pembayaran harus lebih dari 0.' });
      return;
    }
    if (payAmount > remaining) {
      res.status(400).json({
        message: `Nominal pembayaran (Rp ${payAmount.toLocaleString('id-ID')}) melebihi sisa tagihan (Rp ${remaining.toLocaleString('id-ID')}).`,
      });
      return;
    }

    const paymentDate = String(body.payment_date || '').trim() || new Date().toISOString().slice(0, 10);
    let verifiedAtt: AttachmentRecord | null = null;
    if (body.proof_attachment_id) {
      verifiedAtt = verifyFinanceProofAttachment(body.proof_attachment_id);
      if (!verifiedAtt) {
        res.status(400).json({ message: 'Bukti transfer pembayaran tidak valid.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const nextPaid = existing.paid_amount + payAmount;
    const nextStatus = computeNextBillStatus(existing.amount, nextPaid, existing.due_date);

    const updatedBill: FinanceBill = {
      ...existing,
      paid_amount: nextPaid,
      status: nextStatus,
      proof_attachment_id: verifiedAtt?.id || existing.proof_attachment_id,
      proof_ref: verifiedAtt?.original_name || String(body.proof_ref || '').trim() || existing.proof_ref,
      paid_at: nextStatus === 'Lunas' ? now : existing.paid_at,
      updated_at: now,
    };
    bills[idx] = updatedBill;
    db.financeBills = bills;

    const finCategory: FinancialCategory =
      existing.category === 'Pembayaran Material'
        ? 'Pengadaan Material'
        : existing.category === 'Biaya Operasional Proyek'
        ? 'Biaya Operasional'
        : 'Tagihan Vendor';
    const txNo = `TRX-FIN-${new Date().getFullYear()}-${String(db.financialTransactions.length + 950).padStart(4, '0')}`;
    const newTx: FinancialTransaction = {
      id: `fin-pay-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: existing.project_id,
      bill_id: existing.id,
      transaction_no: txNo,
      date: paymentDate,
      category: finCategory,
      type: 'Pengeluaran',
      amount: payAmount,
      status: 'Terverifikasi',
      proof_ref: verifiedAtt?.original_name || String(body.proof_ref || '').trim() || `Bukti-${existing.bill_no}`,
      proof_attachment_id: verifiedAtt?.id || existing.proof_attachment_id,
      source_module: 'Tagihan',
      description: `Pembayaran ${existing.bill_no} (${existing.vendor_name})${body.note ? ` — ${String(body.note).trim()}` : ''}`,
      created_by_id: truth.emp.id,
      verified_by_id: truth.emp.id,
      verified_by_name: truth.emp.full_name,
      verified_at: now,
      updated_at: now,
    };

    db.financialTransactions = [newTx, ...db.financialTransactions];
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembayaran Tagihan',
        `Membayar tagihan ${existing.bill_no} (${existing.vendor_name}) sebesar Rp ${payAmount.toLocaleString('id-ID')} — Status kini ${nextStatus}.`,
        existing.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ state: db, bill: updatedBill, transaction: newTx });
  });

  // 9. Delete Finance Bill (Head Finance & Super Admin)
  app.delete('/api/finance/bills/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveFinanceActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Finance atau Super Admin yang dapat menghapus tagihan.',
      });
      return;
    }

    const bills = db.financeBills || [];
    const target = bills.find((b) => b.id === req.params.id);
    if (!target) {
      res.status(404).json({ message: 'Tagihan tidak ditemukan.' });
      return;
    }

    db.financeBills = bills.filter((b) => b.id !== target.id);
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Hapus Tagihan',
        `Menghapus tagihan ${target.bill_no} (${target.vendor_name}).`,
        target.project_id
      ),
      ...db.activityLogs,
    ];

    saveOperationalDb(db);
    res.json({ ok: true, id: target.id, state: db });
  });

  // ============================================================================
  // DASHBOARD TEKNIK REPORTS & REALISASI INDEKS NILAI PROGRES TEKNIK
  // ============================================================================

  const resolveTeknikActorTruth = (db: PMSState, actor: ActorContext) => {
    const truth = resolveActorDbTruth(db, actor);
    if (!truth || !hasTeknikModuleAccess(truth.role, truth.division)) return null;
    return truth;
  };

  // Strict RBAC middleware for ALL /api/teknik/* endpoints
  app.use('/api/teknik', (req: Request, res: Response, next: NextFunction) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Modul Teknik hanya dapat diakses oleh Head Teknik, Staff Teknik, dan Super Admin.',
      });
      return;
    }
    next();
  });

  app.get('/api/teknik/overview', (_req: Request, res: Response) => {
    const db = ensureOperationalDb();
    res.json({
      workItems: db.workItems,
      teknikEvaluations: db.teknikEvaluations || [],
      teknikConstraints: db.teknikConstraints || [],
      teknikChanges: db.teknikChanges || [],
      teknikCompletions: db.teknikCompletions || [],
      teknikProgressAssessments: db.teknikProgressAssessments || [],
    });
  });

  app.get('/api/teknik/work-items', (_req: Request, res: Response) => {
    const db = ensureOperationalDb();
    res.json({ workItems: db.workItems });
  });

  app.post('/api/teknik/work-items', (req: Request, res: Response) => {
    const actor = getActor(req)!;
    const db = ensureOperationalDb();
    const body = req.body as Partial<WorkItem>;
    const projectId = String(body.project_id || '').trim();
    const title = String(body.title || '').trim();
    const project = db.projects.find((p) => p.id === projectId && !p.is_deleted);
    if (!project || !title) {
      res.status(400).json({ message: 'Proyek terkait dan nama pekerjaan wajib diisi.' });
      return;
    }
    const created: WorkItem = {
      id: `wrk-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      project_id: project.id,
      budget_id: String(body.budget_id || '').trim(),
      division_id: 'div-teknik',
      title,
      pic_employee_id: String(body.pic_employee_id || actor.employeeId).trim(),
      start_date: String(body.start_date || new Date().toISOString().slice(0, 10)),
      due_date: String(body.due_date || new Date().toISOString().slice(0, 10)),
      weight_percent: Number(body.weight_percent ?? 10),
      daily_progress: Number(body.daily_progress ?? 0),
      weekly_progress: Number(body.weekly_progress ?? 0),
      monthly_progress: Number(body.monthly_progress ?? 0),
      overall_progress: Math.max(0, Math.min(100, Number(body.overall_progress ?? 0))),
      status: body.status || 'Dikerjakan',
      constraints: String(body.constraints || '-'),
      follow_up: String(body.follow_up || '-'),
      field_photo_url: String(body.field_photo_url || ''),
      updated_at: new Date().toISOString(),
    };
    db.workItems = [created, ...db.workItems];
    db.activityLogs = [
      makeOperationalLog(db, actor, 'Pekerjaan Teknik', `Menambahkan pekerjaan: ${created.title}`, created.project_id),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(201).json({ state: db, workItem: created });
  });

  app.put('/api/teknik/work-items/:id', (req: Request, res: Response) => {
    const actor = getActor(req)!;
    const db = ensureOperationalDb();
    const idx = db.workItems.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data pekerjaan teknik tidak ditemukan.' });
      return;
    }
    const prev = db.workItems[idx];
    const body = req.body as Partial<WorkItem>;
    const updated: WorkItem = {
      ...prev,
      project_id: body.project_id ? String(body.project_id).trim() : prev.project_id,
      budget_id: body.budget_id !== undefined ? String(body.budget_id).trim() : prev.budget_id,
      title: body.title ? String(body.title).trim() : prev.title,
      pic_employee_id: body.pic_employee_id ? String(body.pic_employee_id).trim() : prev.pic_employee_id,
      start_date: body.start_date ? String(body.start_date).trim() : prev.start_date,
      due_date: body.due_date ? String(body.due_date).trim() : prev.due_date,
      weight_percent: body.weight_percent !== undefined ? Number(body.weight_percent) : prev.weight_percent,
      daily_progress: body.daily_progress !== undefined ? Number(body.daily_progress) : prev.daily_progress,
      weekly_progress: body.weekly_progress !== undefined ? Number(body.weekly_progress) : prev.weekly_progress,
      monthly_progress: body.monthly_progress !== undefined ? Number(body.monthly_progress) : prev.monthly_progress,
      overall_progress:
        body.overall_progress !== undefined
          ? Math.max(0, Math.min(100, Number(body.overall_progress)))
          : prev.overall_progress,
      status: body.status ?? prev.status,
      constraints: body.constraints !== undefined ? String(body.constraints) : prev.constraints,
      follow_up: body.follow_up !== undefined ? String(body.follow_up) : prev.follow_up,
      field_photo_url:
        body.field_photo_url !== undefined ? String(body.field_photo_url) : prev.field_photo_url,
      id: prev.id,
      division_id: 'div-teknik',
      updated_at: new Date().toISOString(),
    };
    db.workItems[idx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Progres Pekerjaan',
        `Memperbarui "${updated.title}" menjadi ${updated.overall_progress}% (${updated.status})`,
        updated.project_id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.json({ state: db, workItem: updated });
  });

  app.post('/api/teknik/work-items/:id/delete', (req: Request, res: Response) => {
    const actor = getActor(req)!;
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor)!;
    const idx = db.workItems.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data pekerjaan teknik tidak ditemukan.' });
      return;
    }
    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan pengarsipan wajib diisi.' });
      return;
    }
    const prev = db.workItems[idx];
    db.workItems[idx] = {
      ...prev,
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_id: truth.emp.id,
      deleted_by_name: truth.emp.full_name,
      delete_reason: reason,
    };
    saveOperationalDb(db);
    res.json({ state: db, workItem: db.workItems[idx] });
  });

  app.post('/api/teknik/work-items/:id/restore', (req: Request, res: Response) => {
    const actor = getActor(req)!;
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor)!;
    if (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD') {
      res.status(403).json({ message: 'Hanya Head Teknik atau Super Admin yang dapat memulihkan pekerjaan.' });
      return;
    }
    const idx = db.workItems.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Data pekerjaan teknik tidak ditemukan.' });
      return;
    }
    const prev = db.workItems[idx];
    db.workItems[idx] = {
      ...prev,
      is_deleted: false,
      deleted_at: undefined,
      deleted_by_id: undefined,
      deleted_by_name: undefined,
      delete_reason: undefined,
    };
    saveOperationalDb(db);
    res.json({ state: db, workItem: db.workItems[idx] });
  });

  const isIsoDateValid = (iso: string): boolean => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  };

  const isValidPeriodMonth = (val: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(val);

  const verifyTeknikAttachments = (ids: string[] | undefined): string[] | null => {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const attDb = readJson<AttachmentRecord[]>(DB_FILE, []);
    const validIds: string[] = [];
    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      const found = attDb.find((a) => a.id === id && a.status !== 'Diarsipkan');
      if (!found) return null;
      validIds.push(found.id);
    }
    return validIds;
  };

  const ALLOWED_CONFORMANCE = new Set<TeknikConformanceStatus>([
    'Sesuai',
    'Perlu Perbaikan',
    'Tidak Sesuai',
  ]);
  const ALLOWED_FOLLOWUP_STATUS = new Set<TeknikFollowUpStatus>([
    'Terbuka',
    'Dalam Penanganan',
    'Selesai',
  ]);
  const ALLOWED_CHANGE_CATEGORIES = new Set<TeknikChangeReport['change_category']>([
    'Lingkup Pekerjaan',
    'Volume Pekerjaan',
    'Kebutuhan Material',
    'Spesifikasi Teknis',
  ]);
  const ALLOWED_COMPLETION_RESULTS = new Set<TeknikCompletionInspectionResult>([
    'Lulus Uji & Sesuai',
    'Lulus Bersyarat',
    'Perlu Perbaikan',
  ]);
  const ALLOWED_COMPLETION_STATUS = new Set<TeknikCompletionStatus>([
    'Draft',
    'Menunggu Verifikasi',
    'Selesai',
  ]);

  // 1. Save (Create/Update) Laporan Evaluasi Teknis
  app.post('/api/teknik/evaluations', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik atau Super Admin yang dapat mengelola Laporan Evaluasi Teknis.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      evaluation_date?: string;
      work_package?: string;
      drawing_spec_compliance?: TeknikConformanceStatus;
      non_conformance_findings?: string;
      volume_spec_changes?: string;
      recommendation?: string;
      follow_up_action?: string;
      status?: TeknikFollowUpStatus;
      attachment_ids?: string[];
    };

    const project = db.projects.find((p) => p.id === String(body.project_id || '').trim() && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }
    const evaluationDate = String(body.evaluation_date || '').trim();
    if (!isIsoDateValid(evaluationDate)) {
      res.status(400).json({ message: 'Tanggal evaluasi teknis harus menggunakan format tanggal yang valid.' });
      return;
    }
    const workPackage = String(body.work_package || '').trim();
    if (!workPackage) {
      res.status(400).json({ message: 'Paket / item pekerjaan yang dievaluasi wajib diisi.' });
      return;
    }
    const compliance = body.drawing_spec_compliance as TeknikConformanceStatus;
    if (!ALLOWED_CONFORMANCE.has(compliance)) {
      res.status(400).json({ message: 'Status kesesuaian gambar kerja & spesifikasi tidak valid.' });
      return;
    }
    const status = body.status as TeknikFollowUpStatus;
    if (!ALLOWED_FOLLOWUP_STATUS.has(status)) {
      res.status(400).json({ message: 'Status tindak lanjut evaluasi tidak valid.' });
      return;
    }
    const attachmentIds = verifyTeknikAttachments(body.attachment_ids);
    if (attachmentIds === null) {
      res.status(400).json({ message: 'Terdapat ID lampiran evaluasi yang tidak valid.' });
      return;
    }

    const list = db.teknikEvaluations || [];
    const now = new Date().toISOString();
    const editId = String(body.id || '').trim();
    const existingIdx = editId ? list.findIndex((e) => e.id === editId) : -1;
    if (editId && existingIdx === -1) {
      res.status(404).json({ message: 'Data evaluasi teknis tidak ditemukan.' });
      return;
    }

    let saved: TeknikEvaluationReport;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      saved = {
        ...prev,
        project_id: project.id,
        evaluation_date: evaluationDate,
        period_month: evaluationDate.slice(0, 7),
        work_package: workPackage,
        drawing_spec_compliance: compliance,
        non_conformance_findings: String(body.non_conformance_findings || '').trim() || '-',
        volume_spec_changes: String(body.volume_spec_changes || '').trim() || '-',
        recommendation: String(body.recommendation || '').trim() || '-',
        follow_up_action: String(body.follow_up_action || '').trim() || '-',
        status,
        evaluator_id: truth.emp.id,
        evaluator_name: truth.emp.full_name,
        attachment_ids: body.attachment_ids !== undefined ? attachmentIds : prev.attachment_ids,
        updated_at: now,
      };
      list[existingIdx] = saved;
    } else {
      const seq = list.length + 1;
      saved = {
        id: `teval-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        eval_no: `EVL-TEK-${evaluationDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
        project_id: project.id,
        evaluation_date: evaluationDate,
        period_month: evaluationDate.slice(0, 7),
        work_package: workPackage,
        drawing_spec_compliance: compliance,
        non_conformance_findings: String(body.non_conformance_findings || '').trim() || '-',
        volume_spec_changes: String(body.volume_spec_changes || '').trim() || '-',
        recommendation: String(body.recommendation || '').trim() || '-',
        follow_up_action: String(body.follow_up_action || '').trim() || '-',
        status,
        evaluator_id: truth.emp.id,
        evaluator_name: truth.emp.full_name,
        attachment_ids: attachmentIds,
        created_at: now,
        updated_at: now,
      };
      list.unshift(saved);
    }

    db.teknikEvaluations = list;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Evaluasi Teknis',
        `${existingIdx >= 0 ? 'Memperbarui' : 'Mencatat'} evaluasi teknis ${saved.eval_no} (${project.project_number}: ${saved.work_package}) — ${saved.drawing_spec_compliance} (${saved.status}).`,
        project.id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(existingIdx >= 0 ? 200 : 201).json({ state: db, evaluation: saved });
  });

  // 2. Save (Create/Update) Laporan Kendala Teknis & Tindak Lanjut
  app.post('/api/teknik/constraints', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik atau Super Admin yang dapat mengelola Kendala Teknis.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      source_type?: 'Lapangan' | 'WorkItem' | 'Teknik';
      source_ref_id?: string;
      reported_date?: string;
      reported_by_name?: string;
      work_area?: string;
      problem_description?: string;
      technical_analysis?: string;
      follow_up_action?: string;
      pic_name?: string;
      target_resolution_date?: string;
      status?: TeknikFollowUpStatus;
    };

    const project = db.projects.find((p) => p.id === String(body.project_id || '').trim() && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }
    const reportedDate = String(body.reported_date || '').trim();
    if (!isIsoDateValid(reportedDate)) {
      res.status(400).json({ message: 'Tanggal laporan kendala harus valid.' });
      return;
    }
    const targetResDate = String(body.target_resolution_date || '').trim();
    if (targetResDate && !isIsoDateValid(targetResDate)) {
      res.status(400).json({ message: 'Tanggal target penyelesaian tidak valid.' });
      return;
    }
    const workArea = String(body.work_area || '').trim();
    const problem = String(body.problem_description || '').trim();
    const followUp = String(body.follow_up_action || '').trim();
    const picName = String(body.pic_name || '').trim() || truth.emp.full_name;
    if (!workArea || !problem || !followUp) {
      res.status(400).json({ message: 'Area pekerjaan, uraian kendala, dan rencana tindak lanjut wajib diisi.' });
      return;
    }
    const status = body.status as TeknikFollowUpStatus;
    if (!ALLOWED_FOLLOWUP_STATUS.has(status)) {
      res.status(400).json({ message: 'Status penyelesaian kendala tidak valid.' });
      return;
    }
    const sourceType: TeknikConstraintRecord['source_type'] =
      body.source_type === 'Lapangan' || body.source_type === 'WorkItem' ? body.source_type : 'Teknik';

    const list = db.teknikConstraints || [];
    const now = new Date().toISOString();
    const editId = String(body.id || '').trim();
    const sourceRefId = String(body.source_ref_id || '').trim() || undefined;
    let existingIdx = editId ? list.findIndex((c) => c.id === editId) : -1;
    if (existingIdx === -1 && sourceRefId) {
      existingIdx = list.findIndex((c) => c.source_ref_id === sourceRefId && c.project_id === project.id);
    }
    if (editId && existingIdx === -1) {
      res.status(404).json({ message: 'Data kendala teknis tidak ditemukan.' });
      return;
    }

    const histEntry = {
      timestamp: now,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      status,
      note: followUp,
    };

    let saved: TeknikConstraintRecord;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      saved = {
        ...prev,
        project_id: project.id,
        work_area: workArea,
        problem_description: problem,
        technical_analysis: String(body.technical_analysis || '').trim() || prev.technical_analysis || '-',
        follow_up_action: followUp,
        pic_name: picName,
        target_resolution_date: targetResDate || undefined,
        status,
        resolved_at: status === 'Selesai' ? prev.resolved_at || now : undefined,
        updated_by_id: truth.emp.id,
        updated_by_name: truth.emp.full_name,
        history: [...(prev.history || []), histEntry],
        updated_at: now,
      };
      list[existingIdx] = saved;
    } else {
      const seq = list.length + 1;
      saved = {
        id: `tcon-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        issue_no: `KND-TEK-${reportedDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
        project_id: project.id,
        source_type: sourceType,
        source_ref_id: sourceRefId,
        reported_date: reportedDate,
        reported_by_name: String(body.reported_by_name || '').trim() || truth.emp.full_name,
        work_area: workArea,
        problem_description: problem,
        technical_analysis: String(body.technical_analysis || '').trim() || '-',
        follow_up_action: followUp,
        pic_name: picName,
        target_resolution_date: targetResDate || undefined,
        status,
        resolved_at: status === 'Selesai' ? now : undefined,
        updated_by_id: truth.emp.id,
        updated_by_name: truth.emp.full_name,
        history: [histEntry],
        created_at: now,
        updated_at: now,
      };
      list.unshift(saved);
    }

    db.teknikConstraints = list;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Kendala Teknis',
        `Memproses kendala teknis ${saved.issue_no} (${project.project_number}) menjadi status ${saved.status}.`,
        project.id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(existingIdx >= 0 ? 200 : 201).json({ state: db, constraint: saved });
  });

  // 3. Save (Create/Update) Laporan Perubahan Pekerjaan
  app.post('/api/teknik/changes', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik atau Super Admin yang dapat mencatat Perubahan Pekerjaan.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      change_date?: string;
      change_category?: TeknikChangeReport['change_category'];
      scope_change?: string;
      volume_material_change?: string;
      reason?: string;
      technical_notes?: string;
      attachment_ids?: string[];
    };

    const project = db.projects.find((p) => p.id === String(body.project_id || '').trim() && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }
    const changeDate = String(body.change_date || '').trim();
    if (!isIsoDateValid(changeDate)) {
      res.status(400).json({ message: 'Tanggal usulan perubahan harus valid.' });
      return;
    }
    const category = body.change_category as TeknikChangeReport['change_category'];
    if (!ALLOWED_CHANGE_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Kategori perubahan pekerjaan tidak valid.' });
      return;
    }
    const scopeChange = String(body.scope_change || '').trim();
    const volumeChange = String(body.volume_material_change || '').trim();
    const reason = String(body.reason || '').trim();
    if (!scopeChange || !volumeChange || !reason) {
      res.status(400).json({ message: 'Perubahan lingkup, volume/material, dan alasan perubahan wajib diisi.' });
      return;
    }
    const attachmentIds = verifyTeknikAttachments(body.attachment_ids);
    if (attachmentIds === null) {
      res.status(400).json({ message: 'Lampiran dokumen perubahan tidak valid.' });
      return;
    }

    const list = db.teknikChanges || [];
    const now = new Date().toISOString();
    const editId = String(body.id || '').trim();
    const existingIdx = editId ? list.findIndex((c) => c.id === editId) : -1;
    if (editId && existingIdx === -1) {
      res.status(404).json({ message: 'Data perubahan pekerjaan tidak ditemukan.' });
      return;
    }

    let saved: TeknikChangeReport;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      if (prev.status === 'Disetujui') {
        res.status(400).json({ message: 'Perubahan pekerjaan yang sudah Disetujui tidak dapat diubah.' });
        return;
      }
      saved = {
        ...prev,
        project_id: project.id,
        change_date: changeDate,
        period_month: changeDate.slice(0, 7),
        change_category: category,
        scope_change: scopeChange,
        volume_material_change: volumeChange,
        reason,
        technical_notes: String(body.technical_notes || '').trim() || '-',
        status: 'Menunggu Pemeriksaan',
        attachment_ids: body.attachment_ids !== undefined ? attachmentIds : prev.attachment_ids,
        updated_at: now,
      };
      list[existingIdx] = saved;
    } else {
      const seq = list.length + 1;
      saved = {
        id: `tchg-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        change_no: `PRB-TEK-${changeDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
        project_id: project.id,
        change_date: changeDate,
        period_month: changeDate.slice(0, 7),
        change_category: category,
        scope_change: scopeChange,
        volume_material_change: volumeChange,
        reason,
        technical_notes: String(body.technical_notes || '').trim() || '-',
        status: 'Menunggu Pemeriksaan',
        requested_by_id: truth.emp.id,
        requested_by_name: truth.emp.full_name,
        attachment_ids: attachmentIds,
        created_at: now,
        updated_at: now,
      };
      list.unshift(saved);
    }

    db.teknikChanges = list;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Perubahan Pekerjaan',
        `${existingIdx >= 0 ? 'Memperbarui' : 'Mengajukan'} laporan perubahan pekerjaan ${saved.change_no} (${project.project_number}).`,
        project.id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(existingIdx >= 0 ? 200 : 201).json({ state: db, change: saved });
  });

  // 4. Decide Laporan Perubahan Pekerjaan (Head Teknik / Super Admin)
  app.post('/api/teknik/changes/:id/decide', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Teknik atau Super Admin yang berwenang memutuskan perubahan pekerjaan.',
      });
      return;
    }

    const list = db.teknikChanges || [];
    const idx = list.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Laporan perubahan pekerjaan tidak ditemukan.' });
      return;
    }

    const body = req.body as {
      decision?: Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>;
      review_note?: string;
    };
    const decision = body.decision;
    if (!decision || !['Disetujui', 'Revisi', 'Ditolak'].includes(decision)) {
      res.status(400).json({ message: 'Keputusan pemeriksaan harus Disetujui, Revisi, atau Ditolak.' });
      return;
    }
    const reviewNote = String(body.review_note || '').trim();
    if (!reviewNote) {
      res.status(400).json({ message: 'Catatan pemeriksaan Head Teknik wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    const updated: TeknikChangeReport = {
      ...list[idx],
      status: decision,
      reviewer_id: truth.emp.id,
      reviewer_name: truth.emp.full_name,
      reviewed_at: now,
      review_note: reviewNote,
      updated_at: now,
    };
    list[idx] = updated;
    db.teknikChanges = list;

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Persetujuan Perubahan Pekerjaan',
        `Memutuskan perubahan ${updated.change_no}: ${decision} — ${reviewNote}`,
        updated.project_id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.json({ state: db, change: updated });
  });

  // 5. Save (Create/Update) Laporan Penyelesaian Teknis
  app.post('/api/teknik/completions', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik atau Super Admin yang dapat mencatat Penyelesaian Teknis.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      inspection_date?: string;
      completed_work_summary?: string;
      inspection_result?: TeknikCompletionInspectionResult;
      defects_and_notes?: string;
      follow_up_action?: string;
      status?: TeknikCompletionStatus;
      attachment_ids?: string[];
    };

    const project = db.projects.find((p) => p.id === String(body.project_id || '').trim() && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }
    const inspectionDate = String(body.inspection_date || '').trim();
    if (!isIsoDateValid(inspectionDate)) {
      res.status(400).json({ message: 'Tanggal pemeriksaan penyelesaian harus valid.' });
      return;
    }
    const summary = String(body.completed_work_summary || '').trim();
    if (!summary) {
      res.status(400).json({ message: 'Rekap pekerjaan yang telah selesai wajib diisi.' });
      return;
    }
    const inspResult = body.inspection_result as TeknikCompletionInspectionResult;
    if (!ALLOWED_COMPLETION_RESULTS.has(inspResult)) {
      res.status(400).json({ message: 'Hasil pemeriksaan kesesuaian pekerjaan tidak valid.' });
      return;
    }
    let nextStatus = (body.status || 'Menunggu Verifikasi') as TeknikCompletionStatus;
    if (!ALLOWED_COMPLETION_STATUS.has(nextStatus)) {
      res.status(400).json({ message: 'Status laporan penyelesaian teknis tidak valid.' });
      return;
    }
    if (nextStatus === 'Selesai' && truth.role === 'STAFF') {
      nextStatus = 'Menunggu Verifikasi';
    }
    const attachmentIds = verifyTeknikAttachments(body.attachment_ids);
    if (attachmentIds === null) {
      res.status(400).json({ message: 'Lampiran dokumentasi hasil akhir tidak valid.' });
      return;
    }

    const list = db.teknikCompletions || [];
    const now = new Date().toISOString();
    const editId = String(body.id || '').trim();
    const existingIdx = editId ? list.findIndex((c) => c.id === editId) : -1;
    if (editId && existingIdx === -1) {
      res.status(404).json({ message: 'Laporan penyelesaian teknis tidak ditemukan.' });
      return;
    }

    let saved: TeknikCompletionReport;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      saved = {
        ...prev,
        project_id: project.id,
        inspection_date: inspectionDate,
        period_month: inspectionDate.slice(0, 7),
        completed_work_summary: summary,
        inspection_result: inspResult,
        defects_and_notes: String(body.defects_and_notes || '').trim() || '-',
        follow_up_action: String(body.follow_up_action || '').trim() || '-',
        status: nextStatus,
        verified_by_id: nextStatus === 'Selesai' ? truth.emp.id : prev.verified_by_id,
        verified_by_name: nextStatus === 'Selesai' ? truth.emp.full_name : prev.verified_by_name,
        verified_at: nextStatus === 'Selesai' ? prev.verified_at || now : prev.verified_at,
        attachment_ids: body.attachment_ids !== undefined ? attachmentIds : prev.attachment_ids,
        updated_at: now,
      };
      list[existingIdx] = saved;
    } else {
      const seq = list.length + 1;
      saved = {
        id: `tcmp-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        completion_no: `SLS-TEK-${inspectionDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
        project_id: project.id,
        inspection_date: inspectionDate,
        period_month: inspectionDate.slice(0, 7),
        completed_work_summary: summary,
        inspection_result: inspResult,
        defects_and_notes: String(body.defects_and_notes || '').trim() || '-',
        follow_up_action: String(body.follow_up_action || '').trim() || '-',
        status: nextStatus,
        inspector_id: truth.emp.id,
        inspector_name: truth.emp.full_name,
        verified_by_id: nextStatus === 'Selesai' ? truth.emp.id : undefined,
        verified_by_name: nextStatus === 'Selesai' ? truth.emp.full_name : undefined,
        verified_at: nextStatus === 'Selesai' ? now : undefined,
        attachment_ids: attachmentIds,
        created_at: now,
        updated_at: now,
      };
      list.unshift(saved);
    }

    db.teknikCompletions = list;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Penyelesaian Teknis',
        `${existingIdx >= 0 ? 'Memperbarui' : 'Mencatat'} laporan penyelesaian teknis ${saved.completion_no} (${project.project_number}) — ${saved.inspection_result}.`,
        project.id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(existingIdx >= 0 ? 200 : 201).json({ state: db, completion: saved });
  });

  // 6. Verify Laporan Penyelesaian Teknis (Head Teknik / Super Admin)
  app.post('/api/teknik/completions/:id/verify', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth || (truth.role !== 'SUPER_ADMIN' && truth.role !== 'HEAD')) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Head Teknik atau Super Admin yang berwenang memverifikasi penyelesaian teknis.',
      });
      return;
    }

    const list = db.teknikCompletions || [];
    const idx = list.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Laporan penyelesaian teknis tidak ditemukan.' });
      return;
    }

    const body = req.body as { follow_up_action?: string };
    const now = new Date().toISOString();
    const prev = list[idx];
    const updated: TeknikCompletionReport = {
      ...prev,
      status: 'Selesai',
      follow_up_action: String(body.follow_up_action || '').trim() || prev.follow_up_action,
      verified_by_id: truth.emp.id,
      verified_by_name: truth.emp.full_name,
      verified_at: now,
      updated_at: now,
    };
    list[idx] = updated;
    db.teknikCompletions = list;

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Verifikasi Penyelesaian Teknis',
        `Mengesahkan laporan penyelesaian teknis ${updated.completion_no} (${updated.inspection_result}).`,
        updated.project_id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.json({ state: db, completion: updated });
  });

  // 7. Save Realisasi Indeks Nilai Progres Teknik (Terpisah dari Progres Fisik Lapangan)
  app.post('/api/teknik/progress-assessments', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveTeknikActorTruth(db, actor);
    if (!truth) {
      res.status(403).json({
        message: 'Akses ditolak: Hanya Tim Teknik atau Super Admin yang dapat menilai Indeks Progres Teknik.',
      });
      return;
    }

    const body = req.body as {
      id?: string;
      project_id?: string;
      period_month?: string;
      evaluation_date?: string;
      target_progress_percent?: number;
      teknik_progress_percent?: number;
      quality_score?: number;
      notes?: string;
    };

    const project = db.projects.find((p) => p.id === String(body.project_id || '').trim() && !p.is_deleted);
    if (!project) {
      res.status(400).json({ message: 'Proyek terkait wajib dipilih.' });
      return;
    }
    const evaluationDate = String(body.evaluation_date || '').trim();
    if (!isIsoDateValid(evaluationDate)) {
      res.status(400).json({ message: 'Tanggal evaluasi penilaian progres harus valid.' });
      return;
    }
    const periodMonth = String(body.period_month || '').trim() || evaluationDate.slice(0, 7);
    if (!isValidPeriodMonth(periodMonth)) {
      res.status(400).json({ message: 'Format periode bulan harus YYYY-MM.' });
      return;
    }

    const targetPct = Math.round(Number(body.target_progress_percent) * 100) / 100;
    const teknikPct = Math.round(Number(body.teknik_progress_percent) * 100) / 100;
    const qualityScore = Math.round(Number(body.quality_score) * 100) / 100;

    if (!Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) {
      res.status(400).json({ message: 'Target progres (%) harus bernilai antara 0 hingga 100.' });
      return;
    }
    if (!Number.isFinite(teknikPct) || teknikPct < 0 || teknikPct > 100) {
      res.status(400).json({ message: 'Nilai progres Teknik (%) harus bernilai antara 0 hingga 100.' });
      return;
    }
    if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
      res.status(400).json({ message: 'Skor mutu teknis harus bernilai antara 0 hingga 100.' });
      return;
    }

    const notes = String(body.notes || '').trim();
    if (!notes) {
      res.status(400).json({ message: 'Catatan penilaian progres Teknik wajib diisi.' });
      return;
    }

    // Pembanding Lapangan diambil read-only dari progres fisik proyek (tidak pernah diubah oleh penilaian Teknik)
    const fieldComparison = Math.round(Number(project.progress_percent ?? 0) * 100) / 100;
    const technicalIndex =
      targetPct > 0 ? Math.round((teknikPct / targetPct) * 100) / 100 : teknikPct > 0 ? 1 : 0;

    const list = db.teknikProgressAssessments || [];
    const now = new Date().toISOString();
    const editId = String(body.id || '').trim();
    const existingIdx = editId ? list.findIndex((a) => a.id === editId) : -1;
    if (editId && existingIdx === -1) {
      res.status(404).json({ message: 'Data penilaian indeks progres Teknik tidak ditemukan.' });
      return;
    }

    // Jika membuat entri baru pada proyek + periode yang sama, tolak agar riwayat periode konsisten (arahkan untuk Update)
    if (
      existingIdx === -1 &&
      list.some((a) => a.project_id === project.id && a.period_month === periodMonth)
    ) {
      res.status(409).json({
        message: `Penilaian untuk ${project.project_number} periode ${periodMonth} sudah tersedia. Gunakan aksi Update Nilai agar riwayat tercatat rapi.`,
      });
      return;
    }

    const histEntry = {
      id: `tph-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      timestamp: now,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      action: (existingIdx >= 0 ? 'Pembaruan Nilai' : 'Penilaian Awal') as
        | 'Penilaian Awal'
        | 'Pembaruan Nilai',
      target_progress_percent: targetPct,
      teknik_progress_percent: teknikPct,
      field_progress_comparison: fieldComparison,
      technical_index: technicalIndex,
      quality_score: qualityScore,
      note: notes,
    };

    let saved: TeknikProgressAssessment;
    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      saved = {
        ...prev,
        project_id: project.id,
        period_month: periodMonth,
        evaluation_date: evaluationDate,
        target_progress_percent: targetPct,
        teknik_progress_percent: teknikPct,
        field_progress_comparison: fieldComparison,
        technical_index: technicalIndex,
        quality_score: qualityScore,
        evaluator_id: truth.emp.id,
        evaluator_name: truth.emp.full_name,
        notes,
        history: [...(prev.history || []), histEntry],
        updated_at: now,
      };
      list[existingIdx] = saved;
    } else {
      const seq = list.length + 1;
      saved = {
        id: `tprg-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
        assessment_no: `IDX-TEK-${periodMonth.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
        project_id: project.id,
        period_month: periodMonth,
        evaluation_date: evaluationDate,
        target_progress_percent: targetPct,
        teknik_progress_percent: teknikPct,
        field_progress_comparison: fieldComparison,
        technical_index: technicalIndex,
        quality_score: qualityScore,
        evaluator_id: truth.emp.id,
        evaluator_name: truth.emp.full_name,
        notes,
        history: [histEntry],
        created_at: now,
        updated_at: now,
      };
      list.unshift(saved);
    }

    db.teknikProgressAssessments = list;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Indeks Progres Teknik',
        `Menyimpan penilaian ${saved.assessment_no} (${project.project_number}, ${periodMonth}): Target ${targetPct}%, Nilai Teknik ${teknikPct}%, Pembanding Lapangan ${fieldComparison}%, Indeks ${technicalIndex.toFixed(2)}.`,
        project.id
      ),
      ...db.activityLogs,
    ];
    saveOperationalDb(db);
    res.status(existingIdx >= 0 ? 200 : 201).json({ state: db, assessment: saved });
  });

  // ============================================================================
  // SURAT & DOKUMEN PERUSAHAAN (DOCUMENT HUB) SERVER-AUTHORITATIVE API
  // ============================================================================

  const DOC_PREFIX_MAP: Record<DocumentType, string> = {
    'Surat Jalan': 'SJ',
    'Surat Permintaan Material': 'SPM',
    'Surat Permintaan Barang': 'SPB',
    RAB: 'RAB',
    'Gambar Kerja': 'GK',
    'Spesifikasi Teknis': 'SPEK',
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
    'Surat Pemberitahuan': 'SP',
  };

  const resolveDocCategoryGroup = (docType: DocumentType): DocumentCategoryGroup => {
    switch (docType) {
      case 'Surat Jalan':
      case 'Surat Permintaan Material':
      case 'Surat Permintaan Barang':
        return 'Surat Operasional';
      case 'RAB':
      case 'Gambar Kerja':
      case 'Spesifikasi Teknis':
      case 'Dokumen Kontrak':
        return 'Dokumen Proyek';
      case 'Pengajuan Anggaran':
      case 'Persetujuan Pekerjaan':
      case 'Dokumen Persetujuan':
        return 'Surat Persetujuan';
      case 'BAST':
      case 'Berita Acara Pemeriksaan':
      case 'Berita Acara':
        return 'Berita Acara';
      case 'Laporan Progres':
      case 'Laporan Penyelesaian':
      case 'Laporan Pekerjaan':
        return 'Laporan Pekerjaan';
      case 'Surat Tugas':
      case 'Surat Pemberitahuan':
        return 'Surat Perusahaan';
    }
  };

  const DOC_INFORMATIONAL_TYPES = new Set<DocumentType>([
    'RAB',
    'Gambar Kerja',
    'Spesifikasi Teknis',
    'Laporan Progres',
    'Laporan Penyelesaian',
    'Laporan Pekerjaan',
    'Surat Pemberitahuan',
  ]);

  const computeDocSigHash = (nik: string, docNumber: string, revNo = 1): string => {
    const raw = `${nik}:${docNumber}:REV${revNo}:WAS2026`;
    return `SIG-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 10).toUpperCase()}`;
  };

  const generateUniqueDocNumber = (db: PMSState, docType: DocumentType, docDate: string): string => {
    const prefix = DOC_PREFIX_MAP[docType] || 'DOC';
    const d = docDate && /^\d{4}-\d{2}-\d{2}/.test(docDate) ? docDate : new Date().toISOString().slice(0, 10);
    const yyyy = d.slice(0, 4);
    const mm = d.slice(5, 7);
    const existingSet = new Set((db.documents || []).map((item) => item.doc_number.trim().toUpperCase()));
    let seq = (db.documents || []).length + 1;
    let candidate = '';
    do {
      candidate = `${prefix}/WAS/${yyyy}/${mm}/${String(seq).padStart(3, '0')}`;
      seq += 1;
    } while (existingSet.has(candidate.toUpperCase()));
    return candidate;
  };

  const isDocFinalLocked = (doc: InternalDocument): boolean => {
    return (
      Boolean(doc.is_final_locked) ||
      doc.status === 'Disetujui' ||
      doc.status === 'Selesai' ||
      doc.status === 'Diarsipkan'
    );
  };

  const canUserEditDoc = (
    truth: NonNullable<ReturnType<typeof resolveActorDbTruth>>,
    doc: InternalDocument
  ): boolean => {
    if (isDocFinalLocked(doc) || doc.status === 'Dibatalkan') return false;
    if (truth.role === 'SUPER_ADMIN') return true;
    if (truth.role === 'HEAD' && doc.division_id === truth.emp.division_id) return true;
    return (
      doc.creator_id === truth.emp.id &&
      (doc.status === 'Draft' || doc.status === 'Perlu Revisi' || doc.status === 'Ditolak')
    );
  };

  const canUserSubmitDoc = (
    truth: NonNullable<ReturnType<typeof resolveActorDbTruth>>,
    doc: InternalDocument
  ): boolean => {
    if (truth.role === 'SUPER_ADMIN') return true;
    if (doc.creator_id === truth.emp.id) return true;
    return truth.role === 'HEAD' && doc.division_id === truth.emp.division_id;
  };

  const canUserApproveDoc = (
    truth: NonNullable<ReturnType<typeof resolveActorDbTruth>>,
    doc: InternalDocument
  ): boolean => {
    if (truth.role === 'SUPER_ADMIN') return true;
    if (truth.role !== 'HEAD') return false;
    if (truth.division === 'DIREKSI') return true;
    if (
      truth.division === 'FINANCE' &&
      (doc.doc_type === 'Pengajuan Anggaran' ||
        doc.doc_type === 'Dokumen Persetujuan' ||
        doc.doc_type === 'RAB')
    ) {
      return true;
    }
    return doc.division_id === truth.emp.division_id;
  };

  const canUserReviseDoc = (
    truth: NonNullable<ReturnType<typeof resolveActorDbTruth>>,
    doc: InternalDocument
  ): boolean => {
    if (doc.status === 'Dibatalkan' || doc.status === 'Diarsipkan') return false;
    if (truth.role === 'SUPER_ADMIN') return true;
    if (truth.role === 'HEAD' && doc.division_id === truth.emp.division_id) return true;
    return doc.creator_id === truth.emp.id;
  };

  const canUserArchiveDoc = (
    truth: NonNullable<ReturnType<typeof resolveActorDbTruth>>,
    doc: InternalDocument
  ): boolean => {
    if (truth.role === 'SUPER_ADMIN') return true;
    if (truth.role !== 'HEAD') return false;
    return truth.division === 'DIREKSI' || doc.division_id === truth.emp.division_id;
  };

  app.post('/api/documents', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const body = req.body as Partial<InternalDocument> & {
      submit_mode?: 'draft' | 'submit' | 'complete';
      draft_attachment_entity_id?: string;
    };

    const docType = String(body.doc_type || '').trim() as DocumentType;
    if (!DOC_PREFIX_MAP[docType]) {
      res.status(400).json({ message: 'Jenis dokumen tidak valid.' });
      return;
    }
    const title = String(body.title || '').trim();
    const details = String(body.details || '').trim();
    if (!title || !details) {
      res.status(400).json({ message: 'Judul dan rincian isi dokumen wajib diisi.' });
      return;
    }

    const projectId = String(body.project_id || '').trim();
    const project = projectId ? db.projects.find((p) => p.id === projectId && !p.is_deleted) : undefined;
    if (projectId && !project) {
      res.status(400).json({ message: 'Proyek terkait tidak ditemukan.' });
      return;
    }

    const docDate = String(body.doc_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const customDocNo = String(body.doc_number || '').trim();
    if (customDocNo) {
      const duplicate = (db.documents || []).some(
        (d) => d.doc_number.trim().toUpperCase() === customDocNo.toUpperCase()
      );
      if (duplicate) {
        res.status(409).json({ message: `Nomor dokumen ${customDocNo} sudah digunakan.` });
        return;
      }
    }
    const docNumber = customDocNo || generateUniqueDocNumber(db, docType, docDate);

    const submitMode = body.submit_mode || (body.status === 'Diajukan' ? 'submit' : 'draft');
    let initialStatus: DocumentStatus = 'Draft';
    if (submitMode === 'submit') {
      initialStatus = DOC_INFORMATIONAL_TYPES.has(docType) ? 'Diajukan' : 'Menunggu Persetujuan';
    } else if (submitMode === 'complete') {
      if (!DOC_INFORMATIONAL_TYPES.has(docType) && truth.role === 'STAFF') {
        res.status(403).json({
          message: 'Dokumen yang membutuhkan pengesahan tidak dapat langsung diselesaikan tanpa persetujuan Head/Admin.',
        });
        return;
      }
      initialStatus = 'Selesai';
    }

    const now = new Date().toISOString();
    const roleObj = db.roles.find((r) => r.id === truth.emp.role_id);
    const roleLabel = roleObj?.name ?? truth.role;
    const newId = `doc-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;

    const newDoc: InternalDocument = {
      id: newId,
      doc_number: docNumber,
      doc_type: docType,
      category_group: resolveDocCategoryGroup(docType),
      doc_date: docDate,
      creator_id: truth.emp.id,
      creator_name: truth.emp.full_name,
      division_id: truth.emp.division_id,
      project_id: project ? project.id : '',
      title,
      details,
      items_summary: String(body.items_summary || '-').trim() || '-',
      attachment_name: String(body.attachment_name || '').trim() || '-',
      recipient_name: body.recipient_name ? String(body.recipient_name).trim() : undefined,
      reference_code: body.reference_code ? String(body.reference_code).trim() : undefined,
      amount_value: body.amount_value !== undefined ? Number(body.amount_value) : undefined,
      effective_date: body.effective_date ? String(body.effective_date).slice(0, 10) : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
      status: initialStatus,
      revision_no: 1,
      revisions: [],
      is_final_locked: initialStatus === 'Selesai',
      updated_at: now,
      updated_by_name: truth.emp.full_name,
      history: [
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action:
            submitMode === 'submit'
              ? 'Dibuat & Diajukan'
              : submitMode === 'complete'
              ? 'Dibuat & Diselesaikan'
              : 'Disimpan sebagai Draft',
          note: title,
        },
      ],
    };

    // Re-bind any draft attachments uploaded during creation modal to the real document id
    if (body.draft_attachment_entity_id && body.draft_attachment_entity_id.startsWith('doc-draft-')) {
      const attDb = readJson<AttachmentRecord[]>(DB_FILE, []);
      let attChanged = false;
      const updatedAtt = attDb.map((att) => {
        if (att.module_id === 'dokumen' && att.entity_id === body.draft_attachment_entity_id) {
          attChanged = true;
          return {
            ...att,
            entity_id: newId,
            entity_label: `${docNumber} — ${title}`,
          };
        }
        return att;
      });
      if (attChanged) {
        writeJson(DB_FILE, updatedAtt);
        const firstAtt = updatedAtt.find((a) => a.entity_id === newId);
        if (firstAtt && newDoc.attachment_name === '-') {
          newDoc.attachment_name = firstAtt.original_name;
        }
      }
    }

    db.documents = [newDoc, ...(db.documents || [])];

    if (initialStatus === 'Diajukan' || initialStatus === 'Menunggu Persetujuan') {
      const targetDivId =
        docType === 'Pengajuan Anggaran' || docType === 'Dokumen Persetujuan'
          ? db.divisions.find((d) => d.code === 'FINANCE')?.id || truth.emp.division_id
          : truth.emp.division_id;

      db.approvals = [
        {
          id: `apr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          entity_type: 'Document',
          entity_id: newId,
          reference_no: docNumber,
          title: `${docType}: ${title}`,
          division_id: targetDivId,
          requester_id: truth.emp.id,
          status: 'Menunggu',
          requested_at: now,
          notes: details.slice(0, 140),
        },
        ...(db.approvals || []),
      ];

      db.notifications = [
        makeOperationalNotification({
          type: 'Permintaan Baru',
          title: `Dokumen Baru ${docNumber}`,
          message: `${truth.emp.full_name} mengajukan ${docType}: ${title}.`,
          target_role: 'HEAD',
          target_division_id: targetDivId,
          project_id: project?.id,
          link_module: 'dokumen',
        }),
        ...(db.notifications || []),
      ];
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Surat & Dokumen',
        `${submitMode === 'submit' ? 'Mengajukan' : submitMode === 'complete' ? 'Menyelesaikan' : 'Membuat draft'} ${docNumber} — ${title}`,
        project?.id
      ),
      ...(db.activityLogs || []),
    ];

    saveOperationalDb(db);
    res.status(201).json({ state: sanitizeStateForActor(db, truth), document: newDoc });
  });

  app.put('/api/documents/:id', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const idx = (db.documents || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Dokumen tidak ditemukan.' });
      return;
    }
    const target = db.documents[idx];

    if (isDocFinalLocked(target) || target.status === 'Dibatalkan') {
      res.status(409).json({
        message:
          'Dokumen final tidak boleh diubah langsung tanpa proses revisi tercatat. Gunakan aksi Ajukan Revisi Resmi.',
      });
      return;
    }

    if (!canUserEditDoc(truth, target)) {
      res.status(403).json({ message: 'Anda tidak berwenang mengubah dokumen ini pada status saat ini.' });
      return;
    }

    const body = req.body as Partial<InternalDocument>;
    const title = body.title !== undefined ? String(body.title).trim() : target.title;
    const details = body.details !== undefined ? String(body.details).trim() : target.details;
    if (!title || !details) {
      res.status(400).json({ message: 'Judul dan rincian isi dokumen tidak boleh kosong.' });
      return;
    }

    const docType =
      body.doc_type && DOC_PREFIX_MAP[body.doc_type] ? body.doc_type : target.doc_type;
    const now = new Date().toISOString();
    const roleLabel = db.roles.find((r) => r.id === truth.emp.role_id)?.name ?? truth.role;

    const updated: InternalDocument = {
      ...target,
      doc_type: docType,
      category_group: resolveDocCategoryGroup(docType),
      doc_date: body.doc_date ? String(body.doc_date).slice(0, 10) : target.doc_date,
      project_id: body.project_id !== undefined ? String(body.project_id).trim() : target.project_id,
      title,
      details,
      items_summary:
        body.items_summary !== undefined ? String(body.items_summary).trim() || '-' : target.items_summary,
      attachment_name:
        body.attachment_name !== undefined
          ? String(body.attachment_name).trim() || '-'
          : target.attachment_name,
      recipient_name:
        body.recipient_name !== undefined ? String(body.recipient_name).trim() : target.recipient_name,
      reference_code:
        body.reference_code !== undefined ? String(body.reference_code).trim() : target.reference_code,
      amount_value:
        body.amount_value !== undefined ? Number(body.amount_value) : target.amount_value,
      effective_date:
        body.effective_date !== undefined
          ? String(body.effective_date).slice(0, 10)
          : target.effective_date,
      metadata: body.metadata !== undefined ? body.metadata : target.metadata,
      updated_at: now,
      updated_by_name: truth.emp.full_name,
      history: [
        ...(target.history || []),
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action: 'Perubahan Isi Dokumen',
          note: `Dokumen diperbarui oleh ${truth.emp.full_name}.`,
        },
      ],
    };

    db.documents[idx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pembaruan Dokumen',
        `Memperbarui ${updated.doc_number} — ${updated.title}`,
        updated.project_id || undefined
      ),
      ...(db.activityLogs || []),
    ];
    saveOperationalDb(db);
    res.json({ state: sanitizeStateForActor(db, truth), document: updated });
  });

  app.post('/api/documents/:id/advance', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const idx = (db.documents || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Dokumen tidak ditemukan.' });
      return;
    }
    const target = db.documents[idx];

    const body = req.body as {
      next_status?: DocumentStatus;
      note?: string;
      electronic_signature_data_url?: string;
    };
    const nextStatus = body.next_status;
    const note = String(body.note || '').trim();

    const VALID_STATUSES: DocumentStatus[] = [
      'Draft',
      'Diajukan',
      'Menunggu Persetujuan',
      'Diperiksa',
      'Diperiksa Head',
      'Disetujui',
      'Perlu Revisi',
      'Ditolak',
      'Selesai',
      'Diarsipkan',
      'Dibatalkan',
    ];
    if (!nextStatus || !VALID_STATUSES.includes(nextStatus)) {
      res.status(400).json({ message: 'Status dokumen tujuan tidak valid.' });
      return;
    }
    if (target.status === 'Dibatalkan' || target.status === 'Diarsipkan') {
      res.status(409).json({ message: `Dokumen berstatus "${target.status}" tidak dapat diproses lagi.` });
      return;
    }

    // RBAC checks per workflow transition
    if (nextStatus === 'Diajukan' || nextStatus === 'Menunggu Persetujuan') {
      if (!canUserSubmitDoc(truth, target)) {
        res.status(403).json({ message: 'Hanya pembuat dokumen, Head divisi, atau Super Admin yang dapat mengajukan dokumen ini.' });
        return;
      }
      if (isDocFinalLocked(target)) {
        res.status(409).json({ message: 'Dokumen final tidak dapat diajukan ulang tanpa proses revisi tercatat.' });
        return;
      }
    } else if (
      nextStatus === 'Diperiksa' ||
      nextStatus === 'Diperiksa Head' ||
      nextStatus === 'Disetujui' ||
      nextStatus === 'Perlu Revisi' ||
      nextStatus === 'Ditolak'
    ) {
      if (!canUserApproveDoc(truth, target)) {
        res.status(403).json({
          message: 'Hanya Head Divisi terkait, Direksi/Finance (untuk anggaran), atau Super Admin yang berwenang memeriksa/menyetujui dokumen ini.',
        });
        return;
      }
      if ((nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak') && !note) {
        res.status(400).json({ message: 'Catatan revisi atau alasan penolakan wajib diisi.' });
        return;
      }
    } else if (nextStatus === 'Selesai') {
      const canFinishInformational =
        DOC_INFORMATIONAL_TYPES.has(target.doc_type) &&
        (truth.role === 'SUPER_ADMIN' ||
          truth.role === 'HEAD' ||
          target.creator_id === truth.emp.id);
      if (!canFinishInformational && target.status !== 'Disetujui' && !canUserApproveDoc(truth, target)) {
        res.status(403).json({
          message: 'Dokumen harus disetujui terlebih dahulu atau diselesaikan oleh pihak berwenang.',
        });
        return;
      }
    } else if (nextStatus === 'Diarsipkan') {
      if (!canUserArchiveDoc(truth, target)) {
        res.status(403).json({ message: 'Hanya Head Divisi terkait atau Super Admin yang berwenang mengarsipkan dokumen.' });
        return;
      }
    } else if (nextStatus === 'Dibatalkan') {
      if (isDocFinalLocked(target)) {
        res.status(409).json({ message: 'Dokumen yang sudah disetujui/selesai tidak dapat dibatalkan langsung.' });
        return;
      }
      if (!canUserSubmitDoc(truth, target)) {
        res.status(403).json({ message: 'Anda tidak berwenang membatalkan dokumen ini.' });
        return;
      }
      if (!note) {
        res.status(400).json({ message: 'Alasan pembatalan dokumen wajib diisi.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const roleLabel = db.roles.find((r) => r.id === truth.emp.role_id)?.name ?? truth.role;
    const isApprove = nextStatus === 'Disetujui';
    const sigHash = isApprove
      ? computeDocSigHash(truth.emp.nik, target.doc_number, target.revision_no || 1)
      : target.digital_signature_hash;

    const sigDataUrl =
      isApprove &&
      typeof body.electronic_signature_data_url === 'string' &&
      body.electronic_signature_data_url.startsWith('data:image/png;base64,')
        ? body.electronic_signature_data_url
        : target.electronic_signature_data_url;

    const updated: InternalDocument = {
      ...target,
      status: nextStatus,
      is_final_locked:
        nextStatus === 'Disetujui' || nextStatus === 'Selesai' || nextStatus === 'Diarsipkan'
          ? true
          : nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak' || nextStatus === 'Draft'
          ? false
          : target.is_final_locked,
      approver_id:
        isApprove || nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak'
          ? truth.emp.id
          : target.approver_id,
      approver_name:
        isApprove || nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak'
          ? truth.emp.full_name
          : target.approver_name,
      approver_position:
        isApprove ? truth.emp.position : target.approver_position,
      approver_nik: isApprove ? truth.emp.nik : target.approver_nik,
      approved_at: isApprove ? now : target.approved_at,
      digital_signature_hash: sigHash,
      electronic_signature_data_url: sigDataUrl,
      updated_at: now,
      updated_by_name: truth.emp.full_name,
      history: [
        ...(target.history || []),
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action: nextStatus,
          note: note || `Status dokumen diperbarui ke ${nextStatus}.`,
        },
      ],
    };

    db.documents[idx] = updated;

    // Sync Approvals Center
    const existingApproval = (db.approvals || []).find(
      (a) => a.entity_type === 'Document' && a.entity_id === target.id
    );
    if (existingApproval) {
      db.approvals = db.approvals.map((a) =>
        a.id === existingApproval.id
          ? {
              ...a,
              status:
                nextStatus === 'Disetujui' || nextStatus === 'Selesai'
                  ? 'Disetujui'
                  : nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak' || nextStatus === 'Dibatalkan'
                  ? 'Ditolak'
                  : 'Menunggu',
              approver_id: truth.emp.id,
              decided_at:
                isApprove || nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak' || nextStatus === 'Dibatalkan'
                  ? now
                  : a.decided_at,
              notes: note || a.notes,
            }
          : a
      );
    } else if (nextStatus === 'Diajukan' || nextStatus === 'Menunggu Persetujuan') {
      db.approvals = [
        {
          id: `apr-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
          entity_type: 'Document',
          entity_id: target.id,
          reference_no: target.doc_number,
          title: `${target.doc_type}: ${target.title}`,
          division_id: target.division_id,
          requester_id: target.creator_id,
          status: 'Menunggu',
          requested_at: now,
          notes: note || target.title,
        },
        ...(db.approvals || []),
      ];
    }

    db.notifications = [
      makeOperationalNotification({
        type:
          nextStatus === 'Disetujui' || nextStatus === 'Selesai'
            ? 'Permintaan Disetujui'
            : nextStatus === 'Perlu Revisi' || nextStatus === 'Ditolak'
            ? 'Revisi Pengajuan'
            : 'Persetujuan',
        title: `Dokumen ${target.doc_number}: ${nextStatus}`,
        message: `${truth.emp.full_name} memperbarui status dokumen ke ${nextStatus}.`,
        target_role: 'ALL',
        target_division_id: target.division_id,
        project_id: target.project_id || undefined,
        link_module: 'dokumen',
      }),
      ...(db.notifications || []),
    ];

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Persetujuan Dokumen',
        `${target.doc_number} → ${nextStatus}${note ? ` (${note})` : ''}`,
        target.project_id || undefined
      ),
      ...(db.activityLogs || []),
    ];

    saveOperationalDb(db);
    res.json({ state: sanitizeStateForActor(db, truth), document: updated });
  });

  app.post('/api/documents/:id/revise', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const idx = (db.documents || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Dokumen tidak ditemukan.' });
      return;
    }
    const target = db.documents[idx];

    if (!canUserReviseDoc(truth, target)) {
      res.status(403).json({ message: 'Anda tidak berwenang merevisi dokumen ini.' });
      return;
    }

    const body = req.body as {
      reason?: string;
      title?: string;
      details?: string;
      items_summary?: string;
      recipient_name?: string;
      amount_value?: number;
      resubmit?: boolean;
    };
    const reason = String(body.reason || '').trim();
    if (!reason) {
      res.status(400).json({ message: 'Alasan revisi dokumen wajib diisi untuk pencatatan riwayat.' });
      return;
    }

    const now = new Date().toISOString();
    const roleLabel = db.roles.find((r) => r.id === truth.emp.role_id)?.name ?? truth.role;
    const prevRev = target.revision_no || 1;
    const snapshot: DocumentRevisionSnapshot = {
      revision_no: prevRev,
      timestamp: now,
      actor_id: truth.emp.id,
      actor_name: truth.emp.full_name,
      role_label: roleLabel,
      reason,
      title: target.title,
      details: target.details,
      items_summary: target.items_summary,
      status_before: target.status,
      digital_signature_hash: target.digital_signature_hash,
      approved_by_name: target.approver_name,
    };

    const nextRev = prevRev + 1;
    const nextStatus: DocumentStatus = body.resubmit
      ? DOC_INFORMATIONAL_TYPES.has(target.doc_type)
        ? 'Diajukan'
        : 'Menunggu Persetujuan'
      : 'Perlu Revisi';

    const updated: InternalDocument = {
      ...target,
      title: body.title !== undefined ? String(body.title).trim() || target.title : target.title,
      details: body.details !== undefined ? String(body.details).trim() || target.details : target.details,
      items_summary:
        body.items_summary !== undefined
          ? String(body.items_summary).trim() || target.items_summary
          : target.items_summary,
      recipient_name:
        body.recipient_name !== undefined ? String(body.recipient_name).trim() : target.recipient_name,
      amount_value:
        body.amount_value !== undefined ? Number(body.amount_value) : target.amount_value,
      status: nextStatus,
      revision_no: nextRev,
      revisions: [snapshot, ...(target.revisions || [])],
      is_final_locked: false,
      approver_id: undefined,
      approver_name: undefined,
      approver_position: undefined,
      approver_nik: undefined,
      approved_at: undefined,
      digital_signature_hash: undefined,
      electronic_signature_data_url: undefined,
      updated_at: now,
      updated_by_name: truth.emp.full_name,
      history: [
        ...(target.history || []),
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action: `Revisi Resmi v${nextRev}`,
          note: `${reason}${body.resubmit ? ' (Langsung diajukan ulang)' : ''}`,
        },
      ],
    };

    db.documents[idx] = updated;
    if (body.resubmit) {
      const aprIdx = (db.approvals || []).findIndex(
        (a) => a.entity_type === 'Document' && a.entity_id === target.id
      );
      if (aprIdx >= 0) {
        db.approvals[aprIdx] = {
          ...db.approvals[aprIdx],
          status: 'Menunggu',
          requested_at: now,
          notes: `Revisi v${nextRev}: ${reason}`,
        };
      }
    }

    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Revisi Dokumen',
        `Membuka revisi v${nextRev} untuk ${target.doc_number} (${reason})`,
        target.project_id || undefined
      ),
      ...(db.activityLogs || []),
    ];
    saveOperationalDb(db);
    res.json({ state: sanitizeStateForActor(db, truth), document: updated });
  });

  app.post('/api/documents/:id/archive', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const idx = (db.documents || []).findIndex((d) => d.id === req.params.id && !d.is_deleted);
    if (idx === -1) {
      res.status(404).json({ message: 'Dokumen tidak ditemukan.' });
      return;
    }
    const target = db.documents[idx];

    if (!canUserArchiveDoc(truth, target)) {
      res.status(403).json({ message: 'Hanya Head Divisi terkait atau Super Admin yang berwenang mengarsipkan/menghapus dokumen.' });
      return;
    }

    const body = req.body as { reason?: string };
    const reason = String(body.reason || '').trim() || 'Diarsipkan dari daftar aktif';
    const now = new Date().toISOString();
    const roleLabel = db.roles.find((r) => r.id === truth.emp.role_id)?.name ?? truth.role;

    const updated: InternalDocument = {
      ...target,
      is_deleted: true,
      deleted_at: now,
      deleted_by_id: truth.emp.id,
      deleted_by_name: truth.emp.full_name,
      delete_reason: reason,
      history: [
        ...(target.history || []),
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action: 'Diarsipkan (Soft Delete)',
          note: reason,
        },
      ],
    };

    db.documents[idx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Arsip / Hapus Dokumen',
        `Mengarsipkan dokumen "${target.doc_number} — ${target.title}". Alasan: ${reason}`,
        target.project_id || undefined
      ),
      ...(db.activityLogs || []),
    ];
    saveOperationalDb(db);
    res.json({ state: sanitizeStateForActor(db, truth), document: updated });
  });

  app.post('/api/documents/:id/restore', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    const db = ensureOperationalDb();
    const truth = resolveActorDbTruth(db, actor);
    if (!truth) {
      res.status(403).json({ message: 'Akun pengguna tidak aktif atau tidak dikenali.' });
      return;
    }

    const idx = (db.documents || []).findIndex((d) => d.id === req.params.id && Boolean(d.is_deleted));
    if (idx === -1) {
      res.status(404).json({ message: 'Dokumen terarsip tidak ditemukan.' });
      return;
    }
    const target = db.documents[idx];

    if (!canUserArchiveDoc(truth, target)) {
      res.status(403).json({ message: 'Hanya Head Divisi terkait atau Super Admin yang berwenang memulihkan dokumen.' });
      return;
    }

    const now = new Date().toISOString();
    const roleLabel = db.roles.find((r) => r.id === truth.emp.role_id)?.name ?? truth.role;

    const updated: InternalDocument = {
      ...target,
      is_deleted: false,
      deleted_at: undefined,
      deleted_by_id: undefined,
      deleted_by_name: undefined,
      delete_reason: undefined,
      history: [
        ...(target.history || []),
        {
          timestamp: now,
          actor_name: truth.emp.full_name,
          role_label: roleLabel,
          action: 'Dipulihkan dari Arsip',
          note: `Dokumen dipulihkan oleh ${truth.emp.full_name}.`,
        },
      ],
    };

    db.documents[idx] = updated;
    db.activityLogs = [
      makeOperationalLog(
        db,
        actor,
        'Pemulihan Dokumen',
        `Memulihkan dokumen "${target.doc_number} — ${target.title}" dari arsip.`,
        target.project_id || undefined
      ),
      ...(db.activityLogs || []),
    ];
    saveOperationalDb(db);
    res.json({ state: sanitizeStateForActor(db, truth), document: updated });
  });

  app.post('/api/workflow/reset-demo', (req: Request, res: Response) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ message: 'Autentikasi diperlukan.' });
      return;
    }
    if (actor.roleCode !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Hanya Super Admin yang dapat mereset data simulasi server.' });
      return;
    }
    const currentDb = ensureOperationalDb();
    const fresh = mergePreservingProduction(currentDb);
    saveOperationalDb(fresh);
    res.json({ state: fresh });
  });

  // JSON 404 fallback for unmatched /api routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ message: 'Endpoint API tidak ditemukan.' });
  });

  // Global JSON error handler (Multer, PayloadTooLarge, JSON syntax, unexpected)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ message: `Gagal memproses file upload: ${err.message}` });
      return;
    }
    if (err && typeof err === 'object') {
      const e = err as { type?: string; status?: number; message?: string };
      if (e.type === 'entity.too.large' || e.status === 413) {
        res.status(413).json({ message: 'Ukuran data yang dikirim melebihi batas maksimal server.' });
        return;
      }
      if (e instanceof SyntaxError || e.type === 'entity.parse.failed') {
        res.status(400).json({ message: 'Format data JSON tidak valid.' });
        return;
      }
      if (req.path.startsWith('/api')) {
        console.error('[PMS API Error]', req.method, req.path, err);
        res.status(e.status || 500).json({ message: e.message || 'Terjadi kesalahan pada server.' });
        return;
      }
    }
    next(err);
  });

  // Frontend Vite Dev Middleware or Static Production Build
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Clean up any stale service worker previously installed in dev browsers
    app.get(['/dev-sw.js', '/sw.js'], (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    } catch {}
  })());
});
`);
    });

    // Serve a clean no-WebSocket @vite/client module because HMR/WS are disabled in middleware mode
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    const id = el.getAttribute('data-vite-dev-id');
    if (id) sheetsMap.set(id, el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    const id = el.getAttribute('data-vite-dev-id');
    if (id) linkSheetsMap.set(id, el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (typeof document === 'undefined' || linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => {
        lastInsertedStyle = undefined;
      }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (typeof document === 'undefined') return;
  if (linkSheetsMap.has(id)) {
    document
      .querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]')
      .forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
const dataMap = new Map();
export function createHotContext(moduleUrl) {
  if (!dataMap.has(moduleUrl)) dataMap.set(moduleUrl, {});
  const noop = () => {};
  return {
    get data() {
      return dataMap.get(moduleUrl);
    },
    accept: noop,
    acceptDeps: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) {
  close() {}
}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          if (base === 'index.html' || base === 'sw.js' || base === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (req: Request, res: Response) => {
      if (
        req.path.startsWith('/assets/') ||
        /\.(?:js|mjs|css|map|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest|json)$/i.test(req.path)
      ) {
        res.status(404).type('text/plain').send('Not Found');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PMS KONSTRUKSI Server running on http://0.0.0.0:${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start PMS KONSTRUKSI server:', err);
  process.exit(1);
});
