import {
  AddendumChangeType,
  BudgetItem,
  Contract,
  PMSState,
  Project,
  ProjectWorkflow,
  TermClaim,
  TermPayment,
} from '../types/pms';
import { ActorHeaders, buildActorHeaders, resolveApiUrl } from './attachmentApi';

function buildHeaders(actor: ActorHeaders): Record<string, string> {
  return {
    ...buildActorHeaders(actor),
    'Content-Type': 'application/json',
  };
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(resolveApiUrl(input), init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    throw new Error(
      `Gagal terhubung ke server backend (${detail}). Pastikan server aplikasi aktif dan koneksi stabil.`
    );
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Gagal memproses permintaan (HTTP ${res.status})`);
  }
  return data;
}

export interface PrepareTeknikPayload {
  projectId: string;
  projectPatch?: Partial<Project>;
  upsertBudgetItem?: Omit<BudgetItem, 'id'> & { id?: string };
  removeBudgetId?: string;
  work_cost_estimate?: number;
  schedule_start?: string;
  schedule_end?: string;
  material_needs?: Array<{ id?: string; material_id: string; qty_needed: number; notes?: string }>;
}

export interface FinanceDecisionPayload {
  decision: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
  note?: string;
  approved_budget_limit?: number;
}

export interface LogisticsProcessPayload {
  action: 'RESERVE_ISSUE' | 'CREATE_PROCUREMENT' | 'RECEIVE_PROCUREMENT' | 'FORWARD_FIELD';
  material_id?: string;
  qty?: number;
  supplier_name?: string;
  estimated_cost?: number;
  procurement_id?: string;
  note?: string;
}

export interface FieldReportPayload {
  work_summary: string;
  progress_percent: number;
  material_usages?: Array<{ material_id: string; qty_used: number }>;
  expense_amount?: number;
  expense_note?: string;
  constraints?: string;
  follow_up?: string;
  attachment_ids?: string[];
  mark_completed?: boolean;
}

export interface CreateContractPayload {
  project_id: string;
  contract_number: string;
  work_name: string;
  contract_value: number;
  rab_approved_value?: number;
  contract_date: string;
  start_date: string;
  end_date: string;
  counterparty: string;
  first_party_name: string;
  second_party_name: string;
  pic_contract: string;
  scope_description: string;
  contract_notes?: string;
  finance_approved_date?: string;
  document_ref: string;
  document_verified: boolean;
}

export interface SaveContractTermsPayload {
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
}

export interface SubmitTermClaimPayload {
  term_id: string;
  actual_progress: number;
  claim_date: string;
  work_description: string;
  notes?: string;
  field_report_id?: string;
  field_verified: boolean;
  field_verified_by_name: string;
  doc_attachment_ids?: string[];
}

export interface DecideTermClaimPayload {
  decision: 'APPROVE' | 'REJECT' | 'REVISION';
  note?: string;
}

export interface RecordTermPaymentPayload {
  paid_amount: number;
  payment_date: string;
  payment_method: TermPayment['payment_method'];
  transaction_ref: string;
  proof_attachment_ids?: string[];
  notes?: string;
}

export interface CreateAddendumPayload {
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
}

export const workflowApi = {
  async getState(actor: ActorHeaders): Promise<PMSState> {
    const res = await apiFetch('/api/workflow/state', { headers: buildHeaders(actor) });
    const data = await parseJson<{ state: PMSState }>(res);
    return data.state;
  },

  async createProject(
    actor: ActorHeaders,
    project: Omit<Project, 'id'>
  ): Promise<{ state: PMSState; project: Project; workflow: ProjectWorkflow }> {
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(project),
    });
    return parseJson(res);
  },

  async updateProject(
    actor: ActorHeaders,
    projectId: string,
    project: Project
  ): Promise<{ state: PMSState; project: Project }> {
    const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(project),
    });
    return parseJson(res);
  },

  async syncCore(actor: ActorHeaders, statePatch: Partial<PMSState>): Promise<PMSState> {
    const res = await apiFetch('/api/workflow/sync-core', {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(statePatch),
    });
    const data = await parseJson<{ state: PMSState }>(res);
    return data.state;
  },

  async prepareTeknik(
    actor: ActorHeaders,
    payload: PrepareTeknikPayload
  ): Promise<{ state: PMSState; workflow: ProjectWorkflow }> {
    const res = await apiFetch('/api/workflow/teknik/prepare', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async submitToFinance(
    actor: ActorHeaders,
    projectId: string,
    payload?: { note?: string; work_cost_estimate?: number }
  ): Promise<{ state: PMSState; workflow: ProjectWorkflow }> {
    const res = await apiFetch(`/api/workflow/${projectId}/submit-finance`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload || {}),
    });
    return parseJson(res);
  },

  async financeDecision(
    actor: ActorHeaders,
    projectId: string,
    payload: FinanceDecisionPayload
  ): Promise<{ state: PMSState; workflow: ProjectWorkflow }> {
    const res = await apiFetch(`/api/workflow/${projectId}/finance-decision`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async logisticsProcess(
    actor: ActorHeaders,
    projectId: string,
    payload: LogisticsProcessPayload
  ): Promise<{ state: PMSState; workflow: ProjectWorkflow }> {
    const res = await apiFetch(`/api/workflow/${projectId}/logistics-process`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async submitFieldReport(
    actor: ActorHeaders,
    projectId: string,
    payload: FieldReportPayload
  ): Promise<{ state: PMSState; workflow: ProjectWorkflow }> {
    const res = await apiFetch(`/api/workflow/${projectId}/field-report`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createContract(
    actor: ActorHeaders,
    payload: CreateContractPayload
  ): Promise<{ state: PMSState; contract: Contract }> {
    const res = await apiFetch('/api/contracts', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async activateContract(
    actor: ActorHeaders,
    contractId: string,
    payload?: { document_verified?: boolean; note?: string }
  ): Promise<{ state: PMSState; contract: Contract }> {
    const res = await apiFetch(`/api/contracts/${contractId}/activate`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload || {}),
    });
    return parseJson(res);
  },

  async closeContract(
    actor: ActorHeaders,
    contractId: string,
    payload?: { close_note?: string }
  ): Promise<{ state: PMSState; contract: Contract }> {
    const res = await apiFetch(`/api/contracts/${contractId}/close`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload || {}),
    });
    return parseJson(res);
  },

  async deleteContract(
    actor: ActorHeaders,
    contractId: string,
    reason: string
  ): Promise<{ state: PMSState; contract: Contract }> {
    const res = await apiFetch(`/api/contracts/${contractId}/delete`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async saveContractTerms(
    actor: ActorHeaders,
    contractId: string,
    payload: SaveContractTermsPayload
  ): Promise<{ state: PMSState }> {
    const res = await apiFetch(`/api/contracts/${contractId}/terms`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async submitTermClaim(
    actor: ActorHeaders,
    contractId: string,
    payload: SubmitTermClaimPayload
  ): Promise<{ state: PMSState; claim: TermClaim }> {
    const res = await apiFetch(`/api/contracts/${contractId}/claims`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideTermClaim(
    actor: ActorHeaders,
    claimId: string,
    payload: DecideTermClaimPayload
  ): Promise<{ state: PMSState; claim: TermClaim }> {
    const res = await apiFetch(`/api/contracts/claims/${claimId}/decide`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async recordTermPayment(
    actor: ActorHeaders,
    claimId: string,
    payload: RecordTermPaymentPayload
  ): Promise<{ state: PMSState; payment: TermPayment }> {
    const res = await apiFetch(`/api/contracts/claims/${claimId}/payments`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createContractAddendum(
    actor: ActorHeaders,
    contractId: string,
    payload: CreateAddendumPayload
  ): Promise<{ state: PMSState }> {
    const res = await apiFetch(`/api/contracts/${contractId}/addendums`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async resetDemo(actor: ActorHeaders): Promise<PMSState> {
    const res = await apiFetch('/api/workflow/reset-demo', {
      method: 'POST',
      headers: buildHeaders(actor),
    });
    const data = await parseJson<{ state: PMSState }>(res);
    return data.state;
  },
};
