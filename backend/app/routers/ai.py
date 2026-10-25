"""ANVITRACE — AI Intelligence API Router.

Endpoints:
- GET    /api/ai/health                   - Health check for local Ollama runtime & models
- POST   /api/ai/chat                     - Evidence-grounded conversational inquiry
- GET    /api/ai/chat/history             - Retrieve persistent chat history for case session
- DELETE /api/ai/chat/history             - Clear chat history for case session
- POST   /api/ai/cases/{case_id}/summaries - Generate structured investigation summary
- GET    /api/ai/cases/{case_id}/summaries - List past summaries for case
- GET    /api/ai/summaries/{summary_id}   - Fetch specific summary by ID
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.database.duckdb import get_connection
from app.database.repositories.dataset import DatasetRepository
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIHealthResponse,
    AISummaryListResponse,
    AISummaryRequest,
    AISummaryResponse,
    ChatHistoryResponse,
)
from app.services.ai_chat_service import ai_chat_service
from app.services.ai_summary_service import ai_summary_service
from app.services.local_llm_service import local_llm_service
from app.utils.logging import log_event, logger

ai_router = APIRouter(prefix="/ai", tags=["ai"])


def _validate_case_dataset(dataset_id: str) -> None:
    """Strictly enforce that dataset_id exists in the canonical DuckDB datasets registry."""
    if not dataset_id or not dataset_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dataset_id is required. No active case dataset specified.",
        )
    conn = get_connection()
    repo_ds = DatasetRepository(conn)
    clean_id = dataset_id.strip()
    ds = repo_ds.get_dataset(clean_id)
    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{clean_id}' not found.",
        )


@ai_router.get(
    "/health",
    response_model=AIHealthResponse,
    summary="Check local Ollama runtime and model availability",
)
async def get_ai_health():
    """Verify local Ollama engine health without making any external cloud network requests."""
    return await local_llm_service.check_health()


@ai_router.post(
    "/chat",
    response_model=AIChatResponse,
    summary="Forensic Q&A grounded strictly in verified case evidence",
)
async def chat_with_case_evidence(req: AIChatRequest):
    """Answer investigator inquiries using verified DuckDB and algorithm evidence.

    Protections:
    - Enforces dataset authorization and existence.
    - Uses strict system prompts with anti-prompt-injection shields.
    - Never fabricates evidence or alters database records.
    - Multilingual: en, hi, mr.
    """
    _validate_case_dataset(req.dataset_id)

    log_event(
        "AI_CHAT_REQUEST_RECEIVED",
        case_id=req.case_id,
        dataset_id=req.dataset_id,
        question_length=len(req.question),
        language=req.language,
    )

    try:
        return await ai_chat_service.answer_question(req)
    except Exception as e:
        logger.error(f"AI Chat error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI chat inquiry failed: {e}",
        )


@ai_router.get(
    "/chat/history",
    response_model=ChatHistoryResponse,
    summary="Retrieve saved conversation history for case session",
)
async def get_chat_history(
    case_id: str = Query(..., min_length=1),
    session_id: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Fetch persistent chat history turns for a specific case and session."""
    messages = ai_chat_service.get_conversation_history(case_id, session_id, limit=limit)
    return ChatHistoryResponse(
        case_id=case_id,
        session_id=session_id,
        messages=messages,
    )


@ai_router.delete(
    "/chat/history",
    summary="Clear saved conversation history for case session",
)
async def clear_chat_history(
    case_id: str = Query(..., min_length=1),
    session_id: str = Query(..., min_length=1),
):
    """Clear conversational turns for a specific case and session."""
    ai_chat_service.clear_conversation_history(case_id, session_id)
    return {
        "status": "cleared",
        "case_id": case_id,
        "session_id": session_id,
    }


@ai_router.post(
    "/cases/{case_id}/summaries",
    response_model=AISummaryResponse,
    summary="Generate structured, evidence-grounded case summary",
)
async def create_case_summary(case_id: str, req: AISummaryRequest):
    """Generate structured summary (Executive, Detailed, Money Trail, or Risk & Anomaly).

    - Grounded strictly in precomputed DuckDB and investigation results.
    - Structured JSON validated by Pydantic.
    - Supports en, hi, mr.
    - Persisted in DuckDB with version tracking.
    """
    _validate_case_dataset(req.dataset_id)
    # Ensure URL path case_id matches request body
    req.case_id = case_id

    log_event(
        "AI_SUMMARY_REQUEST_RECEIVED",
        case_id=case_id,
        dataset_id=req.dataset_id,
        summary_type=req.summary_type,
        language=req.language,
    )

    try:
        return await ai_summary_service.generate_summary(req)
    except Exception as e:
        logger.error(f"AI Summary generation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI summary generation failed: {e}",
        )


@ai_router.get(
    "/cases/{case_id}/summaries",
    response_model=AISummaryListResponse,
    summary="List past generated summaries for a case docket",
)
async def list_case_summaries(case_id: str):
    """List all saved forensic summaries for the given case."""
    summaries = ai_summary_service.list_case_summaries(case_id)
    return AISummaryListResponse(case_id=case_id, summaries=summaries)


@ai_router.get(
    "/summaries/{summary_id}",
    response_model=AISummaryResponse,
    summary="Get specific case summary by ID",
)
async def get_summary_by_id(summary_id: str):
    """Fetch an individual forensic case summary by its unique identifier."""
    summary = ai_summary_service.get_summary(summary_id)
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Summary '{summary_id}' not found.",
        )
    return summary
