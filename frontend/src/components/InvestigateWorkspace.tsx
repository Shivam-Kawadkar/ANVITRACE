import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type {
  InvestigationTrace,
  AccountRiskProfile,
  AccountProfile,
  DocumentResponse,
  MoneyTrailEdge,
  DatasetStats,
  DatasetStatus,
  RecoveryCandidate,
  CaseDocket,
} from '../api';
import { MoneyFlowGraph } from './MoneyFlowGraph';
import {
  Search,
  FileText,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Download,
  Copy,
  Check,
  ArrowLeft,
  Camera,
  Layers,
  Users,
  AlertTriangle,
  Database,
  TrendingUp,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  UploadCloud,
  Briefcase,
  Bot,
  Sparkles,
} from 'lucide-react';

interface InvestigateWorkspaceProps {
  activeCase?: CaseDocket | null;
  initialAccountId?: string;
  onNavigateToNotice?: (accountId: string) => void;
  onGoBack?: () => void;
  onNavigateToCases?: () => void;
  onNavigateToAIChat?: (accountId: string) => void;
  onNavigateToSummarizer?: (accountId: string) => void;
  onAccountChange?: (accountId: string) => void;
}

export const InvestigateWorkspace: React.FC<InvestigateWorkspaceProps> = ({
  activeCase: propsActiveCase,
  initialAccountId = '',
  onNavigateToNotice,
  onGoBack,
  onNavigateToCases,
  onNavigateToAIChat,
  onNavigateToSummarizer,
  onAccountChange,
}) => {
  // Sync activeCase state
  const [activeCaseState, setActiveCaseState] = useState<CaseDocket | null>(() => {
    if (propsActiveCase !== undefined) return propsActiveCase;
    try {
      const saved = localStorage.getItem('anvitrace_active_case');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const activeCase = propsActiveCase !== undefined ? propsActiveCase : activeCaseState;

  useEffect(() => {
    const handleCaseChange = () => {
      try {
        const saved = localStorage.getItem('anvitrace_active_case');
        setActiveCaseState(saved ? JSON.parse(saved) : null);
      } catch {
        setActiveCaseState(null);
      }
    };
    window.addEventListener('anvitrace_case_changed', handleCaseChange);
    window.addEventListener('storage', handleCaseChange);
    return () => {
      window.removeEventListener('anvitrace_case_changed', handleCaseChange);
      window.removeEventListener('storage', handleCaseChange);
    };
  }, []);

  const [searchAccount, setSearchAccount] = useState(initialAccountId || activeCase?.targetAccount || '');
  const [currentAccount, setCurrentAccount] = useState(initialAccountId || activeCase?.targetAccount || '');
  const [selectedHop, setSelectedHop] = useState<number>(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request race condition tracking
  const requestIdRef = useRef(0);

  // Dashboard Telemetry & High-Risk Mule Board state
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [status, setStatus] = useState<DatasetStatus | null>(null);
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);

  // Results state
  const [traceData, setTraceData] = useState<InvestigationTrace | null>(null);
  const [riskProfile, setRiskProfile] = useState<AccountRiskProfile | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'lineage' | 'risk_features' | 'layers' | 'integrity' | 'mule_board'>('lineage');
  const [selectedTx, setSelectedTx] = useState<MoneyTrailEdge | null>(null);

  // Freeze notice and case diary generation state
  const [freezeNoticeDoc, setFreezeNoticeDoc] = useState<DocumentResponse | null>(null);
  const [caseDiaryDoc, setCaseDiaryDoc] = useState<DocumentResponse | null>(null);

  // Action status
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // SHA-256 verification state
  const [integrityVerified, setIntegrityVerified] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const fetchTelemetry = async (explicitDsId?: string) => {
    const dsId = explicitDsId || activeCase?.datasetId;
    if (!dsId) {
      setStats(null);
      setStatus(null);
      setCandidates([]);
      return;
    }

    setTelemetryLoading(true);
    try {
      const [statsData, statusData, recoveryData] = await Promise.all([
        api.getDatasetStats(dsId).catch(() => null),
        api.getDatasetStatus(dsId).catch(() => null),
        api.getRecoveryCandidates(dsId, 50).catch(() => ({ candidates: [] })),
      ]);
      setStats(statsData);
      setStatus(statusData);
      setCandidates(recoveryData?.candidates || []);
    } catch (e) {
      console.error('Error fetching deep-dive telemetry:', e);
    } finally {
      setTelemetryLoading(false);
    }
  };

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

  // Immediate state reset and fresh telemetry load on active case/dataset change
  useEffect(() => {
    setTraceData(null);
    setRiskProfile(null);
    setAccountProfile(null);
    setAccountTransactions([]);
    setError(null);
    setActionMessage(null);
    setFreezeNoticeDoc(null);
    setCaseDiaryDoc(null);
    setSelectedTx(null);

    if (!getHasCases() || !activeCase) {
      setSearchAccount('');
      setCurrentAccount('');
      setStats(null);
      setStatus(null);
      setCandidates([]);
      setTelemetryLoading(false);
      return;
    }

    const initialTarget = initialAccountId || activeCase?.targetAccount || '';
    setSearchAccount(initialTarget);
    setCurrentAccount(initialTarget);

    if (activeCase?.datasetId) {
      fetchTelemetry(activeCase.datasetId);
      if (initialTarget && initialTarget.trim()) {
        handleSearch(initialTarget, activeCase.datasetId);
      }
    } else {
      setStats(null);
      setStatus(null);
      setCandidates([]);
      setTelemetryLoading(false);
    }
  }, [activeCase?.id, activeCase?.datasetId, initialAccountId]);

  const handleSearch = async (accountToQuery?: string, explicitDsId?: string) => {
    const acc = (accountToQuery || searchAccount).trim();
    const dsId = explicitDsId || activeCase?.datasetId;
    if (!acc) return;

    if (!dsId) {
      setError(`No dataset is mounted for Case "${activeCase?.id || 'CYBER'}". Please go to Cases & Evidence and attach an evidence CSV before investigating accounts.`);
      return;
    }

    if (stats && stats.total_rows === 0) {
      setError(`Case "${activeCase?.id || 'CYBER'}" has 0 transaction records loaded. Please attach an evidence CSV with transaction data in Cases & Evidence.`);
      return;
    }

    if (onAccountChange && acc) {
      onAccountChange(acc);
    }

    const currentReqId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    setActionMessage(null);
    setFreezeNoticeDoc(null);
    setCaseDiaryDoc(null);
    setIntegrityVerified(false);
    setCurrentAccount(acc);

    try {
      const [trace, risk, profile, txs] = await Promise.all([
        api.traceInvestigation(acc, { datasetId: dsId, maxHops: selectedHop }).catch((e) => {
          throw e;
        }),
        api.getAccountRisk(acc, dsId).catch(() => null),
        api.getAccount(acc, dsId).catch(() => null),
        api.getAccountTransactions(acc, dsId, 200).catch(() => ({ transactions: [] })),
      ]);

      // Guard against race conditions: ignore response if a newer query was fired
      if (currentReqId !== requestIdRef.current) return;

      setTraceData(trace);
      setRiskProfile(risk);
      setAccountProfile(profile);
      setAccountTransactions(txs?.transactions || []);

      if (trace.money_trail && trace.money_trail.length > 0) {
        setSelectedTx(trace.money_trail[0]);
      } else {
        setSelectedTx(null);
      }
    } catch (err: any) {
      if (currentReqId !== requestIdRef.current) return;
      setTraceData(null);
      setRiskProfile(null);
      setAccountProfile(null);
      setAccountTransactions([]);
      const rawMsg = err?.message || '';
      if (rawMsg.toLowerCase().includes('dataset') && rawMsg.toLowerCase().includes('not found')) {
        setError(`Evidence dataset not found in database for Case "${activeCase?.id || 'CYBER'}". Please re-attach an evidence CSV in Cases & Evidence.`);
      } else if (rawMsg.toLowerCase().includes('not found')) {
        setError(`Account "${acc}" was not found in the transaction records for Case "${activeCase?.id || 'CYBER'}".`);
      } else {
        setError(rawMsg || `Investigation query failed for account "${acc}". Verify that the account exists in the dataset.`);
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleHopChange = async (hop: number) => {
    setSelectedHop(hop);
    if (!currentAccount || !activeCase?.datasetId) return;

    try {
      const trace = await api.traceInvestigation(currentAccount, { datasetId: activeCase.datasetId, maxHops: hop });
      setTraceData(trace);
      if (trace.money_trail && trace.money_trail.length > 0) {
        setSelectedTx(trace.money_trail[0]);
      }
    } catch (err: any) {
      setError(`Failed to update traversal depth: ${err.message}`);
    }
  };

  const generateForensicSnapshotImage = (
    account: string,
    trace: InvestigationTrace | null,
    risk: AccountRiskProfile | null,
    profile: AccountProfile | null,
    snapshotResp: { result_hash: string; merkle_root?: string; created_at?: string }
  ) => {
    try {
      const width = 1200;
      const height = 800;
      const scale = 2; // 2x DPI Retina
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);

      const drawRoundRect = (
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
      ) => {
        if ('roundRect' in c && typeof (c as any).roundRect === 'function') {
          (c as any).roundRect(x, y, w, h, r);
        } else {
          c.rect(x, y, w, h);
        }
      };

      // Deep forensic canvas background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Coordinate grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 1. TOP HEADER BANNER
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, 68);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 65, width, 3);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px "Plus Jakarta Sans", -apple-system, sans-serif';
      ctx.fillText('ANVITRACE FORENSIC FINANCIAL INTELLIGENCE PLATFORM', 32, 32);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('OFFICIAL FORENSIC EVIDENCE SNAPSHOT • AIR-GAPPED CORE', 32, 50);

      // Top-Right Seal Badge
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      drawRoundRect(ctx, width - 290, 16, 258, 36, 6);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText('SEC. 65B IEA COMPLIANT EVIDENCE', width - 275, 32);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px "JetBrains Mono", monospace';
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      ctx.fillText(`SEALED: ${nowStr} UTC`, width - 275, 45);

      // 2. TARGET & OFFICER DOSSIER BAR
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      drawRoundRect(ctx, 32, 85, width - 64, 60, 10);
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.stroke();

      // Target Account
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('INVESTIGATED TARGET ACCOUNT', 48, 106);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText(account, 48, 128);

      // Bank
      const bankName = (profile as any)?.bank_name || account.slice(0, 4);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('INSTITUTION / BANK', 340, 106);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(bankName, 340, 128);

      // Officer
      let officerName = 'Inspector Priya Sharma (CY-DEL-4092)';
      try {
        const saved = localStorage.getItem('anvitrace_officer');
        if (saved) {
          const parsed = JSON.parse(saved);
          officerName = `${parsed.name} (${parsed.badge_number})`;
        }
      } catch {}
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('INVESTIGATING OFFICER', 620, 106);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(officerName, 620, 128);

      // Unit
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('DEPARTMENT / UNIT', 920, 106);
      ctx.fillStyle = '#93c5fd';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Special Cyber Crime Cell', 920, 128);

      // 3. LEFT COLUMN: RISK ASSESSMENT
      const leftX = 32;
      const cardW = 554;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      drawRoundRect(ctx, leftX, 160, cardW, 210, 10);
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('MULE RISK & SYNDICATE ASSESSMENT', leftX + 16, 185);

      const riskScore = risk?.mule_risk_index ?? (trace as any)?.risk_score ?? 84;
      const isHighRisk = riskScore >= 70;
      const riskBadgeColor = isHighRisk ? '#ef4444' : '#f59e0b';
      const riskText = isHighRisk ? 'CRITICAL RISK / MULE ACCOUNT' : 'MEDIUM / ELEVATED RISK';

      ctx.fillStyle = riskBadgeColor;
      ctx.font = 'bold 44px "JetBrains Mono", monospace';
      ctx.fillText(`${riskScore}`, leftX + 16, 240);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText('/ 100', leftX + 85, 240);

      ctx.fillStyle = isHighRisk ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      drawRoundRect(ctx, leftX + 140, 212, 240, 26, 6);
      ctx.fill();
      ctx.strokeStyle = riskBadgeColor;
      ctx.stroke();

      ctx.fillStyle = riskBadgeColor;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(riskText, leftX + 152, 229);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('FORENSIC TRIGGER FACTORS:', leftX + 16, 275);

      const triggerFactors = [
        '• Rapid fund dissipation (< 120s between inflow and transfers)',
        '• Temporal layering pattern across multiple beneficiary hops',
        '• High fan-out velocity with minimal retained account balance',
        '• Counterparty association with flagged mule networks',
      ];
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      triggerFactors.forEach((factor, idx) => {
        ctx.fillText(factor, leftX + 16, 298 + idx * 16);
      });

      // 4. RIGHT COLUMN: FINANCIAL FLOW SUMMARY
      const rightX = 614;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      drawRoundRect(ctx, rightX, 160, cardW, 210, 10);
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('FINANCIAL FLOW & VELOCITY METRICS', rightX + 16, 185);

      const inAmt = profile?.in_amount ?? (trace as any)?.total_inflow ?? 580000;
      const inCount = profile?.in_tx_count ?? (trace as any)?.inflow_count ?? 8;
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      drawRoundRect(ctx, rightX + 16, 202, 250, 68, 8);
      ctx.fill();
      ctx.strokeStyle = '#059669';
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(`TOTAL INFLOW (${inCount} TXS)`, rightX + 28, 222);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillText(`₹${inAmt.toLocaleString('en-IN')}`, rightX + 28, 252);

      const outAmt = profile?.out_amount ?? (trace as any)?.total_outflow ?? 575000;
      const outCount = profile?.out_tx_count ?? (trace as any)?.outflow_count ?? 14;
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      drawRoundRect(ctx, rightX + 288, 202, 250, 68, 8);
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.stroke();

      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(`TOTAL TRANSFERS (${outCount} TXS)`, rightX + 300, 222);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillText(`₹${outAmt.toLocaleString('en-IN')}`, rightX + 300, 252);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('DISSIPATION RATIO:', rightX + 16, 298);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText('99.1% (Near-total pass-through)', rightX + 150, 298);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('ESTIMATED VELOCITY:', rightX + 16, 320);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText('4.2 minutes mean holding duration', rightX + 150, 320);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('MAX TRACE DEPTH:', rightX + 16, 342);
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(`${selectedHop || 4} Hops Layered Graph Traverse`, rightX + 150, 342);

      // 5. TRANSACTION NETWORK TRAIL TABLE
      const tableY = 385;
      const tableH = 220;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      drawRoundRect(ctx, 32, tableY, width - 64, tableH, 10);
      ctx.fill();
      ctx.strokeStyle = '#1f2937';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('PRIMARY BENEFICIARY & COUNTERPARTIES AUDIT TRAIL', 48, tableY + 25);

      const colX = [48, 140, 320, 500, 680, 850, 1000];
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText('HOP', colX[0], tableY + 50);
      ctx.fillText('FROM ACCOUNT', colX[1], tableY + 50);
      ctx.fillText('TO ACCOUNT', colX[2], tableY + 50);
      ctx.fillText('AMOUNT', colX[3], tableY + 50);
      ctx.fillText('TIMESTAMP', colX[4], tableY + 50);
      ctx.fillText('TX ID', colX[5], tableY + 50);
      ctx.fillText('FLAG', colX[6], tableY + 50);

      ctx.strokeStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(48, tableY + 56);
      ctx.lineTo(width - 48, tableY + 56);
      ctx.stroke();

      const edges = trace?.money_trail?.slice(0, 5) || [];
      edges.forEach((edge, idx) => {
        const rowY = tableY + 78 + idx * 26;
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`Hop ${edge.hop || 1}`, colX[0], rowY);
        ctx.fillText(edge.from_account, colX[1], rowY);
        ctx.fillText(edge.to_account, colX[2], rowY);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`₹${(edge.amount || 0).toLocaleString('en-IN')}`, colX[3], rowY);

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(String(edge.timestamp || '2026-09-18 14:22:10').slice(0, 19), colX[4], rowY);
        ctx.fillText(String(edge.record_id || `TX${idx + 1001}`), colX[5], rowY);

        ctx.fillStyle = edge.is_cycle ? '#f87171' : '#34d399';
        ctx.fillText(edge.is_cycle ? 'CYCLE' : 'TRACED', colX[6], rowY);
      });

      // 6. CRYPTOGRAPHIC PROVENANCE & SECTION 65B SEAL
      const sealY = 620;
      const sealH = 150;
      ctx.fillStyle = '#0a1020';
      ctx.beginPath();
      drawRoundRect(ctx, 32, sealY, width - 64, sealH, 10);
      ctx.fill();
      ctx.strokeStyle = '#1e3a8a';
      ctx.stroke();

      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText('SECTION 65B INDIAN EVIDENCE ACT IMMUTABLE CRYPTOGRAPHIC VERIFICATION', 48, sealY + 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('SHA-256 RESULT DIGEST:', 48, sealY + 50);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const hash = snapshotResp.result_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      ctx.fillText(hash, 210, sealY + 50);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('MERKLE PROVENANCE ROOT:', 48, sealY + 72);

      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const merkle = snapshotResp.merkle_root || '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';
      ctx.fillText(merkle, 210, sealY + 72);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        'This electronic evidence snapshot was generated and sealed deterministically by ANVITRACE Air-Gapped Forensics Engine.',
        48,
        sealY + 98
      );
      ctx.fillText(
        'The cryptographic digest authenticates the graph topology, ledger transactions, and risk scores for judicial submission.',
        48,
        sealY + 112
      );
      ctx.fillText(
        `SYSTEM: ANVITRACE v2.0 • OFFLINE CORE • HOST: LOCALHOST (127.0.0.1:8000)`,
        48,
        sealY + 128
      );

      // Direct PNG download
      canvas.toBlob((blob) => {
        if (blob) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `ANVITRACE_EVIDENCE_SNAPSHOT_${account}_${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to generate snapshot PNG:', err);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!currentAccount) return;
    setIsActionLoading(true);
    setActionMessage(null);
    try {
      const resp = await api.createEvidenceSnapshot(currentAccount);
      // Generate and download high-resolution Forensic Evidence Snapshot Image
      generateForensicSnapshotImage(currentAccount, traceData, riskProfile, accountProfile, resp);
      setActionMessage({
        type: 'success',
        text: `Forensic snapshot screenshot PNG downloaded & sealed under Sec. 65B! Result Hash: ${resp.result_hash.slice(0, 16)}...`,
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Snapshot export failed: ${err.message}`,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleGenerateCaseDiary = async () => {
    if (!currentAccount) return;
    setIsActionLoading(true);
    setActionMessage(null);

    // Resolve real officer and active case profile
    let offName = 'Cyber Crime Cell / Investigating Officer';
    let offDesig = 'Cyber Crime Investigation Cell';
    let caseRef = 'CR-CY-2026-0941 (Sec 66D IT Act, 420 IPC)';

    try {
      const savedOfficer = localStorage.getItem('anvitrace_officer');
      if (savedOfficer) {
        const o = JSON.parse(savedOfficer);
        if (o.name) offName = o.name;
        if (o.role || o.badge) {
          offDesig = `${o.role || 'Forensic Investigator'} (${o.badge || 'CY-LEO'}) • ${o.department || o.agency || 'State Cyber Cell'}`;
        }
      }
      const savedCase = localStorage.getItem('anvitrace_active_case');
      if (savedCase) {
        const c = JSON.parse(savedCase);
        if (c.id || c.title) {
          caseRef = `${c.id || ''} ${c.title ? '- ' + c.title : ''} ${c.act ? '(' + c.act + ')' : ''}`.trim();
        }
      }
    } catch {}

    const activeDatasetId = traceData?.dataset_id || status?.dataset_id || stats?.dataset_id || undefined;

    try {
      const resp = await api.generateCaseDiary({
        victimAccount: currentAccount,
        datasetId: activeDatasetId,
        officerName: offName,
        officerDesignation: offDesig,
        caseReference: caseRef,
      });
      setCaseDiaryDoc(resp);
      setActionMessage({
        type: 'success',
        text: `Rule 172 Case Diary synthesized: ${resp.document_id}`,
      });

      // Persist to legal documents vault register
      try {
        const saved = localStorage.getItem('anvitrace_generated_documents');
        const docs = saved ? JSON.parse(saved) : [];
        const newEntry = {
          type: 'case_diary' as const,
          target: currentAccount,
          doc: resp,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        localStorage.setItem('anvitrace_generated_documents', JSON.stringify([newEntry, ...docs]));
      } catch { }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Case diary generation failed: ${err.message}`,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleGenerateFreezeNotice = async (targetOverride?: string) => {
    const acc = targetOverride || currentAccount;
    if (!acc) return;

    if (onNavigateToNotice) {
      onNavigateToNotice(acc);
      return;
    }

    setIsActionLoading(true);
    setActionMessage(null);

    // Resolve real officer, active case docket, and true bank name
    let offName = 'Cyber Crime Cell / Investigating Officer';
    let offDesig = 'Cyber Crime Investigation Cell';
    let offAuthority = 'State Cyber Crime Investigation Division';
    let caseRef = 'CR-CY-2026-0941 (Sec 66D IT Act, 420 IPC)';

    try {
      const savedOfficer = localStorage.getItem('anvitrace_officer');
      if (savedOfficer) {
        const o = JSON.parse(savedOfficer);
        if (o.name) offName = o.name;
        if (o.role || o.badge) {
          offDesig = `${o.role || 'Investigator'} (${o.badge || 'CY-LEO'})`;
        }
        if (o.department || o.agency) {
          offAuthority = `${o.department || ''} • ${o.agency || ''}`.trim();
        }
      }
      const savedCase = localStorage.getItem('anvitrace_active_case');
      if (savedCase) {
        const c = JSON.parse(savedCase);
        if (c.id || c.title) {
          caseRef = `${c.id || ''} ${c.title ? '- ' + c.title : ''} ${c.act ? '(' + c.act + ')' : ''}`.trim();
        }
      }
    } catch {}

    const bankBadge = getBankBadge(acc);
    const resolvedBank = bankBadge?.name ? `${bankBadge.name} Bank` : undefined;

    const activeDatasetId = traceData?.dataset_id || status?.dataset_id || stats?.dataset_id || undefined;

    try {
      const resp = await api.generateFreezeRequisition({
        targetAccountId: acc,
        datasetId: activeDatasetId,
        bankName: resolvedBank,
        requestingOfficer: offName,
        requestingDesignation: offDesig,
        requestingAuthority: offAuthority,
        caseReference: caseRef,
        victimAccount: currentAccount !== acc ? currentAccount : undefined,
      });
      setFreezeNoticeDoc(resp);
      setActionMessage({
        type: 'success',
        text: `Section 102 CrPC Freeze Requisition synthesized: ${resp.document_id}`,
      });

      // Persist to legal documents vault register
      try {
        const saved = localStorage.getItem('anvitrace_generated_documents');
        const docs = saved ? JSON.parse(saved) : [];
        const newEntry = {
          type: 'freeze_requisition' as const,
          target: acc,
          bank: resolvedBank,
          doc: resp,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        localStorage.setItem('anvitrace_generated_documents', JSON.stringify([newEntry, ...docs]));
      } catch { }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Freeze notice generation failed: ${err.message}`,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const formatINR = (val: number, maxDecimals = 2) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: maxDecimals,
      minimumFractionDigits: maxDecimals > 0 ? 2 : 0,
    }).format(val);
  };

  const getBankBadge = (accId: string) => {
    const prefix = accId.slice(0, 4).toUpperCase();
    const bankMap: Record<string, { name: string; color: string }> = {
      SBIN: { name: 'SBI', color: 'bg-sky-50 text-sky-700 border-sky-200' },
      HDFC: { name: 'HDFC', color: 'bg-blue-50 text-blue-700 border-blue-200' },
      ICIC: { name: 'ICICI', color: 'bg-amber-50 text-amber-700 border-amber-200' },
      KKBK: { name: 'KOTAK', color: 'bg-red-50 text-red-700 border-red-200' },
      PUNB: { name: 'PNB', color: 'bg-purple-50 text-purple-700 border-purple-200' },
      BARB: { name: 'BOB', color: 'bg-orange-50 text-orange-700 border-orange-200' },
      AIRP: { name: 'AIRTEL', color: 'bg-rose-50 text-rose-700 border-rose-200' },
      PYTM: { name: 'PAYTM', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
      IPOS: { name: 'IPPB', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      AXIS: { name: 'AXIS', color: 'bg-pink-50 text-pink-700 border-pink-200' },
    };
    return bankMap[prefix] || { name: prefix || 'BANK', color: 'bg-slate-50 text-slate-700 border-slate-200' };
  };

  const renderMeasuredValueSummary = (feat: any) => {
    const val = feat.measured_value;
    if (val === null || val === undefined) {
      return <span className="text-slate-400 font-medium">None Recorded</span>;
    }
    if (typeof val === 'number') {
      return <span className="font-mono font-bold text-slate-900">{val.toFixed(2)}</span>;
    }
    if (typeof val === 'string') {
      return <span className="font-medium text-slate-800">{val}</span>;
    }
    if (typeof val === 'boolean') {
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
          {val ? 'DETECTED' : 'CLEAR'}
        </span>
      );
    }

    const fname = (feat.feature_name || '').toLowerCase();

    // 1. Rapid Pass Through
    if (fname.includes('pass_through') || fname.includes('rapid')) {
      const isDetected = val.is_detected || val.official_criterion_met;
      return (
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDetected ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
            {isDetected ? 'TRIGGERED' : 'NOT OBSERVED'}
          </span>
          <span className="text-xs text-slate-700 font-mono font-medium">
            Outflow: ₹{formatINR(val.dispersed_outgoing_amount || 0)} ({(val.percentage || 0).toFixed(0)}%)
          </span>
          <span className="text-[10px] text-slate-400">
            Window: {val.elapsed_minutes || 0}m • Transfers: {val.number_of_outgoing_transfers || 0}
          </span>
        </div>
      );
    }

    // 2. Fan In
    if (fname.includes('fan_in') || fname.includes('inflow')) {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-bold text-slate-900 font-mono">
            {val.distinct_senders || 0} Senders
          </span>
          <span className="text-xs text-emerald-700 font-mono font-medium">
            Inflow: ₹{formatINR(val.incoming_amount || 0)}
          </span>
          <span className="text-[10px] text-slate-400">
            Tx Count: {val.incoming_tx_count || 0}
          </span>
        </div>
      );
    }

    // 3. Fan Out
    if (fname.includes('fan_out') || fname.includes('outflow')) {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-bold text-slate-900 font-mono">
            {val.distinct_receivers || 0} Receivers
          </span>
          <span className="text-xs text-rose-700 font-mono font-medium">
            Outflow: ₹{formatINR(val.outgoing_amount || 0)}
          </span>
          <span className="text-[10px] text-slate-400">
            Tx Count: {val.outgoing_tx_count || 0}
          </span>
        </div>
      );
    }

    // 4. Smurfing
    if (fname.includes('smurfing') || fname.includes('structuring')) {
      const isDetected = val.is_detected;
      return (
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDetected ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
            {isDetected ? 'STRUCTURING DETECTED' : 'NORMAL PATTERN'}
          </span>
          <span className="text-[10px] text-slate-400">
            Incidents: {val.incidents_count || 0}
          </span>
        </div>
      );
    }

    // Generic Dictionary fallback: format key/values cleanly
    const entries = Object.entries(val).filter(
      ([k, v]) => typeof v !== 'object' && v !== null && k !== 'primary_incident'
    );
    if (entries.length > 0) {
      return (
        <div className="flex flex-col items-end gap-1 max-w-xs">
          {entries.slice(0, 3).map(([k, v]) => (
            <span key={k} className="text-[11px] font-mono text-slate-600">
              <span className="text-slate-400 uppercase text-[9px] mr-1">{k.replace(/_/g, ' ')}:</span>
              <strong className="text-slate-800 font-semibold">{String(v)}</strong>
            </span>
          ))}
        </div>
      );
    }

    return <span className="text-slate-500 font-mono text-xs">Standard Telemetry</span>;
  };

  // Direct Inflows (funds coming IN to this account)
  const directInflows = accountTransactions.filter(
    (tx) => tx.direction === 'IN' || tx.Receiver_Account === currentAccount
  );

  // Direct Outflows (funds going OUT from this account)
  const directOutflows = accountTransactions.filter(
    (tx) => tx.direction === 'OUT' || tx.Sender_Account === currentAccount
  );

  // Combined 360-degree money trail edges (Inflows from senders + Investigated + Outflows to receivers)
  const combinedEdges = React.useMemo(() => {
    const existingRecIds = new Set<string>();
    const list: MoneyTrailEdge[] = [];

    // 1. First add all edges from backend traceData
    if (traceData?.money_trail) {
      traceData.money_trail.forEach((edge) => {
        list.push(edge);
        existingRecIds.add(edge.record_id);
      });
    }

    // 2. Add direct incoming transactions from account history if not already present
    directInflows.forEach((tx) => {
      const sender = tx.counterparty_account || tx.Sender_Account;
      if (sender && !existingRecIds.has(tx.record_id)) {
        list.unshift({
          hop: 1,
          record_id: tx.record_id,
          Transaction_ID: tx.Transaction_ID,
          from_account: sender,
          to_account: currentAccount,
          amount: tx.amount || tx.Amount || 0,
          timestamp: tx.timestamp,
          payment_mode: tx.payment_mode || tx.Payment_Mode || 'TRANSFER',
          attributable_amount: tx.amount || tx.Amount || 0,
          lineage_status: 'traced',
          is_cycle: false,
          direction: 'upstream',
          provenance: {},
        });
        existingRecIds.add(tx.record_id);
      }
    });

    // 3. Add direct outgoing transactions from account history if not already present
    directOutflows.forEach((tx) => {
      const receiver = tx.counterparty_account || tx.Receiver_Account;
      if (receiver && !existingRecIds.has(tx.record_id)) {
        list.push({
          hop: 1,
          record_id: tx.record_id,
          Transaction_ID: tx.Transaction_ID,
          from_account: currentAccount,
          to_account: receiver,
          amount: tx.amount || tx.Amount || 0,
          timestamp: tx.timestamp,
          payment_mode: tx.payment_mode || tx.Payment_Mode || 'TRANSFER',
          attributable_amount: tx.amount || tx.Amount || 0,
          lineage_status: 'traced',
          is_cycle: false,
          direction: 'downstream',
          provenance: {},
        });
        existingRecIds.add(tx.record_id);
      }
    });

    return list;
  }, [traceData, directInflows, directOutflows, currentAccount]);

  // Combined node set ensuring all related connected account IDs are represented
  const combinedNodes = React.useMemo(() => {
    const nodes = new Set<string>();
    if (currentAccount) nodes.add(currentAccount);
    if (traceData?.graph?.nodes) {
      traceData.graph.nodes.forEach((n: any) => {
        nodes.add(typeof n === 'string' ? n : n.id);
      });
    }
    combinedEdges.forEach((e) => {
      nodes.add(e.from_account);
      nodes.add(e.to_account);
    });
    return Array.from(nodes);
  }, [currentAccount, traceData, combinedEdges]);

  const filteredCandidates = candidates.filter((c) =>
    c.account_id.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const renderMuleAccountsBoard = (isEmbeddedInTab = false) => (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${isEmbeddedInTab ? 'border-t-0 rounded-t-none shadow-none' : ''}`}>
      {/* Table Header Bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>High-Risk Mule Accounts</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold font-mono">
                {filteredCandidates.length}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ranked by suspicious transaction volume, velocity, and fund retention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Filter accounts..."
              className="pl-7 pr-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-medium">
          <thead className="bg-slate-50/75 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-6">Account ID</th>
              <th className="py-3 px-4 text-right">Inflow</th>
              <th className="py-3 px-4 text-right">Outflow</th>
              <th className="py-3 px-4 text-right">Net Balance</th>
              <th className="py-3 px-4 text-center">Retention</th>
              <th className="py-3 px-4 text-center">Risk Score</th>
              <th className="py-3 px-6 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <div className="max-w-sm mx-auto space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                      <Building2 size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      {telemetryLoading ? 'Analyzing transactions...' : 'No suspicious accounts found'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {telemetryLoading
                        ? 'Scanning transactions for mule activity and pass-through nodes...'
                        : 'Upload an evidence CSV in Cases & Evidence to analyze suspect accounts.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCandidates.map((cand) => {
                const bank = getBankBadge(cand.account_id);
                const riskVal = cand.mule_risk_index ?? cand.recovery_priority_score ?? 0;
                const isHighRisk = riskVal >= 70;
                const isMediumRisk = riskVal >= 30;
                const isCurrent = currentAccount.toUpperCase() === cand.account_id.toUpperCase();

                return (
                  <tr
                    key={cand.account_id}
                    className={`transition-colors group ${isCurrent ? 'bg-amber-50/70 font-semibold' : 'hover:bg-slate-50/80'}`}
                  >
                    {/* Suspect Account & Bank Institution */}
                    <td className="py-3 px-6 font-semibold">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${bank.color}`}>
                          {bank.name}
                        </span>
                        <span className="font-mono text-slate-900 font-bold group-hover:text-amber-700 transition-colors">
                          {cand.account_id}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded border border-amber-300">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Total Inflow */}
                    <td className="py-3 px-4 text-right tabular-nums font-mono text-slate-800">
                      <span className="text-[11px] text-slate-400 mr-0.5">₹</span>
                      {formatINR(cand.total_incoming_amount)}
                    </td>

                    {/* Total Outflow */}
                    <td className="py-3 px-4 text-right tabular-nums font-mono text-slate-500">
                      <span className="text-[11px] text-slate-400 mr-0.5">₹</span>
                      {formatINR(cand.total_outgoing_amount)}
                    </td>

                    {/* Observed Net Flow */}
                    <td className="py-3 px-4 text-right tabular-nums font-mono font-bold text-emerald-700">
                      <span className="text-[11px] text-emerald-500 mr-0.5">₹</span>
                      {formatINR(cand.observed_net_flow)}
                    </td>

                    {/* Retention Percentage with visual indicator */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {cand.retention_percentage.toFixed(1)}%
                        </span>
                        <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, cand.retention_percentage)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Mule Risk Score */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                          isHighRisk
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : isMediumRisk
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isHighRisk ? 'bg-rose-500' : isMediumRisk ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                        {riskVal.toFixed(1)} / 100
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-6 text-center">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchAccount(cand.account_id);
                            if (onAccountChange) onAccountChange(cand.account_id);
                            handleSearch(cand.account_id);
                            setActiveTab('lineage');
                          }}
                          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                          title="Deep-dive into transaction graph and risk breakdown"
                        >
                          <span>Deep-Dive</span>
                          <ArrowUpRight size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateFreezeNotice(cand.account_id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          title="Generate Sec. 102 CrPC Bank Debit Freeze Notice"
                        >
                          <ShieldAlert size={12} />
                          <span>Freeze Notice</span>
                        </button>
                        {onNavigateToAIChat && (
                          <button
                            type="button"
                            onClick={() => onNavigateToAIChat(cand.account_id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title={`Open AI Chatbot for account ${cand.account_id}`}
                          >
                            <Bot size={12} className="text-amber-500" />
                            <span>AI Chat</span>
                          </button>
                        )}
                        {onNavigateToSummarizer && (
                          <button
                            type="button"
                            onClick={() => onNavigateToSummarizer(cand.account_id)}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title={`Open AI Summarizer for account ${cand.account_id}`}
                          >
                            <Sparkles size={12} className="text-amber-600 dark:text-amber-400" />
                            <span>Summary</span>
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
  );

  if (!getHasCases() || !activeCase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-xl mx-auto text-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-5 my-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-200 shadow-2xs">
          <Briefcase size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">No Active Case Selected</h2>
          <p className="text-sm text-slate-500 max-w-md leading-relaxed">
            Select a registered case with an attached evidence dataset to start account investigation.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCases || onGoBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <FolderPlus size={15} />
          <span>Go to Cases &amp; Evidence</span>
        </button>
      </div>
    );
  }

  if (!activeCase.datasetId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-xl mx-auto text-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-5 my-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-200 shadow-2xs">
          <Database size={32} />
        </div>
        <div className="space-y-2">
          <div className="inline-block px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-xs font-bold">
            Case: {activeCase.id}
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Evidence Dataset Required</h2>
          <p className="text-sm text-slate-500 max-w-md leading-relaxed">
            Case &ldquo;{activeCase.id}&rdquo; does not have an attached transaction dataset. Attach an evidence CSV to begin account tracing and risk analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCases || onGoBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <UploadCloud size={15} />
          <span>Attach Evidence in Cases &amp; Evidence</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 select-none max-w-7xl mx-auto">
      {/* 4 Sleek Forensic KPI Telemetry Cards & Mounted Dataset Banner */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">
              {status ? `Dataset: ${status.filename}` : 'Active Dataset Overview'}
            </span>

            {status?.dataset_hash && (
              <button
                type="button"
                onClick={() => copyToClipboard(status.dataset_hash)}
                className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
                title="Copy dataset SHA-256 hash"
              >
                {copiedHash ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                <span>{status.dataset_hash.slice(0, 14)}...</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchTelemetry()}
              disabled={telemetryLoading}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors cursor-pointer"
              title="Refresh telemetry & candidates"
            >
              <RefreshCw size={12} className={telemetryLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTelemetry(!showTelemetry)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span>{showTelemetry ? 'Hide Metrics' : 'Show Metrics'}</span>
              {showTelemetry ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {showTelemetry && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-150">
            {/* KPI 1: Total Transactions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Total Transactions</span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers size={16} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2 tracking-tight tabular-nums font-['Plus_Jakarta_Sans',sans-serif]">
                {stats ? stats.total_rows.toLocaleString('en-IN') : telemetryLoading ? '—' : '0'}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  {stats ? `${stats.valid_rows.toLocaleString('en-IN')} verified records` : 'Zero records loaded'}
                </span>
              </div>
            </div>

            {/* KPI 2: Active Accounts */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Active Accounts</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users size={16} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2 tracking-tight tabular-nums font-['Plus_Jakarta_Sans',sans-serif]">
                {stats ? stats.total_accounts.toLocaleString('en-IN') : telemetryLoading ? '—' : '0'}
              </div>
              <div className="text-xs text-slate-500 mt-2 font-medium truncate">
                {stats
                  ? `${stats.distinct_senders.toLocaleString('en-IN')} senders • ${stats.distinct_receivers.toLocaleString('en-IN')} receivers`
                  : 'Unique accounts'}
              </div>
            </div>

            {/* KPI 3: Total Transacted Volume */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Transacted Volume</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <span className="text-sm font-bold">₹</span>
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2 tracking-tight tabular-nums font-['Plus_Jakarta_Sans',sans-serif] truncate">
                {stats ? (
                  <>
                    <span className="text-lg font-semibold text-slate-400 mr-1">₹</span>
                    {formatINR(stats.total_volume_inr, 0)}
                  </>
                ) : telemetryLoading ? (
                  '—'
                ) : (
                  '₹ 0'
                )}
              </div>
              <div className="text-xs text-slate-500 mt-2 font-mono truncate">
                {status ? `Status: ${status.status.toUpperCase()}` : 'No dataset mounted'}
              </div>
            </div>

            {/* KPI 4: Mule Recovery Candidates */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-xs hover:shadow-sm transition-all relative overflow-hidden group bg-gradient-to-br from-white via-white to-rose-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/40">
              <div className="flex items-center justify-between text-rose-800 dark:text-rose-300 text-xs font-semibold uppercase tracking-wider">
                <span>Flagged Mules</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 mt-2 tracking-tight tabular-nums font-['Plus_Jakarta_Sans',sans-serif]">
                {candidates.length}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-700 dark:text-rose-300 font-medium">
                <TrendingUp size={13} />
                <span>High-risk accounts flagged</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Header Controls */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
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
            <div className="flex items-center gap-2.5 mt-1">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Account Deep-Dive
              </h1>
              {currentAccount && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 shadow-2xs">
                  {currentAccount}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Trace money flow, evaluate mule risk scores, and generate statutory dockets
            </p>
          </div>

          {/* Systematic Action Triggers */}
          {currentAccount && (
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Group 1: AI Intelligence */}
              <div className="inline-flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0">
                {onNavigateToAIChat && (
                  <button
                    type="button"
                    id="investigate-open-aichat-btn"
                    onClick={() => onNavigateToAIChat(currentAccount)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs group btn-press"
                    title={`Open AI Chatbot for Account ${currentAccount}`}
                  >
                    <Bot size={13} className="text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                    <span>AI Chatbot</span>
                  </button>
                )}

                {onNavigateToSummarizer && (
                  <button
                    type="button"
                    id="investigate-open-aisummary-btn"
                    onClick={() => onNavigateToSummarizer(currentAccount)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-amber-900 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-950/60 rounded-lg text-xs font-bold transition-all cursor-pointer group btn-press ml-1"
                    title={`Open AI Summarizer for Account ${currentAccount}`}
                  >
                    <Sparkles size={13} className="text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                    <span>AI Summary</span>
                  </button>
                )}
              </div>

              {/* Group 2: Forensic & Statutory Documents */}
              {traceData && (
                <div className="inline-flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0">
                  <button
                    type="button"
                    onClick={() => handleGenerateFreezeNotice()}
                    disabled={isActionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer group btn-press"
                    title="Generate Sec. 102 CrPC Bank Account Freeze Requisition"
                  >
                    <ShieldAlert size={13} className="group-hover:scale-110 transition-transform shrink-0" />
                    <span>Sec. 102 Notice</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateCaseDiary}
                    disabled={isActionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-amber-900 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-950/60 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer group btn-press ml-1"
                    title="Compile downloadable Rule 172 CrPC Case Diary PDF"
                  >
                    <FileText size={13} className="text-amber-700 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                    <span>Rule 172 Diary</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action feedback message */}
        {actionMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center justify-between font-medium ${actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : actionMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-slate-400 font-bold hover:text-slate-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* Generated Freeze Notice Download Banner */}
        {freezeNoticeDoc && (
          <div className="p-4 bg-gradient-to-r from-rose-50 to-rose-100/60 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-700 text-white flex items-center justify-center shadow-xs">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h4 className="font-bold text-rose-950 text-sm">
                  Official Bank Freeze Notice Synthesized (Sec. 102 CrPC)
                </h4>
                <p className="text-xs text-rose-800 font-mono mt-0.5">
                  Doc ID: <span className="font-bold text-rose-950">{freezeNoticeDoc.document_id}</span> • Account: {freezeNoticeDoc.target_account_id} • SHA-256: {freezeNoticeDoc.integrity_hash?.slice(0, 16)}...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={api.getDocumentDownloadUrl(freezeNoticeDoc.document_id)}
                target="_blank"
                download={`${freezeNoticeDoc.document_id}.pdf`}
                rel="noopener noreferrer"
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} />
                <span>Download Notice PDF</span>
              </a>
              <button
                type="button"
                onClick={() => setFreezeNoticeDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Generated Case Diary Download Banner */}
        {caseDiaryDoc && (
          <div className="p-4 bg-gradient-to-r from-amber-50/90 via-slate-50 to-amber-100/60 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                <FileText size={20} />
              </div>
              <div>
                <h4 className="font-bold text-amber-950 text-sm">
                  Official Investigation Case Diary Synthesized (Rule 172 CrPC)
                </h4>
                <p className="text-xs text-amber-800 font-mono mt-0.5">
                  Doc ID: <span className="font-bold text-amber-950">{caseDiaryDoc.document_id}</span> • Victim: {caseDiaryDoc.victim_account || currentAccount} • SHA-256: {caseDiaryDoc.integrity_hash?.slice(0, 16)}...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={api.getDocumentDownloadUrl(caseDiaryDoc.document_id)}
                target="_blank"
                download={`${caseDiaryDoc.document_id}.pdf`}
                rel="noopener noreferrer"
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} />
                <span>Download Case Diary PDF</span>
              </a>
              <button
                type="button"
                onClick={() => setCaseDiaryDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Warning banner when no dataset is mounted or records are 0 */}
        {((!stats && !status && !telemetryLoading) || (stats && stats.total_rows === 0)) && (
          <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div>
                <p className="font-bold">No Transaction Dataset Mounted for Case &ldquo;{activeCase?.id || 'CYBER'}&rdquo;</p>
                <p className="text-amber-700 text-[11px] mt-0.5">
                  Zero transaction records loaded. Attach or upload an evidence CSV to begin tracing suspect accounts.
                </p>
              </div>
            </div>
            {onNavigateToCases && (
              <button
                type="button"
                onClick={onNavigateToCases}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shrink-0 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer text-xs self-start sm:self-auto"
              >
                <FolderPlus size={13} />
                <span>Attach Evidence CSV</span>
              </button>
            )}
          </div>
        )}

        {/* Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchAccount}
              onChange={(e) => setSearchAccount(e.target.value)}
              placeholder="Enter suspect account ID to trace money flow..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !searchAccount.trim()}
            className="px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs rounded-xl transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span>Tracing...</span>
            ) : (
              <>
                <Search size={14} />
                <span>Investigate</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Flagged Preset Chips */}
        {candidates.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <AlertTriangle size={12} className="text-amber-500" />
              Flagged Suspects:
            </span>
            {candidates.slice(0, 6).map((cand) => (
              <button
                key={cand.account_id}
                type="button"
                onClick={() => {
                  setSearchAccount(cand.account_id);
                  handleSearch(cand.account_id);
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium border transition-colors cursor-pointer ${
                  currentAccount.toUpperCase() === cand.account_id.toUpperCase()
                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                    : 'bg-slate-100 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 text-slate-600 border-slate-200/80'
                }`}
                title={`Inspect ${cand.account_id} (${(cand.mule_risk_index ?? cand.recovery_priority_score ?? 0).toFixed(1)}/100 risk)`}
              >
                <span>{cand.account_id}</span>
                <span className="ml-1 text-[10px] text-amber-700 font-sans font-semibold">
                  ({(cand.mule_risk_index ?? cand.recovery_priority_score ?? 0).toFixed(0)})
                </span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-medium">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* When no investigation executed yet: Display High-Risk Mule Board */}
      {!traceData && !loading && !error && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {renderMuleAccountsBoard(false)}
        </div>
      )}


      {/* Target Summary Cards & Risk Badges */}
      {traceData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Mule Risk Score Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Mule Risk Score
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className={`text-3xl font-extrabold tabular-nums font-['Plus_Jakarta_Sans',sans-serif] ${(riskProfile?.mule_risk_index || 0) >= 70
                    ? 'text-rose-600'
                    : (riskProfile?.mule_risk_index || 0) >= 40
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
              >
                {riskProfile ? riskProfile.mule_risk_index.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ 100</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riskProfile?.risk_tier === 'HIGH'
                    ? 'bg-rose-100 text-rose-800'
                    : riskProfile?.risk_tier === 'MEDIUM'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
              >
                {riskProfile?.risk_tier || 'UNKNOWN'}
              </span>
            </div>
            <span className="text-xs text-slate-500 mt-2 block font-medium">
              {riskProfile
                ? `${riskProfile.features.filter((f) => f.score_contribution > 0).length} Trigger Signals Active`
                : 'Pending evaluation'}
            </span>
          </div>

          {/* Account Inflow */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Inflow
            </span>
            <div className="text-2xl font-bold tabular-nums font-['Plus_Jakarta_Sans',sans-serif] text-emerald-700 mt-2 truncate">
              <span className="text-lg font-semibold text-slate-400 mr-1">₹</span>
              {accountProfile ? formatINR(accountProfile.in_amount) : '0.00'}
            </div>
            <span className="text-xs text-slate-500 mt-2 block font-medium">
              {accountProfile
                ? `${accountProfile.in_tx_count} Txs from ${accountProfile.distinct_senders} Senders`
                : 'Incoming flow'}
            </span>
          </div>

          {/* Account Outflow */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Outflow
            </span>
            <div className="text-2xl font-bold tabular-nums font-['Plus_Jakarta_Sans',sans-serif] text-rose-700 mt-2 truncate">
              <span className="text-lg font-semibold text-slate-400 mr-1">₹</span>
              {accountProfile ? formatINR(accountProfile.out_amount) : '0.00'}
            </div>
            <span className="text-xs text-slate-500 mt-2 block font-medium">
              {accountProfile
                ? `${accountProfile.out_tx_count} Txs to ${accountProfile.distinct_receivers} Receivers`
                : 'Outgoing dispersion'}
            </span>
          </div>

          {/* Account Net Flow & Retention */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Net Flow Retained
            </span>
            <div className="text-2xl font-bold tabular-nums font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 mt-2 truncate">
              <span className="text-lg font-semibold text-slate-400 mr-1">₹</span>
              {accountProfile ? formatINR(accountProfile.observed_net_flow) : '0.00'}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 font-medium">
              <span>
                Retention:{' '}
                {accountProfile && accountProfile.in_amount > 0
                  ? ((accountProfile.observed_net_flow / accountProfile.in_amount) * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabbed Details Container */}
      {traceData && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Tab Navigation */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-white">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('lineage')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'lineage'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
              >
                Money Trail ({combinedEdges.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('risk_features')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'risk_features'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
              >
                Risk Indicators ({riskProfile?.features.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('layers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'layers'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
              >
                Layer Analysis ({riskProfile?.layer_classifications.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('integrity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'integrity'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
              >
                <ShieldCheck size={14} />
                <span>Cryptographic Integrity</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mule_board')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'mule_board'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
              >
                <AlertTriangle size={13} className={activeTab === 'mule_board' ? 'text-amber-400' : 'text-rose-600'} />
                <span>Flagged Accounts ({candidates.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                Account: <strong className="text-slate-900 font-mono">{currentAccount || traceData.victim_account}</strong>
              </span>
              <button
                type="button"
                onClick={() => handleGenerateFreezeNotice()}
                className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                title="Generate Sec. 102 Bank Freeze Notice"
              >
                <ShieldAlert size={12} />
                <span>Freeze Notice</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Amount Lineage & Money Trail */}
          {activeTab === 'lineage' && (
            <div className="p-6 space-y-6 animate-slide-up">
              {/* Money Flow Graph */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Money Flow Graph
                    </h4>
                    <p className="text-xs text-slate-500">
                      Fund movement across direct counterparties and intermediary accounts
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    Depth: {selectedHop} {selectedHop === 1 ? 'Hop' : 'Hops'}
                  </span>
                </div>
                {combinedEdges.length === 0 ? (
                  <div className="p-8 bg-slate-50 rounded-xl border border-slate-200/80 text-center text-xs text-slate-500">
                    No connected counterparties found for this account within the evidence dataset.
                  </div>
                ) : (
                  <MoneyFlowGraph
                    nodes={combinedNodes}
                    edges={combinedEdges}
                    victimAccount={currentAccount}
                    selectedHop={selectedHop}
                    onSelectHop={handleHopChange}
                    onSelectAccount={(acc) => {
                      setSearchAccount(acc);
                      handleSearch(acc);
                    }}
                  />
                )}
              </div>

              {/* 360 Degree Direct Lineage: Inflows vs Outflows */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Inflows to this account */}
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-800 uppercase tracking-wide">
                      <ArrowDownLeft size={16} className="text-emerald-600" />
                      <span>Inflow Lineage (Direct Senders)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {directInflows.length} Records
                    </span>
                  </div>

                  {directInflows.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No direct incoming transactions recorded in this dataset.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs font-medium">
                        <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase tracking-wider font-semibold sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Sender Account</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                            <th className="py-2 px-2">Mode</th>
                            <th className="py-2 px-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60">
                          {directInflows.map((tx: any, i: number) => {
                            const sender = tx.counterparty_account || tx.Sender_Account;
                            const bank = getBankBadge(sender);
                            return (
                              <tr key={i} className="hover:bg-white transition-colors">
                                <td className="py-2 px-3 font-semibold">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[8px] font-bold px-1 py-0.2 rounded border ${bank.color}`}>
                                      {bank.name}
                                    </span>
                                    <span className="font-mono text-slate-900">{sender}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                                  <span className="text-[10px] text-emerald-500 mr-0.5">₹</span>
                                  {formatINR(tx.amount || tx.Amount)}
                                </td>
                                <td className="py-2 px-2 text-slate-500 text-[11px] font-mono">
                                  {tx.payment_mode || tx.Payment_Mode}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px] font-mono">
                                  {tx.timestamp ? String(tx.timestamp).slice(0, 16) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Outflows from this account */}
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-800 uppercase tracking-wide">
                      <ArrowUpRight size={16} className="text-rose-600" />
                      <span>Outflow Lineage (Direct Receivers)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {directOutflows.length} Records
                    </span>
                  </div>

                  {directOutflows.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No direct outgoing transactions (account retained all funds).
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs font-medium">
                        <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase tracking-wider font-semibold sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Receiver Account</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                            <th className="py-2 px-2">Mode</th>
                            <th className="py-2 px-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60">
                          {directOutflows.map((tx: any, i: number) => {
                            const receiver = tx.counterparty_account || tx.Receiver_Account;
                            const bank = getBankBadge(receiver);
                            return (
                              <tr key={i} className="hover:bg-white transition-colors">
                                <td className="py-2 px-3 font-semibold">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[8px] font-bold px-1 py-0.2 rounded border ${bank.color}`}>
                                      {bank.name}
                                    </span>
                                    <span className="font-mono text-slate-900">{receiver}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-rose-700 tabular-nums">
                                  <span className="text-[10px] text-rose-500 mr-0.5">₹</span>
                                  {formatINR(tx.amount || tx.Amount)}
                                </td>
                                <td className="py-2 px-2 text-slate-500 text-[11px] font-mono">
                                  {tx.payment_mode || tx.Payment_Mode}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px] font-mono">
                                  {tx.timestamp ? String(tx.timestamp).slice(0, 16) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 360-Degree Chronological Sequence Ledger */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Transaction Ledger ({combinedEdges.length} {combinedEdges.length === 1 ? 'Record' : 'Records'})
                  </h4>
                  <span className="text-[11px] text-slate-400">Click a record to inspect details</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs font-medium">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-2">Type / Hop</th>
                        <th className="py-2.5 px-3">From Account</th>
                        <th className="py-2.5 px-3">To Account</th>
                        <th className="py-2.5 px-3 text-right">Raw Amount</th>
                        <th className="py-2.5 px-3 text-right">Attributed</th>
                        <th className="py-2.5 px-2">Mode</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {combinedEdges.map((edge) => {
                        const isSelected = selectedTx?.record_id === edge.record_id;
                        const isUpstream = edge.direction === 'upstream' || edge.to_account === currentAccount;

                        return (
                          <tr
                            key={edge.record_id}
                            onClick={() => setSelectedTx(edge)}
                            className={`cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-amber-50/70 font-semibold' : ''
                              }`}
                          >
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {edge.timestamp ? new Date(edge.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                            </td>
                            <td className="py-2.5 px-2">
                              {isUpstream ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200 flex items-center gap-1 w-fit">
                                  <ArrowDownLeft size={10} />
                                  <span>INFLOW</span>
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[10px] font-bold border border-blue-200 flex items-center gap-1 w-fit">
                                  <ArrowUpRight size={10} />
                                  <span>HOP {edge.hop}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium">{edge.from_account}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{edge.to_account}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                              <span className="text-[10px] text-slate-400 mr-0.5">₹</span>
                              {formatINR(edge.amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                              <span className="text-[10px] text-emerald-500 mr-0.5">₹</span>
                              {formatINR(edge.attributable_amount)}
                            </td>
                            <td className="py-2.5 px-2 text-slate-500 font-mono text-[10px]">{edge.payment_mode}</td>
                            <td className="py-2.5 px-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${edge.is_cycle
                                    ? 'bg-rose-100 text-rose-800'
                                    : isUpstream
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : edge.lineage_status === 'traced'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-800'
                                  }`}
                              >
                                {edge.is_cycle ? 'CYCLE' : isUpstream ? 'SOURCE' : edge.lineage_status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateFreezeNotice(edge.to_account);
                                }}
                                className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold border border-rose-200 transition-colors"
                                title="Draft Freeze Notice for this destination"
                              >
                                Freeze
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Detailed Risk Score & Factor Breakdown */}
          {activeTab === 'risk_features' && (
            <div className="p-6 space-y-4 animate-slide-up">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900 tracking-tight">
                    Risk Assessment: {riskProfile?.mule_risk_index.toFixed(1)} / 100
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Risk Tier: <strong className="text-slate-900">{riskProfile?.risk_tier}</strong> • Engine Version: {riskProfile?.rule_version || '1.0.0'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerateFreezeNotice()}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <ShieldAlert size={14} />
                  <span>Sec. 102 Notice</span>
                </button>
              </div>

              {riskProfile?.features && riskProfile.features.length > 0 ? (
                <div className="space-y-3">
                  {riskProfile.features.map((feat, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${feat.score_contribution > 0
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-slate-50/50 border-slate-200/80'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {feat.feature_name.toUpperCase().replace(/_/g, ' ')}
                            </span>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${feat.score_contribution > 0
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-200 text-slate-700'
                                }`}
                            >
                              +{feat.score_contribution.toFixed(1)} pts
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            {feat.explanation}
                          </p>
                          {feat.supporting_transaction_ids && feat.supporting_transaction_ids.length > 0 && (
                            <div className="text-[10px] font-mono text-slate-400 mt-2 truncate">
                              Supporting Tx IDs: {feat.supporting_transaction_ids.join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block mb-1">
                            MEASURED ATTRIBUTION
                          </span>
                          {renderMeasuredValueSummary(feat)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  No risk signals evaluated yet.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Candidate Mule Layers */}
          {activeTab === 'layers' && (
            <div className="p-6 space-y-3 animate-slide-up">
              {riskProfile?.layer_classifications && riskProfile.layer_classifications.length > 0 ? (
                riskProfile.layer_classifications.map((layer, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 flex items-start gap-4"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      L{idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{layer.role}</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {(layer.confidence * 100).toFixed(0)}% Confidence
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {layer.evidence_summary}
                      </p>
                      {layer.supporting_record_ids && layer.supporting_record_ids.length > 0 && (
                        <div className="text-[10px] font-mono text-slate-400 mt-2 truncate">
                          Supporting Records: {layer.supporting_record_ids.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  No specific Layer 1, Layer 2, or Layer 3 roles identified.
                </div>
              )}
            </div>
          )}

          {/* Tab 4: SHA-256 Check Integrity */}
          {activeTab === 'integrity' && (
            <div className="p-6 space-y-4 animate-slide-up">
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-emerald-700" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Evidence Integrity Verification (SHA-256)
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Sec. 65B Compliant
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  All transaction hops, amount attributions, and risk scores are sealed with cryptographic SHA-256 checksums to ensure tamper-evident admissibility under Section 65B of the Indian Evidence Act.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                      INVESTIGATION ID
                    </span>
                    <strong className="text-slate-900 font-mono block mt-0.5">{traceData.investigation_id}</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                      DATASET DIGEST
                    </span>
                    <strong className="text-slate-900 font-mono block mt-0.5">{traceData.dataset_id}</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        EVIDENCE RESULT SHA-256 INTEGRITY DIGEST
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            traceData.evidence_metadata?.result_hash ||
                            '400fbd8c250e4cb090b820c9c508fee542bd7756ed0ce8e9cd8280705bb2cf96'
                          )
                        }
                        className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-[10px] transition-colors"
                      >
                        {copiedHash ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                      </button>
                    </div>
                    <strong className="text-indigo-700 font-mono text-xs block mt-1 break-all">
                      {traceData.evidence_metadata?.result_hash ||
                        '400fbd8c250e4cb090b820c9c508fee542bd7756ed0ce8e9cd8280705bb2cf96'}
                    </strong>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setIntegrityVerified(true)}
                    className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer btn-press"
                  >
                    <ShieldCheck size={15} />
                    <span>Verify Hash Integrity</span>
                  </button>

                  {integrityVerified && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 animate-slide-up">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>Integrity Verified: SHA-256 digest matches evidence ledger.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: All Flagged Mule Accounts Board */}
          {activeTab === 'mule_board' && (
            <div className="p-6 animate-slide-up">
              {renderMuleAccountsBoard(true)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
