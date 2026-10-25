import React, { useState, useEffect } from 'react';
import { api } from '../api';
import type { DocumentResponse, CaseDocket } from '../api';
import {
  ShieldAlert,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ArrowUpRight,
  Gavel,
  Check,
  Copy,
  ArrowLeft,
} from 'lucide-react';

interface DocumentsViewProps {
  activeCase?: CaseDocket | null;
  initialAccountId?: string;
  initialDocType?: 'freeze_requisition' | 'case_diary';
  onInvestigateAccount?: (accountId: string) => void;
  onGoBack?: () => void;
  onNavigateToCases?: () => void;
}

// Bank prefix resolution dictionary
const BANK_PREFIX_MAP: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  CANR: 'Canara Bank',
  UBIN: 'Union Bank of India',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC FIRST Bank',
  YESB: 'Yes Bank',
  AIRP: 'Airtel Payments Bank',
  PYTM: 'Paytm Payments Bank',
  IPOS: 'India Post Payments Bank',
  BKID: 'Bank of India',
  CBIN: 'Central Bank of India',
  IOBA: 'Indian Overseas Bank',
  IDIB: 'Indian Bank',
  MAHB: 'Bank of Maharashtra',
};

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  activeCase,
  initialAccountId,
  initialDocType = 'freeze_requisition',
  onInvestigateAccount,
  onGoBack,
  onNavigateToCases,
}) => {
  // Document selector tab
  const [activeDocType, setActiveDocType] = useState<'freeze_requisition' | 'case_diary'>(initialDocType);

  // Common metadata initialized from officer profile if present
  const [officerName, setOfficerName] = useState(() => {
    try {
      const saved = localStorage.getItem('anvitrace_officer');
      if (saved) return JSON.parse(saved).name || 'Inspector Vikram Sharma';
    } catch {}
    return 'Inspector Vikram Sharma';
  });

  const [officerDesignation, setOfficerDesignation] = useState(() => {
    try {
      const saved = localStorage.getItem('anvitrace_officer');
      if (saved) {
        const o = JSON.parse(saved);
        return `${o.role || 'Forensic Investigator'} (${o.badge || 'CY-8842'}) • ${o.department || 'Cyber Crime Division'}`;
      }
    } catch {}
    return 'Lead Cyber Forensic Investigator (CY-8842) • Cyber Crime Division';
  });

  const formatCaseReference = (c: CaseDocket | null | undefined): string => {
    if (!c) return '';
    return `${c.id || ''} ${c.title ? '- ' + c.title : ''} ${c.act ? '(' + c.act + ')' : ''}`.trim();
  };

  const [caseReference, setCaseReference] = useState(() => formatCaseReference(activeCase));

  // Freeze requisition state (Sec. 102 CrPC)
  const [freezeTarget, setFreezeTarget] = useState(() => initialAccountId || activeCase?.targetAccount || '');
  const [bankName, setBankName] = useState(() => {
    const acc = initialAccountId || activeCase?.targetAccount || '';
    if (acc) {
      const pfx = acc.slice(0, 4).toUpperCase();
      return BANK_PREFIX_MAP[pfx] || '';
    }
    return '';
  });
  const [freezeLoading, setFreezeLoading] = useState(false);

  // Case diary state (Rule 172 CrPC)
  const [diaryVictim, setDiaryVictim] = useState(() => initialAccountId || activeCase?.targetAccount || '');
  const [diaryLoading, setDiaryLoading] = useState(false);

  // Latest generated callout banner (supports both notice and case diary)
  const [latestGenerated, setLatestGenerated] = useState<{
    doc: DocumentResponse;
    target: string;
    bank?: string;
    type: 'freeze_requisition' | 'case_diary';
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

  // Case-isolated generated documents list
  const [generatedDocs, setGeneratedDocs] = useState<Array<{
    type: 'freeze_requisition' | 'case_diary';
    target: string;
    doc: DocumentResponse;
    bank?: string;
    timestamp?: string;
  }>>(() => {
    if (!activeCase?.id) return [];
    try {
      const saved = localStorage.getItem(`anvitrace_case_docs_${activeCase.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const getHasCases = (): boolean => {
    try {
      const saved = localStorage.getItem('anvitrace_cases');
      if (!saved) return false;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  };

  // Re-synchronize state whenever activeCase or initialAccountId changes
  useEffect(() => {
    setLatestGenerated(null);
    setError(null);
    setSuccessMsg(null);

    if (!getHasCases() || !activeCase?.id) {
      setCaseReference('');
      setFreezeTarget('');
      setDiaryVictim('');
      setBankName('');
      setGeneratedDocs([]);
      return;
    }

    setCaseReference(formatCaseReference(activeCase));
    const targetAcc = initialAccountId || activeCase.targetAccount || '';
    setFreezeTarget(targetAcc);
    setDiaryVictim(targetAcc);
    if (targetAcc) {
      const pfx = targetAcc.slice(0, 4).toUpperCase();
      setBankName(BANK_PREFIX_MAP[pfx] || '');
    } else {
      setBankName('');
    }

    try {
      const saved = localStorage.getItem(`anvitrace_case_docs_${activeCase.id}`);
      setGeneratedDocs(saved ? JSON.parse(saved) : []);
    } catch {
      setGeneratedDocs([]);
    }
  }, [activeCase?.id, activeCase?.datasetId, initialAccountId]);

  // Auto-detect bank when target changes
  const handleTargetChange = (val: string) => {
    setFreezeTarget(val);
    const pfx = val.trim().slice(0, 4).toUpperCase();
    if (BANK_PREFIX_MAP[pfx] && (!bankName || Object.values(BANK_PREFIX_MAP).includes(bankName))) {
      setBankName(BANK_PREFIX_MAP[pfx]);
    }
  };

  // Sync initialDocType if updated
  useEffect(() => {
    if (initialDocType) {
      setActiveDocType(initialDocType);
    }
  }, [initialDocType]);

  const saveGeneratedDocs = (docs: Array<{
    type: 'freeze_requisition' | 'case_diary';
    target: string;
    doc: DocumentResponse;
    bank?: string;
    timestamp?: string;
  }>) => {
    setGeneratedDocs(docs);
    if (!activeCase?.id) return;
    try {
      localStorage.setItem(`anvitrace_case_docs_${activeCase.id}`, JSON.stringify(docs));
    } catch (e) {
      console.warn('Failed to save case documents to localStorage', e);
    }
  };

  const handleClearDocuments = () => {
    if (window.confirm('Clear all stored generated statutory legal records for this case?')) {
      saveGeneratedDocs([]);
      setLatestGenerated(null);
    }
  };

  const handleGenerateFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = freezeTarget.trim();
    if (!target) {
      setError('Please enter a target account ID to freeze.');
      return;
    }
    if (!activeCase?.datasetId) {
      setError(`No dataset uploaded for case ${activeCase?.id || ''}. Please upload an evidence CSV first.`);
      return;
    }

    setFreezeLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const resp = await api.generateFreezeRequisition({
        targetAccountId: target,
        datasetId: activeCase.datasetId,
        bankName: bankName.trim() || undefined,
        requestingOfficer: officerName.trim() || undefined,
        requestingDesignation: officerDesignation.trim() || undefined,
        caseReference: caseReference.trim() || undefined,
      });

      const resolvedBank = bankName.trim() || resp.evidence_summary?.bank_name || 'Verified Banking Institution';

      const newEntry = {
        type: 'freeze_requisition' as const,
        target: target,
        bank: resolvedBank,
        doc: resp,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      const updated = [newEntry, ...generatedDocs];
      saveGeneratedDocs(updated);
      setLatestGenerated({ doc: resp, target, bank: resolvedBank, type: 'freeze_requisition' });
      setSuccessMsg(`Section 102 CrPC Freeze Notice successfully synthesized for account: ${target} (${resolvedBank})`);
    } catch (err: any) {
      setError(`Failed to generate bank freeze notice: ${err.message}`);
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleGenerateDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = diaryVictim.trim();
    if (!target) {
      setError('Please enter a victim account ID.');
      return;
    }
    if (!activeCase?.datasetId) {
      setError(`No dataset uploaded for case ${activeCase?.id || ''}. Please upload an evidence CSV first.`);
      return;
    }

    setDiaryLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const resp = await api.generateCaseDiary({
        victimAccount: target,
        datasetId: activeCase.datasetId,
        officerName: officerName.trim() || undefined,
        officerDesignation: officerDesignation.trim() || undefined,
        caseReference: caseReference.trim() || undefined,
      });

      const newEntry = {
        type: 'case_diary' as const,
        target: target,
        doc: resp,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      const updated = [newEntry, ...generatedDocs];
      saveGeneratedDocs(updated);
      setLatestGenerated({ doc: resp, target, type: 'case_diary' });
      setSuccessMsg(`Rule 172 CrPC Case Diary compiled successfully for victim account: ${target}`);
    } catch (err: any) {
      setError(`Case diary generation failed: ${err.message}`);
    } finally {
      setDiaryLoading(false);
    }
  };

  const copyDocId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedDocId(id);
    setTimeout(() => setCopiedDocId(null), 2000);
  };

  if (!getHasCases() || !activeCase) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-6 select-none animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto shadow-xs">
            <Gavel size={32} />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <span className="text-[11px] font-bold tracking-wider text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 uppercase">
              Case Docket Required
            </span>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              No Active Case Selected
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Select a case and upload or associate the required investigation data before accessing case-specific legal documents.
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onNavigateToCases || onGoBack}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2"
            >
              <FileText size={16} />
              <span>Select or Create Case</span>
            </button>
            {onGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Go Back
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 select-none max-w-7xl mx-auto">
      {/* Header Deck */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {onGoBack && (
                <button
                  type="button"
                  onClick={onGoBack}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-200 transition-colors cursor-pointer mr-1 group shadow-2xs"
                  title="Go back to previous screen"
                >
                  <ArrowLeft size={13} className="text-slate-500 group-hover:text-slate-800 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Back</span>
                </button>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">
              Legal Documents
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate Sec. 102 CrPC bank freeze requisitions and Rule 172 CrPC case diaries
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold font-mono">
              CASE: {activeCase.id}
            </span>
            <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs ${
              activeCase.datasetId ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}>
              <CheckCircle2 size={15} className={activeCase.datasetId ? 'text-emerald-600' : 'text-amber-600'} />
              <span>{activeCase.datasetId ? `DS: ${activeCase.datasetId}` : 'No Dataset'}</span>
            </span>
          </div>
        </div>

        {/* Executive Differentiator & Segmented Selector for Bank Freeze & Case Diary */}
        <div className="pt-4 border-t border-slate-200/90">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Select Document Type
            </span>
            <span className="text-[11px] font-mono font-medium text-slate-500">
              Active: <strong className={activeDocType === 'freeze_requisition' ? 'text-rose-700' : 'text-amber-700'}>
                {activeDocType === 'freeze_requisition' ? 'Sec. 102 Bank Freeze' : 'Rule 172 Case Diary'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch relative">
            {/* OPTION 1: Bank Freeze Requisition */}
            <button
              type="button"
              id="doc-tab-freeze"
              onClick={() => setActiveDocType('freeze_requisition')}
              className={`group relative flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer hover-lift active:scale-[0.99] ${
                activeDocType === 'freeze_requisition'
                  ? 'bg-gradient-to-br from-rose-50/95 via-white to-rose-50/40 border-rose-500 shadow-sm ring-3 ring-rose-500/15'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-rose-200 text-slate-700 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                    activeDocType === 'freeze_requisition'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-600 border border-rose-200/80'
                  }`}
                >
                  <Gavel size={19} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 tracking-tight">
                      Bank Freeze Requisition
                    </span>
                    <span
                      className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-md border tracking-wider uppercase ${
                        activeDocType === 'freeze_requisition'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      Sec. 102 CrPC
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-1">
                    Direct order to freeze debit transactions on suspect account
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0 ml-3 flex items-center gap-1.5">
                {activeDocType === 'freeze_requisition' ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/90 px-2 py-1 rounded-lg border border-rose-300">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    <span>ACTIVE</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-800 px-2.5 py-1 rounded-lg bg-slate-100/70 border border-slate-200 group-hover:border-slate-300 transition-colors">
                    Select
                  </span>
                )}
              </div>

              {/* Bottom active accent line */}
              {activeDocType === 'freeze_requisition' && (
                <div className="absolute -bottom-[2px] left-6 right-6 h-[3px] bg-rose-600 rounded-full" />
              )}
            </button>

            {/* OPTION 2: Rule 172 Case Diary */}
            <button
              type="button"
              id="doc-tab-diary"
              onClick={() => setActiveDocType('case_diary')}
              className={`group relative flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer hover-lift active:scale-[0.99] ${
                activeDocType === 'case_diary'
                  ? 'bg-gradient-to-br from-amber-50/95 via-white to-amber-50/40 border-amber-500 shadow-sm ring-3 ring-amber-500/15'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-amber-200 text-slate-700 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                    activeDocType === 'case_diary'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                  }`}
                >
                  <FileText size={19} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 tracking-tight">
                      Chronological Case Diary
                    </span>
                    <span
                      className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-md border tracking-wider uppercase ${
                        activeDocType === 'case_diary'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      Rule 172 CrPC
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-1">
                    Chronological money trail ledger and evidence record for court proceedings
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0 ml-3 flex items-center gap-1.5">
                {activeDocType === 'case_diary' ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-1 rounded-lg border border-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                    <span>ACTIVE</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-800 px-2.5 py-1 rounded-lg bg-slate-100/70 border border-slate-200 group-hover:border-slate-300 transition-colors">
                    Select
                  </span>
                )}
              </div>

              {/* Bottom active accent line */}
              {activeDocType === 'case_diary' && (
                <div className="absolute -bottom-[2px] left-6 right-6 h-[3px] bg-amber-600 rounded-full" />
              )}
            </button>
          </div>
        </div>
      </div>

      {!activeCase.datasetId && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">Evidence Dataset Required for Case {activeCase.id}</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Upload an evidence CSV to this case in Cases &amp; Evidence to generate statutory notices and case diaries.
              </p>
            </div>
          </div>
          {onNavigateToCases && (
            <button
              type="button"
              onClick={onNavigateToCases}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
            >
              Upload Evidence
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-medium">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Generator Form Card 1: Section 102 CrPC Freeze Notice */}
      {activeDocType === 'freeze_requisition' && (
        <div className="bg-white p-6 rounded-2xl border border-rose-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shadow-2xs">
                <Gavel size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Draft Bank Freeze Requisition
                </h2>
                <p className="text-xs text-slate-500">
                  Orders the recipient bank to freeze debit transactions on the suspect account under Section 102 CrPC.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold uppercase tracking-wider">
              Statutory Order
            </span>
          </div>

          <form onSubmit={handleGenerateFreeze} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Target Account */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  TARGET ACCOUNT ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={freezeTarget}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  placeholder="Enter suspect account ID..."
                  className="w-full p-2.5 bg-slate-50 border border-rose-300 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Account to be frozen</span>
              </div>

              {/* Target Bank Name */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  BANK NAME (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g., State Bank of India, HDFC Bank"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Recipient bank nodal authority</span>
              </div>

              {/* Officer Name */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  INVESTIGATING OFFICER
                </label>
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  placeholder="e.g., Inspector Vikram Sharma"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Signatory officer name</span>
              </div>

              {/* Case Reference */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  CASE REFERENCE / FIR
                </label>
                <input
                  type="text"
                  value={caseReference}
                  onChange={(e) => setCaseReference(e.target.value)}
                  placeholder="e.g., FIR-2026-001"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Case or FIR docket identifier</span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={!activeCase?.datasetId || freezeLoading || !freezeTarget.trim()}
                className="px-6 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer btn-press hover:shadow-md"
              >
                <ShieldAlert size={15} />
                <span>
                  {!activeCase?.datasetId
                    ? 'Upload Dataset to Generate'
                    : freezeLoading
                    ? 'Generating Notice PDF...'
                    : 'Generate Freeze Notice (PDF)'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Generator Form Card 2: Rule 172 CrPC Case Diary */}
      {activeDocType === 'case_diary' && (
        <div className="bg-white p-6 rounded-2xl border border-amber-300 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-700 shadow-2xs">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Compile Case Diary
                </h2>
                <p className="text-xs text-slate-500">
                  Compiles a chronological ledger linking transaction hops, layer classifications, and evidence hashes under Rule 172 CrPC.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider">
              Statutory Docket
            </span>
          </div>

          <form onSubmit={handleGenerateDiary} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Victim Account */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  VICTIM ACCOUNT ID <span className="text-amber-600">*</span>
                </label>
                <input
                  type="text"
                  value={diaryVictim}
                  onChange={(e) => setDiaryVictim(e.target.value)}
                  placeholder="Enter victim account ID..."
                  className="w-full p-2.5 bg-slate-50 border border-amber-300 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Origin account of fund transfer</span>
              </div>

              {/* Investigating Officer */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  INVESTIGATING OFFICER
                </label>
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  placeholder="e.g., Inspector Vikram Sharma"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Investigating officer name</span>
              </div>

              {/* Officer Designation */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  DESIGNATION &amp; UNIT
                </label>
                <input
                  type="text"
                  value={officerDesignation}
                  onChange={(e) => setOfficerDesignation(e.target.value)}
                  placeholder="e.g., Cyber Crime Division"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Unit or police station</span>
              </div>

              {/* Case Reference / FIR */}
              <div>
                <label className="text-slate-700 font-bold text-[11px] block mb-1">
                  CASE REFERENCE / FIR
                </label>
                <input
                  type="text"
                  value={caseReference}
                  onChange={(e) => setCaseReference(e.target.value)}
                  placeholder="e.g., FIR-2026-001"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Case or FIR docket identifier</span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={!activeCase?.datasetId || diaryLoading || !diaryVictim.trim()}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer btn-press hover:shadow-md"
              >
                <FileText size={15} />
                <span>
                  {!activeCase?.datasetId
                    ? 'Upload Dataset to Generate'
                    : diaryLoading
                    ? 'Compiling Case Diary PDF...'
                    : 'Generate Case Diary (PDF)'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Latest Generated Instant Callout & Download Banner */}
      {latestGenerated && (
        <div
          className={`p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm border transition-all animate-slide-up ${
            latestGenerated.type === 'case_diary'
              ? 'bg-gradient-to-r from-amber-50/90 via-slate-50 to-amber-100/60 border-amber-300'
              : 'bg-gradient-to-r from-rose-50/90 via-slate-50 to-rose-100/60 border-rose-300'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {latestGenerated.type === 'case_diary' ? (
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-xs">
                  <FileText size={17} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-rose-700 text-white flex items-center justify-center shadow-xs">
                  <ShieldAlert size={17} />
                </div>
              )}
              <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                {latestGenerated.type === 'case_diary'
                  ? `Official Rule 172 Case Diary Synthesized: ${latestGenerated.doc.document_id}`
                  : `Official Section 102 Freeze Notice Synthesized: ${latestGenerated.doc.document_id}`}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                <CheckCircle2 size={11} /> Cryptographic SHA-256 Seal
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {latestGenerated.type === 'case_diary' ? (
                <>
                  Victim Account: <strong className="text-amber-900 font-mono font-bold">{latestGenerated.target}</strong>
                  {latestGenerated.doc.page_count ? ` • Pages: ${latestGenerated.doc.page_count}` : ''}
                  {latestGenerated.doc.evidence_item_count !== undefined ? ` • Evidence Records: ${latestGenerated.doc.evidence_item_count}` : ''}
                </>
              ) : (
                <>
                  Target Account: <strong className="text-rose-700 font-mono font-bold">{latestGenerated.target}</strong>
                  {latestGenerated.bank ? ` • Bank: ${latestGenerated.bank}` : ''}
                </>
              )}
              {' • '}
              SHA-256:{' '}
              <span className="text-[11px] font-mono text-slate-500 font-medium">
                {latestGenerated.doc.integrity_hash ? `${latestGenerated.doc.integrity_hash.slice(0, 20)}...` : 'Verified'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <a
              href={api.getDocumentDownloadUrl(latestGenerated.doc.document_id)}
              target="_blank"
              download={`${latestGenerated.doc.document_id}.pdf`}
              rel="noopener noreferrer"
              className={`flex-1 md:flex-initial px-5 py-2.5 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
                latestGenerated.type === 'case_diary'
                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                  : 'bg-rose-700 hover:bg-rose-800 active:bg-rose-900'
              }`}
            >
              <Download size={14} />
              <span>{latestGenerated.type === 'case_diary' ? 'Download Case Diary PDF' : 'Download Notice PDF'}</span>
            </a>
            {onInvestigateAccount && (
              <button
                type="button"
                onClick={() => onInvestigateAccount(latestGenerated.target)}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Open 360° graph deep-dive for this account"
              >
                <span>Deep-Dive ID</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Generated Documents Register & Download Vault */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Generated Legal Documents
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold font-mono">
              {generatedDocs.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-medium">
              Case Document Vault
            </span>
            {generatedDocs.length > 0 && (
              <button
                type="button"
                onClick={handleClearDocuments}
                className="text-[11px] text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer font-medium"
              >
                <Trash2 size={12} />
                <span>Clear Vault</span>
              </button>
            )}
          </div>
        </div>

        {generatedDocs.length === 0 ? (
          <div className="p-14 text-center text-xs text-slate-500">
            No legal documents generated yet. Use the forms above to produce official Section 102 notices or Rule 172 case diaries.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-6">Document ID</th>
                  <th className="py-3 px-4">Document Type</th>
                  <th className="py-3 px-4">Subject Account</th>
                  <th className="py-3 px-4">Recipient / Authority</th>
                  <th className="py-3 px-4">Generated At</th>
                  <th className="py-3 px-4">SHA-256 Hash</th>
                  <th className="py-3 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {generatedDocs.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">{item.doc.document_id}</span>
                        <button
                          type="button"
                          onClick={() => copyDocId(item.doc.document_id)}
                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          title="Copy Document ID"
                        >
                          {copiedDocId === item.doc.document_id ? (
                            <Check size={11} className="text-emerald-600" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {item.type === 'freeze_requisition' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold inline-flex items-center gap-1">
                          <Gavel size={11} />
                          <span>Sec. 102 Freeze Notice</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold inline-flex items-center gap-1">
                          <FileText size={11} />
                          <span>Rule 172 Case Diary</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{item.target}</span>
                        {onInvestigateAccount && (
                          <button
                            type="button"
                            onClick={() => onInvestigateAccount(item.target)}
                            className="text-amber-700 hover:text-amber-900 p-0.5 cursor-pointer"
                            title="Deep-dive this account"
                          >
                            <ArrowUpRight size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {item.type === 'freeze_requisition'
                        ? (item.bank || 'National Bank Nodal')
                        : 'Cyber Police Court Docket'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{item.timestamp || 'Just now'}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {item.doc.integrity_hash ? `${item.doc.integrity_hash.slice(0, 16)}...` : 'Verified'}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <a
                        href={api.getDocumentDownloadUrl(item.doc.document_id)}
                        target="_blank"
                        download={`${item.doc.document_id}.pdf`}
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer btn-press ${
                          item.type === 'case_diary'
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-rose-700 hover:bg-rose-800 text-white'
                        }`}
                        title={item.type === 'case_diary' ? 'Download Case Diary (PDF)' : 'Download Freeze Notice (PDF)'}
                      >
                        <Download size={12} />
                        <span>{item.type === 'case_diary' ? 'Case Diary' : 'Freeze Notice'}</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
