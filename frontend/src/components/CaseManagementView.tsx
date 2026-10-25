import React, { useState } from 'react';
import { api } from '../api';
import {
  FolderPlus,
  FileText,
  Search,
  Database,
  Trash2,
  UploadCloud,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Briefcase,
  X,
  FileSpreadsheet,
  Loader2,
  ArrowLeft,
  ScanSearch,
  Bot,
  Sparkles,
} from 'lucide-react';

interface CaseManagementViewProps {
  onInvestigateAccount: (accountId: string) => void;
  onNavigateToDataset: () => void;
  onNavigateToDocuments: () => void;
  onNavigateToNotice?: (accountId: string, docType?: 'freeze_requisition' | 'case_diary') => void;
  onNavigateToAIChat?: (accountId: string) => void;
  onNavigateToSummarizer?: (accountId: string) => void;
  onGoBack?: () => void;
}

export interface CaseDocket {
  id: string;
  title: string;
  act: string;
  targetAccount: string;
  officerName?: string;
  notes?: string;
  createdAt: string;
  status: 'Active Investigation' | 'Sealed Evidence' | 'Court Requisition Pending';
  datasetId?: string;
  datasetFilename?: string;
  datasetTotalRows?: number;
  datasetHash?: string;
}

export interface UploadProgressInfo {
  percent: number;
  stage: string;
  loaded?: number;
  total?: number;
}

export const CaseManagementView: React.FC<CaseManagementViewProps> = ({
  onInvestigateAccount,
  onNavigateToDataset,
  onNavigateToDocuments,
  onNavigateToNotice,
  onNavigateToAIChat,
  onNavigateToSummarizer,
  onGoBack,
}) => {
  const [cases, setCases] = useState<CaseDocket[]>(() => {
    try {
      const saved = localStorage.getItem('anvitrace_cases');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [filterText, setFilterText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Case form state
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseAct, setNewCaseAct] = useState('Sec. 66D IT Act / 420 IPC');
  const [newCaseTarget, setNewCaseTarget] = useState('');
  const [newCaseNotes, setNewCaseNotes] = useState('');
  const [newCaseFile, setNewCaseFile] = useState<File | null>(null);

  // Evidence upload state
  const [uploadingCaseId, setUploadingCaseId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const saveCases = (updated: CaseDocket[]) => {
    setCases(updated);
    try {
      localStorage.setItem('anvitrace_cases', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save cases to localStorage', e);
    }
  };

  const setActiveCaseDocket = (docket: CaseDocket | null) => {
    try {
      if (docket) {
        localStorage.setItem('anvitrace_active_case', JSON.stringify(docket));
      } else {
        localStorage.removeItem('anvitrace_active_case');
      }
      window.dispatchEvent(new CustomEvent('anvitrace_case_changed'));
    } catch { }
  };

  const handleAttachEvidence = async (caseId: string, file: File) => {
    const targetCase = cases.find((c) => c.id === caseId);
    const oldDatasetId = targetCase?.datasetId;

    setUploadingCaseId(caseId);
    setUploadError(null);
    setUploadMessage(null);
    setUploadProgress({
      percent: 5,
      stage: 'Preparing evidence CSV payload...',
      loaded: 0,
      total: file.size,
    });
    try {
      const resp = await api.uploadDataset(file, (p) => {
        setUploadProgress(p);
      });
      const updated = cases.map((c) => {
        if (c.id === caseId) {
          return {
            ...c,
            datasetId: resp.dataset_id,
            datasetFilename: file.name,
            datasetTotalRows: resp.total_rows || 2000000,
            datasetHash: resp.dataset_hash,
          };
        }
        return c;
      });
      saveCases(updated);

      // Sync active case if this case was active
      try {
        const savedActive = localStorage.getItem('anvitrace_active_case');
        if (savedActive) {
          const activeObj = JSON.parse(savedActive);
          if (activeObj.id === caseId) {
            const updatedActive = updated.find((c) => c.id === caseId);
            if (updatedActive) setActiveCaseDocket(updatedActive);
          }
        }
      } catch { }

      // If replacing an existing dataset that is no longer used by any case, purge it from database
      if (oldDatasetId && oldDatasetId !== resp.dataset_id) {
        const stillInUse = updated.some((c) => c.datasetId === oldDatasetId);
        if (!stillInUse) {
          try {
            await api.deleteDataset(oldDatasetId);
          } catch (e) {
            console.warn('Could not cleanup replaced dataset:', e);
          }
        }
      }

      setUploadMessage(`Evidence CSV '${file.name}' attached to Case ${caseId}! Successfully ingested.`);
    } catch (err: any) {
      setUploadError(`Evidence upload failed: ${err.message}`);
    } finally {
      setUploadingCaseId(null);
      setUploadProgress(null);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseId.trim() || !newCaseTarget.trim()) return;

    let attachedDatasetId: string | undefined;
    let attachedFilename: string | undefined;
    let attachedRows: number | undefined;
    let attachedHash: string | undefined;

    // If an evidence file is attached, upload it first
    if (newCaseFile) {
      // If no other cases exist, ensure the database is completely clean before fresh ingestion
      if (cases.length === 0) {
        try {
          await api.resetDataset();
        } catch { }
      }

      setUploadingCaseId('new_case');
      setUploadError(null);
      setUploadProgress({
        percent: 5,
        stage: 'Preparing evidence CSV payload...',
        loaded: 0,
        total: newCaseFile.size,
      });
      try {
        const uploadResp = await api.uploadDataset(newCaseFile, (p) => {
          setUploadProgress(p);
        });
        attachedDatasetId = uploadResp.dataset_id;
        attachedFilename = newCaseFile.name;
        attachedRows = uploadResp.total_rows || 2000000;
        attachedHash = uploadResp.dataset_hash;
        setUploadMessage(`Dataset '${newCaseFile.name}' ingested and attached to new case!`);
      } catch (err: any) {
        setUploadError(`Failed to ingest evidence CSV: ${err.message}`);
        setUploadingCaseId(null);
        setUploadProgress(null);
        return;
      }
    }

    const newDocket: CaseDocket = {
      id: newCaseId.trim().toUpperCase(),
      title: newCaseTitle.trim() || `Investigation ${newCaseId.trim().toUpperCase()}`,
      act: newCaseAct.trim(),
      targetAccount: newCaseTarget.trim(),
      notes: newCaseNotes.trim() || undefined,
      createdAt: new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      status: 'Active Investigation',
      datasetId: attachedDatasetId,
      datasetFilename: attachedFilename,
      datasetTotalRows: attachedRows,
      datasetHash: attachedHash,
    };

    const updated = [newDocket, ...cases];
    saveCases(updated);

    // Save active case to localStorage and dispatch sync event
    setActiveCaseDocket(newDocket);

    // Reset form
    setNewCaseId('');
    setNewCaseTitle('');
    setNewCaseTarget('');
    setNewCaseNotes('');
    setNewCaseFile(null);
    setUploadingCaseId(null);
    setUploadProgress(null);
    setShowCreateModal(false);
  };

  const handleDeleteCase = async (caseId: string) => {
    const targetCase = cases.find((c) => c.id === caseId);
    if (!targetCase) return;

    const confirmMsg = targetCase.datasetId
      ? `Delete case docket ${caseId}? This will delete the case and permanently remove its attached evidence dataset (${targetCase.datasetFilename || targetCase.datasetId}) from the database.`
      : `Delete case docket ${caseId}? This will remove it from the case registry.`;

    if (!window.confirm(confirmMsg)) return;

    setUploadError(null);
    setUploadMessage(null);

    const updated = cases.filter((c) => c.id !== caseId);
    saveCases(updated);

    // Switch or clear active case in localStorage
    if (updated.length === 0) {
      setActiveCaseDocket(null);
      try {
        localStorage.removeItem('anvitrace_active_case');
        localStorage.removeItem(`anvitrace_case_docs_${caseId}`);
      } catch {}
      window.dispatchEvent(new CustomEvent('anvitrace_case_changed'));
    } else {
      try {
        const savedActive = localStorage.getItem('anvitrace_active_case');
        if (savedActive) {
          const activeObj = JSON.parse(savedActive);
          if (activeObj.id === caseId) {
            setActiveCaseDocket(updated[0]);
          }
        }
      } catch { }
    }

    // Clean up dataset in DuckDB
    try {
      if (updated.length === 0) {
        // When all cases are deleted, wipe DuckDB completely clean to 0 rows
        await api.resetDataset();
        setUploadError(null);
        setUploadMessage(`Case ${caseId} deleted. All cases cleared and database dataset wiped clean.`);
      } else if (targetCase.datasetId) {
        // Check if any other remaining case is still using this dataset
        const isDatasetUsedByOthers = updated.some((c) => c.datasetId === targetCase.datasetId);
        if (!isDatasetUsedByOthers) {
          await api.deleteDataset(targetCase.datasetId);
          setUploadError(null);
          setUploadMessage(`Case ${caseId} and its associated dataset (${targetCase.datasetFilename || targetCase.datasetId}) were deleted from the database.`);
        } else {
          setUploadError(null);
          setUploadMessage(`Case ${caseId} deleted. Attached dataset retained as it is referenced by another case.`);
        }
      } else {
        setUploadError(null);
        setUploadMessage(`Case ${caseId} deleted successfully.`);
      }
    } catch (err: any) {
      console.error('Failed to cleanup dataset on case deletion:', err);
      setUploadMessage(null);
      setUploadError(`Case removed from list, but database cleanup encountered an issue: ${err.message}`);
    }

  };

  const renderProgressBar = (progress: UploadProgressInfo | null, filename?: string) => {
    const percent = progress?.percent ?? 5;
    const stage = progress?.stage ?? 'Preparing evidence CSV payload...';
    const mbLoaded = progress?.loaded !== undefined ? (progress.loaded / (1024 * 1024)).toFixed(1) : undefined;
    const mbTotal = progress?.total !== undefined ? (progress.total / (1024 * 1024)).toFixed(1) : undefined;
    const isUploaded = progress?.loaded !== undefined && progress?.total !== undefined && progress.loaded >= progress.total;

    return (
      <div className="p-3.5 bg-slate-900 text-white rounded-xl shadow-sm space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-white" />
            <span className="truncate max-w-[240px]">
              {filename ? `Ingesting: ${filename}` : 'Ingesting Evidence Dataset'}
            </span>
          </span>
          <span className="font-mono font-bold text-white">{percent}%</span>
        </div>

        {/* Progress track */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 ring-1 ring-slate-700/60">
          <div
            className="h-full bg-white rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(255,255,255,0.7)]"
            style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate max-w-[280px] font-medium text-slate-300">{stage}</span>
          {mbTotal && (
            <span className="font-mono shrink-0 ml-2 text-slate-300">
              {isUploaded ? (percent >= 100 ? `${mbTotal} MB • Complete` : `${mbTotal} MB • Ingesting`) : `${mbLoaded} / ${mbTotal} MB`}
            </span>
          )}
        </div>
      </div>
    );
  };

  const filteredCases = cases.filter(
    (c) =>
      c.id.toLowerCase().includes(filterText.toLowerCase()) ||
      c.title.toLowerCase().includes(filterText.toLowerCase()) ||
      c.targetAccount.toLowerCase().includes(filterText.toLowerCase()) ||
      c.act.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-16 select-none max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
              Cases &amp; Evidence
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage investigation dockets, suspect targets, and evidence datasets
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <FolderPlus size={15} />
              <span>Register New Case</span>
            </button>
          </div>
        </div>

        {/* Feedback messages */}
        {uploadMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>{uploadMessage}</span>
            </div>
            <button onClick={() => setUploadMessage(null)} className="text-emerald-600 font-bold hover:text-emerald-900">
              ✕
            </button>
          </div>
        )}

        {uploadError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between font-medium">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-rose-600 font-bold hover:text-rose-900">
              ✕
            </button>
          </div>
        )}

        {/* Filter bar */}
        {cases.length > 0 && (
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search cases by ID, account, or statutory act..."
                className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredCases.length} of {cases.length} cases
            </span>
          </div>
        )}
      </div>

      {/* Case Dockets Grid or Empty State */}
      {cases.length === 0 ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200/80 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <Briefcase size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Cases Registered</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              Create an investigation case to upload transaction evidence and begin tracing illicit money trails.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <FolderPlus size={15} />
              <span>Register First Case</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCases.map((docket, idx) => (
            <div
              key={`${docket.id}-${idx}`}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 hover-lift transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 font-mono text-xs font-bold text-amber-900">
                    {docket.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCase(docket.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                    title="Delete Case Docket"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                    {docket.title}
                  </h3>
                  <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">TARGET ACCOUNT:</span>
                      <strong className="text-slate-900 font-mono">{docket.targetAccount}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">STATUTORY ACT:</span>
                      <span className="truncate max-w-[180px] font-medium">{docket.act}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">REGISTERED:</span>
                      <span>{docket.createdAt}</span>
                    </div>
                  </div>
                </div>

                {/* Evidence CSV info or upload trigger */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                      <Database size={12} className="text-amber-600" />
                      EVIDENCE DATASET
                    </span>
                    {docket.datasetId ? (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        ACTIVE DATASET
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        NO CSV ATTACHED
                      </span>
                    )}
                  </div>
                  {docket.datasetFilename ? (
                    <div className="text-xs text-slate-800">
                      <span className="font-semibold text-slate-900 block truncate">{docket.datasetFilename}</span>
                      <span className="text-slate-500 text-[11px] block mt-0.5">
                        {docket.datasetTotalRows ? `${docket.datasetTotalRows.toLocaleString('en-IN')} records` : 'Dataset active'} • ID: {docket.datasetId?.slice(0, 10)}...
                      </span>
                    </div>
                  ) : uploadingCaseId === docket.id ? (
                    <div className="pt-1">
                      {renderProgressBar(uploadProgress, 'Evidence CSV')}
                    </div>
                  ) : (
                    <div>
                      <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                        <UploadCloud size={13} />
                        <span>Attach Evidence CSV</span>
                        <input
                          type="file"
                          accept=".csv"
                          disabled={Boolean(uploadingCaseId)}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAttachEvidence(docket.id, file);
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {docket.notes && (
                  <p className="text-[11px] text-slate-500 line-clamp-2 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {docket.notes}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100/90 space-y-2">
                {/* Primary Action: Deep-Dive Investigation */}
                <button
                  type="button"
                  id={`case-deepdive-btn-${docket.id}`}
                  onClick={() => {
                    setActiveCaseDocket(docket);
                    onInvestigateAccount(docket.targetAccount);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-bold transition-all shadow-xs text-center flex items-center justify-center gap-2 cursor-pointer group hover:shadow-sm btn-press"
                  title={`Launch Deep-Dive Investigation on Account ${docket.targetAccount}`}
                >
                  <ScanSearch size={15} className="text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="tracking-tight">Deep-Dive Investigation</span>
                  <ArrowRight size={14} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-transform shrink-0" />
                </button>

                {/* Secondary Actions: Symmetrical 2-Column Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCaseDocket(docket);
                      if (onNavigateToNotice) {
                        onNavigateToNotice(docket.targetAccount, 'freeze_requisition');
                      } else {
                        onNavigateToDocuments();
                      }
                    }}
                    className="py-2 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-xs group btn-press"
                    title="Generate Sec. 102 Bank Freeze Notice for Case"
                  >
                    <ShieldAlert size={13} className="text-rose-600 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="truncate">Sec. 102 Notice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveCaseDocket(docket);
                      if (onNavigateToNotice) {
                        onNavigateToNotice(docket.targetAccount, 'case_diary');
                      } else {
                        onNavigateToDocuments();
                      }
                    }}
                    className="py-2 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-xs group btn-press"
                    title="Generate Rule 172 CrPC Case Diary for Case"
                  >
                    <FileText size={13} className="text-amber-700 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="truncate">Rule 172 Diary</span>
                  </button>
                </div>

                {/* AI Intelligence Direct Launchers */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    id={`case-aichat-btn-${docket.id}`}
                    onClick={() => {
                      setActiveCaseDocket(docket);
                      if (onNavigateToAIChat) {
                        onNavigateToAIChat(docket.targetAccount);
                      }
                    }}
                    className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-xs group btn-press"
                    title={`Launch AI Investigation Chatbot on Account ${docket.targetAccount}`}
                  >
                    <Bot size={13} className="text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="truncate">AI Chatbot</span>
                  </button>

                  <button
                    type="button"
                    id={`case-aisummarizer-btn-${docket.id}`}
                    onClick={() => {
                      setActiveCaseDocket(docket);
                      if (onNavigateToSummarizer) {
                        onNavigateToSummarizer(docket.targetAccount);
                      }
                    }}
                    className="py-2 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-xs group btn-press"
                    title={`Generate Structured AI Case Summary for Account ${docket.targetAccount}`}
                  >
                    <Sparkles size={13} className="text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="truncate">Case Summary</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register Case Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white max-w-lg w-full rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderPlus size={18} className="text-amber-600" />
                <span>Register New Case</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCase} className="space-y-3.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  CASE REFERENCE / FIR NUMBER <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCaseId}
                  onChange={(e) => setNewCaseId(e.target.value)}
                  placeholder="e.g. CR-2024-CYBER-01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  INVESTIGATION TITLE
                </label>
                <input
                  type="text"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="e.g. Mule Syndicate Layering Investigation"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  TARGET SUSPECT ACCOUNT ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCaseTarget}
                  onChange={(e) => setNewCaseTarget(e.target.value)}
                  placeholder="Target account number (e.g. 10-18 digits)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  STATUTORY ACT / SECTION
                </label>
                <input
                  type="text"
                  value={newCaseAct}
                  onChange={(e) => setNewCaseAct(e.target.value)}
                  placeholder="e.g. Sec. 66D IT Act / 420 IPC"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  INVESTIGATION BRIEF / NOTES (OPTIONAL)
                </label>
                <textarea
                  rows={2}
                  value={newCaseNotes}
                  onChange={(e) => setNewCaseNotes(e.target.value)}
                  placeholder="Initial complaint details, bank referral, or investigation notes..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  ATTACH EVIDENCE CSV (OPTIONAL)
                </label>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2.5">
                  <input
                    type="file"
                    accept=".csv"
                    disabled={Boolean(uploadingCaseId)}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setNewCaseFile(f);
                    }}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  />

                  {/* Ready File Preview badge when selected */}
                  {newCaseFile && !uploadingCaseId && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                          <FileSpreadsheet size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-900 truncate">{newCaseFile.name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {(newCaseFile.size / (1024 * 1024)).toFixed(1)} MB • Ready for Ingestion
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                        READY
                      </span>
                    </div>
                  )}

                  {/* Active Ingestion Progress Bar */}
                  {uploadingCaseId === 'new_case' && (
                    <div className="pt-1">
                      {renderProgressBar(uploadProgress, newCaseFile?.name)}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(uploadingCaseId)}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(uploadingCaseId)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {uploadingCaseId === 'new_case' ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Ingesting Evidence ({uploadProgress?.percent || 0}%)...</span>
                    </>
                  ) : (
                    <span>Register Case</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
