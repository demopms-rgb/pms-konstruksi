import {
  ContractSubmenuKey,
  DivisionCode,
  ModuleKey,
  ProjectSubmenuKey,
  RoleCode,
  WarehouseSubmenuKey,
} from '../types/pms';

export interface NavSubmenuConfig<
  K extends string = ProjectSubmenuKey | ContractSubmenuKey | WarehouseSubmenuKey
> {
  key: K;
  label: string;
}

export interface NavItemConfig {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  description?: string;
  submenus?: NavSubmenuConfig[];
}

export const MANAGEMENT_PROYEK_SUBMENUS: NavSubmenuConfig<ProjectSubmenuKey>[] = [
  { key: 'daftar', label: 'Daftar Proyek' },
  { key: 'tambah', label: 'Tambah Proyek' },
  { key: 'rab-material', label: 'RAB & Bahan Bangunan' },
  { key: 'dokumen', label: 'Dokumen Proyek' },
  { key: 'riwayat', label: 'Riwayat Proyek' },
];

export const KONTRAK_TERMIN_SUBMENUS: NavSubmenuConfig<ContractSubmenuKey>[] = [
  { key: 'daftar', label: 'Daftar Kontrak' },
  { key: 'pembuatan', label: 'Pembuatan Kontrak' },
  { key: 'timeline', label: 'Timeline Termin' },
  { key: 'pengajuan', label: 'Pengajuan Termin' },
  { key: 'approval', label: 'Approval Termin' },
  { key: 'pembayaran', label: 'Realisasi Pembayaran' },
  { key: 'addendum', label: 'Addendum Kontrak' },
  { key: 'dokumen', label: 'Dokumen Kontrak' },
  { key: 'laporan', label: 'Laporan Kontrak & Termin' },
  { key: 'riwayat', label: 'Riwayat Kontrak' },
];

export const GUDANG_PERSEDIAAN_SUBMENUS: NavSubmenuConfig<WarehouseSubmenuKey>[] = [
  { key: 'dashboard', label: 'Dashboard Gudang' },
  { key: 'data-barang', label: 'Data Barang' },
  { key: 'stok-barang', label: 'Stok Barang' },
  { key: 'barang-masuk', label: 'Barang Masuk' },
  { key: 'barang-keluar', label: 'Barang Keluar' },
  { key: 'surat-jalan', label: 'Surat Jalan Digital' },
  { key: 'permintaan-material', label: 'Permintaan Material' },
  { key: 'stok-minimum', label: 'Stok Minimum' },
  { key: 'riwayat-transaksi', label: 'Riwayat Transaksi' },
  { key: 'stok-opname', label: 'Stok Opname' },
];

export const ALL_NAV_ITEMS: NavItemConfig[] = [
  { key: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda' },
  {
    key: 'proyek',
    label: 'Management Proyek',
    shortLabel: 'Proyek',
    description: 'Pengelolaan pekerjaan pembangunan dan renovasi gedung.',
    submenus: MANAGEMENT_PROYEK_SUBMENUS,
  },
  {
    key: 'kontrak',
    label: 'Kontrak & Termin',
    shortLabel: 'Kontrak',
    description: 'Administrasi kontrak, jadwal termin, approval, dan pembayaran.',
    submenus: KONTRAK_TERMIN_SUBMENUS,
  },
  {
    key: 'gudang',
    label: 'Gudang & Persediaan',
    shortLabel: 'Gudang',
    description: 'Persediaan barang, persetujuan pengadaan, keluar/masuk & stok opname.',
    submenus: GUDANG_PERSEDIAAN_SUBMENUS,
  },
  { key: 'teknik', label: 'Teknik', shortLabel: 'Teknik' },
  { key: 'logistik', label: 'Logistik', shortLabel: 'Logistik' },
  { key: 'finance', label: 'Finance', shortLabel: 'Finance' },
  { key: 'aset', label: 'Aset Proyek', shortLabel: 'Aset Proyek' },
  { key: 'dokumen', label: 'Surat & Dokumen', shortLabel: 'Dokumen' },
  { key: 'karyawan', label: 'Karyawan', shortLabel: 'Karyawan' },
  { key: 'persetujuan', label: 'Persetujuan', shortLabel: 'Persetujuan' },
  { key: 'laporan', label: 'Laporan', shortLabel: 'Laporan' },
  { key: 'pengaturan', label: 'Pengaturan', shortLabel: 'Pengaturan' },
];

export function getAllowedModules(role: RoleCode, division: DivisionCode): ModuleKey[] {
  if (role === 'SUPER_ADMIN') {
    return [...ALL_NAV_ITEMS.map((item) => item.key), 'rab'];
  }

  if (role === 'HEAD') {
    const base: ModuleKey[] = [
      'dashboard',
      'proyek',
      'dokumen',
      'karyawan',
      'persetujuan',
      'laporan',
      'pengaturan',
    ];
    if (division === 'TEKNIK') {
      return [...base, 'kontrak', 'gudang', 'rab', 'teknik', 'aset'];
    }
    if (division === 'LOGISTIK') {
      return [...base, 'gudang', 'logistik', 'aset'];
    }
    if (division === 'FINANCE') {
      return [...base, 'kontrak', 'gudang', 'rab', 'finance', 'aset'];
    }
    if (division === 'DIREKSI') {
      return [...base, 'gudang', 'aset'];
    }
    return base;
  }

  // STAFF role
  const staffBase: ModuleKey[] = [
    'dashboard',
    'proyek',
    'dokumen',
    'persetujuan',
    'laporan',
    'pengaturan',
  ];
  if (division === 'TEKNIK') {
    return [...staffBase, 'kontrak', 'gudang', 'rab', 'teknik', 'aset'];
  }
  if (division === 'LOGISTIK') {
    return [...staffBase, 'gudang', 'logistik', 'aset'];
  }
  if (division === 'FINANCE') {
    return [...staffBase, 'kontrak', 'gudang', 'rab', 'finance', 'aset'];
  }
  if (division === 'DIREKSI') {
    return [...staffBase, 'gudang', 'aset'];
  }
  return staffBase;
}

export function canApproveItems(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

export function canManageProjects(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || (role === 'HEAD' && division === 'TEKNIK');
}

export function canRestoreArchivedData(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

export function canRegisterEmployee(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

export function canEditRAB(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'TEKNIK' || (role === 'HEAD' && division === 'FINANCE');
}

export function canCreateContract(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canManageContractDocuments(role: RoleCode, division: DivisionCode): boolean {
  return (
    role === 'SUPER_ADMIN' ||
    division === 'FINANCE' ||
    (role === 'HEAD' && division === 'TEKNIK')
  );
}

export function canDeleteContract(role: RoleCode, division: DivisionCode): boolean {
  return (
    role === 'SUPER_ADMIN' ||
    (role === 'HEAD' && (division === 'FINANCE' || division === 'TEKNIK'))
  );
}

export function canActivateOrCloseContract(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || (role === 'HEAD' && division === 'FINANCE');
}

export function canManageContractTerms(role: RoleCode, division: DivisionCode): boolean {
  return (
    role === 'SUPER_ADMIN' ||
    division === 'FINANCE' ||
    (role === 'HEAD' && division === 'TEKNIK')
  );
}

export function canSubmitTermClaim(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'TEKNIK' || division === 'FINANCE';
}

export function canDecideTermClaim(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || (division === 'FINANCE' && role === 'HEAD');
}

export function canRecordTermPayment(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canCreateAddendum(role: RoleCode, division: DivisionCode): boolean {
  return (
    role === 'SUPER_ADMIN' ||
    (role === 'HEAD' && (division === 'FINANCE' || division === 'TEKNIK'))
  );
}

export function canExportContractReports(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE' || division === 'TEKNIK';
}

// Gudang & Persediaan Role-Based Access Controls
export function canFinanceWarehouseAction(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canLogisticsWarehouseAction(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'LOGISTIK';
}

export function canFieldMaterialRequest(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'TEKNIK' || division === 'LOGISTIK';
}

export function canApproveMaterialRequestHead(role: RoleCode, division: DivisionCode): boolean {
  return (
    role === 'SUPER_ADMIN' ||
    (role === 'HEAD' && (division === 'TEKNIK' || division === 'LOGISTIK'))
  );
}

// Surat Jalan Digital RBAC
export function canManageDeliveryNoteLogistics(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'LOGISTIK';
}

export function canReceiveDeliveryNoteField(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'TEKNIK';
}

export function canDeleteDeliveryNote(role: RoleCode, division: DivisionCode): boolean {
  return role === 'HEAD' && division === 'LOGISTIK';
}

export function canDeleteBudgetItem(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || (role === 'HEAD' && (division === 'TEKNIK' || division === 'FINANCE'));
}

export function canDeleteProjectWorkOrMaterial(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || (role === 'HEAD' && division === 'TEKNIK');
}

export function canDeleteDocument(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

export function canDeleteAttachment(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

// Aset Proyek RBAC
export function canManageProjectAssets(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canReviewProjectAssetReports(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canReportProjectAssetIssue(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'TEKNIK';
}

export function isProjectAssetMonitoringOnly(role: RoleCode, division: DivisionCode): boolean {
  return !canManageProjectAssets(role, division) && !canReportProjectAssetIssue(role, division);
}

export function canDeleteProjectAsset(role: RoleCode): boolean {
  return role === 'SUPER_ADMIN' || role === 'HEAD';
}

export function canAccessFinanceModule(role: RoleCode, division: DivisionCode): boolean {
  return role === 'SUPER_ADMIN' || division === 'FINANCE';
}

export function canAccessTeknikModule(role: RoleCode, division: DivisionCode): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return division === 'TEKNIK' && (role === 'HEAD' || role === 'STAFF');
}

export function canAccessLogistikModule(role: RoleCode, division: DivisionCode): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return division === 'LOGISTIK' && (role === 'HEAD' || role === 'STAFF');
}

export function isDocumentFinalizedStatus(status: string): boolean {
  return status === 'Disetujui' || status === 'Selesai' || status === 'Diarsipkan';
}

export function canEditInternalDocument(
  role: RoleCode,
  userDivisionId: string,
  userId: string,
  doc: { creator_id: string; division_id: string; status: string; is_final_locked?: boolean }
): boolean {
  if (isDocumentFinalizedStatus(doc.status) || doc.status === 'Dibatalkan' || doc.is_final_locked) {
    return false;
  }
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'HEAD' && doc.division_id === userDivisionId) return true;
  return (
    doc.creator_id === userId &&
    (doc.status === 'Draft' || doc.status === 'Perlu Revisi' || doc.status === 'Ditolak')
  );
}

export function canSubmitInternalDocument(
  role: RoleCode,
  userDivisionId: string,
  userId: string,
  doc: { creator_id: string; division_id: string }
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (doc.creator_id === userId) return true;
  return role === 'HEAD' && doc.division_id === userDivisionId;
}

export function canApproveInternalDocument(
  role: RoleCode,
  division: DivisionCode,
  userDivisionId: string,
  doc: { division_id: string; doc_type: string }
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (role !== 'HEAD') return false;
  if (division === 'DIREKSI') return true;
  if (
    division === 'FINANCE' &&
    (doc.doc_type === 'Pengajuan Anggaran' ||
      doc.doc_type === 'Dokumen Persetujuan' ||
      doc.doc_type === 'RAB')
  ) {
    return true;
  }
  return doc.division_id === userDivisionId;
}

export function canReviseInternalDocument(
  role: RoleCode,
  userDivisionId: string,
  userId: string,
  doc: { creator_id: string; division_id: string; status: string }
): boolean {
  if (doc.status === 'Dibatalkan' || doc.status === 'Diarsipkan') return false;
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'HEAD' && doc.division_id === userDivisionId) return true;
  return doc.creator_id === userId;
}

export function canArchiveOrRestoreInternalDocument(
  role: RoleCode,
  division: DivisionCode,
  userDivisionId: string,
  doc: { division_id: string }
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (role !== 'HEAD') return false;
  return division === 'DIREKSI' || doc.division_id === userDivisionId;
}

