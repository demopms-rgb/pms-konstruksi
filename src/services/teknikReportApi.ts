import {
  PMSState,
  TeknikChangeReport,
  TeknikChangeStatus,
  TeknikCompletionInspectionResult,
  TeknikCompletionReport,
  TeknikCompletionStatus,
  TeknikConformanceStatus,
  TeknikConstraintRecord,
  TeknikEvaluationReport,
  TeknikFollowUpStatus,
  TeknikProgressAssessment,
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
    throw new Error(data.message || `Gagal memproses laporan Teknik (HTTP ${res.status})`);
  }
  return data;
}

export interface SaveTeknikEvaluationPayload {
  id?: string;
  project_id: string;
  evaluation_date: string;
  work_package: string;
  drawing_spec_compliance: TeknikConformanceStatus;
  non_conformance_findings: string;
  volume_spec_changes: string;
  recommendation: string;
  follow_up_action: string;
  status: TeknikFollowUpStatus;
  attachment_ids?: string[];
}

export interface SaveTeknikConstraintPayload {
  id?: string;
  project_id: string;
  source_type: 'Lapangan' | 'WorkItem' | 'Teknik';
  source_ref_id?: string;
  reported_date: string;
  reported_by_name?: string;
  work_area: string;
  problem_description: string;
  technical_analysis: string;
  follow_up_action: string;
  pic_name: string;
  target_resolution_date?: string;
  status: TeknikFollowUpStatus;
}

export interface SaveTeknikChangePayload {
  id?: string;
  project_id: string;
  change_date: string;
  change_category: 'Lingkup Pekerjaan' | 'Volume Pekerjaan' | 'Kebutuhan Material' | 'Spesifikasi Teknis';
  scope_change: string;
  volume_material_change: string;
  reason: string;
  technical_notes: string;
  attachment_ids?: string[];
}

export interface SaveTeknikCompletionPayload {
  id?: string;
  project_id: string;
  inspection_date: string;
  completed_work_summary: string;
  inspection_result: TeknikCompletionInspectionResult;
  defects_and_notes: string;
  follow_up_action: string;
  status: TeknikCompletionStatus;
  attachment_ids?: string[];
}

export interface SaveTeknikProgressAssessmentPayload {
  id?: string;
  project_id: string;
  period_month: string;
  evaluation_date: string;
  target_progress_percent: number;
  teknik_progress_percent: number;
  quality_score: number;
  notes: string;
}

export const teknikReportApi = {
  async saveEvaluation(
    actor: ActorHeaders,
    payload: SaveTeknikEvaluationPayload
  ): Promise<{ state: PMSState; evaluation: TeknikEvaluationReport }> {
    const res = await apiFetch('/api/teknik/evaluations', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async saveConstraint(
    actor: ActorHeaders,
    payload: SaveTeknikConstraintPayload
  ): Promise<{ state: PMSState; constraint: TeknikConstraintRecord }> {
    const res = await apiFetch('/api/teknik/constraints', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async saveChangeReport(
    actor: ActorHeaders,
    payload: SaveTeknikChangePayload
  ): Promise<{ state: PMSState; change: TeknikChangeReport }> {
    const res = await apiFetch('/api/teknik/changes', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideChangeReport(
    actor: ActorHeaders,
    id: string,
    decision: Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>,
    review_note: string
  ): Promise<{ state: PMSState; change: TeknikChangeReport }> {
    const res = await apiFetch(`/api/teknik/changes/${id}/decide`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ decision, review_note }),
    });
    return parseJson(res);
  },

  async saveCompletionReport(
    actor: ActorHeaders,
    payload: SaveTeknikCompletionPayload
  ): Promise<{ state: PMSState; completion: TeknikCompletionReport }> {
    const res = await apiFetch('/api/teknik/completions', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async verifyCompletionReport(
    actor: ActorHeaders,
    id: string,
    follow_up_action?: string
  ): Promise<{ state: PMSState; completion: TeknikCompletionReport }> {
    const res = await apiFetch(`/api/teknik/completions/${id}/verify`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ follow_up_action }),
    });
    return parseJson(res);
  },

  async saveProgressAssessment(
    actor: ActorHeaders,
    payload: SaveTeknikProgressAssessmentPayload
  ): Promise<{ state: PMSState; assessment: TeknikProgressAssessment }> {
    const res = await apiFetch('/api/teknik/progress-assessments', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },
};
