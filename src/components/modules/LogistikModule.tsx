import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  MapPin,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Printer,
  ShieldAlert,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import {
  DeliveryNote,
  Material,
  MaterialRequest,
  MaterialRequestStatus,
  MaterialTransaction,
  MaterialTxType,
  Project,
  WarehouseLocation,
  WarehouseStockOrder,
} from '../../types/pms';
import {
  formatDateID,
  formatDateTimeID,
  formatNumber,
  formatRupiah,
  getWorkflowStageMeta,
} from '../../utils/format';
import {
  canAccessLogistikModule,
  canApproveMaterialRequestHead,
  canFieldMaterialRequest,
  canFinanceWarehouseAction,
  canLogisticsWarehouseAction,
} from '../../utils/permissions';
import {
  exportLogistikExcel,
  exportLogistikPdf,
  LogistikReportCategory,
  LogistikReportExportOptions,
  openLogistikPrintA4Window,
  ProjectMaterialDistRow,
} from '../../utils/logistikExport';
import { ConfirmDialog, EmptyState, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ProjectWorkflowPanel } from '../workflow/ProjectWorkflowPanel';
import { SuratJalanSection } from './SuratJalanSection';

type LogistikTabKey =
  | 'ringkasan'
  | 'permintaan'
  | 'material'
  | 'gudang'
  | 'masuk'
  | 'keluar'
  | 'surat-jalan'
  | 'opname'
  | 'riwayat'
  | 'laporan';

const MATERIAL_CATEGORIES = [
  'Semen & Perekat',
  'Agregat & Pasir',
  'Bata & Dinding',
  'Baja & Besi',
  'Cat & Finishing',
  'Lantai & Keramik',
  'Pipa & Sanitasi',
  'Kabel & Elektrikal',
  'Kayu & Bekisting',
  'Umum & Lainnya',
];

const UNIT_OPTIONS = [
  'Sak',
  'Zak',
  'm3',
  'Batang',
  'Dus',
  'Pail',
  'Roll',
  'Buah',
  'Kg',
  'Lembar',
  'Set',
  'Unit',
];

const WORKFLOW_STEPS: MaterialRequestStatus[] = [
  'Menunggu Head',
  'Disetujui Head',
  'Diproses Logistik',
  'Diserahkan',
  'Dikonfirmasi Penerima',
];

const REPORT_TABS: Array<{ key: LogistikReportCategory; label: string; desc: string }> = [
  {
    key: 'persediaan',
    label: 'Persediaan Material',
    desc: 'Posisi stok aktual, batas stok minimum, lokasi gudang, dan nilai persediaan material.',
  },
  {
    key: 'mutasi',
    label: 'Barang Masuk & Keluar',
    desc: 'Rekapitulasi transaksi penerimaan barang, pengeluaran ke proyek, dan penyesuaian opname.',
  },
  {
    key: 'distribusi',
    label: 'Distribusi per Proyek',
    desc: 'Ringkasan penyaluran material dan realisasi Surat Jalan berdasarkan masing-masing proyek.',
  },
  {
    key: 'opname',
    label: 'Stok Opname & Selisih',
    desc: 'Catatan pemeriksaan fisik gudang dibandingkan stok sistem beserta selisih dan tindak lanjut.',
  },
  {
    key: 'pengiriman',
    label: 'Pengiriman & Penerimaan',
    desc: 'Riwayat pengiriman Surat Jalan dari gudang hingga konfirmasi penerimaan Tim Lapangan.',
  },
];

export const LogistikModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    isOnline,
    workflowBusy,
    showToast,
    setActiveModule,
    saveOfflineDraft,
    createWarehouseLocationApi,
    updateWarehouseLocationApi,
    createWarehouseMaterialApi,
    updateWarehouseMaterialApi,
    createWarehouseStockOrderApi,
    decideWarehouseOrderFinanceApi,
    confirmWarehouseReceiptApi,
    issueWarehouseStockApi,
    createWarehouseMaterialRequestApi,
    advanceWarehouseMaterialRequestApi,
    createStockOpnameApi,
  } = usePMS();
  const { getAttachmentsFor } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const canOpenLogistik = canAccessLogistikModule(roleCode, divCode);
  const canLogistics = canLogisticsWarehouseAction(roleCode, divCode);
  const canFinance = canFinanceWarehouseAction(roleCode, divCode);
  const canFieldRequest = canFieldMaterialRequest(roleCode, divCode);
  const canHeadApprove = canApproveMaterialRequestHead(roleCode, divCode);

  const [activeTab, setActiveTab] = useState<LogistikTabKey>('ringkasan');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [warehouseFilter, setWarehouseFilter] = useState('SEMUA');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [txTypeFilter, setTxTypeFilter] = useState<'SEMUA' | MaterialTxType>('SEMUA');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [historyMode, setHistoryMode] = useState<'transaksi' | 'audit'>('transaksi');

  // Report Filters
  const [reportCategory, setReportCategory] = useState<LogistikReportCategory>('persediaan');
  const [reportProjectFilter, setReportProjectFilter] = useState('SEMUA');
  const [reportWarehouseFilter, setReportWarehouseFilter] = useState('SEMUA');
  const [reportTxTypeFilter, setReportTxTypeFilter] = useState<'SEMUA' | MaterialTxType>('SEMUA');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  // Project Workflow & Detail Modals
  const [logisticsWfProject, setLogisticsWfProject] = useState<Project | null>(null);
  const [detailTx, setDetailTx] = useState<MaterialTransaction | null>(null);

  // Master Data Lokasi Gudang Modal
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseLocation | null>(null);
  const [whFormError, setWhFormError] = useState('');
  const [whForm, setWhForm] = useState({
    code: '',
    name: '',
    address: '',
    pic_name: '',
    notes: '',
    is_active: true,
  });

  // Master Data Material Modal
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [matFormError, setMatFormError] = useState('');
  const [matForm, setMatForm] = useState({
    code: '',
    name: '',
    category: MATERIAL_CATEGORIES[0],
    unit: 'Sak',
    min_stock: 20,
    default_warehouse_id: 'wh-depok',
    unit_cost: 75000,
    sku_notes: '',
  });

  // Order / Pengadaan Modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderDraftAttachKey, setOrderDraftAttachKey] = useState('pgd-draft');
  const [orderForm, setOrderForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: 'wh-depok',
    qty_planned: 50,
    order_date: new Date().toISOString().slice(0, 10),
    source_name: '',
    proof_ref: '',
    unit_cost: state.materials[0]?.unit_cost ?? 0,
    project_id: '',
    rab_item_id: '',
    notes: '',
  });

  // Finance decision confirm (for Super Admin in Logistik)
  const [financeDecisionTarget, setFinanceDecisionTarget] = useState<{
    order: WarehouseStockOrder;
    decision: 'APPROVE' | 'REJECT';
  } | null>(null);

  // Confirm Goods Received (Barang Masuk) Modal
  const [receiptTarget, setReceiptTarget] = useState<WarehouseStockOrder | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptForm, setReceiptForm] = useState({
    warehouse_id: 'wh-depok',
    qty_actual: 0,
    received_date: new Date().toISOString().slice(0, 10),
    source_name: '',
    proof_ref: '',
    inspection_note: 'Kondisi fisik baik, jumlah dan spesifikasi sesuai nota pengiriman.',
  });

  // Barang Keluar (Issue Stock) Modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issueDraftAttachKey, setIssueDraftAttachKey] = useState('issue-draft');
  const [issueForm, setIssueForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: 'wh-depok',
    project_id: '',
    rab_item_id: '',
    request_id: '',
    qty: 10,
    date: new Date().toISOString().slice(0, 10),
    source_or_destination: '',
    proof_ref: '',
    notes: '',
  });

  // Material Request Modal & Confirm Action
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqForm, setReqForm] = useState({
    project_id: '',
    rab_item_id: '',
    material_id: state.materials[0]?.id ?? '',
    qty_requested: 25,
    needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    notes: '',
  });

  const [reqDecisionTarget, setReqDecisionTarget] = useState<{
    request: MaterialRequest;
    nextStatus: MaterialRequestStatus;
    title: string;
    description: string;
    danger?: boolean;
    requireNote?: boolean;
  } | null>(null);

  // Stock Opname Modal
  const [opnameModalOpen, setOpnameModalOpen] = useState(false);
  const [opnameError, setOpnameError] = useState('');
  const [opnameDraftAttachKey, setOpnameDraftAttachKey] = useState('opname-draft');
  const [opnameForm, setOpnameForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: 'wh-depok',
    opname_date: new Date().toISOString().slice(0, 10),
    physical_qty: 0,
    condition_note: 'Baik & layak pakai',
    reason: '',
    proof_ref: '',
  });

  const warehouses = useMemo(() => state.warehouses ?? [], [state.warehouses]);
  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.is_active),
    [warehouses]
  );
  const defaultWarehouse = activeWarehouses[0] ?? warehouses[0];
  const defaultWarehouseId = defaultWarehouse?.id ?? 'wh-depok';

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const deliveryNotes = useMemo(
    () => (state.deliveryNotes ?? []).filter((d) => !d.is_deleted),
    [state.deliveryNotes]
  );

  const warehouseOrders = state.warehouseOrders ?? [];
  const stockOpnames = state.stockOpnames ?? [];
  const warehouseAuditLogs = state.warehouseAuditLogs ?? [];

  const getWhStock = (mat: Material | undefined, warehouseId: string): number => {
    if (!mat) return 0;
    if (mat.warehouse_stocks && typeof mat.warehouse_stocks === 'object') {
      return Number(mat.warehouse_stocks[warehouseId] ?? 0);
    }
    if ((mat.default_warehouse_id || 'wh-depok') === warehouseId) {
      return Number(mat.stock ?? 0);
    }
    return 0;
  };

  const getWhName = (warehouseId?: string, fallbackName?: string): string => {
    if (!warehouseId) {
      return fallbackName || defaultWarehouse?.name || 'Gudang Utama PT. Wilwa, Depok';
    }
    const found = warehouses.find((w) => w.id === warehouseId);
    return found?.name || fallbackName || defaultWarehouse?.name || 'Gudang Utama PT. Wilwa, Depok';
  };

  // Live Operational KPIs (100% actual DB counts)
  const kpis = useMemo(() => {
    const totalMaterialTypes = state.materials.length;
    const totalStockAvailable =
      Math.round(state.materials.reduce((sum, m) => sum + Number(m.stock || 0), 0) * 100) / 100;
    const totalStockValue = state.materials.reduce(
      (sum, m) => sum + Number(m.stock || 0) * Number(m.unit_cost || 0),
      0
    );
    const lowStockMaterials = state.materials.filter((m) => m.stock <= m.min_stock);

    const pendingRequests = state.materialRequests.filter((r) =>
      ['Menunggu Head', 'Disetujui Head', 'Diproses Logistik'].includes(r.status)
    );
    const logisticsQueue = state.workflows.filter((w) =>
      ['MENUNGGU_LOGISTIK', 'PROSES_LOGISTIK'].includes(w.stage)
    );
    const waitingContractProjects = state.workflows.filter((w) => w.stage === 'MENUNGGU_KONTRAK');

    const inboundTxs = state.materialTransactions.filter((t) => t.type === 'Masuk');
    const outboundTxs = state.materialTransactions.filter(
      (t) => t.type === 'Keluar' || t.type === 'Pemakaian'
    );
    const inboundQty =
      Math.round(inboundTxs.reduce((s, t) => s + Number(t.qty || 0), 0) * 100) / 100;
    const outboundQty =
      Math.round(outboundTxs.reduce((s, t) => s + Number(t.qty || 0), 0) * 100) / 100;

    const pendingFinanceOrders = warehouseOrders.filter(
      (o) => o.status === 'Menunggu Persetujuan Finance'
    );
    const readyReceiptOrders = warehouseOrders.filter((o) => o.status === 'Disetujui Finance');

    const unconfirmedDeliveries = deliveryNotes.filter(
      (d) => d.status !== 'Selesai' && d.status !== 'Dibatalkan'
    );
    const awaitingFieldConfirmation = deliveryNotes.filter(
      (d) =>
        d.status === 'Dalam Pengiriman' || d.status === 'Menunggu Konfirmasi Penerimaan'
    );

    return {
      totalMaterialTypes,
      totalStockAvailable,
      totalStockValue,
      lowStockMaterials,
      pendingRequests,
      logisticsQueue,
      waitingContractProjects,
      inboundCount: inboundTxs.length,
      inboundQty,
      outboundCount: outboundTxs.length,
      outboundQty,
      pendingFinanceOrders,
      readyReceiptOrders,
      unconfirmedDeliveries,
      awaitingFieldConfirmation,
    };
  }, [state.materials, state.materialRequests, state.workflows, state.materialTransactions, warehouseOrders, deliveryNotes]);

  const warehouseSummaries = useMemo(() => {
    return warehouses.map((wh) => {
      let skuCount = 0;
      let totalQty = 0;
      let totalValue = 0;
      let lowCount = 0;
      for (const m of state.materials) {
        const q = getWhStock(m, wh.id);
        if (q > 0 || m.default_warehouse_id === wh.id) {
          skuCount += 1;
          if (q <= m.min_stock) lowCount += 1;
        }
        totalQty += q;
        totalValue += q * m.unit_cost;
      }
      return {
        warehouse: wh,
        skuCount,
        lowCount,
        totalQty: Math.round(totalQty * 100) / 100,
        totalValue: Math.round(totalValue),
      };
    });
  }, [warehouses, state.materials]);

  // Project Distribution Breakdown
  const projectDistributionSummary = useMemo<ProjectMaterialDistRow[]>(() => {
    return activeProjects
      .map((prj) => {
        const outTxs = state.materialTransactions.filter(
          (t) =>
            t.project_id === prj.id && (t.type === 'Keluar' || t.type === 'Pemakaian')
        );
        const qtyKeluar =
          Math.round(outTxs.reduce((s, t) => s + Number(t.qty || 0), 0) * 100) / 100;
        const nilaiDistribusi = Math.round(
          outTxs.reduce((s, t) => {
            const mat = state.materials.find((m) => m.id === t.material_id);
            return s + Number(t.qty || 0) * Number(mat?.unit_cost || 0);
          }, 0)
        );
        const prjSjs = deliveryNotes.filter((d) => d.project_id === prj.id);
        const sjSelesai = prjSjs.filter((d) => d.status === 'Selesai').length;
        return {
          project_id: prj.id,
          project_number: prj.project_number,
          project_name: prj.name,
          tx_count: outTxs.length,
          qty_keluar: qtyKeluar,
          sj_count: prjSjs.length,
          sj_selesai: sjSelesai,
          nilai_distribusi: nilaiDistribusi,
        };
      })
      .filter((r) => r.tx_count > 0 || r.sj_count > 0);
  }, [activeProjects, state.materialTransactions, state.materials, deliveryNotes]);

  // Filtered Views
  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.materials.filter((m) => {
      if (categoryFilter !== 'SEMUA' && m.category !== categoryFilter) return false;
      if (warehouseFilter !== 'SEMUA') {
        const qtyAtWh = getWhStock(m, warehouseFilter);
        if (m.default_warehouse_id !== warehouseFilter && qtyAtWh <= 0) return false;
      }
      if (onlyLowStock && m.stock > m.min_stock) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.warehouse_location.toLowerCase().includes(q)
      );
    });
  }, [state.materials, categoryFilter, warehouseFilter, onlyLowStock, search]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.materialRequests.filter((r) => {
      if (projectFilter !== 'SEMUA' && r.project_id !== projectFilter) return false;
      if (!q) return true;
      const prj = state.projects.find((p) => p.id === r.project_id);
      return (
        r.request_number.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q) ||
        (prj?.name.toLowerCase().includes(q) ?? false) ||
        (prj?.project_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [state.materialRequests, state.projects, projectFilter, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouseOrders.filter((o) => {
      if (warehouseFilter !== 'SEMUA' && (o.warehouse_id || defaultWarehouseId) !== warehouseFilter) {
        return false;
      }
      if (projectFilter !== 'SEMUA' && o.project_id !== projectFilter) return false;
      if (!q) return true;
      const mat = state.materials.find((m) => m.id === o.material_id);
      return (
        o.order_no.toLowerCase().includes(q) ||
        o.source_name.toLowerCase().includes(q) ||
        o.proof_ref.toLowerCase().includes(q) ||
        (mat?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [warehouseOrders, state.materials, warehouseFilter, projectFilter, defaultWarehouseId, search]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.materialTransactions.filter((t) => {
      if (txTypeFilter !== 'SEMUA' && t.type !== txTypeFilter) return false;
      if (projectFilter !== 'SEMUA' && t.project_id !== projectFilter) return false;
      if (warehouseFilter !== 'SEMUA' && (t.warehouse_id || defaultWarehouseId) !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      const mat = state.materials.find((m) => m.id === t.material_id);
      const prj = state.projects.find((p) => p.id === t.project_id);
      return (
        t.reference_no.toLowerCase().includes(q) ||
        (t.proof_ref?.toLowerCase().includes(q) ?? false) ||
        t.pic_name.toLowerCase().includes(q) ||
        (t.source_or_destination?.toLowerCase().includes(q) ?? false) ||
        (t.warehouse_name?.toLowerCase().includes(q) ?? false) ||
        (mat?.name.toLowerCase().includes(q) ?? false) ||
        (prj?.project_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    state.materialTransactions,
    state.materials,
    state.projects,
    txTypeFilter,
    projectFilter,
    warehouseFilter,
    defaultWarehouseId,
    search,
  ]);

  const filteredOpnames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockOpnames.filter((o) => {
      if (warehouseFilter !== 'SEMUA' && (o.warehouse_id || defaultWarehouseId) !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      const mat = state.materials.find((m) => m.id === o.material_id);
      return (
        o.opname_no.toLowerCase().includes(q) ||
        o.reason.toLowerCase().includes(q) ||
        o.officer_name.toLowerCase().includes(q) ||
        (mat?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [stockOpnames, state.materials, warehouseFilter, defaultWarehouseId, search]);

  // Report Dataset Computation
  const reportDataset = useMemo(() => {
    const inPeriod = (dateStr?: string) => {
      if (!dateStr) return true;
      const d = dateStr.slice(0, 10);
      if (reportStartDate && d < reportStartDate) return false;
      if (reportEndDate && d > reportEndDate) return false;
      return true;
    };

    const mats = state.materials.filter((m) => {
      if (reportWarehouseFilter === 'SEMUA') return true;
      const qty = getWhStock(m, reportWarehouseFilter);
      return m.default_warehouse_id === reportWarehouseFilter || qty > 0;
    });

    const txs = state.materialTransactions.filter((t) => {
      if (reportProjectFilter !== 'SEMUA' && t.project_id !== reportProjectFilter) return false;
      if (
        reportWarehouseFilter !== 'SEMUA' &&
        (t.warehouse_id || defaultWarehouseId) !== reportWarehouseFilter
      ) {
        return false;
      }
      if (reportTxTypeFilter !== 'SEMUA' && t.type !== reportTxTypeFilter) return false;
      return inPeriod(t.date);
    });

    const opns = stockOpnames.filter((o) => {
      if (
        reportWarehouseFilter !== 'SEMUA' &&
        (o.warehouse_id || defaultWarehouseId) !== reportWarehouseFilter
      ) {
        return false;
      }
      return inPeriod(o.opname_date);
    });

    const dns = deliveryNotes.filter((d) => {
      if (reportProjectFilter !== 'SEMUA' && d.project_id !== reportProjectFilter) return false;
      if (
        reportWarehouseFilter !== 'SEMUA' &&
        (d.source_warehouse_id || defaultWarehouseId) !== reportWarehouseFilter
      ) {
        return false;
      }
      return inPeriod(d.delivery_date);
    });

    const distRows: ProjectMaterialDistRow[] = activeProjects
      .filter((p) => reportProjectFilter === 'SEMUA' || p.id === reportProjectFilter)
      .map((prj) => {
        const prjOut = txs.filter(
          (t) => t.project_id === prj.id && (t.type === 'Keluar' || t.type === 'Pemakaian')
        );
        const qtyKeluar =
          Math.round(prjOut.reduce((s, t) => s + Number(t.qty || 0), 0) * 100) / 100;
        const nilaiDistribusi = Math.round(
          prjOut.reduce((s, t) => {
            const mat = state.materials.find((m) => m.id === t.material_id);
            return s + Number(t.qty || 0) * Number(mat?.unit_cost || 0);
          }, 0)
        );
        const prjDns = dns.filter((d) => d.project_id === prj.id);
        return {
          project_id: prj.id,
          project_number: prj.project_number,
          project_name: prj.name,
          tx_count: prjOut.length,
          qty_keluar: qtyKeluar,
          sj_count: prjDns.length,
          sj_selesai: prjDns.filter((d) => d.status === 'Selesai').length,
          nilai_distribusi: nilaiDistribusi,
        };
      })
      .filter((r) => r.tx_count > 0 || r.sj_count > 0);

    const totalStokUnit =
      Math.round(
        mats.reduce((s, m) => s + (reportWarehouseFilter === 'SEMUA' ? m.stock : getWhStock(m, reportWarehouseFilter)), 0) *
          100
      ) / 100;
    const totalNilai = Math.round(
      mats.reduce(
        (s, m) =>
          s +
          (reportWarehouseFilter === 'SEMUA' ? m.stock : getWhStock(m, reportWarehouseFilter)) *
            m.unit_cost,
        0
      )
    );
    const totalMin = mats.filter((m) => {
      const q = reportWarehouseFilter === 'SEMUA' ? m.stock : getWhStock(m, reportWarehouseFilter);
      return q <= m.min_stock;
    }).length;
    const totalMasukQty =
      Math.round(
        txs.filter((t) => t.type === 'Masuk').reduce((s, t) => s + Number(t.qty || 0), 0) * 100
      ) / 100;
    const totalKeluarQty =
      Math.round(
        txs
          .filter((t) => t.type === 'Keluar' || t.type === 'Pemakaian')
          .reduce((s, t) => s + Number(t.qty || 0), 0) * 100
      ) / 100;

    return {
      mats,
      txs,
      opns,
      dns,
      distRows,
      summary: {
        totalMaterialJenis: mats.length,
        totalStokUnit,
        totalStokMinimum: totalMin,
        totalNilaiPersediaan: totalNilai,
        totalMasukQty,
        totalKeluarQty,
        totalOpnameCount: opns.length,
        totalPengirimanCount: dns.length,
      },
    };
  }, [
    state.materials,
    state.materialTransactions,
    stockOpnames,
    deliveryNotes,
    activeProjects,
    reportProjectFilter,
    reportWarehouseFilter,
    reportTxTypeFilter,
    reportStartDate,
    reportEndDate,
    defaultWarehouseId,
  ]);

  // Modal Openers
  const openCreateWarehouseModal = () => {
    setEditingWarehouse(null);
    setWhFormError('');
    setWhForm({
      code: `GDG-DPK-${String(warehouses.length + 1).padStart(2, '0')}`,
      name: '',
      address: '',
      pic_name: currentUser?.full_name ?? '',
      notes: '',
      is_active: true,
    });
    setWarehouseModalOpen(true);
  };

  const openEditWarehouseModal = (wh: WarehouseLocation) => {
    setEditingWarehouse(wh);
    setWhFormError('');
    setWhForm({
      code: wh.code,
      name: wh.name,
      address: wh.address,
      pic_name: wh.pic_name ?? '',
      notes: wh.notes ?? '',
      is_active: wh.is_active,
    });
    setWarehouseModalOpen(true);
  };

  const openCreateMaterialModal = () => {
    setEditingMaterial(null);
    setMatFormError('');
    setMatForm({
      code: `MAT-${String(state.materials.length + 12).padStart(3, '0')}`,
      name: '',
      category: MATERIAL_CATEGORIES[0],
      unit: 'Sak',
      min_stock: 20,
      default_warehouse_id:
        warehouseFilter !== 'SEMUA' ? warehouseFilter : defaultWarehouseId,
      unit_cost: 75000,
      sku_notes: '',
    });
    setMaterialModalOpen(true);
  };

  const openEditMaterialModal = (mat: Material) => {
    setEditingMaterial(mat);
    setMatFormError('');
    setMatForm({
      code: mat.code,
      name: mat.name,
      category: mat.category,
      unit: mat.unit,
      min_stock: mat.min_stock,
      default_warehouse_id: mat.default_warehouse_id || defaultWarehouseId,
      unit_cost: mat.unit_cost,
      sku_notes: mat.sku_notes || '',
    });
    setMaterialModalOpen(true);
  };

  const openOrderModal = (presetMaterial?: Material) => {
    const targetMat = presetMaterial ?? state.materials[0];
    const targetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    setOrderError('');
    setOrderDraftAttachKey(`pgd-draft-${Date.now()}`);
    setOrderForm({
      material_id: targetMat?.id ?? '',
      warehouse_id: targetWhId,
      qty_planned:
        presetMaterial && presetMaterial.stock <= presetMaterial.min_stock
          ? Math.max(10, Math.ceil(presetMaterial.min_stock * 2 - presetMaterial.stock))
          : 50,
      order_date: new Date().toISOString().slice(0, 10),
      source_name: '',
      proof_ref: '',
      unit_cost: targetMat?.unit_cost ?? 0,
      project_id: '',
      rab_item_id: '',
      notes: '',
    });
    setOrderModalOpen(true);
  };

  const openReceiptModal = (order: WarehouseStockOrder) => {
    const mat = state.materials.find((m) => m.id === order.material_id);
    setReceiptTarget(order);
    setReceiptError('');
    setReceiptForm({
      warehouse_id: order.warehouse_id || mat?.default_warehouse_id || defaultWarehouseId,
      qty_actual: order.qty_planned,
      received_date: new Date().toISOString().slice(0, 10),
      source_name: order.source_name,
      proof_ref: order.proof_ref,
      inspection_note: 'Kondisi fisik baik, jumlah dan spesifikasi sesuai nota pengiriman.',
    });
  };

  const openIssueModal = (presetMaterial?: Material, presetReq?: MaterialRequest) => {
    const targetMatId = presetReq?.items[0]?.material_id || presetMaterial?.id || state.materials[0]?.id || '';
    const targetMat = state.materials.find((m) => m.id === targetMatId);
    const targetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    const whStock = getWhStock(targetMat, targetWhId);
    const prj =
      activeProjects.find((p) => p.id === presetReq?.project_id) ?? activeProjects[0];
    setIssueError('');
    setIssueDraftAttachKey(`issue-draft-${Date.now()}`);
    setIssueForm({
      material_id: targetMatId,
      warehouse_id: targetWhId,
      project_id: prj?.id ?? '',
      rab_item_id: presetReq?.rab_item_id ?? '',
      request_id: presetReq?.id ?? '',
      qty: presetReq
        ? Math.min(
            whStock || presetReq.items[0]?.qty_approved || presetReq.items[0]?.qty_requested || 1,
            presetReq.items[0]?.qty_approved || presetReq.items[0]?.qty_requested || 1
          )
        : Math.min(10, Math.max(1, whStock || 1)),
      date: new Date().toISOString().slice(0, 10),
      source_or_destination: prj ? `Lapangan ${prj.project_number}` : '',
      proof_ref: `BKL/WAS/${new Date().toISOString().slice(0, 7).replace('-', '')}/${String(
        state.materialTransactions.length + 1
      ).padStart(3, '0')}`,
      notes: presetReq ? `Pengeluaran sesuai ${presetReq.request_number}` : '',
    });
    setIssueModalOpen(true);
  };

  const openRequestModal = () => {
    setReqError('');
    setReqForm({
      project_id: activeProjects[0]?.id ?? '',
      rab_item_id: '',
      material_id: state.materials[0]?.id ?? '',
      qty_requested: 25,
      needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      notes: '',
    });
    setReqModalOpen(true);
  };

  const openOpnameModal = (presetMaterial?: Material) => {
    const targetMat = presetMaterial ?? state.materials[0];
    const targetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    setOpnameError('');
    setOpnameDraftAttachKey(`opname-draft-${Date.now()}`);
    setOpnameForm({
      material_id: targetMat?.id ?? '',
      warehouse_id: targetWhId,
      opname_date: new Date().toISOString().slice(0, 10),
      physical_qty: getWhStock(targetMat, targetWhId),
      condition_note: 'Baik & layak pakai',
      reason: '',
      proof_ref: `OPN/${new Date().toISOString().slice(0, 7).replace('-', '')}/${String(
        stockOpnames.length + 1
      ).padStart(3, '0')}`,
    });
    setOpnameModalOpen(true);
  };

  // Submit Handlers
  const handleSubmitWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhFormError('');
    const res = editingWarehouse
      ? await updateWarehouseLocationApi(editingWarehouse.id, whForm)
      : await createWarehouseLocationApi(whForm);
    if (!res.ok) {
      setWhFormError(res.message);
      return;
    }
    setWarehouseModalOpen(false);
    setEditingWarehouse(null);
  };

  const handleToggleWarehouseActive = async (wh: WarehouseLocation) => {
    await updateWarehouseLocationApi(wh.id, {
      code: wh.code,
      name: wh.name,
      address: wh.address,
      pic_name: wh.pic_name,
      notes: wh.notes ?? '',
      is_active: !wh.is_active,
    });
  };

  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setMatFormError('');
    const chosenWh = warehouses.find((w) => w.id === matForm.default_warehouse_id);
    if (!chosenWh) {
      setMatFormError('Pilih lokasi gudang yang valid.');
      return;
    }
    const payload = {
      code: matForm.code,
      name: matForm.name,
      category: matForm.category,
      unit: matForm.unit,
      min_stock: Number(matForm.min_stock),
      default_warehouse_id: chosenWh.id,
      warehouse_location: chosenWh.name,
      unit_cost: Number(matForm.unit_cost),
      sku_notes: matForm.sku_notes,
    };
    const res = editingMaterial
      ? await updateWarehouseMaterialApi(editingMaterial.id, payload)
      : await createWarehouseMaterialApi(payload);
    if (!res.ok) {
      setMatFormError(res.message);
      return;
    }
    setMaterialModalOpen(false);
    setEditingMaterial(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError('');
    if (!orderForm.warehouse_id) {
      setOrderError('Lokasi gudang tujuan wajib dipilih.');
      return;
    }
    const draftAttachments = getAttachmentsFor('logistik', orderDraftAttachKey).map((a) => a.id);
    const res = await createWarehouseStockOrderApi({
      material_id: orderForm.material_id,
      warehouse_id: orderForm.warehouse_id,
      qty_planned: Number(orderForm.qty_planned),
      order_date: orderForm.order_date,
      source_name: orderForm.source_name,
      proof_ref: orderForm.proof_ref,
      unit_cost: Number(orderForm.unit_cost),
      project_id: orderForm.project_id || undefined,
      rab_item_id: orderForm.rab_item_id || undefined,
      proof_attachment_ids: draftAttachments,
      notes: orderForm.notes,
    });
    if (!res.ok) {
      setOrderError(res.message);
      return;
    }
    setOrderModalOpen(false);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptTarget) return;
    setReceiptError('');
    const orderAttachments = getAttachmentsFor('logistik', receiptTarget.id).map((a) => a.id);
    const res = await confirmWarehouseReceiptApi(receiptTarget.id, {
      warehouse_id: receiptForm.warehouse_id,
      qty_actual: Number(receiptForm.qty_actual),
      received_date: receiptForm.received_date,
      source_name: receiptForm.source_name,
      proof_ref: receiptForm.proof_ref,
      inspection_note: receiptForm.inspection_note,
      proof_attachment_ids: orderAttachments,
    });
    if (!res.ok) {
      setReceiptError(res.message);
      return;
    }
    setReceiptTarget(null);
  };

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssueError('');
    const selectedMat = state.materials.find((m) => m.id === issueForm.material_id);
    const whStock = getWhStock(selectedMat, issueForm.warehouse_id);
    if (selectedMat && Number(issueForm.qty) > whStock) {
      setIssueError(
        `Stok ${selectedMat.name} di ${getWhName(issueForm.warehouse_id)} tidak mencukupi (tersedia ${whStock} ${selectedMat.unit}).`
      );
      return;
    }
    const res = await issueWarehouseStockApi({
      material_id: issueForm.material_id,
      warehouse_id: issueForm.warehouse_id,
      project_id: issueForm.project_id,
      rab_item_id: issueForm.rab_item_id || undefined,
      request_id: issueForm.request_id || undefined,
      qty: Number(issueForm.qty),
      date: issueForm.date,
      source_or_destination: issueForm.source_or_destination,
      proof_ref: issueForm.proof_ref,
      notes: issueForm.notes,
    });
    if (!res.ok) {
      setIssueError(res.message);
      return;
    }
    setIssueModalOpen(false);
  };

  const handleSubmitRequest = async (e: React.FormEvent, asOffline = false) => {
    e.preventDefault();
    setReqError('');
    if (asOffline || !isOnline) {
      saveOfflineDraft({
        module: 'logistik',
        title: `Permintaan Material (${reqForm.qty_requested} unit)`,
        project_id: reqForm.project_id,
        created_by_id: currentUser?.id ?? 'emp-03',
        payload: {
          material_id: reqForm.material_id,
          qty_requested: reqForm.qty_requested,
          notes: reqForm.notes,
        },
      });
      setReqModalOpen(false);
      return;
    }
    const res = await createWarehouseMaterialRequestApi({
      project_id: reqForm.project_id,
      rab_item_id: reqForm.rab_item_id || undefined,
      needed_date: reqForm.needed_date,
      notes: reqForm.notes,
      items: [{ material_id: reqForm.material_id, qty_requested: Number(reqForm.qty_requested) }],
    });
    if (!res.ok) {
      setReqError(res.message);
      return;
    }
    setReqModalOpen(false);
  };

  const handleSubmitOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpnameError('');
    const draftAttachments = getAttachmentsFor('logistik', opnameDraftAttachKey).map((a) => a.id);
    const res = await createStockOpnameApi({
      material_id: opnameForm.material_id,
      warehouse_id: opnameForm.warehouse_id,
      opname_date: opnameForm.opname_date,
      physical_qty: Number(opnameForm.physical_qty),
      condition_note: opnameForm.condition_note,
      reason: opnameForm.reason,
      proof_ref: opnameForm.proof_ref,
      proof_attachment_ids: draftAttachments,
    });
    if (!res.ok) {
      setOpnameError(res.message);
      return;
    }
    setOpnameModalOpen(false);
  };

  // Report Export Actions
  const buildReportExportOpts = (): LogistikReportExportOptions => {
    const activeTabMeta = REPORT_TABS.find((t) => t.key === reportCategory) ?? REPORT_TABS[0];
    const prj = activeProjects.find((p) => p.id === reportProjectFilter);
    const wh = warehouses.find((w) => w.id === reportWarehouseFilter);
    const periodLabel =
      reportStartDate || reportEndDate
        ? `${reportStartDate ? formatDateID(reportStartDate) : 'Awal'} s/d ${
            reportEndDate ? formatDateID(reportEndDate) : 'Sekarang'
          }`
        : 'Semua Periode';
    return {
      reportCategory,
      reportTitle: `Laporan ${activeTabMeta.label}`,
      projectLabel: prj ? `${prj.project_number} - ${prj.name}` : 'Semua Proyek',
      warehouseLabel: wh ? wh.name : 'Semua Lokasi Gudang',
      periodLabel,
      txTypeLabel: reportTxTypeFilter === 'SEMUA' ? 'Semua Jenis Transaksi' : reportTxTypeFilter,
      preparedBy: currentUser?.full_name || 'Tim Logistik',
      selectedWarehouseId: reportWarehouseFilter,
      summary: reportDataset.summary,
      materials: reportDataset.mats,
      warehouses,
      projects: activeProjects,
      transactions: reportDataset.txs,
      distributionRows: reportDataset.distRows,
      opnames: reportDataset.opns,
      deliveryNotes: reportDataset.dns,
    };
  };

  const handleExportExcel = () => {
    try {
      exportLogistikExcel(buildReportExportOpts());
      showToast('Laporan Logistik berhasil diekspor ke Excel (.xlsx).');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor Excel Laporan Logistik.');
    }
  };

  const handleExportPdf = () => {
    try {
      exportLogistikPdf(buildReportExportOpts());
      showToast('Laporan Logistik berhasil diekspor ke PDF.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor PDF Laporan Logistik.');
    }
  };

  const handlePrintReportA4 = () => {
    const res = openLogistikPrintA4Window(buildReportExportOpts());
    if (!res.ok && res.message) {
      showToast(res.message);
    }
  };

  // Derived form helpers
  const orderSelectedMat = state.materials.find((m) => m.id === orderForm.material_id);
  const issueSelectedMat = state.materials.find((m) => m.id === issueForm.material_id);
  const opnameSelectedMat = state.materials.find((m) => m.id === opnameForm.material_id);
  const issueProjectRabs = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === issueForm.project_id),
    [state.budgets, issueForm.project_id]
  );
  const orderProjectRabs = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === orderForm.project_id),
    [state.budgets, orderForm.project_id]
  );
  const reqProjectRabs = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === reqForm.project_id),
    [state.budgets, reqForm.project_id]
  );
  const approvedUnissuedRequests = useMemo(
    () =>
      state.materialRequests.filter(
        (r) =>
          !r.stock_deducted &&
          (r.status === 'Disetujui Head' || r.status === 'Diproses Logistik') &&
          (!issueForm.project_id || r.project_id === issueForm.project_id)
      ),
    [state.materialRequests, issueForm.project_id]
  );

  const detailTxRelatedAttachments = useMemo(() => {
    if (!detailTx) return [];
    const ids = [
      detailTx.id,
      detailTx.order_id,
      detailTx.opname_id,
      detailTx.request_id,
      detailTx.delivery_note_id,
    ].filter((x): x is string => Boolean(x));
    const seen = new Set<string>();
    const combined = [];
    for (const id of ids) {
      for (const att of getAttachmentsFor('logistik', id)) {
        if (!seen.has(att.id)) {
          seen.add(att.id);
          combined.push(att);
        }
      }
    }
    return combined;
  }, [detailTx, getAttachmentsFor]);

  // Strict RBAC guard inside module component
  if (!canOpenLogistik) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Akses Modul Logistik Ditolak</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          Modul Logistik hanya dapat dibuka oleh{' '}
          <span className="font-semibold">Head Logistik</span>,{' '}
          <span className="font-semibold">Staff Logistik</span>, dan{' '}
          <span className="font-semibold">Super Admin</span>. Divisi lain tidak memiliki izin akses
          ke halaman maupun fungsi internal modul Logistik.
        </p>
        <button
          type="button"
          onClick={() => setActiveModule('dashboard')}
          className="mt-5 px-4 py-2 rounded-lg bg-[#13233C] text-white text-sm font-semibold hover:bg-[#1D304D] cursor-pointer whitespace-nowrap"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  const TAB_ITEMS: Array<{ key: LogistikTabKey; label: string; count?: number; alert?: boolean }> = [
    { key: 'ringkasan', label: 'Ringkasan' },
    {
      key: 'permintaan',
      label: 'Permintaan Material',
      count: kpis.pendingRequests.length + kpis.logisticsQueue.length,
    },
    {
      key: 'material',
      label: 'Master Material',
      count: kpis.lowStockMaterials.length > 0 ? kpis.lowStockMaterials.length : undefined,
      alert: kpis.lowStockMaterials.length > 0,
    },
    { key: 'gudang', label: 'Stok & Gudang', count: activeWarehouses.length },
    {
      key: 'masuk',
      label: 'Barang Masuk',
      count: kpis.readyReceiptOrders.length + kpis.pendingFinanceOrders.length || undefined,
    },
    { key: 'keluar', label: 'Barang Keluar' },
    {
      key: 'surat-jalan',
      label: 'Distribusi & Surat Jalan',
      count: kpis.unconfirmedDeliveries.length || undefined,
    },
    { key: 'opname', label: 'Stok Opname' },
    { key: 'riwayat', label: 'Riwayat Transaksi' },
    { key: 'laporan', label: 'Laporan Logistik' },
  ];

  return (
    <div className="space-y-5">
      {/* Operational Header: Title + Unified Search + Clear Primary Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-[#13233C]">Divisi Logistik</span>
            <span aria-hidden="true">·</span>
            <span>{currentRole?.name}</span>
            <span aria-hidden="true">·</span>
            <span>{activeWarehouses.length} Gudang Aktif</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight mt-0.5">
            Logistik &amp; Pengendalian Material
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pusat operasional persediaan, pengadaan, penerimaan, pengeluaran proyek, Surat Jalan Digital, dan stok opname.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari material, SJ, permintaan, transaksi..."
          />
          <div className="flex flex-wrap items-center gap-2">
            {canLogistics && (
              <>
                <button
                  type="button"
                  onClick={openCreateMaterialModal}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Material Baru</span>
                </button>
                <button
                  type="button"
                  onClick={() => openIssueModal()}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Catat Barang Keluar</span>
                </button>
                <button
                  type="button"
                  onClick={() => openOpnameModal()}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Stok Opname</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 7 Live DB Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <button
          type="button"
          onClick={() => {
            setOnlyLowStock(false);
            setActiveTab('material');
          }}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Jenis Material</span>
            <Package className="w-3.5 h-3.5 text-[#1D7AFC]" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-[#13233C] mt-1.5">
            {formatNumber(kpis.totalMaterialTypes)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">SKU terdaftar</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gudang')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Stok Tersedia</span>
            <Boxes className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-[#13233C] mt-1.5">
            {formatNumber(kpis.totalStockAvailable)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono tabular-nums">
            {formatRupiah(kpis.totalStockValue, true)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setOnlyLowStock(true);
            setActiveTab('material');
          }}
          className={`text-left border rounded-xl p-3.5 transition-colors cursor-pointer ${
            kpis.lowStockMaterials.length > 0
              ? 'bg-red-50/40 border-red-200 hover:border-red-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Stok Minimum</span>
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                kpis.lowStockMaterials.length > 0 ? 'text-red-600' : 'text-slate-400'
              }`}
            />
          </div>
          <p
            className={`text-xl font-bold font-mono tabular-nums mt-1.5 ${
              kpis.lowStockMaterials.length > 0 ? 'text-red-700' : 'text-[#13233C]'
            }`}
          >
            {formatNumber(kpis.lowStockMaterials.length)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">Perlu pengadaan</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('permintaan')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Permintaan Antre</span>
            <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-[#13233C] mt-1.5">
            {formatNumber(kpis.pendingRequests.length)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            +{kpis.logisticsQueue.length} proyek Finance
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('masuk')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Barang Masuk</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
            {formatNumber(kpis.inboundCount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono tabular-nums">
            +{formatNumber(kpis.inboundQty)} unit
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('keluar')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Barang Keluar</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-700" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-[#13233C] mt-1.5">
            {formatNumber(kpis.outboundCount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono tabular-nums">
            -{formatNumber(kpis.outboundQty)} unit
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('surat-jalan')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Kirim Belum Sah</span>
            <Truck className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <p className="text-xl font-bold font-mono tabular-nums text-amber-800 mt-1.5">
            {formatNumber(kpis.unconfirmedDeliveries.length)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {kpis.awaitingFieldConfirmation.length} tunggu Lapangan
          </p>
        </button>
      </div>

      {/* Single-Row Clean Operational Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 overflow-x-auto no-print">
        <div className="flex items-center gap-1 min-w-max">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#13233C] text-[#FBC02D]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums font-bold ${
                      isActive
                        ? 'bg-[#FBC02D] text-[#13233C]'
                        : tab.alert
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: RINGKASAN OPERASIONAL                                           */}
      {/* ===================================================================== */}
      {activeTab === 'ringkasan' && (
        <div className="space-y-5">
          {/* Work Queue Requiring Logistics Action */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Antrean Proyek & Pengadaan Menunggu Tindakan Logistik */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Antrean Pekerjaan Logistik
                  </h2>
                  <p className="text-xs text-slate-500">
                    Proyek disetujui Finance, penerimaan barang masuk, dan permintaan material siap proses.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs font-bold text-[#13233C]">
                  {kpis.logisticsQueue.length +
                    kpis.readyReceiptOrders.length +
                    kpis.pendingRequests.length}{' '}
                  Tugas
                </span>
              </div>

              {kpis.waitingContractProjects.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  {kpis.waitingContractProjects.length} proyek disetujui Finance masih menunggu Kontrak Aktif sebelum masuk ke antrean Logistik.
                </div>
              )}

              <div className="space-y-2.5">
                {/* 1. Finance-Approved Procurement Ready for Physical Receipt */}
                {kpis.readyReceiptOrders.map((ord) => {
                  const mat = state.materials.find((m) => m.id === ord.material_id);
                  return (
                    <div
                      key={ord.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono font-bold text-emerald-700">{ord.order_no}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-600 font-medium">Penerimaan Barang Masuk</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                          {mat?.name ?? ord.material_id} ({formatNumber(ord.qty_planned)} {ord.unit})
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Tujuan: {ord.warehouse_name || getWhName(ord.warehouse_id)} · Sumber: {ord.source_name}
                        </p>
                      </div>
                      {canLogistics && (
                        <button
                          type="button"
                          onClick={() => openReceiptModal(ord)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Konfirmasi Terima
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* 2. Finance-Approved Project Workflows */}
                {kpis.logisticsQueue.map((wf) => {
                  const prj = activeProjects.find((p) => p.id === wf.project_id);
                  if (!prj) return null;
                  const meta = getWorkflowStageMeta(wf.stage);
                  const shortageCount = wf.material_needs.filter((n) => {
                    const mat = state.materials.find((m) => m.id === n.material_id);
                    return Math.max(0, n.qty_needed - n.qty_issued) > (mat?.stock ?? 0);
                  }).length;
                  return (
                    <div
                      key={wf.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#1D7AFC]">{prj.project_number}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-slate-700">{meta.shortLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className={shortageCount > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                            {shortageCount > 0 ? `${shortageCount} item perlu PO` : 'Stok siap'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{prj.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {wf.material_needs.length} kebutuhan material · Pagu {formatRupiah(wf.approved_budget_limit, true)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLogisticsWfProject(prj)}
                        className="px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Proses Proyek
                      </button>
                    </div>
                  );
                })}

                {/* 3. Pending Material Requests */}
                {kpis.pendingRequests.slice(0, 4).map((req) => {
                  const prj = activeProjects.find((p) => p.id === req.project_id);
                  const firstMat = state.materials.find((m) => m.id === req.items[0]?.material_id);
                  return (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#13233C]">{req.request_number}</span>
                          <StatusLabel status={req.status} />
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                          {prj?.project_number ?? ''} — {firstMat?.name ?? 'Material Proyek'} ({req.items[0]?.qty_requested ?? 0} {firstMat?.unit ?? ''})
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Dibutuhkan {formatDateID(req.needed_date)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('permintaan')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Tindak Lanjut
                      </button>
                    </div>
                  );
                })}

                {kpis.readyReceiptOrders.length === 0 &&
                  kpis.logisticsQueue.length === 0 &&
                  kpis.pendingRequests.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Tidak ada antrean mendesak saat ini. Semua proyek &amp; permintaan telah diproses.
                    </div>
                  )}
              </div>
            </div>

            {/* Unconfirmed Deliveries & Low Stock Alerts */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Pengiriman &amp; Peringatan Stok Minimum
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pemantauan Surat Jalan belum selesai dan material dengan stok di bawah batas minimum.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('surat-jalan')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Semua Surat Jalan →
                </button>
              </div>

              <div className="space-y-2.5">
                {kpis.unconfirmedDeliveries.slice(0, 4).map((dn) => (
                  <div
                    key={dn.id}
                    className="p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-[#1D7AFC]">{dn.sj_number}</span>
                        <StatusLabel status={dn.status} />
                      </div>
                      <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                        {dn.project_number} — {dn.project_name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Driver: {dn.driver_name} · Penerima: {dn.recipient_name} · {dn.items.length} item
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('surat-jalan')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Pantau SJ
                    </button>
                  </div>
                ))}

                {kpis.lowStockMaterials.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-700">
                        Material Stok Minimum ({kpis.lowStockMaterials.length} Item)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setOnlyLowStock(true);
                          setActiveTab('material');
                        }}
                        className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                      >
                        Lihat Semua →
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {kpis.lowStockMaterials.slice(0, 4).map((m) => (
                        <div
                          key={m.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs bg-white"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-slate-500">{m.code}</span>{' '}
                            <span className="font-semibold text-slate-900">{m.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums font-bold text-red-700">
                              {formatNumber(m.stock)} / {formatNumber(m.min_stock)} {m.unit}
                            </span>
                            {canLogistics && (
                              <button
                                type="button"
                                onClick={() => openOrderModal(m)}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-[#13233C] cursor-pointer"
                              >
                                Ajukan PO
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {kpis.unconfirmedDeliveries.length === 0 && kpis.lowStockMaterials.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Seluruh pengiriman selesai dikonfirmasi dan semua stok material berada di atas batas minimum.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Distribusi Proyek & Aktivitas Terbaru */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Project Distribution Activity */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">Distribusi Material per Proyek</h2>
                  <p className="text-xs text-slate-500">Rekap penyaluran barang keluar &amp; pengiriman Surat Jalan.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('laporan')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                >
                  Laporan Lengkap →
                </button>
              </div>
              {projectDistributionSummary.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Belum ada distribusi material tercatat ke proyek.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Proyek</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Qty Keluar</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Surat Jalan</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projectDistributionSummary.slice(0, 6).map((row) => (
                        <tr key={row.project_id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4">
                            <span className="font-mono font-semibold text-[#1D7AFC]">{row.project_number}</span>
                            <div className="font-medium text-slate-900 truncate max-w-[220px]">
                              {row.project_name}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                            {formatNumber(row.qty_keluar)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {row.sj_selesai}/{row.sj_count} Selesai
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatRupiah(row.nilai_distribusi, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Material Transactions */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">Aktivitas &amp; Riwayat Terbaru</h2>
                  <p className="text-xs text-slate-500">Pergerakan barang masuk, keluar, dan penyesuaian opname terbaru.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('riwayat')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                >
                  Semua Riwayat →
                </button>
              </div>
              {state.materialTransactions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Belum ada aktivitas transaksi material.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {state.materialTransactions.slice(0, 6).map((tx) => {
                    const mat = state.materials.find((m) => m.id === tx.material_id);
                    return (
                      <div
                        key={tx.id}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#13233C]">{tx.reference_no}</span>
                            <span
                              className={`font-semibold ${
                                tx.type === 'Masuk'
                                  ? 'text-emerald-700'
                                  : tx.type === 'Penyesuaian Opname'
                                  ? 'text-amber-700'
                                  : 'text-blue-700'
                              }`}
                            >
                              {tx.type}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 tabular-nums">{formatDateID(tx.date)}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                            {mat?.name ?? tx.material_id} ({formatNumber(tx.qty)} {mat?.unit ?? ''})
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {tx.source_or_destination || tx.warehouse_name || '-'} · PIC: {tx.pic_name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shrink-0"
                        >
                          Detail
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PERMINTAAN MATERIAL & ANTREAN PROYEK                           */}
      {/* ===================================================================== */}
      {activeTab === 'permintaan' && (
        <div className="space-y-5">
          {/* Proyek Disetujui Finance */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-[#13233C]">
                  Antrean Proyek Disetujui Finance (Terintegrasi Teknik &amp; Finance)
                </h2>
                <p className="text-xs text-slate-500">
                  Periksa kebutuhan material proyek, keluarkan stok gudang, buat PO pengadaan jika kurang, dan teruskan ke Lapangan.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-[#1D7AFC] tabular-nums">
                {kpis.logisticsQueue.length} Proyek Siap Proses
              </span>
            </div>

            {kpis.logisticsQueue.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">
                Semua proyek yang telah disetujui Finance sudah diproses Logistik.
              </p>
            ) : (
              <div className="space-y-2.5">
                {kpis.logisticsQueue.map((wf) => {
                  const prj = activeProjects.find((p) => p.id === wf.project_id);
                  if (!prj) return null;
                  const meta = getWorkflowStageMeta(wf.stage);
                  const shortageCount = wf.material_needs.filter((n) => {
                    const mat = state.materials.find((m) => m.id === n.material_id);
                    return Math.max(0, n.qty_needed - n.qty_issued) > (mat?.stock ?? 0);
                  }).length;
                  return (
                    <div
                      key={wf.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#1D7AFC]">{prj.project_number}</span>
                          <StatusLabel status={meta.shortLabel} />
                          <span className="text-slate-500">
                            Disetujui Finance: {wf.finance_reviewer_name || 'Tim Finance'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{prj.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span>Kebutuhan: {wf.material_needs.length} item</span>
                          <span className={shortageCount > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                            {shortageCount > 0 ? `${shortageCount} item perlu PO` : 'Stok mencukupi'}
                          </span>
                          <span className="font-mono tabular-nums">
                            Pagu: {formatRupiah(wf.approved_budget_limit, true)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLogisticsWfProject(prj)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Proses Stok &amp; Teruskan</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filter & Add Request */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="SEMUA">Semua Proyek</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {filteredRequests.length} Permintaan Material
              </span>
            </div>
            {canFieldRequest && (
              <button
                type="button"
                onClick={openRequestModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajukan Permintaan Material</span>
              </button>
            )}
          </div>

          {/* List of Material Requests */}
          {filteredRequests.length === 0 ? (
            <EmptyState
              title="Belum Ada Permintaan Material"
              description="Permintaan material dari Teknik/Lapangan atau Logistik akan tampil di sini untuk diproses."
            />
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((req) => {
                const prj = state.projects.find((p) => p.id === req.project_id);
                const requester = state.employees.find((e) => e.id === req.requested_by_id);
                const currentStepIdx = WORKFLOW_STEPS.indexOf(req.status);
                const isRejected = req.status === 'Ditolak Head';

                return (
                  <div key={req.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-bold text-[#1D7AFC]">{req.request_number}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-700">
                            {prj ? `${prj.project_number} — ${prj.name}` : '-'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{req.notes}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Pemohon: <strong className="text-slate-700">{requester?.full_name ?? '-'}</strong> · Tgl Ajuan:{' '}
                          <span className="tabular-nums">{formatDateID(req.request_date)}</span> · Dibutuhkan:{' '}
                          <span className="tabular-nums">{formatDateID(req.needed_date)}</span>
                        </p>
                      </div>
                      <StatusLabel status={req.status} />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200">
                      {req.items.map((it, idx) => {
                        const mat = state.materials.find((m) => m.id === it.material_id);
                        return (
                          <div
                            key={idx}
                            className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <span className="font-mono text-slate-500">{mat?.code}</span> ·{' '}
                              <strong className="text-slate-900">{mat?.name}</strong>{' '}
                              <span className="text-slate-500">
                                (Stok gudang: <span className="font-mono tabular-nums">{formatNumber(mat?.stock ?? 0)} {mat?.unit}</span>)
                              </span>
                            </div>
                            <div className="font-mono tabular-nums text-slate-700">
                              Diminta: <strong>{formatNumber(it.qty_requested)}</strong> {mat?.unit}
                              {it.qty_approved > 0 && ` · Disetujui: ${formatNumber(it.qty_approved)}`}
                              {it.qty_delivered > 0 && ` · Diserahkan: ${formatNumber(it.qty_delivered)}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {WORKFLOW_STEPS.map((step, i) => {
                        const done = !isRejected && currentStepIdx >= i;
                        const active = !isRejected && currentStepIdx === i;
                        return (
                          <div
                            key={step}
                            className={`p-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                              active
                                ? 'bg-blue-50 border-blue-300 text-blue-900'
                                : done
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{step}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500">
                        Log terakhir: {req.history[req.history.length - 1]?.action} oleh{' '}
                        {req.history[req.history.length - 1]?.actor_name} (
                        {formatDateTimeID(req.history[req.history.length - 1]?.timestamp)})
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ModuleAttachmentToolbar
                          compact
                          moduleId="logistik"
                          entityId={req.id}
                          entityLabel={req.request_number}
                          title={`Lampiran Permintaan ${req.request_number}`}
                          subtitle="Surat permintaan, bukti pengiriman, dan foto serah terima"
                          defaultCategory="Surat Jalan / Nota Material"
                        />

                        {req.status === 'Menunggu Head' && canHeadApprove && (
                          <>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setReqDecisionTarget({
                                  request: req,
                                  nextStatus: 'Ditolak Head',
                                  title: `Tolak Permintaan ${req.request_number}?`,
                                  description: 'Masukkan alasan penolakan permintaan material.',
                                  danger: true,
                                  requireNote: true,
                                })
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                            >
                              Tolak
                            </button>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setReqDecisionTarget({
                                  request: req,
                                  nextStatus: 'Disetujui Head',
                                  title: `Setujui Permintaan ${req.request_number}?`,
                                  description: 'Permintaan material akan masuk ke tahap pemrosesan gudang Logistik.',
                                })
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg cursor-pointer"
                            >
                              Setujui (Head)
                            </button>
                          </>
                        )}

                        {req.status === 'Disetujui Head' && canLogistics && (
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() =>
                              advanceWarehouseMaterialRequestApi(req.id, {
                                next_status: 'Diproses Logistik',
                                note: 'Stok disiapkan oleh tim gudang Logistik.',
                              })
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#13233C] hover:bg-[#1D304D] rounded-lg cursor-pointer"
                          >
                            Siapkan Stok Gudang
                          </button>
                        )}

                        {(req.status === 'Disetujui Head' || req.status === 'Diproses Logistik') &&
                          canLogistics &&
                          !req.stock_deducted && (
                            <>
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() => openIssueModal(undefined, req)}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                              >
                                Keluarkan Barang
                              </button>
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() =>
                                  setReqDecisionTarget({
                                    request: req,
                                    nextStatus: 'Diserahkan',
                                    title: `Serahkan Barang ${req.request_number}?`,
                                    description: 'Stok gudang akan dikurangi otomatis sesuai jumlah disetujui.',
                                  })
                                }
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg cursor-pointer"
                              >
                                Serahkan ke Proyek
                              </button>
                            </>
                          )}

                        {req.status === 'Diserahkan' && canFieldRequest && (
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() =>
                              setReqDecisionTarget({
                                request: req,
                                nextStatus: 'Dikonfirmasi Penerima',
                                title: `Konfirmasi Penerimaan ${req.request_number}?`,
                                description: 'Pastikan barang fisik telah diterima di proyek sesuai jumlah dan kondisi.',
                              })
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                          >
                            Konfirmasi Penerimaan
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: MASTER DATA MATERIAL                                           */}
      {/* ===================================================================== */}
      {activeTab === 'material' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="SEMUA">Semua Kategori</option>
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="SEMUA">Semua Lokasi Gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyLowStock}
                  onChange={(e) => setOnlyLowStock(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Hanya Stok Minimum ({kpis.lowStockMaterials.length})</span>
              </label>
            </div>

            {canLogistics && (
              <button
                type="button"
                onClick={openCreateMaterialModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Material Baru</span>
              </button>
            )}
          </div>

          {filteredMaterials.length === 0 ? (
            <EmptyState
              title="Material Tidak Ditemukan"
              description="Ubah filter pencarian atau tambahkan master data material baru."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Kode &amp; Nama Material</th>
                      <th className="py-3 px-4 font-semibold">Kategori</th>
                      <th className="py-3 px-4 font-semibold">Lokasi Gudang</th>
                      <th className="py-3 px-4 font-semibold text-right">Stok Tersedia</th>
                      <th className="py-3 px-4 font-semibold text-right">Min. Stok</th>
                      <th className="py-3 px-4 font-semibold text-right">Harga Satuan</th>
                      <th className="py-3 px-4 font-semibold">Status Ketersediaan</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMaterials.map((m) => {
                      const displayStock =
                        warehouseFilter === 'SEMUA' ? m.stock : getWhStock(m, warehouseFilter);
                      const isEmpty = displayStock <= 0;
                      const isLow = !isEmpty && displayStock <= m.min_stock;

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 min-w-[200px]">
                            <span className="font-mono font-bold text-[#1D7AFC]">{m.code}</span>
                            <div className="font-semibold text-slate-900 mt-0.5">{m.name}</div>
                            {m.sku_notes && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                                {m.sku_notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{m.category}</td>
                          <td className="py-3 px-4 text-slate-600 min-w-[180px]">
                            <div>{m.warehouse_location}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                            {formatNumber(displayStock)}{' '}
                            <span className="font-sans font-normal text-slate-500">{m.unit}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatNumber(m.min_stock)} {m.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatRupiah(m.unit_cost)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {isEmpty ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold text-red-700 bg-red-50 border-red-200">
                                <XCircle className="w-3.5 h-3.5" />
                                Stok Habis
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold text-amber-800 bg-amber-50 border-amber-200">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Stok Minimum
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Stok Aman
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {canLogistics && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditMaterialModal(m)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                                    title="Edit Master Material"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openOrderModal(m)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold cursor-pointer"
                                    title="Ajukan Pengadaan Barang Masuk"
                                  >
                                    <PackagePlus className="w-3.5 h-3.5" />
                                    <span>PO</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openIssueModal(m)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold cursor-pointer"
                                    title="Catat Barang Keluar"
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                    <span>Keluar</span>
                                  </button>
                                </>
                              )}
                              <ModuleAttachmentToolbar
                                compact
                                moduleId="logistik"
                                entityId={m.id}
                                entityLabel={`${m.code} — ${m.name}`}
                                title={`Foto & Dokumen Material: ${m.name}`}
                                subtitle="Foto material di gudang, spesifikasi teknis, dan sertifikat"
                                defaultCategory="Foto Material / Aset"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: STOK & LOKASI GUDANG                                           */}
      {/* ===================================================================== */}
      {activeTab === 'gudang' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-[#13233C]">
                  Master Lokasi Gudang ({warehouses.length} Lokasi)
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau kuantitas, nilai persediaan, dan PIC pada masing-masing gudang aktif.
                </p>
              </div>
              {canLogistics && (
                <button
                  type="button"
                  onClick={openCreateWarehouseModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Lokasi Gudang</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {warehouseSummaries.map(({ warehouse: wh, skuCount, lowCount, totalQty, totalValue }) => (
                <div
                  key={wh.id}
                  className={`border rounded-xl p-4 space-y-3 ${
                    wh.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold text-[#1D7AFC]">{wh.code}</span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">{wh.name}</h3>
                      <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{wh.address}</span>
                      </p>
                    </div>
                    <StatusLabel status={wh.is_active ? 'Aktif' : 'Nonaktif'} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Item SKU</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {formatNumber(skuCount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Total Qty</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {formatNumber(totalQty)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Nilai Stok</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {formatRupiah(totalValue, true)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      PIC: <strong className="text-slate-700">{wh.pic_name || '-'}</strong>
                      {lowCount > 0 && ` · ${lowCount} stok min`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseFilter(wh.id);
                          setActiveTab('material');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                      >
                        Lihat Stok
                      </button>
                      {canLogistics && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditWarehouseModal(wh)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleWarehouseActive(wh)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                          >
                            {wh.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Warehouse Stock Matrix */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#13233C]">
                  Sebaran Stok Material per Lokasi Gudang
                </h2>
                <p className="text-xs text-slate-500">
                  Perbandingan ketersediaan stok setiap material di masing-masing gudang.
                </p>
              </div>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="SEMUA">Tampilkan Semua Gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    Fokus: {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Material</th>
                    <th className="py-3 px-3 font-semibold">Satuan</th>
                    {warehouses
                      .filter((w) => warehouseFilter === 'SEMUA' || w.id === warehouseFilter)
                      .map((w) => (
                        <th key={w.id} className="py-3 px-3 font-semibold text-right">
                          {w.code}
                        </th>
                      ))}
                    <th className="py-3 px-4 font-semibold text-right">Total Stok</th>
                    <th className="py-3 px-4 font-semibold text-right">Min. Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMaterials.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-semibold text-[#1D7AFC]">{m.code}</span>{' '}
                        <span className="font-semibold text-slate-900">{m.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{m.unit}</td>
                      {warehouses
                        .filter((w) => warehouseFilter === 'SEMUA' || w.id === warehouseFilter)
                        .map((w) => (
                          <td
                            key={w.id}
                            className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700"
                          >
                            {formatNumber(getWhStock(m, w.id))}
                          </td>
                        ))}
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-bold tabular-nums ${
                          m.stock <= m.min_stock ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(m.stock)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                        {formatNumber(m.min_stock)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: BARANG MASUK & PENERIMAAN PENGADAAN                            */}
      {/* ===================================================================== */}
      {activeTab === 'masuk' && (
        <div className="space-y-5">
          {/* Action Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">
                Pengadaan &amp; Penerimaan Barang Masuk
              </h2>
              <p className="text-xs text-slate-500">
                Alur: Logistik ajukan pengadaan → Persetujuan pembiayaan Finance → Logistik konfirmasi fisik barang diterima → Stok otomatis bertambah.
              </p>
            </div>
            {canLogistics && (
              <button
                type="button"
                onClick={() => openOrderModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Ajukan Pengadaan Barang Masuk</span>
              </button>
            )}
          </div>

          {/* Procurement Orders Queue */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Daftar Order Pengadaan &amp; Penerimaan ({filteredOrders.length})
              </h3>
            </div>
            {filteredOrders.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Belum ada order pengadaan barang masuk.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">No. Order &amp; Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Material &amp; Gudang Tujuan</th>
                      <th className="py-3 px-4 font-semibold">Supplier / Sumber &amp; Bukti</th>
                      <th className="py-3 px-4 font-semibold text-right">Qty Rencana / Aktual</th>
                      <th className="py-3 px-4 font-semibold text-right">Total Nilai</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((ord) => {
                      const mat = state.materials.find((m) => m.id === ord.material_id);
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-[#1D7AFC]">{ord.order_no}</span>
                            <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                              {formatDateID(ord.order_date)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {mat ? `${mat.code} — ${mat.name}` : ord.material_id}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Gudang: {ord.warehouse_name || getWhName(ord.warehouse_id)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">{ord.source_name}</div>
                            <div className="text-[11px] font-mono text-slate-500">Ref: {ord.proof_ref}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-slate-900">
                              {formatNumber(ord.qty_planned)} {ord.unit}
                            </span>
                            {ord.qty_actual > 0 && (
                              <div className="text-[11px] text-emerald-700 font-semibold">
                                Aktual: {formatNumber(ord.qty_actual)} {ord.unit}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatRupiah(ord.total_cost)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <StatusLabel status={ord.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {ord.status === 'Menunggu Persetujuan Finance' && canFinance && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFinanceDecisionTarget({ order: ord, decision: 'APPROVE' })
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
                                  >
                                    Setujui
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFinanceDecisionTarget({ order: ord, decision: 'REJECT' })
                                    }
                                    className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold cursor-pointer"
                                  >
                                    Tolak
                                  </button>
                                </>
                              )}
                              {ord.status === 'Disetujui Finance' && canLogistics && (
                                <button
                                  type="button"
                                  onClick={() => openReceiptModal(ord)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                                >
                                  <PackageCheck className="w-3.5 h-3.5" />
                                  <span>Konfirmasi Terima</span>
                                </button>
                              )}
                              <ModuleAttachmentToolbar
                                compact
                                moduleId="logistik"
                                entityId={ord.id}
                                entityLabel={ord.order_no}
                                title={`Nota & Bukti Pengadaan ${ord.order_no}`}
                                subtitle="Unggah nota supplier, bukti transfer, dan foto barang datang"
                                defaultCategory="Surat Jalan / Nota Material"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inbound Transactions Ledger */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Riwayat Transaksi Barang Masuk
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Tanggal &amp; Referensi</th>
                    <th className="py-3 px-4 font-semibold">Material</th>
                    <th className="py-3 px-4 font-semibold">Gudang Tujuan</th>
                    <th className="py-3 px-4 font-semibold text-right">Qty Masuk</th>
                    <th className="py-3 px-4 font-semibold text-right">Perubahan Stok</th>
                    <th className="py-3 px-4 font-semibold">Sumber &amp; Petugas</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.materialTransactions
                    .filter((t) => t.type === 'Masuk')
                    .map((tx) => {
                      const mat = state.materials.find((m) => m.id === tx.material_id);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-[#13233C]">{tx.reference_no}</span>
                            <div className="text-[11px] text-slate-500 tabular-nums">{formatDateID(tx.date)}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{mat?.name ?? '-'}</td>
                          <td className="py-3 px-4 text-slate-600">{tx.warehouse_name || getWhName(tx.warehouse_id)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                            +{formatNumber(tx.qty)} {mat?.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {tx.stock_before !== undefined && tx.stock_after !== undefined
                              ? `${formatNumber(tx.stock_before)} → ${formatNumber(tx.stock_after)}`
                              : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-800">{tx.source_or_destination || '-'}</div>
                            <div className="text-[11px] text-slate-500">PIC: {tx.pic_name}</div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDetailTx(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: BARANG KELUAR                                                  */}
      {/* ===================================================================== */}
      {activeTab === 'keluar' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">Pengeluaran Material ke Proyek</h2>
              <p className="text-xs text-slate-500">
                Catat barang keluar langsung dari gudang ke proyek atau berdasarkan permintaan material yang disetujui.
              </p>
            </div>
            {canLogistics && (
              <button
                type="button"
                onClick={() => openIssueModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Catat Barang Keluar</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Tanggal &amp; Referensi</th>
                    <th className="py-3 px-4 font-semibold">Material</th>
                    <th className="py-3 px-4 font-semibold">Gudang Asal</th>
                    <th className="py-3 px-4 font-semibold">Proyek / Tujuan</th>
                    <th className="py-3 px-4 font-semibold text-right">Qty Keluar</th>
                    <th className="py-3 px-4 font-semibold text-right">Perubahan Stok</th>
                    <th className="py-3 px-4 font-semibold">Petugas</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions
                    .filter((t) => t.type === 'Keluar' || t.type === 'Pemakaian')
                    .map((tx) => {
                      const mat = state.materials.find((m) => m.id === tx.material_id);
                      const prj = state.projects.find((p) => p.id === tx.project_id);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-[#13233C]">{tx.reference_no}</span>
                            <div className="text-[11px] text-slate-500 tabular-nums">{formatDateID(tx.date)}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{mat?.name ?? '-'}</td>
                          <td className="py-3 px-4 text-slate-600">{tx.warehouse_name || getWhName(tx.warehouse_id)}</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">
                              {prj ? `${prj.project_number} — ${prj.name}` : tx.source_or_destination || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-blue-700 tabular-nums whitespace-nowrap">
                            -{formatNumber(tx.qty)} {mat?.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {tx.stock_before !== undefined && tx.stock_after !== undefined
                              ? `${formatNumber(tx.stock_before)} → ${formatNumber(tx.stock_after)}`
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-700">{tx.pic_name}</td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDetailTx(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: DISTRIBUSI MATERIAL & SURAT JALAN DIGITAL                      */}
      {/* ===================================================================== */}
      {activeTab === 'surat-jalan' && (
        <div className="space-y-5">
          {projectDistributionSummary.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 no-print">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Ringkasan Distribusi Material per Proyek
                  </h2>
                  <p className="text-xs text-slate-500">
                    Akumulasi pengeluaran material dan status penerimaan Surat Jalan oleh Tim Lapangan.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {projectDistributionSummary.map((row) => (
                  <div
                    key={row.project_id}
                    className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#1D7AFC]">{row.project_number}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        SJ Selesai: {row.sj_selesai}/{row.sj_count}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 truncate">{row.project_name}</p>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 font-mono tabular-nums text-[11px] text-slate-700">
                      <span>{formatNumber(row.qty_keluar)} unit tersalurkan</span>
                      <span className="font-bold text-[#13233C]">
                        {formatRupiah(row.nilai_distribusi, true)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SuratJalanSection />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 8: STOK OPNAME                                                    */}
      {/* ===================================================================== */}
      {activeTab === 'opname' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">Stok Opname &amp; Penyesuaian Fisik</h2>
              <p className="text-xs text-slate-500">
                Lakukan verifikasi stok fisik gudang, hitung selisih otomatis terhadap stok sistem, dan unggah berita acara opname.
              </p>
            </div>
            {canLogistics && (
              <button
                type="button"
                onClick={() => openOpnameModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Catat Stok Opname</span>
              </button>
            )}
          </div>

          {filteredOpnames.length === 0 ? (
            <EmptyState
              title="Belum Ada Catatan Stok Opname"
              description="Klik Catat Stok Opname untuk melakukan pemeriksaan dan rekonsiliasi stok fisik gudang."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">No. Opname &amp; Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Material &amp; Gudang</th>
                      <th className="py-3 px-4 font-semibold text-right">Stok Sistem</th>
                      <th className="py-3 px-4 font-semibold text-right">Stok Fisik</th>
                      <th className="py-3 px-4 font-semibold text-right">Selisih</th>
                      <th className="py-3 px-4 font-semibold">Petugas &amp; Alasan</th>
                      <th className="py-3 px-4 font-semibold text-right">Lampiran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOpnames.map((op) => {
                      const mat = state.materials.find((m) => m.id === op.material_id);
                      return (
                        <tr key={op.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-[#13233C]">{op.opname_no}</span>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {formatDateID(op.opname_date)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {mat ? `${mat.code} — ${mat.name}` : op.material_id}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {op.warehouse_name || getWhName(op.warehouse_id)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatNumber(op.system_qty)} {op.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                            {formatNumber(op.physical_qty)} {op.unit}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                              op.variance_qty === 0
                                ? 'text-emerald-700'
                                : op.variance_qty > 0
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {op.variance_qty >= 0 ? `+${formatNumber(op.variance_qty)}` : formatNumber(op.variance_qty)}{' '}
                            {op.unit}
                          </td>
                          <td className="py-3 px-4 min-w-[200px]">
                            <div className="font-medium text-slate-800">{op.officer_name}</div>
                            <div className="text-[11px] text-slate-500">{op.reason}</div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <ModuleAttachmentToolbar
                              compact
                              moduleId="logistik"
                              entityId={op.id}
                              entityLabel={op.opname_no}
                              title={`Bukti Stok Opname ${op.opname_no}`}
                              subtitle="Berita acara opname dan foto fisik gudang"
                              defaultCategory="Laporan & Dokumentasi"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 9: RIWAYAT TRANSAKSI & AUDIT LOG                                  */}
      {/* ===================================================================== */}
      {activeTab === 'riwayat' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setHistoryMode('transaksi')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                    historyMode === 'transaksi' ? 'bg-white text-[#13233C]' : 'text-slate-600'
                  }`}
                >
                  Mutasi Stok ({filteredTransactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryMode('audit')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                    historyMode === 'audit' ? 'bg-white text-[#13233C]' : 'text-slate-600'
                  }`}
                >
                  Jejak Audit Gudang ({warehouseAuditLogs.length})
                </button>
              </div>

              {historyMode === 'transaksi' && (
                <>
                  <select
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value as 'SEMUA' | MaterialTxType)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="SEMUA">Semua Jenis</option>
                    <option value="Masuk">Barang Masuk</option>
                    <option value="Keluar">Barang Keluar</option>
                    <option value="Pemakaian">Pemakaian</option>
                    <option value="Penyesuaian Opname">Penyesuaian Opname</option>
                  </select>
                  <select
                    value={warehouseFilter}
                    onChange={(e) => setWarehouseFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="SEMUA">Semua Gudang</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="SEMUA">Semua Proyek</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_number} — {p.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <ModuleAttachmentToolbar
              compact
              moduleId="logistik"
              entityId="logistik-gudang"
              entityLabel="Arsip Dokumen Logistik"
              title="Dokumen & Arsip Logistik Material"
              subtitle="Kumpulan nota pembelian, surat jalan, foto pengiriman, dan berita acara gudang"
              defaultCategory="Surat Jalan / Nota Material"
            />
          </div>

          {historyMode === 'transaksi' ? (
            filteredTransactions.length === 0 ? (
              <EmptyState
                title="Belum Ada Transaksi Sesuai Filter"
                description="Sesuaikan filter jenis transaksi, gudang, proyek, atau kata kunci pencarian."
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Tanggal &amp; Referensi</th>
                        <th className="py-3 px-4 font-semibold">Material</th>
                        <th className="py-3 px-4 font-semibold">Gudang &amp; Proyek</th>
                        <th className="py-3 px-4 font-semibold">Jenis</th>
                        <th className="py-3 px-4 font-semibold text-right">Qty</th>
                        <th className="py-3 px-4 font-semibold text-right">Stok Sebelum → Sesudah</th>
                        <th className="py-3 px-4 font-semibold">Petugas</th>
                        <th className="py-3 px-4 font-semibold text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((tx) => {
                        const mat = state.materials.find((m) => m.id === tx.material_id);
                        const prj = state.projects.find((p) => p.id === tx.project_id);
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-mono font-bold text-[#13233C]">{tx.reference_no}</span>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                {formatDateID(tx.date)}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{mat?.name ?? '-'}</td>
                            <td className="py-3 px-4">
                              <div className="text-slate-700">{tx.warehouse_name || getWhName(tx.warehouse_id)}</div>
                              <div className="text-[11px] text-slate-500">
                                {prj ? `${prj.project_number} — ${prj.name}` : tx.source_or_destination || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <StatusLabel status={tx.type} />
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                              {formatNumber(tx.qty)} {mat?.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {tx.stock_before !== undefined && tx.stock_after !== undefined
                                ? `${formatNumber(tx.stock_before)} → ${formatNumber(tx.stock_after)}`
                                : '-'}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{tx.pic_name}</td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setDetailTx(tx)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Detail</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Waktu</th>
                      <th className="py-3 px-4 font-semibold">Aksi &amp; Ref</th>
                      <th className="py-3 px-4 font-semibold">Material</th>
                      <th className="py-3 px-4 font-semibold text-right">Delta</th>
                      <th className="py-3 px-4 font-semibold">Pelaksana</th>
                      <th className="py-3 px-4 font-semibold">Keterangan Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {warehouseAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Belum ada catatan audit gudang.
                        </td>
                      </tr>
                    ) : (
                      warehouseAuditLogs.slice(0, 100).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                            {formatDateTimeID(log.timestamp)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-[#13233C]">{log.action}</div>
                            <div className="text-[11px] font-mono text-slate-500">{log.ref_no}</div>
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{log.material_name}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {log.qty_delta > 0
                              ? `+${formatNumber(log.qty_delta)}`
                              : formatNumber(log.qty_delta)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="text-slate-800">{log.actor_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {log.actor_division} · {log.actor_role}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{log.detail}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 10: LAPORAN LOGISTIK                                              */}
      {/* ===================================================================== */}
      {activeTab === 'laporan' && (
        <div className="space-y-4">
          {/* Report Selector + Exports */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-[#13233C]">
                  Pusat Laporan Operasional Logistik
                </h2>
                <p className="text-xs text-slate-500">
                  {REPORT_TABS.find((t) => t.key === reportCategory)?.desc}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintReportA4}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak A4</span>
                </button>
              </div>
            </div>

            {/* Report Type Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {REPORT_TABS.map((rt) => (
                <button
                  key={rt.key}
                  type="button"
                  onClick={() => setReportCategory(rt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 border ${
                    reportCategory === rt.key
                      ? 'bg-[#1D7AFC] text-white border-[#1D7AFC]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>

            {/* Report Filters: Proyek, Gudang, Periode, Jenis Transaksi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-1">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Proyek</label>
                <select
                  value={reportProjectFilter}
                  onChange={(e) => setReportProjectFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="SEMUA">Semua Proyek</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Lokasi Gudang</label>
                <select
                  value={reportWarehouseFilter}
                  onChange={(e) => setReportWarehouseFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="SEMUA">Semua Lokasi Gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Periode Mulai</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Periode Akhir</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Jenis Transaksi</label>
                <select
                  value={reportTxTypeFilter}
                  onChange={(e) => setReportTxTypeFilter(e.target.value as 'SEMUA' | MaterialTxType)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="SEMUA">Semua Jenis Transaksi</option>
                  <option value="Masuk">Barang Masuk</option>
                  <option value="Keluar">Barang Keluar</option>
                  <option value="Pemakaian">Pemakaian</option>
                  <option value="Penyesuaian Opname">Penyesuaian Opname</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live Preview Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Material Terfilter</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#13233C] mt-0.5">
                {formatNumber(reportDataset.summary.totalMaterialJenis)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Total Stok</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#13233C] mt-0.5">
                {formatNumber(reportDataset.summary.totalStokUnit)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Nilai Persediaan</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[#13233C] mt-0.5">
                {formatRupiah(reportDataset.summary.totalNilaiPersediaan, true)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Stok Minimum</p>
              <p className="text-lg font-bold font-mono tabular-nums text-amber-700 mt-0.5">
                {formatNumber(reportDataset.summary.totalStokMinimum)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Qty Masuk</p>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                +{formatNumber(reportDataset.summary.totalMasukQty)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Qty Keluar</p>
              <p className="text-lg font-bold font-mono tabular-nums text-blue-700 mt-0.5">
                -{formatNumber(reportDataset.summary.totalKeluarQty)}
              </p>
            </div>
          </div>

          {/* Dynamic Report Table Preview */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              {reportCategory === 'persediaan' && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Kode</th>
                      <th className="py-3 px-4 font-semibold">Nama Material</th>
                      <th className="py-3 px-4 font-semibold">Kategori</th>
                      <th className="py-3 px-4 font-semibold">Gudang</th>
                      <th className="py-3 px-4 font-semibold text-right">Stok</th>
                      <th className="py-3 px-4 font-semibold text-right">Min. Stok</th>
                      <th className="py-3 px-4 font-semibold text-right">Nilai Stok</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportDataset.mats.map((m) => {
                      const qty =
                        reportWarehouseFilter === 'SEMUA'
                          ? m.stock
                          : getWhStock(m, reportWarehouseFilter);
                      const status =
                        qty <= 0 ? 'Stok Habis' : qty <= m.min_stock ? 'Stok Minimum' : 'Stok Aman';
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono font-bold text-[#1D7AFC]">{m.code}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{m.name}</td>
                          <td className="py-2.5 px-4 text-slate-600">{m.category}</td>
                          <td className="py-2.5 px-4 text-slate-600">{m.warehouse_location}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">
                            {formatNumber(qty)} {m.unit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                            {formatNumber(m.min_stock)} {m.unit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {formatRupiah(qty * m.unit_cost)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`font-semibold ${
                                qty <= 0
                                  ? 'text-red-700'
                                  : qty <= m.min_stock
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {reportCategory === 'mutasi' && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Referensi</th>
                      <th className="py-3 px-4 font-semibold">Jenis</th>
                      <th className="py-3 px-4 font-semibold">Material</th>
                      <th className="py-3 px-4 font-semibold text-right">Qty</th>
                      <th className="py-3 px-4 font-semibold">Gudang</th>
                      <th className="py-3 px-4 font-semibold">Proyek / Tujuan</th>
                      <th className="py-3 px-4 font-semibold">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportDataset.txs.map((t) => {
                      const mat = state.materials.find((m) => m.id === t.material_id);
                      const prj = state.projects.find((p) => p.id === t.project_id);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 tabular-nums">{formatDateID(t.date)}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-[#13233C]">{t.reference_no}</td>
                          <td className="py-2.5 px-4"><StatusLabel status={t.type} /></td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{mat?.name ?? '-'}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">
                            {formatNumber(t.qty)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{t.warehouse_name || '-'}</td>
                          <td className="py-2.5 px-4 text-slate-700">
                            {prj ? `${prj.project_number} — ${prj.name}` : t.source_or_destination || '-'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{t.pic_name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {reportCategory === 'distribusi' && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">No. Proyek</th>
                      <th className="py-3 px-4 font-semibold">Nama Proyek</th>
                      <th className="py-3 px-4 font-semibold text-right">Transaksi Keluar</th>
                      <th className="py-3 px-4 font-semibold text-right">Qty Disalurkan</th>
                      <th className="py-3 px-4 font-semibold text-right">Total SJ</th>
                      <th className="py-3 px-4 font-semibold text-right">SJ Selesai</th>
                      <th className="py-3 px-4 font-semibold text-right">Estimasi Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportDataset.distRows.map((r) => (
                      <tr key={r.project_id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-[#1D7AFC]">{r.project_number}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{r.project_name}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNumber(r.tx_count)}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">{formatNumber(r.qty_keluar)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNumber(r.sj_count)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                          {formatNumber(r.sj_selesai)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">
                          {formatRupiah(r.nilai_distribusi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportCategory === 'opname' && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">No. Opname</th>
                      <th className="py-3 px-4 font-semibold">Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Material</th>
                      <th className="py-3 px-4 font-semibold">Gudang</th>
                      <th className="py-3 px-4 font-semibold text-right">Sistem</th>
                      <th className="py-3 px-4 font-semibold text-right">Fisik</th>
                      <th className="py-3 px-4 font-semibold text-right">Selisih</th>
                      <th className="py-3 px-4 font-semibold">Petugas &amp; Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportDataset.opns.map((o) => {
                      const mat = state.materials.find((m) => m.id === o.material_id);
                      return (
                        <tr key={o.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono font-bold text-[#13233C]">{o.opname_no}</td>
                          <td className="py-2.5 px-4 tabular-nums">{formatDateID(o.opname_date)}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{mat?.name ?? '-'}</td>
                          <td className="py-2.5 px-4 text-slate-600">{o.warehouse_name || '-'}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNumber(o.system_qty)} {o.unit}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">{formatNumber(o.physical_qty)} {o.unit}</td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono font-bold tabular-nums ${
                              o.variance_qty === 0
                                ? 'text-emerald-700'
                                : o.variance_qty > 0
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {o.variance_qty >= 0 ? '+' : ''}
                            {formatNumber(o.variance_qty)} {o.unit}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">
                            {o.officer_name} · {o.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {reportCategory === 'pengiriman' && (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">No. Surat Jalan</th>
                      <th className="py-3 px-4 font-semibold">Tanggal Kirim</th>
                      <th className="py-3 px-4 font-semibold">Proyek Tujuan</th>
                      <th className="py-3 px-4 font-semibold">Gudang Asal</th>
                      <th className="py-3 px-4 font-semibold">Pengirim / Driver</th>
                      <th className="py-3 px-4 font-semibold">Penerima Lapangan</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportDataset.dns.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-[#1D7AFC]">{d.sj_number}</td>
                        <td className="py-2.5 px-4 tabular-nums">{formatDateID(d.delivery_date)}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          {d.project_number} — {d.project_name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{d.source_warehouse_name || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {d.sender_name} · {d.driver_name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{d.recipient_name}</td>
                        <td className="py-2.5 px-4">
                          <StatusLabel status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODALS & DRAWERS                                                      */}
      {/* ===================================================================== */}

      {/* 1. Detail Transaksi Modal (Inline Inspection + Attachments) */}
      <Modal
        open={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title={detailTx ? `Detail Transaksi ${detailTx.reference_no}` : 'Detail Transaksi'}
        subtitle="Rincian pergerakan stok, sumber/tujuan, dan lampiran dokumen transaksi"
        maxWidth="max-w-3xl"
      >
        {detailTx && (() => {
          const mat = state.materials.find((m) => m.id === detailTx.material_id);
          const prj = state.projects.find((p) => p.id === detailTx.project_id);
          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div>
                  <span className="text-slate-500 block">No. Referensi</span>
                  <span className="font-mono font-bold text-[#13233C]">{detailTx.reference_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Jenis Transaksi</span>
                  <StatusLabel status={detailTx.type} />
                </div>
                <div>
                  <span className="text-slate-500 block">Tanggal</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatDateID(detailTx.date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Jumlah (Qty)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatNumber(detailTx.qty)} {mat?.unit ?? ''}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-200 rounded-xl p-3.5">
                <div>
                  <span className="text-slate-500 block">Material</span>
                  <span className="font-semibold text-slate-900">
                    {mat ? `${mat.code} — ${mat.name}` : detailTx.material_id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Lokasi Gudang</span>
                  <span className="font-semibold text-slate-900">
                    {detailTx.warehouse_name || getWhName(detailTx.warehouse_id)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Proyek Terkait</span>
                  <span className="font-semibold text-slate-900">
                    {prj ? `${prj.project_number} — ${prj.name}` : 'Non-Proyek / Gudang'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Stok Sebelum → Sesudah</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {detailTx.stock_before !== undefined && detailTx.stock_after !== undefined
                      ? `${formatNumber(detailTx.stock_before)} → ${formatNumber(detailTx.stock_after)} ${
                          mat?.unit ?? ''
                        }`
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Sumber / Tujuan</span>
                  <span className="text-slate-800">{detailTx.source_or_destination || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Petugas &amp; Bukti Ref</span>
                  <span className="text-slate-800">
                    {detailTx.pic_name} · Ref: <span className="font-mono">{detailTx.proof_ref || '-'}</span>
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Catatan Transaksi</span>
                  <p className="text-slate-800 mt-0.5">{detailTx.notes || '-'}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <AttachmentPanel
                  compact
                  moduleId="logistik"
                  entityId={detailTx.id}
                  entityLabel={`${detailTx.reference_no} — ${mat?.name ?? 'Transaksi'}`}
                  heading={`Dokumen & Foto Bukti (${detailTxRelatedAttachments.length} terkait)`}
                  subtitle="Unggah nota, surat jalan, foto barang masuk/keluar, atau berita acara untuk transaksi ini"
                  defaultCategory="Surat Jalan / Nota Material"
                />
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 2. Master Lokasi Gudang Modal */}
      <Modal
        open={warehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        title={editingWarehouse ? `Edit Lokasi Gudang — ${editingWarehouse.code}` : 'Tambah Lokasi Gudang Baru'}
        subtitle="Kelola alamat, penanggung jawab (PIC), dan status operasional gudang"
      >
        <form onSubmit={handleSubmitWarehouse} className="space-y-4 text-xs">
          {whFormError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {whFormError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kode Gudang *</label>
              <input
                type="text"
                required
                value={whForm.code}
                onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">PIC Gudang</label>
              <input
                type="text"
                value={whForm.pic_name}
                onChange={(e) => setWhForm({ ...whForm, pic_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nama Gudang *</label>
            <input
              type="text"
              required
              value={whForm.name}
              onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
              placeholder="Contoh: Gudang Material Cabang Bekasi Barat"
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap *</label>
            <input
              type="text"
              required
              value={whForm.address}
              onChange={(e) => setWhForm({ ...whForm, address: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
            <textarea
              rows={2}
              value={whForm.notes}
              onChange={(e) => setWhForm({ ...whForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setWarehouseModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
            >
              Simpan Gudang
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Master Data Material Add/Edit Modal */}
      <Modal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        title={editingMaterial ? `Edit Material — ${editingMaterial.code}` : 'Tambah Master Data Material'}
        subtitle="Lengkapi kode, kategori, satuan, lokasi gudang penyimpanan, dan batas stok minimum"
      >
        <form onSubmit={handleSubmitMaterial} className="space-y-4 text-xs">
          {matFormError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {matFormError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kode Material *</label>
              <input
                type="text"
                required
                value={matForm.code}
                onChange={(e) => setMatForm({ ...matForm, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kategori *</label>
              <select
                value={matForm.category}
                onChange={(e) => setMatForm({ ...matForm, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nama Material *</label>
            <input
              type="text"
              required
              value={matForm.name}
              onChange={(e) => setMatForm({ ...matForm, name: e.target.value })}
              placeholder="Contoh: Semen Portland Tiga Roda 50 Kg"
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Satuan *</label>
              <select
                value={matForm.unit}
                onChange={(e) => setMatForm({ ...matForm, unit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Stok Minimum *</label>
              <input
                type="number"
                min={0}
                required
                value={matForm.min_stock}
                onChange={(e) => setMatForm({ ...matForm, min_stock: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Harga Satuan (Rp) *</label>
              <input
                type="number"
                min={0}
                required
                value={matForm.unit_cost}
                onChange={(e) => setMatForm({ ...matForm, unit_cost: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lokasi Gudang Utama *</label>
            <select
              required
              value={matForm.default_warehouse_id}
              onChange={(e) => setMatForm({ ...matForm, default_warehouse_id: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
            >
              {activeWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan / Spesifikasi</label>
            <textarea
              rows={2}
              value={matForm.sku_notes}
              onChange={(e) => setMatForm({ ...matForm, sku_notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          {!editingMaterial && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
              Material baru dibuat dengan stok awal 0. Penambahan kuantitas stok dilakukan melalui menu Barang Masuk setelah pengadaan disetujui dan diterima fisik.
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setMaterialModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
            >
              Simpan Material
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Ajukan Pengadaan Barang Masuk Modal */}
      <Modal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title="Ajukan Pengadaan Barang Masuk"
        subtitle="Pengajuan akan diteruskan ke Finance untuk persetujuan pembiayaan sebelum konfirmasi terima gudang"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4 text-xs">
          {orderError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {orderError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pilih Material *</label>
              <select
                required
                value={orderForm.material_id}
                onChange={(e) => {
                  const m = state.materials.find((x) => x.id === e.target.value);
                  setOrderForm({
                    ...orderForm,
                    material_id: e.target.value,
                    warehouse_id: m?.default_warehouse_id || defaultWarehouseId,
                    unit_cost: m?.unit_cost ?? orderForm.unit_cost,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Stok: {formatNumber(m.stock)} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Gudang Tujuan *</label>
              <select
                required
                value={orderForm.warehouse_id}
                onChange={(e) => setOrderForm({ ...orderForm, warehouse_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Qty Rencana ({orderSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={orderForm.qty_planned}
                onChange={(e) => setOrderForm({ ...orderForm, qty_planned: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estimasi Harga Satuan (Rp)</label>
              <input
                type="number"
                min={0}
                value={orderForm.unit_cost}
                onChange={(e) => setOrderForm({ ...orderForm, unit_cost: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Pengajuan *</label>
              <input
                type="date"
                required
                value={orderForm.order_date}
                onChange={(e) => setOrderForm({ ...orderForm, order_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Supplier / Vendor *</label>
              <input
                type="text"
                required
                value={orderForm.source_name}
                onChange={(e) => setOrderForm({ ...orderForm, source_name: e.target.value })}
                placeholder="Contoh: PT Semen Nusantara Abadi"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Referensi / Penawaran / PO *</label>
              <input
                type="text"
                required
                value={orderForm.proof_ref}
                onChange={(e) => setOrderForm({ ...orderForm, proof_ref: e.target.value })}
                placeholder="Contoh: PO/LOG/2026/041"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Terkait (Opsional)</label>
              <select
                value={orderForm.project_id}
                onChange={(e) => setOrderForm({ ...orderForm, project_id: e.target.value, rab_item_id: '' })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">Stok Gudang Umum</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Item RAB (Opsional)</label>
              <select
                value={orderForm.rab_item_id}
                onChange={(e) => setOrderForm({ ...orderForm, rab_item_id: e.target.value })}
                disabled={!orderForm.project_id}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100"
              >
                <option value="">-- Tidak terikat item RAB --</option>
                {orderProjectRabs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.category} — {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan Pengadaan</label>
            <textarea
              rows={2}
              value={orderForm.notes}
              onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <ModuleAttachmentToolbar
              compact
              moduleId="logistik"
              entityId={orderDraftAttachKey}
              entityLabel={orderForm.proof_ref || 'Lampiran Pengadaan'}
              title="Dokumen Penawaran / Nota Supplier"
              subtitle="Unggah dokumen pendukung pengadaan barang"
              defaultCategory="Surat Jalan / Nota Material"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
              >
                Simpan Pengajuan
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 5. Konfirmasi Penerimaan Barang Masuk Modal */}
      <Modal
        open={Boolean(receiptTarget)}
        onClose={() => setReceiptTarget(null)}
        title={receiptTarget ? `Konfirmasi Terima Fisik — ${receiptTarget.order_no}` : 'Konfirmasi Penerimaan'}
        subtitle="Stok gudang akan bertambah otomatis sesuai jumlah aktual yang diterima"
        maxWidth="max-w-3xl"
      >
        {receiptTarget && (
          <form onSubmit={handleSubmitReceipt} className="space-y-4 text-xs">
            {receiptError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
                {receiptError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Gudang Penerima *</label>
                <select
                  required
                  value={receiptForm.warehouse_id}
                  onChange={(e) => setReceiptForm({ ...receiptForm, warehouse_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Diterima *</label>
                <input
                  type="date"
                  required
                  value={receiptForm.received_date}
                  onChange={(e) => setReceiptForm({ ...receiptForm, received_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Qty Aktual Diterima ({receiptTarget.unit}) *
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={receiptForm.qty_actual}
                  onChange={(e) => setReceiptForm({ ...receiptForm, qty_actual: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sumber / Supplier *</label>
                <input
                  type="text"
                  required
                  value={receiptForm.source_name}
                  onChange={(e) => setReceiptForm({ ...receiptForm, source_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. Surat Jalan / Nota *</label>
                <input
                  type="text"
                  required
                  value={receiptForm.proof_ref}
                  onChange={(e) => setReceiptForm({ ...receiptForm, proof_ref: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan Pemeriksaan Fisik *</label>
              <textarea
                rows={2}
                required
                value={receiptForm.inspection_note}
                onChange={(e) => setReceiptForm({ ...receiptForm, inspection_note: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <ModuleAttachmentToolbar
                compact
                moduleId="logistik"
                entityId={receiptTarget.id}
                entityLabel={receiptTarget.order_no}
                title={`Foto & Nota Penerimaan ${receiptTarget.order_no}`}
                subtitle="Unggah foto barang datang dan surat jalan supplier"
                defaultCategory="Surat Jalan / Nota Material"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={workflowBusy}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  Konfirmasi Terima &amp; Tambah Stok
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* 6. Catat Barang Keluar Modal */}
      <Modal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        title="Catat Barang Keluar Gudang"
        subtitle="Pengeluaran stok otomatis tervalidasi terhadap stok tersedia di gudang terpilih"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmitIssue} className="space-y-4 text-xs">
          {issueError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {issueError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Material *</label>
              <select
                required
                value={issueForm.material_id}
                onChange={(e) => {
                  const m = state.materials.find((x) => x.id === e.target.value);
                  setIssueForm({
                    ...issueForm,
                    material_id: e.target.value,
                    warehouse_id: m?.default_warehouse_id || issueForm.warehouse_id,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Total: {formatNumber(m.stock)} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Gudang Asal *</label>
              <select
                required
                value={issueForm.warehouse_id}
                onChange={(e) => setIssueForm({ ...issueForm, warehouse_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name} (Stok: {formatNumber(getWhStock(issueSelectedMat, w.id))}{' '}
                    {issueSelectedMat?.unit || ''})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Tujuan *</label>
              <select
                required
                value={issueForm.project_id}
                onChange={(e) => {
                  const prj = activeProjects.find((p) => p.id === e.target.value);
                  setIssueForm({
                    ...issueForm,
                    project_id: e.target.value,
                    rab_item_id: '',
                    source_or_destination: prj ? `Lapangan ${prj.project_number}` : '',
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">-- Pilih Proyek --</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Item RAB / Permintaan (Opsional)</label>
              <select
                value={issueForm.request_id}
                onChange={(e) => setIssueForm({ ...issueForm, request_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">Pengeluaran langsung tanpa SPM</option>
                {approvedUnissuedRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.request_number} — {r.notes.slice(0, 45)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Qty Keluar ({issueSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={issueForm.qty}
                onChange={(e) => setIssueForm({ ...issueForm, qty: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal *</label>
              <input
                type="date"
                required
                value={issueForm.date}
                onChange={(e) => setIssueForm({ ...issueForm, date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Bukti / Surat Jalan *</label>
              <input
                type="text"
                required
                value={issueForm.proof_ref}
                onChange={(e) => setIssueForm({ ...issueForm, proof_ref: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tujuan / Penerima Lapangan</label>
              <input
                type="text"
                value={issueForm.source_or_destination}
                onChange={(e) => setIssueForm({ ...issueForm, source_or_destination: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kaitkan Item RAB (Opsional)</label>
              <select
                value={issueForm.rab_item_id}
                onChange={(e) => setIssueForm({ ...issueForm, rab_item_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">-- Umum Proyek --</option>
                {issueProjectRabs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.category} — {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan Pengeluaran</label>
            <textarea
              rows={2}
              value={issueForm.notes}
              onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <ModuleAttachmentToolbar
              compact
              moduleId="logistik"
              entityId={issueDraftAttachKey}
              entityLabel={issueForm.proof_ref || 'Bukti Barang Keluar'}
              title="Foto & Bukti Pengeluaran Barang"
              subtitle="Unggah foto muat barang atau bukti serah terima"
              defaultCategory="Surat Jalan / Nota Material"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIssueModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
              >
                Simpan Barang Keluar
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 7. Stok Opname Modal */}
      <Modal
        open={opnameModalOpen}
        onClose={() => setOpnameModalOpen(false)}
        title="Catat Stok Opname & Rekonsiliasi"
        subtitle="Sesuaikan stok sistem dengan hasil penghitungan fisik di gudang"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmitOpname} className="space-y-4 text-xs">
          {opnameError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {opnameError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Material *</label>
              <select
                required
                value={opnameForm.material_id}
                onChange={(e) => {
                  const m = state.materials.find((x) => x.id === e.target.value);
                  const whId = m?.default_warehouse_id || opnameForm.warehouse_id;
                  setOpnameForm({
                    ...opnameForm,
                    material_id: e.target.value,
                    warehouse_id: whId,
                    physical_qty: getWhStock(m, whId),
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Lokasi Gudang *</label>
              <select
                required
                value={opnameForm.warehouse_id}
                onChange={(e) =>
                  setOpnameForm({
                    ...opnameForm,
                    warehouse_id: e.target.value,
                    physical_qty: getWhStock(opnameSelectedMat, e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const sysQty = getWhStock(opnameSelectedMat, opnameForm.warehouse_id);
            const variance = Math.round((Number(opnameForm.physical_qty) - sysQty) * 100) / 100;
            return (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Stok Tercatat Sistem</span>
                  <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                    {formatNumber(sysQty)} {opnameSelectedMat?.unit || ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Stok Fisik</span>
                  <span className="font-mono font-bold text-[#1D7AFC] text-sm tabular-nums">
                    {formatNumber(opnameForm.physical_qty)} {opnameSelectedMat?.unit || ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Selisih</span>
                  <span
                    className={`font-mono font-bold text-sm tabular-nums ${
                      variance === 0
                        ? 'text-emerald-700'
                        : variance > 0
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {variance >= 0 ? `+${formatNumber(variance)}` : formatNumber(variance)}{' '}
                    {opnameSelectedMat?.unit || ''}
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Stok Fisik Aktual *</label>
              <input
                type="number"
                min={0}
                step="any"
                required
                value={opnameForm.physical_qty}
                onChange={(e) => setOpnameForm({ ...opnameForm, physical_qty: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Opname *</label>
              <input
                type="date"
                required
                value={opnameForm.opname_date}
                onChange={(e) => setOpnameForm({ ...opnameForm, opname_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Berita Acara</label>
              <input
                type="text"
                value={opnameForm.proof_ref}
                onChange={(e) => setOpnameForm({ ...opnameForm, proof_ref: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kondisi Fisik Barang *</label>
            <input
              type="text"
              required
              value={opnameForm.condition_note}
              onChange={(e) => setOpnameForm({ ...opnameForm, condition_note: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Alasan &amp; Keterangan Hasil Opname *
            </label>
            <textarea
              rows={2}
              required
              value={opnameForm.reason}
              onChange={(e) => setOpnameForm({ ...opnameForm, reason: e.target.value })}
              placeholder="Jelaskan temuan fisik atau penyebab selisih stok..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <ModuleAttachmentToolbar
              compact
              moduleId="logistik"
              entityId={opnameDraftAttachKey}
              entityLabel={opnameForm.proof_ref || 'Berita Acara Opname'}
              title="Foto & Berita Acara Opname"
              subtitle="Unggah foto pemeriksaan fisik dan dokumen berita acara"
              defaultCategory="Laporan & Dokumentasi"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpnameModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
              >
                Simpan Stok Opname
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 8. Buat Permintaan Material Modal */}
      <Modal
        open={reqModalOpen}
        onClose={() => setReqModalOpen(false)}
        title="Ajukan Permintaan Material Proyek"
        subtitle="Alur: Diajukan → Persetujuan Head → Pemrosesan Gudang Logistik → Diserahkan → Dikonfirmasi Penerima"
      >
        <form onSubmit={(e) => handleSubmitRequest(e, false)} className="space-y-4 text-xs">
          {reqError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              {reqError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Tujuan *</label>
              <select
                required
                value={reqForm.project_id}
                onChange={(e) => setReqForm({ ...reqForm, project_id: e.target.value, rab_item_id: '' })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Item RAB (Opsional)</label>
              <select
                value={reqForm.rab_item_id}
                onChange={(e) => setReqForm({ ...reqForm, rab_item_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">-- Umum Proyek --</option>
                {reqProjectRabs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.category} — {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Material *</label>
              <select
                required
                value={reqForm.material_id}
                onChange={(e) => setReqForm({ ...reqForm, material_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Stok: {formatNumber(m.stock)} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Qty Diminta *</label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={reqForm.qty_requested}
                onChange={(e) => setReqForm({ ...reqForm, qty_requested: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tanggal Dibutuhkan *</label>
            <input
              type="date"
              required
              value={reqForm.needed_date}
              onChange={(e) => setReqForm({ ...reqForm, needed_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Keterangan Kebutuhan *</label>
            <textarea
              rows={3}
              required
              value={reqForm.notes}
              onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
              placeholder="Jelaskan area pekerjaan dan urgensi material..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setReqModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmitRequest(e, true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-semibold cursor-pointer"
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span>Draft Offline</span>
            </button>
            {isOnline && (
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
              >
                Ajukan Permintaan
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* 9. Confirm Dialogs */}
      <ConfirmDialog
        open={Boolean(reqDecisionTarget)}
        onCancel={() => setReqDecisionTarget(null)}
        onConfirm={async (note) => {
          if (!reqDecisionTarget) return;
          await advanceWarehouseMaterialRequestApi(reqDecisionTarget.request.id, {
            next_status: reqDecisionTarget.nextStatus,
            note,
          });
          setReqDecisionTarget(null);
        }}
        title={reqDecisionTarget?.title ?? ''}
        description={reqDecisionTarget?.description ?? ''}
        danger={reqDecisionTarget?.danger}
        requireNote={reqDecisionTarget?.requireNote}
        confirmLabel="Ya, Lanjutkan"
      />

      <ConfirmDialog
        open={Boolean(financeDecisionTarget)}
        onCancel={() => setFinanceDecisionTarget(null)}
        onConfirm={async (note) => {
          if (!financeDecisionTarget) return;
          await decideWarehouseOrderFinanceApi(financeDecisionTarget.order.id, {
            decision: financeDecisionTarget.decision,
            note,
          });
          setFinanceDecisionTarget(null);
        }}
        title={
          financeDecisionTarget?.decision === 'APPROVE'
            ? `Setujui Pengadaan ${financeDecisionTarget?.order.order_no}?`
            : `Tolak Pengadaan ${financeDecisionTarget?.order.order_no}?`
        }
        description={
          financeDecisionTarget?.decision === 'APPROVE'
            ? 'Pengadaan yang disetujui dapat langsung dikonfirmasi penerimaannya oleh Logistik.'
            : 'Berikan alasan penolakan pengadaan.'
        }
        danger={financeDecisionTarget?.decision === 'REJECT'}
        requireNote={financeDecisionTarget?.decision === 'REJECT'}
        confirmLabel={financeDecisionTarget?.decision === 'APPROVE' ? 'Setujui' : 'Tolak'}
      />

      {/* 10. Project Logistics Workflow Modal */}
      <Modal
        open={Boolean(logisticsWfProject)}
        onClose={() => setLogisticsWfProject(null)}
        title={
          logisticsWfProject
            ? `Proses Logistik Proyek ${logisticsWfProject.project_number}`
            : 'Proses Logistik Proyek'
        }
        subtitle={logisticsWfProject?.name}
        maxWidth="max-w-5xl"
      >
        {logisticsWfProject && (
          <ProjectWorkflowPanel project={logisticsWfProject} initialTab="logistik" />
        )}
      </Modal>
    </div>
  );
};
