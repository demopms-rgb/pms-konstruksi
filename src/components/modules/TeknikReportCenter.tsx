import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  GitBranch,
  History,
  Paperclip,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { usePMS } from '../../context/PMSContext';
import { useAttachments } from '../../context/AttachmentContext';
import {
  Project,
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
} from '../../types/pms';
import { formatDateID, formatDateTimeID, formatRupiah } from '../../utils/format';
import { canAccessTeknikModule } from '../../utils/permissions';
import {
  exportTeknikReportExcel,
  exportTeknikReportPdf,
  openTeknikReportPrintA4Window,
} from '../../utils/teknikExport';
import { Modal, StatusLabel } from '../ui/CommonUI';
import { ModuleAttachmentToolbar } from '../attachments/ModuleAttachmentButton';
import { ProtectedAttachmentImage } from '../attachments/ProtectedAttachmentImage';

type ReportTabKey = 'indeks' | 'evaluasi' | 'kendala' | 'perubahan' | 'penyelesaian';

interface VirtualLapanganConstraint {
  id: string;
  project_id: string;
  source_type: 'Lapangan' | 'WorkItem';
  source_ref_id: string;
  reported_date: string;
  reported_by_name: string;
  work_area: string;
  problem_description: string;
  follow_up_hint: string;
}

interface TeknikReportCenterProps {
  projectFilter: string;
  onProjectFilterChange: (projectId: string) => void;
}

export const TeknikReportCenter: React.FC<TeknikReportCenterProps> = ({
  projectFilter,
  onProjectFilterChange,
}) => {
  const {
    state,
    currentUser,
    currentRole,
    currentDivision,
    workflowBusy,
    showToast,
    saveTeknikEvaluationApi,
    saveTeknikConstraintApi,
    saveTeknikChangeApi,
    decideTeknikChangeApi,
    saveTeknikCompletionApi,
    verifyTeknikCompletionApi,
    saveTeknikProgressAssessmentApi,
  } = usePMS();
  const { getAttachmentsFor, openAttachmentModal } = useAttachments();

  const [activeTab, setActiveTab] = useState<ReportTabKey>('indeks');
  const [periodFilter, setPeriodFilter] = useState<string>('SEMUA');
  const [statusFilter, setStatusFilter] = useState<string>('SEMUA');
  const [trendProjectId, setTrendProjectId] = useState<string>('prj-01');
  const [detailProject, setDetailProject] = useState<Project | null>(null);

  const canManageTeknik = Boolean(
    currentRole && currentDivision && canAccessTeknikModule(currentRole.code, currentDivision.code)
  );
  const canApproveTeknikHead =
    currentRole?.code === 'SUPER_ADMIN' ||
    (currentRole?.code === 'HEAD' && currentDivision?.code === 'TEKNIK');

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.is_deleted),
    [state.projects]
  );

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    activeProjects.forEach((p) => map.set(p.id, p));
    return map;
  }, [activeProjects]);

  const evaluations = state.teknikEvaluations || [];
  const savedConstraints = state.teknikConstraints || [];
  const changes = state.teknikChanges || [];
  const completions = state.teknikCompletions || [];
  const assessments = state.teknikProgressAssessments || [];

  // Pull unlinked constraints from Tim Lapangan field_reports & WorkItems automatically
  const unlinkedLapanganConstraints = useMemo<VirtualLapanganConstraint[]>(() => {
    const linkedRefs = new Set(
      savedConstraints.map((c) => `${c.project_id}:${c.source_ref_id || ''}`)
    );
    const items: VirtualLapanganConstraint[] = [];

    for (const wf of state.workflows) {
      const prj = projectMap.get(wf.project_id);
      if (!prj) continue;
      for (const fr of wf.field_reports || []) {
        const text = String(fr.constraints || '').trim();
        if (!text || text === '-') continue;
        if (linkedRefs.has(`${prj.id}:${fr.id}`)) continue;
        items.push({
          id: `virt-fr-${fr.id}`,
          project_id: prj.id,
          source_type: 'Lapangan',
          source_ref_id: fr.id,
          reported_date: String(fr.reported_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          reported_by_name: fr.reported_by_name || 'Tim Lapangan',
          work_area: fr.work_summary ? fr.work_summary.slice(0, 70) : prj.name,
          problem_description: text,
          follow_up_hint: fr.follow_up || '',
        });
      }
    }

    for (const wi of state.workItems) {
      if (wi.is_deleted) continue;
      const prj = projectMap.get(wi.project_id);
      if (!prj) continue;
      const text = String(wi.constraints || '').trim();
      if (!text || text === '-') continue;
      if (linkedRefs.has(`${prj.id}:${wi.id}`)) continue;
      const pic = state.employees.find((e) => e.id === wi.pic_employee_id)?.full_name || 'Tim Lapangan';
      items.push({
        id: `virt-wi-${wi.id}`,
        project_id: prj.id,
        source_type: 'WorkItem',
        source_ref_id: wi.id,
        reported_date: wi.start_date || new Date().toISOString().slice(0, 10),
        reported_by_name: pic,
        work_area: wi.title,
        problem_description: text,
        follow_up_hint: wi.follow_up || '',
      });
    }
    return items;
  }, [savedConstraints, state.workflows, state.workItems, state.employees, projectMap]);

  // Unified period options across all reports
  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => a.period_month && set.add(a.period_month));
    evaluations.forEach((e) => e.period_month && set.add(e.period_month));
    changes.forEach((c) => c.period_month && set.add(c.period_month));
    completions.forEach((c) => c.period_month && set.add(c.period_month));
    savedConstraints.forEach((c) => c.reported_date && set.add(c.reported_date.slice(0, 7)));
    set.add(new Date().toISOString().slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [assessments, evaluations, changes, completions, savedConstraints]);

  const matchesStatusBucket = (statusValue: string): boolean => {
    if (statusFilter === 'SEMUA') return true;
    const s = statusValue.toLowerCase();
    if (statusFilter === 'TERBUKA') {
      return s.includes('terbuka') || s.includes('menunggu') || s === 'draft';
    }
    if (statusFilter === 'PROSES') {
      return s.includes('penanganan') || s.includes('revisi');
    }
    if (statusFilter === 'SELESAI') {
      return s.includes('selesai') || s.includes('disetujui');
    }
    if (statusFilter === 'DITOLAK') {
      return s.includes('ditolak');
    }
    return true;
  };

  const filteredAssessments = useMemo(
    () =>
      assessments
        .filter((a) => {
          if (projectFilter !== 'SEMUA' && a.project_id !== projectFilter) return false;
          if (periodFilter !== 'SEMUA' && a.period_month !== periodFilter) return false;
          return true;
        })
        .sort((a, b) => (a.period_month < b.period_month ? 1 : -1)),
    [assessments, projectFilter, periodFilter]
  );

  const filteredEvaluations = useMemo(
    () =>
      evaluations.filter((e) => {
        if (projectFilter !== 'SEMUA' && e.project_id !== projectFilter) return false;
        if (periodFilter !== 'SEMUA' && e.period_month !== periodFilter) return false;
        if (!matchesStatusBucket(e.status)) return false;
        return true;
      }),
    [evaluations, projectFilter, periodFilter, statusFilter]
  );

  const filteredSavedConstraints = useMemo(
    () =>
      savedConstraints.filter((c) => {
        if (projectFilter !== 'SEMUA' && c.project_id !== projectFilter) return false;
        if (periodFilter !== 'SEMUA' && !c.reported_date.startsWith(periodFilter)) return false;
        if (!matchesStatusBucket(c.status)) return false;
        return true;
      }),
    [savedConstraints, projectFilter, periodFilter, statusFilter]
  );

  const filteredUnlinkedConstraints = useMemo(
    () =>
      unlinkedLapanganConstraints.filter((u) => {
        if (projectFilter !== 'SEMUA' && u.project_id !== projectFilter) return false;
        if (periodFilter !== 'SEMUA' && !u.reported_date.startsWith(periodFilter)) return false;
        if (statusFilter !== 'SEMUA' && statusFilter !== 'TERBUKA') return false;
        return true;
      }),
    [unlinkedLapanganConstraints, projectFilter, periodFilter, statusFilter]
  );

  const filteredChanges = useMemo(
    () =>
      changes.filter((c) => {
        if (projectFilter !== 'SEMUA' && c.project_id !== projectFilter) return false;
        if (periodFilter !== 'SEMUA' && c.period_month !== periodFilter) return false;
        if (!matchesStatusBucket(c.status)) return false;
        return true;
      }),
    [changes, projectFilter, periodFilter, statusFilter]
  );

  const filteredCompletions = useMemo(
    () =>
      completions.filter((c) => {
        if (projectFilter !== 'SEMUA' && c.project_id !== projectFilter) return false;
        if (periodFilter !== 'SEMUA' && c.period_month !== periodFilter) return false;
        if (!matchesStatusBucket(c.status)) return false;
        return true;
      }),
    [completions, projectFilter, periodFilter, statusFilter]
  );

  // Latest Teknik Assessment per Project for Visual Comparison Chart (Target vs Teknik vs Pembanding Lapangan)
  const latestPerProjectComparison = useMemo(() => {
    const scopeProjects =
      projectFilter !== 'SEMUA'
        ? activeProjects.filter((p) => p.id === projectFilter)
        : activeProjects;

    return scopeProjects.map((prj) => {
      const prjAssessments = assessments
        .filter((a) => a.project_id === prj.id)
        .sort((a, b) => (a.period_month > b.period_month ? 1 : -1));
      const latest = prjAssessments[prjAssessments.length - 1] || null;
      return {
        project: prj,
        latest,
        target: latest ? latest.target_progress_percent : 0,
        teknik: latest ? latest.teknik_progress_percent : 0,
        lapangan: prj.progress_percent,
        index: latest ? latest.technical_index : 0,
      };
    });
  }, [activeProjects, assessments, projectFilter]);

  const effectiveTrendProjectId =
    projectFilter !== 'SEMUA'
      ? projectFilter
      : projectMap.has(trendProjectId)
      ? trendProjectId
      : activeProjects[0]?.id || '';

  const trendSeries = useMemo(() => {
    return assessments
      .filter((a) => a.project_id === effectiveTrendProjectId)
      .sort((a, b) => (a.period_month > b.period_month ? 1 : -1));
  }, [assessments, effectiveTrendProjectId]);

  const summaryStats = useMemo(() => {
    const latestAvgIndex =
      latestPerProjectComparison.filter((r) => r.latest).length > 0
        ? latestPerProjectComparison
            .filter((r) => r.latest)
            .reduce((acc, r) => acc + r.index, 0) /
          latestPerProjectComparison.filter((r) => r.latest).length
        : 0;
    const latestAvgTeknik =
      latestPerProjectComparison.filter((r) => r.latest).length > 0
        ? latestPerProjectComparison
            .filter((r) => r.latest)
            .reduce((acc, r) => acc + r.teknik, 0) /
          latestPerProjectComparison.filter((r) => r.latest).length
        : 0;
    const evalIssueCount = filteredEvaluations.filter(
      (e) => e.drawing_spec_compliance !== 'Sesuai' && e.status !== 'Selesai'
    ).length;
    const openConstraints =
      filteredSavedConstraints.filter((c) => c.status !== 'Selesai').length +
      filteredUnlinkedConstraints.length;
    const pendingChanges = filteredChanges.filter(
      (c) => c.status === 'Menunggu Pemeriksaan' || c.status === 'Revisi'
    ).length;
    const verifiedCompletions = filteredCompletions.filter((c) => c.status === 'Selesai').length;
    return {
      latestAvgIndex,
      latestAvgTeknik,
      evalIssueCount,
      openConstraints,
      pendingChanges,
      verifiedCompletions,
    };
  }, [
    latestPerProjectComparison,
    filteredEvaluations,
    filteredSavedConstraints,
    filteredUnlinkedConstraints,
    filteredChanges,
    filteredCompletions,
  ]);

  // Project context helper: RAB + Schedule + Drawing/Photo Attachments
  const getProjectIntegrationSummary = (projectId: string) => {
    const prj = projectMap.get(projectId);
    const wf = state.workflows.find((w) => w.project_id === projectId);
    const rabTotal = state.budgets
      .filter((b) => b.project_id === projectId && !b.is_deleted)
      .reduce((sum, b) => sum + b.total_cost, 0);
    const rabItemsCount = state.budgets.filter((b) => b.project_id === projectId && !b.is_deleted).length;
    const teknikAtts = getAttachmentsFor('teknik', projectId);
    const proyekAtts = getAttachmentsFor('proyek', projectId);
    const fieldReportAttIds = new Set(
      (wf?.field_reports || []).flatMap((fr) => fr.attachment_ids || [])
    );
    const combinedAtts = [...teknikAtts, ...proyekAtts];
    const lapanganPhotos = combinedAtts.filter((a) => {
      const isImg = ['jpg', 'jpeg', 'png', 'webp', 'jfif'].includes(
        (a.extension || '').toLowerCase()
      );
      if (!isImg) return false;
      return (
        fieldReportAttIds.has(a.id) ||
        a.doc_category === 'Foto Lapangan' ||
        a.doc_category === 'Foto Selesai / BAST'
      );
    });
    return {
      prj,
      wf,
      rabTotal,
      rabItemsCount,
      scheduleStart: wf?.schedule_start || prj?.start_date || '-',
      scheduleEnd: wf?.schedule_end || prj?.target_end_date || '-',
      drawingCount: combinedAtts.length,
      lapanganPhotos,
      allAttachments: combinedAtts,
    };
  };

  // ==================== MODAL STATES ====================
  // A. Indeks Progres Modal & History Modal
  const [assessModalOpen, setAssessModalOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<TeknikProgressAssessment | null>(null);
  const [historyAssessment, setHistoryAssessment] = useState<TeknikProgressAssessment | null>(null);
  const [assessForm, setAssessForm] = useState({
    project_id: activeProjects[0]?.id || '',
    period_month: new Date().toISOString().slice(0, 7),
    evaluation_date: new Date().toISOString().slice(0, 10),
    target_progress_percent: 70,
    teknik_progress_percent: 62,
    quality_score: 88,
    notes: '',
  });

  // B. Evaluasi Teknis Modal
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [editingEval, setEditingEval] = useState<TeknikEvaluationReport | null>(null);
  const [evalForm, setEvalForm] = useState({
    project_id: activeProjects[0]?.id || '',
    evaluation_date: new Date().toISOString().slice(0, 10),
    work_package: '',
    drawing_spec_compliance: 'Sesuai' as TeknikConformanceStatus,
    non_conformance_findings: '',
    volume_spec_changes: '',
    recommendation: '',
    follow_up_action: '',
    status: 'Dalam Penanganan' as TeknikFollowUpStatus,
  });

  // C. Kendala Teknis Modal & History Modal
  const [conModalOpen, setConModalOpen] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<TeknikConstraintRecord | null>(null);
  const [historyConstraint, setHistoryConstraint] = useState<TeknikConstraintRecord | null>(null);
  const [conForm, setConForm] = useState({
    project_id: activeProjects[0]?.id || '',
    source_type: 'Teknik' as 'Lapangan' | 'WorkItem' | 'Teknik',
    source_ref_id: '',
    reported_date: new Date().toISOString().slice(0, 10),
    reported_by_name: '',
    work_area: '',
    problem_description: '',
    technical_analysis: '',
    follow_up_action: '',
    pic_name: currentUser?.full_name || '',
    target_resolution_date: '',
    status: 'Dalam Penanganan' as TeknikFollowUpStatus,
  });

  // D. Perubahan Pekerjaan Modal & Decision Modal
  const [chgModalOpen, setChgModalOpen] = useState(false);
  const [editingChange, setEditingChange] = useState<TeknikChangeReport | null>(null);
  const [decidingChange, setDecidingChange] = useState<TeknikChangeReport | null>(null);
  const [decideForm, setDecideForm] = useState({
    decision: 'Disetujui' as Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>,
    review_note: '',
  });
  const [chgForm, setChgForm] = useState({
    project_id: activeProjects[0]?.id || '',
    change_date: new Date().toISOString().slice(0, 10),
    change_category: 'Lingkup Pekerjaan' as TeknikChangeReport['change_category'],
    scope_change: '',
    volume_material_change: '',
    reason: '',
    technical_notes: '',
  });

  // E. Penyelesaian Teknis Modal & Verify Modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<TeknikCompletionReport | null>(null);
  const [verifyingComp, setVerifyingComp] = useState<TeknikCompletionReport | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [compForm, setCompForm] = useState({
    project_id: activeProjects[0]?.id || '',
    inspection_date: new Date().toISOString().slice(0, 10),
    completed_work_summary: '',
    inspection_result: 'Lulus Uji & Sesuai' as TeknikCompletionInspectionResult,
    defects_and_notes: '',
    follow_up_action: '',
    status: 'Menunggu Verifikasi' as TeknikCompletionStatus,
  });

  // ==================== HANDLERS ====================
  const buildExportPayload = () => {
    const projectLabel =
      projectFilter === 'SEMUA'
        ? 'Semua Proyek'
        : (() => {
            const p = projectMap.get(projectFilter);
            return p ? `${p.project_number} - ${p.name}` : projectFilter;
          })();
    const mergedConstraints: TeknikConstraintRecord[] = [
      ...filteredSavedConstraints,
      ...filteredUnlinkedConstraints.map((u) => ({
        id: u.id,
        issue_no: 'LAP-BARU',
        project_id: u.project_id,
        source_type: u.source_type,
        source_ref_id: u.source_ref_id,
        reported_date: u.reported_date,
        reported_by_name: u.reported_by_name,
        work_area: u.work_area,
        problem_description: u.problem_description,
        technical_analysis: 'Belum ditindaklanjuti Teknik',
        follow_up_action: u.follow_up_hint || 'Menunggu tindak lanjut Teknik',
        pic_name: '-',
        status: 'Terbuka' as TeknikFollowUpStatus,
        updated_by_id: '',
        updated_by_name: '-',
        history: [],
        created_at: u.reported_date,
        updated_at: u.reported_date,
      })),
    ];

    return {
      projectLabel,
      periodLabel: periodFilter === 'SEMUA' ? 'Semua Periode' : periodFilter,
      statusLabel: statusFilter === 'SEMUA' ? 'Semua Status' : statusFilter,
      preparedBy: currentUser?.full_name || 'Tim Teknik',
      projects: activeProjects,
      evaluations: filteredEvaluations,
      constraints: mergedConstraints,
      changes: filteredChanges,
      completions: filteredCompletions,
      assessments: filteredAssessments,
    };
  };

  const handleExportPdf = () => {
    try {
      exportTeknikReportPdf(buildExportPayload());
      showToast('Laporan Dashboard Teknik (PDF A4) berhasil diunduh.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat file PDF laporan Teknik.');
    }
  };

  const handleExportExcel = () => {
    try {
      exportTeknikReportExcel(buildExportPayload());
      showToast('Laporan Dashboard Teknik (Excel .xlsx) berhasil diunduh.');
    } catch {
      showToast('Gagal mengekspor Excel laporan Teknik.');
    }
  };

  const handlePrintA4 = () => {
    const res = openTeknikReportPrintA4Window(buildExportPayload());
    if (!res.ok && res.message) showToast(res.message);
  };

  const openAssessmentCreate = () => {
    const defaultPrj =
      projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id || '';
    setEditingAssessment(null);
    setAssessForm({
      project_id: defaultPrj,
      period_month:
        periodFilter !== 'SEMUA' ? periodFilter : new Date().toISOString().slice(0, 7),
      evaluation_date: new Date().toISOString().slice(0, 10),
      target_progress_percent: 75,
      teknik_progress_percent: 68,
      quality_score: 88,
      notes: '',
    });
    setAssessModalOpen(true);
  };

  const openAssessmentEdit = (a: TeknikProgressAssessment) => {
    setEditingAssessment(a);
    setAssessForm({
      project_id: a.project_id,
      period_month: a.period_month,
      evaluation_date: new Date().toISOString().slice(0, 10),
      target_progress_percent: a.target_progress_percent,
      teknik_progress_percent: a.teknik_progress_percent,
      quality_score: a.quality_score,
      notes: '',
    });
    setAssessModalOpen(true);
  };

  const submitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveTeknikProgressAssessmentApi({
      id: editingAssessment?.id,
      project_id: assessForm.project_id,
      period_month: assessForm.period_month,
      evaluation_date: assessForm.evaluation_date,
      target_progress_percent: Number(assessForm.target_progress_percent),
      teknik_progress_percent: Number(assessForm.teknik_progress_percent),
      quality_score: Number(assessForm.quality_score),
      notes: assessForm.notes,
    });
    if (res.ok) setAssessModalOpen(false);
  };

  const openEvalCreate = () => {
    setEditingEval(null);
    setEvalForm({
      project_id: projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id || '',
      evaluation_date: new Date().toISOString().slice(0, 10),
      work_package: '',
      drawing_spec_compliance: 'Sesuai',
      non_conformance_findings: '',
      volume_spec_changes: '',
      recommendation: '',
      follow_up_action: '',
      status: 'Dalam Penanganan',
    });
    setEvalModalOpen(true);
  };

  const openEvalEdit = (ev: TeknikEvaluationReport) => {
    setEditingEval(ev);
    setEvalForm({
      project_id: ev.project_id,
      evaluation_date: ev.evaluation_date,
      work_package: ev.work_package,
      drawing_spec_compliance: ev.drawing_spec_compliance,
      non_conformance_findings: ev.non_conformance_findings === '-' ? '' : ev.non_conformance_findings,
      volume_spec_changes: ev.volume_spec_changes === '-' ? '' : ev.volume_spec_changes,
      recommendation: ev.recommendation === '-' ? '' : ev.recommendation,
      follow_up_action: ev.follow_up_action === '-' ? '' : ev.follow_up_action,
      status: ev.status,
    });
    setEvalModalOpen(true);
  };

  const submitEval = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveTeknikEvaluationApi({
      id: editingEval?.id,
      ...evalForm,
    });
    if (res.ok) setEvalModalOpen(false);
  };

  const openConstraintCreate = () => {
    setEditingConstraint(null);
    setConForm({
      project_id: projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id || '',
      source_type: 'Teknik',
      source_ref_id: '',
      reported_date: new Date().toISOString().slice(0, 10),
      reported_by_name: currentUser?.full_name || 'Tim Teknik',
      work_area: '',
      problem_description: '',
      technical_analysis: '',
      follow_up_action: '',
      pic_name: currentUser?.full_name || '',
      target_resolution_date: '',
      status: 'Terbuka',
    });
    setConModalOpen(true);
  };

  const openConstraintFromLapangan = (u: VirtualLapanganConstraint) => {
    setEditingConstraint(null);
    setConForm({
      project_id: u.project_id,
      source_type: u.source_type,
      source_ref_id: u.source_ref_id,
      reported_date: u.reported_date,
      reported_by_name: u.reported_by_name,
      work_area: u.work_area,
      problem_description: u.problem_description,
      technical_analysis: '',
      follow_up_action: u.follow_up_hint || '',
      pic_name: currentUser?.full_name || 'Tim Teknik',
      target_resolution_date: '',
      status: 'Dalam Penanganan',
    });
    setConModalOpen(true);
  };

  const openConstraintEdit = (c: TeknikConstraintRecord) => {
    setEditingConstraint(c);
    setConForm({
      project_id: c.project_id,
      source_type: c.source_type,
      source_ref_id: c.source_ref_id || '',
      reported_date: c.reported_date,
      reported_by_name: c.reported_by_name,
      work_area: c.work_area,
      problem_description: c.problem_description,
      technical_analysis: c.technical_analysis === '-' ? '' : c.technical_analysis,
      follow_up_action: c.follow_up_action,
      pic_name: c.pic_name,
      target_resolution_date: c.target_resolution_date || '',
      status: c.status,
    });
    setConModalOpen(true);
  };

  const submitConstraint = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveTeknikConstraintApi({
      id: editingConstraint?.id,
      project_id: conForm.project_id,
      source_type: conForm.source_type,
      source_ref_id: conForm.source_ref_id || undefined,
      reported_date: conForm.reported_date,
      reported_by_name: conForm.reported_by_name,
      work_area: conForm.work_area,
      problem_description: conForm.problem_description,
      technical_analysis: conForm.technical_analysis,
      follow_up_action: conForm.follow_up_action,
      pic_name: conForm.pic_name,
      target_resolution_date: conForm.target_resolution_date || undefined,
      status: conForm.status,
    });
    if (res.ok) setConModalOpen(false);
  };

  const openChangeCreate = () => {
    setEditingChange(null);
    setChgForm({
      project_id: projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id || '',
      change_date: new Date().toISOString().slice(0, 10),
      change_category: 'Lingkup Pekerjaan',
      scope_change: '',
      volume_material_change: '',
      reason: '',
      technical_notes: '',
    });
    setChgModalOpen(true);
  };

  const openChangeEdit = (c: TeknikChangeReport) => {
    setEditingChange(c);
    setChgForm({
      project_id: c.project_id,
      change_date: c.change_date,
      change_category: c.change_category,
      scope_change: c.scope_change,
      volume_material_change: c.volume_material_change,
      reason: c.reason,
      technical_notes: c.technical_notes === '-' ? '' : c.technical_notes,
    });
    setChgModalOpen(true);
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveTeknikChangeApi({
      id: editingChange?.id,
      ...chgForm,
    });
    if (res.ok) setChgModalOpen(false);
  };

  const submitChangeDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decidingChange) return;
    const res = await decideTeknikChangeApi(
      decidingChange.id,
      decideForm.decision,
      decideForm.review_note
    );
    if (res.ok) setDecidingChange(null);
  };

  const openCompCreate = () => {
    setEditingComp(null);
    setCompForm({
      project_id: projectFilter !== 'SEMUA' ? projectFilter : activeProjects[0]?.id || '',
      inspection_date: new Date().toISOString().slice(0, 10),
      completed_work_summary: '',
      inspection_result: 'Lulus Uji & Sesuai',
      defects_and_notes: '',
      follow_up_action: '',
      status: 'Menunggu Verifikasi',
    });
    setCompModalOpen(true);
  };

  const openCompEdit = (c: TeknikCompletionReport) => {
    setEditingComp(c);
    setCompForm({
      project_id: c.project_id,
      inspection_date: c.inspection_date,
      completed_work_summary: c.completed_work_summary,
      inspection_result: c.inspection_result,
      defects_and_notes: c.defects_and_notes === '-' ? '' : c.defects_and_notes,
      follow_up_action: c.follow_up_action === '-' ? '' : c.follow_up_action,
      status: c.status,
    });
    setCompModalOpen(true);
  };

  const submitComp = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveTeknikCompletionApi({
      id: editingComp?.id,
      ...compForm,
    });
    if (res.ok) setCompModalOpen(false);
  };

  const submitVerifyComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingComp) return;
    const res = await verifyTeknikCompletionApi(verifyingComp.id, verifyNote);
    if (res.ok) setVerifyingComp(null);
  };

  const selectedAssessProject = projectMap.get(assessForm.project_id);
  const selectedEvalContext = getProjectIntegrationSummary(evalForm.project_id);
  const selectedCompContext = getProjectIntegrationSummary(compForm.project_id);

  // SVG Trend Chart Geometry
  const chartW = 540;
  const chartH = 190;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const buildPolyline = (values: number[]) => {
    if (values.length === 0) return '';
    return values
      .map((val, idx) => {
        const x =
          values.length === 1 ? padL + plotW / 2 : padL + (idx / (values.length - 1)) * plotW;
        const clamped = Math.max(0, Math.min(100, val));
        const y = padT + ((100 - clamped) / 100) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const detailContext = detailProject ? getProjectIntegrationSummary(detailProject.id) : null;

  return (
    <section className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#13233C] px-5 py-4 border-b-4 border-[#FBC02D] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FBC02D]">
            Pusat Laporan &amp; Pengendalian Teknis
          </p>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
            Evaluasi Teknis, Kendala, Perubahan, Penyelesaian &amp; Indeks Progres Teknik
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Terintegrasi otomatis dengan RAB, jadwal, gambar kerja, dan laporan fisik Tim Lapangan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeProjects.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const target =
                  projectFilter !== 'SEMUA'
                    ? projectMap.get(projectFilter) || activeProjects[0]
                    : activeProjects[0];
                setDetailProject(target);
              }}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5 text-[#FBC02D]" />
              <span>Detail Laporan Proyek</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrintA4}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBC02D] hover:bg-amber-400 text-[#13233C] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak A4</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#F4F7FC] border border-slate-200 rounded-xl p-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Proyek</label>
            <select
              value={projectFilter}
              onChange={(e) => onProjectFilterChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              <option value="SEMUA">Semua Proyek</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Periode Bulan</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg font-mono"
            >
              <option value="SEMUA">Semua Periode</option>
              {periodOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status Laporan</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="TERBUKA">Terbuka / Menunggu / Draft</option>
              <option value="PROSES">Dalam Penanganan / Revisi</option>
              <option value="SELESAI">Selesai / Disetujui</option>
              <option value="DITOLAK">Ditolak</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                onProjectFilterChange('SEMUA');
                setPeriodFilter('SEMUA');
                setStatusFilter('SEMUA');
              }}
              className="w-full min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          </div>
        </div>

        {/* 5 Technical Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Indeks Progres Teknik</span>
              <TrendingUp className="w-4 h-4 text-[#1D7AFC]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#13233C] font-mono tabular-nums">
                {summaryStats.latestAvgIndex.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-[#1D7AFC] font-semibold tabular-nums">
                ({summaryStats.latestAvgTeknik.toFixed(1)}% Teknik)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Penilaian independen Teknik ({filteredAssessments.length} periode)
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Evaluasi Teknis</span>
              <ClipboardCheck className="w-4 h-4 text-slate-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {filteredEvaluations.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summaryStats.evalIssueCount} temuan perlu perbaikan aktif
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Kendala Teknis</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {filteredSavedConstraints.length + filteredUnlinkedConstraints.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summaryStats.openConstraints} kendala terbuka / ditangani
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Perubahan Pekerjaan</span>
              <GitBranch className="w-4 h-4 text-[#1D7AFC]" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {filteredChanges.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summaryStats.pendingChanges} menunggu pemeriksaan Head
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Penyelesaian Teknis</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {filteredCompletions.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summaryStats.verifiedCompletions} terverifikasi Selesai
            </p>
          </div>
        </div>

        {/* In-Card Segmented Tab Switcher (No Submenu / No New Page) */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3 overflow-x-auto">
          {(
            [
              { key: 'indeks', label: 'Indeks Progres & Grafik', count: filteredAssessments.length },
              { key: 'evaluasi', label: '1. Evaluasi Teknis', count: filteredEvaluations.length },
              {
                key: 'kendala',
                label: '2. Kendala Teknis',
                count: filteredSavedConstraints.length + filteredUnlinkedConstraints.length,
              },
              { key: 'perubahan', label: '3. Perubahan Pekerjaan', count: filteredChanges.length },
              {
                key: 'penyelesaian',
                label: '4. Penyelesaian Teknis',
                count: filteredCompletions.length,
              },
            ] as const
          ).map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#13233C] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? 'text-[#FBC02D]' : 'text-slate-500'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ==================== TAB 0: REALISASI INDEKS NILAI PROGRES TEKNIK ==================== */}
        {activeTab === 'indeks' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Realisasi Indeks Nilai Progres Teknik (Terpisah dari Progres Fisik Lapangan)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Penilaian progres oleh Tim Teknik disimpan terpisah; progres fisik Lapangan hanya ditampilkan sebagai pembanding.
                </p>
              </div>
              {canManageTeknik && (
                <button
                  type="button"
                  onClick={openAssessmentCreate}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Input Penilaian Progres Teknik</span>
                </button>
              )}
            </div>

            {/* Dual Charts: Comparison Bar + Multi-Period SVG Trend */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Chart A: Target vs Nilai Teknik vs Pembanding Lapangan per Proyek */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-[#1D7AFC]" />
                      <span>Perbandingan Target, Nilai Teknik &amp; Pembanding Lapangan</span>
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#13233C] inline-block" /> Target
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#1D7AFC] inline-block" /> Nilai Teknik
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Pembanding Lapangan
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {latestPerProjectComparison.map((row) => (
                    <div key={row.project.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate">
                          {row.project.project_number} · {row.project.name}
                        </span>
                        <span className="font-mono text-[11px] text-slate-700 tabular-nums whitespace-nowrap shrink-0">
                          {row.latest
                            ? `Indeks ${row.index.toFixed(2)} (${row.latest.period_month})`
                            : 'Belum dinilai Teknik'}
                        </span>
                      </div>
                      <div className="space-y-1 text-[11px] font-mono tabular-nums">
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-slate-500 shrink-0">Target</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-[#13233C] rounded"
                              style={{ width: `${Math.min(100, row.target)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-slate-700">{row.target}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-[#1D7AFC] font-semibold shrink-0">Teknik</span>
                          <div className="flex-1 h-2.5 bg-slate-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-[#1D7AFC] rounded"
                              style={{ width: `${Math.min(100, row.teknik)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-bold text-[#1D7AFC]">
                            {row.teknik}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-emerald-700 shrink-0">Lapangan</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded"
                              style={{ width: `${Math.min(100, row.lapangan)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-emerald-700">{row.lapangan}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart B: Tren Penilaian Multi-Periode per Proyek */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#1D7AFC]" />
                      <span>Tren Progres Teknik per Periode</span>
                    </h4>
                  </div>
                  {projectFilter === 'SEMUA' && (
                    <select
                      value={effectiveTrendProjectId}
                      onChange={(e) => setTrendProjectId(e.target.value)}
                      className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 rounded-lg bg-white"
                    >
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_number} — {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {trendSeries.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Belum ada histori penilaian Teknik untuk proyek ini. Tambahkan penilaian periode baru untuk melihat grafik tren.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg
                      viewBox={`0 0 ${chartW} ${chartH}`}
                      className="w-full h-44 overflow-visible"
                      role="img"
                      aria-label="Grafik tren progres Teknik per periode"
                    >
                      {[0, 25, 50, 75, 100].map((tick) => {
                        const y = padT + ((100 - tick) / 100) * plotH;
                        return (
                          <g key={tick}>
                            <line
                              x1={padL}
                              x2={chartW - padR}
                              y1={y}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeDasharray="3 3"
                            />
                            <text
                              x={padL - 6}
                              y={y + 3}
                              textAnchor="end"
                              fontSize="10"
                              fill="#64748b"
                              fontFamily="monospace"
                            >
                              {tick}%
                            </text>
                          </g>
                        );
                      })}

                      {/* Target line (dashed dark) */}
                      {trendSeries.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#13233C"
                          strokeWidth="1.8"
                          strokeDasharray="4 4"
                          points={buildPolyline(trendSeries.map((s) => s.target_progress_percent))}
                        />
                      )}
                      {/* Pembanding Lapangan line (green) */}
                      {trendSeries.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="1.8"
                          points={buildPolyline(trendSeries.map((s) => s.field_progress_comparison))}
                        />
                      )}
                      {/* Nilai Teknik line (primary blue) */}
                      {trendSeries.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#1D7AFC"
                          strokeWidth="2.8"
                          points={buildPolyline(trendSeries.map((s) => s.teknik_progress_percent))}
                        />
                      )}

                      {trendSeries.map((s, idx) => {
                        const x =
                          trendSeries.length === 1
                            ? padL + plotW / 2
                            : padL + (idx / (trendSeries.length - 1)) * plotW;
                        const yTek = padT + ((100 - s.teknik_progress_percent) / 100) * plotH;
                        const yLap = padT + ((100 - s.field_progress_comparison) / 100) * plotH;
                        return (
                          <g key={s.id}>
                            <circle cx={x} cy={yLap} r="3.5" fill="#10B981" />
                            <circle cx={x} cy={yTek} r="4.5" fill="#1D7AFC" stroke="#fff" strokeWidth="1.5" />
                            <text
                              x={x}
                              y={yTek - 8}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="700"
                              fill="#1D7AFC"
                              fontFamily="monospace"
                            >
                              {s.teknik_progress_percent}%
                            </text>
                            <text
                              x={x}
                              y={chartH - 8}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#475569"
                              fontFamily="monospace"
                            >
                              {s.period_month}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    <p className="text-[11px] text-slate-500">
                      Garis biru tebal menunjukkan <strong>Realisasi Teknik</strong>, garis putus gelap menunjukkan{' '}
                      <strong>Target</strong>, dan garis hijau menunjukkan <strong>Pembanding Lapangan</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Assessment Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">No. &amp; Periode</th>
                      <th className="py-2.5 px-3.5 font-semibold">Proyek</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Target (%)</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Nilai Teknik (%)</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Pembanding Lapangan (%)</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Indeks &amp; Mutu</th>
                      <th className="py-2.5 px-3.5 font-semibold">Penilai &amp; Catatan</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssessments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          Belum ada penilaian indeks progres Teknik sesuai filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredAssessments.map((a) => {
                        const prj = projectMap.get(a.project_id);
                        return (
                          <tr key={a.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#13233C]">{a.assessment_no}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {a.period_month} · {formatDateID(a.evaluation_date)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-mono text-[11px] font-bold text-[#1D7AFC]">
                                {prj?.project_number ?? a.project_id}
                              </div>
                              <div className="font-medium text-slate-800">{prj?.name ?? '-'}</div>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-700">
                              {a.target_progress_percent}%
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-[#1D7AFC]">
                              {a.teknik_progress_percent}%
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-emerald-700">
                              {a.field_progress_comparison}%
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                {a.technical_index.toFixed(2)}
                              </div>
                              <div className="text-[11px] text-slate-500">Mutu {a.quality_score}/100</div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="font-semibold text-slate-800">{a.evaluator_name}</div>
                              <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                                {a.notes}
                              </p>
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setHistoryAssessment(a)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Riwayat ({a.history.length})</span>
                                </button>
                                {canManageTeknik && (
                                  <button
                                    type="button"
                                    onClick={() => openAssessmentEdit(a)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Update Nilai</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 1: LAPORAN EVALUASI TEKNIS ==================== */}
        {activeTab === 'evaluasi' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">1. Laporan Evaluasi Teknis</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kesesuaian pekerjaan terhadap gambar kerja &amp; spesifikasi teknis, temuan deviasi, perubahan volume/spek, dan rekomendasi perbaikan.
                </p>
              </div>
              {canManageTeknik && (
                <button
                  type="button"
                  onClick={openEvalCreate}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Evaluasi Teknis</span>
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">No. Evaluasi &amp; Proyek</th>
                      <th className="py-2.5 px-3.5 font-semibold">Paket Pekerjaan &amp; Referensi RAB/Gambar</th>
                      <th className="py-2.5 px-3.5 font-semibold">Kesesuaian &amp; Temuan</th>
                      <th className="py-2.5 px-3.5 font-semibold">Perubahan Vol/Spek &amp; Rekomendasi</th>
                      <th className="py-2.5 px-3.5 font-semibold">Status</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvaluations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Tidak ada laporan evaluasi teknis pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredEvaluations.map((ev) => {
                        const ctx = getProjectIntegrationSummary(ev.project_id);
                        return (
                          <tr key={ev.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#13233C]">{ev.eval_no}</div>
                              <div className="font-mono text-[11px] text-[#1D7AFC] font-semibold">
                                {ctx.prj?.project_number ?? ev.project_id}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatDateID(ev.evaluation_date)} · {ev.evaluator_name}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="font-semibold text-slate-900">{ev.work_package}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                RAB {formatRupiah(ctx.rabTotal, true)} · {ctx.drawingCount} Dok Gambar
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <StatusLabel status={ev.drawing_spec_compliance} />
                              <p className="text-[11px] text-slate-700 mt-1">
                                {ev.non_conformance_findings}
                              </p>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-[11px] text-slate-700">
                                <strong>Vol/Spek:</strong> {ev.volume_spec_changes}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                <strong>Rekomendasi:</strong> {ev.recommendation}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                <strong>Tindak lanjut:</strong> {ev.follow_up_action}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <StatusLabel status={ev.status} />
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <ModuleAttachmentToolbar
                                  compact
                                  moduleId="teknik"
                                  entityId={ev.id}
                                  entityLabel={`${ev.eval_no} · ${ctx.prj?.project_number || ''}`}
                                  title={`Lampiran Evaluasi ${ev.eval_no}`}
                                  defaultCategory="Laporan & Dokumentasi"
                                />
                                {canManageTeknik && (
                                  <button
                                    type="button"
                                    onClick={() => openEvalEdit(ev)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: LAPORAN KENDALA TEKNIS ==================== */}
        {activeTab === 'kendala' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  2. Laporan Kendala Teknis &amp; Tindak Lanjut Lapangan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menarik kendala dari laporan harian Tim Lapangan secara otomatis untuk ditindaklanjuti &amp; dipantau penyelesaiannya oleh Teknik.
                </p>
              </div>
              {canManageTeknik && (
                <button
                  type="button"
                  onClick={openConstraintCreate}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat Kendala Teknis</span>
                </button>
              )}
            </div>

            {filteredUnlinkedConstraints.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900">
                    Kendala Baru dari Tim Lapangan ({filteredUnlinkedConstraints.length}) — Perlu Tindak Lanjut Teknik
                  </span>
                </div>
                <div className="space-y-2">
                  {filteredUnlinkedConstraints.map((u) => {
                    const prj = projectMap.get(u.project_id);
                    return (
                      <div
                        key={u.id}
                        className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                            <span className="font-bold text-[#1D7AFC]">{prj?.project_number}</span>
                            <span>·</span>
                            <span>Sumber: {u.source_type}</span>
                            <span>·</span>
                            <span>{formatDateID(u.reported_date)}</span>
                            <span>·</span>
                            <span>Pelapor: {u.reported_by_name}</span>
                          </div>
                          <div className="font-semibold text-slate-900">{u.work_area}</div>
                          <p className="text-slate-700">{u.problem_description}</p>
                        </div>
                        {canManageTeknik && (
                          <button
                            type="button"
                            onClick={() => openConstraintFromLapangan(u)}
                            className="px-3 py-1.5 rounded-lg bg-[#13233C] hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Tindak Lanjut Teknik
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">No. Kendala &amp; Sumber</th>
                      <th className="py-2.5 px-3.5 font-semibold">Proyek &amp; Area Pekerjaan</th>
                      <th className="py-2.5 px-3.5 font-semibold">Kendala &amp; Analisis Teknik</th>
                      <th className="py-2.5 px-3.5 font-semibold">Tindak Lanjut &amp; PIC</th>
                      <th className="py-2.5 px-3.5 font-semibold">Status</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSavedConstraints.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Belum ada catatan kendala teknis tersimpan sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSavedConstraints.map((c) => {
                        const prj = projectMap.get(c.project_id);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#13233C]">{c.issue_no}</div>
                              <div className="text-[11px] text-slate-500">
                                Sumber: {c.source_type} · {formatDateID(c.reported_date)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="font-mono text-[11px] font-bold text-[#1D7AFC]">
                                {prj?.project_number ?? c.project_id}
                              </div>
                              <div className="font-semibold text-slate-900">{c.work_area}</div>
                              <div className="text-[11px] text-slate-500">Pelapor: {c.reported_by_name}</div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-slate-800">{c.problem_description}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                <strong>Analisis:</strong> {c.technical_analysis}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-slate-800">{c.follow_up_action}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                PIC: <strong>{c.pic_name}</strong>
                                {c.target_resolution_date ? ` · Target ${formatDateID(c.target_resolution_date)}` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <StatusLabel status={c.status} />
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setHistoryConstraint(c)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Riwayat ({c.history.length})</span>
                                </button>
                                {canManageTeknik && (
                                  <button
                                    type="button"
                                    onClick={() => openConstraintEdit(c)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Update</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: LAPORAN PERUBAHAN PEKERJAAN ==================== */}
        {activeTab === 'perubahan' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">3. Laporan Perubahan Pekerjaan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perubahan lingkup pekerjaan, volume atau kebutuhan material, alasan teknis, serta persetujuan Head Teknik.
                </p>
              </div>
              {canManageTeknik && (
                <button
                  type="button"
                  onClick={openChangeCreate}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajukan Perubahan Pekerjaan</span>
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">No. &amp; Proyek</th>
                      <th className="py-2.5 px-3.5 font-semibold">Kategori &amp; Perubahan Lingkup</th>
                      <th className="py-2.5 px-3.5 font-semibold">Perubahan Volume / Material</th>
                      <th className="py-2.5 px-3.5 font-semibold">Alasan &amp; Catatan Pemeriksaan</th>
                      <th className="py-2.5 px-3.5 font-semibold">Status</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredChanges.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Tidak ada laporan perubahan pekerjaan sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredChanges.map((ch) => {
                        const prj = projectMap.get(ch.project_id);
                        return (
                          <tr key={ch.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#13233C]">{ch.change_no}</div>
                              <div className="font-mono text-[11px] text-[#1D7AFC] font-semibold">
                                {prj?.project_number ?? ch.project_id}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatDateID(ch.change_date)} · {ch.requested_by_name}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-[11px] font-bold text-slate-600 uppercase">
                                {ch.change_category}
                              </div>
                              <p className="text-slate-900 mt-0.5">{ch.scope_change}</p>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs text-slate-700">
                              {ch.volume_material_change}
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-slate-800">{ch.reason}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{ch.technical_notes}</div>
                              {ch.review_note && (
                                <div className="text-[11px] text-emerald-700 mt-1">
                                  <strong>Keputusan ({ch.reviewer_name}):</strong> {ch.review_note}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <StatusLabel status={ch.status} />
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <ModuleAttachmentToolbar
                                  compact
                                  moduleId="teknik"
                                  entityId={ch.id}
                                  entityLabel={`${ch.change_no} · ${prj?.project_number || ''}`}
                                  title={`Dokumen Perubahan ${ch.change_no}`}
                                  defaultCategory="Gambar Kerja"
                                />
                                {canManageTeknik && ch.status !== 'Disetujui' && (
                                  <button
                                    type="button"
                                    onClick={() => openChangeEdit(ch)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                                {canApproveTeknikHead && ch.status !== 'Disetujui' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDecidingChange(ch);
                                      setDecideForm({ decision: 'Disetujui', review_note: '' });
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#13233C] hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    <ShieldCheck className="w-3 h-3 text-[#FBC02D]" />
                                    <span>Putuskan</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: LAPORAN PENYELESAIAN TEKNIS ==================== */}
        {activeTab === 'penyelesaian' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">4. Laporan Penyelesaian Teknis</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rekap pekerjaan selesai, hasil uji &amp; kesesuaian teknis, dokumentasi hasil akhir, catatan kekurangan, dan pengesahan Head Teknik.
                </p>
              </div>
              {canManageTeknik && (
                <button
                  type="button"
                  onClick={openCompCreate}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D7AFC] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Laporan Penyelesaian</span>
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">No. &amp; Proyek</th>
                      <th className="py-2.5 px-3.5 font-semibold">Rekap Pekerjaan Selesai &amp; Foto Lapangan</th>
                      <th className="py-2.5 px-3.5 font-semibold">Hasil Pemeriksaan</th>
                      <th className="py-2.5 px-3.5 font-semibold">Catatan Kekurangan &amp; Tindak Lanjut</th>
                      <th className="py-2.5 px-3.5 font-semibold">Status Verifikasi</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompletions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Tidak ada laporan penyelesaian teknis sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredCompletions.map((cp) => {
                        const ctx = getProjectIntegrationSummary(cp.project_id);
                        return (
                          <tr key={cp.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#13233C]">
                                {cp.completion_no}
                              </div>
                              <div className="font-mono text-[11px] text-[#1D7AFC] font-semibold">
                                {ctx.prj?.project_number ?? cp.project_id}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatDateID(cp.inspection_date)} · {cp.inspector_name}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-sm">
                              <p className="text-slate-900">{cp.completed_work_summary}</p>
                              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                                {ctx.lapanganPhotos.length} Foto Lapangan terhubung ·{' '}
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentModal({
                                      moduleId: 'teknik',
                                      entityId: cp.id,
                                      entityLabel: `${cp.completion_no} · ${ctx.prj?.project_number || ''}`,
                                      title: `Dokumentasi Akhir ${cp.completion_no}`,
                                      defaultCategory: 'Foto Lapangan',
                                    })
                                  }
                                  className="text-[#1D7AFC] underline cursor-pointer"
                                >
                                  Lampiran ({getAttachmentsFor('teknik', cp.id).length})
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <StatusLabel status={cp.inspection_result} />
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="text-slate-700">
                                <strong>Catatan:</strong> {cp.defects_and_notes}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                <strong>Tindak lanjut:</strong> {cp.follow_up_action}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <StatusLabel status={cp.status} />
                              {cp.verified_by_name && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Oleh {cp.verified_by_name}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <ModuleAttachmentToolbar
                                  compact
                                  moduleId="teknik"
                                  entityId={cp.id}
                                  entityLabel={`${cp.completion_no} · ${ctx.prj?.project_number || ''}`}
                                  title={`Dokumentasi Penyelesaian ${cp.completion_no}`}
                                  defaultCategory="Foto Lapangan"
                                />
                                {canManageTeknik && cp.status !== 'Selesai' && (
                                  <button
                                    type="button"
                                    onClick={() => openCompEdit(cp)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                                {canApproveTeknikHead && cp.status !== 'Selesai' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVerifyingComp(cp);
                                      setVerifyNote(
                                        cp.follow_up_action === '-' ? '' : cp.follow_up_action
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Verifikasi Selesai</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== MODAL: INPUT / UPDATE INDEKS PROGRES TEKNIK ==================== */}
      <Modal
        open={assessModalOpen}
        onClose={() => setAssessModalOpen(false)}
        title={
          editingAssessment
            ? `Perbarui Indeks Nilai Progres Teknik — ${editingAssessment.assessment_no}`
            : 'Input Realisasi Indeks Nilai Progres Teknik'
        }
        subtitle="Nilai progres Teknik dinilai independen dari laporan fisik Tim Lapangan dan dicatat ke riwayat evaluasi."
        maxWidth="max-w-xl"
      >
        <form onSubmit={submitAssessment} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                value={assessForm.project_id}
                disabled={Boolean(editingAssessment)}
                onChange={(e) => setAssessForm({ ...assessForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Periode Bulan (YYYY-MM) *</label>
              <input
                type="month"
                value={assessForm.period_month}
                disabled={Boolean(editingAssessment)}
                onChange={(e) => setAssessForm({ ...assessForm, period_month: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
                required
              />
            </div>
          </div>

          {/* Read-only Comparison Reference from Tim Lapangan */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-emerald-900">
                Pembanding Progres Fisik Tim Lapangan (Read-Only)
              </div>
              <div className="text-[11px] text-emerald-700">
                Hanya sebagai referensi pembanding — tidak menimpa nilai progres Teknik maupun sebaliknya.
              </div>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-800 tabular-nums">
              {selectedAssessProject ? `${selectedAssessProject.progress_percent}%` : '0%'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Progres (%) *</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={assessForm.target_progress_percent}
                onChange={(e) =>
                  setAssessForm({ ...assessForm, target_progress_percent: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-[#1D7AFC] mb-1">
                Nilai Progres Teknik (%) *
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={assessForm.teknik_progress_percent}
                onChange={(e) =>
                  setAssessForm({ ...assessForm, teknik_progress_percent: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-blue-400 rounded-lg font-mono font-bold text-[#1D7AFC]"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Skor Mutu (0–100) *</label>
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                value={assessForm.quality_score}
                onChange={(e) =>
                  setAssessForm({ ...assessForm, quality_score: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Evaluasi *</label>
              <input
                type="date"
                value={assessForm.evaluation_date}
                onChange={(e) => setAssessForm({ ...assessForm, evaluation_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-slate-600 font-medium">Indeks Kinerja Teknis Otomatis</span>
              <span className="font-mono font-bold text-sm text-[#13233C] tabular-nums">
                {assessForm.target_progress_percent > 0
                  ? (assessForm.teknik_progress_percent / assessForm.target_progress_percent).toFixed(2)
                  : '1.00'}
              </span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Catatan Penilaian Teknis *
            </label>
            <textarea
              rows={3}
              value={assessForm.notes}
              onChange={(e) => setAssessForm({ ...assessForm, notes: e.target.value })}
              placeholder="Jelaskan dasar verifikasi teknis, deviasi terhadap gambar/target, dan catatan mutu..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAssessModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Penilaian Teknik'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: RIWAYAT PENILAIAN PROGRES TEKNIK ==================== */}
      <Modal
        open={Boolean(historyAssessment)}
        onClose={() => setHistoryAssessment(null)}
        title={`Riwayat Penilaian — ${historyAssessment?.assessment_no ?? ''}`}
        subtitle={
          historyAssessment
            ? `${projectMap.get(historyAssessment.project_id)?.project_number || ''} · Periode ${historyAssessment.period_month}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {historyAssessment && (
          <div className="space-y-3 text-xs">
            {(historyAssessment.history || []).map((h) => (
              <div key={h.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#13233C]">
                    {h.action} · {h.actor_name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatDateTimeID(h.timestamp)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-slate-700">
                  <span>Target: {h.target_progress_percent}%</span>
                  <span className="font-bold text-[#1D7AFC]">
                    Nilai Teknik: {h.teknik_progress_percent}%
                  </span>
                  <span className="text-emerald-700">
                    Pembanding Lapangan: {h.field_progress_comparison}%
                  </span>
                  <span>Indeks: {h.technical_index.toFixed(2)}</span>
                  <span>Mutu: {h.quality_score}/100</span>
                </div>
                <p className="text-slate-700">{h.note}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: EVALUASI TEKNIS ==================== */}
      <Modal
        open={evalModalOpen}
        onClose={() => setEvalModalOpen(false)}
        title={
          editingEval
            ? `Perbarui Evaluasi Teknis — ${editingEval.eval_no}`
            : 'Buat Laporan Evaluasi Teknis'
        }
        subtitle="Penilaian kesesuaian pekerjaan terhadap gambar kerja & spesifikasi teknis proyek."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={submitEval} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                value={evalForm.project_id}
                onChange={(e) => setEvalForm({ ...evalForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Evaluasi *</label>
              <input
                type="date"
                value={evalForm.evaluation_date}
                onChange={(e) => setEvalForm({ ...evalForm, evaluation_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
          </div>

          <div className="bg-[#F4F7FC] border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600 flex flex-wrap gap-3 font-mono">
            <span>RAB: {formatRupiah(selectedEvalContext.rabTotal, true)} ({selectedEvalContext.rabItemsCount} pos)</span>
            <span>·</span>
            <span>Jadwal: {formatDateID(selectedEvalContext.scheduleStart)} – {formatDateID(selectedEvalContext.scheduleEnd)}</span>
            <span>·</span>
            <span>Dokumen Gambar: {selectedEvalContext.drawingCount} file</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Paket / Item Pekerjaan *</label>
              <input
                type="text"
                value={evalForm.work_package}
                onChange={(e) => setEvalForm({ ...evalForm, work_package: e.target.value })}
                placeholder="Mis. Rangka Atap Baja Ringan & Plafon"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kesesuaian Gambar Kerja &amp; Spek *
              </label>
              <select
                value={evalForm.drawing_spec_compliance}
                onChange={(e) =>
                  setEvalForm({
                    ...evalForm,
                    drawing_spec_compliance: e.target.value as TeknikConformanceStatus,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Sesuai">Sesuai</option>
                <option value="Perlu Perbaikan">Perlu Perbaikan</option>
                <option value="Tidak Sesuai">Tidak Sesuai</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Temuan Ketidaksesuaian</label>
            <textarea
              rows={2}
              value={evalForm.non_conformance_findings}
              onChange={(e) => setEvalForm({ ...evalForm, non_conformance_findings: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Perubahan Volume / Spesifikasi</label>
            <textarea
              rows={2}
              value={evalForm.volume_spec_changes}
              onChange={(e) => setEvalForm({ ...evalForm, volume_spec_changes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Rekomendasi Teknis</label>
              <textarea
                rows={2}
                value={evalForm.recommendation}
                onChange={(e) => setEvalForm({ ...evalForm, recommendation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tindak Lanjut Perbaikan</label>
              <textarea
                rows={2}
                value={evalForm.follow_up_action}
                onChange={(e) => setEvalForm({ ...evalForm, follow_up_action: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Status Tindak Lanjut</label>
            <select
              value={evalForm.status}
              onChange={(e) =>
                setEvalForm({ ...evalForm, status: e.target.value as TeknikFollowUpStatus })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="Terbuka">Terbuka</option>
              <option value="Dalam Penanganan">Dalam Penanganan</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEvalModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Evaluasi Teknis'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: KENDALA TEKNIS ==================== */}
      <Modal
        open={conModalOpen}
        onClose={() => setConModalOpen(false)}
        title={
          editingConstraint
            ? `Perbarui Kendala Teknis — ${editingConstraint.issue_no}`
            : 'Catat & Tindak Lanjut Kendala Teknis'
        }
        subtitle="Kelola kendala teknis dari laporan Tim Lapangan maupun temuan pelaksanaan di proyek."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={submitConstraint} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                value={conForm.project_id}
                onChange={(e) => setConForm({ ...conForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Lapor *</label>
              <input
                type="date"
                value={conForm.reported_date}
                onChange={(e) => setConForm({ ...conForm, reported_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status Penyelesaian *</label>
              <select
                value={conForm.status}
                onChange={(e) =>
                  setConForm({ ...conForm, status: e.target.value as TeknikFollowUpStatus })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Terbuka">Terbuka</option>
                <option value="Dalam Penanganan">Dalam Penanganan</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Area Pekerjaan *</label>
              <input
                type="text"
                value={conForm.work_area}
                onChange={(e) => setConForm({ ...conForm, work_area: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">PIC Penanganan *</label>
              <input
                type="text"
                value={conForm.pic_name}
                onChange={(e) => setConForm({ ...conForm, pic_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Permasalahan Teknis *</label>
            <textarea
              rows={2}
              value={conForm.problem_description}
              onChange={(e) => setConForm({ ...conForm, problem_description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Analisis Teknis</label>
            <textarea
              rows={2}
              value={conForm.technical_analysis}
              onChange={(e) => setConForm({ ...conForm, technical_analysis: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Tindak Lanjut Teknik *</label>
              <textarea
                rows={2}
                value={conForm.follow_up_action}
                onChange={(e) => setConForm({ ...conForm, follow_up_action: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Selesai</label>
              <input
                type="date"
                value={conForm.target_resolution_date}
                onChange={(e) =>
                  setConForm({ ...conForm, target_resolution_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setConModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Kendala Teknis'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: RIWAYAT KENDALA TEKNIS ==================== */}
      <Modal
        open={Boolean(historyConstraint)}
        onClose={() => setHistoryConstraint(null)}
        title={`Riwayat Tindak Lanjut — ${historyConstraint?.issue_no ?? ''}`}
        subtitle={historyConstraint?.work_area}
        maxWidth="max-w-lg"
      >
        {historyConstraint && (
          <div className="space-y-2.5 text-xs">
            {(historyConstraint.history || []).map((h, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <StatusLabel status={h.status} />
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatDateTimeID(h.timestamp)}
                  </span>
                </div>
                <div className="font-semibold text-slate-800">{h.actor_name}</div>
                <p className="text-slate-700">{h.note}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: PERUBAHAN PEKERJAAN ==================== */}
      <Modal
        open={chgModalOpen}
        onClose={() => setChgModalOpen(false)}
        title={
          editingChange
            ? `Perbarui Perubahan Pekerjaan — ${editingChange.change_no}`
            : 'Ajukan Laporan Perubahan Pekerjaan'
        }
        subtitle="Catat perubahan lingkup, volume, atau kebutuhan material untuk diperiksa Head Teknik."
        maxWidth="max-w-xl"
      >
        <form onSubmit={submitChange} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                value={chgForm.project_id}
                onChange={(e) => setChgForm({ ...chgForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal *</label>
              <input
                type="date"
                value={chgForm.change_date}
                onChange={(e) => setChgForm({ ...chgForm, change_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kategori *</label>
              <select
                value={chgForm.change_category}
                onChange={(e) =>
                  setChgForm({
                    ...chgForm,
                    change_category: e.target.value as TeknikChangeReport['change_category'],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Lingkup Pekerjaan">Lingkup Pekerjaan</option>
                <option value="Volume Pekerjaan">Volume Pekerjaan</option>
                <option value="Kebutuhan Material">Kebutuhan Material</option>
                <option value="Spesifikasi Teknis">Spesifikasi Teknis</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Perubahan Lingkup Pekerjaan *</label>
            <textarea
              rows={2}
              value={chgForm.scope_change}
              onChange={(e) => setChgForm({ ...chgForm, scope_change: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Perubahan Volume / Kebutuhan Material *
            </label>
            <textarea
              rows={2}
              value={chgForm.volume_material_change}
              onChange={(e) => setChgForm({ ...chgForm, volume_material_change: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Alasan Perubahan *</label>
            <textarea
              rows={2}
              value={chgForm.reason}
              onChange={(e) => setChgForm({ ...chgForm, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan Teknis</label>
            <textarea
              rows={2}
              value={chgForm.technical_notes}
              onChange={(e) => setChgForm({ ...chgForm, technical_notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setChgModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Perubahan Pekerjaan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: PUTUSKAN PERUBAHAN PEKERJAAN (HEAD) ==================== */}
      <Modal
        open={Boolean(decidingChange)}
        onClose={() => setDecidingChange(null)}
        title={`Pemeriksaan Perubahan Pekerjaan — ${decidingChange?.change_no ?? ''}`}
        subtitle={decidingChange?.scope_change}
        maxWidth="max-w-lg"
      >
        {decidingChange && (
          <form onSubmit={submitChangeDecision} className="space-y-3.5 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div>
                <strong>Volume / Material:</strong> {decidingChange.volume_material_change}
              </div>
              <div>
                <strong>Alasan:</strong> {decidingChange.reason}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Keputusan Head Teknik *</label>
              <select
                value={decideForm.decision}
                onChange={(e) =>
                  setDecideForm({
                    ...decideForm,
                    decision: e.target.value as Exclude<TeknikChangeStatus, 'Menunggu Pemeriksaan'>,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Disetujui">Disetujui</option>
                <option value="Revisi">Kembalikan untuk Revisi</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan Pemeriksaan *</label>
              <textarea
                rows={3}
                value={decideForm.review_note}
                onChange={(e) => setDecideForm({ ...decideForm, review_note: e.target.value })}
                placeholder="Tuliskan dasar keputusan pemeriksaan teknis..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDecidingChange(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 bg-[#13233C] hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                {workflowBusy ? 'Memproses...' : 'Simpan Keputusan'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ==================== MODAL: PENYELESAIAN TEKNIS ==================== */}
      <Modal
        open={compModalOpen}
        onClose={() => setCompModalOpen(false)}
        title={
          editingComp
            ? `Perbarui Penyelesaian Teknis — ${editingComp.completion_no}`
            : 'Buat Laporan Penyelesaian Teknis'
        }
        subtitle="Rekap pekerjaan selesai, hasil uji kesesuaian, dokumentasi akhir, dan catatan kekurangan."
        maxWidth="max-w-xl"
      >
        <form onSubmit={submitComp} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proyek *</label>
              <select
                value={compForm.project_id}
                onChange={(e) => setCompForm({ ...compForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Pemeriksaan *</label>
              <input
                type="date"
                value={compForm.inspection_date}
                onChange={(e) => setCompForm({ ...compForm, inspection_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                required
              />
            </div>
          </div>

          <div className="bg-[#F4F7FC] border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600 font-mono">
            Integrasi Lapangan: {selectedCompContext.lapanganPhotos.length} foto dokumentasi tersedia · Progres Fisik{' '}
            {selectedCompContext.prj?.progress_percent ?? 0}%
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rekap Pekerjaan yang Telah Selesai *
            </label>
            <textarea
              rows={3}
              value={compForm.completed_work_summary}
              onChange={(e) =>
                setCompForm({ ...compForm, completed_work_summary: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Hasil Pemeriksaan Kesesuaian *
              </label>
              <select
                value={compForm.inspection_result}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    inspection_result: e.target.value as TeknikCompletionInspectionResult,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Lulus Uji & Sesuai">Lulus Uji &amp; Sesuai</option>
                <option value="Lulus Bersyarat">Lulus Bersyarat</option>
                <option value="Perlu Perbaikan">Perlu Perbaikan</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status Laporan</label>
              <select
                value={compForm.status}
                onChange={(e) =>
                  setCompForm({ ...compForm, status: e.target.value as TeknikCompletionStatus })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Draft">Draft</option>
                <option value="Menunggu Verifikasi">Menunggu Verifikasi</option>
                {canApproveTeknikHead && <option value="Selesai">Selesai (Terverifikasi)</option>}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan Kekurangan</label>
            <textarea
              rows={2}
              value={compForm.defects_and_notes}
              onChange={(e) => setCompForm({ ...compForm, defects_and_notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tindak Lanjut Pemeriksaan</label>
            <textarea
              rows={2}
              value={compForm.follow_up_action}
              onChange={(e) => setCompForm({ ...compForm, follow_up_action: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCompModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={workflowBusy}
              className="px-4 py-2 bg-[#1D7AFC] hover:bg-blue-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
            >
              {workflowBusy ? 'Menyimpan...' : 'Simpan Laporan Penyelesaian'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: VERIFIKASI PENYELESAIAN (HEAD) ==================== */}
      <Modal
        open={Boolean(verifyingComp)}
        onClose={() => setVerifyingComp(null)}
        title={`Verifikasi Penyelesaian Teknis — ${verifyingComp?.completion_no ?? ''}`}
        subtitle="Pengesahan hasil pemeriksaan teknis oleh Head Teknik / Super Admin."
        maxWidth="max-w-lg"
      >
        {verifyingComp && (
          <form onSubmit={submitVerifyComp} className="space-y-3.5 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-slate-900">{verifyingComp.completed_work_summary}</div>
              <div className="text-slate-600">Hasil Uji: {verifyingComp.inspection_result}</div>
              <div className="text-slate-600">Catatan Kekurangan: {verifyingComp.defects_and_notes}</div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Final / Tindak Lanjut Pengesahan
              </label>
              <textarea
                rows={2}
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVerifyingComp(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={workflowBusy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                {workflowBusy ? 'Memverifikasi...' : 'Sahkan Selesai'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ==================== MODAL: DETAIL LAPORAN PROYEK TERPADU ==================== */}
      <Modal
        open={Boolean(detailProject)}
        onClose={() => setDetailProject(null)}
        title={
          detailProject
            ? `Detail Laporan Proyek — ${detailProject.project_number}`
            : 'Detail Laporan Proyek'
        }
        subtitle={detailProject?.name}
        maxWidth="max-w-5xl"
      >
        {detailProject && detailContext && (
          <div className="space-y-4 text-xs">
            {/* Project selector inside dossier */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <label className="font-semibold text-slate-600">Pilih Proyek:</label>
                <select
                  value={detailProject.id}
                  onChange={(e) => {
                    const next = projectMap.get(e.target.value);
                    if (next) setDetailProject(next);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <StatusLabel status={detailProject.status} />
            </div>

            {/* Integrated Management Proyek & Lapangan Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                <span className="text-[11px] text-slate-500">Anggaran RAB Proyek</span>
                <div className="font-mono font-bold text-sm text-slate-900 mt-0.5 tabular-nums">
                  {formatRupiah(detailContext.rabTotal, true)}
                </div>
                <span className="text-[11px] text-slate-500">
                  {detailContext.rabItemsCount} pos pekerjaan
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                <span className="text-[11px] text-slate-500">Jadwal Pelaksanaan</span>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {formatDateID(detailContext.scheduleStart)} – {formatDateID(detailContext.scheduleEnd)}
                </div>
                <span className="text-[11px] text-slate-500">Sumber: Manajemen Proyek</span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-blue-50/70">
                <span className="text-[11px] text-[#1D7AFC] font-semibold">Nilai Progres Teknik Terbaru</span>
                <div className="font-mono font-bold text-sm text-[#1D7AFC] mt-0.5 tabular-nums">
                  {(() => {
                    const prjAss = assessments
                      .filter((a) => a.project_id === detailProject.id)
                      .sort((a, b) => (a.period_month > b.period_month ? 1 : -1));
                    const latest = prjAss[prjAss.length - 1];
                    return latest
                      ? `${latest.teknik_progress_percent}% (Indeks ${latest.technical_index.toFixed(2)})`
                      : 'Belum dinilai';
                  })()}
                </div>
                <span className="text-[11px] text-slate-500">Terpisah dari Lapangan</span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-emerald-50/60">
                <span className="text-[11px] text-emerald-800 font-semibold">Pembanding Fisik Lapangan</span>
                <div className="font-mono font-bold text-sm text-emerald-800 mt-0.5 tabular-nums">
                  {detailProject.progress_percent}%
                </div>
                <span className="text-[11px] text-emerald-700">
                  {detailContext.wf?.field_reports.length || 0} laporan · {detailContext.lapanganPhotos.length} foto
                </span>
              </div>
            </div>

            {/* Photos & Documents Strip */}
            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-[#1D7AFC]" />
                  <span>Dokumentasi Gambar Kerja &amp; Foto Lapangan ({detailContext.allAttachments.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    openAttachmentModal({
                      moduleId: 'teknik',
                      entityId: detailProject.id,
                      entityLabel: `${detailProject.project_number} · ${detailProject.name}`,
                      title: `Dokumen & Gambar ${detailProject.project_number}`,
                      defaultCategory: 'Gambar Kerja',
                    })
                  }
                  className="text-[11px] font-semibold text-[#1D7AFC] underline cursor-pointer"
                >
                  Kelola Lampiran Proyek
                </button>
              </div>
              {detailContext.lapanganPhotos.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {detailContext.lapanganPhotos.slice(0, 6).map((photo) => (
                    <div
                      key={photo.id}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-slate-100 h-16"
                    >
                      <ProtectedAttachmentImage
                        attachment={photo}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  {detailContext.allAttachments.length > 0
                    ? `${detailContext.allAttachments.length} dokumen teknik/proyek terlampir pada penyimpanan server.`
                    : 'Belum ada foto lapangan terunggah; gambar teknik dapat ditambahkan melalui Kelola Lampiran Proyek.'}
                </p>
              )}
            </div>

            {/* Period-by-period Teknik vs Lapangan Progress Table inside Detail Laporan Proyek */}
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-900">
                  Riwayat Evaluasi Progres Teknik vs Pembanding Fisik Lapangan
                </h4>
                <span className="text-[11px] text-slate-500">
                  Data progres Lapangan dan nilai evaluasi Teknik tersimpan terpisah
                </span>
              </div>
              {assessments.filter((a) => a.project_id === detailProject.id).length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Belum ada penilaian Indeks Progres Teknik untuk proyek ini.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-1.5 px-2.5 font-semibold">Periode &amp; Tgl</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Target</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Nilai Teknik</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Pembanding Lapangan</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Indeks / Mutu</th>
                        <th className="py-1.5 px-2.5 font-semibold">Penilai &amp; Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assessments
                        .filter((a) => a.project_id === detailProject.id)
                        .sort((a, b) => (a.period_month < b.period_month ? 1 : -1))
                        .map((a) => (
                          <tr key={a.id}>
                            <td className="py-1.5 px-2.5 font-mono whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{a.period_month}</div>
                              <div className="text-slate-500">{formatDateID(a.evaluation_date)}</div>
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums">
                              {a.target_progress_percent}%
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-bold text-[#1D7AFC]">
                              {a.teknik_progress_percent}%
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                              {a.field_progress_comparison}%
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              {a.technical_index.toFixed(2)} · {a.quality_score}/100
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-700">
                              <strong>{a.evaluator_name}:</strong> {a.notes}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Consolidated 4 Reports Summary for Project */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <h4 className="font-bold text-slate-900">Evaluasi Teknis Proyek</h4>
                {evaluations.filter((e) => e.project_id === detailProject.id).length === 0 ? (
                  <p className="text-[11px] text-slate-500">Belum ada evaluasi teknis.</p>
                ) : (
                  evaluations
                    .filter((e) => e.project_id === detailProject.id)
                    .map((e) => (
                      <div key={e.id} className="border-t border-slate-100 pt-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[#1D7AFC]">{e.eval_no}</span>
                          <StatusLabel status={e.drawing_spec_compliance} />
                        </div>
                        <div className="font-semibold text-slate-800">{e.work_package}</div>
                        <p className="text-[11px] text-slate-600">{e.recommendation}</p>
                      </div>
                    ))
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <h4 className="font-bold text-slate-900">Kendala Teknis Proyek</h4>
                {savedConstraints.filter((c) => c.project_id === detailProject.id).length === 0 ? (
                  <p className="text-[11px] text-slate-500">Belum ada catatan kendala teknis.</p>
                ) : (
                  savedConstraints
                    .filter((c) => c.project_id === detailProject.id)
                    .map((c) => (
                      <div key={c.id} className="border-t border-slate-100 pt-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[#13233C]">{c.issue_no}</span>
                          <StatusLabel status={c.status} />
                        </div>
                        <div className="font-semibold text-slate-800">{c.work_area}</div>
                        <p className="text-[11px] text-slate-600">{c.follow_up_action}</p>
                      </div>
                    ))
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <h4 className="font-bold text-slate-900">Perubahan Pekerjaan</h4>
                {changes.filter((c) => c.project_id === detailProject.id).length === 0 ? (
                  <p className="text-[11px] text-slate-500">Belum ada perubahan pekerjaan.</p>
                ) : (
                  changes
                    .filter((c) => c.project_id === detailProject.id)
                    .map((c) => (
                      <div key={c.id} className="border-t border-slate-100 pt-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[#13233C]">{c.change_no}</span>
                          <StatusLabel status={c.status} />
                        </div>
                        <div className="font-semibold text-slate-800">{c.scope_change}</div>
                        <p className="text-[11px] text-slate-600">{c.volume_material_change}</p>
                      </div>
                    ))
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <h4 className="font-bold text-slate-900">Penyelesaian Teknis</h4>
                {completions.filter((c) => c.project_id === detailProject.id).length === 0 ? (
                  <p className="text-[11px] text-slate-500">Belum ada laporan penyelesaian teknis.</p>
                ) : (
                  completions
                    .filter((c) => c.project_id === detailProject.id)
                    .map((c) => (
                      <div key={c.id} className="border-t border-slate-100 pt-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[#13233C]">
                            {c.completion_no}
                          </span>
                          <StatusLabel status={c.status} />
                        </div>
                        <div className="font-semibold text-slate-800">{c.inspection_result}</div>
                        <p className="text-[11px] text-slate-600">{c.completed_work_summary}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};
