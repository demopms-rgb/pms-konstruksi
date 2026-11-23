import {
  DocumentStatus,
  DocumentType,
  InternalDocument,
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
    throw new Error(data.message || `Gagal memproses permintaan dokumen (HTTP ${res.status})`);
  }
  return data;
}

export interface CreateDocumentPayload {
  doc_type: DocumentType;
  doc_number?: string;
  doc_date?: string;
  project_id?: string;
  title: string;
  details: string;
  items_summary?: string;
  attachment_name?: string;
  recipient_name?: string;
  reference_code?: string;
  amount_value?: number;
  effective_date?: string;
  metadata?: Record<string, string>;
  submit_mode?: 'draft' | 'submit' | 'complete';
  draft_attachment_entity_id?: string;
}

export interface UpdateDocumentPayload {
  doc_type?: DocumentType;
  doc_date?: string;
  project_id?: string;
  title?: string;
  details?: string;
  items_summary?: string;
  attachment_name?: string;
  recipient_name?: string;
  reference_code?: string;
  amount_value?: number;
  effective_date?: string;
  metadata?: Record<string, string>;
}

export interface AdvanceDocumentPayload {
  next_status: DocumentStatus;
  note?: string;
  electronic_signature_data_url?: string;
}

export interface ReviseDocumentPayload {
  reason: string;
  title?: string;
  details?: string;
  items_summary?: string;
  recipient_name?: string;
  amount_value?: number;
  resubmit?: boolean;
}

export const documentApi = {
  async create(
    actor: ActorHeaders,
    payload: CreateDocumentPayload
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch('/api/documents', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async update(
    actor: ActorHeaders,
    id: string,
    payload: UpdateDocumentPayload
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async advance(
    actor: ActorHeaders,
    id: string,
    payload: AdvanceDocumentPayload
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}/advance`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async revise(
    actor: ActorHeaders,
    id: string,
    payload: ReviseDocumentPayload
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}/revise`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async archive(
    actor: ActorHeaders,
    id: string,
    reason: string
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async restore(
    actor: ActorHeaders,
    id: string
  ): Promise<{ state: PMSState; document: InternalDocument }> {
    const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({}),
    });
    return parseJson(res);
  },
};
