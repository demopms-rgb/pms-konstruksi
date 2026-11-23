import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit3,
  History,
  Lock,
  PackageCheck,
  PackagePlus,
  Plus,
  ShieldCheck,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import {
  Material,
  MaterialRequest,
  MaterialRequestStatus,
  WarehouseLocation,
  WarehouseStockOrder,
  WarehouseSubmenuKey,
} from '../../types/pms';
import {
  formatDateID,
  formatDateTimeID,
  formatNumber,
  formatRupiah,
} from '../../utils/format';
import {
  canApproveMaterialRequestHead,
  canFieldMaterialRequest,
  canFinanceWarehouseAction,
  canLogisticsWarehouseAction,
  GUDANG_PERSEDIAAN_SUBMENUS,
} from '../../utils/permissions';
import { ConfirmDialog, EmptyState, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { SuratJalanSection } from './SuratJalanSection';

const CATEGORIES = [
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

const UNIT_OPTIONS = ['Sak', 'Zak', 'm3', 'Batang', 'Dus', 'Pail', 'Roll', 'Buah', 'Kg', 'Lembar', 'Set', 'Unit'];

export const GudangModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    gudangSubmenu,
    setGudangSubmenu,
    workflowBusy,
    showToast,
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
  const { openAttachmentModal, getAttachmentsFor } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';

  const canFinance = canFinanceWarehouseAction(roleCode, divCode);
  const canLogistics = canLogisticsWarehouseAction(roleCode, divCode);
  const canFieldRequest = canFieldMaterialRequest(roleCode, divCode);
  const canHeadApprove = canApproveMaterialRequestHead(roleCode, divCode);
  const canManageWarehouses = canLogistics || canFinance;

  const warehouses = useMemo(() => state.warehouses ?? [], [state.warehouses]);
  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.is_active),
    [warehouses]
  );
  const defaultWh = activeWarehouses[0] ?? warehouses[0];
  const defaultWarehouseId = defaultWh?.id ?? 'wh-depok';

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
    if (!warehouseId) return fallbackName || defaultWh?.name || 'Gudang Utama PT. Wilwa, Depok';
    const found = warehouses.find((w) => w.id === warehouseId);
    return found?.name || fallbackName || defaultWh?.name || 'Gudang Utama PT. Wilwa, Depok';
  };

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [warehouseFilter, setWarehouseFilter] = useState('SEMUA');
  const [txTypeFilter, setTxTypeFilter] = useState('SEMUA');
  const [projectFilter, setProjectFilter] = useState('SEMUA');

  // Master Data Lokasi Gudang Modal
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseLocation | null>(null);
  const [whAssignTarget, setWhAssignTarget] = useState<'material' | 'order' | null>(null);
  const [whFormError, setWhFormError] = useState('');
  const [whForm, setWhForm] = useState({
    code: '',
    name: '',
    address: '',
    pic_name: '',
    notes: '',
    is_active: true,
  });

  // Master Data Barang Modal
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [matFormError, setMatFormError] = useState('');
  const [matForm, setMatForm] = useState({
    code: '',
    name: '',
    category: CATEGORIES[0],
    unit: 'Sak',
    min_stock: 20,
    default_warehouse_id: defaultWarehouseId,
    unit_cost: 75000,
    sku_notes: '',
  });

  // Finance Add Qty / Procurement Modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderMode, setOrderMode] = useState<'finance-add' | 'logistics-propose'>('finance-add');
  const [orderError, setOrderError] = useState('');
  const [orderForm, setOrderForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: state.materials[0]?.default_warehouse_id ?? defaultWarehouseId,
    qty_planned: 50,
    order_date: new Date().toISOString().slice(0, 10),
    source_name: '',
    proof_ref: '',
    unit_cost: state.materials[0]?.unit_cost ?? 0,
    project_id: '',
    rab_item_id: '',
    notes: '',
  });

  // Finance Approve/Reject Order Confirm Dialog
  const [financeDecisionTarget, setFinanceDecisionTarget] = useState<{
    order: WarehouseStockOrder;
    decision: 'APPROVE' | 'REJECT';
  } | null>(null);

  // Logistics Confirm Goods Received Modal
  const [receiptTarget, setReceiptTarget] = useState<WarehouseStockOrder | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptForm, setReceiptForm] = useState({
    warehouse_id: defaultWarehouseId,
    qty_actual: 0,
    received_date: new Date().toISOString().slice(0, 10),
    source_name: '',
    proof_ref: '',
    inspection_note: 'Kondisi baik, kemasan utuh, jumlah sesuai fisik.',
  });

  // Logistics Issue Goods (Barang Keluar) Modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issueForm, setIssueForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: state.materials[0]?.default_warehouse_id ?? defaultWarehouseId,
    project_id: state.projects.find((p) => !p.is_deleted)?.id ?? '',
    rab_item_id: '',
    request_id: '',
    qty: 10,
    date: new Date().toISOString().slice(0, 10),
    source_or_destination: '',
    proof_ref: '',
    notes: '',
  });

  // Material Request Modal (Tim Lapangan)
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqForm, setReqForm] = useState({
    project_id: state.projects.find((p) => !p.is_deleted)?.id ?? '',
    rab_item_id: '',
    material_id: state.materials[0]?.id ?? '',
    qty_requested: 25,
    needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    notes: '',
  });

  // Advance Material Request Confirm Dialog
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
  const [opnameForm, setOpnameForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: state.materials[0]?.default_warehouse_id ?? defaultWarehouseId,
    opname_date: new Date().toISOString().slice(0, 10),
    physical_qty: 0,
    condition_note: 'Baik & layak pakai',
    reason: '',
    proof_ref: '',
  });

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const warehouseOrders = state.warehouseOrders ?? [];
  const stockOpnames = state.stockOpnames ?? [];
  const warehouseAuditLogs = state.warehouseAuditLogs ?? [];

  // Map project RAB material needs to warehouse material IDs
  const rabRequirementSummaryByMaterial = useMemo(() => {
    const map = new Map<
      string,
      {
        plannedNeed: number;
        issued: number;
        projectNames: string[];
      }
    >();

    for (const wf of state.workflows) {
      const prj = activeProjects.find((p) => p.id === wf.project_id);
      if (!prj) continue;
      for (const need of wf.material_needs) {
        const cur = map.get(need.material_id) ?? { plannedNeed: 0, issued: 0, projectNames: [] };
        cur.plannedNeed += need.qty_needed;
        cur.issued += need.qty_issued;
        if (!cur.projectNames.includes(prj.project_number)) {
          cur.projectNames.push(prj.project_number);
        }
        map.set(need.material_id, cur);
      }
    }

    for (const pm of state.projectMaterials) {
      if (pm.is_deleted || !pm.material_id) continue;
      const prj = activeProjects.find((p) => p.id === pm.project_id);
      if (!prj) continue;
      if (!map.has(pm.material_id)) {
        map.set(pm.material_id, {
          plannedNeed: pm.volume,
          issued: 0,
          projectNames: [prj.project_number],
        });
      }
    }
    return map;
  }, [state.workflows, state.projectMaterials, activeProjects]);

  const kpis = useMemo(() => {
    const totalItems = state.materials.length;
    const totalStockValue = state.materials.reduce((sum, m) => sum + m.stock * m.unit_cost, 0);
    const lowStockItems = state.materials.filter((m) => m.stock <= m.min_stock);
    const pendingFinanceOrders = warehouseOrders.filter(
      (o) => o.status === 'Menunggu Persetujuan Finance'
    );
    const readyForReceiptOrders = warehouseOrders.filter((o) => o.status === 'Disetujui Finance');
    const pendingRequests = state.materialRequests.filter((r) =>
      ['Menunggu Head', 'Disetujui Head', 'Diproses Logistik'].includes(r.status)
    );
    return {
      totalItems,
      totalStockValue,
      lowStockItems,
      pendingFinanceOrders,
      readyForReceiptOrders,
      pendingRequests,
    };
  }, [state.materials, warehouseOrders, state.materialRequests]);

  const warehouseSummaryList = useMemo(() => {
    return warehouses.map((wh) => {
      let itemCount = 0;
      let totalQty = 0;
      let totalValue = 0;
      for (const m of state.materials) {
        const qty = getWhStock(m, wh.id);
        if (qty > 0 || m.default_warehouse_id === wh.id) {
          itemCount += 1;
        }
        totalQty += qty;
        totalValue += qty * m.unit_cost;
      }
      return {
        warehouse: wh,
        itemCount,
        totalQty: Math.round(totalQty * 100) / 100,
        totalValue: Math.round(totalValue),
      };
    });
  }, [warehouses, state.materials]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.materials.filter((m) => {
      if (categoryFilter !== 'SEMUA' && m.category !== categoryFilter) return false;
      if (warehouseFilter !== 'SEMUA') {
        const qtyAtWh = getWhStock(m, warehouseFilter);
        if (m.default_warehouse_id !== warehouseFilter && qtyAtWh <= 0) return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.warehouse_location.toLowerCase().includes(q)
      );
    });
  }, [state.materials, categoryFilter, warehouseFilter, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouseOrders.filter((o) => {
      if (warehouseFilter !== 'SEMUA' && (o.warehouse_id || 'wh-depok') !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      const mat = state.materials.find((m) => m.id === o.material_id);
      return (
        o.order_no.toLowerCase().includes(q) ||
        o.source_name.toLowerCase().includes(q) ||
        o.proof_ref.toLowerCase().includes(q) ||
        o.requested_by_name.toLowerCase().includes(q) ||
        (o.warehouse_name?.toLowerCase().includes(q) ?? false) ||
        (mat?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [warehouseOrders, state.materials, warehouseFilter, search]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.materialTransactions.filter((t) => {
      if (txTypeFilter !== 'SEMUA' && t.type !== txTypeFilter) return false;
      if (projectFilter !== 'SEMUA' && t.project_id !== projectFilter) return false;
      if (warehouseFilter !== 'SEMUA' && (t.warehouse_id || 'wh-depok') !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      const mat = state.materials.find((m) => m.id === t.material_id);
      const prj = state.projects.find((p) => p.id === t.project_id);
      return (
        t.reference_no.toLowerCase().includes(q) ||
        (t.proof_ref?.toLowerCase().includes(q) ?? false) ||
        t.pic_name.toLowerCase().includes(q) ||
        (t.warehouse_name?.toLowerCase().includes(q) ?? false) ||
        (t.source_or_destination?.toLowerCase().includes(q) ?? false) ||
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
    search,
  ]);

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

  // Modal Openers
  const openManageWarehousesModal = (assignTo: 'material' | 'order' | null = null) => {
    if (!canManageWarehouses) {
      showToast('Hanya Divisi Logistik, Finance, atau Super Admin yang dapat mengelola Lokasi Gudang.');
      return;
    }
    setWhAssignTarget(assignTo);
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

  const openEditWarehouse = (wh: WarehouseLocation) => {
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
  };

  const handleSubmitWarehouseLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhFormError('');
    const res = editingWarehouse
      ? await updateWarehouseLocationApi(editingWarehouse.id, whForm)
      : await createWarehouseLocationApi(whForm);
    if (!res.ok) {
      setWhFormError(res.message);
      return;
    }
    if (res.warehouse) {
      if (whAssignTarget === 'material') {
        setMatForm((p) => ({ ...p, default_warehouse_id: res.warehouse!.id }));
      } else if (whAssignTarget === 'order') {
        setOrderForm((p) => ({ ...p, warehouse_id: res.warehouse!.id }));
      }
    }
    setEditingWarehouse(null);
    setWhForm({
      code: `GDG-DPK-${String(warehouses.length + 2).padStart(2, '0')}`,
      name: '',
      address: '',
      pic_name: currentUser?.full_name ?? '',
      notes: '',
      is_active: true,
    });
    if (whAssignTarget) {
      setWarehouseModalOpen(false);
      setWhAssignTarget(null);
    }
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

  const openCreateMaterial = () => {
    if (!canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang dapat menambah data barang.');
      return;
    }
    setEditingMaterial(null);
    setMatFormError('');
    setMatForm({
      code: `MAT-${String(state.materials.length + 12).padStart(3, '0')}`,
      name: '',
      category: CATEGORIES[0],
      unit: 'Sak',
      min_stock: 20,
      default_warehouse_id:
        warehouseFilter !== 'SEMUA' ? warehouseFilter : defaultWarehouseId,
      unit_cost: 75000,
      sku_notes: '',
    });
    setMaterialModalOpen(true);
  };

  const openEditMaterial = (mat: Material) => {
    if (!canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang dapat mengubah data barang.');
      return;
    }
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

  const openStockOrderModal = (mode: 'finance-add' | 'logistics-propose', presetMaterial?: Material) => {
    if (mode === 'finance-add' && !canFinance) {
      showToast('Hanya Divisi Finance atau Super Admin yang memiliki akses Tambah Qty Stok.');
      return;
    }
    if (mode === 'logistics-propose' && !canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang dapat mengajukan pengadaan barang.');
      return;
    }
    const targetMat = presetMaterial ?? state.materials[0];
    const presetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    setOrderMode(mode);
    setOrderError('');
    setOrderForm({
      material_id: targetMat?.id ?? '',
      warehouse_id: presetWhId,
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

  const openConfirmReceiptModal = (order: WarehouseStockOrder) => {
    if (!canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang berwenang mengonfirmasi barang diterima.');
      return;
    }
    const mat = state.materials.find((m) => m.id === order.material_id);
    setReceiptTarget(order);
    setReceiptError('');
    setReceiptForm({
      warehouse_id: order.warehouse_id || mat?.default_warehouse_id || defaultWarehouseId,
      qty_actual: order.qty_planned,
      received_date: new Date().toISOString().slice(0, 10),
      source_name: order.source_name,
      proof_ref: order.proof_ref,
      inspection_note: 'Kondisi fisik baik, spesifikasi dan jumlah sesuai nota pengiriman.',
    });
  };

  const openIssueModal = (presetMaterial?: Material) => {
    if (!canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang berwenang mencatat Barang Keluar.');
      return;
    }
    const targetMat = presetMaterial ?? state.materials[0];
    const targetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    const whStock = getWhStock(targetMat, targetWhId);
    const defaultPrj = activeProjects[0];
    setIssueError('');
    setIssueForm({
      material_id: targetMat?.id ?? '',
      warehouse_id: targetWhId,
      project_id: defaultPrj?.id ?? '',
      rab_item_id: '',
      request_id: '',
      qty: Math.min(10, Math.max(1, whStock || 1)),
      date: new Date().toISOString().slice(0, 10),
      source_or_destination: defaultPrj ? `Lapangan ${defaultPrj.project_number}` : '',
      proof_ref: `SJ/WAS/${new Date().toISOString().slice(0, 7).replace('-', '')}/${String(
        state.materialTransactions.length + 1
      ).padStart(3, '0')}`,
      notes: '',
    });
    setIssueModalOpen(true);
  };

  const openMaterialRequestModal = () => {
    if (!canFieldRequest) {
      showToast('Anda tidak memiliki hak akses untuk mengajukan permintaan material.');
      return;
    }
    setReqError('');
    setReqForm({
      project_id: activeProjects[0]?.id ?? '',
      rab_item_id: '',
      material_id: state.materials[0]?.id ?? '',
      qty_requested: 20,
      needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      notes: '',
    });
    setReqModalOpen(true);
  };

  const openOpnameModal = (presetMaterial?: Material) => {
    if (!canLogistics) {
      showToast('Hanya Divisi Logistik atau Super Admin yang berwenang melakukan Stok Opname.');
      return;
    }
    const targetMat = presetMaterial ?? state.materials[0];
    const targetWhId =
      warehouseFilter !== 'SEMUA'
        ? warehouseFilter
        : targetMat?.default_warehouse_id || defaultWarehouseId;
    setOpnameError('');
    setOpnameForm({
      material_id: targetMat?.id ?? '',
      warehouse_id: targetWhId,
      opname_date: new Date().toISOString().slice(0, 10),
      physical_qty: getWhStock(targetMat, targetWhId),
      condition_note: 'Kondisi baik & layak pakai',
      reason: '',
      proof_ref: '',
    });
    setOpnameModalOpen(true);
  };

  // Submit Handlers
  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setMatFormError('');
    const chosenWh = warehouses.find((w) => w.id === matForm.default_warehouse_id);
    if (!chosenWh) {
      setMatFormError('Pilih Lokasi Gudang terlebih dahulu dari master Data Gudang.');
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
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError('');
    if (!orderForm.warehouse_id) {
      setOrderError('Lokasi Gudang tujuan wajib dipilih.');
      return;
    }
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
    const res = await confirmWarehouseReceiptApi(receiptTarget.id, {
      warehouse_id: receiptForm.warehouse_id,
      qty_actual: Number(receiptForm.qty_actual),
      received_date: receiptForm.received_date,
      source_name: receiptForm.source_name,
      proof_ref: receiptForm.proof_ref,
      inspection_note: receiptForm.inspection_note,
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
        `Stok ${selectedMat.name} di ${getWhName(issueForm.warehouse_id)} tidak mencukupi (tersedia ${whStock} ${selectedMat.unit}). Stok minus dicegah sistem.`
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

  const handleSubmitMaterialRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError('');
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
    const res = await createStockOpnameApi({
      material_id: opnameForm.material_id,
      warehouse_id: opnameForm.warehouse_id,
      opname_date: opnameForm.opname_date,
      physical_qty: Number(opnameForm.physical_qty),
      condition_note: opnameForm.condition_note,
      reason: opnameForm.reason,
      proof_ref: opnameForm.proof_ref,
    });
    if (!res.ok) {
      setOpnameError(res.message);
      return;
    }
    setOpnameModalOpen(false);
  };

  const orderSelectedMat = state.materials.find((m) => m.id === orderForm.material_id);
  const issueSelectedMat = state.materials.find((m) => m.id === issueForm.material_id);
  const opnameSelectedMat = state.materials.find((m) => m.id === opnameForm.material_id);
  const reqSelectedMat = state.materials.find((m) => m.id === reqForm.material_id);

  const issueProjectRabItems = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === issueForm.project_id),
    [state.budgets, issueForm.project_id]
  );

  const reqProjectRabItems = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === reqForm.project_id),
    [state.budgets, reqForm.project_id]
  );

  const orderProjectRabItems = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === orderForm.project_id),
    [state.budgets, orderForm.project_id]
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

  return (
    <div className="space-y-5">
      {/* Header & Role Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
              Gudang & Persediaan
            </h1>
            <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700">
              {currentDivision?.name} · {currentRole?.name}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Alur persediaan terintegrasi RAB proyek: Persetujuan Pengadaan Finance → Konfirmasi Penerimaan Logistik → Stok Otomatis Bertambah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ModuleAttachmentToolbar
            moduleId="gudang"
            entityId="gudang-persediaan"
            entityLabel="Gudang & Persediaan"
            title="Bukti Transaksi & Berita Acara Gudang"
            subtitle="Unggah nota pembelian, surat jalan, bukti transfer pengadaan, dan berita acara opname"
            defaultCategory="Surat Jalan / Nota Material"
            compact
          />

          {canManageWarehouses && (
            <button
              type="button"
              onClick={() => openManageWarehousesModal(null)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer whitespace-nowrap"
            >
              <Warehouse className="w-3.5 h-3.5 text-[#1D7AFC]" />
              <span>Lokasi Gudang ({activeWarehouses.length})</span>
            </button>
          )}

          {canFinance && (
            <button
              type="button"
              onClick={() => openStockOrderModal('finance-add')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap shadow-xs"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Tambah Stok / Tambah Qty</span>
            </button>
          )}

          {canLogistics && (
            <>
              <button
                type="button"
                onClick={openCreateMaterial}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Data Barang</span>
              </button>
              <button
                type="button"
                onClick={() => openIssueModal()}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
                <span>Catat Barang Keluar</span>
              </button>
              <button
                type="button"
                onClick={() => openOpnameModal()}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer whitespace-nowrap"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Stok Opname</span>
              </button>
              <button
                type="button"
                onClick={() => setGudangSubmenu('surat-jalan')}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-xl cursor-pointer whitespace-nowrap"
              >
                <Truck className="w-3.5 h-3.5 text-amber-700" />
                <span>Surat Jalan Digital</span>
              </button>
            </>
          )}

          {canFieldRequest && (
            <button
              type="button"
              onClick={openMaterialRequestModal}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer whitespace-nowrap"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Ajukan Permintaan Material</span>
            </button>
          )}
        </div>
      </div>

      {/* Synchronized Submenu Strip (all 9 submenus) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto no-print">
        <div className="flex items-center gap-1 min-w-max">
          {GUDANG_PERSEDIAAN_SUBMENUS.map((sub) => {
            const active = gudangSubmenu === sub.key;
            let badge: number | null = null;
            if (sub.key === 'barang-masuk') {
              badge = kpis.pendingFinanceOrders.length + kpis.readyForReceiptOrders.length;
            } else if (sub.key === 'permintaan-material') {
              badge = kpis.pendingRequests.length;
            } else if (sub.key === 'stok-minimum') {
              badge = kpis.lowStockItems.length;
            } else if (sub.key === 'surat-jalan') {
              badge = (state.deliveryNotes ?? []).filter(
                (d) =>
                  !d.is_deleted &&
                  [
                    'Draft',
                    'Menunggu Pengiriman',
                    'Dalam Pengiriman',
                    'Menunggu Konfirmasi Penerimaan',
                  ].includes(d.status)
              ).length;
            }
            return (
              <button
                key={sub.key}
                type="button"
                onClick={() => setGudangSubmenu(sub.key as WarehouseSubmenuKey)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#13233C] text-[#FBC02D] shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{sub.label}</span>
                {badge !== null && badge > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                      active
                        ? 'bg-[#FBC02D] text-[#13233C]'
                        : sub.key === 'stok-minimum'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. DASHBOARD GUDANG */}
      {gudangSubmenu === 'dashboard' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Total Master Barang</span>
                <Boxes className="w-4 h-4 text-[#1D7AFC]" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-[#13233C] mt-2">
                {formatNumber(kpis.totalItems)} Item
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Terhubung ke {activeProjects.length} proyek aktif
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Nilai Persediaan Gudang</span>
                <Warehouse className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-[#13233C] mt-2">
                {formatRupiah(kpis.totalStockValue, true)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Berdasarkan stok aktual x harga satuan
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Barang di Bawah Stok Minimum</span>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-2">
                {kpis.lowStockItems.length} Item
              </p>
              <button
                type="button"
                onClick={() => setGudangSubmenu('stok-minimum')}
                className="text-[11px] font-semibold text-[#1D7AFC] hover:underline mt-1 cursor-pointer"
              >
                Lihat daftar stok minimum →
              </button>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Antrean Barang Masuk</span>
                <Truck className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-[#13233C] mt-2">
                {kpis.pendingFinanceOrders.length + kpis.readyForReceiptOrders.length} Order
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {kpis.pendingFinanceOrders.length} tunggu Finance · {kpis.readyForReceiptOrders.length} siap terima Logistik
              </p>
            </div>
          </div>

          {/* Ringkasan Stok per Lokasi Gudang */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-[#13233C]">
                  Sebaran Stok per Lokasi Gudang ({warehouses.length} Lokasi)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pencatatan kuantitas dan nilai persediaan dipisahkan berdasarkan masing-masing lokasi gudang
                </p>
              </div>
              {canManageWarehouses && (
                <button
                  type="button"
                  onClick={() => openManageWarehousesModal(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-[#13233C] cursor-pointer"
                >
                  + Kelola / Tambah Gudang
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {warehouseSummaryList.map(({ warehouse: wh, itemCount, totalQty, totalValue }) => (
                <div
                  key={wh.id}
                  className={`border rounded-xl p-3.5 text-xs space-y-2 ${
                    wh.is_active
                      ? 'border-slate-200 bg-slate-50/70'
                      : 'border-slate-200 bg-slate-100/80 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-[#1D7AFC]">{wh.code}</span>
                      <p className="font-bold text-slate-900 mt-0.5">{wh.name}</p>
                      <p className="text-[11px] text-slate-500">{wh.address}</p>
                    </div>
                    <StatusLabel status={wh.is_active ? 'Aktif' : 'Nonaktif'} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
                    <div>
                      <p className="text-slate-500">Jenis Item</p>
                      <p className="font-mono font-bold text-slate-900">{itemCount} SKU</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Total Qty</p>
                      <p className="font-mono font-bold text-slate-900">{formatNumber(totalQty)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nilai Stok</p>
                      <p className="font-mono font-bold text-emerald-700">
                        {formatRupiah(totalValue, true)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">PIC: {wh.pic_name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseFilter(wh.id);
                        setGudangSubmenu('stok-barang');
                      }}
                      className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                    >
                      Lihat Stok Gudang Ini →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Incoming Stock Queue (Finance Approval -> Logistics Confirmation) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Alur Penambahan Stok & Konfirmasi Penerimaan
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Stok baru bertambah otomatis setelah Finance setuju & Logistik konfirmasi diterima
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGudangSubmenu('barang-masuk')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Buka Barang Masuk
                </button>
              </div>

              {warehouseOrders.filter((o) => o.status !== 'Diterima Gudang' && o.status !== 'Ditolak Finance').length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  Belum ada pengadaan atau penambahan stok yang menunggu persetujuan Finance maupun konfirmasi penerimaan Logistik.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {warehouseOrders
                    .filter((o) => o.status !== 'Diterima Gudang' && o.status !== 'Ditolak Finance')
                    .slice(0, 6)
                    .map((order) => {
                      const mat = state.materials.find((m) => m.id === order.material_id);
                      return (
                        <div key={order.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#1D7AFC]">{order.order_no}</span>
                              <StatusLabel status={order.status} />
                            </div>
                            <p className="font-semibold text-slate-900 mt-1">
                              {mat?.name ?? order.material_id} ·{' '}
                              <span className="font-mono">{formatNumber(order.qty_planned)} {order.unit}</span>
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Sumber: {order.source_name} · Bukti: {order.proof_ref}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {order.status === 'Menunggu Persetujuan Finance' && canFinance && (
                              <>
                                <button
                                  type="button"
                                  disabled={workflowBusy}
                                  onClick={() => setFinanceDecisionTarget({ order, decision: 'APPROVE' })}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                >
                                  Setujui
                                </button>
                                <button
                                  type="button"
                                  disabled={workflowBusy}
                                  onClick={() => setFinanceDecisionTarget({ order, decision: 'REJECT' })}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold cursor-pointer"
                                >
                                  Tolak
                                </button>
                              </>
                            )}
                            {order.status === 'Disetujui Finance' && canLogistics && (
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() => openConfirmReceiptModal(order)}
                                className="px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer inline-flex items-center gap-1"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>Konfirmasi Diterima</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* RAB Material Linkage Summary */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-[#13233C]">
                    Kebutuhan Material Terhubung RAB Proyek
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Perbandingan rencana RAB proyek terhadap stok gudang saat ini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGudangSubmenu('stok-barang')}
                  className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Cek Stok Barang
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Material</th>
                      <th className="py-2 px-3 font-semibold text-right">Kebutuhan RAB</th>
                      <th className="py-2 px-3 font-semibold text-right">Dikeluarkan</th>
                      <th className="py-2 px-3 font-semibold text-right">Stok Gudang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.materials
                      .filter((m) => rabRequirementSummaryByMaterial.has(m.id))
                      .slice(0, 6)
                      .map((m) => {
                        const rabInfo = rabRequirementSummaryByMaterial.get(m.id)!;
                        const remainingNeed = Math.max(0, rabInfo.plannedNeed - rabInfo.issued);
                        return (
                          <tr key={m.id}>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{m.name}</div>
                              <div className="text-[11px] text-slate-500">
                                {rabInfo.projectNames.join(', ')}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatNumber(rabInfo.plannedNeed)} {m.unit}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatNumber(rabInfo.issued)} {m.unit}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                              <span
                                className={
                                  m.stock < remainingNeed ? 'text-red-700' : 'text-emerald-700'
                                }
                              >
                                {formatNumber(m.stock)} {m.unit}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent Warehouse Audit Trail */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1D7AFC]" />
                <h2 className="text-sm font-bold text-[#13233C]">
                  Jejak Audit Gudang Terbaru
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGudangSubmenu('riwayat-transaksi')}
                className="text-xs font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
              >
                Lihat Semua Riwayat
              </button>
            </div>
            {warehouseAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada catatan audit mutasi gudang baru pada sesi database saat ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {warehouseAuditLogs.slice(0, 5).map((aud) => (
                  <div key={aud.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#13233C]">{aud.ref_no}</span> ·{' '}
                      <span className="font-semibold text-slate-900">{aud.material_name}</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{aud.detail}</p>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-500">
                      <div className="font-semibold text-slate-800">
                        {aud.actor_name} ({aud.actor_division})
                      </div>
                      <div>{formatDateTimeID(aud.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. DATA BARANG (Master Data — Logistik CRUD, others Read-only) */}
      {gudangSubmenu === 'data-barang' && (
        <div className="space-y-4">
          {!canLogistics && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Anda melihat master Data Barang dalam mode baca. Penambahan & perubahan Data Barang dikelola oleh Divisi Logistik.
              </span>
            </div>
          )}

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari kode barang, nama barang, kategori, atau lokasi gudang..."
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Kategori</option>
              {Array.from(new Set(state.materials.map((m) => m.category))).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Lokasi Gudang</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            {canManageWarehouses && (
              <button
                type="button"
                onClick={() => openManageWarehousesModal(null)}
                className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <Warehouse className="w-3.5 h-3.5 text-[#1D7AFC]" />
                <span>Kelola Gudang</span>
              </button>
            )}
            {canLogistics && (
              <button
                type="button"
                onClick={openCreateMaterial}
                className="px-3.5 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Data Barang</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode & Nama Barang</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold">Satuan</th>
                  <th className="py-3 px-4 font-semibold">Lokasi Gudang & Sebaran</th>
                  <th className="py-3 px-4 font-semibold text-right">Stok Min.</th>
                  <th className="py-3 px-4 font-semibold text-right">Harga Satuan</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMaterials.map((m) => {
                  const attCount = getAttachmentsFor('gudang', m.id).length;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#1D7AFC]">{m.code}</div>
                        <div className="font-semibold text-slate-900">{m.name}</div>
                        {m.sku_notes && (
                          <div className="text-[11px] text-slate-500">{m.sku_notes}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{m.category}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{m.unit}</td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium text-slate-800">{m.warehouse_location}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {warehouses.map((w) => {
                            const qty = getWhStock(m, w.id);
                            if (qty <= 0 && m.default_warehouse_id !== w.id) return null;
                            return (
                              <span
                                key={w.id}
                                className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700"
                              >
                                {w.code}: {formatNumber(qty)} {m.unit}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatNumber(m.min_stock)} {m.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatRupiah(m.unit_cost)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            openAttachmentModal({
                              moduleId: 'gudang',
                              entityId: m.id,
                              entityLabel: `${m.code} — ${m.name}`,
                              title: `Lampiran Barang: ${m.name}`,
                              defaultCategory: 'Foto Material / Aset',
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                        >
                          Lampiran {attCount > 0 ? `(${attCount})` : ''}
                        </button>
                        {canLogistics && (
                          <button
                            type="button"
                            onClick={() => openEditMaterial(m)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold cursor-pointer inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. STOK BARANG (Live Stock + RAB Needs + Finance Tambah Qty) */}
      {gudangSubmenu === 'stok-barang' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari ketersediaan stok barang..."
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Kategori</option>
              {Array.from(new Set(state.materials.map((m) => m.category))).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Lokasi Gudang</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            {canFinance && (
              <button
                type="button"
                onClick={() => openStockOrderModal('finance-add')}
                className="px-3.5 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Tambah Stok / Tambah Qty (Finance)</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode & Nama Barang</th>
                  <th className="py-3 px-4 font-semibold">Rincian Stok per Gudang</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    {warehouseFilter === 'SEMUA' ? 'Total Stok Aktual' : 'Stok di Gudang Ini'}
                  </th>
                  <th className="py-3 px-4 font-semibold text-right">Stok Minimum</th>
                  <th className="py-3 px-4 font-semibold text-right">Kebutuhan RAB Proyek</th>
                  <th className="py-3 px-4 font-semibold">Status Stok</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMaterials.map((m) => {
                  const displayedStock =
                    warehouseFilter === 'SEMUA' ? m.stock : getWhStock(m, warehouseFilter);
                  const isLow = m.stock <= m.min_stock;
                  const rabInfo = rabRequirementSummaryByMaterial.get(m.id);
                  const pendingIncoming = warehouseOrders
                    .filter(
                      (o) =>
                        o.material_id === m.id &&
                        o.status === 'Disetujui Finance' &&
                        (warehouseFilter === 'SEMUA' ||
                          (o.warehouse_id || 'wh-depok') === warehouseFilter)
                    )
                    .reduce((s, o) => s + o.qty_planned, 0);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#1D7AFC]">{m.code}</div>
                        <div className="font-semibold text-slate-900">{m.name}</div>
                        <div className="text-[11px] text-slate-500">{m.category}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 min-w-[210px]">
                        <div className="text-[11px] font-medium text-slate-600 mb-1">
                          Utama: {m.warehouse_location}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {warehouses.map((w) => {
                            const qty = getWhStock(m, w.id);
                            if (qty <= 0 && m.default_warehouse_id !== w.id) return null;
                            return (
                              <span
                                key={w.id}
                                className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                                  warehouseFilter === w.id
                                    ? 'bg-blue-50 border-blue-300 text-blue-800 font-bold'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              >
                                {w.code}: {formatNumber(qty)} {m.unit}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        <span className={isLow ? 'text-red-700' : 'text-slate-900'}>
                          {formatNumber(displayedStock)} {m.unit}
                        </span>
                        {warehouseFilter !== 'SEMUA' && (
                          <div className="text-[10px] text-slate-500 font-normal">
                            Total semua gudang: {formatNumber(m.stock)} {m.unit}
                          </div>
                        )}
                        {pendingIncoming > 0 && (
                          <div className="text-[10px] text-blue-700 font-medium">
                            +{formatNumber(pendingIncoming)} dalam proses terima
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatNumber(m.min_stock)} {m.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {rabInfo ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {formatNumber(rabInfo.plannedNeed)} {m.unit}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {rabInfo.projectNames.join(', ')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={isLow ? 'Perlu Pengadaan' : 'Tersedia'} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canFinance && (
                          <button
                            type="button"
                            onClick={() => openStockOrderModal('finance-add', m)}
                            className="px-2.5 py-1 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
                          >
                            + Tambah Qty
                          </button>
                        )}
                        {canLogistics && (
                          <button
                            type="button"
                            onClick={() => openIssueModal(m)}
                            disabled={m.stock <= 0}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-semibold cursor-pointer"
                          >
                            Keluarkan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. BARANG MASUK (Finance Approval + Logistics Confirmation + Incoming Ledger) */}
      {gudangSubmenu === 'barang-masuk' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Cari nomor pengadaan, barang, sumber barang, atau bukti transaksi..."
              />
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
              >
                <option value="SEMUA">Semua Lokasi Gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canFinance && (
                <button
                  type="button"
                  onClick={() => openStockOrderModal('finance-add')}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>Tambah Stok / Tambah Qty (Finance)</span>
                </button>
              )}
              {canLogistics && (
                <button
                  type="button"
                  onClick={() => openStockOrderModal('logistics-propose')}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajukan Pengadaan ke Finance</span>
                </button>
              )}
            </div>
          </div>

          {/* Procurement & Incoming Queue */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#13233C]">
                  Antrean Pengadaan & Konfirmasi Penerimaan Barang Masuk
                </h2>
                <p className="text-[11px] text-slate-500">
                  Wajib melewati persetujuan Finance dan konfirmasi jumlah aktual Logistik sebelum stok bertambah di gudang tujuan
                </p>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Belum Ada Data Pengadaan Barang Masuk"
                  description="Finance dapat menekan tombol Tambah Stok / Tambah Qty, atau Logistik dapat mengajukan pengadaan barang ke Finance."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">No. Order & Tanggal</th>
                      <th className="py-2.5 px-4 font-semibold">Barang & Lokasi Gudang Tujuan</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Qty Rencana / Aktual</th>
                      <th className="py-2.5 px-4 font-semibold">Sumber Barang & Bukti</th>
                      <th className="py-2.5 px-4 font-semibold">Petugas</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order) => {
                      const mat = state.materials.find((m) => m.id === order.material_id);
                      const prj = order.project_id
                        ? state.projects.find((p) => p.id === order.project_id)
                        : null;
                      const attCount = getAttachmentsFor('gudang', order.id).length;
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-[#1D7AFC]">{order.order_no}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {formatDateID(order.order_date)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {mat?.name ?? order.material_id}
                            </div>
                            <div className="text-[11px] font-medium text-[#1D7AFC]">
                              Gudang: {getWhName(order.warehouse_id, order.warehouse_name)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {prj ? `Proyek ${prj.project_number}` : 'Stok Umum Gudang'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="font-bold text-slate-900">
                              {formatNumber(order.qty_planned)} {order.unit}
                            </div>
                            {order.stock_applied && (
                              <div className="text-[11px] text-emerald-700 font-semibold">
                                Aktual: +{formatNumber(order.qty_actual)} {order.unit}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">{order.source_name}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Bukti: {order.proof_ref}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-600">
                            <div>Ajuan: {order.requested_by_name}</div>
                            {order.finance_approved_by_name && (
                              <div>Finance: {order.finance_approved_by_name}</div>
                            )}
                            {order.received_by_name && (
                              <div className="text-emerald-700 font-semibold">
                                Terima: {order.received_by_name}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusLabel status={order.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openAttachmentModal({
                                  moduleId: 'gudang',
                                  entityId: order.id,
                                  entityLabel: `${order.order_no} — ${mat?.name ?? ''}`,
                                  title: `Bukti Transaksi ${order.order_no}`,
                                  defaultCategory: 'Surat Jalan / Nota Material',
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                            >
                              Bukti {attCount > 0 ? `(${attCount})` : ''}
                            </button>

                            {order.status === 'Menunggu Persetujuan Finance' && canFinance && (
                              <>
                                <button
                                  type="button"
                                  disabled={workflowBusy}
                                  onClick={() =>
                                    setFinanceDecisionTarget({ order, decision: 'APPROVE' })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                >
                                  Setujui Finance
                                </button>
                                <button
                                  type="button"
                                  disabled={workflowBusy}
                                  onClick={() =>
                                    setFinanceDecisionTarget({ order, decision: 'REJECT' })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold cursor-pointer"
                                >
                                  Tolak
                                </button>
                              </>
                            )}

                            {order.status === 'Disetujui Finance' && canLogistics && (
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() => openConfirmReceiptModal(order)}
                                className="px-3 py-1 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
                              >
                                Konfirmasi Barang Diterima
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recorded Incoming Transactions Ledger */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-[#13233C]">Riwayat Barang Masuk Tercatat</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Tanggal & Ref</th>
                    <th className="py-2.5 px-4 font-semibold">Barang</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Qty Masuk</th>
                    <th className="py-2.5 px-4 font-semibold">Sumber & Bukti</th>
                    <th className="py-2.5 px-4 font-semibold">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.materialTransactions
                    .filter(
                      (t) =>
                        t.type === 'Masuk' &&
                        (warehouseFilter === 'SEMUA' ||
                          (t.warehouse_id || 'wh-depok') === warehouseFilter)
                    )
                    .map((t) => {
                      const mat = state.materials.find((m) => m.id === t.material_id);
                      return (
                        <tr key={t.id}>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono">
                            <div className="font-bold text-[#1D7AFC]">{t.reference_no}</div>
                            <div className="text-[11px] text-slate-500">{formatDateID(t.date)}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{mat?.name ?? t.material_id}</div>
                            <div className="text-[11px] font-medium text-[#1D7AFC]">
                              Gudang: {getWhName(t.warehouse_id, t.warehouse_name)}
                            </div>
                            <div className="text-[11px] text-slate-500">{t.notes}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                            +{formatNumber(t.qty)} {mat?.unit}
                          </td>
                          <td className="py-2.5 px-4">
                            <div>{t.source_or_destination || '-'}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {t.proof_ref || t.reference_no}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{t.pic_name}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. BARANG KELUAR (Logistik Issues Goods -> Auto Deducts Stock, Blocks Minus & Double Deduction) */}
      {gudangSubmenu === 'barang-keluar' && (
        <div className="space-y-4">
          {!canLogistics && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Pencatatan Barang Keluar dilakukan oleh Divisi Logistik. Pengeluaran otomatis mengurangi stok dan mencegah stok minus atau pengurangan ganda.
              </span>
            </div>
          )}

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Cari barang keluar, nomor surat jalan, atau proyek..."
              />
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
              >
                <option value="SEMUA">Semua Gudang Asal</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            {canLogistics && (
              <button
                type="button"
                onClick={() => openIssueModal()}
                className="px-4 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4 text-[#FBC02D]" />
                <span>Catat Barang Keluar</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Ref / Surat Jalan & Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Material & Gudang Asal</th>
                  <th className="py-3 px-4 font-semibold">Proyek / Tujuan</th>
                  <th className="py-3 px-4 font-semibold text-right">Qty Keluar</th>
                  <th className="py-3 px-4 font-semibold text-right">Stok Sebelum → Sesudah</th>
                  <th className="py-3 px-4 font-semibold">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.materialTransactions
                  .filter(
                    (t) =>
                      (t.type === 'Keluar' || t.type === 'Pemakaian') &&
                      (warehouseFilter === 'SEMUA' ||
                        (t.warehouse_id || 'wh-depok') === warehouseFilter)
                  )
                  .map((t) => {
                    const mat = state.materials.find((m) => m.id === t.material_id);
                    const prj = state.projects.find((p) => p.id === t.project_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap font-mono">
                          <div className="font-bold text-[#1D7AFC]">{t.reference_no}</div>
                          <div className="text-[11px] text-slate-500">{formatDateID(t.date)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{mat?.name ?? t.material_id}</div>
                          <div className="text-[11px] font-medium text-[#1D7AFC]">
                            Asal: {getWhName(t.warehouse_id, t.warehouse_name)}
                          </div>
                          <div className="text-[11px] text-slate-500">{t.notes}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">
                            {prj ? `${prj.project_number} — ${prj.name}` : t.source_or_destination || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 tabular-nums">
                          -{formatNumber(t.qty)} {mat?.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {t.stock_before !== undefined && t.stock_after !== undefined
                            ? `${formatNumber(t.stock_before)} → ${formatNumber(t.stock_after)} ${mat?.unit ?? ''}`
                            : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{t.pic_name}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. PERMINTAAN MATERIAL (Tim Lapangan Submit -> Head Approve -> Logistik Handover -> Field Confirm) */}
      {gudangSubmenu === 'permintaan-material' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nomor SPM, nama proyek, atau keterangan kebutuhan..."
            />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Proyek</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
            {canFieldRequest && (
              <button
                type="button"
                onClick={openMaterialRequestModal}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajukan Permintaan Material</span>
              </button>
            )}
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyState
              title="Belum Ada Permintaan Material"
              description="Tim Lapangan dapat mengajukan permintaan material yang terhubung dengan proyek dan RAB."
            />
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const prj = state.projects.find((p) => p.id === req.project_id);
                const requester = state.employees.find((e) => e.id === req.requested_by_id);
                const rabItem = req.rab_item_id
                  ? state.budgets.find((b) => b.id === req.rab_item_id)
                  : null;
                const attCount = getAttachmentsFor('gudang', req.id).length;

                return (
                  <div
                    key={req.id}
                    className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#1D7AFC] text-sm">
                            {req.request_number}
                          </span>
                          <StatusLabel status={req.status} />
                          {req.stock_deducted && (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                              Stok Sudah Dikeluarkan
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-900 mt-1">
                          {prj ? `${prj.project_number} — ${prj.name}` : req.project_id}
                          {rabItem ? ` · Pos RAB: ${rabItem.work_item_name}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Diajukan oleh {requester?.full_name ?? '-'} · Dibutuhkan{' '}
                          {formatDateID(req.needed_date)}
                        </p>
                        {req.notes && (
                          <p className="text-xs text-slate-600 mt-1">{req.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            openAttachmentModal({
                              moduleId: 'gudang',
                              entityId: req.id,
                              entityLabel: `${req.request_number}`,
                              title: `Lampiran ${req.request_number}`,
                              defaultCategory: 'Surat Jalan / Nota Material',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Lampiran {attCount > 0 ? `(${attCount})` : ''}
                        </button>

                        {req.status === 'Menunggu Head' && canHeadApprove && (
                          <>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setReqDecisionTarget({
                                  request: req,
                                  nextStatus: 'Disetujui Head',
                                  title: `Setujui ${req.request_number}`,
                                  description: 'Setujui permintaan material ini untuk diproses oleh Divisi Logistik?',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              Setujui Head
                            </button>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setReqDecisionTarget({
                                  request: req,
                                  nextStatus: 'Ditolak Head',
                                  title: `Tolak ${req.request_number}`,
                                  description: 'Berikan alasan penolakan permintaan material ini.',
                                  danger: true,
                                  requireNote: true,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold cursor-pointer"
                            >
                              Tolak
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
                                note: 'Sedang disiapkan di gudang.',
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Proses Logistik
                          </button>
                        )}

                        {(req.status === 'Disetujui Head' || req.status === 'Diproses Logistik') &&
                          canLogistics &&
                          !req.stock_deducted && (
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setReqDecisionTarget({
                                  request: req,
                                  nextStatus: 'Diserahkan',
                                  title: `Serahkan Material ${req.request_number}`,
                                  description:
                                    'Stok gudang akan dikurangi otomatis sesuai jumlah disetujui (dengan validasi anti-minus dan anti-ganda). Lanjutkan?',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              Serahkan & Kurangi Stok
                            </button>
                          )}

                        {req.status === 'Diserahkan' && canFieldRequest && (
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() =>
                              setReqDecisionTarget({
                                request: req,
                                nextStatus: 'Dikonfirmasi Penerima',
                                title: `Konfirmasi Diterima ${req.request_number}`,
                                description:
                                  'Konfirmasi bahwa seluruh material telah diterima di lokasi proyek dalam kondisi baik.',
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Konfirmasi Diterima Lapangan
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-2 px-3 font-semibold">Material</th>
                            <th className="py-2 px-3 font-semibold text-right">Diminta</th>
                            <th className="py-2 px-3 font-semibold text-right">Disetujui</th>
                            <th className="py-2 px-3 font-semibold text-right">Diserahkan</th>
                            <th className="py-2 px-3 font-semibold text-right">Stok Gudang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {req.items.map((it) => {
                            const mat = state.materials.find((m) => m.id === it.material_id);
                            return (
                              <tr key={it.material_id}>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {mat?.name ?? it.material_id}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatNumber(it.qty_requested)} {mat?.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatNumber(it.qty_approved)} {mat?.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatNumber(it.qty_delivered)} {mat?.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  <span
                                    className={
                                      (mat?.stock ?? 0) < (it.qty_approved || it.qty_requested)
                                        ? 'text-red-700 font-bold'
                                        : 'text-emerald-700 font-semibold'
                                    }
                                  >
                                    {formatNumber(mat?.stock ?? 0)} {mat?.unit}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. STOK MINIMUM */}
      {gudangSubmenu === 'stok-minimum' && (
        <div className="space-y-4">
          {kpis.lowStockItems.length === 0 ? (
            <EmptyState
              title="Seluruh Stok Material Aman"
              description="Tidak ada barang yang berada pada atau di bawah ambang batas stok minimum."
            />
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Barang</th>
                    <th className="py-3 px-4 font-semibold text-right">Stok Aktual</th>
                    <th className="py-3 px-4 font-semibold text-right">Batas Minimum</th>
                    <th className="py-3 px-4 font-semibold text-right">Kekurangan / Saran Beli</th>
                    <th className="py-3 px-4 font-semibold text-right">Kebutuhan RAB</th>
                    <th className="py-3 px-4 font-semibold text-right">Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kpis.lowStockItems.map((m) => {
                    const shortfall = Math.max(0, m.min_stock * 2 - m.stock);
                    const rabInfo = rabRequirementSummaryByMaterial.get(m.id);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-[#1D7AFC]">{m.code}</div>
                          <div className="font-semibold text-slate-900">{m.name}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-red-700 tabular-nums">
                          {formatNumber(m.stock)} {m.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatNumber(m.min_stock)} {m.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-amber-700 tabular-nums">
                          +{formatNumber(shortfall)} {m.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {rabInfo ? `${formatNumber(rabInfo.plannedNeed)} ${m.unit}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          {canFinance && (
                            <button
                              type="button"
                              onClick={() => openStockOrderModal('finance-add', m)}
                              className="px-3 py-1 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
                            >
                              + Tambah Qty (Finance)
                            </button>
                          )}
                          {canLogistics && !canFinance && (
                            <button
                              type="button"
                              onClick={() => openStockOrderModal('logistics-propose', m)}
                              className="px-3 py-1 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
                            >
                              Ajukan Pengadaan
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 8. RIWAYAT TRANSAKSI & AUDIT LOG */}
      {gudangSubmenu === 'riwayat-transaksi' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari referensi transaksi, bukti, barang, atau petugas..."
            />
            <select
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Jenis Mutasi</option>
              <option value="Masuk">Barang Masuk</option>
              <option value="Keluar">Barang Keluar</option>
              <option value="Pemakaian">Pemakaian</option>
              <option value="Penyesuaian Opname">Penyesuaian Opname</option>
            </select>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Proyek</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
            >
              <option value="SEMUA">Semua Lokasi Gudang</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tanggal & Referensi</th>
                  <th className="py-3 px-4 font-semibold">Jenis</th>
                  <th className="py-3 px-4 font-semibold">Barang, Gudang & Catatan</th>
                  <th className="py-3 px-4 font-semibold text-right">Qty</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Stok</th>
                  <th className="py-3 px-4 font-semibold">Sumber / Tujuan & Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((t) => {
                  const mat = state.materials.find((m) => m.id === t.material_id);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        <div className="font-bold text-[#1D7AFC]">{t.reference_no}</div>
                        <div className="text-[11px] text-slate-500">{formatDateID(t.date)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${
                            t.type === 'Masuk'
                              ? 'bg-emerald-50 text-emerald-700'
                              : t.type === 'Penyesuaian Opname'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {t.type === 'Masuk' ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : t.type === 'Penyesuaian Opname' ? (
                            <History className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          {t.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{mat?.name ?? t.material_id}</div>
                        <div className="text-[11px] font-medium text-[#1D7AFC]">
                          Gudang: {getWhName(t.warehouse_id, t.warehouse_name)}
                        </div>
                        <div className="text-[11px] text-slate-500">{t.notes}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        {t.type === 'Masuk' ? '+' : t.type === 'Penyesuaian Opname' ? '' : '-'}
                        {formatNumber(t.qty)} {mat?.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {t.stock_before !== undefined && t.stock_after !== undefined
                          ? `${formatNumber(t.stock_before)} → ${formatNumber(t.stock_after)}`
                          : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{t.source_or_destination || '-'}</div>
                        <div className="text-[11px] text-slate-500">Petugas: {t.pic_name}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Complete Audit Log */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
            <h2 className="text-sm font-bold text-[#13233C]">
              Log Audit Aktivitas Persediaan ({warehouseAuditLogs.length})
            </h2>
            {warehouseAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada entri audit mutasi persediaan baru.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {warehouseAuditLogs.map((aud) => (
                  <div key={aud.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#13233C]">{aud.action}</span> ·{' '}
                      <span className="font-mono text-[#1D7AFC]">{aud.ref_no}</span> ·{' '}
                      <span className="font-semibold">{aud.material_name}</span>
                      <p className="text-[11px] text-slate-600 mt-0.5">{aud.detail}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-mono">
                      <div>
                        {aud.actor_name} ({aud.actor_role}/{aud.actor_division})
                      </div>
                      <div>{formatDateTimeID(aud.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. STOK OPNAME (Logistik Only) */}
      {gudangSubmenu === 'stok-opname' && (
        <div className="space-y-4">
          {!canLogistics && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Pelaksanaan dan pencatatan penyesuaian Stok Opname dilakukan oleh Divisi Logistik.
              </span>
            </div>
          )}

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#13233C]">
                Pemeriksaan Fisik & Rekonsiliasi Stok Opname
              </h2>
              <p className="text-[11px] text-slate-500">
                Bandingkan stok sistem dengan stok fisik gudang; selisih tercatat otomatis ke riwayat & audit log
              </p>
            </div>
            {canLogistics && (
              <button
                type="button"
                onClick={() => openOpnameModal()}
                className="px-4 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <ClipboardCheck className="w-4 h-4 text-[#FBC02D]" />
                <span>Input Stok Opname</span>
              </button>
            )}
          </div>

          {stockOpnames.length === 0 ? (
            <EmptyState
              title="Belum Ada Riwayat Stok Opname"
              description="Divisi Logistik dapat mencatat hasil hitung fisik gudang melalui tombol Input Stok Opname."
            />
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">No. Opname & Tanggal</th>
                    <th className="py-3 px-4 font-semibold">Barang & Lokasi Gudang</th>
                    <th className="py-3 px-4 font-semibold text-right">Stok Sistem</th>
                    <th className="py-3 px-4 font-semibold text-right">Stok Fisik</th>
                    <th className="py-3 px-4 font-semibold text-right">Selisih</th>
                    <th className="py-3 px-4 font-semibold">Alasan & Kondisi</th>
                    <th className="py-3 px-4 font-semibold">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockOpnames
                    .filter(
                      (op) =>
                        warehouseFilter === 'SEMUA' ||
                        (op.warehouse_id || 'wh-depok') === warehouseFilter
                    )
                    .map((op) => {
                      const mat = state.materials.find((m) => m.id === op.material_id);
                      return (
                        <tr key={op.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            <div className="font-bold text-[#1D7AFC]">{op.opname_no}</div>
                            <div className="text-[11px] text-slate-500">{formatDateID(op.opname_date)}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {mat?.name ?? op.material_id}
                            </div>
                            <div className="text-[11px] font-medium text-[#1D7AFC]">
                              Gudang: {getWhName(op.warehouse_id, op.warehouse_name)}
                            </div>
                          </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatNumber(op.system_qty)} {op.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          {formatNumber(op.physical_qty)} {op.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          <span
                            className={
                              op.variance_qty < 0
                                ? 'text-red-700'
                                : op.variance_qty > 0
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                            }
                          >
                            {op.variance_qty > 0 ? `+${op.variance_qty}` : op.variance_qty} {op.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800">{op.reason}</div>
                          <div className="text-[11px] text-slate-500">{op.condition_note}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{op.officer_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 10. SURAT JALAN DIGITAL */}
      {gudangSubmenu === 'surat-jalan' && <SuratJalanSection />}

      {/* MODAL 1: Data Barang Master CRUD (Logistik) */}
      <Modal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        title={editingMaterial ? `Edit Data Barang: ${editingMaterial.code}` : 'Tambah Data Barang Baru'}
        subtitle="Stok awal barang baru dimulai dari 0 dan hanya bertambah melalui alur Persetujuan Finance → Konfirmasi Logistik."
      >
        <form onSubmit={handleSubmitMaterial} className="space-y-4 text-xs">
          {matFormError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {matFormError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kode Barang *</label>
              <input
                type="text"
                required
                value={matForm.code}
                onChange={(e) => setMatForm((p) => ({ ...p, code: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kategori *</label>
              <select
                value={matForm.category}
                onChange={(e) => setMatForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Nama Barang *</label>
              <input
                type="text"
                required
                value={matForm.name}
                onChange={(e) => setMatForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Semen Tiga Roda 50 Kg"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Satuan *</label>
              <select
                value={matForm.unit}
                onChange={(e) => setMatForm((p) => ({ ...p, unit: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                step="any"
                required
                value={matForm.min_stock}
                onChange={(e) => setMatForm((p) => ({ ...p, min_stock: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Harga Satuan (Rp) *</label>
              <input
                type="number"
                min={0}
                required
                value={matForm.unit_cost}
                onChange={(e) => setMatForm((p) => ({ ...p, unit_cost: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">Lokasi Gudang *</label>
                {canManageWarehouses && (
                  <button
                    type="button"
                    onClick={() => openManageWarehousesModal('material')}
                    className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                  >
                    + Tambah / Kelola Gudang
                  </button>
                )}
              </div>
              <select
                required
                value={matForm.default_warehouse_id}
                onChange={(e) =>
                  setMatForm((p) => ({ ...p, default_warehouse_id: e.target.value }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Spesifikasi / Catatan</label>
              <input
                type="text"
                value={matForm.sku_notes}
                onChange={(e) => setMatForm((p) => ({ ...p, sku_notes: e.target.value }))}
                placeholder="Opsional: ukuran, merek standar, rak penyimpanan..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setMaterialModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Data Barang'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Finance Tambah Stok / Tambah Qty OR Logistics Ajukan Pengadaan */}
      <Modal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title={
          orderMode === 'finance-add'
            ? 'Tambah Stok / Tambah Qty (Persetujuan Finance)'
            : 'Ajukan Pengadaan Barang ke Finance'
        }
        subtitle={
          orderMode === 'finance-add'
            ? 'Order otomatis berstatus Disetujui Finance. Stok fisik bertambah ke gudang terpilih setelah Logistik mengonfirmasi penerimaan barang.'
            : 'Pengajuan dikirim ke Divisi Finance untuk persetujuan sebelum penerimaan barang oleh Logistik.'
        }
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4 text-xs">
          {orderError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {orderError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Nama Barang *</label>
              <select
                required
                value={orderForm.material_id}
                onChange={(e) => {
                  const m = state.materials.find((x) => x.id === e.target.value);
                  setOrderForm((p) => ({
                    ...p,
                    material_id: e.target.value,
                    warehouse_id: m?.default_warehouse_id || p.warehouse_id || defaultWarehouseId,
                    unit_cost: m?.unit_cost ?? p.unit_cost,
                  }));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Total stok: {m.stock} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Lokasi Gudang Tujuan *
                </label>
                {canManageWarehouses && (
                  <button
                    type="button"
                    onClick={() => openManageWarehousesModal('order')}
                    className="text-[11px] font-semibold text-[#1D7AFC] hover:underline cursor-pointer"
                  >
                    + Tambah / Kelola Gudang
                  </button>
                )}
              </div>
              <select
                required
                value={orderForm.warehouse_id}
                onChange={(e) => setOrderForm((p) => ({ ...p, warehouse_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name} (Stok saat ini:{' '}
                    {formatNumber(getWhStock(orderSelectedMat, w.id))}{' '}
                    {orderSelectedMat?.unit ?? 'Unit'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Stok akan masuk khusus ke{' '}
                <strong className="text-slate-700">{getWhName(orderForm.warehouse_id)}</strong> (saat ini{' '}
                <strong className="font-mono">
                  {formatNumber(getWhStock(orderSelectedMat, orderForm.warehouse_id))}{' '}
                  {orderSelectedMat?.unit}
                </strong>
                ).
              </p>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Qty Tambah ({orderSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={orderForm.qty_planned}
                onChange={(e) => setOrderForm((p) => ({ ...p, qty_planned: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal *</label>
              <input
                type="date"
                required
                value={orderForm.order_date}
                onChange={(e) => setOrderForm((p) => ({ ...p, order_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sumber Barang / Supplier *
              </label>
              <input
                type="text"
                required
                value={orderForm.source_name}
                onChange={(e) => setOrderForm((p) => ({ ...p, source_name: e.target.value }))}
                placeholder="Contoh: PT. Mitra Bangunan Utama / TB Sejahtera"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Bukti Transaksi (No. PO / Nota / Transfer) *
              </label>
              <input
                type="text"
                required
                value={orderForm.proof_ref}
                onChange={(e) => setOrderForm((p) => ({ ...p, proof_ref: e.target.value }))}
                placeholder="Contoh: INV/2026/11/048 atau TRF-BRI-002"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Terkait (Opsional)</label>
              <select
                value={orderForm.project_id}
                onChange={(e) =>
                  setOrderForm((p) => ({ ...p, project_id: e.target.value, rab_item_id: '' }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Stok Umum Gudang</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pos RAB Terkait (Opsional)</label>
              <select
                value={orderForm.rab_item_id}
                disabled={!orderForm.project_id}
                onChange={(e) => setOrderForm((p) => ({ ...p, rab_item_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                <option value="">Tidak spesifik ke 1 pos RAB</option>
                {orderProjectRabItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Harga Satuan (Rp)</label>
              <input
                type="number"
                min={0}
                value={orderForm.unit_cost}
                onChange={(e) => setOrderForm((p) => ({ ...p, unit_cost: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Petugas Pencatat</label>
              <input
                type="text"
                readOnly
                value={`${currentUser?.full_name ?? ''} (${currentDivision?.name ?? ''})`}
                className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
              <textarea
                rows={2}
                value={orderForm.notes}
                onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Keterangan tambahan pengadaan atau nomor rekening/pembayaran..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
            Total estimasi pengadaan:{' '}
            <strong className="font-mono">
              {formatRupiah(Math.round((Number(orderForm.qty_planned) || 0) * (Number(orderForm.unit_cost) || 0)))}
            </strong>{' '}
            · Stok gudang baru bertambah setelah Logistik mengonfirmasi barang diterima di gudang.
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOrderModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer"
            >
              {workflowBusy
                ? 'Menyimpan...'
                : orderMode === 'finance-add'
                ? 'Simpan & Setujui Penambahan Stok'
                : 'Kirim Pengajuan ke Finance'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DIALOG 3: Finance Approve / Reject Pending Order */}
      <ConfirmDialog
        open={Boolean(financeDecisionTarget)}
        title={
          financeDecisionTarget?.decision === 'APPROVE'
            ? `Setujui Pengadaan ${financeDecisionTarget.order.order_no}`
            : `Tolak Pengadaan ${financeDecisionTarget?.order.order_no}`
        }
        description={
          financeDecisionTarget?.decision === 'APPROVE'
            ? `Setelah disetujui Finance, Divisi Logistik dapat memeriksa fisik dan mengonfirmasi penerimaan ${financeDecisionTarget.order.qty_planned} ${financeDecisionTarget.order.unit}.`
            : 'Pengadaan yang ditolak Finance tidak dapat diterima masuk ke gudang.'
        }
        confirmLabel={financeDecisionTarget?.decision === 'APPROVE' ? 'Setujui Finance' : 'Tolak Pengadaan'}
        danger={financeDecisionTarget?.decision === 'REJECT'}
        requireNote={financeDecisionTarget?.decision === 'REJECT'}
        onCancel={() => setFinanceDecisionTarget(null)}
        onConfirm={async (note) => {
          if (!financeDecisionTarget) return;
          await decideWarehouseOrderFinanceApi(financeDecisionTarget.order.id, {
            decision: financeDecisionTarget.decision,
            note,
          });
          setFinanceDecisionTarget(null);
        }}
      />

      {/* MODAL 4: Logistics Confirm Goods Received -> Stock Increases Automatically */}
      <Modal
        open={Boolean(receiptTarget)}
        onClose={() => setReceiptTarget(null)}
        title={`Konfirmasi Penerimaan Barang: ${receiptTarget?.order_no ?? ''}`}
        subtitle="Periksa fisik barang dan masukkan Qty aktual diterima. Stok otomatis bertambah sesuai Qty aktual."
      >
        {receiptTarget && (() => {
          const mat = state.materials.find((m) => m.id === receiptTarget.material_id);
          return (
            <form onSubmit={handleSubmitReceipt} className="space-y-4 text-xs">
              {receiptError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
                  {receiptError}
                </div>
              )}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">
                  {mat?.code} — {mat?.name}
                </div>
                <div className="text-slate-600">
                  Disetujui Finance ({receiptTarget.finance_approved_by_name}):{' '}
                  <strong className="font-mono">
                    {formatNumber(receiptTarget.qty_planned)} {receiptTarget.unit}
                  </strong>
                </div>
                <div className="text-slate-600">
                  Stok di {getWhName(receiptForm.warehouse_id)} saat ini:{' '}
                  <strong className="font-mono">
                    {formatNumber(getWhStock(mat, receiptForm.warehouse_id))} {receiptTarget.unit}
                  </strong>{' '}
                  (Total semua gudang: {formatNumber(mat?.stock ?? 0)} {receiptTarget.unit})
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Lokasi Gudang Penerimaan *
                  </label>
                  <select
                    required
                    value={receiptForm.warehouse_id}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, warehouse_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {activeWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
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
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, qty_actual: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Diterima *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiptForm.received_date}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, received_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sumber Barang *</label>
                  <input
                    type="text"
                    required
                    value={receiptForm.source_name}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, source_name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bukti Transaksi / Surat Jalan *
                  </label>
                  <input
                    type="text"
                    required
                    value={receiptForm.proof_ref}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, proof_ref: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hasil Pemeriksaan Fisik Logistik
                  </label>
                  <textarea
                    rows={2}
                    value={receiptForm.inspection_note}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, inspection_note: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    openAttachmentModal({
                      moduleId: 'gudang',
                      entityId: receiptTarget.id,
                      entityLabel: `${receiptTarget.order_no} — ${mat?.name ?? ''}`,
                      title: `Unggah Bukti Surat Jalan / Nota (${receiptTarget.order_no})`,
                      defaultCategory: 'Surat Jalan / Nota Material',
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Unggah Foto / Nota ({getAttachmentsFor('gudang', receiptTarget.id).length})
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReceiptTarget(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={workflowBusy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{workflowBusy ? 'Memproses...' : 'Konfirmasi Diterima & Tambah Stok'}</span>
                  </button>
                </div>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* MODAL 5: Record Barang Keluar (Logistik) */}
      <Modal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        title="Catat Barang Keluar Gudang"
        subtitle="Pengeluaran otomatis mengurangi stok dan memblokir pengeluaran jika stok tidak mencukupi (anti stok minus)."
      >
        <form onSubmit={handleSubmitIssue} className="space-y-4 text-xs">
          {issueError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {issueError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Lokasi Gudang Asal Pengeluaran *
              </label>
              <select
                required
                value={issueForm.warehouse_id}
                onChange={(e) => setIssueForm((p) => ({ ...p, warehouse_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name} (Tersedia: {formatNumber(getWhStock(issueSelectedMat, w.id))}{' '}
                    {issueSelectedMat?.unit ?? 'Unit'})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Pilih Barang *</label>
              <select
                required
                value={issueForm.material_id}
                onChange={(e) => setIssueForm((p) => ({ ...p, material_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Di gudang ini: {formatNumber(getWhStock(m, issueForm.warehouse_id))}{' '}
                    {m.unit} | Total: {formatNumber(m.stock)} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Tujuan *</label>
              <select
                required
                value={issueForm.project_id}
                onChange={(e) =>
                  setIssueForm((p) => ({
                    ...p,
                    project_id: e.target.value,
                    rab_item_id: '',
                    request_id: '',
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pos RAB Terkait</label>
              <select
                value={issueForm.rab_item_id}
                onChange={(e) => setIssueForm((p) => ({ ...p, rab_item_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Umum Proyek (Tanpa Pos RAB Spesifik)</option>
                {issueProjectRabItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
            {approvedUnissuedRequests.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Hubungkan dengan Permintaan Material Disetujui (Opsional)
                </label>
                <select
                  value={issueForm.request_id}
                  onChange={(e) => setIssueForm((p) => ({ ...p, request_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Pengeluaran Langsung Tanpa SPM</option>
                  {approvedUnissuedRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.request_number} — {r.notes}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Qty Keluar ({issueSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                max={getWhStock(issueSelectedMat, issueForm.warehouse_id)}
                required
                value={issueForm.qty}
                onChange={(e) => setIssueForm((p) => ({ ...p, qty: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tersedia di {getWhName(issueForm.warehouse_id)}:{' '}
                <strong className="font-mono">
                  {formatNumber(getWhStock(issueSelectedMat, issueForm.warehouse_id))}
                </strong>{' '}
                {issueSelectedMat?.unit}
              </p>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Keluar *</label>
              <input
                type="date"
                required
                value={issueForm.date}
                onChange={(e) => setIssueForm((p) => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Surat Jalan / Bukti *</label>
              <input
                type="text"
                required
                value={issueForm.proof_ref}
                onChange={(e) => setIssueForm((p) => ({ ...p, proof_ref: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tujuan Pengiriman</label>
              <input
                type="text"
                value={issueForm.source_or_destination}
                onChange={(e) =>
                  setIssueForm((p) => ({ ...p, source_or_destination: e.target.value }))
                }
                placeholder="Lokasi pekerjaan / mandor penerima"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
              <input
                type="text"
                value={issueForm.notes}
                onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIssueModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
            >
              {workflowBusy ? 'Menyimpan...' : 'Catat Barang Keluar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 6: Ajukan Permintaan Material (Tim Lapangan / Teknik) */}
      <Modal
        open={reqModalOpen}
        onClose={() => setReqModalOpen(false)}
        title="Ajukan Permintaan Material Proyek"
        subtitle="Permintaan terhubung ke proyek dan pos RAB serta diverifikasi oleh Head sebelum diproses Logistik."
      >
        <form onSubmit={handleSubmitMaterialRequest} className="space-y-4 text-xs">
          {reqError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {reqError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                required
                value={reqForm.project_id}
                onChange={(e) =>
                  setReqForm((p) => ({ ...p, project_id: e.target.value, rab_item_id: '' }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pos RAB Terkait</label>
              <select
                value={reqForm.rab_item_id}
                onChange={(e) => setReqForm((p) => ({ ...p, rab_item_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Umum Proyek</option>
                {reqProjectRabItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.work_item_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Material Dibutuhkan *</label>
              <select
                required
                value={reqForm.material_id}
                onChange={(e) => setReqForm((p) => ({ ...p, material_id: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Stok gudang: {m.stock} {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Qty Diminta ({reqSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={reqForm.qty_requested}
                onChange={(e) => setReqForm((p) => ({ ...p, qty_requested: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Dibutuhkan *</label>
              <input
                type="date"
                required
                value={reqForm.needed_date}
                onChange={(e) => setReqForm((p) => ({ ...p, needed_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Keperluan / Lokasi Pakai</label>
              <textarea
                rows={2}
                value={reqForm.notes}
                onChange={(e) => setReqForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Contoh: Pengecoran sloof lantai 1 zona timur"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setReqModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
            >
              {workflowBusy ? 'Mengirim...' : 'Kirim Permintaan Material'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DIALOG 7: Confirm Advance Material Request */}
      <ConfirmDialog
        open={Boolean(reqDecisionTarget)}
        title={reqDecisionTarget?.title ?? ''}
        description={reqDecisionTarget?.description ?? ''}
        danger={reqDecisionTarget?.danger}
        requireNote={reqDecisionTarget?.requireNote}
        onCancel={() => setReqDecisionTarget(null)}
        onConfirm={async (note) => {
          if (!reqDecisionTarget) return;
          await advanceWarehouseMaterialRequestApi(reqDecisionTarget.request.id, {
            next_status: reqDecisionTarget.nextStatus,
            note,
          });
          setReqDecisionTarget(null);
        }}
      />

      {/* MODAL 8: Stok Opname (Logistik) */}
      <Modal
        open={opnameModalOpen}
        onClose={() => setOpnameModalOpen(false)}
        title="Input Pemeriksaan Stok Opname"
        subtitle="Penyesuaian stok fisik aktual dengan stok sistem akan dicatat permanen di riwayat dan audit log."
      >
        <form onSubmit={handleSubmitOpname} className="space-y-4 text-xs">
          {opnameError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              {opnameError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Lokasi Gudang Opname *
              </label>
              <select
                required
                value={opnameForm.warehouse_id}
                onChange={(e) => {
                  const whId = e.target.value;
                  setOpnameForm((p) => ({
                    ...p,
                    warehouse_id: whId,
                    physical_qty: getWhStock(opnameSelectedMat, whId),
                  }));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Pilih Barang *</label>
              <select
                required
                value={opnameForm.material_id}
                onChange={(e) => {
                  const m = state.materials.find((x) => x.id === e.target.value);
                  setOpnameForm((p) => ({
                    ...p,
                    material_id: e.target.value,
                    physical_qty: getWhStock(m, p.warehouse_id),
                  }));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} (Stok gudang ini: {formatNumber(getWhStock(m, opnameForm.warehouse_id))}{' '}
                    {m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Opname *</label>
              <input
                type="date"
                required
                value={opnameForm.opname_date}
                onChange={(e) => setOpnameForm((p) => ({ ...p, opname_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Stok Fisik Aktual ({opnameSelectedMat?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                min={0}
                step="any"
                required
                value={opnameForm.physical_qty}
                onChange={(e) => setOpnameForm((p) => ({ ...p, physical_qty: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
            <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span>
                Stok Sistem ({getWhName(opnameForm.warehouse_id)}):{' '}
                <strong className="font-mono">
                  {formatNumber(getWhStock(opnameSelectedMat, opnameForm.warehouse_id))}
                </strong>{' '}
                {opnameSelectedMat?.unit}
              </span>
              <span>
                Selisih:{' '}
                <strong
                  className={`font-mono ${
                    opnameForm.physical_qty - getWhStock(opnameSelectedMat, opnameForm.warehouse_id) < 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {opnameForm.physical_qty - getWhStock(opnameSelectedMat, opnameForm.warehouse_id) > 0
                    ? '+'
                    : ''}
                  {Math.round(
                    (opnameForm.physical_qty -
                      getWhStock(opnameSelectedMat, opnameForm.warehouse_id)) *
                      100
                  ) / 100}{' '}
                  {opnameSelectedMat?.unit}
                </strong>
              </span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kondisi Barang *</label>
              <input
                type="text"
                required
                value={opnameForm.condition_note}
                onChange={(e) => setOpnameForm((p) => ({ ...p, condition_note: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Berita Acara</label>
              <input
                type="text"
                value={opnameForm.proof_ref}
                onChange={(e) => setOpnameForm((p) => ({ ...p, proof_ref: e.target.value }))}
                placeholder="Opsional (otomatis jika dikosongkan)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan / Hasil Pemeriksaan Opname *
              </label>
              <textarea
                rows={2}
                required
                value={opnameForm.reason}
                onChange={(e) => setOpnameForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="Contoh: Pemeriksaan berkala bulanan rak A-02"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOpnameModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Hasil Opname'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 9: Master Data Lokasi Gudang (Tambah & Kelola Beberapa Gudang) */}
      <Modal
        open={warehouseModalOpen}
        onClose={() => {
          setWarehouseModalOpen(false);
          setWhAssignTarget(null);
        }}
        title="Kelola Lokasi Gudang & Persediaan"
        subtitle="Tambahkan atau perbarui beberapa lokasi gudang. Pilihan gudang di form Tambah Barang, Tambah Qty, dan Surat Jalan mengambil data master ini."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-5 text-xs">
          <form
            onSubmit={handleSubmitWarehouseLocation}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#13233C]">
                {editingWarehouse
                  ? `Edit Lokasi Gudang: ${editingWarehouse.code}`
                  : 'Tambah Lokasi Gudang Baru'}
              </h4>
              {editingWarehouse && (
                <button
                  type="button"
                  onClick={() => openManageWarehousesModal(whAssignTarget)}
                  className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                >
                  + Mode Tambah Baru
                </button>
              )}
            </div>
            {whFormError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
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
                  onChange={(e) => setWhForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="Contoh: GDG-DPK-03"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Gudang *</label>
                <input
                  type="text"
                  required
                  value={whForm.name}
                  onChange={(e) => setWhForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Gudang Cabang Depok Timur"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat / Kota *</label>
                <input
                  type="text"
                  required
                  value={whForm.address}
                  onChange={(e) => setWhForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Contoh: Jl. Margonda Raya, Kota Depok"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Penanggung Jawab (PIC) *</label>
                <input
                  type="text"
                  required
                  value={whForm.pic_name}
                  onChange={(e) => setWhForm((p) => ({ ...p, pic_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Catatan (Opsional)</label>
                <input
                  type="text"
                  value={whForm.notes}
                  onChange={(e) => setWhForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Kapasitas rak, jenis material utama, atau akses kendaraan..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white font-semibold cursor-pointer"
              >
                {workflowBusy
                  ? 'Menyimpan...'
                  : editingWarehouse
                  ? 'Simpan Perubahan Gudang'
                  : 'Tambah Lokasi Gudang'}
              </button>
            </div>
          </form>

          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Kode & Nama Gudang</th>
                  <th className="py-2.5 px-3 font-semibold">Alamat & PIC</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total Stok</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouseSummaryList.map(({ warehouse: wh, itemCount, totalQty }) => (
                  <tr key={wh.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-[#1D7AFC]">{wh.code}</div>
                      <div className="font-semibold text-slate-900">{wh.name}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-700">{wh.address}</div>
                      <div className="text-[11px] text-slate-500">PIC: {wh.pic_name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div>{formatNumber(totalQty)} Unit</div>
                      <div className="text-[11px] text-slate-500">{itemCount} SKU</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusLabel status={wh.is_active ? 'Aktif' : 'Nonaktif'} />
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => openEditWarehouse(wh)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-semibold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={workflowBusy}
                        onClick={() => handleToggleWarehouseActive(wh)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      >
                        {wh.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
};
