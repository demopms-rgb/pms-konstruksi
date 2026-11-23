import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { usePMS } from '../../../context/PMSContext';
import { useAttachments } from '../../../context/AttachmentContext';
import { ContractSubmenuKey, TermClaim, TermClaimStatus } from '../../../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from '../../../utils/format';
import { canDecideTermClaim } from '../../../utils/permissions';
import { ConfirmDialog, EmptyState, Modal, SearchInput, StatusLabel } from '../../ui/CommonUI';
import { PdfPreviewModal } from '../../ui/PdfPreviewModal';

interface TerminApprovalViewProps {
  onNavigateSubmenu: (sub: ContractSubmenuKey, contractId?: string) => void;
}

export const TerminApprovalView: React.FC<TerminApprovalViewProps> = ({ onNavigateSubmenu }) => {
  const {
    state,
    currentRole,
    currentDivision,
    selectedContractId,
    decideTermClaimApi,
    workflowBusy,
    showToast,
  } = usePMS();
  const { getAttachmentsFor, getSignedUrl } = useAttachments();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowDecide = canDecideTermClaim(roleCode, divCode);

  const [tabStatus, setTabStatus] = useState<'SEMUA' | TermClaimStatus>('Menunggu Approval');
  const [contractFilter, setContractFilter] = useState<string>(selectedContractId || 'SEMUA');
  const [search, setSearch] = useState('');

  const [reviewClaim, setReviewClaim] = useState<TermClaim | null>(null);
  const [decisionPrompt, setDecisionPrompt] = useState<{
    claim: TermClaim;
    decision: 'APPROVE' | 'REVISION' | 'REJECT';
  } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    url: string;
    downloadUrl: string;
    ext: string;
  } | null>(null);

  const visibleContracts = useMemo(
    () => state.contracts.filter((c) => !c.is_deleted),
    [state.contracts]
  );

  const visibleClaims = useMemo(() => {
    const visibleIds = new Set(visibleContracts.map((c) => c.id));
    return state.termClaims.filter((cl) => visibleIds.has(cl.contract_id));
  }, [state.termClaims, visibleContracts]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      'Menunggu Approval': 0,
      Disetujui: 0,
      Revisi: 0,
      Ditolak: 0,
    };
    visibleClaims.forEach((c) => {
      map[c.status] = (map[c.status] ?? 0) + 1;
    });
    return map;
  }, [visibleClaims]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleClaims.filter((cl) => {
      if (tabStatus !== 'SEMUA' && cl.status !== tabStatus) return false;
      if (contractFilter !== 'SEMUA' && cl.contract_id !== contractFilter) return false;
      if (!q) return true;
      const ctr = visibleContracts.find((c) => c.id === cl.contract_id);
      const trm = state.contractTerms.find((t) => t.id === cl.term_id);
      return (
        cl.claim_number.toLowerCase().includes(q) ||
        cl.submitted_by_name.toLowerCase().includes(q) ||
        (ctr?.contract_number.toLowerCase().includes(q) ?? false) ||
        (trm?.term_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [visibleClaims, visibleContracts, state.contractTerms, tabStatus, contractFilter, search]);

  const openAttachmentPreview = async (id: string) => {
    const att = getAttachmentsFor('kontrak').find((a) => a.id === id);
    if (!att) {
      showToast('Lampiran tidak ditemukan.');
      return;
    }
    try {
      const [url, downloadUrl] = await Promise.all([
        getSignedUrl(att.id, 'inline'),
        getSignedUrl(att.id, 'attachment'),
      ]);
      setPreviewDoc({ name: att.original_name, url, downloadUrl, ext: att.extension });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka dokumen.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#13233C] tracking-tight">
            Approval Termin Pembayaran (Tim Finance)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Verifikasi kesesuaian syarat kontrak, realisasi progres, dan dokumen berita acara sebelum meneruskan ke realisasi pembayaran.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateSubmenu('pembayaran')}
          className="px-3.5 py-2 text-xs font-semibold bg-[#13233C] hover:bg-[#1D304D] text-white rounded-xl cursor-pointer"
        >
          Ke Realisasi Pembayaran
        </button>
      </div>

      {/* Explicit Separation Notice */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-2.5 text-xs text-slate-700">
        <ShieldCheck className="w-4 h-4 text-[#1D7AFC] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#13233C]">Catatan Pemisahan Wewenang:</span>{' '}
          Menyetujui (Approve) pengajuan termin menyatakan dokumen & progres lapangan valid untuk dibayar, <strong>tanpa otomatis mengubah status menjadi Lunas</strong>. Pencatatan transfer aktual dilakukan terpisah pada menu <em>Realisasi Pembayaran</em>.
          {!allowDecide && (
            <span className="block text-amber-800 font-semibold mt-1">
              Mode Baca: Hanya Head Finance atau Super Admin yang dapat memutus Approval / Revisi / Tolak.
            </span>
          )}
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          {(['Menunggu Approval', 'Disetujui', 'Revisi', 'Ditolak', 'SEMUA'] as const).map((tab) => {
            const active = tabStatus === tab;
            const badgeCount = tab === 'SEMUA' ? visibleClaims.length : counts[tab] ?? 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setTabStatus(tab)}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'border-[#1D7AFC] text-[#1D7AFC]'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{tab === 'SEMUA' ? 'Semua' : tab}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700 font-mono">
                  {badgeCount}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor pengajuan, kontrak, atau pengaju..."
          />
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl max-w-xs"
          >
            <option value="SEMUA">Semua Kontrak</option>
            {visibleContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number} — {c.work_name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Tidak Ada Antrean pada Status Ini"
              description="Pengajuan termin dari tim proyek akan masuk ke daftar verifikasi Finance di sini."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((cl) => {
              const ctr = state.contracts.find((c) => c.id === cl.contract_id);
              const trm = state.contractTerms.find((t) => t.id === cl.term_id);
              const prj = state.projects.find((p) => p.id === cl.project_id);
              const attCount =
                cl.doc_attachment_ids.length +
                getAttachmentsFor('kontrak', cl.term_id).length;

              return (
                <div
                  key={cl.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#1D7AFC]">{cl.claim_number}</span>
                      <StatusLabel status={cl.status} />
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{formatDateID(cl.claim_date)}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {ctr?.contract_number} · {trm?.term_number} ({prj?.project_number})
                    </h3>
                    <p className="text-xs text-slate-600">{cl.work_description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                      <span>
                        Progres: <strong className="text-slate-800">{cl.actual_progress}%</strong> / Target{' '}
                        {cl.target_progress}%
                      </span>
                      <span>·</span>
                      <span>Verif Lapangan: {cl.field_verified_by_name || '-'}</span>
                      <span>·</span>
                      <span>Lampiran: {attCount} file</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-2 shrink-0">
                    <div className="text-base font-bold font-mono text-[#13233C] tabular-nums">
                      {formatRupiah(cl.claim_amount)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReviewClaim(cl)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Periksa & Audit</span>
                      </button>

                      {allowDecide && cl.status === 'Menunggu Approval' && (
                        <>
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() => setDecisionPrompt({ claim: cl, decision: 'APPROVE' })}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() => setDecisionPrompt({ claim: cl, decision: 'REVISION' })}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Revisi</span>
                          </button>
                          <button
                            type="button"
                            disabled={workflowBusy}
                            onClick={() => setDecisionPrompt({ claim: cl, decision: 'REJECT' })}
                            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit & Verification Modal */}
      <Modal
        open={Boolean(reviewClaim)}
        onClose={() => setReviewClaim(null)}
        title={reviewClaim ? `Audit Verifikasi Termin — ${reviewClaim.claim_number}` : ''}
        maxWidth="max-w-3xl"
      >
        {reviewClaim && (() => {
          const ctr = state.contracts.find((c) => c.id === reviewClaim.contract_id);
          const trm = state.contractTerms.find((t) => t.id === reviewClaim.term_id);
          const termFiles = getAttachmentsFor('kontrak', reviewClaim.term_id);
          const allAttachmentIds = Array.from(
            new Set([...reviewClaim.doc_attachment_ids, ...termFiles.map((f) => f.id)])
          );
          const meetsTarget = reviewClaim.actual_progress >= reviewClaim.target_progress;

          return (
            <div className="space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <StatusLabel status={reviewClaim.status} />
                <span className="font-mono font-bold text-base text-[#13233C]">
                  {formatRupiah(reviewClaim.claim_amount)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500">Kontrak & Pekerjaan</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {ctr?.contract_number} — {ctr?.work_name}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Termin Pembayaran</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {trm?.term_number} ({trm?.payment_percentage}%)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Syarat Target vs Progres Aktual</span>
                  <p className={`font-mono font-bold mt-0.5 ${meetsTarget ? 'text-emerald-700' : 'text-red-600'}`}>
                    Aktual {reviewClaim.actual_progress}% / Target {reviewClaim.target_progress}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Verifikator Lapangan</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {reviewClaim.field_verified_by_name || '-'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Ringkasan Pekerjaan & Catatan</span>
                  <p className="text-slate-800 mt-0.5">{reviewClaim.work_description}</p>
                  {reviewClaim.notes && <p className="text-slate-500 mt-1">Catatan: {reviewClaim.notes}</p>}
                </div>
              </div>

              {!meetsTarget && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Progres aktual belum memenuhi target minimum termin ini.</span>
                </div>
              )}

              <div>
                <p className="font-semibold text-slate-700 mb-2">
                  Dokumen Berita Acara, Invoice & Foto Terlampir ({allAttachmentIds.length})
                </p>
                {allAttachmentIds.length === 0 ? (
                  <p className="text-slate-500 italic">Tidak ada file digital yang dilampirkan.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allAttachmentIds.map((id) => {
                      const att = getAttachmentsFor('kontrak').find((a) => a.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => openAttachmentPreview(id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1D7AFC] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>{att?.original_name || id}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold text-slate-700 mb-2">Jejak Audit</p>
                <div className="space-y-1.5">
                  {reviewClaim.history.map((h, i) => (
                    <div key={i} className="p-2.5 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <strong className="text-slate-800">
                          {h.action} · {h.actor_name}
                        </strong>
                        <span>{formatDateTimeID(h.timestamp)}</span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{h.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {allowDecide && reviewClaim.status === 'Menunggu Approval' && (
                <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDecisionPrompt({ claim: reviewClaim, decision: 'REJECT' })}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                  >
                    Tolak Pengajuan
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionPrompt({ claim: reviewClaim, decision: 'REVISION' })}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer"
                  >
                    Minta Revisi
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionPrompt({ claim: reviewClaim, decision: 'APPROVE' })}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  >
                    Approve Pencairan Termin
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Decision Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(decisionPrompt)}
        title={
          decisionPrompt?.decision === 'APPROVE'
            ? `Setujui Pengajuan ${decisionPrompt.claim.claim_number}?`
            : decisionPrompt?.decision === 'REVISION'
            ? `Kembalikan untuk Revisi (${decisionPrompt?.claim.claim_number})?`
            : `Tolak Pengajuan ${decisionPrompt?.claim.claim_number}?`
        }
        description={
          decisionPrompt?.decision === 'APPROVE'
            ? 'Pengajuan termin akan disetujui dan siap dicatat realisasi pembayarannya oleh Finance. Status belum menjadi Lunas hingga bukti bayar dicatat.'
            : 'Wajib menyertakan alasan penolakan atau poin perbaikan agar tim proyek dapat menindaklanjuti.'
        }
        confirmLabel={
          decisionPrompt?.decision === 'APPROVE'
            ? 'Setujui Termin'
            : decisionPrompt?.decision === 'REVISION'
            ? 'Kembalikan Revisi'
            : 'Tolak Termin'
        }
        danger={decisionPrompt?.decision === 'REJECT'}
        requireNote={decisionPrompt?.decision !== 'APPROVE'}
        noteLabel="Catatan Keputusan Finance"
        onCancel={() => setDecisionPrompt(null)}
        onConfirm={async (note) => {
          if (!decisionPrompt) return;
          const res = await decideTermClaimApi(decisionPrompt.claim.id, {
            decision: decisionPrompt.decision,
            note,
          });
          setDecisionPrompt(null);
          if (res.ok) setReviewClaim(null);
        }}
      />

      {/* In-app PDF.js & Verified Binary Preview Modal */}
      <PdfPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name || 'Pratinjau Dokumen'}
        subtitle="Lampiran Audit Termin"
        fileName={previewDoc?.name || 'dokumen.pdf'}
        fileExtension={previewDoc?.ext || 'pdf'}
        sourceUrl={previewDoc?.url ?? null}
        downloadUrl={previewDoc?.downloadUrl ?? null}
        onDownloadComplete={(name) => showToast(`Dokumen ${name} berhasil diunduh.`)}
        onError={(msg) => showToast(msg)}
      />
    </div>
  );
};
