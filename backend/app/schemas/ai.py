"""Pydantic schemas for ANVITRACE AI Chatbot and Case Summarizer."""

from datetime import UTC, datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


# ── Common Source Citation ──────────────────────────────────────────────────

class SourceReference(BaseModel):
    """Verifiable source attribution directly linked to DuckDB or case records."""
    source_type: Literal[
        "account_profile",
        "money_trail",
        "risk_assessment",
        "transaction",
        "case_evidence",
        "case_note",
        "anomaly_detection",
    ] = Field(..., description="Categorical type of evidence source")
    evidence_id: str | None = Field(None, description="Identifier for snapshot or evidence item")
    record_id: str | None = Field(None, description="Internal surrogate row ID from transactions table")
    transaction_id: str | None = Field(None, description="Source transaction ID (may not be unique)")
    account_id: str | None = Field(None, description="Relevant account number or wallet identifier")
    timestamp: str | None = Field(None, description="ISO timestamp of recorded evidence or transaction")
    amount: float | None = Field(None, description="Verified financial amount in INR")
    relevance: str = Field(..., description="Concise explanation of how this record supports the answer")


# ── AI Health ───────────────────────────────────────────────────────────────

class AIHealthResponse(BaseModel):
    """Local Ollama runtime health and model readiness status."""
    ollama_reachable: bool
    base_url: str
    configured_model: str
    model_available: bool
    available_models: list[str] = []
    offline: bool = True
    status: Literal["ready", "model_missing", "ollama_down"]


# ── AI Chatbot ──────────────────────────────────────────────────────────────

class AIChatRequest(BaseModel):
    """Forensic inquiry request on an active case."""
    case_id: str = Field(..., min_length=1, description="Unique case identifier")
    dataset_id: str = Field(..., min_length=1, description="Active dataset ID bound to the case")
    question: str = Field(..., min_length=1, max_length=1000, description="Investigator query")
    target_account: str | None = Field(None, description="Target account under scrutiny if applicable")
    language: Literal["en", "hi", "mr"] = Field("en", description="Output language (en, hi, mr)")
    session_id: str | None = Field(None, description="Chat session identifier for memory context")
    case_notes: str | None = Field(None, description="Investigator case notes for semantic retrieval")


class AIChatResponse(BaseModel):
    """Evidence-grounded chatbot answer with full forensic provenance."""
    answer: str = Field(..., description="Evidence-backed investigative response")
    sources: list[SourceReference] = Field(default_factory=list, description="Verified source citations")
    case_id: str
    dataset_id: str
    session_id: str
    language: str
    limitations: list[str] = Field(default_factory=list, description="Explicit boundaries of available evidence")
    model_status: str
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class ChatHistoryItem(BaseModel):
    """Saved turn in chat history."""
    message_id: str
    role: Literal["user", "assistant"]
    content: str
    sources: list[SourceReference] = Field(default_factory=list)
    language: str = "en"
    created_at: str


class ChatHistoryResponse(BaseModel):
    """List of messages for a case or session."""
    case_id: str
    session_id: str
    messages: list[ChatHistoryItem] = []


# ── AI Case Summarizer ──────────────────────────────────────────────────────

SummaryTypeLiteral = Literal["executive", "detailed", "money_trail", "risk_anomaly"]


class AISummaryContent(BaseModel):
    """Validated structured content of a forensic case summary."""
    case_overview: str = Field(..., description="Summary of investigation scope and target entity")
    key_findings: list[str] = Field(default_factory=list, description="Bullet-point core findings")
    money_trail_summary: str | None = Field(None, description="Flow narrative and hop indicators")
    risk_and_anomaly_findings: str | None = Field(None, description="Risk index, ML anomaly flags breakdown")
    supporting_evidence: list[SourceReference] = Field(default_factory=list, description="Verified references")
    limitations: list[str] = Field(default_factory=list, description="Forensic bounds and missing evidence")
    recommended_next_steps: list[str] = Field(default_factory=list, description="Actionable investigative suggestions")
    summary_type: str
    generated_language: str
    analysis_version: str = "1.0.0"


class AISummaryRequest(BaseModel):
    """Request to generate a structured investigation case summary."""
    case_id: str = Field(..., min_length=1, description="Active case identifier")
    dataset_id: str = Field(..., min_length=1, description="Active dataset ID bound to the case")
    target_account: str | None = Field(None, description="Target/victim account for the investigation")
    summary_type: SummaryTypeLiteral = Field(
        "executive",
        description="Type: executive, detailed, money_trail, or risk_anomaly",
    )
    language: Literal["en", "hi", "mr"] = Field("en", description="Output language (en, hi, mr)")
    case_title: str | None = Field(None, description="Optional case title or FIR reference")
    case_notes: str | None = Field(None, description="Optional case notes or diary entries")
    officer_name: str | None = Field(None, description="Investigating officer name")


class AISummaryResponse(BaseModel):
    """Persisted structured summary response."""
    summary_id: str
    case_id: str
    dataset_id: str
    target_account: str | None
    summary_type: str
    language: str
    model_name: str
    analysis_version: str
    result_hash: str | None = None
    is_stale: bool = False
    content: AISummaryContent
    created_at: str


class AISummaryListResponse(BaseModel):
    """List of generated summaries for a case."""
    case_id: str
    summaries: list[AISummaryResponse] = []
