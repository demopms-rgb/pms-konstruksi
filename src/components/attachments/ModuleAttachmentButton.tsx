import React from 'react';
import { Camera, FileUp, ImagePlus, Paperclip } from 'lucide-react';
import { useAttachments } from '../../context/AttachmentContext';
import { AttachmentCategory } from '../../types/attachment';
import { ModuleKey } from '../../types/pms';
import { Modal } from '../ui/CommonUI';
import { AttachmentPanel } from './AttachmentPanel';

interface ModuleAttachmentToolbarProps {
  moduleId: ModuleKey;
  entityId: string;
  entityLabel: string;
  title: string;
  subtitle?: string;
  defaultCategory?: AttachmentCategory;
  compact?: boolean;
}

export const ModuleAttachmentToolbar: React.FC<ModuleAttachmentToolbarProps> = ({
  moduleId,
  entityId,
  entityLabel,
  title,
  subtitle,
  defaultCategory = 'Lampiran Umum',
  compact = false,
}) => {
  const { getAttachmentsFor, openAttachmentModal } = useAttachments();
  const count = getAttachmentsFor(moduleId, entityId).length;

  const open = (initialMode: 'all' | 'document' | 'photo' | 'camera' = 'all') =>
    openAttachmentModal({
      moduleId,
      entityId,
      entityLabel,
      title,
      subtitle,
      defaultCategory,
      initialMode,
    });

  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open('all');
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#13233C] bg-slate-100 hover:bg-blue-50 hover:text-[#1D7AFC] border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
        title="Upload & Lihat Lampiran Dokumen / Foto"
      >
        <Paperclip className="w-3.5 h-3.5 text-[#1D7AFC]" />
        <span>Lampiran</span>
        {count > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-[#1D7AFC] text-white font-mono text-[10px] tabular-nums">
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => open('document')}
        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer whitespace-nowrap"
      >
        <FileUp className="w-3.5 h-3.5 text-[#1D7AFC]" />
        <span>Upload Dokumen</span>
      </button>
      <button
        type="button"
        onClick={() => open('photo')}
        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer whitespace-nowrap"
      >
        <ImagePlus className="w-3.5 h-3.5 text-emerald-600" />
        <span>Upload Foto</span>
      </button>
      <button
        type="button"
        onClick={() => open('camera')}
        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#13233C] bg-[#FBC02D] hover:bg-[#F59E0B] rounded-xl cursor-pointer whitespace-nowrap"
      >
        <Camera className="w-3.5 h-3.5" />
        <span>Tambah Lampiran</span>
      </button>
      <button
        type="button"
        onClick={() => open('all')}
        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#13233C] hover:bg-[#1D304D] rounded-xl cursor-pointer whitespace-nowrap"
      >
        <Paperclip className="w-3.5 h-3.5 text-[#FBC02D]" />
        <span>Lihat Lampiran ({count})</span>
      </button>
    </div>
  );
};

export const GlobalAttachmentModal: React.FC = () => {
  const { modalTarget, closeAttachmentModal } = useAttachments();
  return (
    <Modal
      open={Boolean(modalTarget)}
      onClose={closeAttachmentModal}
      title={modalTarget?.title ?? 'Kelola Lampiran'}
      subtitle={modalTarget?.subtitle ?? modalTarget?.entityLabel}
      maxWidth="max-w-4xl"
    >
      {modalTarget && (
        <AttachmentPanel
          moduleId={modalTarget.moduleId}
          entityId={modalTarget.entityId}
          entityLabel={modalTarget.entityLabel}
          defaultCategory={modalTarget.defaultCategory}
        />
      )}
    </Modal>
  );
};
