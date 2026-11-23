import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, RotateCcw } from 'lucide-react';
import { formatDateTimeID } from '../../utils/format';

interface Point {
  x: number;
  y: number;
}

export interface SignaturePadProps {
  label: string;
  signerName: string;
  signerPosition: string;
  value?: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  signerName,
  signerPosition,
  value = '',
  onChange,
  disabled = false,
  height = 170,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [liveTimestamp, setLiveTimestamp] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveTimestamp(new Date().toISOString());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 480;
    const targetH = height;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(targetH * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(targetH * dpr);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, targetH);

    // Subtle baseline guide
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, targetH - 28);
    ctx.lineTo(width - 16, targetH - 28);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw all strokes
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = [
      ...strokesRef.current,
      ...(currentStrokeRef.current.length > 0 ? [currentStrokeRef.current] : []),
    ];

    for (const stroke of allStrokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      if (stroke.length === 1) {
        ctx.arc(stroke[0].x, stroke[0].y, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      } else {
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          const prev = stroke[i - 1];
          const curr = stroke[i];
          const mx = (prev.x + curr.x) / 2;
          const my = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
        }
        const last = stroke[stroke.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }, [height]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    if (!value && strokesRef.current.length > 0) {
      strokesRef.current = [];
      currentStrokeRef.current = [];
      setStrokeCount(0);
      redrawCanvas();
    }
  }, [value, redrawCanvas]);

  const exportSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      onChange('');
      return;
    }
    // Render crisp PNG without dashed guide line for PDF & archival display
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      if (stroke.length === 1) {
        ctx.arc(stroke[0].x, stroke[0].y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          const prev = stroke[i - 1];
          const curr = stroke[i];
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        }
        const last = stroke[stroke.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
    }
    onChange(exportCanvas.toDataURL('image/png'));
  }, [onChange]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(2, Math.min(rect.width - 2, e.clientX - rect.left)),
      y: Math.max(2, Math.min(rect.height - 2, e.clientY - rect.top)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    currentStrokeRef.current = [getPoint(e)];
    redrawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    e.preventDefault();
    currentStrokeRef.current.push(getPoint(e));
    redrawCanvas();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore pointer release mismatch
    }
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      currentStrokeRef.current = [];
      setStrokeCount(strokesRef.current.length);
      redrawCanvas();
      exportSignature();
    }
  };

  const handleUndo = () => {
    if (disabled || strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redrawCanvas();
    exportSignature();
  };

  const handleClear = () => {
    if (disabled) return;
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setStrokeCount(0);
    redrawCanvas();
    onChange('');
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#13233C]">
          <PenTool className="w-3.5 h-3.5 text-[#1D7AFC]" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || strokeCount === 0}
            onClick={handleUndo}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Ulangi</span>
          </button>
          <button
            type="button"
            disabled={disabled || strokeCount === 0}
            onClick={handleClear}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-45 cursor-pointer"
          >
            <Eraser className="w-3 h-3" />
            <span>Hapus</span>
          </button>
        </div>
      </div>

      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ height: `${height}px`, touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`w-full block ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-crosshair'}`}
        />
        {strokeCount === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-slate-400 text-center px-4">
              Tanda tangani di area ini menggunakan mouse, layar sentuh, atau stylus
            </p>
          </div>
        )}
      </div>

      {/* Auto-populated signer identity & timestamp */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px]">
        <div>
          <span className="text-slate-500 block">Akun Penandatangan</span>
          <span className="font-semibold text-slate-900">{signerName}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Jabatan / Divisi</span>
          <span className="font-semibold text-slate-900">{signerPosition}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Tanggal & Waktu Otomatis</span>
          <span className="font-mono font-semibold text-slate-800 tabular-nums">
            {formatDateTimeID(liveTimestamp)}
          </span>
        </div>
      </div>
    </div>
  );
};
