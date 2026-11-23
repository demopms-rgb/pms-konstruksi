export type RoleCode = 'SUPER_ADMIN' | 'HEAD' | 'STAFF';
export type DivisionCode = 'TEKNIK' | 'LOGISTIK' | 'FINANCE' | 'DIREKSI';

export type ModuleKey =
  | 'dashboard'
  | 'proyek'
  | 'kontrak'
  | 'gudang'
  | 'rab'
  | 'teknik'
  | 'logistik'
  | 'finance'
  | 'aset'
  | 'dokumen'
  | 'karyawan'
  | 'persetujuan'
  | 'laporan'
  | 'pengaturan';

export type ProjectSubmenuKey =
  | 'daftar'
  | 'tambah'
  | 'rab-material'
  | 'dokumen'
  | 'riwayat';

export type ContractSubmenuKey =
  | 'daftar'
  | 'pembuatan'
  | 'timeline'
  | 'pengajuan'
  | 'approval'
  | 'pembayaran'
  | 'addendum'
  | 'dokumen'
  | 'laporan'
  | 'riwayat';

export type WarehouseSubmenuKey =
  | 'dashboard'
  | 'data-barang'
  | 'stok-barang'
  | 'barang-masuk'
  | 'barang-keluar'
  | 'surat-jalan'
  | 'permintaan-material'
  | 'stok-minimum'
  | 'riwayat-transaksi'
  | 'stok-opname';

export interface SoftDeleteMeta {
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by_id?: string;
  deleted_by_name?: string;
  delete_reason?: string;
}

export interface Division {
  id: string;
  code: DivisionCode;
  name: string;
  description: string;
}

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  level: number;
  description: string;
}

export type AccountStatus = 'Aktif' | 'Nonaktif' | 'Ditangguhkan';

export interface Employee {
  id: string;
  nik: string;
  full_name: string;
  division_id: string;
  role_id: string;
  position: string;
  phone: string;
  email: string;
  status: AccountStatus;
  joined_date: string;
}

export interface Account {
  id: string;
  employee_id: string;
  nik: string;
  status: AccountStatus;
  last_login_at: string;
  must_reset_password: boolean;
}

export type ProjectStatus =
  | 'Perencanaan'
  | 'Dalam Pengerjaan'
  | 'Review Finance'
  | 'Berjalan'
  | 'Tertunda'
  | 'Selesai';
export type ProjectWorkType = 'Pembangunan' | 'Renovasi' | 'Perbaikan';

export interface Project extends SoftDeleteMeta {
  id: string;
  project_number: string;
  name: string;
  client_name: string;
  work_type?: ProjectWorkType;
  location: string;
  pic_employee_id: string;
  division_ids: string[];
  start_date: string;
  target_end_date: string;
  status: ProjectStatus;
  contract_value: number;
  progress_percent: number;
  image_url: string;
  description: string;
  is_demo?: boolean;
}

export type ContractStatus = 'Draft' | 'Aktif' | 'Akan Berakhir' | 'Selesai' | 'Ditutup';

export interface ContractVersionSnapshot {
  version: number;
  timestamp: string;
  changed_by_name: string;
  reason: string;
  contract_number: string;
  contract_value: number;
  start_date: string;
  end_date: string;
  scope_description: string;
  term_snapshot: {
    id: string;
    term_number: string;
    payment_percentage: number;
    term_value: number;
    execution_date: string;
  }[];
}

export interface Contract extends SoftDeleteMeta {
  id: string;
  project_id: string;
  contract_number: string;
  work_name: string;
  contract_value: number;
  rab_approved_value?: number;
  contract_date: string;
  start_date: string;
  end_date: string;
  counterparty: string;
  first_party_name?: string;
  second_party_name?: string;
  pic_contract?: string;
  scope_description?: string;
  contract_notes?: string;
  finance_approved_date?: string;
  document_ref: string;
  document_verified?: boolean;
  status: ContractStatus;
  current_version?: number;
  versions?: ContractVersionSnapshot[];
  activated_at?: string;
  activated_by_name?: string;
  closed_at?: string;
  closed_by_name?: string;
  close_note?: string;
  updated_at?: string;
  is_demo?: boolean;
}

export type TermWorkStatus = 'Belum Dimulai' | 'Berjalan' | 'Selesai' | 'Tertunda';
export type TermPaymentStatus = 'Belum Ditagih' | 'Menunggu Verifikasi' | 'Terbayar';
export type TerminTimelineStatus =
  | 'Terjadwal'
  | 'Menunggu Progres'
  | 'Siap Diajukan'
  | 'Menunggu Approval'
  | 'Disetujui'
  | 'Dibayar'
  | 'Ditolak'
  | 'Revisi';
export type TermRealizationStatus = 'Belum Dibayar' | 'Dibayar Sebagian' | 'Lunas';

export interface ContractTerm {
  id: string;
  contract_id: string;
  term_number: string;
  title?: string;
  period_month: string; // e.g., '2026-10'
  execution_date: string;
  term_value: number;
  payment_percentage: number;
  target_progress: number;
  actual_progress: number;
  paid_amount?: number;
  work_status: TermWorkStatus;
  payment_status: TermPaymentStatus;
  timeline_status?: TerminTimelineStatus;
  payment_realization_status?: TermRealizationStatus;
  requirements_desc?: string;
  notes: string;
  evidence_ref: string;
  is_demo?: boolean;
}

export type TermClaimStatus = 'Menunggu Approval' | 'Disetujui' | 'Ditolak' | 'Revisi';

export interface TermClaimHistoryEntry {
  timestamp: string;
  actor_name: string;
  actor_role: string;
  action: string;
  note: string;
}

export interface TermClaim {
  id: string;
  claim_number: string;
  contract_id: string;
  term_id: string;
  project_id: string;
  target_progress: number;
  actual_progress: number;
  claim_amount: number;
  claim_date: string;
  work_description: string;
  notes: string;
  field_report_id?: string;
  field_verified_by_id?: string;
  field_verified_by_name?: string;
  field_verified_at?: string;
  submitted_by_id: string;
  submitted_by_name: string;
  doc_attachment_ids: string[];
  status: TermClaimStatus;
  decision_by_id?: string;
  decision_by_name?: string;
  decision_at?: string;
  decision_note?: string;
  history: TermClaimHistoryEntry[];
  is_demo?: boolean;
}

export interface TermPayment {
  id: string;
  payment_no: string;
  contract_id: string;
  term_id: string;
  claim_id: string;
  approved_amount: number;
  paid_amount: number;
  payment_date: string;
  payment_method: 'Transfer Bank' | 'Giro / Cek' | 'Tunai Kas' | 'Virtual Account';
  transaction_ref: string;
  proof_attachment_ids: string[];
  notes: string;
  recorded_by_id: string;
  recorded_by_name: string;
  created_at: string;
  is_demo?: boolean;
}

export type AddendumChangeType =
  | 'Perubahan Nilai Kontrak'
  | 'Perubahan Waktu Pelaksanaan'
  | 'Perubahan Ruang Lingkup Pekerjaan'
  | 'Perubahan Jadwal Termin'
  | 'Perubahan Lainnya';

export interface ContractAddendum {
  id: string;
  addendum_number: string;
  contract_id: string;
  project_id: string;
  addendum_date: string;
  change_type: AddendumChangeType;
  value_before: number;
  value_after: number;
  end_date_before?: string;
  end_date_after?: string;
  scope_after?: string;
  reason: string;
  approved_by_id: string;
  approved_by_name: string;
  attachment_ids: string[];
  term_adjustments?: {
    term_id: string;
    term_number: string;
    old_value: number;
    new_value: number;
    old_percentage: number;
    new_percentage: number;
    old_date: string;
    new_date: string;
  }[];
  created_at: string;
  is_demo?: boolean;
}

export interface BudgetItem extends SoftDeleteMeta {
  id: string;
  project_id: string;
  category: string;
  work_item_name: string;
  volume: number;
  unit: string;
  unit_price: number;
  total_cost: number;
  target_qty: number;
  actual_qty: number;
  pic_employee_id: string;
  execution_date: string;
  field_doc_ref: string;
  constraints: string;
  notes?: string;
  is_demo?: boolean;
}

export interface ProjectMaterialItem extends SoftDeleteMeta {
  id: string;
  project_id: string;
  material_id?: string;
  material_name: string;
  unit: string;
  volume: number;
  unit_price: number;
  total_price: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
  is_demo?: boolean;
}

export type WorkItemStatus = 'Terjadwal' | 'Dikerjakan' | 'Kendala' | 'Selesai';

export interface WorkItem extends SoftDeleteMeta {
  id: string;
  project_id: string;
  budget_id: string;
  title: string;
  division_id: string;
  pic_employee_id: string;
  start_date: string;
  due_date: string;
  weight_percent: number;
  daily_progress: number;
  weekly_progress: number;
  monthly_progress: number;
  overall_progress: number;
  status: WorkItemStatus;
  constraints: string;
  follow_up: string;
  field_photo_url: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface WarehouseLocation {
  id: string;
  code: string;
  name: string;
  address: string;
  pic_name?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  min_stock: number;
  warehouse_location: string;
  default_warehouse_id?: string;
  warehouse_stocks?: Record<string, number>;
  unit_cost: number;
  sku_notes?: string;
  updated_at?: string;
  updated_by_name?: string;
  is_demo?: boolean;
}

export type MaterialRequestStatus =
  | 'Menunggu Head'
  | 'Disetujui Head'
  | 'Ditolak Head'
  | 'Diproses Logistik'
  | 'Diserahkan'
  | 'Dikonfirmasi Penerima';

export interface MaterialRequestItem {
  material_id: string;
  qty_requested: number;
  qty_approved: number;
  qty_delivered: number;
}

export interface MaterialRequestHistory {
  timestamp: string;
  actor_name: string;
  action: string;
  note: string;
}

export interface MaterialRequest {
  id: string;
  request_number: string;
  project_id: string;
  rab_item_id?: string;
  requested_by_id: string;
  head_reviewer_id?: string;
  logistics_processor_id?: string;
  recipient_id?: string;
  request_date: string;
  needed_date: string;
  status: MaterialRequestStatus;
  notes: string;
  items: MaterialRequestItem[];
  history: MaterialRequestHistory[];
  stock_deducted?: boolean;
  issued_tx_ids?: string[];
  is_demo?: boolean;
}

export type MaterialTxType = 'Masuk' | 'Keluar' | 'Pemakaian' | 'Penyesuaian Opname';

export interface MaterialTransaction {
  id: string;
  material_id: string;
  project_id: string;
  warehouse_id?: string;
  warehouse_name?: string;
  request_id?: string;
  order_id?: string;
  opname_id?: string;
  delivery_note_id?: string;
  rab_item_id?: string;
  type: MaterialTxType;
  qty: number;
  stock_before?: number;
  stock_after?: number;
  date: string;
  pic_name: string;
  source_or_destination?: string;
  proof_ref?: string;
  reference_no: string;
  notes: string;
  is_demo?: boolean;
}

export type WarehouseProcurementStatus =
  | 'Menunggu Persetujuan Finance'
  | 'Disetujui Finance'
  | 'Ditolak Finance'
  | 'Diterima Gudang';

export interface WarehouseStockOrder {
  id: string;
  order_no: string;
  material_id: string;
  warehouse_id?: string;
  warehouse_name?: string;
  project_id?: string;
  rab_item_id?: string;
  qty_planned: number;
  qty_actual: number;
  unit: string;
  order_date: string;
  received_date?: string;
  source_name: string;
  unit_cost: number;
  total_cost: number;
  proof_ref: string;
  proof_attachment_ids?: string[];
  status: WarehouseProcurementStatus;
  initiated_by_role: string;
  requested_by_id: string;
  requested_by_name: string;
  finance_approved_by_id?: string;
  finance_approved_by_name?: string;
  finance_approved_at?: string;
  finance_note?: string;
  received_by_id?: string;
  received_by_name?: string;
  received_at?: string;
  inspection_note?: string;
  notes: string;
  stock_applied: boolean;
  created_at: string;
}

export interface StockOpnameRecord {
  id: string;
  opname_no: string;
  opname_date: string;
  material_id: string;
  warehouse_id?: string;
  warehouse_name?: string;
  system_qty: number;
  physical_qty: number;
  variance_qty: number;
  unit: string;
  condition_note: string;
  reason: string;
  officer_id: string;
  officer_name: string;
  proof_ref?: string;
  proof_attachment_ids?: string[];
  applied: boolean;
  created_at: string;
}

export interface WarehouseAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  material_id?: string;
  material_name: string;
  qty_delta: number;
  stock_before: number;
  stock_after: number;
  ref_no: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_division: string;
  detail: string;
}

export type DeliveryNoteStatus =
  | 'Draft'
  | 'Menunggu Pengiriman'
  | 'Dalam Pengiriman'
  | 'Menunggu Konfirmasi Penerimaan'
  | 'Selesai'
  | 'Dibatalkan';

export type DeliveryItemCondition = 'Belum Diperiksa' | 'Baik' | 'Kurang' | 'Rusak Sebagian';

export interface DeliveryNoteSignature {
  signer_id: string;
  signer_name: string;
  signer_position: string;
  signer_role: string;
  signer_division: string;
  signed_at: string;
  signature_data_url: string;
  signature_hash: string;
}

export interface DeliveryNoteItem {
  id: string;
  material_id: string;
  material_code: string;
  material_name: string;
  unit: string;
  qty_sent: number;
  qty_received: number;
  condition_status: DeliveryItemCondition;
  rab_item_id?: string;
  notes?: string;
}

export interface DeliveryNoteHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  from_status?: DeliveryNoteStatus | null;
  to_status: DeliveryNoteStatus;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_division: string;
  note: string;
}

export interface DeliveryNote {
  id: string;
  sj_number: string;
  revision_no: number;
  revised_from_id?: string;
  revised_from_number?: string;
  delivery_date: string;
  project_id: string;
  project_number: string;
  project_name: string;
  source_warehouse_id?: string;
  source_warehouse_name?: string;
  destination_location: string;
  sender_id: string;
  sender_name: string;
  sender_position: string;
  recipient_id?: string;
  recipient_name: string;
  recipient_position: string;
  vehicle_info: string;
  driver_name: string;
  driver_phone?: string;
  request_id?: string;
  supplier_sj_no?: string;
  notes: string;
  status: DeliveryNoteStatus;
  items: DeliveryNoteItem[];
  sender_signature?: DeliveryNoteSignature;
  recipient_signature?: DeliveryNoteSignature;
  stock_deducted: boolean;
  stock_restored?: boolean;
  issued_tx_ids?: string[];
  is_locked: boolean;
  cancel_reason?: string;
  cancelled_at?: string;
  cancelled_by_name?: string;
  completed_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by_id?: string;
  deleted_by_name?: string;
  deleted_by_role?: string;
  delete_reason?: string;
  history: DeliveryNoteHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export type AssetStatus = 'Tersedia' | 'Digunakan' | 'Dalam Perawatan' | 'Tidak Aktif';
export type AssetCondition = 'Baik' | 'Perlu Perhatian' | 'Rusak Ringan';

export type ProjectAssetCondition = 'Baik' | 'Rusak' | 'Hilang';

export type ProjectAssetReportType = 'Hilang' | 'Rusak';

export type ProjectAssetReportStatus =
  | 'Menunggu Pemeriksaan'
  | 'Disetujui'
  | 'Perlu Perbaikan Data';

export type ProjectAssetHistoryAction =
  | 'Penambahan Aset'
  | 'Pembaruan Aset'
  | 'Laporan Kerusakan'
  | 'Laporan Kehilangan'
  | 'Pemeriksaan Disetujui'
  | 'Perlu Perbaikan Data'
  | 'Perubahan Kondisi';

export interface ProjectAsset {
  id: string;
  asset_code: string;
  project_id: string;
  project_number: string;
  project_name: string;
  name: string;
  category: string;
  qty_total: number;
  qty_available: number;
  qty_damaged: number;
  qty_lost: number;
  unit: string;
  recorded_date: string;
  initial_condition: ProjectAssetCondition;
  condition: ProjectAssetCondition;
  notes: string;
  photo_attachment_id?: string;
  photo_name?: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_by_id?: string;
  updated_by_name?: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface ProjectAssetReport {
  id: string;
  report_no: string;
  project_id: string;
  project_number: string;
  project_name: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  unit: string;
  report_type: ProjectAssetReportType;
  affected_qty: number;
  incident_date: string;
  chronology: string;
  photo_attachment_id?: string;
  photo_name?: string;
  reported_by_id: string;
  reported_by_name: string;
  reported_by_role: string;
  reported_at: string;
  status: ProjectAssetReportStatus;
  reviewed_by_id?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  follow_up_note?: string;
  approved_qty?: number;
  applied_to_asset?: boolean;
  updated_at: string;
  is_demo?: boolean;
}

export interface ProjectAssetHistory {
  id: string;
  project_id: string;
  project_number: string;
  project_name: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  report_id?: string;
  action_type: ProjectAssetHistoryAction;
  qty_change_available: number;
  qty_change_damaged: number;
  qty_change_lost: number;
  condition_before?: ProjectAssetCondition;
  condition_after?: ProjectAssetCondition;
  description: string;
  attachment_id?: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  created_at: string;
  is_demo?: boolean;
}

export interface CompanyAsset {
  id: string;
  asset_code: string;
  name: string;
  category: string;
  brand_model: string;
  serial_number: string;
  purchase_date: string;
  acquisition_value: number;
  condition: AssetCondition;
  location: string;
  pic_employee_id: string;
  status: AssetStatus;
  doc_ref: string;
  is_demo?: boolean;
}

export interface AssetMovement {
  id: string;
  asset_id: string;
  from_location: string;
  to_location: string;
  pic_employee_id: string;
  move_date: string;
  notes: string;
  is_demo?: boolean;
}

export interface MaintenanceRecord {
  id: string;
  asset_id: string;
  maintenance_date: string;
  type: 'Pemeliharaan Berkala' | 'Perbaikan Komponen' | 'Kalibrasi';
  cost: number;
  technician: string;
  notes: string;
  status: 'Terjadwal' | 'Selesai';
  is_demo?: boolean;
}

export type FinancialCategory =
  | 'Pembayaran Termin'
  | 'Pemasukan Proyek'
  | 'Pengeluaran Proyek'
  | 'Tagihan Vendor'
  | 'Biaya Operasional'
  | 'Pengadaan Material';

export type FinancialTxStatus = 'Terverifikasi' | 'Menunggu' | 'Ditolak';

export interface FinancialTransaction {
  id: string;
  project_id: string;
  contract_term_id?: string;
  budget_id?: string;
  bill_id?: string;
  transaction_no: string;
  date: string;
  category: FinancialCategory;
  type: 'Pemasukan' | 'Pengeluaran';
  amount: number;
  status: FinancialTxStatus;
  proof_ref: string;
  proof_attachment_id?: string;
  source_module?: 'Manual' | 'Kontrak' | 'Gudang' | 'Lapangan' | 'Tagihan' | 'Impor';
  description: string;
  created_by_id: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
  decision_note?: string;
  updated_at?: string;
  is_demo?: boolean;
}

export type FinanceBillCategory =
  | 'Tagihan Supplier'
  | 'Pembayaran Material'
  | 'Biaya Operasional Proyek';

export type FinanceBillStatus = 'Belum Bayar' | 'Sebagian' | 'Lunas' | 'Jatuh Tempo';

export interface FinanceBill {
  id: string;
  bill_no: string;
  project_id: string;
  category: FinanceBillCategory;
  vendor_name: string;
  bill_date: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: FinanceBillStatus;
  proof_ref?: string;
  proof_attachment_id?: string;
  description: string;
  created_by_id: string;
  created_by_name?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export type DocumentCategoryGroup =
  | 'Surat Operasional'
  | 'Dokumen Proyek'
  | 'Surat Persetujuan'
  | 'Berita Acara'
  | 'Laporan Pekerjaan'
  | 'Surat Perusahaan';

export type DocumentType =
  | 'Surat Jalan'
  | 'Surat Permintaan Material'
  | 'Surat Permintaan Barang'
  | 'RAB'
  | 'Gambar Kerja'
  | 'Spesifikasi Teknis'
  | 'Dokumen Kontrak'
  | 'Pengajuan Anggaran'
  | 'Persetujuan Pekerjaan'
  | 'Dokumen Persetujuan'
  | 'BAST'
  | 'Berita Acara Pemeriksaan'
  | 'Berita Acara'
  | 'Laporan Progres'
  | 'Laporan Penyelesaian'
  | 'Laporan Pekerjaan'
  | 'Surat Tugas'
  | 'Surat Pemberitahuan';

export type DocumentStatus =
  | 'Draft'
  | 'Diajukan'
  | 'Menunggu Persetujuan'
  | 'Diperiksa'
  | 'Diperiksa Head'
  | 'Disetujui'
  | 'Perlu Revisi'
  | 'Ditolak'
  | 'Selesai'
  | 'Diarsipkan'
  | 'Dibatalkan';

export interface DocumentHistoryItem {
  timestamp: string;
  actor_name: string;
  role_label: string;
  action: string;
  note: string;
}

export interface DocumentRevisionSnapshot {
  revision_no: number;
  timestamp: string;
  actor_id: string;
  actor_name: string;
  role_label: string;
  reason: string;
  title: string;
  details: string;
  items_summary: string;
  status_before: DocumentStatus;
  digital_signature_hash?: string;
  approved_by_name?: string;
}

export interface InternalDocument extends SoftDeleteMeta {
  id: string;
  doc_number: string;
  doc_type: DocumentType;
  category_group?: DocumentCategoryGroup;
  doc_date: string;
  creator_id: string;
  creator_name?: string;
  division_id: string;
  project_id: string;
  title: string;
  details: string;
  items_summary: string;
  attachment_name: string;
  recipient_name?: string;
  reference_code?: string;
  amount_value?: number;
  effective_date?: string;
  metadata?: Record<string, string>;
  status: DocumentStatus;
  revision_no?: number;
  revisions?: DocumentRevisionSnapshot[];
  is_final_locked?: boolean;
  approver_id?: string;
  approver_name?: string;
  approver_position?: string;
  approver_nik?: string;
  approved_at?: string;
  digital_signature_hash?: string;
  electronic_signature_data_url?: string;
  updated_at?: string;
  updated_by_name?: string;
  history: DocumentHistoryItem[];
  is_demo?: boolean;
}

export type WorkflowStage =
  | 'DRAFT_TEKNIK'
  | 'MENUNGGU_FINANCE'
  | 'REVISI_TEKNIK'
  | 'DITOLAK_FINANCE'
  | 'MENUNGGU_KONTRAK'
  | 'MENUNGGU_LOGISTIK'
  | 'PROSES_LOGISTIK'
  | 'SIAP_LAPANGAN'
  | 'DALAM_PELAKSANAAN'
  | 'SELESAI';

export interface WorkflowMaterialNeed {
  id: string;
  material_id: string;
  qty_needed: number;
  qty_reserved: number;
  qty_issued: number;
  qty_used: number;
  qty_procured: number;
  estimated_unit_cost: number;
  procurement_status:
    | 'Belum Dicek'
    | 'Stok Cukup'
    | 'Perlu Pengadaan'
    | 'Dalam Pengadaan'
    | 'Siap / Tersedia';
  notes: string;
}

export interface WorkflowProcurement {
  id: string;
  po_number: string;
  project_id: string;
  material_id: string;
  qty_order: number;
  estimated_cost: number;
  supplier_name: string;
  status: 'Menunggu Pengadaan' | 'Dipesan ke Supplier' | 'Diterima di Gudang';
  requested_by_name: string;
  created_at: string;
  received_at?: string;
  notes: string;
}

export interface WorkflowFieldReport {
  id: string;
  project_id: string;
  reported_by_id: string;
  reported_by_name: string;
  reported_at: string;
  work_summary: string;
  progress_percent: number;
  material_usages: { material_id: string; qty_used: number }[];
  expense_amount: number;
  expense_note?: string;
  constraints: string;
  follow_up: string;
  attachment_ids: string[];
}

export interface WorkflowHistoryEntry {
  id: string;
  timestamp: string;
  from_stage: WorkflowStage | null;
  to_stage: WorkflowStage;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_division: string;
  note: string;
}

export interface ProjectWorkflow {
  id: string;
  project_id: string;
  stage: WorkflowStage;
  submitter_id: string;
  submitter_name: string;
  submitter_division_id: string;
  finance_reviewer_id?: string;
  finance_reviewer_name?: string;
  finance_decision_note?: string;
  finance_decided_at?: string;
  approved_budget_limit: number;
  work_cost_estimate: number;
  schedule_start: string;
  schedule_end: string;
  logistics_pic_id?: string;
  logistics_pic_name?: string;
  logistics_note?: string;
  logistics_ready_at?: string;
  field_pic_id?: string;
  field_pic_name?: string;
  field_started_at?: string;
  submitted_at?: string;
  returned_reason?: string;
  material_needs: WorkflowMaterialNeed[];
  procurements: WorkflowProcurement[];
  field_reports: WorkflowFieldReport[];
  history: WorkflowHistoryEntry[];
  updated_at: string;
  is_demo?: boolean;
}

export interface ApprovalRecord {
  id: string;
  entity_type: 'MaterialRequest' | 'Document' | 'Finance' | 'ProjectWorkflow';
  entity_id: string;
  reference_no: string;
  title: string;
  division_id: string;
  requester_id: string;
  approver_id?: string;
  status: 'Menunggu' | 'Disetujui' | 'Ditolak';
  requested_at: string;
  decided_at?: string;
  notes: string;
  is_demo?: boolean;
}

export type NotificationType =
  | 'Permintaan Baru'
  | 'Permintaan Disetujui'
  | 'Permintaan Ditolak'
  | 'Jadwal Pekerjaan'
  | 'Perubahan Progres'
  | 'Stok Minimum'
  | 'Masa Kontrak'
  | 'Termin Pembayaran'
  | 'Persetujuan'
  | 'Workflow Proyek'
  | 'Revisi Pengajuan'
  | 'Pengadaan Material'
  | 'Laporan Lapangan';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  target_role?: RoleCode | 'ALL';
  target_division_id?: string;
  project_id?: string;
  created_at: string;
  read: boolean;
  link_module: ModuleKey;
  is_demo?: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  employee_id: string;
  employee_name: string;
  division_name: string;
  project_id?: string;
  project_name?: string;
  activity_type: string;
  description: string;
  is_demo?: boolean;
}

export interface OfflineDraft {
  id: string;
  module: 'teknik' | 'logistik' | 'dokumen';
  title: string;
  project_id: string;
  created_by_id: string;
  created_at: string;
  status: 'Menunggu Sinkronisasi' | 'Tersinkron';
  payload: Record<string, unknown>;
}

export type TeknikConformanceStatus = 'Sesuai' | 'Perlu Perbaikan' | 'Tidak Sesuai';
export type TeknikFollowUpStatus = 'Terbuka' | 'Dalam Penanganan' | 'Selesai';
export type TeknikChangeStatus = 'Menunggu Pemeriksaan' | 'Disetujui' | 'Revisi' | 'Ditolak';
export type TeknikCompletionInspectionResult =
  | 'Lulus Uji & Sesuai'
  | 'Lulus Bersyarat'
  | 'Perlu Perbaikan';
export type TeknikCompletionStatus = 'Draft' | 'Menunggu Verifikasi' | 'Selesai';

export interface TeknikEvaluationReport {
  id: string;
  eval_no: string;
  project_id: string;
  evaluation_date: string;
  period_month: string;
  work_package: string;
  drawing_spec_compliance: TeknikConformanceStatus;
  non_conformance_findings: string;
  volume_spec_changes: string;
  recommendation: string;
  follow_up_action: string;
  status: TeknikFollowUpStatus;
  evaluator_id: string;
  evaluator_name: string;
  attachment_ids: string[];
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface TeknikConstraintHistoryEntry {
  timestamp: string;
  actor_id: string;
  actor_name: string;
  status: TeknikFollowUpStatus;
  note: string;
}

export interface TeknikConstraintRecord {
  id: string;
  issue_no: string;
  project_id: string;
  source_type: 'Lapangan' | 'WorkItem' | 'Teknik';
  source_ref_id?: string;
  reported_date: string;
  reported_by_name: string;
  work_area: string;
  problem_description: string;
  technical_analysis: string;
  follow_up_action: string;
  pic_name: string;
  target_resolution_date?: string;
  status: TeknikFollowUpStatus;
  resolved_at?: string;
  updated_by_id: string;
  updated_by_name: string;
  history: TeknikConstraintHistoryEntry[];
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface TeknikChangeReport {
  id: string;
  change_no: string;
  project_id: string;
  change_date: string;
  period_month: string;
  change_category: 'Lingkup Pekerjaan' | 'Volume Pekerjaan' | 'Kebutuhan Material' | 'Spesifikasi Teknis';
  scope_change: string;
  volume_material_change: string;
  reason: string;
  technical_notes: string;
  status: TeknikChangeStatus;
  requested_by_id: string;
  requested_by_name: string;
  reviewer_id?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  review_note?: string;
  attachment_ids: string[];
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface TeknikCompletionReport {
  id: string;
  completion_no: string;
  project_id: string;
  inspection_date: string;
  period_month: string;
  completed_work_summary: string;
  inspection_result: TeknikCompletionInspectionResult;
  defects_and_notes: string;
  follow_up_action: string;
  status: TeknikCompletionStatus;
  inspector_id: string;
  inspector_name: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
  attachment_ids: string[];
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface TeknikProgressHistoryEntry {
  id: string;
  timestamp: string;
  actor_id: string;
  actor_name: string;
  action: 'Penilaian Awal' | 'Pembaruan Nilai';
  target_progress_percent: number;
  teknik_progress_percent: number;
  field_progress_comparison: number;
  technical_index: number;
  quality_score: number;
  note: string;
}

export interface TeknikProgressAssessment {
  id: string;
  assessment_no: string;
  project_id: string;
  period_month: string;
  evaluation_date: string;
  target_progress_percent: number;
  teknik_progress_percent: number;
  field_progress_comparison: number;
  technical_index: number;
  quality_score: number;
  evaluator_id: string;
  evaluator_name: string;
  notes: string;
  history: TeknikProgressHistoryEntry[];
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface PMSState {
  demo_seed_version?: string;
  divisions: Division[];
  roles: Role[];
  employees: Employee[];
  accounts: Account[];
  projects: Project[];
  contracts: Contract[];
  contractTerms: ContractTerm[];
  termClaims: TermClaim[];
  termPayments: TermPayment[];
  contractAddendums: ContractAddendum[];
  budgets: BudgetItem[];
  workItems: WorkItem[];
  materials: Material[];
  materialRequests: MaterialRequest[];
  materialTransactions: MaterialTransaction[];
  companyAssets: CompanyAsset[];
  assetMovements: AssetMovement[];
  maintenanceRecords: MaintenanceRecord[];
  financialTransactions: FinancialTransaction[];
  documents: InternalDocument[];
  approvals: ApprovalRecord[];
  notifications: AppNotification[];
  activityLogs: ActivityLog[];
  offlineDrafts: OfflineDraft[];
  workflows: ProjectWorkflow[];
  projectMaterials: ProjectMaterialItem[];
  warehouses?: WarehouseLocation[];
  warehouseOrders?: WarehouseStockOrder[];
  stockOpnames?: StockOpnameRecord[];
  warehouseAuditLogs?: WarehouseAuditEntry[];
  deliveryNotes?: DeliveryNote[];
  projectAssets?: ProjectAsset[];
  projectAssetReports?: ProjectAssetReport[];
  projectAssetHistories?: ProjectAssetHistory[];
  financeBills?: FinanceBill[];
  teknikEvaluations?: TeknikEvaluationReport[];
  teknikConstraints?: TeknikConstraintRecord[];
  teknikChanges?: TeknikChangeReport[];
  teknikCompletions?: TeknikCompletionReport[];
  teknikProgressAssessments?: TeknikProgressAssessment[];
}
