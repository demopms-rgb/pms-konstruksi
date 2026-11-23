import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  HardHat,
  Layers,
  PackagePlus,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import {
  FinanceBill,
  FinanceBillCategory,
  FinanceBillStatus,
  FinancialCategory,
  FinancialTransaction,
  Project,
  ProjectAssetCondition,
} from '../../types/pms';
import { formatDateID, formatDateTimeID, formatNumber, formatRupiah } from '../../utils/format';
import { canAccessFinanceModule } from '../../utils/permissions';
import {
  downloadFinanceImportTemplateCsv,
  downloadFinanceImportTemplateExcel,
  exportFinanceExcel,
  exportFinancePdf,
  openFinancePrintA4Window,
  parseFinanceImportFile,
  ProjectFinanceRecapRow,
} from '../../utils/financeExport';
import { ImportFinanceTransactionRowPayload } from '../../services/financeApi';
import { ConfirmDialog, EmptyState, Modal, PaginationBar, SearchInput, StatusLabel } from '../ui/CommonUI';
import { ProjectWorkflowPanel } from '../workflow/ProjectWorkflowPanel';

type FinanceSectionTab = 'dashboard' | 'persetujuan' | 'transaksi' | 'tagihan' | 'rekap';

const TX_CATEGORIES: FinancialCategory[] = [
  'Pembayaran Termin',
  'Pemasukan Proyek',
  'Pengeluaran Proyek',
  'Tagihan Vendor',
  'Biaya Operasional',
  'Pengadaan Material',
];

const BILL_CATEGORIES: FinanceBillCategory[] = [
  'Tagihan Supplier',
  'Pembayaran Material',
  'Biaya Operasional Proyek',
];

const ASSET_CATEGORIES = [
  'Peralatan Gali & Pasang',
  'Alat Pelindung Diri (APD)',
  'Alat Ukur & Survey',
  'Alat Angkut Ringan',
  'Peralatan Kerja Umum',
  'Tangga & Perancah',
];

export const FinanceModule: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    workflowBusy,
    setActiveModule,
    showToast,
    decideWorkflowFinance,
    createWarehouseStockOrderApi,
    decideWarehouseOrderFinanceApi,
    createProjectAssetApi,
    createFinanceTransactionApi,
    updateFinanceTransactionApi,
    decideFinanceTransactionApi,
    deleteFinanceTransactionApi,
    importFinanceTransactionsApi,
    createFinanceBillApi,
    updateFinanceBillApi,
    payFinanceBillApi,
    deleteFinanceBillApi,
  } = usePMS();

  const { attachments, uploadFiles, getSignedUrl } = useAttachments();

  const hasAccess = Boolean(
    currentRole && currentDivision && canAccessFinanceModule(currentRole.code, currentDivision.code)
  );
  const canVerifyOrDelete = currentRole?.code === 'SUPER_ADMIN' || currentRole?.code === 'HEAD';

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );
  const activeWarehouses = useMemo(
    () => (state.warehouses || []).filter((w) => w.is_active),
    [state.warehouses]
  );

  const [section, setSection] = useState<FinanceSectionTab>('dashboard');

  // Shared filters
  const [txSearch, setTxSearch] = useState('');
  const [txProjectFilter, setTxProjectFilter] = useState('SEMUA');
  const [txTypeFilter, setTxTypeFilter] = useState<'SEMUA' | 'Pemasukan' | 'Pengeluaran'>('SEMUA');
  const [txCategoryFilter, setTxCategoryFilter] = useState('SEMUA');
  const [txStatusFilter, setTxStatusFilter] = useState('SEMUA');
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 10;

  // Bills filters
  const [billSearch, setBillSearch] = useState('');
  const [billProjectFilter, setBillProjectFilter] = useState('SEMUA');
  const [billStatusFilter, setBillStatusFilter] = useState<'SEMUA' | FinanceBillStatus>('SEMUA');

  // Recap filters
  const [recapProjectFilter, setRecapProjectFilter] = useState('SEMUA');
  const [recapMonth, setRecapMonth] = useState('');
  const [recapDateFrom, setRecapDateFrom] = useState('');
  const [recapDateTo, setRecapDateTo] = useState('');
  const [recapCategoryFilter, setRecapCategoryFilter] = useState('SEMUA');
  const [recapStatusFilter, setRecapStatusFilter] = useState('SEMUA');

  // Transaction Add/Edit Modal
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [txForm, setTxForm] = useState({
    project_id: activeProjects[0]?.id ?? '',
    category: 'Pengeluaran Proyek' as FinancialCategory,
    type: 'Pengeluaran' as 'Pemasukan' | 'Pengeluaran',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    proof_ref: '',
    proof_attachment_id: '',
    description: '',
  });
  const [txProofUploading, setTxProofUploading] = useState(false);
  const [txProofProgress, setTxProofProgress] = useState(0);
  const [txFormError, setTxFormError] = useState('');

  // Transaction Detail & Decision Dialogs
  const [detailTx, setDetailTx] = useState<FinancialTransaction | null>(null);
  const [confirmTxDecision, setConfirmTxDecision] = useState<{
    tx: FinancialTransaction;
    decision: 'Terverifikasi' | 'Ditolak';
  } | null>(null);
  const [deleteTxTarget, setDeleteTxTarget] = useState<FinancialTransaction | null>(null);

  // Bill Add/Edit Modal
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<FinanceBill | null>(null);
  const [billForm, setBillForm] = useState({
    project_id: activeProjects[0]?.id ?? '',
    category: 'Tagihan Supplier' as FinanceBillCategory,
    vendor_name: '',
    bill_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    amount: 0,
    paid_amount: 0,
    proof_ref: '',
    proof_attachment_id: '',
    description: '',
  });
  const [billProofUploading, setBillProofUploading] = useState(false);
  const [billFormError, setBillFormError] = useState('');

  // Bill Detail / Pay / Delete Dialogs
  const [detailBill, setDetailBill] = useState<FinanceBill | null>(null);
  const [payBillTarget, setPayBillTarget] = useState<FinanceBill | null>(null);
  const [payBillForm, setPayBillForm] = useState({
    pay_amount: 0,
    payment_date: new Date().toISOString().slice(0, 10),
    proof_ref: '',
    proof_attachment_id: '',
    note: '',
  });
  const [payProofUploading, setPayProofUploading] = useState(false);
  const [payBillError, setPayBillError] = useState('');
  const [deleteBillTarget, setDeleteBillTarget] = useState<FinanceBill | null>(null);

  // Teknik RAB Review & Decision Dialog
  const [reviewProjectModal, setReviewProjectModal] = useState<Project | null>(null);
  const [wfDecisionDialog, setWfDecisionDialog] = useState<{
    projectId: string;
    projectNumber: string;
    decision: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
    approvedBudget: number;
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    requireNote?: boolean;
  } | null>(null);

  // Gudang Procurement Decision & Finance Tambah Qty Stok Modal
  const [orderDecisionDialog, setOrderDecisionDialog] = useState<{
    id: string;
    orderNo: string;
    decision: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [addStockModalOpen, setAddStockModalOpen] = useState(false);
  const [addStockForm, setAddStockForm] = useState({
    material_id: state.materials[0]?.id ?? '',
    warehouse_id: activeWarehouses[0]?.id ?? 'wh-depok',
    qty_planned: 10,
    order_date: new Date().toISOString().slice(0, 10),
    source_name: '',
    proof_ref: '',
    unit_cost: state.materials[0]?.unit_cost ?? 0,
    project_id: '',
    notes: '',
  });
  const [addStockAttIds, setAddStockAttIds] = useState<string[]>([]);
  const [addStockUploading, setAddStockUploading] = useState(false);
  const [addStockError, setAddStockError] = useState('');

  // Aset Proyek Quick Add Modal
  const [addAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [assetForm, setAssetForm] = useState({
    project_id: activeProjects[0]?.id ?? '',
    name: '',
    category: ASSET_CATEGORIES[0],
    qty: 1,
    unit: 'Unit',
    recorded_date: new Date().toISOString().slice(0, 10),
    initial_condition: 'Baik' as ProjectAssetCondition,
    notes: '',
    photo_attachment_id: '',
  });
  const [assetPhotoUploading, setAssetPhotoUploading] = useState(false);
  const [assetError, setAssetError] = useState('');

  // Excel/CSV Import Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importValidRows, setImportValidRows] = useState<ImportFinanceTransactionRowPayload[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importDuplicates, setImportDuplicates] = useState<string[]>([]);
  const [importServerError, setImportServerError] = useState('');

  const todayIso = new Date().toISOString().slice(0, 10);

  // Normalize bill status with due date awareness
  const normalizedBills = useMemo<FinanceBill[]>(() => {
    return (state.financeBills || []).map((b) => {
      if (b.paid_amount >= b.amount && b.amount > 0) {
        return { ...b, status: 'Lunas' };
      }
      if (b.due_date && b.due_date < todayIso) {
        return { ...b, status: 'Jatuh Tempo' };
      }
      if (b.paid_amount > 0) {
        return { ...b, status: 'Sebagian' };
      }
      return { ...b, status: 'Belum Bayar' };
    });
  }, [state.financeBills, todayIso]);

  // Core KPI Calculations
  const kpi = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map((p) => p.id));
    const totalRab = state.budgets
      .filter((b) => !b.is_deleted && activeProjectIds.has(b.project_id))
      .reduce((sum, b) => sum + b.total_cost, 0);
    const totalContractVal = state.contracts
      .filter((c) => !c.is_deleted && c.status !== 'Ditutup')
      .reduce((sum, c) => sum + c.contract_value, 0);
    const verifiedIncome = state.financialTransactions
      .filter((f) => f.type === 'Pemasukan' && f.status === 'Terverifikasi')
      .reduce((sum, f) => sum + f.amount, 0);
    const verifiedExpense = state.financialTransactions
      .filter((f) => f.type === 'Pengeluaran' && f.status === 'Terverifikasi')
      .reduce((sum, f) => sum + f.amount, 0);
    const pendingTx = state.financialTransactions.filter((f) => f.status === 'Menunggu');
    const unpaidBills = normalizedBills.filter((b) => b.status !== 'Lunas');
    const unpaidAmount = unpaidBills.reduce((sum, b) => sum + Math.max(0, b.amount - b.paid_amount), 0);
    const overdueCount = unpaidBills.filter((b) => b.status === 'Jatuh Tempo').length;

    return {
      totalBudget: Math.max(totalRab, totalContractVal),
      totalRab,
      verifiedIncome,
      verifiedExpense,
      netBalance: verifiedIncome - verifiedExpense,
      pendingTxCount: pendingTx.length,
      unpaidBillCount: unpaidBills.length,
      unpaidAmount,
      overdueCount,
    };
  }, [activeProjects, state.budgets, state.contracts, state.financialTransactions, normalizedBills]);

  // Cross-module Pending Queues
  const pendingTeknikWorkflows = useMemo(
    () => state.workflows.filter((w) => w.stage === 'MENUNGGU_FINANCE'),
    [state.workflows]
  );
  const warehouseOrders = useMemo(() => state.warehouseOrders || [], [state.warehouseOrders]);
  const pendingWarehouseOrders = useMemo(
    () => warehouseOrders.filter((o) => o.status === 'Menunggu Persetujuan Finance'),
    [warehouseOrders]
  );
  const pendingFieldOrManualTx = useMemo(
    () => state.financialTransactions.filter((f) => f.status === 'Menunggu'),
    [state.financialTransactions]
  );
  const pendingAssetReports = useMemo(
    () => (state.projectAssetReports || []).filter((r) => r.status === 'Menunggu Pemeriksaan'),
    [state.projectAssetReports]
  );

  const totalApprovalBadge =
    pendingTeknikWorkflows.length +
    pendingWarehouseOrders.length +
    pendingFieldOrManualTx.length +
    pendingAssetReports.length;

  // Dashboard per-project summary
  const dashboardProjectRows = useMemo<ProjectFinanceRecapRow[]>(() => {
    return activeProjects.map((prj) => {
      const rab = state.budgets
        .filter((b) => b.project_id === prj.id && !b.is_deleted)
        .reduce((s, b) => s + b.total_cost, 0);
      const txs = state.financialTransactions.filter((t) => t.project_id === prj.id);
      const income = txs
        .filter((t) => t.type === 'Pemasukan' && t.status === 'Terverifikasi')
        .reduce((s, t) => s + t.amount, 0);
      const expense = txs
        .filter((t) => t.type === 'Pengeluaran' && t.status === 'Terverifikasi')
        .reduce((s, t) => s + t.amount, 0);
      const unpaid = normalizedBills
        .filter((b) => b.project_id === prj.id && b.status !== 'Lunas')
        .reduce((s, b) => s + Math.max(0, b.amount - b.paid_amount), 0);
      return {
        project_id: prj.id,
        project_number: prj.project_number,
        project_name: prj.name,
        budget_total: rab || prj.contract_value,
        income_total: income,
        expense_total: expense,
        balance: income - expense,
        unpaid_bills: unpaid,
        tx_count: txs.length,
      };
    });
  }, [activeProjects, state.budgets, state.financialTransactions, normalizedBills]);

  // Filtered Transactions Table
  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return state.financialTransactions.filter((f) => {
      if (txProjectFilter !== 'SEMUA' && f.project_id !== txProjectFilter) return false;
      if (txTypeFilter !== 'SEMUA' && f.type !== txTypeFilter) return false;
      if (txCategoryFilter !== 'SEMUA' && f.category !== txCategoryFilter) return false;
      if (txStatusFilter !== 'SEMUA' && f.status !== txStatusFilter) return false;
      if (!q) return true;
      const prj = state.projects.find((p) => p.id === f.project_id);
      return (
        f.transaction_no.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.proof_ref.toLowerCase().includes(q) ||
        (prj?.project_number.toLowerCase().includes(q) ?? false) ||
        (prj?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    state.financialTransactions,
    state.projects,
    txSearch,
    txProjectFilter,
    txTypeFilter,
    txCategoryFilter,
    txStatusFilter,
  ]);

  const txTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / txPageSize));
  const paginatedTransactions = filteredTransactions.slice(
    (txPage - 1) * txPageSize,
    txPage * txPageSize
  );

  // Filtered Bills
  const filteredBills = useMemo(() => {
    const q = billSearch.trim().toLowerCase();
    return normalizedBills.filter((b) => {
      if (billProjectFilter !== 'SEMUA' && b.project_id !== billProjectFilter) return false;
      if (billStatusFilter !== 'SEMUA' && b.status !== billStatusFilter) return false;
      if (!q) return true;
      return (
        b.bill_no.toLowerCase().includes(q) ||
        b.vendor_name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
      );
    });
  }, [normalizedBills, billSearch, billProjectFilter, billStatusFilter]);

  // Filtered Recap Dataset (unpaginated — covers 100% of filtered transactions from all integrated modules)
  const recapTransactions = useMemo(() => {
    return state.financialTransactions
      .filter((t) => {
        if (recapProjectFilter !== 'SEMUA' && t.project_id !== recapProjectFilter) return false;
        if (recapCategoryFilter !== 'SEMUA' && t.category !== recapCategoryFilter) return false;
        if (recapStatusFilter !== 'SEMUA' && t.status !== recapStatusFilter) return false;
        if (recapMonth && !t.date.startsWith(recapMonth)) return false;
        if (recapDateFrom && t.date < recapDateFrom) return false;
        if (recapDateTo && t.date > recapDateTo) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [
    state.financialTransactions,
    recapProjectFilter,
    recapCategoryFilter,
    recapStatusFilter,
    recapMonth,
    recapDateFrom,
    recapDateTo,
  ]);

  const hasActiveRecapFilter = Boolean(
    recapProjectFilter !== 'SEMUA' ||
      recapMonth ||
      recapDateFrom ||
      recapDateTo ||
      recapCategoryFilter !== 'SEMUA' ||
      recapStatusFilter !== 'SEMUA'
  );

  const resetRecapFilters = () => {
    setRecapProjectFilter('SEMUA');
    setRecapMonth('');
    setRecapDateFrom('');
    setRecapDateTo('');
    setRecapCategoryFilter('SEMUA');
    setRecapStatusFilter('SEMUA');
  };

  const recapProjectRows = useMemo<ProjectFinanceRecapRow[]>(() => {
    const projectsToInclude =
      recapProjectFilter === 'SEMUA'
        ? activeProjects
        : activeProjects.filter((p) => p.id === recapProjectFilter);

    return projectsToInclude.map((prj) => {
      const rab = state.budgets
        .filter((b) => b.project_id === prj.id && !b.is_deleted)
        .reduce((s, b) => s + b.total_cost, 0);
      const txs = recapTransactions.filter((t) => t.project_id === prj.id);
      const income = txs
        .filter((t) => t.type === 'Pemasukan' && t.status === 'Terverifikasi')
        .reduce((s, t) => s + t.amount, 0);
      const expense = txs
        .filter((t) => t.type === 'Pengeluaran' && t.status === 'Terverifikasi')
        .reduce((s, t) => s + t.amount, 0);
      const unpaid = normalizedBills
        .filter((b) => b.project_id === prj.id && b.status !== 'Lunas')
        .reduce((s, b) => s + Math.max(0, b.amount - b.paid_amount), 0);
      return {
        project_id: prj.id,
        project_number: prj.project_number,
        project_name: prj.name,
        budget_total: rab || prj.contract_value,
        income_total: income,
        expense_total: expense,
        balance: income - expense,
        unpaid_bills: unpaid,
        tx_count: txs.length,
      };
    });
  }, [activeProjects, recapProjectFilter, state.budgets, recapTransactions, normalizedBills]);

  const recapSummary = useMemo(() => {
    const totalBudget = recapProjectRows.reduce((s, r) => s + r.budget_total, 0);
    const totalIncome = recapProjectRows.reduce((s, r) => s + r.income_total, 0);
    const totalExpense = recapProjectRows.reduce((s, r) => s + r.expense_total, 0);
    const unpaidBills = recapProjectRows.reduce((s, r) => s + r.unpaid_bills, 0);
    return {
      totalBudget,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      unpaidBills,
    };
  }, [recapProjectRows]);

  const contractTermRows = useMemo(() => {
    const activeContracts = state.contracts.filter((c) => !c.is_deleted);
    return state.contractTerms
      .map((term) => {
        const contract = activeContracts.find((c) => c.id === term.contract_id);
        if (!contract) return null;
        const prj = state.projects.find((p) => p.id === contract.project_id);
        const paid = Number(term.paid_amount || 0);
        const remaining = Math.max(0, term.term_value - paid);
        return { term, contract, prj, paid, remaining };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [state.contracts, state.contractTerms, state.projects]);

  const getProjectName = (projectId: string) => {
    const prj = state.projects.find((p) => p.id === projectId);
    return prj ? `${prj.project_number} — ${prj.name}` : 'Proyek Tidak Dikenal';
  };

  const getAttachmentMeta = (attachmentId?: string) =>
    attachmentId ? attachments.find((a) => a.id === attachmentId) ?? null : null;

  const openAttachmentFile = async (attachmentId: string, disposition: 'inline' | 'attachment' = 'inline') => {
    try {
      const url = await getSignedUrl(attachmentId, disposition);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka dokumen bukti.');
    }
  };

  // --- Handlers: Transaction Modal & Inline Upload ---
  const openAddTxModal = () => {
    setEditingTx(null);
    setTxFormError('');
    setTxForm({
      project_id: activeProjects[0]?.id ?? '',
      category: 'Pengeluaran Proyek',
      type: 'Pengeluaran',
      date: todayIso,
      amount: 0,
      proof_ref: '',
      proof_attachment_id: '',
      description: '',
    });
    setTxModalOpen(true);
  };

  const openEditTxModal = (tx: FinancialTransaction) => {
    setEditingTx(tx);
    setTxFormError('');
    setTxForm({
      project_id: tx.project_id,
      category: tx.category,
      type: tx.type,
      date: tx.date,
      amount: tx.amount,
      proof_ref: tx.proof_ref,
      proof_attachment_id: tx.proof_attachment_id || '',
      description: tx.description,
    });
    setTxModalOpen(true);
  };

  const handleUploadTxProof = async (file: File | undefined) => {
    if (!file) return;
    setTxProofUploading(true);
    setTxProofProgress(0);
    setTxFormError('');
    try {
      const entityId = editingTx?.id || `fin-draft-${txForm.project_id || 'umum'}`;
      const prjLabel = txForm.project_id ? getProjectName(txForm.project_id) : 'Transaksi Finance';
      const uploaded = await uploadFiles({
        files: [file],
        module_id: 'finance',
        entity_id: entityId,
        entity_label: prjLabel,
        doc_category: 'Bukti Pembayaran',
        description: txForm.description || `Bukti transaksi keuangan (${file.name})`,
        onProgress: setTxProofProgress,
      });
      if (uploaded[0]) {
        setTxForm((prev) => ({
          ...prev,
          proof_attachment_id: uploaded[0].id,
          proof_ref: uploaded[0].original_name,
        }));
      }
    } catch (err) {
      setTxFormError(err instanceof Error ? err.message : 'Gagal mengunggah bukti transaksi.');
    } finally {
      setTxProofUploading(false);
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxFormError('');
    if (!txForm.project_id) {
      setTxFormError('Proyek terkait wajib dipilih.');
      return;
    }
    if (!Number.isFinite(txForm.amount) || txForm.amount <= 0) {
      setTxFormError('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }
    if (!txForm.description.trim()) {
      setTxFormError('Keterangan transaksi wajib diisi.');
      return;
    }

    if (editingTx) {
      const res = await updateFinanceTransactionApi(editingTx.id, {
        project_id: txForm.project_id,
        category: txForm.category,
        type: txForm.type,
        date: txForm.date,
        amount: txForm.amount,
        proof_ref: txForm.proof_ref.trim() || '-',
        proof_attachment_id: txForm.proof_attachment_id || null,
        description: txForm.description.trim(),
      });
      if (!res.ok) {
        setTxFormError(res.message);
        return;
      }
    } else {
      const res = await createFinanceTransactionApi({
        project_id: txForm.project_id,
        category: txForm.category,
        type: txForm.type,
        date: txForm.date,
        amount: txForm.amount,
        proof_ref: txForm.proof_ref.trim() || '-',
        proof_attachment_id: txForm.proof_attachment_id || undefined,
        description: txForm.description.trim(),
      });
      if (!res.ok) {
        setTxFormError(res.message);
        return;
      }
    }
    setTxModalOpen(false);
  };

  // --- Handlers: Bill Modal, Inline Upload & Payment ---
  const openAddBillModal = () => {
    setEditingBill(null);
    setBillFormError('');
    setBillForm({
      project_id: activeProjects[0]?.id ?? '',
      category: 'Tagihan Supplier',
      vendor_name: '',
      bill_date: todayIso,
      due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
      amount: 0,
      paid_amount: 0,
      proof_ref: '',
      proof_attachment_id: '',
      description: '',
    });
    setBillModalOpen(true);
  };

  const openEditBillModal = (bill: FinanceBill) => {
    setEditingBill(bill);
    setBillFormError('');
    setBillForm({
      project_id: bill.project_id,
      category: bill.category,
      vendor_name: bill.vendor_name,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      amount: bill.amount,
      paid_amount: bill.paid_amount,
      proof_ref: bill.proof_ref || '',
      proof_attachment_id: bill.proof_attachment_id || '',
      description: bill.description,
    });
    setBillModalOpen(true);
  };

  const handleUploadBillProof = async (file: File | undefined) => {
    if (!file) return;
    setBillProofUploading(true);
    setBillFormError('');
    try {
      const uploaded = await uploadFiles({
        files: [file],
        module_id: 'finance',
        entity_id: editingBill?.id || `bill-draft-${billForm.project_id || 'umum'}`,
        entity_label: billForm.vendor_name || 'Tagihan Finance',
        doc_category: 'Invoice / Bukti Pembayaran',
        description: billForm.description || `Bukti tagihan ${billForm.vendor_name}`,
        onProgress: () => undefined,
      });
      if (uploaded[0]) {
        setBillForm((prev) => ({
          ...prev,
          proof_attachment_id: uploaded[0].id,
          proof_ref: uploaded[0].original_name,
        }));
      }
    } catch (err) {
      setBillFormError(err instanceof Error ? err.message : 'Gagal mengunggah bukti tagihan.');
    } finally {
      setBillProofUploading(false);
    }
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillFormError('');
    if (!billForm.project_id) {
      setBillFormError('Proyek terkait wajib dipilih.');
      return;
    }
    if (!billForm.vendor_name.trim()) {
      setBillFormError('Nama supplier / penerima wajib diisi.');
      return;
    }
    if (!Number.isFinite(billForm.amount) || billForm.amount <= 0) {
      setBillFormError('Nominal tagihan harus lebih dari Rp 0.');
      return;
    }
    if (!billForm.description.trim()) {
      setBillFormError('Keterangan tagihan wajib diisi.');
      return;
    }

    if (editingBill) {
      const res = await updateFinanceBillApi(editingBill.id, {
        project_id: billForm.project_id,
        category: billForm.category,
        vendor_name: billForm.vendor_name.trim(),
        bill_date: billForm.bill_date,
        due_date: billForm.due_date,
        amount: billForm.amount,
        proof_ref: billForm.proof_ref.trim() || '-',
        proof_attachment_id: billForm.proof_attachment_id || null,
        description: billForm.description.trim(),
      });
      if (!res.ok) {
        setBillFormError(res.message);
        return;
      }
    } else {
      const res = await createFinanceBillApi({
        project_id: billForm.project_id,
        category: billForm.category,
        vendor_name: billForm.vendor_name.trim(),
        bill_date: billForm.bill_date,
        due_date: billForm.due_date,
        amount: billForm.amount,
        paid_amount: Math.max(0, billForm.paid_amount),
        proof_ref: billForm.proof_ref.trim() || '-',
        proof_attachment_id: billForm.proof_attachment_id || undefined,
        description: billForm.description.trim(),
      });
      if (!res.ok) {
        setBillFormError(res.message);
        return;
      }
    }
    setBillModalOpen(false);
  };

  const openPayBillModal = (bill: FinanceBill) => {
    const remaining = Math.max(0, bill.amount - bill.paid_amount);
    setPayBillTarget(bill);
    setPayBillError('');
    setPayBillForm({
      pay_amount: remaining,
      payment_date: todayIso,
      proof_ref: '',
      proof_attachment_id: '',
      note: '',
    });
  };

  const handleUploadPayProof = async (file: File | undefined) => {
    if (!file || !payBillTarget) return;
    setPayProofUploading(true);
    setPayBillError('');
    try {
      const uploaded = await uploadFiles({
        files: [file],
        module_id: 'finance',
        entity_id: payBillTarget.id,
        entity_label: `${payBillTarget.bill_no} - ${payBillTarget.vendor_name}`,
        doc_category: 'Bukti Pembayaran',
        description: `Bukti transfer pembayaran ${payBillTarget.bill_no}`,
        onProgress: () => undefined,
      });
      if (uploaded[0]) {
        setPayBillForm((prev) => ({
          ...prev,
          proof_attachment_id: uploaded[0].id,
          proof_ref: uploaded[0].original_name,
        }));
      }
    } catch (err) {
      setPayBillError(err instanceof Error ? err.message : 'Gagal mengunggah bukti bayar.');
    } finally {
      setPayProofUploading(false);
    }
  };

  const handleConfirmPayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payBillTarget) return;
    const res = await payFinanceBillApi(payBillTarget.id, {
      pay_amount: payBillForm.pay_amount,
      payment_date: payBillForm.payment_date,
      proof_ref: payBillForm.proof_ref.trim() || undefined,
      proof_attachment_id: payBillForm.proof_attachment_id || undefined,
      note: payBillForm.note.trim() || undefined,
    });
    if (!res.ok) {
      setPayBillError(res.message);
      return;
    }
    setPayBillTarget(null);
  };

  // --- Handlers: Gudang Finance Tambah Qty Stok ---
  const openAddStockModal = () => {
    const firstMat = state.materials[0];
    setAddStockError('');
    setAddStockAttIds([]);
    setAddStockForm({
      material_id: firstMat?.id ?? '',
      warehouse_id: firstMat?.default_warehouse_id || activeWarehouses[0]?.id || 'wh-depok',
      qty_planned: 10,
      order_date: todayIso,
      source_name: '',
      proof_ref: '',
      unit_cost: firstMat?.unit_cost ?? 0,
      project_id: '',
      notes: '',
    });
    setAddStockModalOpen(true);
  };

  const handleSubmitAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStockError('');
    if (!addStockForm.material_id || !addStockForm.warehouse_id) {
      setAddStockError('Pilih material dan lokasi gudang tujuan.');
      return;
    }
    if (!addStockForm.source_name.trim() || !addStockForm.proof_ref.trim()) {
      setAddStockError('Sumber barang/supplier dan nomor bukti transaksi wajib diisi.');
      return;
    }
    if (addStockForm.qty_planned <= 0) {
      setAddStockError('Qty penambahan stok harus lebih dari 0.');
      return;
    }
    const res = await createWarehouseStockOrderApi({
      ...addStockForm,
      project_id: addStockForm.project_id || undefined,
      proof_attachment_ids: addStockAttIds,
    });
    if (!res.ok) {
      setAddStockError(res.message);
      return;
    }
    setAddStockModalOpen(false);
  };

  // --- Handlers: Quick Add Aset Proyek ---
  const handleSubmitAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssetError('');
    if (!assetForm.project_id || !assetForm.name.trim()) {
      setAssetError('Proyek dan nama aset wajib diisi.');
      return;
    }
    const res = await createProjectAssetApi({
      project_id: assetForm.project_id,
      name: assetForm.name.trim(),
      category: assetForm.category,
      qty: Number(assetForm.qty),
      unit: assetForm.unit.trim() || 'Unit',
      recorded_date: assetForm.recorded_date,
      initial_condition: assetForm.initial_condition,
      notes: assetForm.notes.trim() || undefined,
      photo_attachment_id: assetForm.photo_attachment_id || undefined,
    });
    if (!res.ok) {
      setAssetError(res.message);
      return;
    }
    setAddAssetModalOpen(false);
  };

  // --- Handlers: Import Excel / CSV ---
  const openImportModal = () => {
    setImportValidRows([]);
    setImportErrors([]);
    setImportDuplicates([]);
    setImportServerError('');
    setImportFileName('');
    setImportModalOpen(true);
  };

  const handleImportFileChange = async (file: File | undefined) => {
    if (!file) return;
    setImportFileName(file.name);
    setImportServerError('');
    const parsed = await parseFinanceImportFile(file, state.projects, state.financialTransactions);
    setImportValidRows(parsed.validRows);
    setImportErrors(parsed.errors);
    setImportDuplicates(parsed.duplicates);
  };

  const handleConfirmImport = async () => {
    if (importValidRows.length === 0) return;
    setImportServerError('');
    const res = await importFinanceTransactionsApi(importValidRows);
    if (res.ok) {
      setImportModalOpen(false);
      setImportValidRows([]);
      setImportErrors([]);
      setImportDuplicates([]);
      setImportFileName('');
    } else {
      setImportServerError(res.message);
    }
  };

  const buildExportOptions = () => {
    const projectLabel =
      recapProjectFilter === 'SEMUA'
        ? 'Semua Proyek Aktif'
        : getProjectName(recapProjectFilter);
    const periodLabel = recapMonth
      ? `Bulan ${recapMonth}`
      : recapDateFrom || recapDateTo
      ? `${recapDateFrom || 'Awal'} s/d ${recapDateTo || 'Sekarang'}`
      : 'Semua Periode';
    return {
      periodLabel,
      projectLabel,
      preparedBy: currentUser?.full_name || 'Divisi Finance',
      summary: recapSummary,
      projectRows: recapProjectRows,
      transactions: recapTransactions,
      projects: state.projects,
    };
  };

  // Guard: Only Head Finance, Staff Finance & Super Admin can access
  if (!hasAccess) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Akses Modul Finance Dibatasi</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          Halaman Finance hanya dapat diakses oleh <span className="font-semibold">Head Finance</span>,{' '}
          <span className="font-semibold">Staff Finance</span>, dan <span className="font-semibold">Super Admin</span>.
          Divisi lain cukup mengirimkan pengajuan melalui modul masing-masing dan akan otomatis terintegrasi ke Finance.
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

  return (
    <div className="space-y-5">
      {/* Unified Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Finance & Arus Kas Terpadu</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dashboard Keuangan · Persetujuan Anggaran · Transaksi · Pembayaran & Tagihan · Rekap Laporan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddBillModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            Catat Tagihan
          </button>
          <button
            type="button"
            onClick={openAddTxModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Transaksi
          </button>
        </div>
      </div>

      {/* 5-Card Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Anggaran Proyek (RAB)</p>
          <p className="text-base font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {formatRupiah(kpi.totalBudget)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{activeProjects.length} proyek aktif</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Pemasukan Terverifikasi</p>
          <p className="text-base font-bold text-emerald-700 mt-1 font-mono tabular-nums">
            {formatRupiah(kpi.verifiedIncome)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Termin & kas masuk proyek</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Pengeluaran Terverifikasi</p>
          <p className="text-base font-bold text-rose-700 mt-1 font-mono tabular-nums">
            {formatRupiah(kpi.verifiedExpense)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {kpi.pendingTxCount} menunggu verifikasi
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Saldo Kas Bersih</p>
          <p
            className={`text-base font-bold mt-1 font-mono tabular-nums ${
              kpi.netBalance >= 0 ? 'text-slate-900' : 'text-rose-700'
            }`}
          >
            {formatRupiah(kpi.netBalance)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Selisih pemasukan & pengeluaran</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 font-medium">Tagihan Belum Lunas</p>
          <p className="text-base font-bold text-amber-700 mt-1 font-mono tabular-nums">
            {formatRupiah(kpi.unpaidAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {kpi.unpaidBillCount} tagihan
            {kpi.overdueCount > 0 ? ` · ${kpi.overdueCount} jatuh tempo` : ''}
          </p>
        </div>
      </div>

      {/* Unified Section Tab Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto">
        {(
          [
            { id: 'dashboard', label: 'Dashboard Keuangan', icon: Wallet },
            {
              id: 'persetujuan',
              label: 'Persetujuan Anggaran',
              icon: CheckCircle2,
              badge: totalApprovalBadge,
            },
            { id: 'transaksi', label: 'Transaksi Keuangan', icon: Layers },
            {
              id: 'tagihan',
              label: 'Pembayaran & Tagihan',
              icon: CreditCard,
              badge: kpi.unpaidBillCount,
            },
            { id: 'rekap', label: 'Rekap Keuangan', icon: FileText },
          ] as Array<{
            id: FinanceSectionTab;
            label: string;
            icon: React.FC<{ className?: string }>;
            badge?: number;
          }>
        ).map((tabItem) => {
          const Icon = tabItem.icon;
          const active = section === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setSection(tabItem.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#13233C] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tabItem.label}</span>
              {typeof tabItem.badge === 'number' && tabItem.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                    active ? 'bg-[#FBC02D] text-[#13233C]' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {tabItem.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* SECTION 1: DASHBOARD KEUANGAN                                       */}
      {/* =================================================================== */}
      {section === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Project Budget vs Realization */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Realisasi Anggaran & Arus Kas Per Proyek
                  </h2>
                  <p className="text-xs text-slate-500">
                    Perbandingan RAB/Kontrak dengan pengeluaran terverifikasi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('rekap')}
                  className="text-xs font-semibold text-[#13233C] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Buka Rekap Lengkap →
                </button>
              </div>
              <div className="space-y-3.5">
                {dashboardProjectRows.map((row) => {
                  const pct =
                    row.budget_total > 0
                      ? Math.min(100, Math.round((row.expense_total / row.budget_total) * 100))
                      : 0;
                  return (
                    <div
                      key={row.project_id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-semibold text-slate-600">
                            {row.project_number}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {row.project_name}
                          </p>
                        </div>
                        <div className="text-left sm:text-right font-mono tabular-nums text-xs">
                          <span className="text-rose-700 font-semibold">
                            {formatRupiah(row.expense_total)}
                          </span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-slate-700 font-semibold">
                            {formatRupiah(row.budget_total)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 90 ? 'bg-rose-600' : pct >= 70 ? 'bg-amber-500' : 'bg-[#13233C]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>Serapan Anggaran: {pct}%</span>
                        <span className="font-mono tabular-nums">
                          Masuk: <strong className="text-emerald-700">{formatRupiah(row.income_total)}</strong>
                          {' · '}
                          Tagihan: <strong className="text-amber-700">{formatRupiah(row.unpaid_bills)}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cross-Module Pending Queue */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Antrean Integrasi Divisi</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pengajuan otomatis dari Teknik, Gudang, Lapangan & Tagihan
                </p>

                <div className="mt-4 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setSection('persetujuan')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Pengajuan RAB & Proyek (Teknik)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Review batas anggaran, setujui atau kembalikan revisi
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#13233C] shrink-0">
                      {pendingTeknikWorkflows.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection('persetujuan')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Pengadaan Material Gudang (Logistik)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Menunggu persetujuan anggaran pengadaan material
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#13233C] shrink-0">
                      {pendingWarehouseOrders.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection('persetujuan')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Verifikasi Biaya Lapangan & Transaksi
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Pengeluaran operasional dari Tim Lapangan / Staff
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-amber-700 shrink-0">
                      {pendingFieldOrManualTx.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection('tagihan')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Tagihan Supplier & Jatuh Tempo
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {kpi.overdueCount > 0
                          ? `${kpi.overdueCount} tagihan melewati jatuh tempo`
                          : 'Pantau pembayaran material & operasional'}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-rose-700 shrink-0">
                      {kpi.unpaidBillCount}
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Laporan Aset Proyek: {pendingAssetReports.length} menunggu
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModule('aset')}
                  className="text-xs font-semibold text-[#13233C] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Buka Aset Proyek →
                </button>
              </div>
            </div>
          </div>

          {/* Latest Transactions */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Transaksi Keuangan Terbaru</h2>
                <p className="text-xs text-slate-500">
                  6 pencatatan terakhir dari manual, kontrak termin, tagihan, dan laporan lapangan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSection('transaksi')}
                className="text-xs font-semibold text-[#13233C] hover:underline whitespace-nowrap cursor-pointer"
              >
                Kelola Semua Transaksi →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="py-2.5 px-4">No. Transaksi</th>
                    <th className="py-2.5 px-4">Tanggal</th>
                    <th className="py-2.5 px-4">Proyek</th>
                    <th className="py-2.5 px-4">Kategori & Keterangan</th>
                    <th className="py-2.5 px-4 text-right">Nominal</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {state.financialTransactions.slice(0, 6).map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {tx.transaction_no}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateID(tx.date)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 max-w-[200px] truncate">
                        {getProjectName(tx.project_id)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">{tx.category}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span>{tx.description}</span>
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          tx.type === 'Pemasukan' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tx.type === 'Pemasukan' ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusLabel status={tx.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SECTION 2: PERSETUJUAN ANGGARAN & INTEGRASI LINTAS DIVISI           */}
      {/* =================================================================== */}
      {section === 'persetujuan' && (
        <div className="space-y-5">
          {/* 2A. Pengajuan RAB & Proyek dari Tim Teknik */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  1. Persetujuan Proyek & RAB dari Divisi Teknik
                </h2>
                <p className="text-xs text-slate-500">
                  Periksa rincian RAB dan kebutuhan material Teknik, lalu Setujui, Kembalikan Revisi, atau Tolak
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-600">
                {pendingTeknikWorkflows.length} pengajuan menunggu
              </span>
            </div>

            {pendingTeknikWorkflows.length === 0 ? (
              <EmptyState
                title="Tidak ada pengajuan RAB yang menunggu"
                description="Semua pengajuan proyek dan RAB dari Tim Teknik telah diperiksa."
              />
            ) : (
              <div className="space-y-3">
                {pendingTeknikWorkflows.map((wf) => {
                  const prj = state.projects.find((p) => p.id === wf.project_id);
                  if (!prj) return null;
                  const rabTotal = state.budgets
                    .filter((b) => b.project_id === prj.id && !b.is_deleted)
                    .reduce((a, b) => a + b.total_cost, 0);
                  const matEst = wf.material_needs.reduce(
                    (a, n) => a + n.qty_needed * n.estimated_unit_cost,
                    0
                  );
                  const recommendedLimit = rabTotal || wf.work_cost_estimate || matEst;

                  return (
                    <div
                      key={wf.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-slate-900">
                            {prj.project_number}
                          </span>
                          <StatusLabel status="Menunggu Review Finance" />
                          <span className="text-slate-500">· Pengaju: {wf.submitter_name}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{prj.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                          <span>RAB: {formatRupiah(rabTotal)}</span>
                          <span>Material ({wf.material_needs.length} item): {formatRupiah(matEst)}</span>
                          <span>Rekomendasi Batas: {formatRupiah(recommendedLimit)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setReviewProjectModal(prj)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Periksa RAB
                        </button>
                        {canVerifyOrDelete && (
                          <>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setWfDecisionDialog({
                                  projectId: prj.id,
                                  projectNumber: prj.project_number,
                                  decision: 'APPROVE',
                                  approvedBudget: recommendedLimit,
                                  title: `Setujui Anggaran ${prj.project_number}`,
                                  description:
                                    'Proyek disetujui secara anggaran dan akan masuk ke tahap Kontrak & Persiapan Logistik.',
                                  confirmLabel: 'Setujui Anggaran',
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Setujui
                            </button>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setWfDecisionDialog({
                                  projectId: prj.id,
                                  projectNumber: prj.project_number,
                                  decision: 'REQUEST_REVISION',
                                  approvedBudget: recommendedLimit,
                                  title: `Kembalikan Revisi ${prj.project_number}`,
                                  description:
                                    'Kembalikan pengajuan ke Tim Teknik untuk revisi RAB atau volume pekerjaan.',
                                  confirmLabel: 'Kembalikan ke Teknik',
                                  requireNote: true,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Revisi
                            </button>
                            <button
                              type="button"
                              disabled={workflowBusy}
                              onClick={() =>
                                setWfDecisionDialog({
                                  projectId: prj.id,
                                  projectNumber: prj.project_number,
                                  decision: 'REJECT',
                                  approvedBudget: 0,
                                  title: `Tolak Anggaran ${prj.project_number}`,
                                  description:
                                    'Pengajuan proyek ditolak oleh Finance. Wajib menyertakan alasan penolakan.',
                                  confirmLabel: 'Tolak Pengajuan',
                                  danger: true,
                                  requireNote: true,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2B. Pengadaan Material Gudang & Tambah Qty Stok Finance */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  2. Persetujuan Pengadaan Material Gudang & Tambah Qty Stok
                </h2>
                <p className="text-xs text-slate-500">
                  Pengadaan yang disetujui Finance tidak langsung menambah stok — stok bertambah setelah konfirmasi penerimaan fisik oleh Logistik
                </p>
              </div>
              <button
                type="button"
                onClick={openAddStockModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Tambah Qty Stok
              </button>
            </div>

            {warehouseOrders.length === 0 ? (
              <EmptyState
                title="Belum ada pengajuan pengadaan stok"
                description="Gunakan tombol Tambah Qty Stok atau tunggu pengajuan pengadaan dari Divisi Logistik."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">No. Order</th>
                      <th className="py-2.5 px-3">Material & Gudang</th>
                      <th className="py-2.5 px-3 text-right">Qty Rencana</th>
                      <th className="py-2.5 px-3 text-right">Estimasi Nilai</th>
                      <th className="py-2.5 px-3">Sumber & Petugas</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {warehouseOrders.slice(0, 10).map((ord) => {
                      const mat = state.materials.find((m) => m.id === ord.material_id);
                      const estValue = ord.qty_planned * (ord.unit_cost || mat?.unit_cost || 0);
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {ord.order_no}
                            <div className="text-[11px] font-sans font-normal text-slate-500">
                              {formatDateID(ord.order_date)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-900">
                              {mat ? `${mat.code} — ${mat.name}` : ord.material_id}
                            </p>
                            <p className="text-[11px] text-slate-500">{ord.warehouse_name}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                            {formatNumber(ord.qty_planned)} {mat?.unit || ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatRupiah(estValue)}
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-slate-800">{ord.source_name}</p>
                            <p className="text-[11px] text-slate-500">Oleh: {ord.requested_by_name}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusLabel status={ord.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {ord.status === 'Menunggu Persetujuan Finance' && canVerifyOrDelete ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOrderDecisionDialog({
                                      id: ord.id,
                                      orderNo: ord.order_no,
                                      decision: 'APPROVE',
                                    })
                                  }
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  Setujui
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOrderDecisionDialog({
                                      id: ord.id,
                                      orderNo: ord.order_no,
                                      decision: 'REJECT',
                                    })
                                  }
                                  className="px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {ord.stock_applied ? 'Stok Masuk' : 'Menunggu Logistik'}
                              </span>
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

          {/* 2C. Verifikasi Biaya Lapangan & Aset Proyek */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    3. Verifikasi Biaya Lapangan & Transaksi Menunggu
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pengajuan biaya operasional dari Tim Lapangan & Staff Finance
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-amber-700">
                  {pendingFieldOrManualTx.length} pending
                </span>
              </div>
              {pendingFieldOrManualTx.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Tidak ada transaksi atau biaya lapangan yang menunggu verifikasi.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {pendingFieldOrManualTx.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-semibold text-slate-900">
                          {tx.transaction_no} · {formatDateID(tx.date)}
                        </p>
                        <p className="text-xs text-slate-700 truncate">{tx.description}</p>
                        <p className="text-xs font-mono font-bold text-rose-700 mt-0.5 tabular-nums">
                          {formatRupiah(tx.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                        >
                          Detail
                        </button>
                        {canVerifyOrDelete && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmTxDecision({ tx, decision: 'Terverifikasi' })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Verifikasi
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmTxDecision({ tx, decision: 'Ditolak' })}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aset Proyek Integration Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      4. Integrasi Aset Proyek (Divisi Finance)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Catat aset proyek baru atau tindak lanjuti laporan kehilangan/kerusakan
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetError('');
                      setAddAssetModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Aset
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 mt-3">
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                    <p className="text-[11px] text-slate-500">Total Aset Proyek</p>
                    <p className="text-base font-bold font-mono text-slate-900 mt-0.5 tabular-nums">
                      {(state.projectAssets || []).length}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                    <p className="text-[11px] text-slate-500">Laporan Menunggu</p>
                    <p className="text-base font-bold font-mono text-amber-700 mt-0.5 tabular-nums">
                      {pendingAssetReports.length}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                    <p className="text-[11px] text-slate-500">Rusak / Hilang</p>
                    <p className="text-base font-bold font-mono text-rose-700 mt-0.5 tabular-nums">
                      {(state.projectAssets || []).reduce(
                        (s, a) => s + a.qty_damaged + a.qty_lost,
                        0
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5 text-slate-500" />
                  Pemeriksaan laporan kehilangan & kerusakan dilakukan pada modul Aset Proyek
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModule('aset')}
                  className="text-xs font-semibold text-[#13233C] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  Buka Aset Proyek →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SECTION 3: TRANSAKSI KEUANGAN (CRUD + INLINE PROOF UPLOAD)          */}
      {/* =================================================================== */}
      {section === 'transaksi' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Daftar Transaksi Keuangan</h2>
                <p className="text-xs text-slate-500">
                  Pencatatan pemasukan dan pengeluaran proyek lengkap dengan upload bukti langsung di form
                </p>
              </div>
              <button
                type="button"
                onClick={openAddTxModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Transaksi
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <SearchInput
                value={txSearch}
                onChange={(v) => {
                  setTxSearch(v);
                  setTxPage(1);
                }}
                placeholder="Cari nomor, keterangan, bukti..."
              />
              <select
                value={txProjectFilter}
                onChange={(e) => {
                  setTxProjectFilter(e.target.value);
                  setTxPage(1);
                }}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Proyek</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
              <select
                value={txTypeFilter}
                onChange={(e) => {
                  setTxTypeFilter(e.target.value as typeof txTypeFilter);
                  setTxPage(1);
                }}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Jenis (Masuk & Keluar)</option>
                <option value="Pemasukan">Pemasukan</option>
                <option value="Pengeluaran">Pengeluaran</option>
              </select>
              <select
                value={txCategoryFilter}
                onChange={(e) => {
                  setTxCategoryFilter(e.target.value);
                  setTxPage(1);
                }}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Kategori</option>
                {TX_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={txStatusFilter}
                onChange={(e) => {
                  setTxStatusFilter(e.target.value);
                  setTxPage(1);
                }}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="Terverifikasi">Terverifikasi</option>
                <option value="Menunggu">Menunggu</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </div>
          </div>

          {paginatedTransactions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Tidak ada transaksi sesuai filter"
                description="Sesuaikan kata kunci pencarian atau tambah transaksi keuangan baru."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">No. Transaksi</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Proyek</th>
                    <th className="py-2.5 px-3">Kategori & Keterangan</th>
                    <th className="py-2.5 px-3">Jenis</th>
                    <th className="py-2.5 px-3 text-right">Nominal</th>
                    <th className="py-2.5 px-3">Bukti</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {paginatedTransactions.map((tx) => {
                    const att = getAttachmentMeta(tx.proof_attachment_id);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {tx.transaction_no}
                          {tx.source_module && (
                            <div className="text-[10px] font-sans font-normal text-slate-500">
                              Sumber: {tx.source_module}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {formatDateID(tx.date)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[180px] truncate">
                          {getProjectName(tx.project_id)}
                        </td>
                        <td className="py-2.5 px-3 max-w-[260px]">
                          <p className="font-semibold text-slate-900">{tx.category}</p>
                          <p className="text-slate-600 truncate">{tx.description}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              tx.type === 'Pemasukan' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {tx.type === 'Pemasukan' ? (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                            {tx.type}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            tx.type === 'Pemasukan' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {formatRupiah(tx.amount)}
                        </td>
                        <td className="py-2.5 px-3 max-w-[140px]">
                          {att ? (
                            <button
                              type="button"
                              onClick={() => void openAttachmentFile(att.id, 'inline')}
                              className="text-xs font-medium text-[#13233C] hover:underline truncate max-w-[130px] block cursor-pointer"
                            >
                              {att.original_name}
                            </button>
                          ) : (
                            <span className="text-slate-600 truncate block">{tx.proof_ref || '-'}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusLabel status={tx.status} />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailTx(tx)}
                              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                              title="Detail Transaksi"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditTxModal(tx)}
                              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                              title="Edit Transaksi"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {tx.status === 'Menunggu' && canVerifyOrDelete && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmTxDecision({ tx, decision: 'Terverifikasi' })
                                  }
                                  className="p-1.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                                  title="Verifikasi"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmTxDecision({ tx, decision: 'Ditolak' })}
                                  className="p-1.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                  title="Tolak"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canVerifyOrDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteTxTarget(tx)}
                                className="p-1.5 rounded border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 cursor-pointer"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3.5 border-t border-slate-200">
            <PaginationBar
              page={txPage}
              totalPages={txTotalPages}
              totalItems={filteredTransactions.length}
              onPageChange={setTxPage}
            />
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SECTION 4: PEMBAYARAN & TAGIHAN + LIVE KONTRAK TERMIN               */}
      {/* =================================================================== */}
      {section === 'tagihan' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Tagihan Supplier, Pembayaran Material & Biaya Operasional
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pembayaran tagihan otomatis tercatat sebagai pengeluaran terverifikasi pada proyek terkait
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddBillModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Catat Tagihan Baru
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <SearchInput
                  value={billSearch}
                  onChange={setBillSearch}
                  placeholder="Cari no. tagihan, vendor, keterangan..."
                />
                <select
                  value={billProjectFilter}
                  onChange={(e) => setBillProjectFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
                >
                  <option value="SEMUA">Semua Proyek</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={billStatusFilter}
                  onChange={(e) => setBillStatusFilter(e.target.value as typeof billStatusFilter)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
                >
                  <option value="SEMUA">Semua Status Pembayaran</option>
                  <option value="Belum Bayar">Belum Bayar</option>
                  <option value="Sebagian">Sebagian</option>
                  <option value="Jatuh Tempo">Jatuh Tempo</option>
                  <option value="Lunas">Lunas</option>
                </select>
              </div>
            </div>

            {filteredBills.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Belum ada data tagihan"
                  description="Tambahkan tagihan supplier, pembayaran material, atau biaya operasional proyek."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">No. Tagihan</th>
                      <th className="py-2.5 px-3">Vendor / Supplier</th>
                      <th className="py-2.5 px-3">Proyek & Keterangan</th>
                      <th className="py-2.5 px-3">Jatuh Tempo</th>
                      <th className="py-2.5 px-3 text-right">Total Tagihan</th>
                      <th className="py-2.5 px-3 text-right">Terbayar & Sisa</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredBills.map((bill) => {
                      const remaining = Math.max(0, bill.amount - bill.paid_amount);
                      return (
                        <tr key={bill.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {bill.bill_no}
                            <div className="text-[10px] font-sans font-normal text-slate-500">
                              {bill.category}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {bill.vendor_name}
                          </td>
                          <td className="py-2.5 px-3 max-w-[240px]">
                            <p className="text-slate-800 font-medium truncate">
                              {getProjectName(bill.project_id)}
                            </p>
                            <p className="text-slate-500 truncate">{bill.description}</p>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <p className="text-slate-800 font-medium">
                              {formatDateID(bill.due_date)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Tgl: {formatDateID(bill.bill_date)}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatRupiah(bill.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="text-emerald-700 font-semibold">
                              Dibayar: {formatRupiah(bill.paid_amount)}
                            </div>
                            <div className="text-amber-700 text-[11px]">
                              Sisa: {formatRupiah(remaining)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusLabel status={bill.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openPayBillModal(bill)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  Bayar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDetailBill(bill)}
                                className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                                title="Detail Tagihan"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditBillModal(bill)}
                                className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                                title="Edit Tagihan"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {canVerifyOrDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteBillTarget(bill)}
                                  className="p-1.5 rounded border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 cursor-pointer"
                                  title="Hapus Tagihan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
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

          {/* Read-only Live Kontrak & Termin Payment Realization */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Pemantauan Termin Kontrak (Realisasi Pemasukan Proyek)
                </h2>
                <p className="text-xs text-slate-500">
                  Terintegrasi otomatis dengan modul Kontrak & Termin
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('kontrak')}
                className="text-xs font-semibold text-[#13233C] hover:underline whitespace-nowrap cursor-pointer"
              >
                Kelola Pencairan Termin di Modul Kontrak →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">No. Kontrak & Termin</th>
                    <th className="py-2.5 px-3">Proyek</th>
                    <th className="py-2.5 px-3">Jadwal & Progres</th>
                    <th className="py-2.5 px-3 text-right">Nilai Termin</th>
                    <th className="py-2.5 px-3 text-right">Terbayar</th>
                    <th className="py-2.5 px-3">Status Termin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {contractTermRows.map(({ term, contract, prj, paid }) => (
                    <tr key={term.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <p className="font-mono font-semibold text-slate-900">
                          {contract.contract_number}
                        </p>
                        <p className="text-slate-600">{term.term_number}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {prj ? `${prj.project_number} — ${prj.name}` : contract.work_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {formatDateID(term.execution_date)} · Progres {term.actual_progress}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatRupiah(term.term_value)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatRupiah(paid)}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusLabel status={term.payment_realization_status || term.payment_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SECTION 5: REKAP KEUANGAN, IMPOR EXCEL/CSV & EXPORT A4 / EXCEL      */}
      {/* =================================================================== */}
      {section === 'rekap' && (
        <div className="space-y-5">
          {/* Filter & Action Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Rekap Keuangan Per Proyek & Laporan Keseluruhan
                </h2>
                <p className="text-xs text-slate-500">
                  Filter periode & proyek, impor data Excel/CSV ke database, atau export PDF A4, Excel, dan Cetak
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openImportModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Impor CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportFinancePdf(buildExportOptions())}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-700" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportFinanceExcel(buildExportOptions())}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = openFinancePrintA4Window(buildExportOptions());
                    if (!res.ok && res.message) showToast(res.message);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              <select
                value={recapProjectFilter}
                onChange={(e) => setRecapProjectFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Proyek</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
              <div>
                <input
                  type="month"
                  value={recapMonth}
                  onChange={(e) => setRecapMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
                  title="Filter Bulan"
                />
              </div>
              <input
                type="date"
                value={recapDateFrom}
                onChange={(e) => setRecapDateFrom(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
                title="Tanggal Dari"
              />
              <input
                type="date"
                value={recapDateTo}
                onChange={(e) => setRecapDateTo(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
                title="Tanggal Sampai"
              />
              <select
                value={recapCategoryFilter}
                onChange={(e) => setRecapCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Kategori</option>
                {TX_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={recapStatusFilter}
                onChange={(e) => setRecapStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="Terverifikasi">Terverifikasi</option>
                <option value="Menunggu">Menunggu</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </div>
            {hasActiveRecapFilter && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>
                  Menampilkan <span className="font-semibold text-slate-800">{recapTransactions.length}</span> transaksi sesuai filter (Export &amp; Cetak mencakup seluruh data terfilter).
                </span>
                <button
                  type="button"
                  onClick={resetRecapFilters}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Filter
                </button>
              </div>
            )}
          </div>

          {/* Recap Summary Per Project */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                1. Ringkasan Keuangan Per Proyek
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {recapTransactions.length} transaksi sesuai filter
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">No. Proyek</th>
                    <th className="py-2.5 px-3">Nama Proyek</th>
                    <th className="py-2.5 px-3 text-right">Anggaran RAB</th>
                    <th className="py-2.5 px-3 text-right">Pemasukan</th>
                    <th className="py-2.5 px-3 text-right">Pengeluaran</th>
                    <th className="py-2.5 px-3 text-right">Saldo Bersih</th>
                    <th className="py-2.5 px-3 text-right">Sisa Tagihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {recapProjectRows.map((row) => (
                    <tr key={row.project_id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {row.project_number}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{row.project_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        {formatRupiah(row.budget_total)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {formatRupiah(row.income_total)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 font-semibold">
                        {formatRupiah(row.expense_total)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatRupiah(row.balance)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                        {formatRupiah(row.unpaid_bills)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-300 text-xs font-bold text-slate-900">
                    <td className="py-2.5 px-3" colSpan={2}>
                      TOTAL KESELURUHAN
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatRupiah(recapSummary.totalBudget)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-800">
                      {formatRupiah(recapSummary.totalIncome)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-800">
                      {formatRupiah(recapSummary.totalExpense)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatRupiah(recapSummary.netBalance)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800">
                      {formatRupiah(recapSummary.unpaidBills)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Filtered Transaction Ledger Preview */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                2. Rincian Transaksi Sesuai Filter Periode
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="py-2 px-3">No. Transaksi</th>
                    <th className="py-2 px-3">Tanggal</th>
                    <th className="py-2 px-3">Proyek</th>
                    <th className="py-2 px-3">Kategori</th>
                    <th className="py-2 px-3">Jenis</th>
                    <th className="py-2 px-3 text-right">Nominal</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {recapTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {t.transaction_no}
                      </td>
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateID(t.date)}
                      </td>
                      <td className="py-2 px-3 text-slate-700 max-w-[180px] truncate">
                        {getProjectName(t.project_id)}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{t.category}</td>
                      <td className="py-2 px-3">{t.type}</td>
                      <td
                        className={`py-2 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          t.type === 'Pemasukan' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRupiah(t.amount)}
                      </td>
                      <td className="py-2 px-3">
                        <StatusLabel status={t.status} />
                      </td>
                      <td className="py-2 px-3 text-slate-600 max-w-[260px] truncate">
                        {t.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS & DIALOGS                                                    */}
      {/* =================================================================== */}

      {/* Add / Edit Transaction Modal (With Inline Proof Upload) */}
      <Modal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        title={editingTx ? `Edit Transaksi ${editingTx.transaction_no}` : 'Tambah Transaksi Keuangan'}
        subtitle="Upload bukti transaksi dilakukan langsung pada form ini"
      >
        <form onSubmit={handleSaveTx} className="space-y-4">
          {txFormError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {txFormError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proyek Terkait</label>
            <select
              required
              value={txForm.project_id}
              onChange={(e) => setTxForm({ ...txForm, project_id: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="">-- Pilih Proyek --</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Transaksi</label>
              <select
                value={txForm.type}
                onChange={(e) =>
                  setTxForm({
                    ...txForm,
                    type: e.target.value as 'Pemasukan' | 'Pengeluaran',
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="Pengeluaran">Pengeluaran</option>
                <option value="Pemasukan">Pemasukan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
              <select
                value={txForm.category}
                onChange={(e) =>
                  setTxForm({ ...txForm, category: e.target.value as FinancialCategory })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {TX_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Transaksi</label>
              <input
                type="date"
                required
                value={txForm.date}
                onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nominal (Rp)</label>
              <input
                type="number"
                min={1}
                required
                value={txForm.amount || ''}
                onChange={(e) => setTxForm({ ...txForm, amount: Number(e.target.value) })}
                placeholder="Contoh: 15000000"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan</label>
            <textarea
              required
              rows={2}
              value={txForm.description}
              onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
              placeholder="Contoh: Pembayaran termin material beton atau biaya operasional lapangan"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          {/* Inline Upload Bukti Transaksi */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-800">
                Bukti Transaksi (Upload Langsung di Form)
              </label>
              {txForm.proof_attachment_id && (
                <button
                  type="button"
                  onClick={() =>
                    setTxForm((prev) => ({ ...prev, proof_attachment_id: '', proof_ref: '' }))
                  }
                  className="text-[11px] font-medium text-rose-600 hover:underline cursor-pointer"
                >
                  Hapus Lampiran
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={txForm.proof_ref}
                onChange={(e) => setTxForm({ ...txForm, proof_ref: e.target.value })}
                placeholder="Nomor kwitansi / referensi transfer"
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
              />
              <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#13233C]" />
                <span>
                  {txProofUploading
                    ? `Mengunggah ${txProofProgress}%...`
                    : txForm.proof_attachment_id
                    ? 'Ganti File Bukti'
                    : 'Upload File (PDF/JPG/PNG)'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => void handleUploadTxProof(e.target.files?.[0])}
                />
              </label>
            </div>
            {txForm.proof_attachment_id && (
              <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <span className="truncate font-medium">
                  Terlampir: {getAttachmentMeta(txForm.proof_attachment_id)?.original_name || txForm.proof_ref}
                </span>
                <button
                  type="button"
                  onClick={() => void openAttachmentFile(txForm.proof_attachment_id, 'inline')}
                  className="font-semibold underline shrink-0 cursor-pointer"
                >
                  Lihat File
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTxModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy || txProofUploading}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {editingTx ? 'Simpan Perubahan' : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal
        open={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title={`Detail Transaksi ${detailTx?.transaction_no || ''}`}
      >
        {detailTx && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-500">Proyek</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {getProjectName(detailTx.project_id)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tanggal & Sumber</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {formatDateID(detailTx.date)} · {detailTx.source_module || 'Manual'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Kategori & Jenis</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {detailTx.category} ({detailTx.type})
                </p>
              </div>
              <div>
                <p className="text-slate-500">Nominal</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-0.5 tabular-nums">
                  {formatRupiah(detailTx.amount)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <div className="mt-1">
                  <StatusLabel status={detailTx.status} />
                </div>
              </div>
              <div>
                <p className="text-slate-500">Referensi Bukti</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailTx.proof_ref || '-'}</p>
              </div>
            </div>

            <div>
              <p className="text-slate-500 mb-1">Keterangan</p>
              <p className="p-3 rounded-lg border border-slate-200 text-slate-800">
                {detailTx.description}
              </p>
            </div>

            {detailTx.proof_attachment_id && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-800">
                  Lampiran: {getAttachmentMeta(detailTx.proof_attachment_id)?.original_name || detailTx.proof_ref}
                </span>
                <button
                  type="button"
                  onClick={() => void openAttachmentFile(detailTx.proof_attachment_id!, 'inline')}
                  className="px-3 py-1.5 rounded-lg bg-[#13233C] text-white font-semibold cursor-pointer"
                >
                  Buka Dokumen Bukti
                </button>
              </div>
            )}

            {detailTx.verified_by_name && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                Diverifikasi oleh <strong className="text-slate-900">{detailTx.verified_by_name}</strong>
                {detailTx.verified_at ? ` pada ${formatDateTimeID(detailTx.verified_at)}` : ''}
                {detailTx.decision_note ? ` · Catatan: ${detailTx.decision_note}` : ''}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Verify / Reject Transaction Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmTxDecision)}
        title={
          confirmTxDecision?.decision === 'Terverifikasi'
            ? `Verifikasi ${confirmTxDecision.tx.transaction_no}`
            : `Tolak ${confirmTxDecision?.tx.transaction_no}`
        }
        description={
          confirmTxDecision
            ? `${confirmTxDecision.tx.category} (${formatRupiah(confirmTxDecision.tx.amount)}) — ${confirmTxDecision.tx.description}`
            : ''
        }
        confirmLabel={confirmTxDecision?.decision === 'Terverifikasi' ? 'Ya, Verifikasi' : 'Tolak'}
        danger={confirmTxDecision?.decision === 'Ditolak'}
        requireNote={confirmTxDecision?.decision === 'Ditolak'}
        onCancel={() => setConfirmTxDecision(null)}
        onConfirm={async (note) => {
          if (!confirmTxDecision) return;
          await decideFinanceTransactionApi(
            confirmTxDecision.tx.id,
            confirmTxDecision.decision,
            note
          );
          setConfirmTxDecision(null);
        }}
      />

      {/* Delete Transaction Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTxTarget)}
        title={`Hapus Transaksi ${deleteTxTarget?.transaction_no || ''}`}
        description="Yakin ingin menghapus transaksi keuangan ini secara permanen?"
        confirmLabel="Hapus Transaksi"
        danger
        onCancel={() => setDeleteTxTarget(null)}
        onConfirm={async () => {
          if (!deleteTxTarget) return;
          await deleteFinanceTransactionApi(deleteTxTarget.id);
          setDeleteTxTarget(null);
        }}
      />

      {/* Add / Edit Bill Modal */}
      <Modal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        title={editingBill ? `Edit Tagihan ${editingBill.bill_no}` : 'Catat Tagihan & Kewajiban Bayar'}
        subtitle="Catat tagihan supplier, pembayaran material, atau biaya operasional proyek"
      >
        <form onSubmit={handleSaveBill} className="space-y-4">
          {billFormError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {billFormError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Proyek Terkait</label>
              <select
                required
                value={billForm.project_id}
                onChange={(e) => setBillForm({ ...billForm, project_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Tagihan</label>
              <select
                value={billForm.category}
                onChange={(e) =>
                  setBillForm({ ...billForm, category: e.target.value as FinanceBillCategory })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {BILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Supplier / Penerima Pembayaran
            </label>
            <input
              type="text"
              required
              value={billForm.vendor_name}
              onChange={(e) => setBillForm({ ...billForm, vendor_name: e.target.value })}
              placeholder="Contoh: PT Baja Perkasa atau CV Sumber Material"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Tagihan</label>
              <input
                type="date"
                required
                value={billForm.bill_date}
                onChange={(e) => setBillForm({ ...billForm, bill_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Jatuh Tempo</label>
              <input
                type="date"
                required
                value={billForm.due_date}
                onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Total Nominal Tagihan (Rp)
              </label>
              <input
                type="number"
                min={1}
                required
                value={billForm.amount || ''}
                onChange={(e) => setBillForm({ ...billForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
            {!editingBill && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  DP / Sudah Dibayar (Opsional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={billForm.paid_amount || ''}
                  onChange={(e) => setBillForm({ ...billForm, paid_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan</label>
            <textarea
              required
              rows={2}
              value={billForm.description}
              onChange={(e) => setBillForm({ ...billForm, description: e.target.value })}
              placeholder="Rincian invoice atau material yang ditagihkan"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Dokumen Invoice / Bukti Tagihan (Inline Upload)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={billForm.proof_ref}
                onChange={(e) => setBillForm({ ...billForm, proof_ref: e.target.value })}
                placeholder="No. Invoice supplier"
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
              />
              <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{billProofUploading ? 'Mengunggah...' : 'Upload Invoice (PDF/Gambar)'}</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => void handleUploadBillProof(e.target.files?.[0])}
                />
              </label>
            </div>
            {billForm.proof_attachment_id && (
              <p className="text-xs text-emerald-700 font-medium">
                Terlampir: {getAttachmentMeta(billForm.proof_attachment_id)?.original_name || billForm.proof_ref}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBillModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy || billProofUploading}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {editingBill ? 'Simpan Tagihan' : 'Catat Tagihan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bill Detail Modal */}
      <Modal
        open={Boolean(detailBill)}
        onClose={() => setDetailBill(null)}
        title={`Detail Tagihan ${detailBill?.bill_no || ''}`}
      >
        {detailBill && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-500">Vendor / Supplier</p>
                <p className="font-semibold text-slate-900 mt-0.5">{detailBill.vendor_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Proyek</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {getProjectName(detailBill.project_id)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tanggal / Jatuh Tempo</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {formatDateID(detailBill.bill_date)} · Tempo {formatDateID(detailBill.due_date)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <div className="mt-1">
                  <StatusLabel status={detailBill.status} />
                </div>
              </div>
              <div>
                <p className="text-slate-500">Total Tagihan</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">
                  {formatRupiah(detailBill.amount)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Sudah Dibayar</p>
                <p className="font-mono font-bold text-emerald-700 mt-0.5">
                  {formatRupiah(detailBill.paid_amount)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-1">Keterangan</p>
              <p className="p-3 rounded-lg border border-slate-200 text-slate-800">
                {detailBill.description}
              </p>
            </div>
            {detailBill.proof_attachment_id && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void openAttachmentFile(detailBill.proof_attachment_id!, 'inline')}
                  className="px-3.5 py-2 rounded-lg bg-[#13233C] text-white font-semibold cursor-pointer"
                >
                  Lihat Dokumen Invoice
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Pay Bill Modal */}
      <Modal
        open={Boolean(payBillTarget)}
        onClose={() => setPayBillTarget(null)}
        title={`Pembayaran Tagihan ${payBillTarget?.bill_no || ''}`}
        subtitle={
          payBillTarget
            ? `${payBillTarget.vendor_name} · Sisa tagihan: ${formatRupiah(
                Math.max(0, payBillTarget.amount - payBillTarget.paid_amount)
              )}`
            : ''
        }
      >
        {payBillTarget && (
          <form onSubmit={handleConfirmPayBill} className="space-y-4">
            {payBillError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {payBillError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nominal Pembayaran (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(0, payBillTarget.amount - payBillTarget.paid_amount)}
                  required
                  value={payBillForm.pay_amount || ''}
                  onChange={(e) =>
                    setPayBillForm({ ...payBillForm, pay_amount: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Pembayaran
                </label>
                <input
                  type="date"
                  required
                  value={payBillForm.payment_date}
                  onChange={(e) =>
                    setPayBillForm({ ...payBillForm, payment_date: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                Bukti Transfer Pembayaran
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={payBillForm.proof_ref}
                  onChange={(e) => setPayBillForm({ ...payBillForm, proof_ref: e.target.value })}
                  placeholder="No. referensi transfer bank"
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                />
                <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{payProofUploading ? 'Mengunggah...' : 'Upload Bukti Transfer'}</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => void handleUploadPayProof(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Pembayaran (Opsional)
              </label>
              <input
                type="text"
                value={payBillForm.note}
                onChange={(e) => setPayBillForm({ ...payBillForm, note: e.target.value })}
                placeholder="Contoh: Pelunasan via transfer BCA"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayBillTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy || payProofUploading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Simpan Pembayaran
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Bill Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteBillTarget)}
        title={`Hapus Tagihan ${deleteBillTarget?.bill_no || ''}`}
        description={`Yakin ingin menghapus tagihan ${deleteBillTarget?.vendor_name || ''}?`}
        confirmLabel="Hapus Tagihan"
        danger
        onCancel={() => setDeleteBillTarget(null)}
        onConfirm={async () => {
          if (!deleteBillTarget) return;
          await deleteFinanceBillApi(deleteBillTarget.id);
          setDeleteBillTarget(null);
        }}
      />

      {/* Teknik RAB Full Inspection Modal */}
      <Modal
        open={Boolean(reviewProjectModal)}
        onClose={() => setReviewProjectModal(null)}
        title={`Pemeriksaan RAB & Material — ${reviewProjectModal?.project_number ?? ''}`}
        subtitle={reviewProjectModal?.name}
        maxWidth="max-w-4xl"
      >
        {reviewProjectModal && <ProjectWorkflowPanel project={reviewProjectModal} />}
      </Modal>

      {/* Teknik Workflow Finance Decision Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(wfDecisionDialog)}
        title={wfDecisionDialog?.title ?? ''}
        description={wfDecisionDialog?.description ?? ''}
        confirmLabel={wfDecisionDialog?.confirmLabel ?? 'Konfirmasi'}
        danger={wfDecisionDialog?.danger}
        requireNote={wfDecisionDialog?.requireNote}
        onCancel={() => setWfDecisionDialog(null)}
        onConfirm={async (note) => {
          if (!wfDecisionDialog) return;
          await decideWorkflowFinance(wfDecisionDialog.projectId, {
            decision: wfDecisionDialog.decision,
            note,
            approved_budget_limit: wfDecisionDialog.approvedBudget,
          });
          setWfDecisionDialog(null);
        }}
      />

      {/* Gudang Order Finance Decision Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(orderDecisionDialog)}
        title={
          orderDecisionDialog?.decision === 'APPROVE'
            ? `Setujui Pengadaan ${orderDecisionDialog.orderNo}`
            : `Tolak Pengadaan ${orderDecisionDialog?.orderNo}`
        }
        description={
          orderDecisionDialog?.decision === 'APPROVE'
            ? 'Setelah disetujui Finance, Divisi Logistik akan memeriksa fisik barang dan mengonfirmasi penerimaan agar stok gudang bertambah.'
            : 'Tolak pengajuan pengadaan stok material ini. Sertakan alasan penolakan.'
        }
        confirmLabel={orderDecisionDialog?.decision === 'APPROVE' ? 'Setujui Pengadaan' : 'Tolak'}
        danger={orderDecisionDialog?.decision === 'REJECT'}
        requireNote={orderDecisionDialog?.decision === 'REJECT'}
        onCancel={() => setOrderDecisionDialog(null)}
        onConfirm={async (note) => {
          if (!orderDecisionDialog) return;
          await decideWarehouseOrderFinanceApi(orderDecisionDialog.id, {
            decision: orderDecisionDialog.decision,
            note,
          });
          setOrderDecisionDialog(null);
        }}
      />

      {/* Finance Tambah Qty Stok Gudang Modal */}
      <Modal
        open={addStockModalOpen}
        onClose={() => setAddStockModalOpen(false)}
        title="Tambah Qty Stok Gudang (Divisi Finance)"
        subtitle="Stok akan masuk ke gudang yang dipilih setelah penerimaan fisik dikonfirmasi oleh Divisi Logistik"
      >
        <form onSubmit={handleSubmitAddStock} className="space-y-4">
          {addStockError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {addStockError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Material / Barang</label>
            <select
              required
              value={addStockForm.material_id}
              onChange={(e) => {
                const mat = state.materials.find((m) => m.id === e.target.value);
                setAddStockForm((prev) => ({
                  ...prev,
                  material_id: e.target.value,
                  warehouse_id: mat?.default_warehouse_id || prev.warehouse_id,
                  unit_cost: mat?.unit_cost ?? prev.unit_cost,
                }));
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {state.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lokasi Gudang</label>
              <select
                required
                value={addStockForm.warehouse_id}
                onChange={(e) => setAddStockForm({ ...addStockForm, warehouse_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Qty Tambah</label>
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={addStockForm.qty_planned || ''}
                onChange={(e) =>
                  setAddStockForm({ ...addStockForm, qty_planned: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sumber Barang / Supplier
              </label>
              <input
                type="text"
                required
                value={addStockForm.source_name}
                onChange={(e) => setAddStockForm({ ...addStockForm, source_name: e.target.value })}
                placeholder="Nama supplier atau toko"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                No. Bukti Transaksi / PO
              </label>
              <input
                type="text"
                required
                value={addStockForm.proof_ref}
                onChange={(e) => setAddStockForm({ ...addStockForm, proof_ref: e.target.value })}
                placeholder="Contoh: PO-2026-102"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal</label>
              <input
                type="date"
                required
                value={addStockForm.order_date}
                onChange={(e) => setAddStockForm({ ...addStockForm, order_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alokasi Proyek (Opsional)
              </label>
              <select
                value={addStockForm.project_id}
                onChange={(e) => setAddStockForm({ ...addStockForm, project_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="">Stok Umum Gudang</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>
              {addStockUploading
                ? 'Mengunggah dokumen bukti...'
                : addStockAttIds.length > 0
                ? `${addStockAttIds.length} bukti terlampir (Tambah lagi)`
                : 'Upload Bukti Transaksi (Opsional)'}
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAddStockUploading(true);
                try {
                  const uploaded = await uploadFiles({
                    files: [file],
                    module_id: 'finance',
                    entity_id: `stock-order-${addStockForm.material_id}`,
                    entity_label: `Tambah Stok ${addStockForm.proof_ref}`,
                    doc_category: 'Bukti Pembayaran',
                    description: `Bukti pengadaan stok oleh Finance (${file.name})`,
                    onProgress: () => undefined,
                  });
                  if (uploaded[0]) {
                    setAddStockAttIds((prev) => [...prev, uploaded[0].id]);
                  }
                } finally {
                  setAddStockUploading(false);
                }
              }}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddStockModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy || addStockUploading}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Simpan & Kirim ke Logistik
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Aset Proyek Modal */}
      <Modal
        open={addAssetModalOpen}
        onClose={() => setAddAssetModalOpen(false)}
        title="Tambah Aset Proyek (Divisi Finance)"
        subtitle="Aset atau peralatan kerja langsung terhubung ke data proyek pada modul Aset Proyek"
      >
        <form onSubmit={handleSubmitAddAsset} className="space-y-4">
          {assetError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {assetError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Proyek</label>
              <select
                required
                value={assetForm.project_id}
                onChange={(e) => setAssetForm({ ...assetForm, project_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Aset</label>
              <select
                value={assetForm.category}
                onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Aset</label>
              <input
                type="text"
                required
                value={assetForm.name}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                placeholder="Contoh: Cangkul, Helm Proyek"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah (Qty)</label>
              <input
                type="number"
                min={1}
                required
                value={assetForm.qty}
                onChange={(e) => setAssetForm({ ...assetForm, qty: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                required
                value={assetForm.unit}
                onChange={(e) => setAssetForm({ ...assetForm, unit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Pencatatan</label>
              <input
                type="date"
                required
                value={assetForm.recorded_date}
                onChange={(e) => setAssetForm({ ...assetForm, recorded_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kondisi Awal</label>
              <select
                value={assetForm.initial_condition}
                onChange={(e) =>
                  setAssetForm({
                    ...assetForm,
                    initial_condition: e.target.value as ProjectAssetCondition,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="Baik">Baik</option>
                <option value="Rusak">Rusak</option>
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer">
            <Building2 className="w-3.5 h-3.5" />
            <span>
              {assetPhotoUploading
                ? 'Mengunggah foto...'
                : assetForm.photo_attachment_id
                ? 'Foto Aset Terlampir (Ganti)'
                : 'Upload Foto Aset (Opsional)'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAssetPhotoUploading(true);
                try {
                  const uploaded = await uploadFiles({
                    files: [file],
                    module_id: 'aset',
                    entity_id: `asset-quick-${assetForm.project_id}`,
                    entity_label: assetForm.name || 'Aset Proyek',
                    doc_category: 'Foto Material / Aset',
                    description: `Foto aset proyek ${assetForm.name}`,
                    onProgress: () => undefined,
                  });
                  if (uploaded[0]) {
                    setAssetForm((prev) => ({ ...prev, photo_attachment_id: uploaded[0].id }));
                  }
                } finally {
                  setAssetPhotoUploading(false);
                }
              }}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddAssetModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy || assetPhotoUploading}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Simpan Aset Proyek
            </button>
          </div>
        </form>
      </Modal>

      {/* Import CSV / Excel Modal */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Impor CSV / Excel Transaksi Keuangan"
        subtitle="Validasi format kolom otomatis & pencegahan duplikasi transaksi dari modul lain"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{importFileName ? `File: ${importFileName}` : 'Pilih File (.csv / .xlsx / .xls)'}</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  void handleImportFileChange(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFinanceImportTemplateCsv(state.projects)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                Template CSV
              </button>
              <button
                type="button"
                onClick={() => downloadFinanceImportTemplateExcel(state.projects)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Template Excel
              </button>
            </div>
          </div>

          {importServerError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {importServerError}
            </div>
          )}

          {importDuplicates.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1 max-h-36 overflow-y-auto">
              <p className="font-semibold">
                {importDuplicates.length} baris dilewati karena sudah tercatat (pencegahan duplikasi):
              </p>
              {importDuplicates.map((dup, i) => (
                <p key={i}>• {dup}</p>
              ))}
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-1 max-h-36 overflow-y-auto">
              <p className="font-semibold">Ditemukan {importErrors.length} kesalahan format baris:</p>
              {importErrors.map((err, i) => (
                <p key={i}>• {err}</p>
              ))}
            </div>
          )}

          {importValidRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3.5 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-800">
                {importValidRows.length} baris valid &amp; bebas duplikat siap diimpor ke database
              </div>
              <div className="max-h-60 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3">Proyek</th>
                      <th className="py-2 px-3">Jenis</th>
                      <th className="py-2 px-3">Kategori</th>
                      <th className="py-2 px-3 text-right">Nominal</th>
                      <th className="py-2 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {importValidRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 whitespace-nowrap">{formatDateID(row.date)}</td>
                        <td className="py-2 px-3 font-mono">{row.project_number}</td>
                        <td className="py-2 px-3">{row.type}</td>
                        <td className="py-2 px-3">{row.category}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(row.amount)}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[200px]">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setImportModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={workflowBusy || importValidRows.length === 0}
              onClick={() => void handleConfirmImport()}
              className="px-4 py-2 rounded-lg bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Impor {importValidRows.length} Transaksi
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
