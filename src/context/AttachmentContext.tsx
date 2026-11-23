import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePMS } from './PMSContext';
import { ActorHeaders, attachmentApi } from '../services/attachmentApi';
import {
  AttachmentCategory,
  AttachmentMetadata,
  FileAuditLog,
  UploadConfig,
} from '../types/attachment';
import { ModuleKey } from '../types/pms';

export const IMAGE_ATTACHMENT_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'jfif']);

export function isStaticSamplePhotoUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('/src/assets/images/');
}

export function isImageAttachment(att: AttachmentMetadata): boolean {
  return IMAGE_ATTACHMENT_EXTS.has((att.extension || '').toLowerCase());
}

export interface ActiveAttachmentModalTarget {
  moduleId: ModuleKey;
  entityId: string;
  entityLabel: string;
  title: string;
  subtitle?: string;
  defaultCategory?: AttachmentCategory;
  initialMode?: 'all' | 'document' | 'photo' | 'camera';
}

interface AttachmentContextValue {
  attachments: AttachmentMetadata[];
  uploadConfig: UploadConfig;
  storageStats: { totalFiles: number; totalBytes: number; masterAllowedExtensions: string[] };
  auditLogs: FileAuditLog[];
  loading: boolean;
  actorHeaders: ActorHeaders | null;
  refreshAttachments: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshAuditLogs: () => Promise<void>;
  getAttachmentsFor: (moduleId: ModuleKey, entityId?: string) => AttachmentMetadata[];
  getArchivedAttachmentsFor: (moduleId: ModuleKey, entityId?: string) => AttachmentMetadata[];
  getLatestPhotoFor: (moduleId: ModuleKey, entityId: string) => AttachmentMetadata | null;
  uploadFiles: (params: {
    files: File[];
    module_id: ModuleKey;
    entity_id: string;
    entity_label?: string;
    doc_category: AttachmentCategory;
    description: string;
    onProgress: (percent: number) => void;
  }) => Promise<AttachmentMetadata[]>;
  uploadNewVersion: (
    attachmentId: string,
    file: File,
    note: string,
    onProgress: (percent: number) => void
  ) => Promise<AttachmentMetadata>;
  updateAttachmentMeta: (
    id: string,
    payload: {
      description?: string;
      doc_category?: AttachmentCategory;
      status?: 'Aktif' | 'Diarsipkan';
      delete_reason?: string;
    }
  ) => Promise<AttachmentMetadata>;
  archiveAttachment: (id: string, reason?: string) => Promise<AttachmentMetadata>;
  restoreAttachment: (id: string) => Promise<AttachmentMetadata>;
  deleteAttachment: (id: string) => Promise<void>;
  getSignedUrl: (id: string, disposition?: 'inline' | 'attachment') => Promise<string>;
  updateUploadConfig: (payload: Partial<UploadConfig>) => Promise<void>;
  modalTarget: ActiveAttachmentModalTarget | null;
  openAttachmentModal: (target: ActiveAttachmentModalTarget) => void;
  closeAttachmentModal: () => void;
}

const DEFAULT_CONFIG: UploadConfig = {
  maxFileSizeMb: 15,
  maxFilesPerBatch: 10,
  allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'],
  requireDescription: false,
  updatedAt: '',
  updatedBy: 'Sistem',
};

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

export const AttachmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, currentRole, currentDivision, isOnline, showToast } = usePMS();

  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>(DEFAULT_CONFIG);
  const [storageStats, setStorageStats] = useState({
    totalFiles: 0,
    totalBytes: 0,
    masterAllowedExtensions: DEFAULT_CONFIG.allowedExtensions,
  });
  const [auditLogs, setAuditLogs] = useState<FileAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalTarget, setModalTarget] = useState<ActiveAttachmentModalTarget | null>(null);

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

  const refreshAttachments = useCallback(async () => {
    if (!actorHeaders) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    try {
      const list = await attachmentApi.list(actorHeaders);
      setAttachments(list);
    } catch {
      // keep previous list if offline
    } finally {
      setLoading(false);
    }
  }, [actorHeaders]);

  const refreshConfig = useCallback(async () => {
    if (!actorHeaders) return;
    try {
      const res = await attachmentApi.getConfig(actorHeaders);
      setUploadConfig(res.config);
      setStorageStats(res.stats);
    } catch {
      // ignore offline
    }
  }, [actorHeaders]);

  const refreshAuditLogs = useCallback(async () => {
    if (!actorHeaders) return;
    try {
      const logs = await attachmentApi.getAuditLogs(actorHeaders);
      setAuditLogs(logs);
    } catch {
      // ignore offline
    }
  }, [actorHeaders]);

  useEffect(() => {
    refreshAttachments();
    refreshConfig();
    refreshAuditLogs();
  }, [refreshAttachments, refreshConfig, refreshAuditLogs]);

  const getAttachmentsFor = useCallback(
    (moduleId: ModuleKey, entityId?: string) => {
      return attachments.filter((a) => {
        if (a.status === 'Diarsipkan') return false;
        if (a.module_id !== moduleId) return false;
        if (entityId && a.entity_id !== entityId) return false;
        return true;
      });
    },
    [attachments]
  );

  const getArchivedAttachmentsFor = useCallback(
    (moduleId: ModuleKey, entityId?: string) => {
      return attachments.filter((a) => {
        if (a.status !== 'Diarsipkan') return false;
        if (a.module_id !== moduleId) return false;
        if (entityId && a.entity_id !== entityId) return false;
        return true;
      });
    },
    [attachments]
  );

  const getLatestPhotoFor = useCallback(
    (moduleId: ModuleKey, entityId: string): AttachmentMetadata | null => {
      if (!entityId) return null;
      const candidates = attachments.filter(
        (a) =>
          a.status !== 'Diarsipkan' &&
          a.module_id === moduleId &&
          a.entity_id === entityId &&
          isImageAttachment(a)
      );
      if (candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) => {
        const ta = new Date(a.uploaded_at || 0).getTime() || 0;
        const tb = new Date(b.uploaded_at || 0).getTime() || 0;
        if (tb !== ta) return tb - ta;
        return (b.version || 1) - (a.version || 1);
      });
      return sorted[0] ?? null;
    },
    [attachments]
  );

  const uploadFiles: AttachmentContextValue['uploadFiles'] = async (params) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    if (!isOnline) {
      throw new Error('Mode Offline aktif: Nonaktifkan simulasi offline atau sambungkan internet untuk mengunggah file ke server.');
    }
    const created = await attachmentApi.uploadWithProgress(
      actorHeaders,
      {
        ...params,
        division_id: actorHeaders.divisionId,
      },
      params.onProgress
    );
    setAttachments((prev) => {
      const createdIds = new Set(created.map((c) => c.id));
      return [...created, ...prev.filter((p) => !createdIds.has(p.id))];
    });
    void refreshAttachments();
    refreshConfig();
    refreshAuditLogs();
    showToast(`${created.length} lampiran berhasil diunggah ke server.`);
    return created;
  };

  const uploadNewVersion: AttachmentContextValue['uploadNewVersion'] = async (
    attachmentId,
    file,
    note,
    onProgress
  ) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    if (!isOnline) throw new Error('Koneksi internet diperlukan untuk memperbarui versi dokumen.');
    const updated = await attachmentApi.uploadNewVersion(actorHeaders, attachmentId, file, note, onProgress);
    setAttachments((prev) => prev.map((a) => (a.id === attachmentId ? updated : a)));
    refreshConfig();
    refreshAuditLogs();
    showToast(`Versi terbaru (v${updated.version}) berhasil disimpan.`);
    return updated;
  };

  const updateAttachmentMeta: AttachmentContextValue['updateAttachmentMeta'] = async (id, payload) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    const updated = await attachmentApi.updateMetadata(actorHeaders, id, payload);
    setAttachments((prev) => prev.map((a) => (a.id === id ? updated : a)));
    refreshAuditLogs();
    showToast('Keterangan lampiran berhasil diperbarui.');
    return updated;
  };

  const archiveAttachment: AttachmentContextValue['archiveAttachment'] = async (id, reason) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    const updated = await attachmentApi.updateMetadata(actorHeaders, id, {
      status: 'Diarsipkan',
      delete_reason: reason?.trim() || 'Diarsipkan oleh pengguna',
    });
    setAttachments((prev) => prev.map((a) => (a.id === id ? updated : a)));
    refreshAuditLogs();
    showToast('Dokumen diarsipkan dengan aman dan dapat dipulihkan oleh admin.');
    return updated;
  };

  const restoreAttachment: AttachmentContextValue['restoreAttachment'] = async (id) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    const updated = await attachmentApi.updateMetadata(actorHeaders, id, {
      status: 'Aktif',
    });
    setAttachments((prev) => prev.map((a) => (a.id === id ? updated : a)));
    refreshAuditLogs();
    showToast('Dokumen berhasil dipulihkan dari arsip.');
    return updated;
  };

  const deleteAttachment: AttachmentContextValue['deleteAttachment'] = async (id) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    await attachmentApi.remove(actorHeaders, id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    refreshConfig();
    refreshAuditLogs();
    showToast('Lampiran berhasil dihapus permanen dari penyimpanan.');
  };

  const getSignedUrl: AttachmentContextValue['getSignedUrl'] = useCallback(
    async (id, disposition = 'inline') => {
      if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
      return attachmentApi.getSignedUrl(actorHeaders, id, disposition);
    },
    [actorHeaders]
  );

  const updateUploadConfig: AttachmentContextValue['updateUploadConfig'] = async (payload) => {
    if (!actorHeaders) throw new Error('Sesi pengguna tidak aktif.');
    const res = await attachmentApi.updateConfig(actorHeaders, payload);
    setUploadConfig(res.config);
    refreshAuditLogs();
    showToast('Konfigurasi upload & batas ukuran file diperbarui.');
  };

  return (
    <AttachmentContext.Provider
      value={{
        attachments,
        uploadConfig,
        storageStats,
        auditLogs,
        loading,
        actorHeaders,
        refreshAttachments,
        refreshConfig,
        refreshAuditLogs,
        getAttachmentsFor,
        getArchivedAttachmentsFor,
        getLatestPhotoFor,
        uploadFiles,
        uploadNewVersion,
        updateAttachmentMeta,
        archiveAttachment,
        restoreAttachment,
        deleteAttachment,
        getSignedUrl,
        updateUploadConfig,
        modalTarget,
        openAttachmentModal: (target) => setModalTarget(target),
        closeAttachmentModal: () => setModalTarget(null),
      }}
    >
      {children}
    </AttachmentContext.Provider>
  );
};

export function useAttachments(): AttachmentContextValue {
  const ctx = useContext(AttachmentContext);
  if (!ctx) throw new Error('useAttachments harus digunakan di dalam AttachmentProvider');
  return ctx;
}
