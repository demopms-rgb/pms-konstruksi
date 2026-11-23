import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  downloadBinaryFile,
  downloadPdfBytes,
  fetchVerifiedAttachmentBytes,
  validatePdfBytes,
} from '../../utils/pdfUtils';
import { Modal } from './CommonUI';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fileName: string;
  fileExtension?: string;
  sourceBytes?: Uint8Array | null;
  sourceUrl?: string | null;
  downloadUrl?: string | null;
  description?: string;
  onDownloadComplete?: (fileName: string) => void;
  onPrint?: () => void;
  onError?: (message: string) => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  fileName,
  fileExtension = 'pdf',
  sourceBytes = null,
  sourceUrl = null,
  downloadUrl = null,
  description,
  onDownloadComplete,
  onPrint,
  onError,
}) => {
  const ext = fileExtension.toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = ext === 'pdf' || (!ext && !isImage && Boolean(sourceBytes));

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedBytes, setVerifiedBytes] = useState<Uint8Array | null>(null);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const [renderingPage, setRenderingPage] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load & verify binary source when modal opens
  useEffect(() => {
    if (!open) {
      setErrorMsg(null);
      setLoading(false);
      setCurrentPage(1);
      setNumPages(0);
      setVerifiedBytes(null);
      if (docRef.current) {
        const prevDoc = docRef.current as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
        void (prevDoc.destroy?.() ?? prevDoc.cleanup?.() ?? Promise.resolve()).catch(() => {});
        docRef.current = null;
      }
      setPdfDoc(null);
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
        setImageObjectUrl(null);
      }
      return;
    }

    let cancelled = false;
    let createdBlobUrl: string | null = null;

    const loadDocument = async () => {
      setLoading(true);
      setErrorMsg(null);
      setCurrentPage(1);
      setNumPages(0);

      try {
        let bytes: Uint8Array;
        let mimeType = isPdf ? 'application/pdf' : 'application/octet-stream';

        if (sourceBytes) {
          if (isPdf) validatePdfBytes(sourceBytes);
          bytes = sourceBytes.slice();
        } else if (sourceUrl) {
          const fetched = await fetchVerifiedAttachmentBytes(sourceUrl, ext);
          bytes = fetched.bytes;
          mimeType = fetched.mimeType;
        } else {
          throw new Error('Sumber dokumen tidak tersedia.');
        }

        if (cancelled) return;
        setVerifiedBytes(bytes);

        if (isImage) {
          const blob = new Blob([bytes.slice()], { type: mimeType });
          createdBlobUrl = URL.createObjectURL(blob);
          setImageObjectUrl(createdBlobUrl);
          setLoading(false);
          return;
        }

        if (isPdf) {
          // Pass a copy (.slice()) because PDF.js worker transfers/detaches the ArrayBuffer
          const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
          const loadedDoc = await loadingTask.promise;
          if (cancelled) {
            const cancellable = loadedDoc as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
            void (cancellable.destroy?.() ?? cancellable.cleanup?.() ?? Promise.resolve()).catch(() => {});
            return;
          }
          if (docRef.current) {
            const prevDoc = docRef.current as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
            void (prevDoc.destroy?.() ?? prevDoc.cleanup?.() ?? Promise.resolve()).catch(() => {});
          }
          docRef.current = loadedDoc;
          setPdfDoc(loadedDoc);
          setNumPages(loadedDoc.numPages);
          setCurrentPage(1);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Gagal memuat pratinjau dokumen.';
        setErrorMsg(msg);
        setLoading(false);
        onError?.(msg);
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [open, sourceBytes, sourceUrl, ext, isPdf, isImage]);

  // Render active page to canvas via PDF.js
  useEffect(() => {
    if (!open || !pdfDoc || !canvasRef.current || currentPage < 1 || currentPage > pdfDoc.numPages) {
      return;
    }

    let cancelled = false;
    const renderPage = async () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }

      setRenderingPage(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom });
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderContext = {
          canvasContext: context,
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== 'RenderingCancelledException' && !cancelled) {
          const msg = err instanceof Error ? err.message : 'Gagal merender halaman PDF.';
          setErrorMsg(msg);
          onError?.(msg);
        }
      } finally {
        if (!cancelled) {
          setRenderingPage(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [open, pdfDoc, currentPage, zoom]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (verifiedBytes) {
        if (isPdf) {
          downloadPdfBytes(verifiedBytes, fileName);
        } else {
          downloadBinaryFile(verifiedBytes, 'application/octet-stream', fileName);
        }
        onDownloadComplete?.(fileName);
        return;
      }
      const targetUrl = downloadUrl || sourceUrl;
      if (!targetUrl) {
        throw new Error('Dokumen tidak memiliki sumber unduhan.');
      }
      const fetched = await fetchVerifiedAttachmentBytes(targetUrl, ext);
      downloadBinaryFile(fetched.bytes, fetched.mimeType, fileName);
      onDownloadComplete?.(fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh dokumen.';
      setErrorMsg(msg);
      onError?.(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-3 text-xs">
        {/* Viewer Toolbar */}
        {isPdf && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!pdfDoc || currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>
              <span className="px-2.5 py-1 font-mono font-semibold text-slate-800 tabular-nums">
                {numPages > 0 ? `Halaman ${currentPage} dari ${numPages}` : 'Memuat...'}
              </span>
              <button
                type="button"
                disabled={!pdfDoc || currentPage >= numPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!pdfDoc || zoom <= 0.65}
                onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                title="Perkecil"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-12 text-center font-mono font-semibold text-slate-700 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                disabled={!pdfDoc || zoom >= 2.2}
                onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                title="Perbesar"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!pdfDoc}
                onClick={() => setZoom(1.15)}
                className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Viewport Container */}
        <div className="relative min-h-[420px] max-h-[66vh] overflow-auto rounded-xl border border-slate-200 bg-slate-800/95 flex items-start justify-center p-4">
          {loading && (
            <div className="self-center flex flex-col items-center gap-2 text-slate-200 py-16">
              <Loader2 className="w-7 h-7 animate-spin text-[#FBC02D]" />
              <span className="font-semibold">Memuat & memverifikasi dokumen...</span>
            </div>
          )}

          {!loading && errorMsg && (
            <div className="self-center max-w-md w-full bg-white rounded-xl p-5 text-center space-y-2.5 border border-red-200">
              <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
              <p className="font-bold text-slate-900">Dokumen Tidak Dapat Ditampilkan</p>
              <p className="text-slate-600 leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {!loading && !errorMsg && isImage && imageObjectUrl && (
            <img
              src={imageObjectUrl}
              alt={fileName}
              className="max-h-[60vh] w-auto object-contain rounded-lg shadow-lg bg-white"
            />
          )}

          {!loading && !errorMsg && isPdf && (
            <div className="relative inline-block">
              {renderingPage && (
                <div className="absolute inset-0 bg-slate-900/35 flex items-center justify-center rounded">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="rounded shadow-xl bg-white block mx-auto"
              />
            </div>
          )}

          {!loading && !errorMsg && !isPdf && !isImage && (
            <div className="self-center max-w-md w-full bg-white rounded-xl p-6 text-center space-y-2">
              <FileText className="w-8 h-8 text-[#1D7AFC] mx-auto" />
              <p className="font-bold text-slate-900">Pratinjau Langsung Tidak Tersedia</p>
              <p className="text-slate-600">
                Format .{ext.toUpperCase()} dapat diunduh langsung ke perangkat Anda menggunakan tombol di bawah.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <p className="text-slate-600 truncate max-w-md">
            {description || fileName}
          </p>
          <div className="flex items-center gap-2">
            {onPrint && (
              <button
                type="button"
                disabled={loading || Boolean(errorMsg)}
                onClick={onPrint}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak</span>
              </button>
            )}
            <button
              type="button"
              disabled={loading || downloading || Boolean(errorMsg)}
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isPdf ? 'Download PDF' : 'Unduh File'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
