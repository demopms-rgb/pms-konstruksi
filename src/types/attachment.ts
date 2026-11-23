import { ModuleKey } from './pms';

export type AttachmentCategory =
  | 'SPK'
  | 'Kontrak Kerja'
  | 'RAB'
  | 'RAB yang Disetujui'
  | 'Dokumen Addendum'
  | 'Invoice'
  | 'Berita Acara'
  | 'Bukti Pembayaran'
  | 'Dokumen Pendukung Lainnya'
  | 'Gambar Bangunan'
  | 'Surat'
  | 'Foto Kondisi Awal'
  | 'Foto Selesai / BAST'
  | 'Dokumen Lainnya'
  | 'Foto Lapangan'
  | 'Gambar Kerja'
  | 'Kontrak / SPK'
  | 'Addendum / Berita Acara'
  | 'Invoice / Bukti Pembayaran'
  | 'Dokumen RAB'
  | 'Surat Jalan / Nota Material'
  | 'Foto Material / Aset'
  | 'Sertifikat / Kepemilikan'
  | 'Identitas & Berkas Karyawan'
  | 'Lampiran Persetujuan'
  | 'Laporan & Dokumentasi'
  | 'Lampiran Umum';

export interface AttachmentVersion {
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

export interface AttachmentMetadata {
  id: string;
  original_name: string;
  storage_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  module_id: ModuleKey;
  entity_id: string;
  entity_label?: string;
  doc_category: AttachmentCategory;
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
  file_url?: string;
  version: number;
  versions: AttachmentVersion[];
}

export interface UploadConfig {
  maxFileSizeMb: number;
  maxFilesPerBatch: number;
  allowedExtensions: string[];
  requireDescription: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface FileAuditLog {
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
  module_id: ModuleKey;
  entity_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_division: string;
  detail: string;
}
