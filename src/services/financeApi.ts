import {
  FinanceBill,
  FinanceBillCategory,
  FinancialCategory,
  FinancialTransaction,
  FinancialTxStatus,
  PMSState,
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
    throw new Error(data.message || `Gagal memproses permintaan Finance (HTTP ${res.status})`);
  }
  return data;
}

export interface CreateFinanceTransactionPayload {
  project_id: string;
  category: FinancialCategory;
  type: 'Pemasukan' | 'Pengeluaran';
  date: string;
  amount: number;
  proof_ref?: string;
  proof_attachment_id?: string;
  description: string;
  status?: FinancialTxStatus;
  source_module?: FinancialTransaction['source_module'];
}

export interface UpdateFinanceTransactionPayload {
  project_id?: string;
  category?: FinancialCategory;
  type?: 'Pemasukan' | 'Pengeluaran';
  date?: string;
  amount?: number;
  proof_ref?: string;
  proof_attachment_id?: string | null;
  description?: string;
}

export interface ImportFinanceTransactionRowPayload {
  transaction_no?: string;
  date: string;
  project_id?: string;
  project_number?: string;
  type: 'Pemasukan' | 'Pengeluaran';
  category: FinancialCategory;
  amount: number;
  proof_ref?: string;
  description: string;
  status?: FinancialTxStatus;
}

export interface CreateFinanceBillPayload {
  project_id: string;
  category: FinanceBillCategory;
  vendor_name: string;
  bill_date: string;
  due_date: string;
  amount: number;
  paid_amount?: number;
  proof_ref?: string;
  proof_attachment_id?: string;
  description: string;
}

export interface UpdateFinanceBillPayload {
  project_id?: string;
  category?: FinanceBillCategory;
  vendor_name?: string;
  bill_date?: string;
  due_date?: string;
  amount?: number;
  proof_ref?: string;
  proof_attachment_id?: string | null;
  description?: string;
}

export interface PayFinanceBillPayload {
  pay_amount: number;
  payment_date: string;
  proof_ref?: string;
  proof_attachment_id?: string;
  note?: string;
}

export const financeApi = {
  async createTransaction(
    actor: ActorHeaders,
    payload: CreateFinanceTransactionPayload
  ): Promise<{ state: PMSState; transaction: FinancialTransaction }> {
    const res = await apiFetch('/api/finance/transactions', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateTransaction(
    actor: ActorHeaders,
    id: string,
    payload: UpdateFinanceTransactionPayload
  ): Promise<{ state: PMSState; transaction: FinancialTransaction }> {
    const res = await apiFetch(`/api/finance/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideTransaction(
    actor: ActorHeaders,
    id: string,
    decision: 'Terverifikasi' | 'Ditolak',
    note?: string
  ): Promise<{ state: PMSState; transaction: FinancialTransaction }> {
    const res = await apiFetch(`/api/finance/transactions/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ decision, note }),
    });
    return parseJson(res);
  },

  async deleteTransaction(
    actor: ActorHeaders,
    id: string
  ): Promise<{ ok: boolean; id: string; state: PMSState }> {
    const res = await apiFetch(`/api/finance/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(actor),
    });
    return parseJson(res);
  },

  async importTransactions(
    actor: ActorHeaders,
    rows: ImportFinanceTransactionRowPayload[]
  ): Promise<{ state: PMSState; importedCount: number }> {
    const res = await apiFetch('/api/finance/transactions/import', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ rows }),
    });
    return parseJson(res);
  },

  async createBill(
    actor: ActorHeaders,
    payload: CreateFinanceBillPayload
  ): Promise<{ state: PMSState; bill: FinanceBill }> {
    const res = await apiFetch('/api/finance/bills', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateBill(
    actor: ActorHeaders,
    id: string,
    payload: UpdateFinanceBillPayload
  ): Promise<{ state: PMSState; bill: FinanceBill }> {
    const res = await apiFetch(`/api/finance/bills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async payBill(
    actor: ActorHeaders,
    id: string,
    payload: PayFinanceBillPayload
  ): Promise<{ state: PMSState; bill: FinanceBill; transaction: FinancialTransaction }> {
    const res = await apiFetch(`/api/finance/bills/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async deleteBill(
    actor: ActorHeaders,
    id: string
  ): Promise<{ ok: boolean; id: string; state: PMSState }> {
    const res = await apiFetch(`/api/finance/bills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(actor),
    });
    return parseJson(res);
  },
};
