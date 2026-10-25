/**
 * ANVITRACE — API Client for Backend Communication
 * Connects directly to the 14 FastAPI backend endpoints.
 */

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

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

export interface DatasetStatus {
  dataset_id: string;
  dataset_hash: string;
  filename: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  repeated_tx_ids: number;
  exact_duplicates: number;
  status: string;
}

export interface DatasetStats {
  dataset_id: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  total_accounts: number;
  total_volume_inr: number;
  distinct_senders: number;
  distinct_receivers: number;
  repeated_tx_ids: number;
  exact_duplicates: number;
  payment_mode_distribution: Record<string, number>;
}

export interface AccountProfile {
  account_id: string;
  dataset_id: string;
  in_tx_count: number;
  out_tx_count: number;
  in_amount: number;
  out_amount: number;
  observed_net_flow: number;
  distinct_senders: number;
  distinct_receivers: number;
  first_tx_timestamp?: string;
  last_tx_timestamp?: string;
  disclaimer: string;
}

export interface MoneyTrailEdge {
  hop: number;
  record_id: string;
  Transaction_ID: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  payment_mode: string;
  attributable_amount: number;
  lineage_status: string;
  is_cycle: boolean;
  parent_record_id?: string;
  direction?: 'root' | 'upstream' | 'downstream';
  provenance: Record<string, any>;
}

export interface GraphNode {
  id: string;
  hop: number;
  total_inflow: number;
  total_outflow: number;
  role?: string;
}

export interface InvestigationTrace {
  investigation_id: string;
  victim_account: string;
  dataset_id: string;
  max_hops: number;
  money_trail: MoneyTrailEdge[];
  graph: {
    nodes: GraphNode[];
    edges: MoneyTrailEdge[];
    total_hops_found: number;
    total_attributed_amount: number;
  };
  execution_time_ms: number;
  disclaimer: string;
  evidence_metadata?: {
    investigation_id: string;
    victim_account: string;
    supporting_record_ids: string[];
    supporting_transaction_ids: string[];
    result_hash: string;
  };
}

export interface RiskFeature {
  feature_name: string;
  score_contribution: number;
  measured_value: any;
  explanation: string;
  supporting_record_ids: string[];
  supporting_transaction_ids: string[];
}

export interface LayerClassification {
  role: string;
  confidence: number;
  evidence_summary: string;
  supporting_record_ids: string[];
}

export interface AccountRiskProfile {
  account_id: string;
  dataset_id: string;
  mule_risk_index: number;
  risk_tier: string;
  features: RiskFeature[];
  layer_classifications: LayerClassification[];
  rule_version: string;
  baseline_mitigation_applied: boolean;
  evaluation_timestamp: string;
  disclaimer: string;
}

export interface RecoveryCandidate {
  account_id: string;
  observed_net_flow: number;
  total_incoming_amount: number;
  total_outgoing_amount: number;
  retention_percentage: number;
  time_window_start?: string;
  time_window_end?: string;
  supporting_incoming_record_ids: string[];
  supporting_outgoing_record_ids: string[];
  mule_risk_index?: number;
  recovery_priority_score: number;
  recovery_related_evidence: Record<string, any>;
  disclaimer: string;
}

export interface CrossVictimResponse {
  dataset_id: string;
  analyzed_victims: string[];
  shared_infrastructure_candidates: Array<{
    candidate_account_id: string;
    connected_victim_accounts: string[];
    victim_count: number;
    shared_device_types: string[];
    shared_ip_addresses: string[];
    connecting_transactions: any[];
    total_flowing_amount: number;
    candidate_layer_roles: string[];
    linkage_rationale: string;
  }>;
  candidate_linkage_disclaimer: string;
}

export interface EvidenceSnapshotResponse {
  snapshot: {
    investigation_id: string;
    dataset_id: string;
    dataset_hash: string;
    app_version: string;
    rule_version: string;
    victim_account: string;
    max_hops: number;
    result_hash: string;
    created_at: string;
    money_trail_summary: Record<string, any>;
    layer_candidates: any[];
    risk_summary: Record<string, any>;
    evidence_items: any[];
    integrity_disclaimer: string;
  };
  reproducibility_note: string;
}

export type DatasetStatistics = DatasetStats;

export interface DocumentResponse {
  document_id: string;
  investigation_id: string;
  file_path: string;
  file_format?: string;
  generated_at: string;
  integrity_hash: string;
  victim_account?: string;
  target_account_id?: string;
  document_type?: string;
  disclaimer?: string;
  rendered_text?: string;
  page_count?: number;
  evidence_item_count?: number;
  evidence_summary?: Record<string, any>;
}

export const api = {
  // 1. Health
  checkHealth: async () => {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Backend offline');
    return res.json();
  },

  // 2. Dataset
  getDatasetStatus: async (datasetId?: string): Promise<DatasetStatus> => {
    const url = datasetId ? `${API_BASE}/dataset/status?dataset_id=${datasetId}` : `${API_BASE}/dataset/status`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Dataset status unavailable');
    return res.json();
  },

  getDatasetStats: async (datasetId?: string): Promise<DatasetStats> => {
    const url = datasetId ? `${API_BASE}/dataset/statistics?dataset_id=${datasetId}` : `${API_BASE}/dataset/statistics`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Dataset statistics unavailable');
    return res.json();
  },

  uploadDataset: (
    file: File,
    onProgress?: (progress: { percent: number; stage: string; loaded?: number; total?: number }) => void
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', `${API_BASE}/dataset/upload`);

      if (onProgress) {
        onProgress({ percent: 5, stage: 'Preparing evidence CSV payload...', loaded: 0, total: file.size });
      }

      // Track network transfer (5% to 50%)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const uploadPercent = Math.min(50, Math.round(5 + (event.loaded / event.total) * 45));
          const mbLoaded = (event.loaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (event.total / (1024 * 1024)).toFixed(1);
          onProgress({
            percent: uploadPercent,
            stage: `Streaming evidence CSV payload (${mbLoaded} / ${mbTotal} MB)...`,
            loaded: event.loaded,
            total: event.total,
          });
        }
      };

      // When all bytes are uploaded, backend processes 2M+ rows in DuckDB
      let processingTimer: any = null;
      xhr.upload.onload = () => {
        if (onProgress) {
          onProgress({
            percent: 50,
            stage: 'Evidence uploaded. Initializing vectorized ingestion...',
            loaded: file.size,
            total: file.size,
          });
          let p = 50;
          let elapsedSec = 0;
          processingTimer = setInterval(() => {
            elapsedSec += 1;
            // Smoothly advance through realistic phases
            if (p < 94) {
              p += 1.0;
            } else if (p < 99) {
              p += 0.2;
            }
            if (p > 99) p = 99;

            let stageText = `Validating CSV schema & delimiters (${elapsedSec}s)...`;
            if (p >= 58 && p < 72) {
              stageText = `Normalizing records & streaming into DuckDB (${elapsedSec}s)...`;
            } else if (p >= 72 && p < 86) {
              stageText = `Building temporal & forensic graph indexes (${elapsedSec}s)...`;
            } else if (p >= 86 && p < 94) {
              stageText = `Precomputing account analytics & risk features (${elapsedSec}s)...`;
            } else if (p >= 94) {
              stageText = `Finalizing forensic verification & integrity check (${elapsedSec}s)...`;
            }

            if (onProgress) {
              onProgress({
                percent: Math.min(99, Math.floor(p)),
                stage: stageText,
                loaded: file.size,
                total: file.size,
              });
            }
          }, 1000);
        }
      };

      xhr.onload = () => {
        if (processingTimer) clearInterval(processingTimer);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (onProgress) {
              onProgress({
                percent: 100,
                stage: 'Ingestion complete! All records verified.',
                loaded: file.size,
                total: file.size,
              });
            }
            resolve(data);
          } catch (e) {
            reject(new Error('Failed to parse server response'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || 'Dataset upload failed'));
          } catch {
            reject(new Error(`Upload failed with HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        if (processingTimer) clearInterval(processingTimer);
        reject(new Error('Network error during file upload'));
      };

      xhr.ontimeout = () => {
        if (processingTimer) clearInterval(processingTimer);
        reject(new Error('Upload timed out'));
      };

      xhr.send(formData);
    });
  },

  resetDataset: async (): Promise<{ status: string; message: string }> => {
    const res = await fetch(`${API_BASE}/dataset/reset`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Dataset reset failed (${res.status})`);
    }
    return res.json();
  },

  deleteDataset: async (datasetId: string): Promise<{ status: string; message: string }> => {
    const res = await fetch(`${API_BASE}/dataset/${datasetId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Dataset deletion failed (${res.status})`);
    }
    return res.json();
  },


  // 3. Accounts & Investigations
  getAccount: async (accountId: string, datasetId?: string): Promise<AccountProfile> => {
    const url = datasetId ? `${API_BASE}/accounts/${accountId}?dataset_id=${datasetId}` : `${API_BASE}/accounts/${accountId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Account ${accountId} not found`);
    return res.json();
  },

  getAccountTransactions: async (accountId: string, datasetId?: string, limit = 100) => {
    const url = datasetId
      ? `${API_BASE}/accounts/${accountId}/transactions?dataset_id=${datasetId}&limit=${limit}`
      : `${API_BASE}/accounts/${accountId}/transactions?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Account transactions unavailable');
    return res.json();
  },

  traceInvestigation: async (
    accountId: string,
    params: { datasetId?: string; maxHops?: number; minAmount?: number; timeWindowHours?: number } = {}
  ): Promise<InvestigationTrace> => {
    const q = new URLSearchParams();
    if (params.datasetId) q.append('dataset_id', params.datasetId);
    if (params.maxHops) q.append('max_hops', params.maxHops.toString());
    if (params.minAmount) q.append('min_amount', params.minAmount.toString());
    if (params.timeWindowHours) q.append('time_window_hours', params.timeWindowHours.toString());

    const res = await fetch(`${API_BASE}/investigations/trace/${accountId}?${q.toString()}`);
    if (!res.ok) {
      let detail = `Trace failed for account ${accountId}`;
      try {
        const errData = await res.json();
        if (errData?.detail) detail = errData.detail;
      } catch {
        // fallback
      }
      throw new Error(detail);
    }
    return res.json();
  },

  getAccountRisk: async (accountId: string, datasetId?: string): Promise<AccountRiskProfile> => {
    const url = datasetId ? `${API_BASE}/accounts/${accountId}/risk?dataset_id=${datasetId}` : `${API_BASE}/accounts/${accountId}/risk`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Risk assessment unavailable');
    return res.json();
  },

  // 4. Recovery
  getRecoveryCandidates: async (
    datasetIdOrLimit?: string | number,
    limitParam = 50
  ): Promise<{ candidates: RecoveryCandidate[]; total_candidates: number }> => {
    let datasetId: string | undefined = undefined;
    let limit = limitParam;
    if (typeof datasetIdOrLimit === 'number') {
      limit = datasetIdOrLimit;
    } else if (typeof datasetIdOrLimit === 'string') {
      datasetId = datasetIdOrLimit;
    }
    const url = datasetId
      ? `${API_BASE}/recovery/candidates?dataset_id=${datasetId}&limit=${limit}`
      : `${API_BASE}/recovery/candidates?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Recovery candidates unavailable');
    return res.json();
  },

  // 5. Cross-Victim
  analyzeCrossVictim: async (victimAccounts: string[], datasetId?: string, maxHops = 4): Promise<CrossVictimResponse> => {
    const res = await fetch(`${API_BASE}/syndicates/cross-victim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victim_accounts: victimAccounts,
        dataset_id: datasetId,
        max_hops: maxHops,
      }),
    });
    if (!res.ok) throw new Error('Cross-victim analysis failed');
    return res.json();
  },

  // 6. Evidence & Documents
  createSnapshot: async (victimAccount: string, datasetId?: string, maxHops = 4): Promise<EvidenceSnapshotResponse> => {
    const res = await fetch(`${API_BASE}/evidence/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victim_account: victimAccount,
        dataset_id: datasetId,
        max_hops: maxHops,
      }),
    });
    if (!res.ok) throw new Error('Snapshot creation failed');
    return res.json();
  },

  createEvidenceSnapshot: async (victimAccount: string, datasetId?: string, maxHops = 4): Promise<{ snapshot: any; result_hash: string }> => {
    const res = await api.createSnapshot(victimAccount, datasetId, maxHops);
    return {
      snapshot: res.snapshot,
      result_hash: res.snapshot.result_hash,
    };
  },

  generateCaseDiary: async (params: {
    victimAccount: string;
    datasetId?: string;
    officerName?: string;
    officerDesignation?: string;
    caseReference?: string;
  }): Promise<DocumentResponse> => {
    const res = await fetch(`${API_BASE}/documents/case-diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victim_account: params.victimAccount,
        dataset_id: params.datasetId,
        officer_name: params.officerName || 'Investigating Officer',
        officer_designation: params.officerDesignation || 'Cyber Crime Investigation Cell',
        case_reference: params.caseReference || 'CASE-FORENSIC-01',
      }),
    });
    if (!res.ok) throw new Error('Case diary generation failed');
    return res.json();
  },

  generateFreezeRequisition: async (params: {
    targetAccountId: string;
    datasetId?: string;
    requestingOfficer?: string;
    requestingDesignation?: string;
    requestingAuthority?: string;
    bankName?: string;
    branchName?: string;
    caseReference?: string;
    victimAccount?: string;
  }): Promise<DocumentResponse> => {
    const res = await fetch(`${API_BASE}/documents/freeze-requisition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_account_id: params.targetAccountId,
        dataset_id: params.datasetId,
        requesting_officer: params.requestingOfficer || undefined,
        requesting_designation: params.requestingDesignation || undefined,
        requesting_authority: params.requestingAuthority || undefined,
        bank_name: params.bankName || undefined,
        branch_name: params.branchName || undefined,
        case_reference: params.caseReference || undefined,
        victim_account: params.victimAccount || undefined,
      }),
    });
    if (!res.ok) throw new Error('Freeze requisition generation failed');
    return res.json();
  },

  getDocumentDownloadUrl: (documentId: string): string => {
    return `${API_BASE}/documents/download/${documentId}`;
  },

  // --- Local AI Chatbot & Summarizer Endpoints ---

  checkAIHealth: async (): Promise<AIHealthStatus> => {
    const res = await fetch(`${API_BASE}/ai/health`);
    if (!res.ok) throw new Error('AI health check failed');
    return res.json();
  },

  sendAIChat: async (req: AIChatRequest): Promise<AIChatResponse> => {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'AI Chat request failed' }));
      throw new Error(err.detail || 'AI Chat request failed');
    }
    return res.json();
  },

  getAIChatHistory: async (
    caseId: string,
    sessionId: string,
    limit: number = 20
  ): Promise<{ case_id: string; session_id: string; messages: ChatHistoryItem[] }> => {
    const params = new URLSearchParams({ case_id: caseId, session_id: sessionId, limit: String(limit) });
    const res = await fetch(`${API_BASE}/ai/chat/history?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load chat history');
    return res.json();
  },

  clearAIChatHistory: async (caseId: string, sessionId: string): Promise<void> => {
    const params = new URLSearchParams({ case_id: caseId, session_id: sessionId });
    await fetch(`${API_BASE}/ai/chat/history?${params.toString()}`, {
      method: 'DELETE',
    });
  },

  generateCaseSummary: async (req: AISummaryRequest): Promise<AISummaryResponse> => {
    const res = await fetch(`${API_BASE}/ai/cases/${encodeURIComponent(req.case_id)}/summaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Summary generation failed' }));
      throw new Error(err.detail || 'Summary generation failed');
    }
    return res.json();
  },

  getCaseSummaries: async (
    caseId: string
  ): Promise<{ case_id: string; summaries: AISummaryResponse[] }> => {
    const res = await fetch(`${API_BASE}/ai/cases/${encodeURIComponent(caseId)}/summaries`);
    if (!res.ok) throw new Error('Failed to load case summaries');
    return res.json();
  },

  getSummaryById: async (summaryId: string): Promise<AISummaryResponse> => {
    const res = await fetch(`${API_BASE}/ai/summaries/${encodeURIComponent(summaryId)}`);
    if (!res.ok) throw new Error('Failed to fetch summary');
    return res.json();
  },
};

// --- TypeScript Definitions for AI System ---

export interface SourceReference {
  source_type:
    | 'account_profile'
    | 'money_trail'
    | 'risk_assessment'
    | 'transaction'
    | 'case_evidence'
    | 'case_note'
    | 'anomaly_detection';
  evidence_id?: string;
  record_id?: string;
  transaction_id?: string;
  account_id?: string;
  timestamp?: string;
  amount?: number;
  relevance: string;
}

export interface AIHealthStatus {
  ollama_reachable: boolean;
  base_url: string;
  configured_model: string;
  model_available: boolean;
  available_models: string[];
  offline: boolean;
  status: 'ready' | 'model_missing' | 'ollama_down';
}

export interface AIChatRequest {
  case_id: string;
  dataset_id: string;
  question: string;
  target_account?: string;
  language?: 'en' | 'hi' | 'mr';
  session_id?: string;
  case_notes?: string;
}

export interface AIChatResponse {
  answer: string;
  sources: SourceReference[];
  case_id: string;
  dataset_id: string;
  session_id: string;
  language: string;
  limitations: string[];
  model_status: string;
  created_at: string;
}

export interface ChatHistoryItem {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  language: string;
  created_at: string;
}

export interface AISummaryContent {
  case_overview: string;
  key_findings: string[];
  money_trail_summary?: string | null;
  risk_and_anomaly_findings?: string | null;
  supporting_evidence: SourceReference[];
  limitations: string[];
  recommended_next_steps: string[];
  summary_type: string;
  generated_language: string;
  analysis_version: string;
}

export interface AISummaryRequest {
  case_id: string;
  dataset_id: string;
  target_account?: string;
  summary_type: 'executive' | 'detailed' | 'money_trail' | 'risk_anomaly';
  language?: 'en' | 'hi' | 'mr';
  case_title?: string;
  case_notes?: string;
  officer_name?: string;
}

export interface AISummaryResponse {
  summary_id: string;
  case_id: string;
  dataset_id: string;
  target_account?: string | null;
  summary_type: 'executive' | 'detailed' | 'money_trail' | 'risk_anomaly';
  language: 'en' | 'hi' | 'mr';
  model_name: string;
  analysis_version: string;
  result_hash?: string | null;
  is_stale: boolean;
  content: AISummaryContent;
  created_at: string;
}
