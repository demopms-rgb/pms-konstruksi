import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, RotateCcw } from 'lucide-react';
import { useAttachments } from '../../context/AttachmentContext';
import { AttachmentMetadata } from '../../types/attachment';
import { fetchVerifiedAttachmentBytes } from '../../utils/pdfUtils';

interface ProtectedAttachmentImageProps {
  attachment: AttachmentMetadata;
  className?: string;
}

function getCanonicalImgMime(ext: string, detectedMime?: string): string {
  if (detectedMime && detectedMime.startsWith('image/')) return detectedMime;
  const e = ext.toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export const ProtectedAttachmentImage: React.FC<ProtectedAttachmentImageProps> = ({
  attachment,
  className = 'w-full h-full object-cover',
}) => {
  const { actorHeaders, getSignedUrl } = useAttachments();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!actorHeaders) {
      setStatus('loading');
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    const loadImage = async () => {
      setStatus('loading');
      setErrorDetail('');
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      try {
        const signedUrl = await getSignedUrl(attachment.id, 'inline');
        if (cancelled) return;
        const { bytes, mimeType } = await fetchVerifiedAttachmentBytes(
          signedUrl,
          attachment.extension
        );
        if (cancelled) return;

        const blob = new Blob([bytes.slice()], {
          type: getCanonicalImgMime(attachment.extension, mimeType),
        });
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
        setStatus('loaded');
      } catch (err) {
        if (cancelled) return;
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setErrorDetail(err instanceof Error ? err.message : 'Gagal memuat foto');
        setStatus('error');
      }
    };

    loadImage();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [actorHeaders, attachment.id, attachment.version, attachment.storage_name, attachment.extension, getSignedUrl, reloadNonce]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  if (status === 'loaded' && objectUrl) {
    return (
      <img
        src={objectUrl}
        alt=""
        draggable={false}
        onError={() => {
          setErrorDetail('Format gambar tidak dapat dirender oleh browser.');
          setStatus('error');
        }}
        className={className}
      />
    );
  }

  if (status === 'error') {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-slate-100 text-slate-500 p-3 text-center"
        title={errorDetail || 'Foto tidak dapat dimuat'}
      >
        <ImageIcon className="w-6 h-6 text-slate-400" />
        <span className="text-[11px] font-semibold text-slate-600">Foto gagal dimuat</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setReloadNonce((n) => n + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              setReloadNonce((n) => n + 1);
            }
          }}
          className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[10px] font-semibold text-[#1D7AFC] hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Muat Ulang</span>
        </span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-slate-100 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin text-[#1D7AFC]" />
      <span className="text-[10px] font-medium text-slate-500">Memuat foto...</span>
    </div>
  );
};
