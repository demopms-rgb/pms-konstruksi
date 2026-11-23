import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FilePlus2,
  History,
  Lock,
  PackageCheck,
  PenTool,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import {
  DeliveryItemCondition,
  DeliveryNote,
  DeliveryNoteStatus,
} from '../../types/pms';
import { formatDateID, formatDateTimeID, formatNumber } from '../../utils/format';
import {
  canDeleteDeliveryNote,
  canManageDeliveryNoteLogistics,
  canReceiveDeliveryNoteField,
} from '../../utils/permissions';
import {
  buildDeliveryNotePdfBytes,
  downloadDeliveryNotePdf,
  getDeliveryNotePdfFilename,
} from '../../utils/deliveryNotePdf';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ConfirmDialog, EmptyState, Modal, SearchInput, StatusLabel } from '../ui/CommonUI';
import { PdfPreviewModal } from '../ui/PdfPreviewModal';
import { SignaturePad } from '../ui/SignaturePad';
import {
  buildStandaloneSuratJalanPrintHtml,
  SuratJalanPrintDocument,
  validateDeliveryNoteForPrint,
} from './SuratJalanPrintDocument';

type SjTab = 'daftar' | 'form' | 'detail' | 'riwayat';

interface FormLineItem {
  material_id: string;
  qty_sent: number;
  rab_item_id: string;
  notes: string;
}

const ALL_STATUSES: Array<'SEMUA' | DeliveryNoteStatus> = [
  'SEMUA',
  'Draft',
  'Menunggu Pengiriman',
  'Dalam Pengiriman',
  'Menunggu Konfirmasi Penerimaan',
  'Selesai',
  'Dibatalkan',
];

export const SuratJalanSection: React.FC = () => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    workflowBusy,
    showToast,
    createDeliveryNoteApi,
    updateDeliveryNoteApi,
    prepareDeliveryNoteApi,
    dispatchDeliveryNoteApi,
    markDeliveryNoteArrivedApi,
    confirmReceiveDeliveryNoteApi,
    cancelDeliveryNoteApi,
    reviseDeliveryNoteApi,
    deleteDeliveryNoteApi,
  } = usePMS();
  const { getAttachmentsFor, openAttachmentModal } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const isLogistics = canManageDeliveryNoteLogistics(roleCode, divCode);
  const isFieldReceiver = canReceiveDeliveryNoteField(roleCode, divCode);
  const canDeleteSj = canDeleteDeliveryNote(roleCode, divCode);

  const deliveryNotes = useMemo(
    () => (state.deliveryNotes ?? []).filter((d) => !d.is_deleted),
    [state.deliveryNotes]
  );
  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );
  const fieldEmployees = useMemo(
    () =>
      state.employees.filter((e) => {
        const div = state.divisions.find((d) => d.id === e.division_id);
        return e.status === 'Aktif' && (div?.code === 'TEKNIK' || div?.code === 'LOGISTIK');
      }),
    [state.employees, state.divisions]
  );

  const warehouses = useMemo(() => state.warehouses ?? [], [state.warehouses]);
  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.is_active),
    [warehouses]
  );
  const defaultWarehouseId = activeWarehouses[0]?.id ?? warehouses[0]?.id ?? 'wh-depok';

  const getMatStockAtWarehouse = (materialId: string, warehouseId: string): number => {
    const mat = state.materials.find((m) => m.id === materialId);
    if (!mat) return 0;
    if (mat.warehouse_stocks && Object.keys(mat.warehouse_stocks).length > 0) {
      return Math.round(Number(mat.warehouse_stocks[warehouseId] ?? 0) * 100) / 100;
    }
    return (mat.default_warehouse_id || 'wh-depok') === warehouseId ? mat.stock : 0;
  };

  const [tab, setTab] = useState<SjTab>('daftar');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | DeliveryNoteStatus>('SEMUA');
  const [projectFilter, setProjectFilter] = useState('SEMUA');
  const [warehouseFilter, setWarehouseFilter] = useState('SEMUA');

  // Form state
  const [formError, setFormError] = useState('');
  const [formState, setFormState] = useState({
    delivery_date: new Date().toISOString().slice(0, 10),
    project_id: activeProjects[0]?.id ?? '',
    source_warehouse_id: defaultWarehouseId,
    destination_location: activeProjects[0]?.location ?? '',
    sender_name: currentUser?.full_name ?? '',
    sender_position: currentUser?.position ?? 'Tim Logistik',
    recipient_id: fieldEmployees[0]?.id ?? '',
    recipient_name: fieldEmployees[0]?.full_name ?? '',
    recipient_position: fieldEmployees[0]?.position ?? 'Tim Lapangan',
    vehicle_info: '',
    driver_name: '',
    driver_phone: '',
    request_id: '',
    supplier_sj_no: '',
    notes: '',
  });
  const [formItems, setFormItems] = useState<FormLineItem[]>([
    {
      material_id: state.materials[0]?.id ?? '',
      qty_sent: 1,
      rab_item_id: '',
      notes: '',
    },
  ]);

  // Dispatch (Sender Signature) Modal
  const [dispatchTarget, setDispatchTarget] = useState<DeliveryNote | null>(null);
  const [senderSigDataUrl, setSenderSigDataUrl] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [dispatchError, setDispatchError] = useState('');

  // Receive (Field Inspection + Recipient Signature) Modal
  const [receiveTarget, setReceiveTarget] = useState<DeliveryNote | null>(null);
  const [recipientSigDataUrl, setRecipientSigDataUrl] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [receiveChecks, setReceiveChecks] = useState<
    Array<{
      id: string;
      material_name: string;
      unit: string;
      qty_sent: number;
      qty_received: number;
      condition_status: DeliveryItemCondition;
      notes: string;
    }>
  >([]);

  // Cancel / Revise / Soft-Delete Confirm Dialog
  const [actionDialog, setActionDialog] = useState<{
    mode: 'cancel' | 'revise' | 'delete';
    dn: DeliveryNote;
  } | null>(null);

  // PDF Preview Modal
  const [pdfPreview, setPdfPreview] = useState<{
    dn: DeliveryNote;
    title: string;
    subtitle: string;
    fileName: string;
    bytes: Uint8Array;
  } | null>(null);

  // Print portal state & feedback
  const [printingDn, setPrintingDn] = useState<DeliveryNote | null>(null);
  const [printWarning, setPrintWarning] = useState('');
  const beforePrintFiredRef = useRef(false);

  const selectedDn = useMemo(
    () => deliveryNotes.find((d) => d.id === selectedId) ?? null,
    [deliveryNotes, selectedId]
  );

  const activePrintDn = printingDn ?? selectedDn;

  useEffect(() => {
    const onBeforePrint = () => {
      beforePrintFiredRef.current = true;
      if (tab === 'detail' && selectedDn && validateDeliveryNoteForPrint(selectedDn).valid) {
        if (!printingDn) {
          flushSync(() => setPrintingDn(selectedDn));
        }
        document.body.classList.add('sj-printing');
      }
    };
    const onAfterPrint = () => {
      document.body.classList.remove('sj-printing');
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('sj-printing');
    };
  }, [tab, selectedDn, printingDn]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveryNotes.filter((d) => {
      if (statusFilter !== 'SEMUA' && d.status !== statusFilter) return false;
      if (projectFilter !== 'SEMUA' && d.project_id !== projectFilter) return false;
      if (warehouseFilter !== 'SEMUA' && (d.source_warehouse_id || 'wh-depok') !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      return (
        d.sj_number.toLowerCase().includes(q) ||
        d.project_number.toLowerCase().includes(q) ||
        d.project_name.toLowerCase().includes(q) ||
        (d.source_warehouse_name?.toLowerCase().includes(q) ?? false) ||
        d.driver_name.toLowerCase().includes(q) ||
        d.recipient_name.toLowerCase().includes(q) ||
        d.vehicle_info.toLowerCase().includes(q) ||
        d.items.some((i) => i.material_name.toLowerCase().includes(q))
      );
    });
  }, [deliveryNotes, statusFilter, projectFilter, warehouseFilter, search]);

  const formProjectRabs = useMemo(
    () => state.budgets.filter((b) => !b.is_deleted && b.project_id === formState.project_id),
    [state.budgets, formState.project_id]
  );

  const consolidatedHistory = useMemo(() => {
    const entries = deliveryNotes.flatMap((dn) =>
      dn.history.map((h) => ({
        ...h,
        dn,
        sj_id: dn.id,
        sj_number: dn.sj_number,
        project_number: dn.project_number,
        project_name: dn.project_name,
        current_status: dn.status,
      }))
    );
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [deliveryNotes]);

  const openCreateForm = () => {
    const firstProj = activeProjects[0];
    const firstField = fieldEmployees[0];
    setEditingId(null);
    setFormError('');
    setFormState({
      delivery_date: new Date().toISOString().slice(0, 10),
      project_id: firstProj?.id ?? '',
      source_warehouse_id: defaultWarehouseId,
      destination_location: firstProj?.location ?? '',
      sender_name: currentUser?.full_name ?? '',
      sender_position: currentUser?.position ?? 'Tim Logistik',
      recipient_id: firstField?.id ?? '',
      recipient_name: firstField?.full_name ?? '',
      recipient_position: firstField?.position ?? 'Tim Lapangan',
      vehicle_info: '',
      driver_name: '',
      driver_phone: '',
      request_id: '',
      supplier_sj_no: '',
      notes: '',
    });
    setFormItems([
      {
        material_id: state.materials[0]?.id ?? '',
        qty_sent: 1,
        rab_item_id: '',
        notes: '',
      },
    ]);
    setTab('form');
  };

  const openEditDraftForm = (dn: DeliveryNote) => {
    if (dn.is_locked || dn.status !== 'Draft') {
      showToast('Hanya Surat Jalan berstatus Draft yang dapat diedit langsung.');
      return;
    }
    setEditingId(dn.id);
    setFormError('');
    setFormState({
      delivery_date: dn.delivery_date,
      project_id: dn.project_id,
      source_warehouse_id: dn.source_warehouse_id || defaultWarehouseId,
      destination_location: dn.destination_location,
      sender_name: dn.sender_name,
      sender_position: dn.sender_position,
      recipient_id: dn.recipient_id ?? '',
      recipient_name: dn.recipient_name,
      recipient_position: dn.recipient_position,
      vehicle_info: dn.vehicle_info,
      driver_name: dn.driver_name,
      driver_phone: dn.driver_phone ?? '',
      request_id: dn.request_id ?? '',
      supplier_sj_no: dn.supplier_sj_no ?? '',
      notes: dn.notes,
    });
    setFormItems(
      dn.items.map((it) => ({
        material_id: it.material_id,
        qty_sent: it.qty_sent,
        rab_item_id: it.rab_item_id ?? '',
        notes: it.notes ?? '',
      }))
    );
    setTab('form');
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (
      !formState.source_warehouse_id ||
      !formState.project_id ||
      !formState.destination_location.trim() ||
      !formState.recipient_name.trim() ||
      !formState.vehicle_info.trim() ||
      !formState.driver_name.trim()
    ) {
      setFormError('Gudang asal, proyek tujuan, lokasi, penerima, kendaraan, dan pengemudi wajib diisi.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Tambahkan minimal 1 barang dari Data Barang Gudang.');
      return;
    }

    const selectedWhName =
      warehouses.find((w) => w.id === formState.source_warehouse_id)?.name ?? 'Gudang Terpilih';

    // Aggregate quantities per material to ensure stock at chosen source warehouse is never exceeded
    const totals = new Map<string, number>();
    for (const line of formItems) {
      if (!line.material_id || !Number.isFinite(line.qty_sent) || line.qty_sent <= 0) {
        setFormError('Setiap baris barang harus memiliki material dan jumlah kirim > 0.');
        return;
      }
      totals.set(line.material_id, (totals.get(line.material_id) || 0) + line.qty_sent);
    }
    for (const [matId, qtyTotal] of totals.entries()) {
      const mat = state.materials.find((m) => m.id === matId);
      if (!mat) {
        setFormError('Material tidak valid.');
        return;
      }
      const whStock = getMatStockAtWarehouse(mat.id, formState.source_warehouse_id);
      if (qtyTotal > whStock) {
        setFormError(
          `Jumlah kirim ${mat.name} (${qtyTotal} ${mat.unit}) melebihi stok tersedia di ${selectedWhName} (${whStock} ${mat.unit}).`
        );
        return;
      }
    }

    const payload = {
      ...formState,
      items: formItems.map((it) => ({
        material_id: it.material_id,
        qty_sent: Number(it.qty_sent),
        rab_item_id: it.rab_item_id || undefined,
        notes: it.notes || undefined,
      })),
    };

    const res = editingId
      ? await updateDeliveryNoteApi(editingId, payload)
      : await createDeliveryNoteApi(payload);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    if (res.deliveryNote) {
      setSelectedId(res.deliveryNote.id);
      setTab('detail');
    } else {
      setTab('daftar');
    }
  };

  const openDispatchModal = (dn: DeliveryNote) => {
    setDispatchTarget(dn);
    setSenderSigDataUrl('');
    setDispatchNote('');
    setDispatchError('');
  };

  const handleConfirmDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTarget) return;
    if (!senderSigDataUrl) {
      setDispatchError('Mohon goreskan tanda tangan Pengirim (Logistik) terlebih dahulu.');
      return;
    }
    const res = await dispatchDeliveryNoteApi(dispatchTarget.id, {
      signature_data_url: senderSigDataUrl,
      sender_position: currentUser?.position || 'Tim Logistik',
      note: dispatchNote.trim() || undefined,
    });
    if (!res.ok) {
      setDispatchError(res.message);
      return;
    }
    setDispatchTarget(null);
    if (res.deliveryNote) {
      setSelectedId(res.deliveryNote.id);
    }
  };

  const openReceiveModal = (dn: DeliveryNote) => {
    setReceiveTarget(dn);
    setRecipientSigDataUrl('');
    setReceiveNote('');
    setReceiveError('');
    setReceiveChecks(
      dn.items.map((it) => ({
        id: it.id,
        material_name: `${it.material_code} — ${it.material_name}`,
        unit: it.unit,
        qty_sent: it.qty_sent,
        qty_received: it.qty_sent,
        condition_status: 'Baik',
        notes: it.notes ?? '',
      }))
    );
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    if (!recipientSigDataUrl) {
      setReceiveError('Mohon goreskan tanda tangan Penerima (Tim Lapangan) terlebih dahulu.');
      return;
    }
    for (const chk of receiveChecks) {
      if (!Number.isFinite(chk.qty_received) || chk.qty_received < 0 || chk.qty_received > chk.qty_sent) {
        setReceiveError(
          `Qty diterima untuk ${chk.material_name} harus antara 0 s/d ${chk.qty_sent} ${chk.unit}.`
        );
        return;
      }
    }
    const res = await confirmReceiveDeliveryNoteApi(receiveTarget.id, {
      signature_data_url: recipientSigDataUrl,
      recipient_position: currentUser?.position || 'Tim Lapangan',
      note: receiveNote.trim() || undefined,
      items: receiveChecks.map((c) => ({
        id: c.id,
        qty_received: Number(c.qty_received),
        condition_status: c.condition_status,
        notes: c.notes || undefined,
      })),
    });
    if (!res.ok) {
      setReceiveError(res.message);
      return;
    }
    setReceiveTarget(null);
    if (res.deliveryNote) {
      setSelectedId(res.deliveryNote.id);
    }
  };

  const handlePrintDeliveryNote = (dn: DeliveryNote | null | undefined) => {
    const check = validateDeliveryNoteForPrint(dn);
    if (!check.valid || !dn) {
      setPrintWarning(check.message);
      showToast(check.message);
      return;
    }
    setPrintWarning('');
    beforePrintFiredRef.current = false;

    // Commit A4 portal DOM synchronously within user click gesture
    flushSync(() => {
      setPrintingDn(dn);
    });

    const portalEl = document.getElementById('sj-print-portal');
    const portalHtml = portalEl?.innerHTML ?? '';
    if (!portalHtml) {
      const msg = 'Dokumen cetak Surat Jalan gagal disiapkan. Silakan coba lagi atau gunakan Download PDF.';
      setPrintWarning(msg);
      showToast(msg);
      return;
    }

    const openStandalonePrintWindow = (): boolean => {
      const standaloneHtml = buildStandaloneSuratJalanPrintHtml(portalHtml, dn.sj_number);
      const printWin = window.open(
        '',
        'pms_sj_print_window',
        'width=920,height=1050,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
      );
      if (!printWin) return false;
      try {
        printWin.document.open();
        printWin.document.write(standaloneHtml);
        printWin.document.close();
        printWin.focus();
        return true;
      } catch {
        try {
          printWin.close();
        } catch {
          // ignore close error
        }
        return false;
      }
    };

    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    // Inside preview iframes, window.print() is commonly blocked silently by sandbox without allow-modals.
    // Open an un-sandboxed standalone A4 print window synchronously on click so Chrome opens its Print Dialog directly.
    if (isInIframe) {
      if (openStandalonePrintWindow()) {
        return;
      }
      // Fallback if strict popup blocker rejected window.open
      document.body.classList.add('sj-printing');
      try {
        window.print();
      } catch {
        // handled below
      }
      if (!beforePrintFiredRef.current) {
        document.body.classList.remove('sj-printing');
        const msg =
          'Pop-up cetak diblokir oleh browser. Izinkan pop-up untuk situs ini agar dialog cetak langsung terbuka, atau gunakan Download PDF.';
        setPrintWarning(msg);
        showToast(msg);
      }
      return;
    }

    // Top-level desktop browser tab: print directly on current page with @media print isolation
    document.body.classList.add('sj-printing');
    try {
      window.print();
    } catch {
      document.body.classList.remove('sj-printing');
    }

    if (!beforePrintFiredRef.current) {
      document.body.classList.remove('sj-printing');
      if (!openStandalonePrintWindow()) {
        const msg =
          'Dialog cetak diblokir oleh browser. Izinkan pop-up untuk situs ini atau gunakan Download PDF.';
        setPrintWarning(msg);
        showToast(msg);
      }
    }
  };

  const handlePrintFromForm = () => {
    if (!editingId) {
      const msg =
        'Surat Jalan belum tersimpan. Simpan Draft Surat Jalan dan lengkapi seluruh data wajib terlebih dahulu sebelum mencetak.';
      setPrintWarning(msg);
      showToast(msg);
      return;
    }
    const savedDn = deliveryNotes.find((d) => d.id === editingId) ?? null;
    const check = validateDeliveryNoteForPrint(savedDn);
    if (!check.valid || !savedDn) {
      const msg =
        check.message ||
        'Data Surat Jalan belum lengkap atau belum tersimpan. Simpan perubahan draft terlebih dahulu.';
      setPrintWarning(msg);
      showToast(msg);
      return;
    }
    handlePrintDeliveryNote(savedDn);
  };

  const handlePreviewPdf = (dn: DeliveryNote) => {
    const check = validateDeliveryNoteForPrint(dn);
    if (!check.valid) {
      setPrintWarning(check.message);
      showToast(check.message);
      return;
    }
    setPrintWarning('');
    try {
      const bytes = buildDeliveryNotePdfBytes(dn);
      setPdfPreview({
        dn,
        title: `Preview Surat Jalan — ${dn.sj_number}`,
        subtitle: `${dn.project_number} · ${dn.project_name} · Status: ${dn.status}`,
        fileName: getDeliveryNotePdfFilename(dn.sj_number),
        bytes,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat preview PDF Surat Jalan.');
    }
  };

  const handleDownloadPdf = (dn: DeliveryNote) => {
    const check = validateDeliveryNoteForPrint(dn);
    if (!check.valid) {
      setPrintWarning(check.message);
      showToast(check.message);
      return;
    }
    setPrintWarning('');
    try {
      downloadDeliveryNotePdf(dn);
      showToast(`PDF ${getDeliveryNotePdfFilename(dn.sj_number)} berhasil diunduh.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunduh PDF Surat Jalan.');
    }
  };

  const handleCancelOrReviseConfirm = async (reason: string) => {
    if (!actionDialog) return;
    const { mode, dn } = actionDialog;
    if (mode === 'cancel') {
      const res = await cancelDeliveryNoteApi(dn.id, reason);
      if (res.ok && res.deliveryNote) {
        setSelectedId(res.deliveryNote.id);
      }
    } else if (mode === 'revise') {
      const res = await reviseDeliveryNoteApi(dn.id, reason);
      if (res.ok && res.deliveryNote) {
        setSelectedId(res.deliveryNote.id);
        openEditDraftForm(res.deliveryNote);
      }
    } else if (mode === 'delete') {
      if (!canDeleteSj) {
        showToast('Anda tidak memiliki hak akses untuk menghapus Surat Jalan.');
        setActionDialog(null);
        return;
      }
      const res = await deleteDeliveryNoteApi(dn.id, reason);
      if (res.ok) {
        if (selectedId === dn.id) {
          setSelectedId(null);
          if (tab === 'detail') {
            setTab('daftar');
          }
        }
      }
    }
    setActionDialog(null);
  };

  const kpiStats = useMemo(
    () => ({
      total: deliveryNotes.length,
      inTransit: deliveryNotes.filter(
        (d) => d.status === 'Dalam Pengiriman' || d.status === 'Menunggu Konfirmasi Penerimaan'
      ).length,
      waitingDispatch: deliveryNotes.filter(
        (d) => d.status === 'Draft' || d.status === 'Menunggu Pengiriman'
      ).length,
      completed: deliveryNotes.filter((d) => d.status === 'Selesai').length,
    }),
    [deliveryNotes]
  );

  return (
    <div className="space-y-5">
      {/* Top Banner + Sub-navigation */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#13233C]">
              Surat Jalan Digital Pengiriman Material
            </h2>
            {!isLogistics && !isFieldReceiver && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600">
                Mode Pemantauan ({currentDivision?.name})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Alur: Logistik Buat Surat Jalan → Siapkan Barang → Tanda Tangan Pengirim (Stok Berkurang) → Dikirim → Pemeriksaan Lapangan → Tanda Tangan Penerima → Selesai & Terkunci.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('daftar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'daftar' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar ({deliveryNotes.length})
            </button>
            {isLogistics && (
              <button
                type="button"
                onClick={openCreateForm}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tab === 'form' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FilePlus2 className="w-3.5 h-3.5 text-[#1D7AFC]" />
                <span>Buat Surat Jalan</span>
              </button>
            )}
            {selectedDn && (
              <button
                type="button"
                onClick={() => setTab('detail')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tab === 'detail' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Detail ({selectedDn.sj_number})
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab('riwayat')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'riwayat' ? 'bg-white text-[#13233C] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat</span>
            </button>
          </div>

          {isLogistics && tab !== 'form' && (
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#13233C] hover:bg-[#1D304D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Surat Jalan Baru</span>
            </button>
          )}
        </div>
      </div>

      {printWarning && (
        <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-xs text-amber-900 flex items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{printWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintWarning('')}
            className="text-amber-800 hover:underline font-semibold cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: DAFTAR SURAT JALAN */}
      {tab === 'daftar' && (
        <div className="space-y-4 no-print">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
              <p className="text-[11px] text-slate-500">Total Surat Jalan</p>
              <p className="text-2xl font-bold font-mono text-[#13233C] mt-1 tabular-nums">
                {kpiStats.total}
              </p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
              <p className="text-[11px] text-slate-500">Siap / Menunggu Kirim</p>
              <p className="text-2xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
                {kpiStats.waitingDispatch}
              </p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
              <p className="text-[11px] text-slate-500">Dalam Pengiriman / Konfirmasi</p>
              <p className="text-2xl font-bold font-mono text-[#1D7AFC] mt-1 tabular-nums">
                {kpiStats.inTransit}
              </p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
              <p className="text-[11px] text-slate-500">Selesai & Terkunci</p>
              <p className="text-2xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                {kpiStats.completed}
              </p>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'SEMUA' | DeliveryNoteStatus)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st === 'SEMUA' ? 'Semua Status' : st}
                  </option>
                ))}
              </select>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="SEMUA">Semua Proyek</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="SEMUA">Semua Gudang Asal</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nomor SJ, proyek, pengemudi, barang..."
            />
          </div>

          {filteredNotes.length === 0 ? (
            <EmptyState
              title="Belum Ada Surat Jalan Digital"
              description={
                isLogistics
                  ? 'Klik "Surat Jalan Baru" untuk membuat dokumen pengiriman material ke proyek.'
                  : 'Belum ada data Surat Jalan yang sesuai dengan filter.'
              }
            />
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Nomor SJ & Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Proyek Tujuan & Lokasi</th>
                      <th className="py-3 px-4 font-semibold">Pengemudi & Penerima</th>
                      <th className="py-3 px-4 font-semibold">Barang</th>
                      <th className="py-3 px-4 font-semibold">Tanda Tangan</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNotes.map((dn) => (
                      <tr key={dn.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#1D7AFC]">{dn.sj_number}</span>
                            {dn.is_locked && (
                              <span title="Dokumen Terkunci" className="inline-flex">
                                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {formatDateID(dn.delivery_date)}
                          </p>
                        </td>
                        <td className="py-3 px-4 min-w-[200px]">
                          <p className="font-semibold text-slate-900">
                            {dn.project_number} — {dn.project_name}
                          </p>
                          <p className="text-[11px] text-[#1D7AFC] font-medium truncate max-w-[260px]">
                            Asal: {dn.source_warehouse_name || 'Gudang Utama PT. Wilwa, Depok'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[260px]">
                            Tujuan: {dn.destination_location}
                          </p>
                        </td>
                        <td className="py-3 px-4 min-w-[170px]">
                          <p className="text-slate-900 font-medium">
                            {dn.driver_name} · <span className="font-mono text-[11px]">{dn.vehicle_info}</span>
                          </p>
                          <p className="text-[11px] text-slate-500">Penerima: {dn.recipient_name}</p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono font-semibold text-slate-800">
                            {dn.items.length} item
                          </span>
                          <p className="text-[11px] text-slate-500">
                            {dn.stock_deducted
                              ? dn.stock_restored
                                ? 'Stok Dikembalikan'
                                : 'Stok Terpotong'
                              : 'Belum Dikeluarkan'}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                          <div className="space-y-0.5">
                            <p className={dn.sender_signature ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                              Pengirim: {dn.sender_signature ? '✓ Sah' : 'Belum'}
                            </p>
                            <p className={dn.recipient_signature ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                              Penerima: {dn.recipient_signature ? '✓ Sah' : 'Belum'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusLabel status={dn.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(dn.id);
                                setTab('detail');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePreviewPdf(dn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold cursor-pointer"
                              title="Preview PDF Surat Jalan"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintDeliveryNote(dn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                              title="Cetak Surat Jalan Format A4"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Cetak</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(dn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold cursor-pointer"
                              title="Unduh File PDF Surat Jalan"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh</span>
                            </button>
                            {canDeleteSj && dn.status === 'Dibatalkan' && (
                              <button
                                type="button"
                                disabled={workflowBusy}
                                onClick={() => setActionDialog({ mode: 'delete', dn })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold cursor-pointer disabled:opacity-50"
                                title="Hapus Surat Jalan Dibatalkan (Khusus Head Logistik)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BUAT / EDIT SURAT JALAN (LOGISTIK ONLY) */}
      {tab === 'form' && isLogistics && (
        <form
          onSubmit={handleSaveForm}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-5 no-print"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-[#13233C]">
                {editingId ? 'Edit Draft Surat Jalan' : 'Buat Surat Jalan Digital Baru'}
              </h3>
              <p className="text-xs text-slate-500">
                Nomor Surat Jalan dibuat otomatis dan unik oleh sistem. Stok gudang baru berkurang saat barang dikeluarkan & ditandatangani Pengirim.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('daftar')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Kembali ke Daftar
            </button>
          </div>

          {formError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor Surat Jalan</label>
              <input
                type="text"
                readOnly
                value={
                  editingId
                    ? deliveryNotes.find((d) => d.id === editingId)?.sj_number ?? 'Otomatis'
                    : 'Otomatis & Unik (SJ/WAS/YYYYMM/XXXX)'
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Pengiriman *</label>
              <input
                type="date"
                required
                value={formState.delivery_date}
                onChange={(e) => setFormState({ ...formState, delivery_date: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek Tujuan *</label>
              <select
                required
                value={formState.project_id}
                onChange={(e) => {
                  const prj = activeProjects.find((p) => p.id === e.target.value);
                  setFormState({
                    ...formState,
                    project_id: e.target.value,
                    destination_location: prj?.location ?? formState.destination_location,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Pilih Proyek --</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Gudang Asal Pengiriman *
              </label>
              <select
                required
                value={formState.source_warehouse_id}
                onChange={(e) => setFormState({ ...formState, source_warehouse_id: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Lokasi Pengiriman *</label>
              <input
                type="text"
                required
                value={formState.destination_location}
                onChange={(e) => setFormState({ ...formState, destination_location: e.target.value })}
                placeholder="Alamat lengkap lokasi proyek tujuan..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. SJ Supplier (Opsional)</label>
              <input
                type="text"
                value={formState.supplier_sj_no}
                onChange={(e) => setFormState({ ...formState, supplier_sj_no: e.target.value })}
                placeholder="Contoh: SJ-SUP/2026/089"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pengirim (Logistik) *</label>
              <input
                type="text"
                required
                value={formState.sender_name}
                onChange={(e) => setFormState({ ...formState, sender_name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Penerima Lapangan *</label>
              <select
                value={formState.recipient_id}
                onChange={(e) => {
                  const emp = state.employees.find((x) => x.id === e.target.value);
                  setFormState({
                    ...formState,
                    recipient_id: e.target.value,
                    recipient_name: emp?.full_name ?? formState.recipient_name,
                    recipient_position: emp?.position ?? formState.recipient_position,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Pilih Akun Lapangan / Isi Manual --</option>
                {fieldEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.position})
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={formState.recipient_name}
                onChange={(e) => setFormState({ ...formState, recipient_name: e.target.value })}
                placeholder="Nama penerima di lapangan"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jabatan Penerima *</label>
              <input
                type="text"
                required
                value={formState.recipient_position}
                onChange={(e) => setFormState({ ...formState, recipient_position: e.target.value })}
                placeholder="Contoh: Pelaksana Lapangan"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kendaraan & Plat Nomor *</label>
              <input
                type="text"
                required
                value={formState.vehicle_info}
                onChange={(e) => setFormState({ ...formState, vehicle_info: e.target.value })}
                placeholder="Contoh: Truk Engkel B 9241 WAS"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Pengemudi *</label>
              <input
                type="text"
                required
                value={formState.driver_name}
                onChange={(e) => setFormState({ ...formState, driver_name: e.target.value })}
                placeholder="Nama lengkap sopir"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. HP Pengemudi (Opsional)</label>
              <input
                type="text"
                value={formState.driver_phone}
                onChange={(e) => setFormState({ ...formState, driver_phone: e.target.value })}
                placeholder="08xxxxxxxxxx"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Items Selection Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#13233C]">
                  Daftar Barang yang Dikirim (Dari Data Barang Gudang)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Jumlah pengiriman divalidasi langsung terhadap stok aktual gudang agar tidak melebihi ketersediaan.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormItems((prev) => [
                    ...prev,
                    {
                      material_id: state.materials[0]?.id ?? '',
                      qty_sent: 1,
                      rab_item_id: '',
                      notes: '',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris Barang</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Barang Gudang</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Stok di Gudang Asal</th>
                    <th className="py-2.5 px-3 font-semibold w-28">Qty Kirim *</th>
                    <th className="py-2.5 px-3 font-semibold">Satuan</th>
                    <th className="py-2.5 px-3 font-semibold">Pos RAB (Opsional)</th>
                    <th className="py-2.5 px-3 font-semibold">Catatan Barang</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formItems.map((line, idx) => {
                    const mat = state.materials.find((m) => m.id === line.material_id);
                    const whStock = mat
                      ? getMatStockAtWarehouse(mat.id, formState.source_warehouse_id)
                      : 0;
                    const overStock = mat ? line.qty_sent > whStock : false;
                    return (
                      <tr key={idx}>
                        <td className="py-2 px-3 min-w-[220px]">
                          <select
                            required
                            value={line.material_id}
                            onChange={(e) => {
                              const next = [...formItems];
                              next[idx] = { ...next[idx], material_id: e.target.value };
                              setFormItems(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          >
                            {state.materials.map((m) => {
                              const stockAtOrigin = getMatStockAtWarehouse(
                                m.id,
                                formState.source_warehouse_id
                              );
                              return (
                                <option key={m.id} value={m.id}>
                                  {m.code} — {m.name} (Stok gudang ini: {stockAtOrigin} {m.unit})
                                </option>
                              );
                            })}
                          </select>
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${
                            whStock <= 0 ? 'text-red-700' : 'text-slate-800'
                          }`}
                        >
                          {mat ? `${formatNumber(whStock)} ${mat.unit}` : '-'}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            max={whStock}
                            required
                            value={line.qty_sent}
                            onChange={(e) => {
                              const next = [...formItems];
                              next[idx] = { ...next[idx], qty_sent: Number(e.target.value) };
                              setFormItems(next);
                            }}
                            className={`w-24 px-2.5 py-1.5 rounded-lg border font-mono text-right ${
                              overStock ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-300'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {mat?.unit ?? '-'}
                        </td>
                        <td className="py-2 px-3 min-w-[180px]">
                          <select
                            value={line.rab_item_id}
                            onChange={(e) => {
                              const next = [...formItems];
                              next[idx] = { ...next[idx], rab_item_id: e.target.value };
                              setFormItems(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          >
                            <option value="">-- Umum Proyek --</option>
                            {formProjectRabs.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.work_item_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 min-w-[150px]">
                          <input
                            type="text"
                            value={line.notes}
                            onChange={(e) => {
                              const next = [...formItems];
                              next[idx] = { ...next[idx], notes: e.target.value };
                              setFormItems(next);
                            }}
                            placeholder="Catatan kemasan/lot"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            disabled={formItems.length <= 1}
                            onClick={() =>
                              setFormItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40 cursor-pointer"
                            title="Hapus baris"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-semibold text-slate-700 mb-1">
              Keterangan Pengiriman / Instruksi Khusus
            </label>
            <textarea
              rows={2}
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              placeholder="Catatan pengiriman, koordinasi bongkar muat, atau keterangan tambahan..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handlePrintFromForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('daftar')}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#13233C] hover:bg-[#1D304D] rounded-xl cursor-pointer disabled:opacity-50"
            >
              {editingId ? 'Simpan Perubahan Draft' : 'Simpan Draft Surat Jalan'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: DETAIL SURAT JALAN (DOCUMENT, SIGNATURES, PRINT, PDF, SUPPLIER UPLOAD, WORKFLOW ACTIONS) */}
      {tab === 'detail' && selectedDn && (
        <div className="space-y-5">
          {/* Action Bar (hidden during print) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('daftar')}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ← Daftar Surat Jalan
              </button>
              <StatusLabel status={selectedDn.status} />
              {selectedDn.is_locked && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
                  <Lock className="w-3.5 h-3.5" />
                  Terkunci Digital
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Preview / Print / Download PDF (All allowed viewers) */}
              <button
                type="button"
                onClick={() => handlePreviewPdf(selectedDn)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintDeliveryNote(selectedDn)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedDn)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>

              {/* Upload Supplier SJ / Supporting Docs shortcut */}
              {(isLogistics || isFieldReceiver) && (
                <button
                  type="button"
                  onClick={() =>
                    openAttachmentModal({
                      moduleId: 'gudang',
                      entityId: selectedDn.id,
                      entityLabel: `${selectedDn.sj_number} — ${selectedDn.project_number}`,
                      title: `Dokumen Pendukung & Surat Jalan Supplier — ${selectedDn.sj_number}`,
                      subtitle: 'Unggah Surat Jalan dari supplier, foto muat barang, atau bukti penerimaan',
                      defaultCategory: 'Surat Jalan / Nota Material',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#1D7AFC]" />
                  <span>
                    Upload SJ Supplier ({getAttachmentsFor('gudang', selectedDn.id).length})
                  </span>
                </button>
              )}

              {/* Logistics Actions */}
              {isLogistics && selectedDn.status === 'Draft' && !selectedDn.is_locked && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditDraftForm(selectedDn)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Draft</span>
                  </button>
                  <button
                    type="button"
                    disabled={workflowBusy}
                    onClick={() => prepareDeliveryNoteApi(selectedDn.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span>Siapkan Barang</span>
                  </button>
                </>
              )}

              {isLogistics &&
                (selectedDn.status === 'Draft' || selectedDn.status === 'Menunggu Pengiriman') &&
                !selectedDn.is_locked && (
                  <button
                    type="button"
                    onClick={() => openDispatchModal(selectedDn)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1D7AFC] hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Tanda Tangan Pengirim & Kirim Barang</span>
                  </button>
                )}

              {(isLogistics || isFieldReceiver) && selectedDn.status === 'Dalam Pengiriman' && (
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() => markDeliveryNoteArrivedApi(selectedDn.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 rounded-lg cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Tiba di Lokasi (Minta Konfirmasi)</span>
                </button>
              )}

              {/* Field Receiver Action */}
              {isFieldReceiver &&
                (selectedDn.status === 'Dalam Pengiriman' ||
                  selectedDn.status === 'Menunggu Konfirmasi Penerimaan') &&
                !selectedDn.is_locked && (
                  <button
                    type="button"
                    onClick={() => openReceiveModal(selectedDn)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Periksa Barang & Tanda Tangan Penerima</span>
                  </button>
                )}

              {/* Cancel / Revise with Audit Reason */}
              {isLogistics && selectedDn.status !== 'Dibatalkan' && (
                <>
                  <button
                    type="button"
                    onClick={() => setActionDialog({ mode: 'revise', dn: selectedDn })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Revisi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionDialog({ mode: 'cancel', dn: selectedDn })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Batalkan</span>
                  </button>
                </>
              )}

              {/* Soft-Delete Action — STRICTLY Head Logistik & Status Dibatalkan */}
              {canDeleteSj && selectedDn.status === 'Dibatalkan' && (
                <button
                  type="button"
                  disabled={workflowBusy}
                  onClick={() => setActionDialog({ mode: 'delete', dn: selectedDn })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>
          </div>

          {/* Workflow Stepper */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 no-print">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              {[
                { label: '1. Draft SJ', done: true },
                {
                  label: '2. Menunggu Pengiriman',
                  done: selectedDn.status !== 'Draft',
                },
                {
                  label: '3. TTD Pengirim & Dikirim',
                  done: Boolean(selectedDn.sender_signature),
                },
                {
                  label: '4. Pemeriksaan Lapangan',
                  done:
                    selectedDn.status === 'Menunggu Konfirmasi Penerimaan' ||
                    selectedDn.status === 'Selesai',
                },
                {
                  label: '5. TTD Penerima & Selesai',
                  done: selectedDn.status === 'Selesai' && Boolean(selectedDn.recipient_signature),
                },
              ].map((step) => (
                <div
                  key={step.label}
                  className={`px-3 py-2 rounded-xl border font-semibold flex items-center gap-1.5 ${
                    selectedDn.status === 'Dibatalkan'
                      ? 'bg-red-50/70 border-red-200 text-red-700'
                      : step.done
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Official Surat Jalan Document Sheet (Both On-screen & Printable!) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Company Letterhead */}
            <div className="bg-[#13233C] text-white px-6 py-5 border-b-4 border-[#FBC02D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-[#FBC02D]">
                  PT. WILWA ABIYASA SEJAHTERA — DIVISI LOGISTIK & GUDANG
                </p>
                <h3 className="text-lg sm:text-xl font-extrabold tracking-tight mt-0.5">
                  SURAT JALAN DIGITAL PENGIRIMAN MATERIAL
                </h3>
                {selectedDn.revised_from_number && (
                  <p className="text-[11px] text-amber-200 mt-0.5">
                    Revisi ke-{selectedDn.revision_no} dari dokumen {selectedDn.revised_from_number}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] text-slate-300">Nomor Surat Jalan</p>
                <p className="text-base sm:text-lg font-mono font-bold text-[#FBC02D]">
                  {selectedDn.sj_number}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {selectedDn.status === 'Dibatalkan' && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800">
                  <p className="font-bold">
                    DOKUMEN DIBATALKAN oleh {selectedDn.cancelled_by_name} pada{' '}
                    {selectedDn.cancelled_at ? formatDateTimeID(selectedDn.cancelled_at) : '-'}
                  </p>
                  <p className="mt-1">Alasan: {selectedDn.cancel_reason}</p>
                  {selectedDn.stock_restored && (
                    <p className="mt-1 font-semibold">
                      Stok gudang yang sebelumnya dikeluarkan telah dikembalikan secara otomatis.
                    </p>
                  )}
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Tanggal Pengiriman</span>
                    <span className="font-semibold text-slate-900">
                      {formatDateID(selectedDn.delivery_date)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Gudang Asal Pengiriman</span>
                    <span className="font-semibold text-[#1D7AFC] text-right">
                      {selectedDn.source_warehouse_name || 'Gudang Utama PT. Wilwa, Depok'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Proyek Tujuan</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedDn.project_number} — {selectedDn.project_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Lokasi Pengiriman</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedDn.destination_location}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Referensi SJ Supplier</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selectedDn.supplier_sj_no || '-'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Pengirim (Logistik)</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedDn.sender_name} ({selectedDn.sender_position})
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Penerima Lapangan</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedDn.recipient_name} ({selectedDn.recipient_position})
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Kendaraan</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {selectedDn.vehicle_info}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Pengemudi</span>
                    <span className="font-semibold text-slate-900">
                      {selectedDn.driver_name}
                      {selectedDn.driver_phone ? ` (${selectedDn.driver_phone})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {selectedDn.notes && (
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="font-semibold text-slate-900">Keterangan: </span>
                  {selectedDn.notes}
                </div>
              )}

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#13233C] text-white">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold text-center w-10">No</th>
                      <th className="py-2.5 px-3 font-semibold">Kode</th>
                      <th className="py-2.5 px-3 font-semibold">Nama Barang / Material</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Qty Dikirim</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Satuan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Qty Diterima</th>
                      <th className="py-2.5 px-3 font-semibold">Kondisi</th>
                      <th className="py-2.5 px-3 font-semibold">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedDn.items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {item.material_code}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {item.material_name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatNumber(item.qty_sent)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">{item.unit}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {selectedDn.status === 'Selesai' ? formatNumber(item.qty_received) : '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <StatusLabel status={item.condition_status} />
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{item.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Digital Signature Blocks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Tanda Tangan Pengirim (Divisi Logistik)',
                    sig: selectedDn.sender_signature,
                    fallbackName: selectedDn.sender_name,
                    fallbackPos: selectedDn.sender_position,
                  },
                  {
                    title: 'Tanda Tangan Penerima (Tim Lapangan)',
                    sig: selectedDn.recipient_signature,
                    fallbackName: selectedDn.recipient_name,
                    fallbackPos: selectedDn.recipient_position,
                  },
                ].map((box) => (
                  <div
                    key={box.title}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col justify-between"
                  >
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-[#13233C]">
                      <span>{box.title}</span>
                      {box.sig && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Sah
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex flex-col items-center justify-center min-h-[128px]">
                      {box.sig?.signature_data_url ? (
                        <img
                          src={box.sig.signature_data_url}
                          alt={`Tanda tangan ${box.sig.signer_name}`}
                          className="max-h-24 w-auto object-contain"
                        />
                      ) : (
                        <p className="text-xs italic text-slate-400">Belum Ditandatangani</p>
                      )}
                    </div>
                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] space-y-0.5">
                      <p className="font-bold text-slate-900">
                        {box.sig?.signer_name ?? box.fallbackName}
                      </p>
                      <p className="text-slate-600">
                        {box.sig?.signer_position ?? box.fallbackPos}
                      </p>
                      {box.sig ? (
                        <p className="font-mono text-[10px] text-slate-500">
                          {formatDateTimeID(box.sig.signed_at)} · Hash: {box.sig.signature_hash}
                        </p>
                      ) : (
                        <p className="text-slate-400">Menunggu otorisasi digital</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Supporting Documents & Supplier Delivery Note Upload Panel */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 no-print">
            <AttachmentPanel
              moduleId="gudang"
              entityId={selectedDn.id}
              entityLabel={`${selectedDn.sj_number} — ${selectedDn.project_number}`}
              defaultCategory="Surat Jalan / Nota Material"
              heading={`Dokumen Pendukung & Surat Jalan Supplier (${selectedDn.sj_number})`}
              subtitle="Unggah scan/foto Surat Jalan dari supplier, bukti muat kendaraan, dan foto serah terima barang di proyek."
            />
          </div>

          {/* Document Audit History */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 no-print">
            <h4 className="text-sm font-bold text-[#13233C] mb-3">
              Jejak Audit Surat Jalan ({selectedDn.sj_number})
            </h4>
            <div className="divide-y divide-slate-100 text-xs">
              {selectedDn.history.map((h) => (
                <div key={h.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {h.action}{' '}
                      <span className="text-slate-500 font-normal">
                        ({h.from_status ? `${h.from_status} → ` : ''}
                        {h.to_status})
                      </span>
                    </p>
                    <p className="text-slate-600 mt-0.5">{h.note}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Petugas: <strong>{h.actor_name}</strong> ({h.actor_division} · {h.actor_role})
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {formatDateTimeID(h.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RIWAYAT SURAT JALAN */}
      {tab === 'riwayat' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3 no-print">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#13233C]">
              Riwayat & Audit Seluruh Surat Jalan Digital
            </h3>
            <p className="text-xs text-slate-500">
              Catatan kronologis pembuatan, pengeluaran barang, tanda tangan pengirim/penerima, pembatalan, dan revisi.
            </p>
          </div>
          {consolidatedHistory.length === 0 ? (
            <EmptyState
              title="Belum Ada Riwayat Surat Jalan"
              description="Aktivitas pembuatan dan pengiriman Surat Jalan akan otomatis tercatat di sini."
            />
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {consolidatedHistory.map((h) => (
                <div
                  key={h.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(h.sj_id);
                          setTab('detail');
                        }}
                        className="font-mono font-bold text-[#1D7AFC] hover:underline cursor-pointer"
                      >
                        {h.sj_number}
                      </button>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-900">{h.action}</span>
                      <StatusLabel status={h.to_status} />
                    </div>
                    <p className="text-slate-600 mt-1">{h.note}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {h.project_number} ({h.project_name}) · Oleh <strong>{h.actor_name}</strong> ({h.actor_division})
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canDeleteSj &&
                      h.current_status === 'Dibatalkan' &&
                      h.to_status === 'Dibatalkan' && (
                        <button
                          type="button"
                          disabled={workflowBusy}
                          onClick={() => setActionDialog({ mode: 'delete', dn: h.dn })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          title="Hapus Surat Jalan Dibatalkan (Khusus Head Logistik)"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Hapus</span>
                        </button>
                      )}
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {formatDateTimeID(h.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: PENGIRIM DIGITAL SIGNATURE & DISPATCH (LOGISTIK) */}
      <Modal
        open={Boolean(dispatchTarget)}
        onClose={() => setDispatchTarget(null)}
        title={`Tanda Tangan Pengirim & Kirim Barang — ${dispatchTarget?.sj_number ?? ''}`}
        subtitle="Penandatanganan akan mengeluarkan barang fisik dan langsung mengurangi stok gudang secara otomatis."
        maxWidth="max-w-xl"
      >
        {dispatchTarget && (
          <form onSubmit={handleConfirmDispatch} className="space-y-4 text-xs">
            {dispatchError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700">
                {dispatchError}
              </div>
            )}

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-slate-700">
              <p className="font-bold text-[#13233C]">
                Ringkasan Barang yang Akan Dikeluarkan dari{' '}
                {dispatchTarget.source_warehouse_name || 'Gudang Utama PT. Wilwa, Depok'}:
              </p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                {dispatchTarget.items.map((it) => (
                  <li key={it.id}>
                    <strong>{it.material_name}</strong>: {formatNumber(it.qty_sent)} {it.unit}
                  </li>
                ))}
              </ul>
            </div>

            <SignaturePad
              label="Tanda Tangan Digital Pengirim (Divisi Logistik)"
              signerName={currentUser?.full_name ?? '-'}
              signerPosition={`${currentUser?.position ?? 'Logistik'} · ${currentDivision?.name ?? ''}`}
              value={senderSigDataUrl}
              onChange={setSenderSigDataUrl}
            />

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan Pengeluaran (Opsional)</label>
              <input
                type="text"
                value={dispatchNote}
                onChange={(e) => setDispatchNote(e.target.value)}
                placeholder="Contoh: Barang dimuat lengkap sesuai checklist loading..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDispatchTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy || !senderSigDataUrl}
                className="px-5 py-2 rounded-xl bg-[#1D7AFC] hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Keluarkan Barang & Kirim
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: FIELD INSPECTION & RECIPIENT DIGITAL SIGNATURE (TIM LAPANGAN) */}
      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={`Pemeriksaan & Konfirmasi Penerimaan — ${receiveTarget?.sj_number ?? ''}`}
        subtitle="Periksa jumlah dan kondisi barang yang tiba di proyek, lalu tandatangani sebagai Penerima."
        maxWidth="max-w-3xl"
      >
        {receiveTarget && (
          <form onSubmit={handleConfirmReceive} className="space-y-4 text-xs">
            {receiveError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700">
                {receiveError}
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Barang</th>
                    <th className="py-2 px-3 font-semibold text-right">Qty Dikirim</th>
                    <th className="py-2 px-3 font-semibold w-28">Qty Diterima *</th>
                    <th className="py-2 px-3 font-semibold w-40">Kondisi *</th>
                    <th className="py-2 px-3 font-semibold">Catatan Pemeriksaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receiveChecks.map((chk, idx) => (
                    <tr key={chk.id}>
                      <td className="py-2 px-3 font-semibold text-slate-900">{chk.material_name}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatNumber(chk.qty_sent)} {chk.unit}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min={0}
                          max={chk.qty_sent}
                          step="any"
                          required
                          value={chk.qty_received}
                          onChange={(e) => {
                            const next = [...receiveChecks];
                            next[idx] = { ...next[idx], qty_received: Number(e.target.value) };
                            setReceiveChecks(next);
                          }}
                          className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 font-mono text-right"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={chk.condition_status}
                          onChange={(e) => {
                            const next = [...receiveChecks];
                            next[idx] = {
                              ...next[idx],
                              condition_status: e.target.value as DeliveryItemCondition,
                            };
                            setReceiveChecks(next);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Baik">Baik</option>
                          <option value="Kurang">Kurang</option>
                          <option value="Rusak Sebagian">Rusak Sebagian</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={chk.notes}
                          onChange={(e) => {
                            const next = [...receiveChecks];
                            next[idx] = { ...next[idx], notes: e.target.value };
                            setReceiveChecks(next);
                          }}
                          placeholder="Sesuai / catatan fisik"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SignaturePad
              label="Tanda Tangan Digital Penerima (Tim Lapangan)"
              signerName={currentUser?.full_name ?? '-'}
              signerPosition={`${currentUser?.position ?? 'Tim Lapangan'} · ${currentDivision?.name ?? ''}`}
              value={recipientSigDataUrl}
              onChange={setRecipientSigDataUrl}
            />

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Serah Terima Lapangan (Opsional)
              </label>
              <input
                type="text"
                value={receiveNote}
                onChange={(e) => setReceiveNote(e.target.value)}
                placeholder="Contoh: Barang diterima lengkap di gudang proyek..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReceiveTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy || !recipientSigDataUrl}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Konfirmasi Selesai & Kunci Dokumen
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* CONFIRM DIALOG: CANCEL, REVISE, OR SOFT-DELETE WITH MANDATORY REASON */}
      <ConfirmDialog
        open={Boolean(actionDialog)}
        title={
          actionDialog?.mode === 'delete'
            ? `Hapus Surat Jalan ${actionDialog.dn.sj_number}?`
            : actionDialog?.mode === 'cancel'
            ? `Batalkan Surat Jalan ${actionDialog.dn.sj_number}?`
            : `Revisi Surat Jalan ${actionDialog?.dn.sj_number ?? ''}?`
        }
        description={
          actionDialog?.mode === 'delete'
            ? 'Surat Jalan berstatus Dibatalkan akan dihapus dari daftar dan riwayat normal (soft delete). Data tidak hilang permanen dari database, catatan audit penghapusan akan disimpan, serta riwayat stok dan transaksi barang tidak akan berubah.'
            : actionDialog?.mode === 'cancel'
            ? 'Pembatalan bersifat permanen. Jika stok sudah terpotong saat pengiriman, sistem akan mengembalikan stok ke gudang dan mencatat riwayat audit.'
            : 'Dokumen saat ini akan ditutup/digantikan dan sistem akan menerbitkan Draft revisi baru (R1/R2) untuk dikoreksi. Jika stok sudah terpotong, stok dikembalikan lebih dulu agar tidak terjadi pengurangan ganda.'
        }
        confirmLabel={
          actionDialog?.mode === 'delete'
            ? 'Ya, Hapus Surat Jalan'
            : actionDialog?.mode === 'cancel'
            ? 'Ya, Batalkan Surat Jalan'
            : 'Terbitkan Revisi'
        }
        noteLabel={
          actionDialog?.mode === 'delete'
            ? 'Alasan Penghapusan Surat Jalan'
            : actionDialog?.mode === 'cancel'
            ? 'Alasan Pembatalan'
            : 'Alasan Revisi'
        }
        danger={actionDialog?.mode === 'cancel' || actionDialog?.mode === 'delete'}
        requireNote
        onCancel={() => setActionDialog(null)}
        onConfirm={handleCancelOrReviseConfirm}
      />

      {/* IN-APP PDF.JS PREVIEW MODAL */}
      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        title={pdfPreview?.title ?? 'Preview Surat Jalan Digital'}
        subtitle={pdfPreview?.subtitle}
        fileName={pdfPreview?.fileName ?? 'Surat-Jalan.pdf'}
        fileExtension="pdf"
        sourceBytes={pdfPreview?.bytes ?? null}
        onPrint={pdfPreview?.dn ? () => handlePrintDeliveryNote(pdfPreview.dn) : undefined}
        onDownloadComplete={(name) => showToast(`PDF ${name} berhasil diunduh.`)}
      />

      {/* DEDICATED A4 PRINT PORTAL (RENDERED DIRECTLY INTO document.body, HIDDEN ON SCREEN) */}
      {activePrintDn &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="sj-print-portal">
            <SuratJalanPrintDocument dn={activePrintDn} />
          </div>,
          document.body
        )}
    </div>
  );
};
