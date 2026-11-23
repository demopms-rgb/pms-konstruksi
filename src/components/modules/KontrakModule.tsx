import React from 'react';
import {
  CalendarClock,
  CheckSquare,
  CreditCard,
  FileBarChart2,
  FileCheck2,
  FilePlus2,
  FolderLock,
  GitBranch,
  History,
  Send,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { ContractSubmenuKey } from '../../types/pms';
import { KONTRAK_TERMIN_SUBMENUS, canCreateContract } from '../../utils/permissions';
import { ContractListView } from './kontrak/ContractListView';
import { ContractCreateView } from './kontrak/ContractCreateView';
import { TerminTimelineView } from './kontrak/TerminTimelineView';
import { TerminClaimView } from './kontrak/TerminClaimView';
import { TerminApprovalView } from './kontrak/TerminApprovalView';
import { PaymentRealizationView } from './kontrak/PaymentRealizationView';
import { ContractAddendumView } from './kontrak/ContractAddendumView';
import { ContractDocumentsView } from './kontrak/ContractDocumentsView';
import { ContractReportsView } from './kontrak/ContractReportsView';
import { ContractHistoryView } from './kontrak/ContractHistoryView';

const SUBMENU_ICONS: Record<ContractSubmenuKey, React.FC<{ className?: string }>> = {
  daftar: FileCheck2,
  pembuatan: FilePlus2,
  timeline: CalendarClock,
  pengajuan: Send,
  approval: CheckSquare,
  pembayaran: CreditCard,
  addendum: GitBranch,
  dokumen: FolderLock,
  laporan: FileBarChart2,
  riwayat: History,
};

export const KontrakModule: React.FC = () => {
  const {
    state,
    currentRole,
    currentDivision,
    contractSubmenu,
    setContractSubmenu,
    setSelectedContractId,
    showToast,
  } = usePMS();

  const roleCode = currentRole?.code ?? 'STAFF';
  const divCode = currentDivision?.code ?? 'TEKNIK';
  const allowCreateContract = canCreateContract(roleCode, divCode);

  const visibleSubmenus = KONTRAK_TERMIN_SUBMENUS.filter(
    (sub) => sub.key !== 'pembuatan' || allowCreateContract
  );

  const handleNavigateSubmenu = (sub: ContractSubmenuKey, contractId?: string) => {
    if (sub === 'pembuatan' && !allowCreateContract) {
      showToast('Anda tidak memiliki hak akses untuk membuat kontrak');
      setContractSubmenu('daftar');
      return;
    }
    if (contractId) {
      setSelectedContractId(contractId);
    }
    setContractSubmenu(sub);
  };

  const activeContractIds = new Set(
    state.contracts.filter((c) => !c.is_deleted).map((c) => c.id)
  );
  const pendingApprovalsCount = state.termClaims.filter(
    (c) => activeContractIds.has(c.contract_id) && c.status === 'Menunggu Approval'
  ).length;
  const awaitingPaymentCount = state.termClaims.filter((c) => {
    if (!activeContractIds.has(c.contract_id) || c.status !== 'Disetujui') return false;
    const term = state.contractTerms.find((t) => t.id === c.term_id);
    const paid = Number(term?.paid_amount ?? 0);
    return term ? paid < term.term_value : true;
  }).length;

  return (
    <div className="space-y-5">
      {/* Compact Horizontal Submenu Strip for Fast Module Navigation */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {visibleSubmenus.map((sub) => {
            const key = sub.key as ContractSubmenuKey;
            const Icon = SUBMENU_ICONS[key] ?? FileCheck2;
            const active = contractSubmenu === key;
            const badge =
              key === 'approval' && pendingApprovalsCount > 0
                ? pendingApprovalsCount
                : key === 'pembayaran' && awaitingPaymentCount > 0
                ? awaitingPaymentCount
                : null;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setContractSubmenu(key)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#13233C] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#FBC02D]' : 'text-slate-400'}`} />
                <span>{sub.label}</span>
                {badge !== null && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded ${
                      active
                        ? 'bg-[#FBC02D] text-[#13233C]'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Submenu View */}
      {contractSubmenu === 'daftar' && (
        <ContractListView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'pembuatan' &&
        (allowCreateContract ? (
          <ContractCreateView onNavigateSubmenu={handleNavigateSubmenu} />
        ) : (
          <ContractListView onNavigateSubmenu={handleNavigateSubmenu} />
        ))}
      {contractSubmenu === 'timeline' && (
        <TerminTimelineView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'pengajuan' && (
        <TerminClaimView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'approval' && (
        <TerminApprovalView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'pembayaran' && (
        <PaymentRealizationView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'addendum' && (
        <ContractAddendumView onNavigateSubmenu={handleNavigateSubmenu} />
      )}
      {contractSubmenu === 'dokumen' && <ContractDocumentsView />}
      {contractSubmenu === 'laporan' && <ContractReportsView />}
      {contractSubmenu === 'riwayat' && <ContractHistoryView />}
    </div>
  );
};
