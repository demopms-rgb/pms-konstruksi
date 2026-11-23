import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_SEED_VERSION, INITIAL_PMS_DATA } from '../data/seedData';
import {
  AccountStatus,
  ActivityLog,
  AppNotification,
  AssetMovement,
  BudgetItem,
  CompanyAsset,
  Contract,
  ContractSubmenuKey,
  ContractTerm,
  DeliveryNote,
  Division,
  DivisionCode,
  DocumentStatus,
  Employee,
  FinanceBill,
  FinancialTransaction,
  InternalDocument,
  MaintenanceRecord,
  Material,
  MaterialRequest,
  MaterialRequestStatus,
  MaterialTransaction,
  ModuleKey,
  OfflineDraft,
  PMSState,
  Project,
  ProjectAsset,
  ProjectAssetReport,
  ProjectMaterialItem,
  ProjectSubmenuKey,
  ProjectWorkflow,
  Role,
  RoleCode,
  StockOpnameRecord,
  TeknikChangeReport,
  TeknikChangeStatus,
  TeknikCompletionReport,
  TeknikConstraintRecord,
  TeknikEvaluationReport,
  TeknikProgressAssessment,
  WarehouseLocation,
  WarehouseStockOrder,
  WarehouseSubmenuKey,
  WorkItem,
} from '../types/pms';
import { generateSignatureHash } from '../utils/format';
import { canAccessTeknikModule, canCreateContract } from '../utils/permissions';
import { ActorHeaders } from '../services/attachmentApi';
import {
  CreateProjectAssetPayload,
  CreateProjectAssetReportPayload,
  projectAssetApi,
  ResubmitProjectAssetReportPayload,
  ReviewProjectAssetReportPayload,
  UpdateProjectAssetPayload,
} from '../services/projectAssetApi';
import {
  CreateAddendumPayload,
  CreateContractPayload,
  DecideTermClaimPayload,
  FieldReportPayload,
  FinanceDecisionPayload,
  LogisticsProcessPayload,
  PrepareTeknikPayload,
  RecordTermPaymentPayload,
  SaveContractTermsPayload,
  SubmitTermClaimPayload,
  workflowApi,
} from '../services/workflowApi';
import {
  AdvanceWarehouseMaterialRequestPayload,
  ConfirmReceiveDeliveryNotePayload,
  ConfirmStockOrderReceiptPayload,
  CreateStockOpnamePayload,
  CreateStockOrderPayload,
  CreateWarehouseMaterialPayload,
  CreateWarehouseMaterialRequestPayload,
  DecideStockOrderFinancePayload,
  DispatchDeliveryNotePayload,
  IssueWarehouseStockPayload,
  SaveDeliveryNotePayload,
  SaveWarehouseLocationPayload,
  UpdateWarehouseMaterialPayload,
  warehouseApi,
} from '../services/warehouseApi';
import {
  CreateFinanceBillPayload,
  CreateFinanceTransactionPayload,
  financeApi,
  ImportFinanceTransactionRowPayload,
  PayFinanceBillPayload,
  UpdateFinanceBillPayload,
  UpdateFinanceTransactionPayload,
} from '../services/financeApi';
import {
  SaveTeknikChangePayload,
  SaveTeknikCompletionPayload,
  SaveTeknikConstraintPayload,
  SaveTeknikEvaluationPayload,
  SaveTeknikProgressAssessmentPayload,
  teknikReportApi,
} from '../services/teknikReportApi';
import {
  CreateDocumentPayload,
  documentApi,
  ReviseDocumentPayload,
  UpdateDocumentPayload,
} from '../services/documentApi';

const STORAGE_KEY = 'pms_konstruksi_state_v1';
const AUTH_SESSION_KEY = 'pms_konstruksi_session_nik_v1';

const VALID_MODULE_KEYS: Set<ModuleKey> = new Set([
  'dashboard',
  'proyek',
  'kontrak',
  'rab',
  'gudang',
  'teknik',
  'logistik',
  'finance',
  'aset',
  'dokumen',
  'karyawan',
  'persetujuan',
  'laporan',
  'pengaturan',
]);

function parseModuleFromLocation(): ModuleKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const queryMod = params.get('module')?.trim().toLowerCase() as ModuleKey | undefined;
    if (queryMod && VALID_MODULE_KEYS.has(queryMod)) return queryMod;

    const hashSeg = window.location.hash.replace(/^#\/?/, '').split('/')[0]?.trim().toLowerCase() as ModuleKey | undefined;
    if (hashSeg && VALID_MODULE_KEYS.has(hashSeg)) return hashSeg;

    const pathSeg = window.location.pathname.replace(/^\/+/, '').split('/')[0]?.trim().toLowerCase() as ModuleKey | undefined;
    if (pathSeg && VALID_MODULE_KEYS.has(pathSeg)) return pathSeg;
  } catch {
    // ignore URL parsing errors
  }
  return null;
}

const LEGACY_DEMO_SETS = {
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

function replaceBekasiToDepokClient(val: string | undefined): string {
  return String(val ?? '').replace(/bekasi\s+selatan/gi, 'Depok').replace(/bekasi/gi, 'Depok');
}

function normalizeWarehousesAndMaterialsClient(state: PMSState): PMSState {
  const baseWarehouses = INITIAL_PMS_DATA.warehouses || [];
  const rawWarehouses = Array.isArray(state.warehouses) && state.warehouses.length > 0
    ? state.warehouses
    : baseWarehouses;
  const warehouses = rawWarehouses.map((w) => ({
    ...w,
    name: replaceBekasiToDepokClient(w.name),
    address: replaceBekasiToDepokClient(w.address),
    notes: w.notes !== undefined ? replaceBekasiToDepokClient(w.notes) : undefined,
  }));
  const defaultWh = warehouses.find((w) => w.id === 'wh-depok') || warehouses[0];
  const resolveWh = (idOrName?: string): WarehouseLocation => {
    const key = replaceBekasiToDepokClient(idOrName).trim().toLowerCase();
    if (key) {
      const found = warehouses.find(
        (w) =>
          w.id.toLowerCase() === key ||
          w.name.toLowerCase() === key ||
          w.code.toLowerCase() === key
      );
      if (found) return found;
    }
    return defaultWh;
  };

  const materials = state.materials.map((m) => {
    const wh = resolveWh(m.default_warehouse_id || m.warehouse_location);
    const hasMap = m.warehouse_stocks && Object.keys(m.warehouse_stocks).length > 0;
    const rawMap: Record<string, number> = hasMap
      ? { ...m.warehouse_stocks }
      : { [wh.id]: Math.round(Number(m.stock ?? 0) * 100) / 100 };
    if (rawMap[wh.id] === undefined) {
      rawMap[wh.id] = 0;
    }
    let total = 0;
    for (const v of Object.values(rawMap)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) total += n;
    }
    return {
      ...m,
      default_warehouse_id: wh.id,
      warehouse_location: wh.name,
      warehouse_stocks: rawMap,
      stock: Math.round(total * 100) / 100,
    };
  });

  return {
    ...state,
    warehouses,
    materials,
    projects: state.projects.map((p) => ({
      ...p,
      location: replaceBekasiToDepokClient(p.location),
    })),
    materialTransactions: state.materialTransactions.map((t) => {
      const wh = resolveWh(t.warehouse_id || t.warehouse_name);
      return {
        ...t,
        warehouse_id: t.warehouse_id || wh.id,
        warehouse_name: replaceBekasiToDepokClient(t.warehouse_name || wh.name),
        source_or_destination: replaceBekasiToDepokClient(t.source_or_destination),
      };
    }),
    materialRequests: state.materialRequests.map((r) => ({
      ...r,
      notes: replaceBekasiToDepokClient(r.notes),
    })),
    companyAssets: state.companyAssets.map((a) => ({
      ...a,
      location: replaceBekasiToDepokClient(a.location),
    })),
    assetMovements: state.assetMovements.map((am) => ({
      ...am,
      from_location: replaceBekasiToDepokClient(am.from_location),
      to_location: replaceBekasiToDepokClient(am.to_location),
    })),
    maintenanceRecords: state.maintenanceRecords.map((mr) => ({
      ...mr,
      technician: replaceBekasiToDepokClient(mr.technician),
    })),
    documents: state.documents.map((d) => ({
      ...d,
      title: replaceBekasiToDepokClient(d.title),
      details: replaceBekasiToDepokClient(d.details),
    })),
    warehouseOrders: (state.warehouseOrders || []).map((o) => {
      const wh = resolveWh(o.warehouse_id || o.warehouse_name);
      return {
        ...o,
        warehouse_id: o.warehouse_id || wh.id,
        warehouse_name: replaceBekasiToDepokClient(o.warehouse_name || wh.name),
      };
    }),
    stockOpnames: (state.stockOpnames || []).map((op) => {
      const wh = resolveWh(op.warehouse_id || op.warehouse_name);
      return {
        ...op,
        warehouse_id: op.warehouse_id || wh.id,
        warehouse_name: replaceBekasiToDepokClient(op.warehouse_name || wh.name),
      };
    }),
    deliveryNotes: (state.deliveryNotes || []).map((dn) => {
      const wh = resolveWh(dn.source_warehouse_id || dn.source_warehouse_name);
      return {
        ...dn,
        source_warehouse_id: dn.source_warehouse_id || wh.id,
        source_warehouse_name: replaceBekasiToDepokClient(dn.source_warehouse_name || wh.name),
        destination_location: replaceBekasiToDepokClient(dn.destination_location),
      };
    }),
  };
}

function mergeClientDemoWithProduction(raw: Partial<PMSState>): PMSState {
  const base = INITIAL_PMS_DATA;
  const keepProd = <T extends { id: string; is_demo?: boolean }>(
    list: T[] | undefined,
    demoIds: Set<string>
  ): T[] => {
    if (!Array.isArray(list)) return [];
    return list.filter((item) => !item.is_demo && !demoIds.has(item.id));
  };

  const keepEmployees = Array.isArray(raw.employees) ? raw.employees : base.employees;
  const empIds = new Set(keepEmployees.map((e) => e.id));
  const employees = [...keepEmployees, ...base.employees.filter((e) => !empIds.has(e.id))];

  const keepAccounts = Array.isArray(raw.accounts) ? raw.accounts : base.accounts;
  const accIds = new Set(keepAccounts.map((a) => a.id));
  const accounts = [...keepAccounts, ...base.accounts.filter((a) => !accIds.has(a.id))];

  return normalizeWarehousesAndMaterialsClient({
    ...base,
    demo_seed_version: DEMO_SEED_VERSION,
    divisions: Array.isArray(raw.divisions) && raw.divisions.length > 0 ? raw.divisions : base.divisions,
    roles: Array.isArray(raw.roles) && raw.roles.length > 0 ? raw.roles : base.roles,
    employees,
    accounts,
    projects: [...keepProd(raw.projects, LEGACY_DEMO_SETS.projects), ...base.projects],
    contracts: [...keepProd(raw.contracts, LEGACY_DEMO_SETS.contracts), ...base.contracts],
    contractTerms: [...keepProd(raw.contractTerms, LEGACY_DEMO_SETS.contractTerms), ...base.contractTerms],
    termClaims: [...keepProd(raw.termClaims, LEGACY_DEMO_SETS.termClaims), ...base.termClaims],
    termPayments: [...keepProd(raw.termPayments, LEGACY_DEMO_SETS.termPayments), ...base.termPayments],
    contractAddendums: [
      ...keepProd(raw.contractAddendums, LEGACY_DEMO_SETS.contractAddendums),
      ...base.contractAddendums,
    ],
    budgets: [...keepProd(raw.budgets, LEGACY_DEMO_SETS.budgets), ...base.budgets],
    projectMaterials: [...keepProd(raw.projectMaterials, LEGACY_DEMO_SETS.projectMaterials), ...base.projectMaterials],
    workItems: [...keepProd(raw.workItems, LEGACY_DEMO_SETS.workItems), ...base.workItems],
    materials: [...keepProd(raw.materials, LEGACY_DEMO_SETS.materials), ...base.materials],
    materialRequests: [...keepProd(raw.materialRequests, LEGACY_DEMO_SETS.materialRequests), ...base.materialRequests],
    materialTransactions: [...keepProd(raw.materialTransactions, LEGACY_DEMO_SETS.materialTransactions), ...base.materialTransactions],
    companyAssets: [...keepProd(raw.companyAssets, LEGACY_DEMO_SETS.companyAssets), ...base.companyAssets],
    assetMovements: [...keepProd(raw.assetMovements, LEGACY_DEMO_SETS.assetMovements), ...base.assetMovements],
    maintenanceRecords: [...keepProd(raw.maintenanceRecords, LEGACY_DEMO_SETS.maintenanceRecords), ...base.maintenanceRecords],
    financialTransactions: [...keepProd(raw.financialTransactions, LEGACY_DEMO_SETS.financialTransactions), ...base.financialTransactions],
    documents: [...keepProd(raw.documents, LEGACY_DEMO_SETS.documents), ...base.documents],
    approvals: [...keepProd(raw.approvals, LEGACY_DEMO_SETS.approvals), ...base.approvals],
    notifications: [...keepProd(raw.notifications, LEGACY_DEMO_SETS.notifications), ...base.notifications],
    activityLogs: [...keepProd(raw.activityLogs, LEGACY_DEMO_SETS.activityLogs), ...base.activityLogs],
    offlineDrafts: Array.isArray(raw.offlineDrafts) ? raw.offlineDrafts : [],
    workflows: [...keepProd(raw.workflows, LEGACY_DEMO_SETS.workflows), ...base.workflows],
    warehouses:
      Array.isArray(raw.warehouses) && raw.warehouses.length > 0
        ? raw.warehouses
        : base.warehouses || [],
    warehouseOrders: Array.isArray(raw.warehouseOrders) ? raw.warehouseOrders : [],
    stockOpnames: Array.isArray(raw.stockOpnames) ? raw.stockOpnames : [],
    warehouseAuditLogs: Array.isArray(raw.warehouseAuditLogs) ? raw.warehouseAuditLogs : [],
    deliveryNotes: Array.isArray(raw.deliveryNotes) ? raw.deliveryNotes : [],
    projectAssets: [
      ...keepProd(raw.projectAssets, LEGACY_DEMO_SETS.projectAssets),
      ...(base.projectAssets || []),
    ],
    projectAssetReports: [
      ...keepProd(raw.projectAssetReports, LEGACY_DEMO_SETS.projectAssetReports),
      ...(base.projectAssetReports || []),
    ],
    projectAssetHistories: [
      ...keepProd(raw.projectAssetHistories, LEGACY_DEMO_SETS.projectAssetHistories),
      ...(base.projectAssetHistories || []),
    ],
    financeBills: [
      ...keepProd(raw.financeBills, LEGACY_DEMO_SETS.financeBills),
      ...(base.financeBills || []),
    ],
    teknikEvaluations: [
      ...keepProd(raw.teknikEvaluations, LEGACY_DEMO_SETS.teknikEvaluations),
      ...(base.teknikEvaluations || []),
    ],
    teknikConstraints: [
      ...keepProd(raw.teknikConstraints, LEGACY_DEMO_SETS.teknikConstraints),
      ...(base.teknikConstraints || []),
    ],
    teknikChanges: [
      ...keepProd(raw.teknikChanges, LEGACY_DEMO_SETS.teknikChanges),
      ...(base.teknikChanges || []),
    ],
    teknikCompletions: [
      ...keepProd(raw.teknikCompletions, LEGACY_DEMO_SETS.teknikCompletions),
      ...(base.teknikCompletions || []),
    ],
    teknikProgressAssessments: [
      ...keepProd(raw.teknikProgressAssessments, LEGACY_DEMO_SETS.teknikProgressAssessments),
      ...(base.teknikProgressAssessments || []),
    ],
  });
}

function normalizePmsState(raw: Partial<PMSState> | null | undefined): PMSState {
  const base = INITIAL_PMS_DATA;
  if (!raw || typeof raw !== 'object') return normalizeWarehousesAndMaterialsClient(base);
  if (raw.demo_seed_version !== DEMO_SEED_VERSION) {
    return mergeClientDemoWithProduction(raw);
  }
  const arrOrBase = <K extends keyof PMSState>(
    key: K,
    requireNonEmpty = false
  ): PMSState[K] => {
    const val = raw[key];
    if (Array.isArray(val) && (!requireNonEmpty || val.length > 0)) {
      return val as PMSState[K];
    }
    return base[key];
  };

  const projects = arrOrBase('projects') as PMSState['projects'];
  const rawWorkflows = arrOrBase('workflows') as ProjectWorkflow[];
  const workflows: ProjectWorkflow[] = [...rawWorkflows];
  for (const prj of projects) {
    if (!prj || typeof prj !== 'object') continue;
    if (!workflows.some((w) => w.project_id === prj.id)) {
      const seedWf = base.workflows.find((w) => w.project_id === prj.id);
      if (seedWf) {
        workflows.push(seedWf);
      } else {
        workflows.push({
          id: `wf-${prj.id}`,
          project_id: prj.id,
          stage: prj.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
          submitter_id: prj.pic_employee_id || 'emp-02',
          submitter_name: 'Tim Teknik',
          submitter_division_id: 'div-teknik',
          approved_budget_limit: 0,
          work_cost_estimate: 0,
          schedule_start: prj.start_date,
          schedule_end: prj.target_end_date,
          material_needs: [],
          procurements: [],
          field_reports: [],
          history: [],
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
  return normalizeWarehousesAndMaterialsClient({
    ...base,
    ...raw,
    demo_seed_version: DEMO_SEED_VERSION,
    divisions: arrOrBase('divisions', true),
    roles: arrOrBase('roles', true),
    employees: arrOrBase('employees', true),
    accounts: arrOrBase('accounts', true),
    projects,
    contracts: arrOrBase('contracts'),
    contractTerms: arrOrBase('contractTerms'),
    termClaims: arrOrBase('termClaims'),
    termPayments: arrOrBase('termPayments'),
    contractAddendums: arrOrBase('contractAddendums'),
    budgets: arrOrBase('budgets'),
    projectMaterials: arrOrBase('projectMaterials'),
    workItems: arrOrBase('workItems'),
    materials: arrOrBase('materials'),
    materialRequests: arrOrBase('materialRequests'),
    materialTransactions: arrOrBase('materialTransactions'),
    companyAssets: arrOrBase('companyAssets'),
    assetMovements: arrOrBase('assetMovements'),
    maintenanceRecords: arrOrBase('maintenanceRecords'),
    financialTransactions: arrOrBase('financialTransactions'),
    documents: arrOrBase('documents'),
    approvals: arrOrBase('approvals'),
    notifications: arrOrBase('notifications'),
    activityLogs: arrOrBase('activityLogs'),
    offlineDrafts: arrOrBase('offlineDrafts'),
    workflows,
    warehouses:
      Array.isArray(raw.warehouses) && raw.warehouses.length > 0
        ? raw.warehouses
        : base.warehouses || [],
    warehouseOrders: Array.isArray(raw.warehouseOrders) ? raw.warehouseOrders : [],
    stockOpnames: Array.isArray(raw.stockOpnames) ? raw.stockOpnames : [],
    warehouseAuditLogs: Array.isArray(raw.warehouseAuditLogs) ? raw.warehouseAuditLogs : [],
    deliveryNotes: Array.isArray(raw.deliveryNotes) ? raw.deliveryNotes : [],
    projectAssets: Array.isArray(raw.projectAssets) ? raw.projectAssets : base.projectAssets || [],
    projectAssetReports: Array.isArray(raw.projectAssetReports)
      ? raw.projectAssetReports
      : base.projectAssetReports || [],
    projectAssetHistories: Array.isArray(raw.projectAssetHistories)
      ? raw.projectAssetHistories
      : base.projectAssetHistories || [],
    financeBills: Array.isArray(raw.financeBills)
      ? raw.financeBills
      : base.financeBills || [],
    teknikEvaluations: Array.isArray(raw.teknikEvaluations)
      ? raw.teknikEvaluations
      : base.teknikEvaluations || [],
    teknikConstraints: Array.isArray(raw.teknikConstraints)
      ? raw.teknikConstraints
      : base.teknikConstraints || [],
    teknikChanges: Array.isArray(raw.teknikChanges)
      ? raw.teknikChanges
      : base.teknikChanges || [],
    teknikCompletions: Array.isArray(raw.teknikCompletions)
      ? raw.teknikCompletions
      : base.teknikCompletions || [],
    teknikProgressAssessments: Array.isArray(raw.teknikProgressAssessments)
      ? raw.teknikProgressAssessments
      : base.teknikProgressAssessments || [],
  });
}

// Simulated server-side credential verification hash check (never stored on Employee/Account objects)
const VALID_DEMO_PASSCODE = 'pms2026';

export interface LoginResult {
  ok: boolean;
  message: string;
  accountStatus?: AccountStatus;
}

interface PMSContextValue {
  state: PMSState;
  currentUser: Employee | null;
  currentRole: Role | null;
  currentDivision: Division | null;
  activeModule: ModuleKey;
  setActiveModule: (mod: ModuleKey) => void;
  projectSubmenu: ProjectSubmenuKey;
  setProjectSubmenu: (sub: ProjectSubmenuKey) => void;
  contractSubmenu: ContractSubmenuKey;
  setContractSubmenu: (sub: ContractSubmenuKey) => void;
  gudangSubmenu: WarehouseSubmenuKey;
  setGudangSubmenu: (sub: WarehouseSubmenuKey) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedContractId: string | null;
  setSelectedContractId: (id: string | null) => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  selectedDocumentId: string | null;
  setSelectedDocumentId: (id: string | null) => void;
  isOnline: boolean;
  simulateOffline: boolean;
  setSimulateOffline: (val: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Auth
  loginWithNik: (nik: string, password: string) => LoginResult;
  quickLoginByNik: (nik: string) => LoginResult;
  logout: () => void;
  requestPasswordReset: (nik: string, note: string) => { ok: boolean; message: string };

  // Actions
  addProject: (project: Omit<Project, 'id'>) => Project;
  createProjectApi: (
    project: Omit<Project, 'id'>
  ) => Promise<{ ok: boolean; message: string; project?: Project }>;
  updateProject: (project: Project) => void;
  updateProjectApi: (project: Project) => Promise<{ ok: boolean; message: string; project?: Project }>;
  softDeleteProject: (projectId: string, reason: string) => { ok: boolean; message: string };
  restoreProject: (projectId: string) => { ok: boolean; message: string };
  addContract: (contract: Omit<Contract, 'id'>) => void;
  updateContract: (contract: Contract) => void;
  addContractTerm: (term: Omit<ContractTerm, 'id'>) => void;
  updateContractTerm: (term: ContractTerm) => void;
  addBudgetItem: (item: Omit<BudgetItem, 'id'>) => void;
  updateBudgetItem: (item: BudgetItem) => void;
  softDeleteBudgetItem: (budgetId: string, reason: string) => void;
  restoreBudgetItem: (budgetId: string) => void;
  addProjectMaterial: (item: Omit<ProjectMaterialItem, 'id' | 'created_at' | 'updated_at'>) => void;
  updateProjectMaterial: (item: ProjectMaterialItem) => void;
  softDeleteProjectMaterial: (id: string, reason: string) => void;
  restoreProjectMaterial: (id: string) => void;
  addWorkItem: (item: Omit<WorkItem, 'id' | 'updated_at'>) => void;
  updateWorkItem: (item: WorkItem) => void;
  softDeleteWorkItem: (workId: string, reason: string) => void;
  restoreWorkItem: (workId: string) => void;
  addMaterial: (mat: Omit<Material, 'id'>) => void;
  createMaterialRequest: (req: Omit<MaterialRequest, 'id' | 'request_number' | 'history' | 'status'>) => void;
  advanceMaterialRequest: (
    requestId: string,
    nextStatus: MaterialRequestStatus,
    note: string
  ) => void;
  recordMaterialTransaction: (tx: Omit<MaterialTransaction, 'id'>) => void;
  addCompanyAsset: (asset: Omit<CompanyAsset, 'id'>) => void;
  updateCompanyAsset: (asset: CompanyAsset) => void;
  addAssetMovement: (movement: Omit<AssetMovement, 'id'>) => void;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id'>) => void;
  addFinancialTransaction: (tx: Omit<FinancialTransaction, 'id' | 'transaction_no'>) => void;
  decideFinancialTransaction: (txId: string, decision: 'Terverifikasi' | 'Ditolak', note: string) => void;
  createDocument: (doc: Omit<InternalDocument, 'id' | 'doc_number' | 'history'>, submitNow: boolean) => void;
  advanceDocumentStatus: (
    docId: string,
    nextStatus: DocumentStatus,
    note: string,
    electronicSignatureDataUrl?: string
  ) => Promise<{ ok: boolean; message: string; document?: InternalDocument }>;
  softDeleteDocument: (docId: string, reason: string) => Promise<{ ok: boolean; message: string }>;
  restoreDocument: (docId: string) => Promise<{ ok: boolean; message: string }>;
  createDocumentApi: (
    payload: CreateDocumentPayload
  ) => Promise<{ ok: boolean; message: string; document?: InternalDocument }>;
  updateDocumentApi: (
    docId: string,
    payload: UpdateDocumentPayload
  ) => Promise<{ ok: boolean; message: string; document?: InternalDocument }>;
  reviseDocumentApi: (
    docId: string,
    payload: ReviseDocumentPayload
  ) => Promise<{ ok: boolean; message: string; document?: InternalDocument }>;
  registerEmployee: (emp: Omit<Employee, 'id'>) => { ok: boolean; message: string };
  updateEmployeeStatus: (empId: string, status: AccountStatus, roleId?: string, divisionId?: string) => void;
  resetEmployeePassword: (empId: string) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;

  // Offline Drafts & Workflow
  saveOfflineDraft: (draft: Omit<OfflineDraft, 'id' | 'created_at' | 'status'>) => void;
  syncOfflineDrafts: () => void;
  deleteOfflineDraft: (draftId: string) => void;
  resetDemoData: () => void;

  // Integrated Operational Workflow
  workflowBusy: boolean;
  refreshServerState: () => Promise<void>;
  prepareTeknikWorkflow: (payload: PrepareTeknikPayload) => Promise<{ ok: boolean; message: string }>;
  submitWorkflowToFinance: (
    projectId: string,
    note?: string,
    workCostEstimate?: number
  ) => Promise<{ ok: boolean; message: string }>;
  decideWorkflowFinance: (
    projectId: string,
    payload: FinanceDecisionPayload
  ) => Promise<{ ok: boolean; message: string }>;
  processWorkflowLogistics: (
    projectId: string,
    payload: LogisticsProcessPayload
  ) => Promise<{ ok: boolean; message: string }>;
  submitWorkflowFieldReport: (
    projectId: string,
    payload: FieldReportPayload
  ) => Promise<{ ok: boolean; message: string }>;

  // Kontrak & Termin Server API Actions
  createContractApi: (payload: CreateContractPayload) => Promise<{ ok: boolean; message: string; contract?: Contract }>;
  activateContractApi: (
    contractId: string,
    payload?: { document_verified?: boolean; note?: string }
  ) => Promise<{ ok: boolean; message: string }>;
  closeContractApi: (
    contractId: string,
    closeNote?: string
  ) => Promise<{ ok: boolean; message: string }>;
  deleteContractApi: (
    contractId: string,
    reason: string
  ) => Promise<{ ok: boolean; message: string }>;
  saveContractTermsApi: (
    contractId: string,
    payload: SaveContractTermsPayload
  ) => Promise<{ ok: boolean; message: string }>;
  submitTermClaimApi: (
    contractId: string,
    payload: SubmitTermClaimPayload
  ) => Promise<{ ok: boolean; message: string }>;
  decideTermClaimApi: (
    claimId: string,
    payload: DecideTermClaimPayload
  ) => Promise<{ ok: boolean; message: string }>;
  recordTermPaymentApi: (
    claimId: string,
    payload: RecordTermPaymentPayload
  ) => Promise<{ ok: boolean; message: string }>;
  createContractAddendumApi: (
    contractId: string,
    payload: CreateAddendumPayload
  ) => Promise<{ ok: boolean; message: string }>;

  // Gudang & Persediaan Server API Actions
  createWarehouseLocationApi: (
    payload: SaveWarehouseLocationPayload
  ) => Promise<{ ok: boolean; message: string; warehouse?: WarehouseLocation }>;
  updateWarehouseLocationApi: (
    warehouseId: string,
    payload: SaveWarehouseLocationPayload
  ) => Promise<{ ok: boolean; message: string; warehouse?: WarehouseLocation }>;
  createWarehouseMaterialApi: (
    payload: CreateWarehouseMaterialPayload
  ) => Promise<{ ok: boolean; message: string; material?: Material }>;
  updateWarehouseMaterialApi: (
    materialId: string,
    payload: UpdateWarehouseMaterialPayload
  ) => Promise<{ ok: boolean; message: string; material?: Material }>;
  createWarehouseStockOrderApi: (
    payload: CreateStockOrderPayload
  ) => Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }>;
  decideWarehouseOrderFinanceApi: (
    orderId: string,
    payload: DecideStockOrderFinancePayload
  ) => Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }>;
  confirmWarehouseReceiptApi: (
    orderId: string,
    payload: ConfirmStockOrderReceiptPayload
  ) => Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }>;
  issueWarehouseStockApi: (
    payload: IssueWarehouseStockPayload
  ) => Promise<{ ok: boolean; message: string; transaction?: MaterialTransaction }>;
  createWarehouseMaterialRequestApi: (
    payload: CreateWarehouseMaterialRequestPayload
  ) => Promise<{ ok: boolean; message: string; request?: MaterialRequest }>;
  advanceWarehouseMaterialRequestApi: (
    requestId: string,
    payload: AdvanceWarehouseMaterialRequestPayload
  ) => Promise<{ ok: boolean; message: string; request?: MaterialRequest }>;
  createStockOpnameApi: (
    payload: CreateStockOpnamePayload
  ) => Promise<{ ok: boolean; message: string; opname?: StockOpnameRecord }>;
  createDeliveryNoteApi: (
    payload: SaveDeliveryNotePayload
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  updateDeliveryNoteApi: (
    id: string,
    payload: SaveDeliveryNotePayload
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  prepareDeliveryNoteApi: (
    id: string,
    note?: string
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  dispatchDeliveryNoteApi: (
    id: string,
    payload: DispatchDeliveryNotePayload
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  markDeliveryNoteArrivedApi: (
    id: string,
    note?: string
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  confirmReceiveDeliveryNoteApi: (
    id: string,
    payload: ConfirmReceiveDeliveryNotePayload
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  cancelDeliveryNoteApi: (
    id: string,
    reason: string
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  reviseDeliveryNoteApi: (
    id: string,
    reason: string
  ) => Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }>;
  deleteDeliveryNoteApi: (
    id: string,
    reason: string
  ) => Promise<{ ok: boolean; message: string; deletedDeliveryNote?: DeliveryNote }>;

  // Aset Proyek Server API Actions
  createProjectAssetApi: (
    payload: CreateProjectAssetPayload
  ) => Promise<{ ok: boolean; message: string; asset?: ProjectAsset }>;
  updateProjectAssetApi: (
    id: string,
    payload: UpdateProjectAssetPayload
  ) => Promise<{ ok: boolean; message: string; asset?: ProjectAsset }>;
  createProjectAssetReportApi: (
    payload: CreateProjectAssetReportPayload
  ) => Promise<{ ok: boolean; message: string; report?: ProjectAssetReport }>;
  resubmitProjectAssetReportApi: (
    id: string,
    payload: ResubmitProjectAssetReportPayload
  ) => Promise<{ ok: boolean; message: string; report?: ProjectAssetReport }>;
  reviewProjectAssetReportApi: (
    id: string,
    payload: ReviewProjectAssetReportPayload
  ) => Promise<{ ok: boolean; message: string; report?: ProjectAssetReport; asset?: ProjectAsset }>;
  deleteProjectAssetApi: (id: string) => Promise<{ ok: boolean; message: string }>;

  // Finance Module Server API Actions
  createFinanceTransactionApi: (
    payload: CreateFinanceTransactionPayload
  ) => Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }>;
  updateFinanceTransactionApi: (
    id: string,
    payload: UpdateFinanceTransactionPayload
  ) => Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }>;
  decideFinanceTransactionApi: (
    id: string,
    decision: 'Terverifikasi' | 'Ditolak',
    note?: string
  ) => Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }>;
  deleteFinanceTransactionApi: (id: string) => Promise<{ ok: boolean; message: string }>;
  importFinanceTransactionsApi: (
    rows: ImportFinanceTransactionRowPayload[]
  ) => Promise<{ ok: boolean; message: string; importedCount?: number }>;
  createFinanceBillApi: (
    payload: CreateFinanceBillPayload
  ) => Promise<{ ok: boolean; message: string; bill?: FinanceBill }>;
  updateFinanceBillApi: (
    id: string,
    payload: UpdateFinanceBillPayload
  ) => Promise<{ ok: boolean; message: string; bill?: FinanceBill }>;
  payFinanceBillApi: (
    id: string,
    payload: PayFinanceBillPayload
  ) => Promise<{ ok: boolean; message: string; bill?: FinanceBill; transaction?: FinancialTransaction }>;
  deleteFinanceBillApi: (id: string) => Promise<{ ok: boolean; message: string }>;

  // Dashboard Teknik Reports & Progress Index Server API Actions
  saveTeknikEvaluationApi: (
    payload: SaveTeknikEvaluationPayload
  ) => Promise<{ ok: boolean; message: string; evaluation?: TeknikEvaluationReport }>;
  saveTeknikConstraintApi: (
    payload: SaveTeknikConstraintPayload
  ) => Promise<{ ok: boolean; message: string; constraint?: TeknikConstraintRecord }>;
  saveTeknikChangeApi: (
    payload: SaveTeknikChangePayload
  ) => Promise<{ ok: boolean; message: string; change?: TeknikChangeReport }>;
  decideTeknikChangeApi: (
    id: string,
    decision: Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>,
    reviewNote: string
  ) => Promise<{ ok: boolean; message: string; change?: TeknikChangeReport }>;
  saveTeknikCompletionApi: (
    payload: SaveTeknikCompletionPayload
  ) => Promise<{ ok: boolean; message: string; completion?: TeknikCompletionReport }>;
  verifyTeknikCompletionApi: (
    id: string,
    followUpAction?: string
  ) => Promise<{ ok: boolean; message: string; completion?: TeknikCompletionReport }>;
  saveTeknikProgressAssessmentApi: (
    payload: SaveTeknikProgressAssessmentPayload
  ) => Promise<{ ok: boolean; message: string; assessment?: TeknikProgressAssessment }>;
}

const PMSContext = createContext<PMSContextValue | null>(null);

export const PMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PMSState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return normalizePmsState(JSON.parse(saved) as Partial<PMSState>);
      }
    } catch {
      // ignore storage errors
    }
    return normalizePmsState(INITIAL_PMS_DATA);
  });
  const stateRef = useRef<PMSState>(state);
  stateRef.current = state;
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const [sessionNik, setSessionNik] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_SESSION_KEY);
    } catch {
      return null;
    }
  });

  const [activeModule, _setActiveModule] = useState<ModuleKey>(
    () => parseModuleFromLocation() ?? 'dashboard'
  );
  const [projectSubmenu, setProjectSubmenu] = useState<ProjectSubmenuKey>('daftar');
  const [contractSubmenu, _setContractSubmenu] = useState<ContractSubmenuKey>('daftar');
  const [gudangSubmenu, setGudangSubmenu] = useState<WarehouseSubmenuKey>('dashboard');
  const setActiveModule = (mod: ModuleKey) => {
    if (mod === 'proyek' && activeModule !== 'proyek') {
      setProjectSubmenu('daftar');
    }
    if (mod === 'kontrak' && activeModule !== 'kontrak') {
      _setContractSubmenu('daftar');
    }
    if (mod === 'gudang' && activeModule !== 'gudang') {
      setGudangSubmenu('dashboard');
    }
    _setActiveModule(mod);
    if (typeof window !== 'undefined') {
      try {
        const targetPath = mod === 'dashboard' ? '/' : `/${mod}`;
        if (window.location.pathname !== targetPath || window.location.search || window.location.hash) {
          window.history.replaceState(null, '', targetPath);
        }
      } catch {
        // ignore history errors
      }
    }
  };

  useEffect(() => {
    const syncFromUrl = () => {
      const fromUrl = parseModuleFromLocation();
      if (fromUrl) {
        _setActiveModule(fromUrl);
      }
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOffline] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isOnline = browserOnline && !simulateOffline;

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  useEffect(() => {
    try {
      if (sessionNik) {
        localStorage.setItem(AUTH_SESSION_KEY, sessionNik);
      } else {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, [sessionNik]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const currentUser = useMemo(() => {
    if (!sessionNik) return null;
    return state.employees.find((e) => e.nik.toLowerCase() === sessionNik.toLowerCase()) ?? null;
  }, [sessionNik, state.employees]);

  const currentRole = useMemo(() => {
    if (!currentUser) return null;
    return state.roles.find((r) => r.id === currentUser.role_id) ?? null;
  }, [currentUser, state.roles]);

  const currentDivision = useMemo(() => {
    if (!currentUser) return null;
    return state.divisions.find((d) => d.id === currentUser.division_id) ?? null;
  }, [currentUser, state.divisions]);

  const setContractSubmenu = (sub: ContractSubmenuKey) => {
    if (
      sub === 'pembuatan' &&
      (!currentRole || !currentDivision || !canCreateContract(currentRole.code, currentDivision.code))
    ) {
      showToast('Anda tidak memiliki hak akses untuk membuat kontrak');
      _setContractSubmenu('daftar');
      return;
    }
    _setContractSubmenu(sub);
  };

  useEffect(() => {
    if (
      contractSubmenu === 'pembuatan' &&
      currentRole &&
      currentDivision &&
      !canCreateContract(currentRole.code, currentDivision.code)
    ) {
      _setContractSubmenu('daftar');
    }
  }, [contractSubmenu, currentRole, currentDivision]);

  const actorHeaders = useMemo<ActorHeaders | null>(() => {
    if (!currentUser || !currentRole || !currentDivision) return null;
    return {
      employeeId: currentUser.id,
      nik: currentUser.nik,
      roleCode: currentRole.code,
      divisionCode: currentDivision.code,
      divisionId: currentDivision.id,
      fullName: currentUser.full_name,
    };
  }, [currentUser, currentRole, currentDivision]);

  const refreshServerState = async () => {
    if (!actorHeaders || !isOnline) return;
    try {
      const serverState = await workflowApi.getState(actorHeaders);
      setState(normalizePmsState(serverState));
    } catch {
      // fallback silently to local state if offline or transient error
    }
  };

  useEffect(() => {
    if (!actorHeaders || !isOnline) return;
    let active = true;
    workflowApi
      .getState(actorHeaders)
      .then((serverState) => {
        if (active) setState(normalizePmsState(serverState));
      })
      .catch(() => {
        // ignore if server unreachable
      });
    return () => {
      active = false;
    };
  }, [actorHeaders?.employeeId, isOnline]);

  const commitState = (updater: (prev: PMSState) => PMSState) => {
    const next = normalizePmsState(updater(stateRef.current));
    stateRef.current = next;
    setState(next);
    if (actorHeaders && isOnline) {
      void workflowApi.syncCore(actorHeaders, next).catch((err) => {
        console.warn('[PMS] syncCore gagal:', err instanceof Error ? err.message : err);
      });
    }
  };

  const appendLog = (
    prev: PMSState,
    activity_type: string,
    description: string,
    projectId?: string
  ): ActivityLog => {
    const actor = currentUser ?? prev.employees[0];
    const div = prev.divisions.find((d) => d.id === actor.division_id);
    const prj = projectId ? prev.projects.find((p) => p.id === projectId) : undefined;
    return {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      employee_id: actor.id,
      employee_name: actor.full_name,
      division_name: div?.name ?? 'Umum',
      project_id: prj?.id,
      project_name: prj?.name,
      activity_type,
      description,
    };
  };

  const createNotification = (
    notif: Omit<AppNotification, 'id' | 'created_at' | 'read'>
  ): AppNotification => ({
    ...notif,
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    read: false,
  });

  const loginWithNik = (nik: string, password: string): LoginResult => {
    const cleanNik = nik.trim().toUpperCase();
    const emp = state.employees.find((e) => e.nik.toUpperCase() === cleanNik);
    if (!emp) {
      return { ok: false, message: 'NIK karyawan tidak ditemukan dalam sistem.' };
    }
    const account = state.accounts.find((a) => a.employee_id === emp.id);
    const status = account?.status ?? emp.status;
    if (status !== 'Aktif') {
      return {
        ok: false,
        accountStatus: status,
        message: `Akun berstatus ${status}. Hubungi Super Admin untuk aktivasi kembali.`,
      };
    }
    if (password.trim().length < 4 || (password !== VALID_DEMO_PASSCODE && password !== '123456')) {
      return {
        ok: false,
        accountStatus: status,
        message: 'Kata sandi tidak sesuai. Periksa kembali kata sandi atau gunakan pilihan akun divisi.',
      };
    }

    setSessionNik(emp.nik);
    const requestedUrlModule = parseModuleFromLocation();
    if (!requestedUrlModule) {
      setActiveModule('dashboard');
    }
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.employee_id === emp.id ? { ...a, last_login_at: new Date().toISOString() } : a
      ),
    }));
    return { ok: true, message: 'Login berhasil.', accountStatus: status };
  };

  const quickLoginByNik = (nik: string): LoginResult => {
    const emp = state.employees.find((e) => e.nik.toUpperCase() === nik.toUpperCase());
    if (!emp) return { ok: false, message: 'NIK tidak ditemukan.' };
    if (emp.status !== 'Aktif') {
      return {
        ok: false,
        accountStatus: emp.status,
        message: `Akun ${emp.nik} berstatus ${emp.status} dan tidak diizinkan masuk.`,
      };
    }
    setSessionNik(emp.nik);
    const requestedUrlModule = parseModuleFromLocation();
    if (!requestedUrlModule) {
      setActiveModule('dashboard');
    }
    return { ok: true, message: `Masuk sebagai ${emp.full_name}`, accountStatus: emp.status };
  };

  const logout = () => {
    setSessionNik(null);
    setSelectedProjectId(null);
    setSelectedContractId(null);
    setSelectedAssetId(null);
    setSelectedDocumentId(null);
    setProjectSubmenu('daftar');
    setContractSubmenu('daftar');
    setActiveModule('dashboard');
  };

  const requestPasswordReset = (nik: string, note: string) => {
    const cleanNik = nik.trim().toUpperCase();
    const emp = state.employees.find((e) => e.nik.toUpperCase() === cleanNik);
    if (!emp) {
      return { ok: false, message: 'NIK karyawan tidak terdaftar di perusahaan.' };
    }
    setState((prev) => ({
      ...prev,
      notifications: [
        createNotification({
          type: 'Persetujuan',
          title: `Permintaan Reset Password (${emp.nik})`,
          message: `${emp.full_name} mengajukan reset kata sandi. Catatan: ${note || 'Lupa kata sandi'}.`,
          target_role: 'SUPER_ADMIN',
          link_module: 'karyawan',
        }),
        ...prev.notifications,
      ],
      activityLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          employee_id: emp.id,
          employee_name: emp.full_name,
          division_name: prev.divisions.find((d) => d.id === emp.division_id)?.name ?? '-',
          activity_type: 'Keamanan Akun',
          description: `Mengajukan permintaan reset password untuk NIK ${emp.nik}.`,
        },
        ...prev.activityLogs,
      ],
    }));
    return {
      ok: true,
      message: `Permintaan reset password untuk ${emp.full_name} (${emp.nik}) telah dikirim ke Super Admin.`,
    };
  };

  const addProject = (project: Omit<Project, 'id'>): Project => {
    const newId = `prj-${Date.now()}`;
    const createdProject: Project = {
      work_type: 'Pembangunan',
      ...project,
      id: newId,
    };
    const newWf: ProjectWorkflow = {
      id: `wf-${newId}`,
      project_id: newId,
      stage: project.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
      submitter_id: currentUser?.id ?? project.pic_employee_id,
      submitter_name: currentUser?.full_name ?? 'Tim Teknik',
      submitter_division_id: currentUser?.division_id ?? 'div-teknik',
      approved_budget_limit: 0,
      work_cost_estimate: 0,
      schedule_start: project.start_date,
      schedule_end: project.target_end_date,
      material_needs: [],
      procurements: [],
      field_reports: [],
      history: [
        {
          id: `wh-${Date.now()}`,
          timestamp: new Date().toISOString(),
          from_stage: null,
          to_stage: project.status === 'Selesai' ? 'SELESAI' : 'DRAFT_TEKNIK',
          action: 'Proyek Dibuat',
          actor_id: currentUser?.id ?? 'emp-02',
          actor_name: currentUser?.full_name ?? 'Tim Teknik',
          actor_role: currentRole?.code ?? 'HEAD',
          actor_division: currentDivision?.code ?? 'TEKNIK',
          note: `Proyek ${project.project_number} (${createdProject.work_type ?? 'Pembangunan'}) didaftarkan dalam sistem.`,
        },
      ],
      updated_at: new Date().toISOString(),
    };
    commitState((prev) => ({
      ...prev,
      projects: [createdProject, ...prev.projects],
      workflows: [newWf, ...prev.workflows],
      activityLogs: [
        appendLog(prev, 'Proyek Baru', `Menambahkan proyek ${project.project_number} — ${project.name}`, newId),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Proyek ${project.project_number} berhasil ditambahkan.`);
    return createdProject;
  };

  const createProjectApi = async (
    project: Omit<Project, 'id'>
  ): Promise<{ ok: boolean; message: string; project?: Project }> => {
    if (!actorHeaders) {
      const msg = 'Sesi pengguna tidak valid. Silakan login kembali.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) {
      const msg = 'Koneksi internet diperlukan untuk menyimpan proyek baru ke database server.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.createProject(actorHeaders, project);
      const nextState = normalizePmsState(res.state);
      stateRef.current = nextState;
      setState(nextState);
      showToast(`Proyek ${res.project.project_number} berhasil disimpan ke database.`);
      return {
        ok: true,
        project: res.project,
        message: `Proyek ${res.project.project_number} berhasil disimpan.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan proyek baru ke server.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateProject = (project: Project) => {
    commitState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === project.id ? project : p)),
      activityLogs: [
        appendLog(prev, 'Pembaruan Proyek', `Memperbarui data proyek ${project.project_number}`, project.id),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Data proyek ${project.project_number} diperbarui.`);
  };

  const updateProjectApi = async (
    project: Project
  ): Promise<{ ok: boolean; message: string; project?: Project }> => {
    if (!actorHeaders) {
      const msg = 'Sesi pengguna tidak valid.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) {
      const msg = 'Koneksi internet diperlukan untuk memperbarui data proyek di server.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.updateProject(actorHeaders, project.id, project);
      const nextState = normalizePmsState(res.state);
      stateRef.current = nextState;
      setState(nextState);
      showToast(`Data proyek ${res.project.project_number} berhasil diperbarui.`);
      return {
        ok: true,
        project: res.project,
        message: 'Data proyek berhasil diperbarui.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui data proyek.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const softDeleteProject = (
    projectId: string,
    reason: string
  ): { ok: boolean; message: string } => {
    if (!currentUser || !currentRole) {
      return { ok: false, message: 'Sesi pengguna tidak valid.' };
    }
    if (currentRole.code !== 'SUPER_ADMIN' && !(currentRole.code === 'HEAD' && currentDivision?.code === 'TEKNIK')) {
      return { ok: false, message: 'Hanya Super Admin atau Head Teknik yang berwenang mengarsipkan proyek.' };
    }
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) {
      return { ok: false, message: 'Data proyek tidak ditemukan.' };
    }
    const now = new Date().toISOString();
    const cleanReason = reason.trim() || 'Diarsipkan oleh admin proyek';

    commitState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              is_deleted: true,
              deleted_at: now,
              deleted_by_id: currentUser.id,
              deleted_by_name: currentUser.full_name,
              delete_reason: cleanReason,
            }
          : p
      ),
      activityLogs: [
        appendLog(
          prev,
          'Arsip / Hapus Proyek',
          `Mengarsipkan proyek "${target.project_number} — ${target.name}" oleh ${currentUser.full_name}. Alasan: ${cleanReason}. Data transaksi, keuangan, stok, dan persetujuan tetap dipertahankan.`,
          projectId
        ),
        ...prev.activityLogs,
      ],
    }));

    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
    showToast(`Proyek ${target.project_number} diarsipkan dengan aman.`);
    return { ok: true, message: 'Proyek berhasil diarsipkan.' };
  };

  const restoreProject = (projectId: string): { ok: boolean; message: string } => {
    if (!currentUser || !currentRole || (currentRole.code !== 'SUPER_ADMIN' && currentRole.code !== 'HEAD')) {
      return { ok: false, message: 'Hanya admin berwenang yang dapat memulihkan proyek.' };
    }
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return { ok: false, message: 'Data proyek tidak ditemukan.' };

    commitState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              is_deleted: false,
              deleted_at: undefined,
              deleted_by_id: undefined,
              deleted_by_name: undefined,
              delete_reason: undefined,
            }
          : p
      ),
      activityLogs: [
        appendLog(
          prev,
          'Pemulihan Proyek',
          `Memulihkan proyek "${target.project_number} — ${target.name}" dari arsip oleh ${currentUser.full_name}.`,
          projectId
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Proyek ${target.project_number} berhasil dipulihkan.`);
    return { ok: true, message: 'Proyek dipulihkan.' };
  };

  const addContract = (contract: Omit<Contract, 'id'>) => {
    if (
      !currentRole ||
      !currentDivision ||
      !canCreateContract(currentRole.code, currentDivision.code)
    ) {
      showToast('Anda tidak memiliki hak akses untuk membuat kontrak');
      return;
    }
    const newId = `ctr-${Date.now()}`;
    commitState((prev) => ({
      ...prev,
      contracts: [{ ...contract, id: newId }, ...prev.contracts],
      activityLogs: [
        appendLog(prev, 'Kontrak Baru', `Mencatat kontrak ${contract.contract_number}`, contract.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Kontrak ${contract.contract_number} disimpan.`);
  };

  const updateContract = (contract: Contract) => {
    commitState((prev) => ({
      ...prev,
      contracts: prev.contracts.map((c) => (c.id === contract.id ? contract : c)),
      activityLogs: [
        appendLog(prev, 'Pembaruan Kontrak', `Memperbarui kontrak ${contract.contract_number}`, contract.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Kontrak ${contract.contract_number} diperbarui.`);
  };

  const addContractTerm = (term: Omit<ContractTerm, 'id'>) => {
    commitState((prev) => {
      const ctr = prev.contracts.find((c) => c.id === term.contract_id);
      return {
        ...prev,
        contractTerms: [...prev.contractTerms, { ...term, id: `trm-${Date.now()}` }],
        activityLogs: [
          appendLog(prev, 'Termin Kontrak', `Menambahkan ${term.term_number} (${term.period_month})`, ctr?.project_id),
          ...prev.activityLogs,
        ],
      };
    });
    showToast(`${term.term_number} berhasil ditambahkan.`);
  };

  const updateContractTerm = (term: ContractTerm) => {
    commitState((prev) => {
      const ctr = prev.contracts.find((c) => c.id === term.contract_id);
      return {
        ...prev,
        contractTerms: prev.contractTerms.map((t) => (t.id === term.id ? term : t)),
        activityLogs: [
          appendLog(
            prev,
            'Termin Pembayaran',
            `Memperbarui ${term.term_number} — status bayar: ${term.payment_status}`,
            ctr?.project_id
          ),
          ...prev.activityLogs,
        ],
      };
    });
    showToast(`${term.term_number} diperbarui.`);
  };

  const addBudgetItem = (item: Omit<BudgetItem, 'id'>) => {
    commitState((prev) => ({
      ...prev,
      budgets: [{ ...item, id: `rab-${Date.now()}` }, ...prev.budgets],
      activityLogs: [
        appendLog(prev, 'RAB Proyek', `Menambahkan pos RAB: ${item.work_item_name}`, item.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast('Item RAB berhasil ditambahkan.');
  };

  const updateBudgetItem = (item: BudgetItem) => {
    commitState((prev) => ({
      ...prev,
      budgets: prev.budgets.map((b) => (b.id === item.id ? item : b)),
      activityLogs: [
        appendLog(prev, 'RAB Proyek', `Memperbarui realisasi RAB: ${item.work_item_name}`, item.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast('Data RAB berhasil diperbarui.');
  };

  const softDeleteBudgetItem = (budgetId: string, reason: string) => {
    if (!currentUser) return;
    const target = state.budgets.find((b) => b.id === budgetId);
    if (!target) return;
    const now = new Date().toISOString();
    const cleanReason = reason.trim() || 'Diarsipkan oleh pengguna';
    commitState((prev) => ({
      ...prev,
      budgets: prev.budgets.map((b) =>
        b.id === budgetId
          ? {
              ...b,
              is_deleted: true,
              deleted_at: now,
              deleted_by_id: currentUser.id,
              deleted_by_name: currentUser.full_name,
              delete_reason: cleanReason,
            }
          : b
      ),
      activityLogs: [
        appendLog(
          prev,
          'Arsip / Hapus RAB',
          `Mengarsipkan item RAB "${target.work_item_name}" oleh ${currentUser.full_name}. Alasan: ${cleanReason}`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Item RAB "${target.work_item_name}" diarsipkan dengan aman.`);
  };

  const restoreBudgetItem = (budgetId: string) => {
    if (!currentUser || !currentRole || (currentRole.code !== 'SUPER_ADMIN' && currentRole.code !== 'HEAD')) {
      showToast('Hanya admin berwenang yang dapat memulihkan item RAB.');
      return;
    }
    const target = state.budgets.find((b) => b.id === budgetId);
    if (!target) return;
    commitState((prev) => ({
      ...prev,
      budgets: prev.budgets.map((b) =>
        b.id === budgetId
          ? {
              ...b,
              is_deleted: false,
              deleted_at: undefined,
              deleted_by_id: undefined,
              deleted_by_name: undefined,
              delete_reason: undefined,
            }
          : b
      ),
      activityLogs: [
        appendLog(
          prev,
          'Pemulihan RAB',
          `Memulihkan item RAB "${target.work_item_name}" dari arsip oleh ${currentUser.full_name}.`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Item RAB "${target.work_item_name}" dipulihkan.`);
  };

  const addProjectMaterial = (
    item: Omit<ProjectMaterialItem, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const now = new Date().toISOString();
    const totalPrice = Number(item.volume || 0) * Number(item.unit_price || 0);
    const created: ProjectMaterialItem = {
      ...item,
      total_price: totalPrice,
      id: `pmt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      created_at: now,
      updated_at: now,
    };
    commitState((prev) => ({
      ...prev,
      projectMaterials: [created, ...(prev.projectMaterials ?? [])],
      activityLogs: [
        appendLog(
          prev,
          'Bahan Bangunan Proyek',
          `Menambahkan kebutuhan bahan bangunan: ${item.material_name} (${item.volume} ${item.unit})`,
          item.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Bahan "${item.material_name}" berhasil ditambahkan.`);
  };

  const updateProjectMaterial = (item: ProjectMaterialItem) => {
    const updated: ProjectMaterialItem = {
      ...item,
      total_price: Number(item.volume || 0) * Number(item.unit_price || 0),
      updated_at: new Date().toISOString(),
    };
    commitState((prev) => ({
      ...prev,
      projectMaterials: (prev.projectMaterials ?? []).map((m) =>
        m.id === item.id ? updated : m
      ),
      activityLogs: [
        appendLog(
          prev,
          'Bahan Bangunan Proyek',
          `Memperbarui bahan bangunan: ${item.material_name} (${item.volume} ${item.unit})`,
          item.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Bahan "${item.material_name}" diperbarui.`);
  };

  const softDeleteProjectMaterial = (id: string, reason: string) => {
    if (!currentUser) return;
    const target = (state.projectMaterials ?? []).find((m) => m.id === id);
    if (!target) return;
    const now = new Date().toISOString();
    const cleanReason = reason.trim() || 'Diarsipkan oleh pengguna';
    commitState((prev) => ({
      ...prev,
      projectMaterials: (prev.projectMaterials ?? []).map((m) =>
        m.id === id
          ? {
              ...m,
              is_deleted: true,
              deleted_at: now,
              deleted_by_id: currentUser.id,
              deleted_by_name: currentUser.full_name,
              delete_reason: cleanReason,
            }
          : m
      ),
      activityLogs: [
        appendLog(
          prev,
          'Arsip / Hapus Bahan Bangunan',
          `Mengarsipkan bahan "${target.material_name}" oleh ${currentUser.full_name}. Alasan: ${cleanReason}`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Bahan "${target.material_name}" diarsipkan dengan aman.`);
  };

  const restoreProjectMaterial = (id: string) => {
    if (!currentUser || !currentRole || (currentRole.code !== 'SUPER_ADMIN' && currentRole.code !== 'HEAD')) {
      showToast('Hanya admin berwenang yang dapat memulihkan bahan bangunan.');
      return;
    }
    const target = (state.projectMaterials ?? []).find((m) => m.id === id);
    if (!target) return;
    commitState((prev) => ({
      ...prev,
      projectMaterials: (prev.projectMaterials ?? []).map((m) =>
        m.id === id
          ? {
              ...m,
              is_deleted: false,
              deleted_at: undefined,
              deleted_by_id: undefined,
              deleted_by_name: undefined,
              delete_reason: undefined,
            }
          : m
      ),
      activityLogs: [
        appendLog(
          prev,
          'Pemulihan Bahan Bangunan',
          `Memulihkan bahan "${target.material_name}" dari arsip oleh ${currentUser.full_name}.`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Bahan "${target.material_name}" dipulihkan.`);
  };

  const addWorkItem = (item: Omit<WorkItem, 'id' | 'updated_at'>) => {
    if (!currentRole || !currentDivision || !canAccessTeknikModule(currentRole.code, currentDivision.code)) {
      showToast('Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang dapat mengelola modul Teknik.');
      return;
    }
    commitState((prev) => ({
      ...prev,
      workItems: [{ ...item, id: `wrk-${Date.now()}`, updated_at: new Date().toISOString() }, ...prev.workItems],
      activityLogs: [
        appendLog(prev, 'Pekerjaan Teknik', `Menambahkan pekerjaan: ${item.title}`, item.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast('Pekerjaan teknik berhasil ditambahkan.');
  };

  const updateWorkItem = (item: WorkItem) => {
    if (!currentRole || !currentDivision || !canAccessTeknikModule(currentRole.code, currentDivision.code)) {
      showToast('Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang dapat memperbarui progres Teknik.');
      return;
    }
    const updated = { ...item, updated_at: new Date().toISOString() };
    commitState((prev) => ({
      ...prev,
      workItems: prev.workItems.map((w) => (w.id === item.id ? updated : w)),
      notifications: [
        createNotification({
          type: 'Perubahan Progres',
          title: `Pembaruan Progres: ${item.title}`,
          message: `Progres keseluruhan kini ${item.overall_progress}% (${item.status}).`,
          target_role: 'HEAD',
          target_division_id: 'div-teknik',
          project_id: item.project_id,
          link_module: 'teknik',
        }),
        ...prev.notifications,
      ],
      activityLogs: [
        appendLog(
          prev,
          'Progres Pekerjaan',
          `Memperbarui "${item.title}" menjadi ${item.overall_progress}% (${item.status})`,
          item.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Progres pekerjaan diperbarui (${item.overall_progress}%).`);
  };

  const softDeleteWorkItem = (workId: string, reason: string) => {
    if (!currentUser || !currentRole || !currentDivision || !canAccessTeknikModule(currentRole.code, currentDivision.code)) {
      showToast('Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang dapat mengarsipkan pekerjaan Teknik.');
      return;
    }
    const target = state.workItems.find((w) => w.id === workId);
    if (!target) return;
    const now = new Date().toISOString();
    const cleanReason = reason.trim() || 'Diarsipkan oleh pengguna';
    commitState((prev) => ({
      ...prev,
      workItems: prev.workItems.map((w) =>
        w.id === workId
          ? {
              ...w,
              is_deleted: true,
              deleted_at: now,
              deleted_by_id: currentUser.id,
              deleted_by_name: currentUser.full_name,
              delete_reason: cleanReason,
            }
          : w
      ),
      activityLogs: [
        appendLog(
          prev,
          'Arsip / Hapus Progres Pekerjaan',
          `Mengarsipkan pekerjaan "${target.title}" oleh ${currentUser.full_name}. Alasan: ${cleanReason}`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Pekerjaan "${target.title}" diarsipkan.`);
  };

  const restoreWorkItem = (workId: string) => {
    if (
      !currentUser ||
      !currentRole ||
      !currentDivision ||
      !canAccessTeknikModule(currentRole.code, currentDivision.code) ||
      (currentRole.code !== 'SUPER_ADMIN' && currentRole.code !== 'HEAD')
    ) {
      showToast('Hanya Head Teknik atau Super Admin yang dapat memulihkan progres pekerjaan.');
      return;
    }
    const target = state.workItems.find((w) => w.id === workId);
    if (!target) return;
    commitState((prev) => ({
      ...prev,
      workItems: prev.workItems.map((w) =>
        w.id === workId
          ? {
              ...w,
              is_deleted: false,
              deleted_at: undefined,
              deleted_by_id: undefined,
              deleted_by_name: undefined,
              delete_reason: undefined,
            }
          : w
      ),
      activityLogs: [
        appendLog(
          prev,
          'Pemulihan Progres Pekerjaan',
          `Memulihkan pekerjaan "${target.title}" dari arsip oleh ${currentUser.full_name}.`,
          target.project_id
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Pekerjaan "${target.title}" dipulihkan.`);
  };

  const addMaterial = (mat: Omit<Material, 'id'>) => {
    commitState((prev) => ({
      ...prev,
      materials: [{ ...mat, id: `mat-${Date.now()}` }, ...prev.materials],
      activityLogs: [
        appendLog(prev, 'Master Material', `Menambahkan material ${mat.code} — ${mat.name}`),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Material ${mat.name} ditambahkan ke master data.`);
  };

  const createMaterialRequest = (
    req: Omit<MaterialRequest, 'id' | 'request_number' | 'history' | 'status'>
  ) => {
    const actorName = currentUser?.full_name ?? 'Staff';
    const count = state.materialRequests.length + 15;
    const reqNo = `SPM/2026/11/${String(count).padStart(3, '0')}`;
    const newId = `mr-${Date.now()}`;
    const newReq: MaterialRequest = {
      ...req,
      id: newId,
      request_number: reqNo,
      status: 'Menunggu Head',
      history: [
        {
          timestamp: new Date().toISOString(),
          actor_name: actorName,
          action: 'Membuat Permintaan',
          note: req.notes || 'Permintaan material diajukan.',
        },
      ],
    };

    commitState((prev) => ({
      ...prev,
      materialRequests: [newReq, ...prev.materialRequests],
      approvals: [
        {
          id: `apr-${Date.now()}`,
          entity_type: 'MaterialRequest',
          entity_id: newId,
          reference_no: reqNo,
          title: `Permintaan Material ${reqNo}`,
          division_id: currentUser?.division_id ?? 'div-teknik',
          requester_id: req.requested_by_id,
          status: 'Menunggu',
          requested_at: new Date().toISOString(),
          notes: req.notes,
        },
        ...prev.approvals,
      ],
      notifications: [
        createNotification({
          type: 'Permintaan Baru',
          title: `Permintaan Material Baru ${reqNo}`,
          message: `${actorName} mengajukan permintaan material untuk proyek terkait.`,
          target_role: 'HEAD',
          target_division_id: currentUser?.division_id ?? 'div-teknik',
          project_id: req.project_id,
          link_module: 'persetujuan',
        }),
        ...prev.notifications,
      ],
      activityLogs: [
        appendLog(prev, 'Permintaan Material', `Membuat permintaan material ${reqNo}`, req.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Permintaan material ${reqNo} dikirim ke Head untuk pemeriksaan.`);
  };

  const advanceMaterialRequest = (
    requestId: string,
    nextStatus: MaterialRequestStatus,
    note: string
  ) => {
    const actor = currentUser;
    if (!actor) return;

    commitState((prev) => {
      const target = prev.materialRequests.find((r) => r.id === requestId);
      if (!target) return prev;

      const updatedItems = target.items.map((it) => {
        if (nextStatus === 'Disetujui Head') {
          return { ...it, qty_approved: it.qty_requested };
        }
        if (nextStatus === 'Diserahkan' || nextStatus === 'Dikonfirmasi Penerima') {
          return { ...it, qty_delivered: it.qty_approved || it.qty_requested };
        }
        return it;
      });

      let updatedMaterials = prev.materials;
      const newTxs: MaterialTransaction[] = [];

      if (nextStatus === 'Diserahkan' && !target.stock_deducted) {
        const insufficient = updatedItems.find((item) => {
          const mat = prev.materials.find((m) => m.id === item.material_id);
          const qtyOut = item.qty_approved || item.qty_requested;
          return !mat || qtyOut > mat.stock;
        });
        if (insufficient) return prev;
        updatedMaterials = prev.materials.map((m) => {
          const item = updatedItems.find((i) => i.material_id === m.id);
          if (!item) return m;
          const qtyOut = item.qty_approved || item.qty_requested;
          newTxs.push({
            id: `mtx-${Date.now()}-${m.id}`,
            material_id: m.id,
            project_id: target.project_id,
            request_id: target.id,
            type: 'Keluar',
            qty: qtyOut,
            stock_before: m.stock,
            stock_after: Math.round((m.stock - qtyOut) * 100) / 100,
            date: new Date().toISOString().slice(0, 10),
            pic_name: actor.full_name,
            reference_no: target.request_number,
            notes: `Pengeluaran stok untuk ${target.request_number}`,
          });
          return { ...m, stock: Math.round((m.stock - qtyOut) * 100) / 100 };
        });
      }

      const updatedReq: MaterialRequest = {
        ...target,
        status: nextStatus,
        stock_deducted: target.stock_deducted || nextStatus === 'Diserahkan',
        head_reviewer_id:
          nextStatus === 'Disetujui Head' || nextStatus === 'Ditolak Head'
            ? actor.id
            : target.head_reviewer_id,
        logistics_processor_id:
          nextStatus === 'Diproses Logistik' || nextStatus === 'Diserahkan'
            ? actor.id
            : target.logistics_processor_id,
        recipient_id:
          nextStatus === 'Dikonfirmasi Penerima' ? actor.id : target.recipient_id,
        items: updatedItems,
        history: [
          ...target.history,
          {
            timestamp: new Date().toISOString(),
            actor_name: actor.full_name,
            action: nextStatus,
            note: note || `Status diperbarui ke ${nextStatus}.`,
          },
        ],
      };

      const updatedApprovals = prev.approvals.map((a) => {
        if (a.entity_type === 'MaterialRequest' && a.entity_id === target.id) {
          if (nextStatus === 'Disetujui Head') {
            return {
              ...a,
              status: 'Disetujui' as const,
              approver_id: actor.id,
              decided_at: new Date().toISOString(),
              notes: note || a.notes,
            };
          }
          if (nextStatus === 'Ditolak Head') {
            return {
              ...a,
              status: 'Ditolak' as const,
              approver_id: actor.id,
              decided_at: new Date().toISOString(),
              notes: note || a.notes,
            };
          }
        }
        return a;
      });

      const extraNotifs: AppNotification[] = [];
      if (nextStatus === 'Disetujui Head') {
        extraNotifs.push(
          createNotification({
            type: 'Permintaan Disetujui',
            title: `${target.request_number} Disetujui Head`,
            message: `Siap diproses oleh Divisi Logistik.`,
            target_role: 'ALL',
            target_division_id: 'div-logistik',
            project_id: target.project_id,
            link_module: 'logistik',
          })
        );
      } else if (nextStatus === 'Ditolak Head') {
        extraNotifs.push(
          createNotification({
            type: 'Permintaan Ditolak',
            title: `${target.request_number} Ditolak`,
            message: note || 'Permintaan material ditolak oleh Head.',
            target_role: 'ALL',
            project_id: target.project_id,
            link_module: 'logistik',
          })
        );
      }

      // Check low stock warnings
      updatedMaterials.forEach((m) => {
        if (m.stock <= m.min_stock && newTxs.some((tx) => tx.material_id === m.id)) {
          extraNotifs.push(
            createNotification({
              type: 'Stok Minimum',
              title: `Stok Minimum: ${m.name}`,
              message: `Sisa stok ${m.stock} ${m.unit} (batas minimum ${m.min_stock} ${m.unit}).`,
              target_role: 'ALL',
              target_division_id: 'div-logistik',
              link_module: 'logistik',
            })
          );
        }
      });

      return {
        ...prev,
        materials: updatedMaterials,
        materialRequests: prev.materialRequests.map((r) => (r.id === requestId ? updatedReq : r)),
        materialTransactions: [...newTxs, ...prev.materialTransactions],
        approvals: updatedApprovals,
        notifications: [...extraNotifs, ...prev.notifications],
        activityLogs: [
          appendLog(
            prev,
            'Alur Material',
            `${target.request_number} berubah status menjadi "${nextStatus}"`,
            target.project_id
          ),
          ...prev.activityLogs,
        ],
      };
    });

    showToast(`Status permintaan diperbarui: ${nextStatus}.`);
  };

  const recordMaterialTransaction = (tx: Omit<MaterialTransaction, 'id'>) => {
    commitState((prev) => {
      const updatedMaterials = prev.materials.map((m) => {
        if (m.id !== tx.material_id) return m;
        if (tx.type === 'Masuk') return { ...m, stock: m.stock + tx.qty };
        if (tx.type === 'Keluar') return { ...m, stock: Math.max(0, m.stock - tx.qty) };
        return m;
      });
      return {
        ...prev,
        materials: updatedMaterials,
        materialTransactions: [{ ...tx, id: `mtx-${Date.now()}` }, ...prev.materialTransactions],
        activityLogs: [
          appendLog(
            prev,
            `Material ${tx.type}`,
            `Mencatat transaksi ${tx.type} sejumlah ${tx.qty} (${tx.reference_no})`,
            tx.project_id
          ),
          ...prev.activityLogs,
        ],
      };
    });
    showToast(`Transaksi material ${tx.type} berhasil dicatat.`);
  };

  const addCompanyAsset = (asset: Omit<CompanyAsset, 'id'>) => {
    commitState((prev) => ({
      ...prev,
      companyAssets: [{ ...asset, id: `ast-${Date.now()}` }, ...prev.companyAssets],
      activityLogs: [
        appendLog(prev, 'Aset Proyek', `Mendaftarkan aset ${asset.asset_code} — ${asset.name}`),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Aset ${asset.asset_code} ditambahkan.`);
  };

  const updateCompanyAsset = (asset: CompanyAsset) => {
    commitState((prev) => ({
      ...prev,
      companyAssets: prev.companyAssets.map((a) => (a.id === asset.id ? asset : a)),
      activityLogs: [
        appendLog(prev, 'Pembaruan Aset', `Memperbarui aset ${asset.asset_code} (${asset.status})`),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Aset ${asset.asset_code} diperbarui.`);
  };

  const addAssetMovement = (movement: Omit<AssetMovement, 'id'>) => {
    commitState((prev) => ({
      ...prev,
      assetMovements: [{ ...movement, id: `amv-${Date.now()}` }, ...prev.assetMovements],
      companyAssets: prev.companyAssets.map((a) =>
        a.id === movement.asset_id
          ? { ...a, location: movement.to_location, pic_employee_id: movement.pic_employee_id }
          : a
      ),
      activityLogs: [
        appendLog(
          prev,
          'Perpindahan Aset',
          `Memindahkan aset ke ${movement.to_location}`
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast('Riwayat perpindahan aset dicatat.');
  };

  const addMaintenanceRecord = (record: Omit<MaintenanceRecord, 'id'>) => {
    commitState((prev) => ({
      ...prev,
      maintenanceRecords: [{ ...record, id: `mnt-${Date.now()}` }, ...prev.maintenanceRecords],
      companyAssets: prev.companyAssets.map((a) =>
        a.id === record.asset_id
          ? {
              ...a,
              status: record.status === 'Terjadwal' ? 'Dalam Perawatan' : 'Tersedia',
            }
          : a
      ),
      activityLogs: [
        appendLog(
          prev,
          'Pemeliharaan Aset',
          `Mencatat ${record.type} (${record.status})`
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast('Riwayat pemeliharaan aset disimpan.');
  };

  const addFinancialTransaction = (tx: Omit<FinancialTransaction, 'id' | 'transaction_no'>) => {
    const newId = `fin-${Date.now()}`;
    const txNo = `TRX-FIN-2026-${String(state.financialTransactions.length + 950).padStart(4, '0')}`;
    const newTx: FinancialTransaction = {
      ...tx,
      id: newId,
      transaction_no: txNo,
    };

    commitState((prev) => ({
      ...prev,
      financialTransactions: [newTx, ...prev.financialTransactions],
      approvals:
        tx.status === 'Menunggu'
          ? [
              {
                id: `apr-${Date.now()}`,
                entity_type: 'Finance',
                entity_id: newId,
                reference_no: txNo,
                title: `${tx.category}: ${tx.description}`,
                division_id: 'div-finance',
                requester_id: tx.created_by_id,
                status: 'Menunggu',
                requested_at: new Date().toISOString(),
                notes: tx.description,
              },
              ...prev.approvals,
            ]
          : prev.approvals,
      activityLogs: [
        appendLog(prev, 'Transaksi Keuangan', `Mencatat ${txNo} (${tx.category})`, tx.project_id),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Transaksi ${txNo} berhasil dicatat.`);
  };

  const decideFinancialTransaction = (
    txId: string,
    decision: 'Terverifikasi' | 'Ditolak',
    note: string
  ) => {
    const actor = currentUser;
    if (!actor) return;
    commitState((prev) => {
      const target = prev.financialTransactions.find((f) => f.id === txId);
      if (!target) return prev;
      return {
        ...prev,
        financialTransactions: prev.financialTransactions.map((f) =>
          f.id === txId ? { ...f, status: decision } : f
        ),
        approvals: prev.approvals.map((a) =>
          a.entity_type === 'Finance' && a.entity_id === txId
            ? {
                ...a,
                status: decision === 'Terverifikasi' ? 'Disetujui' : 'Ditolak',
                approver_id: actor.id,
                decided_at: new Date().toISOString(),
                notes: note || a.notes,
              }
            : a
        ),
        activityLogs: [
          appendLog(
            prev,
            'Verifikasi Keuangan',
            `${target.transaction_no} dinyatakan ${decision}`,
            target.project_id
          ),
          ...prev.activityLogs,
        ],
      };
    });
    showToast(`Transaksi keuangan dinyatakan ${decision}.`);
  };

  const createDocumentApi = async (
    payload: CreateDocumentPayload
  ): Promise<{ ok: boolean; message: string; document?: InternalDocument }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menyimpan dokumen resmi ke server.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.create(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const actionMsg =
        payload.submit_mode === 'submit'
          ? `Dokumen ${res.document.doc_number} berhasil dibuat & diajukan.`
          : payload.submit_mode === 'complete'
          ? `Dokumen ${res.document.doc_number} disimpan sebagai Selesai.`
          : `Draft dokumen ${res.document.doc_number} disimpan.`;
      showToast(actionMsg);
      return { ok: true, message: actionMsg, document: res.document };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat dokumen baru.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateDocumentApi = async (
    docId: string,
    payload: UpdateDocumentPayload
  ): Promise<{ ok: boolean; message: string; document?: InternalDocument }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memperbarui dokumen.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.update(actorHeaders, docId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Dokumen ${res.document.doc_number} berhasil diperbarui.`);
      return { ok: true, message: 'Dokumen diperbarui.', document: res.document };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const reviseDocumentApi = async (
    docId: string,
    payload: ReviseDocumentPayload
  ): Promise<{ ok: boolean; message: string; document?: InternalDocument }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mencatat revisi dokumen.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.revise(actorHeaders, docId, payload);
      setState(normalizePmsState(res.state));
      showToast(
        `Revisi v${res.document.revision_no || 2} untuk ${res.document.doc_number} tercatat.`
      );
      return { ok: true, message: 'Revisi dokumen tercatat.', document: res.document };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat revisi dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createDocument = (
    doc: Omit<InternalDocument, 'id' | 'doc_number' | 'history'>,
    submitNow: boolean
  ) => {
    void createDocumentApi({
      doc_type: doc.doc_type,
      doc_date: doc.doc_date,
      project_id: doc.project_id,
      title: doc.title,
      details: doc.details,
      items_summary: doc.items_summary,
      attachment_name: doc.attachment_name,
      recipient_name: doc.recipient_name,
      reference_code: doc.reference_code,
      amount_value: doc.amount_value,
      effective_date: doc.effective_date,
      metadata: doc.metadata,
      submit_mode: submitNow ? 'submit' : 'draft',
    });
  };

  const advanceDocumentStatus = async (
    docId: string,
    nextStatus: DocumentStatus,
    note: string,
    electronicSignatureDataUrl?: string
  ): Promise<{ ok: boolean; message: string; document?: InternalDocument }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      const msg = 'Koneksi internet diperlukan untuk memperbarui status persetujuan dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.advance(actorHeaders, docId, {
        next_status: nextStatus,
        note,
        electronic_signature_data_url: electronicSignatureDataUrl,
      });
      setState(normalizePmsState(res.state));
      const msg = `Dokumen ${res.document.doc_number} diperbarui menjadi "${nextStatus}".`;
      showToast(msg);
      return { ok: true, message: msg, document: res.document };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui status dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const softDeleteDocument = async (
    docId: string,
    reason: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      const msg = 'Koneksi internet diperlukan untuk mengarsipkan dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.archive(actorHeaders, docId, reason);
      setState(normalizePmsState(res.state));
      const msg = `Dokumen ${res.document.doc_number} berhasil diarsipkan.`;
      showToast(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengarsipkan dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const restoreDocument = async (docId: string): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      const msg = 'Koneksi internet diperlukan untuk memulihkan dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    setWorkflowBusy(true);
    try {
      const res = await documentApi.restore(actorHeaders, docId);
      setState(normalizePmsState(res.state));
      const msg = `Dokumen ${res.document.doc_number} dipulihkan dari arsip.`;
      showToast(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memulihkan dokumen.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const registerEmployee = (emp: Omit<Employee, 'id'>): { ok: boolean; message: string } => {
    if (!currentUser || !currentRole) {
      return { ok: false, message: 'Sesi pengguna tidak valid.' };
    }
    if (currentRole.code === 'STAFF') {
      return { ok: false, message: 'Staff tidak memiliki wewenang mendaftarkan karyawan.' };
    }
    if (currentRole.code === 'HEAD') {
      const staffRole = state.roles.find((r) => r.code === 'STAFF');
      if (emp.division_id !== currentUser.division_id || emp.role_id !== staffRole?.id) {
        return {
          ok: false,
          message: 'Head hanya diizinkan mendaftarkan Staff pada divisinya sendiri.',
        };
      }
    }
    const duplicate = state.employees.some(
      (e) => e.nik.toLowerCase() === emp.nik.trim().toLowerCase()
    );
    if (duplicate) {
      return { ok: false, message: `NIK ${emp.nik} sudah terdaftar di sistem.` };
    }

    const newEmpId = `emp-${Date.now()}`;
    const cleanNik = emp.nik.trim().toUpperCase();

    commitState((prev) => ({
      ...prev,
      employees: [{ ...emp, id: newEmpId, nik: cleanNik }, ...prev.employees],
      accounts: [
        {
          id: `acc-${Date.now()}`,
          employee_id: newEmpId,
          nik: cleanNik,
          status: emp.status,
          last_login_at: '',
          must_reset_password: true,
        },
        ...prev.accounts,
      ],
      activityLogs: [
        appendLog(
          prev,
          'Registrasi Karyawan',
          `Mendaftarkan karyawan baru ${emp.full_name} (${cleanNik})`
        ),
        ...prev.activityLogs,
      ],
    }));

    showToast(`Karyawan ${emp.full_name} (${cleanNik}) berhasil didaftarkan.`);
    return { ok: true, message: 'Berhasil mendaftarkan karyawan.' };
  };

  const updateEmployeeStatus = (
    empId: string,
    status: AccountStatus,
    roleId?: string,
    divisionId?: string
  ) => {
    commitState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === empId
          ? {
              ...e,
              status,
              role_id: roleId ?? e.role_id,
              division_id: divisionId ?? e.division_id,
            }
          : e
      ),
      accounts: prev.accounts.map((a) => (a.employee_id === empId ? { ...a, status } : a)),
      activityLogs: [
        appendLog(prev, 'Manajemen Akun', `Mengubah status akun karyawan menjadi ${status}`),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Status akun diperbarui menjadi ${status}.`);
  };

  const resetEmployeePassword = (empId: string) => {
    const target = state.employees.find((e) => e.id === empId);
    commitState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.employee_id === empId ? { ...a, must_reset_password: true } : a
      ),
      activityLogs: [
        appendLog(
          prev,
          'Reset Password',
          `Mereset kata sandi sementara untuk ${target?.full_name ?? empId} (${target?.nik ?? ''})`
        ),
        ...prev.activityLogs,
      ],
    }));
    showToast(`Kata sandi ${target?.nik ?? ''} direset ke kredensial sementara (pms2026).`);
  };

  const markNotificationRead = (notifId: string) => {
    commitState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === notifId ? { ...n, read: true } : n)),
    }));
  };

  const markAllNotificationsRead = () => {
    commitState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  };

  const saveOfflineDraft = (draft: Omit<OfflineDraft, 'id' | 'created_at' | 'status'>) => {
    const newDraft: OfflineDraft = {
      ...draft,
      id: `drf-${Date.now()}`,
      created_at: new Date().toISOString(),
      status: 'Menunggu Sinkronisasi',
    };
    commitState((prev) => ({
      ...prev,
      offlineDrafts: [newDraft, ...prev.offlineDrafts],
    }));
    showToast('Draft lapangan disimpan offline di perangkat.');
  };

  const syncOfflineDrafts = () => {
    if (!isOnline) {
      showToast('Perangkat masih offline. Aktifkan koneksi internet untuk sinkronisasi.');
      return;
    }
    const pending = state.offlineDrafts.filter((d) => d.status === 'Menunggu Sinkronisasi');
    if (pending.length === 0) {
      showToast('Tidak ada draft offline yang menunggu sinkronisasi.');
      return;
    }

    commitState((prev) => {
      let nextWorkItems = [...prev.workItems];
      let nextDocs = [...prev.documents];
      let nextRequests = [...prev.materialRequests];
      const newLogs: ActivityLog[] = [];

      pending.forEach((d) => {
        if (d.module === 'teknik') {
          const p = d.payload as {
            title: string;
            overall_progress: number;
            daily_progress: number;
            constraints: string;
            follow_up: string;
            budget_id: string;
          };
          nextWorkItems = [
            {
              id: `wrk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              project_id: d.project_id,
              budget_id: p.budget_id || prev.budgets[0]?.id || '',
              title: p.title,
              division_id: 'div-teknik',
              pic_employee_id: d.created_by_id,
              start_date: new Date().toISOString().slice(0, 10),
              due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
              weight_percent: 10,
              daily_progress: p.daily_progress || 5,
              weekly_progress: p.daily_progress || 5,
              monthly_progress: p.overall_progress || 10,
              overall_progress: p.overall_progress || 10,
              status: p.constraints ? 'Kendala' : 'Dikerjakan',
              constraints: p.constraints || '-',
              follow_up: p.follow_up || '-',
              field_photo_url: '',
              updated_at: new Date().toISOString(),
            },
            ...nextWorkItems,
          ];
        } else if (d.module === 'dokumen') {
          const p = d.payload as {
            doc_type: InternalDocument['doc_type'];
            title: string;
            details: string;
            items_summary: string;
          };
          if (actorHeaders) {
            void documentApi
              .create(actorHeaders, {
                doc_type: p.doc_type || 'Laporan Pekerjaan',
                doc_date: new Date().toISOString().slice(0, 10),
                project_id: d.project_id,
                title: p.title,
                details: p.details,
                items_summary: p.items_summary || '-',
                attachment_name: 'Sinkronisasi-Lapangan-Offline.pdf',
                submit_mode: 'submit',
              })
              .then((res) => setState(normalizePmsState(res.state)))
              .catch(() => {});
          }
        } else if (d.module === 'logistik') {
          const p = d.payload as {
            material_id: string;
            qty_requested: number;
            notes: string;
          };
          const seq = String(nextRequests.length + 30).padStart(3, '0');
          nextRequests = [
            {
              id: `mr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              request_number: `SPM/2026/11/${seq}`,
              project_id: d.project_id,
              requested_by_id: d.created_by_id,
              request_date: new Date().toISOString().slice(0, 10),
              needed_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
              status: 'Menunggu Head',
              notes: p.notes || 'Draft offline tersinkron.',
              items: [
                {
                  material_id: p.material_id,
                  qty_requested: p.qty_requested,
                  qty_approved: 0,
                  qty_delivered: 0,
                },
              ],
              history: [
                {
                  timestamp: new Date().toISOString(),
                  actor_name: currentUser?.full_name ?? 'Staff',
                  action: 'Disinkronkan & Diajukan',
                  note: 'Draft offline disinkronkan.',
                },
              ],
            },
            ...nextRequests,
          ];
        }

        newLogs.push(
          appendLog(
            prev,
            'Sinkronisasi Offline',
            `Menyinkronkan draft lapangan "${d.title}"`,
            d.project_id
          )
        );
      });

      return {
        ...prev,
        workItems: nextWorkItems,
        documents: nextDocs,
        materialRequests: nextRequests,
        offlineDrafts: prev.offlineDrafts.map((d) => ({ ...d, status: 'Tersinkron' as const })),
        activityLogs: [...newLogs, ...prev.activityLogs],
      };
    });

    showToast(`${pending.length} draft offline berhasil disinkronkan ke sistem.`);
  };

  const deleteOfflineDraft = (draftId: string) => {
    commitState((prev) => ({
      ...prev,
      offlineDrafts: prev.offlineDrafts.filter((d) => d.id !== draftId),
    }));
  };

  const resetDemoData = () => {
    setState((prev) => mergeClientDemoWithProduction(prev));
    if (actorHeaders && isOnline && currentRole?.code === 'SUPER_ADMIN') {
      void workflowApi
        .resetDemo(actorHeaders)
        .then((fresh) => setState(normalizePmsState(fresh)))
        .catch(() => {});
    }
    showToast('Data awal sistem dikembalikan tanpa menghapus data operasional Anda.');
  };

  const prepareTeknikWorkflow = async (
    payload: PrepareTeknikPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menyimpan persiapan workflow ke server.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.prepareTeknik(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      showToast('Data RAB, jadwal, dan kebutuhan material proyek berhasil disimpan.');
      return { ok: true, message: 'Persiapan teknis tersimpan.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan persiapan teknis.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const submitWorkflowToFinance = async (
    projectId: string,
    note?: string,
    workCostEstimate?: number
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Pengajuan ke Tim Finance membutuhkan koneksi internet aktif.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.submitToFinance(actorHeaders, projectId, {
        note,
        work_cost_estimate: workCostEstimate,
      });
      setState(normalizePmsState(res.state));
      showToast('Proyek & RAB berhasil diajukan ke Tim Finance.');
      return { ok: true, message: 'Pengajuan dikirim ke Tim Finance.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan proyek ke Finance.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const decideWorkflowFinance = async (
    projectId: string,
    payload: FinanceDecisionPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Keputusan Finance membutuhkan koneksi internet aktif.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.financeDecision(actorHeaders, projectId, payload);
      setState(normalizePmsState(res.state));
      const wfStage = res.workflow?.stage;
      const feedback =
        payload.decision === 'APPROVE'
          ? wfStage === 'MENUNGGU_KONTRAK'
            ? 'Proyek disetujui Finance. Lanjutkan Pembuatan & Aktivasi Kontrak sebelum Logistik.'
            : 'Proyek disetujui Finance dan diteruskan ke Tim Logistik.'
          : payload.decision === 'REQUEST_REVISION'
          ? 'Permintaan revisi dikembalikan ke Tim Teknik.'
          : 'Pengajuan proyek ditolak oleh Tim Finance.';
      showToast(feedback);
      return { ok: true, message: feedback };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses keputusan Finance.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const processWorkflowLogistics = async (
    projectId: string,
    payload: LogisticsProcessPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Proses gudang & pengadaan Logistik membutuhkan koneksi internet aktif.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.logisticsProcess(actorHeaders, projectId, payload);
      setState(normalizePmsState(res.state));
      const feedback =
        payload.action === 'FORWARD_FIELD'
          ? 'Proyek berhasil diteruskan ke Tim Lapangan.'
          : payload.action === 'CREATE_PROCUREMENT'
          ? 'Permintaan pengadaan (PO) material berhasil dibuat.'
          : payload.action === 'RECEIVE_PROCUREMENT'
          ? 'Penerimaan barang PO tercatat dan stok gudang bertambah.'
          : 'Reservasi & pengeluaran stok material berhasil diproses.';
      showToast(feedback);
      return { ok: true, message: feedback };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses aksi Logistik.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const submitWorkflowFieldReport = async (
    projectId: string,
    payload: FieldReportPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Kirim laporan lapangan membutuhkan koneksi internet aktif (gunakan Draft Offline bila tanpa sinyal).' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.submitFieldReport(actorHeaders, projectId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Laporan progres lapangan (${payload.progress_percent}%) berhasil disimpan & masuk Monitoring.`);
      return { ok: true, message: 'Laporan lapangan berhasil dicatat.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan laporan lapangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createContractApi = async (
    payload: CreateContractPayload
  ): Promise<{ ok: boolean; message: string; contract?: Contract }> => {
    if (!actorHeaders || !currentRole || !currentDivision) {
      return { ok: false, message: 'Sesi pengguna tidak valid.' };
    }
    if (!canCreateContract(currentRole.code, currentDivision.code)) {
      const msg = 'Anda tidak memiliki hak akses untuk membuat kontrak';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk membuat kontrak.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.createContract(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      setSelectedContractId(res.contract.id);
      showToast(`Kontrak ${res.contract.contract_number} berhasil dibuat (Draft).`);
      return { ok: true, message: 'Kontrak berhasil disimpan.', contract: res.contract };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat kontrak.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const activateContractApi = async (
    contractId: string,
    payload?: { document_verified?: boolean; note?: string }
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mengaktifkan kontrak.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.activateContract(actorHeaders, contractId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Kontrak ${res.contract.contract_number} resmi aktif & diteruskan ke Logistik.`);
      return { ok: true, message: 'Kontrak berhasil diaktifkan.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengaktifkan kontrak.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const closeContractApi = async (
    contractId: string,
    closeNote?: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menutup kontrak.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.closeContract(actorHeaders, contractId, {
        close_note: closeNote,
      });
      setState(normalizePmsState(res.state));
      showToast(`Kontrak ${res.contract.contract_number} telah ditutup (Selesai & Lunas).`);
      return { ok: true, message: 'Kontrak berhasil ditutup.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menutup kontrak.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const deleteContractApi = async (
    contractId: string,
    reason: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menghapus kontrak.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.deleteContract(actorHeaders, contractId, reason);
      setState(normalizePmsState(res.state));
      if (selectedContractId === contractId) {
        setSelectedContractId(null);
      }
      showToast(`Kontrak ${res.contract.contract_number} berhasil dihapus dari daftar aktif.`);
      return { ok: true, message: 'Kontrak berhasil dihapus.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus kontrak.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveContractTermsApi = async (
    contractId: string,
    payload: SaveContractTermsPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menyimpan jadwal termin.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.saveContractTerms(actorHeaders, contractId, payload);
      setState(normalizePmsState(res.state));
      showToast('Jadwal termin kontrak (100%) berhasil disimpan.');
      return { ok: true, message: 'Jadwal termin disimpan.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan jadwal termin.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const submitTermClaimApi = async (
    contractId: string,
    payload: SubmitTermClaimPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mengajukan pencairan termin.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.submitTermClaim(actorHeaders, contractId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Pengajuan ${res.claim.claim_number} dikirim ke Finance untuk approval.`);
      return { ok: true, message: 'Pengajuan termin berhasil dikirim.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan pencairan termin.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const decideTermClaimApi = async (
    claimId: string,
    payload: DecideTermClaimPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memutus approval termin.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.decideTermClaim(actorHeaders, claimId, payload);
      setState(normalizePmsState(res.state));
      const feedback =
        payload.decision === 'APPROVE'
          ? `Pengajuan ${res.claim.claim_number} disetujui. Silakan lanjutkan ke Realisasi Pembayaran.`
          : payload.decision === 'REJECT'
          ? `Pengajuan ${res.claim.claim_number} ditolak.`
          : `Pengajuan ${res.claim.claim_number} dikembalikan untuk revisi.`;
      showToast(feedback);
      return { ok: true, message: feedback };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses keputusan approval termin.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const recordTermPaymentApi = async (
    claimId: string,
    payload: RecordTermPaymentPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mencatat pembayaran termin.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.recordTermPayment(actorHeaders, claimId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Realisasi pembayaran ${res.payment.payment_no} berhasil dicatat.`);
      return { ok: true, message: 'Pembayaran berhasil dicatat.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat realisasi pembayaran.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createContractAddendumApi = async (
    contractId: string,
    payload: CreateAddendumPayload
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menerbitkan addendum kontrak.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await workflowApi.createContractAddendum(actorHeaders, contractId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Addendum ${payload.addendum_number} berhasil diterbitkan & versi kontrak diarsipkan.`);
      return { ok: true, message: 'Addendum berhasil diterbitkan.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menerbitkan addendum kontrak.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createWarehouseLocationApi = async (
    payload: SaveWarehouseLocationPayload
  ): Promise<{ ok: boolean; message: string; warehouse?: WarehouseLocation }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menambahkan lokasi gudang.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createWarehouseLocation(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      showToast(`Lokasi gudang ${res.warehouse.code} — ${res.warehouse.name} berhasil ditambahkan.`);
      return { ok: true, message: 'Lokasi gudang tersimpan.', warehouse: res.warehouse };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambahkan lokasi gudang.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateWarehouseLocationApi = async (
    warehouseId: string,
    payload: SaveWarehouseLocationPayload
  ): Promise<{ ok: boolean; message: string; warehouse?: WarehouseLocation }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memperbarui lokasi gudang.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.updateWarehouseLocation(actorHeaders, warehouseId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Lokasi gudang ${res.warehouse.name} diperbarui.`);
      return { ok: true, message: 'Lokasi gudang diperbarui.', warehouse: res.warehouse };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui lokasi gudang.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createWarehouseMaterialApi = async (
    payload: CreateWarehouseMaterialPayload
  ): Promise<{ ok: boolean; message: string; material?: Material }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menyimpan master barang.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createMaterial(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      showToast(`Barang ${res.material.code} — ${res.material.name} berhasil ditambahkan.`);
      return { ok: true, message: 'Data barang disimpan.', material: res.material };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data barang.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateWarehouseMaterialApi = async (
    materialId: string,
    payload: UpdateWarehouseMaterialPayload
  ): Promise<{ ok: boolean; message: string; material?: Material }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memperbarui data barang.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.updateMaterial(actorHeaders, materialId, payload);
      setState(normalizePmsState(res.state));
      showToast(`Data barang ${res.material.name} diperbarui.`);
      return { ok: true, message: 'Data barang diperbarui.', material: res.material };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui data barang.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createWarehouseStockOrderApi = async (
    payload: CreateStockOrderPayload
  ): Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mencatat pengadaan stok.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createStockOrder(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg =
        res.order.status === 'Disetujui Finance'
          ? `${res.order.order_no} disetujui Finance. Menunggu konfirmasi penerimaan Logistik agar stok bertambah.`
          : `${res.order.order_no} diajukan ke Finance untuk persetujuan.`;
      showToast(msg);
      return { ok: true, message: msg, order: res.order };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat pengadaan stok.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const decideWarehouseOrderFinanceApi = async (
    orderId: string,
    payload: DecideStockOrderFinancePayload
  ): Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk persetujuan Finance.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.decideStockOrderFinance(actorHeaders, orderId, payload);
      setState(normalizePmsState(res.state));
      const msg =
        payload.decision === 'APPROVE'
          ? `${res.order.order_no} disetujui Finance. Logistik dapat mengonfirmasi barang diterima.`
          : `${res.order.order_no} ditolak Finance.`;
      showToast(msg);
      return { ok: true, message: msg, order: res.order };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses keputusan Finance.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const confirmWarehouseReceiptApi = async (
    orderId: string,
    payload: ConfirmStockOrderReceiptPayload
  ): Promise<{ ok: boolean; message: string; order?: WarehouseStockOrder }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk konfirmasi barang diterima.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.confirmStockOrderReceipt(actorHeaders, orderId, payload);
      setState(normalizePmsState(res.state));
      const msg = `Penerimaan ${res.order.order_no} (+${res.order.qty_actual} ${res.order.unit}) dikonfirmasi & stok gudang otomatis bertambah.`;
      showToast(msg);
      return { ok: true, message: msg, order: res.order };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengonfirmasi penerimaan barang.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const issueWarehouseStockApi = async (
    payload: IssueWarehouseStockPayload
  ): Promise<{ ok: boolean; message: string; transaction?: MaterialTransaction }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mencatat barang keluar.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.issueStock(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Barang keluar (${res.transaction.qty} unit) tercatat & stok gudang berkurang.`;
      showToast(msg);
      return { ok: true, message: msg, transaction: res.transaction };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat barang keluar.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createWarehouseMaterialRequestApi = async (
    payload: CreateWarehouseMaterialRequestPayload
  ): Promise<{ ok: boolean; message: string; request?: MaterialRequest }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk mengajukan permintaan material.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createMaterialRequest(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Permintaan material ${res.request.request_number} berhasil diajukan.`;
      showToast(msg);
      return { ok: true, message: msg, request: res.request };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan permintaan material.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const advanceWarehouseMaterialRequestApi = async (
    requestId: string,
    payload: AdvanceWarehouseMaterialRequestPayload
  ): Promise<{ ok: boolean; message: string; request?: MaterialRequest }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memproses permintaan material.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.advanceMaterialRequest(actorHeaders, requestId, payload);
      setState(normalizePmsState(res.state));
      const msg = `${res.request.request_number} diperbarui ke status "${res.request.status}".`;
      showToast(msg);
      return { ok: true, message: msg, request: res.request };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses permintaan material.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createStockOpnameApi = async (
    payload: CreateStockOpnamePayload
  ): Promise<{ ok: boolean; message: string; opname?: StockOpnameRecord }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk menyimpan hasil stok opname.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createStockOpname(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Stok opname ${res.opname.opname_no} tersimpan & stok disesuaikan.`;
      showToast(msg);
      return { ok: true, message: msg, opname: res.opname };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan stok opname.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createDeliveryNoteApi = async (
    payload: SaveDeliveryNotePayload
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk membuat Surat Jalan.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.createDeliveryNote(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Draft Surat Jalan ${res.deliveryNote.sj_number} berhasil dibuat.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateDeliveryNoteApi = async (
    id: string,
    payload: SaveDeliveryNotePayload
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) {
      return { ok: false, message: 'Koneksi internet diperlukan untuk memperbarui Surat Jalan.' };
    }
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.updateDeliveryNote(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Draft Surat Jalan ${res.deliveryNote.sj_number} diperbarui.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const prepareDeliveryNoteApi = async (
    id: string,
    note?: string
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.prepareDeliveryNote(actorHeaders, id, note);
      setState(normalizePmsState(res.state));
      const msg = `Barang untuk ${res.deliveryNote.sj_number} siap dikirim (Menunggu Pengiriman).`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyiapkan barang Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const dispatchDeliveryNoteApi = async (
    id: string,
    payload: DispatchDeliveryNotePayload
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.dispatchDeliveryNote(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Surat Jalan ${res.deliveryNote.sj_number} ditandatangani & barang dikeluarkan (stok gudang otomatis berkurang).`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses pengiriman Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const markDeliveryNoteArrivedApi = async (
    id: string,
    note?: string
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.markDeliveryNoteArrived(actorHeaders, id, note);
      setState(normalizePmsState(res.state));
      const msg = `${res.deliveryNote.sj_number} tiba di lokasi — menunggu konfirmasi & tanda tangan Tim Lapangan.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui status kedatangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const confirmReceiveDeliveryNoteApi = async (
    id: string,
    payload: ConfirmReceiveDeliveryNotePayload
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.confirmReceiveDeliveryNote(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Surat Jalan ${res.deliveryNote.sj_number} ditandatangani Penerima, berstatus Selesai, dan terkunci.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengonfirmasi penerimaan Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const cancelDeliveryNoteApi = async (
    id: string,
    reason: string
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.cancelDeliveryNote(actorHeaders, id, reason);
      setState(normalizePmsState(res.state));
      const msg = `Surat Jalan ${res.deliveryNote.sj_number} dibatalkan dan tercatat pada riwayat audit.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membatalkan Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const reviseDeliveryNoteApi = async (
    id: string,
    reason: string
  ): Promise<{ ok: boolean; message: string; deliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.reviseDeliveryNote(actorHeaders, id, reason);
      setState(normalizePmsState(res.state));
      const msg = `Revisi ${res.deliveryNote.sj_number} diterbitkan sebagai Draft baru.`;
      showToast(msg);
      return { ok: true, message: msg, deliveryNote: res.deliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menerbitkan revisi Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const deleteDeliveryNoteApi = async (
    id: string,
    reason: string
  ): Promise<{ ok: boolean; message: string; deletedDeliveryNote?: DeliveryNote }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await warehouseApi.deleteDeliveryNote(actorHeaders, id, reason);
      setState(normalizePmsState(res.state));
      const msg =
        res.message ||
        `Surat Jalan ${res.deletedDeliveryNote.sj_number} dihapus dari daftar dan riwayat normal (audit tersimpan).`;
      showToast(msg);
      return { ok: true, message: msg, deletedDeliveryNote: res.deletedDeliveryNote };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus Surat Jalan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  // ASET PROYEK API ACTIONS
  const createProjectAssetApi = async (
    payload: CreateProjectAssetPayload
  ): Promise<{ ok: boolean; message: string; asset?: ProjectAsset }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.createAsset(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Aset ${res.asset.asset_code} (${res.asset.name}) berhasil ditambahkan ke ${res.asset.project_number}.`;
      showToast(msg);
      return { ok: true, message: msg, asset: res.asset };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambah aset proyek.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateProjectAssetApi = async (
    id: string,
    payload: UpdateProjectAssetPayload
  ): Promise<{ ok: boolean; message: string; asset?: ProjectAsset }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.updateAsset(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Data aset ${res.asset.asset_code} (${res.asset.name}) berhasil diperbarui.`;
      showToast(msg);
      return { ok: true, message: msg, asset: res.asset };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui aset proyek.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createProjectAssetReportApi = async (
    payload: CreateProjectAssetReportPayload
  ): Promise<{ ok: boolean; message: string; report?: ProjectAssetReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.createReport(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Laporan ${res.report.report_no} (${res.report.report_type}) berhasil dikirim ke Finance untuk diperiksa.`;
      showToast(msg);
      return { ok: true, message: msg, report: res.report };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim laporan aset.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const resubmitProjectAssetReportApi = async (
    id: string,
    payload: ResubmitProjectAssetReportPayload
  ): Promise<{ ok: boolean; message: string; report?: ProjectAssetReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.resubmitReport(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Perbaikan laporan ${res.report.report_no} berhasil dikirim ulang ke Finance.`;
      showToast(msg);
      return { ok: true, message: msg, report: res.report };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui laporan aset.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const reviewProjectAssetReportApi = async (
    id: string,
    payload: ReviewProjectAssetReportPayload
  ): Promise<{ ok: boolean; message: string; report?: ProjectAssetReport; asset?: ProjectAsset }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.reviewReport(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Hasil pemeriksaan laporan ${res.report.report_no}: ${res.report.status}.`;
      showToast(msg);
      return { ok: true, message: msg, report: res.report, asset: res.asset };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses pemeriksaan laporan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const deleteProjectAssetApi = async (
    id: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await projectAssetApi.deleteAsset(actorHeaders, id);
      setState(normalizePmsState(res.state));
      if (selectedAssetId === id) {
        setSelectedAssetId(null);
      }
      const msg = 'Aset proyek berhasil dihapus permanen.';
      showToast(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus aset proyek.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  // FINANCE MODULE SERVER API ACTIONS
  const createFinanceTransactionApi = async (
    payload: CreateFinanceTransactionPayload
  ): Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.createTransaction(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Transaksi ${res.transaction.transaction_no} berhasil dicatat (${res.transaction.status}).`;
      showToast(msg);
      return { ok: true, message: msg, transaction: res.transaction };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat transaksi keuangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateFinanceTransactionApi = async (
    id: string,
    payload: UpdateFinanceTransactionPayload
  ): Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.updateTransaction(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Transaksi ${res.transaction.transaction_no} berhasil diperbarui.`;
      showToast(msg);
      return { ok: true, message: msg, transaction: res.transaction };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui transaksi keuangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const decideFinanceTransactionApi = async (
    id: string,
    decision: 'Terverifikasi' | 'Ditolak',
    note?: string
  ): Promise<{ ok: boolean; message: string; transaction?: FinancialTransaction }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.decideTransaction(actorHeaders, id, decision, note);
      setState(normalizePmsState(res.state));
      const msg = `Transaksi ${res.transaction.transaction_no} dinyatakan ${decision}.`;
      showToast(msg);
      return { ok: true, message: msg, transaction: res.transaction };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memverifikasi transaksi keuangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const deleteFinanceTransactionApi = async (
    id: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.deleteTransaction(actorHeaders, id);
      setState(normalizePmsState(res.state));
      const msg = 'Transaksi keuangan berhasil dihapus.';
      showToast(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus transaksi keuangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const importFinanceTransactionsApi = async (
    rows: ImportFinanceTransactionRowPayload[]
  ): Promise<{ ok: boolean; message: string; importedCount?: number }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.importTransactions(actorHeaders, rows);
      setState(normalizePmsState(res.state));
      const msg = `${res.importedCount} transaksi keuangan berhasil diimpor dan tersimpan.`;
      showToast(msg);
      return { ok: true, message: msg, importedCount: res.importedCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengimpor data keuangan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const createFinanceBillApi = async (
    payload: CreateFinanceBillPayload
  ): Promise<{ ok: boolean; message: string; bill?: FinanceBill }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.createBill(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Tagihan ${res.bill.bill_no} (${res.bill.vendor_name}) berhasil dicatat.`;
      showToast(msg);
      return { ok: true, message: msg, bill: res.bill };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat tagihan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const updateFinanceBillApi = async (
    id: string,
    payload: UpdateFinanceBillPayload
  ): Promise<{ ok: boolean; message: string; bill?: FinanceBill }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.updateBill(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Tagihan ${res.bill.bill_no} berhasil diperbarui.`;
      showToast(msg);
      return { ok: true, message: msg, bill: res.bill };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui tagihan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const payFinanceBillApi = async (
    id: string,
    payload: PayFinanceBillPayload
  ): Promise<{ ok: boolean; message: string; bill?: FinanceBill; transaction?: FinancialTransaction }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.payBill(actorHeaders, id, payload);
      setState(normalizePmsState(res.state));
      const msg = `Pembayaran ${res.bill.bill_no} tersimpan (${res.bill.status}) & sinkron ke arus kas.`;
      showToast(msg);
      return { ok: true, message: msg, bill: res.bill, transaction: res.transaction };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses pembayaran tagihan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const deleteFinanceBillApi = async (id: string): Promise<{ ok: boolean; message: string }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await financeApi.deleteBill(actorHeaders, id);
      setState(normalizePmsState(res.state));
      const msg = 'Tagihan berhasil dihapus.';
      showToast(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus tagihan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const hasTeknikAccess = Boolean(
    currentRole && currentDivision && canAccessTeknikModule(currentRole.code, currentDivision.code)
  );

  const saveTeknikEvaluationApi = async (
    payload: SaveTeknikEvaluationPayload
  ): Promise<{ ok: boolean; message: string; evaluation?: TeknikEvaluationReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.saveEvaluation(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Evaluasi Teknis ${res.evaluation.eval_no} berhasil disimpan.`;
      showToast(msg);
      return { ok: true, message: msg, evaluation: res.evaluation };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan evaluasi teknis.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveTeknikConstraintApi = async (
    payload: SaveTeknikConstraintPayload
  ): Promise<{ ok: boolean; message: string; constraint?: TeknikConstraintRecord }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.saveConstraint(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Kendala Teknis ${res.constraint.issue_no} tersimpan (${res.constraint.status}).`;
      showToast(msg);
      return { ok: true, message: msg, constraint: res.constraint };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan tindak lanjut kendala teknis.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveTeknikChangeApi = async (
    payload: SaveTeknikChangePayload
  ): Promise<{ ok: boolean; message: string; change?: TeknikChangeReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.saveChangeReport(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Laporan Perubahan Pekerjaan ${res.change.change_no} tersimpan.`;
      showToast(msg);
      return { ok: true, message: msg, change: res.change };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan laporan perubahan pekerjaan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const decideTeknikChangeApi = async (
    id: string,
    decision: Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>,
    reviewNote: string
  ): Promise<{ ok: boolean; message: string; change?: TeknikChangeReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.decideChangeReport(actorHeaders, id, decision, reviewNote);
      setState(normalizePmsState(res.state));
      const msg = `Perubahan ${res.change.change_no} diputuskan: ${res.change.status}.`;
      showToast(msg);
      return { ok: true, message: msg, change: res.change };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses keputusan perubahan pekerjaan.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveTeknikCompletionApi = async (
    payload: SaveTeknikCompletionPayload
  ): Promise<{ ok: boolean; message: string; completion?: TeknikCompletionReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.saveCompletionReport(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Laporan Penyelesaian Teknis ${res.completion.completion_no} tersimpan.`;
      showToast(msg);
      return { ok: true, message: msg, completion: res.completion };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan laporan penyelesaian teknis.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const verifyTeknikCompletionApi = async (
    id: string,
    followUpAction?: string
  ): Promise<{ ok: boolean; message: string; completion?: TeknikCompletionReport }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.verifyCompletionReport(actorHeaders, id, followUpAction);
      setState(normalizePmsState(res.state));
      const msg = `Penyelesaian Teknis ${res.completion.completion_no} terverifikasi Selesai.`;
      showToast(msg);
      return { ok: true, message: msg, completion: res.completion };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memverifikasi penyelesaian teknis.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveTeknikProgressAssessmentApi = async (
    payload: SaveTeknikProgressAssessmentPayload
  ): Promise<{ ok: boolean; message: string; assessment?: TeknikProgressAssessment }> => {
    if (!actorHeaders) return { ok: false, message: 'Sesi pengguna tidak valid.' };
    if (!hasTeknikAccess) {
      const msg = 'Akses ditolak: Hanya Head Teknik, Staff Teknik, dan Super Admin yang berwenang.';
      showToast(msg);
      return { ok: false, message: msg };
    }
    if (!isOnline) return { ok: false, message: 'Koneksi internet diperlukan.' };
    setWorkflowBusy(true);
    try {
      const res = await teknikReportApi.saveProgressAssessment(actorHeaders, payload);
      setState(normalizePmsState(res.state));
      const msg = `Indeks Progres Teknik ${res.assessment.assessment_no} (${res.assessment.teknik_progress_percent}%) tersimpan.`;
      showToast(msg);
      return { ok: true, message: msg, assessment: res.assessment };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan indeks progres Teknik.';
      showToast(msg);
      return { ok: false, message: msg };
    } finally {
      setWorkflowBusy(false);
    }
  };

  return (
    <PMSContext.Provider
      value={{
        state,
        currentUser,
        currentRole,
        currentDivision,
        activeModule,
        setActiveModule,
        projectSubmenu,
        setProjectSubmenu,
        contractSubmenu,
        setContractSubmenu,
        gudangSubmenu,
        setGudangSubmenu,
        selectedProjectId,
        setSelectedProjectId,
        selectedContractId,
        setSelectedContractId,
        selectedAssetId,
        setSelectedAssetId,
        selectedDocumentId,
        setSelectedDocumentId,
        isOnline,
        simulateOffline,
        setSimulateOffline,
        toastMessage,
        showToast,
        loginWithNik,
        quickLoginByNik,
        logout,
        requestPasswordReset,
        addProject,
        createProjectApi,
        updateProject,
        updateProjectApi,
        softDeleteProject,
        restoreProject,
        addContract,
        updateContract,
        addContractTerm,
        updateContractTerm,
        addBudgetItem,
        updateBudgetItem,
        softDeleteBudgetItem,
        restoreBudgetItem,
        addProjectMaterial,
        updateProjectMaterial,
        softDeleteProjectMaterial,
        restoreProjectMaterial,
        addWorkItem,
        updateWorkItem,
        softDeleteWorkItem,
        restoreWorkItem,
        addMaterial,
        createMaterialRequest,
        advanceMaterialRequest,
        recordMaterialTransaction,
        addCompanyAsset,
        updateCompanyAsset,
        addAssetMovement,
        addMaintenanceRecord,
        addFinancialTransaction,
        decideFinancialTransaction,
        createDocument,
        advanceDocumentStatus,
        softDeleteDocument,
        restoreDocument,
        createDocumentApi,
        updateDocumentApi,
        reviseDocumentApi,
        registerEmployee,
        updateEmployeeStatus,
        resetEmployeePassword,
        markNotificationRead,
        markAllNotificationsRead,
        saveOfflineDraft,
        syncOfflineDrafts,
        deleteOfflineDraft,
        resetDemoData,
        workflowBusy,
        refreshServerState,
        prepareTeknikWorkflow,
        submitWorkflowToFinance,
        decideWorkflowFinance,
        processWorkflowLogistics,
        submitWorkflowFieldReport,
        createContractApi,
        activateContractApi,
        closeContractApi,
        deleteContractApi,
        saveContractTermsApi,
        submitTermClaimApi,
        decideTermClaimApi,
        recordTermPaymentApi,
        createContractAddendumApi,
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
        createDeliveryNoteApi,
        updateDeliveryNoteApi,
        prepareDeliveryNoteApi,
        dispatchDeliveryNoteApi,
        markDeliveryNoteArrivedApi,
        confirmReceiveDeliveryNoteApi,
        cancelDeliveryNoteApi,
        reviseDeliveryNoteApi,
        deleteDeliveryNoteApi,
        createProjectAssetApi,
        updateProjectAssetApi,
        createProjectAssetReportApi,
        resubmitProjectAssetReportApi,
        reviewProjectAssetReportApi,
        deleteProjectAssetApi,
        createFinanceTransactionApi,
        updateFinanceTransactionApi,
        decideFinanceTransactionApi,
        deleteFinanceTransactionApi,
        importFinanceTransactionsApi,
        createFinanceBillApi,
        updateFinanceBillApi,
        payFinanceBillApi,
        deleteFinanceBillApi,
        saveTeknikEvaluationApi,
        saveTeknikConstraintApi,
        saveTeknikChangeApi,
        decideTeknikChangeApi,
        saveTeknikCompletionApi,
        verifyTeknikCompletionApi,
        saveTeknikProgressAssessmentApi,
      }}
    >
      {children}
    </PMSContext.Provider>
  );
};

export function usePMS(): PMSContextValue {
  const ctx = useContext(PMSContext);
  if (!ctx) throw new Error('usePMS harus digunakan di dalam PMSProvider');
  return ctx;
}
