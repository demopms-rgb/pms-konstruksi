import { AttachmentMetadata, FileAuditLog, UploadConfig } from '../types/attachment';
import { DivisionCode, ModuleKey, RoleCode } from '../types/pms';

export interface ActorHeaders {
  employeeId: string;
  nik: string;
  roleCode: RoleCode;
  divisionCode: DivisionCode;
  divisionId: string;
  fullName: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function resolveApiUrl(path: string): string {
  if (!API_BASE) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
}

export function buildActorHeaders(actor: ActorHeaders): Record<string, string> {
  return {
    'x-pms-employee-id': actor.employeeId,
    'x-pms-nik': actor.nik,
    'x-pms-role': actor.roleCode,
    'x-pms-division': actor.divisionCode,
    'x-pms-division-id': actor.divisionId,
    'x-pms-name': encodeURIComponent(actor.fullName || ''),
    'x-pms-name-encoded': '1',
  };
}

function buildHeaders(actor: ActorHeaders): Record<string, string> {
  return buildActorHeaders(actor);
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Gagal memproses permintaan (${res.status})`);
  }
  return data;
}

export const attachmentApi = {
  async list(
    actor: ActorHeaders,
    filters?: { module_id?: ModuleKey; entity_id?: string; category?: string; search?: string }
  ): Promise<AttachmentMetadata[]> {
    const params = new URLSearchParams();
    if (filters?.module_id) params.set('module_id', filters.module_id);
    if (filters?.entity_id) params.set('entity_id', filters.entity_id);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    const res = await fetch(resolveApiUrl(`/api/attachments${qs ? `?${qs}` : ''}`), {
      headers: buildHeaders(actor),
    });
    const data = await parseJsonOrThrow<{ attachments: AttachmentMetadata[] }>(res);
    return data.attachments;
  },

  uploadWithProgress(
    actor: ActorHeaders,
    params: {
      files: File[];
      module_id: ModuleKey;
      entity_id: string;
      entity_label?: string;
      doc_category: string;
      description: string;
      division_id: string;
    },
    onProgress: (percent: number) => void
  ): Promise<AttachmentMetadata[]> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('module_id', params.module_id);
      formData.append('entity_id', params.entity_id);
      if (params.entity_label) formData.append('entity_label', params.entity_label);
      formData.append('doc_category', params.doc_category);
      formData.append('description', params.description);
      formData.append('division_id', params.division_id);
      params.files.forEach((f) => formData.append('files', f));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveApiUrl('/api/attachments/upload'));
      const headers = buildHeaders(actor);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            attachments?: AttachmentMetadata[];
            message?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && parsed.attachments) {
            onProgress(100);
            resolve(parsed.attachments);
          } else {
            reject(new Error(parsed.message || `Upload gagal (HTTP ${xhr.status})`));
          }
        } catch {
          reject(new Error('Respons server upload tidak valid.'));
        }
      };

      xhr.onerror = () => reject(new Error('Koneksi ke server penyimpanan gagal.'));
      xhr.send(formData);
    });
  },

  uploadNewVersion(
    actor: ActorHeaders,
    attachmentId: string,
    file: File,
    note: string,
    onProgress: (percent: number) => void
  ): Promise<AttachmentMetadata> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('note', note);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveApiUrl(`/api/attachments/${attachmentId}/version`));
      const headers = buildHeaders(actor);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            attachment?: AttachmentMetadata;
            message?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && parsed.attachment) {
            onProgress(100);
            resolve(parsed.attachment);
          } else {
            reject(new Error(parsed.message || 'Gagal mengunggah versi terbaru.'));
          }
        } catch {
          reject(new Error('Respons server versi baru tidak valid.'));
        }
      };

      xhr.onerror = () => reject(new Error('Koneksi ke server terputus.'));
      xhr.send(formData);
    });
  },

  async updateMetadata(
    actor: ActorHeaders,
    id: string,
    payload: {
      description?: string;
      doc_category?: string;
      status?: 'Aktif' | 'Diarsipkan';
      delete_reason?: string;
    }
  ): Promise<AttachmentMetadata> {
    const res = await fetch(resolveApiUrl(`/api/attachments/${id}`), {
      method: 'PATCH',
      headers: {
        ...buildHeaders(actor),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonOrThrow<{ attachment: AttachmentMetadata }>(res);
    return data.attachment;
  },

  async remove(actor: ActorHeaders, id: string): Promise<void> {
    const res = await fetch(resolveApiUrl(`/api/attachments/${id}`), {
      method: 'DELETE',
      headers: buildHeaders(actor),
    });
    await parseJsonOrThrow<{ ok: boolean }>(res);
  },

  async getSignedUrl(
    actor: ActorHeaders,
    id: string,
    disposition: 'inline' | 'attachment' = 'inline'
  ): Promise<string> {
    const res = await fetch(
      resolveApiUrl(`/api/attachments/${id}/sign?disposition=${disposition}`),
      {
        headers: buildHeaders(actor),
      }
    );
    const data = await parseJsonOrThrow<{ url: string }>(res);
    return resolveApiUrl(data.url);
  },

  async getConfig(actor: ActorHeaders): Promise<{
    config: UploadConfig;
    stats: { totalFiles: number; totalBytes: number; masterAllowedExtensions: string[] };
  }> {
    const res = await fetch(resolveApiUrl('/api/attachments/config'), {
      headers: buildHeaders(actor),
    });
    return parseJsonOrThrow(res);
  },

  async updateConfig(
    actor: ActorHeaders,
    payload: Partial<UploadConfig>
  ): Promise<{ config: UploadConfig }> {
    const res = await fetch(resolveApiUrl('/api/attachments/config'), {
      method: 'PUT',
      headers: {
        ...buildHeaders(actor),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow(res);
  },

  async getAuditLogs(actor: ActorHeaders): Promise<FileAuditLog[]> {
    const res = await fetch(resolveApiUrl('/api/attachments/audit'), {
      headers: buildHeaders(actor),
    });
    const data = await parseJsonOrThrow<{ logs: FileAuditLog[] }>(res);
    return data.logs;
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
