import React, { useState, useEffect } from 'react';
import { api } from '../api';
import type { CaseDocket, AISummaryResponse, AIHealthStatus } from '../api';
import {
  Sparkles,
  FileText,
  FileCheck2,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ChevronRight,
  Globe,
  Printer,
  RotateCw,
  Layers,
  ShieldAlert,
  Search,
  ArrowLeft,
} from 'lucide-react';

interface AISummarizerViewProps {
  activeCase: CaseDocket | null;
  targetAccountId?: string;
  onNavigateToAccount?: (acc: string) => void;
  onNavigateToNotice?: (acc: string, docType?: 'freeze_requisition' | 'case_diary') => void;
  onNavigateToCases?: () => void;
}

type SummaryType = 'executive' | 'detailed' | 'money_trail' | 'risk_anomaly';

interface TypeConfig {
  id: SummaryType;
  label: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
}

const TYPE_CONFIGS: TypeConfig[] = [
  {
    id: 'executive',
    label: 'Executive',
    title: 'Executive Summary',
    description: 'High-level findings, financial volume, flagged entities, and immediate recommendations.',
    icon: Sparkles,
  },
  {
    id: 'detailed',
    label: 'Detailed',
    title: 'Detailed Investigation',
    description: 'Comprehensive multi-hop fund traversal, rule evaluations, and statistical outlier analysis.',
    icon: Search,
  },
  {
    id: 'money_trail',
    label: 'Money Trail',
    title: 'Money Trail Summary',
    description: 'Step-by-step sender-to-receiver flow lineage across layering hops and mule accounts.',
    icon: Layers,
  },
  {
    id: 'risk_anomaly',
    label: 'Risk & Anomalies',
    title: 'Risk & Anomaly Report',
    description: 'Mule Risk Index scoring breakdown and Isolation Forest behavioral anomalies.',
    icon: ShieldAlert,
  },
];

export const AISummarizerView: React.FC<AISummarizerViewProps> = ({
  activeCase,
  targetAccountId,
  onNavigateToAccount,
  onNavigateToNotice,
  onNavigateToCases,
}) => {
  const [summaryType, setSummaryType] = useState<SummaryType>('executive');
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [currentSummary, setCurrentSummary] = useState<AISummaryResponse | null>(null);
  const [pastSummaries, setPastSummaries] = useState<AISummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AIHealthStatus | null>(null);

  // Check Ollama health
  useEffect(() => {
    let isMounted = true;
    const fetchHealth = async () => {
      try {
        const h = await api.checkAIHealth();
        if (isMounted) setAiHealth(h);
      } catch {
        if (isMounted) {
          setAiHealth({
            ollama_reachable: false,
            base_url: 'http://127.0.0.1:11434',
            configured_model: 'llama3.2:3b',
            model_available: false,
            available_models: [],
            offline: true,
            status: 'ollama_down',
          });
        }
      }
    };
    fetchHealth();
  }, []);

  // Helper to find a matching summary from past summaries
  const findMatchingSummary = (
    summaries: AISummaryResponse[],
    type: SummaryType,
    lang: 'en' | 'hi' | 'mr'
  ) => {
    return summaries.find((s) => s.summary_type === type && s.language === lang) || null;
  };

  // Load past summaries on case change
  useEffect(() => {
    if (!activeCase?.id) return;
    const loadSummaries = async () => {
      try {
        const res = await api.getCaseSummaries(activeCase.id);
        if (res.summaries && Array.isArray(res.summaries)) {
          setPastSummaries(res.summaries);
          // Look for a summary matching the default/current tab and language
          const match = findMatchingSummary(res.summaries, summaryType, language);
          if (match) {
            setCurrentSummary(match);
          } else if (res.summaries.length > 0) {
            // Select the most recent summary and align the tab/language to it
            const first = res.summaries[0];
            setCurrentSummary(first);
            setSummaryType(first.summary_type as SummaryType);
            setLanguage(first.language as 'en' | 'hi' | 'mr');
          } else {
            setCurrentSummary(null);
          }
        }
      } catch (err) {
        console.warn('Could not load past summaries:', err);
      }
    };
    loadSummaries();
  }, [activeCase?.id, targetAccountId]);

  // Tab change handler - synchronizes view with the selected summary type
  const handleTabChange = (type: SummaryType) => {
    setSummaryType(type);
    const match = findMatchingSummary(pastSummaries, type, language);
    setCurrentSummary(match);
  };

  // Language change handler - synchronizes view with the selected language
  const handleLanguageChange = (lang: 'en' | 'hi' | 'mr') => {
    setLanguage(lang);
    const match = findMatchingSummary(pastSummaries, summaryType, lang);
    setCurrentSummary(match);
  };

  // Generate handler
  const handleGenerate = async (overrideType?: SummaryType) => {
    const typeToGenerate = overrideType || summaryType;
    if (!activeCase?.datasetId) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.generateCaseSummary({
        case_id: activeCase.id,
        dataset_id: activeCase.datasetId,
        target_account: targetAccountId || activeCase.targetAccount,
        summary_type: typeToGenerate,
        language,
        case_title: activeCase.title,
        case_notes: activeCase.notes,
        officer_name: activeCase.officerName,
      });
      setCurrentSummary(res);
      setSummaryType(res.summary_type as SummaryType);
      setPastSummaries((prev) => [res, ...prev.filter((s) => s.summary_id !== res.summary_id)]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Generation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!currentSummary) return;
    const c = currentSummary.content;
    const text = `=== ANVITRACE CASE SUMMARY: ${activeCase?.id} ===
TYPE: ${currentSummary.summary_type.toUpperCase()}
LANGUAGE: ${currentSummary.language.toUpperCase()}
DATE: ${new Date(currentSummary.created_at).toLocaleString()}
${targetAcc ? `TARGET ACCOUNT: ${targetAcc}\n` : ''}
--- OVERVIEW ---
${c.case_overview}

--- KEY FINDINGS ---
${c.key_findings.map((f) => `• ${f}`).join('\n')}

${c.money_trail_summary ? `--- MONEY TRAIL ---\n${c.money_trail_summary}\n` : ''}
${c.risk_and_anomaly_findings ? `--- RISK & ANOMALIES ---\n${c.risk_and_anomaly_findings}\n` : ''}

${c.limitations && c.limitations.length ? `--- LIMITATIONS ---\n${c.limitations.map((l) => `• ${l}`).join('\n')}\n` : ''}
${c.recommended_next_steps && c.recommended_next_steps.length ? `--- RECOMMENDED NEXT STEPS ---\n${c.recommended_next_steps.map((s) => `• ${s}`).join('\n')}\n` : ''}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintOrExport = () => {
    if (!currentSummary) return;
    const c = currentSummary.content;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${currentSummary.summary_type.toUpperCase()} SUMMARY - ${activeCase?.id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            h1 { font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
            h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-top: 22px; margin-bottom: 8px; border-left: 3px solid #f59e0b; padding-left: 8px; }
            p { font-size: 13px; margin: 0 0 10px 0; color: #1e293b; }
            ul { font-size: 13px; margin: 0 0 12px 18px; padding: 0; }
            li { margin-bottom: 6px; }
            .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e2e8f0; font-weight: 600; font-size: 11px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>ANVITRACE FORENSIC REPORT: ${activeCase?.id}</h1>
          <div class="meta">
            <span class="badge">${currentSummary.summary_type.replace('_', ' ').toUpperCase()}</span>
            &nbsp;•&nbsp; Language: <strong>${currentSummary.language.toUpperCase()}</strong>
            &nbsp;•&nbsp; Date: <strong>${new Date(currentSummary.created_at).toLocaleString()}</strong>
            ${targetAcc ? `&nbsp;•&nbsp; Target Account: <strong>${targetAcc}</strong>` : ''}
          </div>
          <h2>Overview</h2>
          <p>${c.case_overview}</p>
          <h2>Key Findings</h2>
          <ul>${c.key_findings.map((f) => `<li>${f}</li>`).join('')}</ul>
          ${c.money_trail_summary ? `<h2>Money Trail</h2><p>${c.money_trail_summary}</p>` : ''}
          ${c.risk_and_anomaly_findings ? `<h2>Risk & Anomalies</h2><p>${c.risk_and_anomaly_findings}</p>` : ''}
          ${c.limitations && c.limitations.length ? `<h2>Limitations</h2><ul>${c.limitations.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
          ${c.recommended_next_steps && c.recommended_next_steps.length ? `<h2>Recommended Next Steps</h2><ul>${c.recommended_next_steps.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const targetAcc = targetAccountId || activeCase?.targetAccount;
  const isModelReady = aiHealth?.ollama_reachable && aiHealth?.model_available;
  const currentConfig = TYPE_CONFIGS.find((t) => t.id === summaryType) || TYPE_CONFIGS[0];

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mb-3">
          <Sparkles size={24} />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Case Selected</h3>
        {onNavigateToCases && (
          <button
            type="button"
            onClick={onNavigateToCases}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            Select a Case
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Unified Controls Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs">
        {/* Top Info Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-500/20 text-white dark:text-amber-400 flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Case Summarizer
              </h3>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                CASE: {activeCase.id}
              </span>
              {targetAcc && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  Target: {targetAcc}
                </span>
              )}
              {targetAcc && onNavigateToAccount && (
                <button
                  type="button"
                  onClick={() => onNavigateToAccount(targetAcc)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
                  title={`Return to Account Deep-Dive for ${targetAcc}`}
                >
                  <ArrowLeft size={11} />
                  <span>Back to Deep-Dive</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
              isModelReady
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isModelReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{isModelReady ? 'Ready (Local)' : 'Offline'}</span>
          </div>
        </div>

        {/* Action Controls Row: Type Tabs on Left, Language & Primary Action on Right */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          {/* Summary Type Navigation Tabs */}
          <div className="flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
            {TYPE_CONFIGS.map((tab) => {
              const isSelected = summaryType === tab.id;
              const hasExisting = pastSummaries.some(
                (s) => s.summary_type === tab.id && s.language === language
              );
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {hasExisting && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Generated" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Side: Language Switcher and Primary Generate Button */}
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs">
              <Globe size={12} className="text-slate-400 ml-1.5" />
              {(
                [
                  { code: 'en', label: 'EN' },
                  { code: 'hi', label: 'हिन्दी' },
                  { code: 'mr', label: 'मराठी' },
                ] as const
              ).map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    language === lang.code
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {/* Primary Generate Button in the Toolbar */}
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Generate {currentConfig.label}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Column: Summary Presentation (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          {currentSummary && currentSummary.summary_type === summaryType ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-5">
              {/* Report Header & Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white capitalize truncate">
                    {currentSummary.summary_type.replace('_', ' ')} Summary
                  </h4>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {currentSummary.language}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(currentSummary.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Meaningful Action Buttons placed right on the report toolbar */}
                <div className="flex items-center gap-1.5">
                  {/* Regenerate */}
                  <button
                    type="button"
                    onClick={() => handleGenerate()}
                    disabled={isLoading}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs transition-colors cursor-pointer"
                    title="Regenerate this summary"
                  >
                    <RotateCw size={13} className={isLoading ? 'animate-spin' : ''} />
                  </button>

                  {/* Copy Report */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Copy full text to clipboard"
                  >
                    {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  {/* Print / Export Report */}
                  <button
                    type="button"
                    onClick={handlePrintOrExport}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Print or export as PDF"
                  >
                    <Printer size={13} />
                    <span>Print</span>
                  </button>

                  {/* Legal Action: Draft Freeze Notice */}
                  {onNavigateToNotice && targetAcc && (
                    <button
                      type="button"
                      onClick={() => onNavigateToNotice(targetAcc, 'freeze_requisition')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Draft Sec 102 CrPC bank freeze requisition"
                    >
                      <FileCheck2 size={13} />
                      <span>Freeze Notice</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 1. Overview */}
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  Overview
                </h5>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {currentSummary.content.case_overview}
                </div>
              </div>

              {/* 2. Key Findings */}
              <div className="space-y-1.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  Key Findings
                </h5>
                <div className="space-y-1.5">
                  {currentSummary.content.key_findings.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 flex items-start gap-2 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <span className="w-4 h-4 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 flex items-center justify-center shrink-0 font-bold text-[9px]">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Money Trail Analysis */}
              {currentSummary.content.money_trail_summary && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Money Trail
                  </h5>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {currentSummary.content.money_trail_summary}
                  </div>
                </div>
              )}

              {/* 4. Risk & Anomalies */}
              {currentSummary.content.risk_and_anomaly_findings && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Risk &amp; Anomalies
                  </h5>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {currentSummary.content.risk_and_anomaly_findings}
                  </div>
                </div>
              )}

              {/* 5. Supporting Evidence */}
              {currentSummary.content.supporting_evidence &&
                currentSummary.content.supporting_evidence.length > 0 && (
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                      Supporting Evidence ({currentSummary.content.supporting_evidence.length})
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentSummary.content.supporting_evidence.map((src, sidx) => (
                        <div
                          key={sidx}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                        >
                          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300">
                            {src.source_type.replace('_', ' ')}
                          </span>
                          {src.amount !== undefined && src.amount !== null && (
                            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 text-[11px]">
                              ₹{src.amount.toLocaleString('en-IN')}
                            </span>
                          )}
                          {src.account_id && (
                            <span className="font-mono text-slate-400 text-[10px]">
                              {src.account_id}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 6. Limitations */}
              {currentSummary.content.limitations && currentSummary.content.limitations.length > 0 && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Limitations
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-400 p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
                    {currentSummary.content.limitations.map((lim, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {lim}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 7. Next Steps */}
              {currentSummary.content.recommended_next_steps &&
                currentSummary.content.recommended_next_steps.length > 0 && (
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                      Recommended Next Steps
                    </h5>
                    <div className="space-y-1">
                      {currentSummary.content.recommended_next_steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200"
                        >
                          <ChevronRight size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ) : (
            /* Dedicated Ready-to-Generate State for the Selected Tab */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                {React.createElement(currentConfig.icon, { size: 24 })}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {currentConfig.title} Not Generated Yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-5">
                {currentConfig.description}
              </p>

              {/* Direct, Prominent Generate Button right in the center */}
              <button
                type="button"
                onClick={() => handleGenerate(summaryType)}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Generating {currentConfig.label} Report...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Generate {currentConfig.title}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Past Saved Summaries Drawer (1 col) */}
        <div className="space-y-2">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 px-1 flex items-center gap-1.5">
            <Clock size={13} /> Saved Reports ({pastSummaries.length})
          </h5>

          {pastSummaries.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              No saved reports for this docket yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {pastSummaries.map((sum) => {
                const isSelected =
                  currentSummary?.summary_id === sum.summary_id &&
                  summaryType === sum.summary_type;
                return (
                  <button
                    key={sum.summary_id}
                    type="button"
                    onClick={() => {
                      setCurrentSummary(sum);
                      setSummaryType(sum.summary_type as SummaryType);
                      setLanguage(sum.language as 'en' | 'hi' | 'mr');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/30 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-xs capitalize text-slate-800 dark:text-slate-200 truncate">
                        {sum.summary_type.replace('_', ' ')}
                      </span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {sum.language}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {sum.content.case_overview}
                    </p>
                    <div className="text-[9px] text-slate-400 mt-1 font-mono">
                      {new Date(sum.created_at).toLocaleDateString()} • {new Date(sum.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
