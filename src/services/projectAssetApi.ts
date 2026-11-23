import {
  PMSState,
  ProjectAsset,
  ProjectAssetCondition,
  ProjectAssetReport,
  ProjectAssetReportStatus,
  ProjectAssetReportType,
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
    throw new Error(data.message || `Gagal memproses permintaan aset proyek (HTTP ${res.status})`);
  }
  return data;
}

export interface CreateProjectAssetPayload {
  id?: string;
  asset_code?: string;
  project_id: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  recorded_date: string;
  initial_condition: ProjectAssetCondition;
  notes?: string;
  photo_attachment_id?: string;
}

export interface UpdateProjectAssetPayload {
  project_id?: string;
  name?: string;
  category?: string;
  unit?: string;
  recorded_date?: string;
  qty_available?: number;
  qty_damaged?: number;
  qty_lost?: number;
  notes?: string;
  photo_attachment_id?: string;
}

export interface CreateProjectAssetReportPayload {
  id?: string;
  project_id: string;
  asset_id: string;
  report_type: ProjectAssetReportType;
  affected_qty: number;
  incident_date: string;
  chronology: string;
  photo_attachment_id?: string;
}

export interface ResubmitProjectAssetReportPayload {
  affected_qty: number;
  incident_date: string;
  chronology: string;
  photo_attachment_id?: string;
}

export interface ReviewProjectAssetReportPayload {
  status: ProjectAssetReportStatus;
  follow_up_note?: string;
  approved_qty?: number;
}

export const projectAssetApi = {
  async createAsset(
    actor: ActorHeaders,
    payload: CreateProjectAssetPayload
  ): Promise<{ state: PMSState; asset: ProjectAsset }> {
    const res = await apiFetch('/api/project-assets', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateAsset(
    actor: ActorHeaders,
    id: string,
    payload: UpdateProjectAssetPayload
  ): Promise<{ state: PMSState; asset: ProjectAsset }> {
    const res = await apiFetch(`/api/project-assets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createReport(
    actor: ActorHeaders,
    payload: CreateProjectAssetReportPayload
  ): Promise<{ state: PMSState; report: ProjectAssetReport }> {
    const res = await apiFetch('/api/project-assets/reports', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async resubmitReport(
    actor: ActorHeaders,
    id: string,
    payload: ResubmitProjectAssetReportPayload
  ): Promise<{ state: PMSState; report: ProjectAssetReport }> {
    const res = await apiFetch(`/api/project-assets/reports/${encodeURIComponent(id)}/resubmit`, {
      method: 'PATCH',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async reviewReport(
    actor: ActorHeaders,
    id: string,
    payload: ReviewProjectAssetReportPayload
  ): Promise<{ state: PMSState; report: ProjectAssetReport; asset: ProjectAsset }> {
    const res = await apiFetch(`/api/project-assets/reports/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async deleteAsset(
    actor: ActorHeaders,
    id: string
  ): Promise<{ ok: boolean; id: string; state: PMSState }> {
    const res = await apiFetch(`/api/project-assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(actor),
    });
    return parseJson(res);
  },
};
