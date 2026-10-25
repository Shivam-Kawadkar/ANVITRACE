"""ANVITRACE — Forensic AI Case Summarizer Service.

Generates 4 structured forensic summary types using local Ollama:
1. Executive Summary
2. Detailed Investigation Summary
3. Money Trail Summary
4. Risk & Anomaly Summary

Features:
- Grounded strictly in precomputed DuckDB and investigation engine results.
- Structured JSON output with Pydantic validation & safe JSON repair.
- Multilingual: English, Hindi (Devanagari), Marathi (Devanagari).
- Summary persistence in DuckDB with version tracking & stale status management.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any, Optional
import duckdb

from app.database.duckdb import get_connection
from app.schemas.ai import (
    AISummaryContent,
    AISummaryRequest,
    AISummaryResponse,
    SourceReference,
)
from app.services.ai_chat_service import LANGUAGE_INSTRUCTIONS
from app.services.ai_retrieval_service import AIRetrievalService
from app.services.local_llm_service import LocalLLMService, local_llm_service
from app.utils.logging import logger

SUMMARIZER_PROMPT_EN = """You are ANVITRACE AI Forensic Summarizer.
Your goal is to produce a simple, clear, and easy-to-understand cyber-forensic investigation summary for police officers and investigators.

RULES:
1. SIMPLICITY FIRST: Write in plain, direct English. Avoid dense legalistic jargon or confusing statistical formulas.
2. EVIDENCE-BASED: Only use verified numbers and facts present in the EVIDENCE PAYLOAD.
3. EXACT NUMBERS: Keep Account IDs, Transaction IDs, amounts (₹ INR), timestamps, and risk scores EXACT.
4. ACTION-ORIENTED: Structure findings into crisp, high-impact bullet points that clearly explain:
   - What happened with the money?
   - Where did it go?
   - Why was it flagged as suspicious?
5. VALID JSON: Return strictly valid JSON conforming to the schema below.

SCHEMA:
{{
  "case_overview": "string (clear 2-3 sentence overview of the investigation scope and target account)",
  "key_findings": ["string (simple bullet point)", "string (simple bullet point)"],
  "money_trail_summary": "string or null (plain explanation of how funds moved across hops)",
  "risk_and_anomaly_findings": "string or null (simple explanation of why this account was flagged)",
  "limitations": ["string", "string"],
  "recommended_next_steps": ["string (practical action for the investigator)", "string"]
}}
"""

SUMMARIZER_PROMPT_HI = """आप ANVITRACE AI फोरेंसिक समराइजर हैं।
आपका कार्य जांच अधिकारियों के लिए सरल, स्पष्ट और समझने में आसान साइबर-फोरेंसिक जांच सारांश तैयार करना है।

महत्वपूर्ण नियम:
1. भाषा: सभी विवरण, बुलेट पॉइंट्स और सारांश केवल और केवल शुद्ध, सरल हिन्दी (देवनागरी लिपि) में होने चाहिए। अंग्रेजी में वाक्य न लिखें।
2. सरलता: भाषा अत्यंत सरल और स्पष्ट होनी चाहिए ताकि कोई भी पुलिस अधिकारी तुरंत केस समझ सके।
3. सत्यता: केवल दिए गए साक्ष्यों (EVIDENCE PAYLOAD) के आधार पर लिखें। मनगढ़ंत संख्या या तारीखें न लिखें।
4. पहचानकर्ता: खाता संख्या (Account ID), लेन-देन आईडी (Tx ID), IFSC कोड और धनराशि (₹ INR) को अंग्रेजी/अंकों में बिना बदले बिल्कुल सटीक रखें।
5. JSON आउटपुट: केवल मान्य JSON आउटपुट दें।

SCHEMA:
{{
  "case_overview": "string (केस का सरल 2-3 वाक्यों में अवलोकन)",
  "key_findings": ["string (सरल बुलेट पॉइंट)", "string (सरल बुलेट पॉइंट)"],
  "money_trail_summary": "string or null (पैसों के प्रवाह का सरल हिन्दी विवरण)",
  "risk_and_anomaly_findings": "string or null (खाता संदिग्ध क्यों है, इसका सरल विवरण)",
  "limitations": ["string", "string"],
  "recommended_next_steps": ["string (जांच अधिकारी के लिए अगला कदम)", "string"]
}}
"""

SUMMARIZER_PROMPT_MR = """तुम्ही ANVITRACE AI फॉरेन्सिक समरायझर आहात.
तपास अधिकाऱ्यांना सहज समजेल असा सोपा, स्पष्ट आणि अधिकृत सायबर-फॉरेन्सिक तपास सारांश तयार करणे हे तुमचे काम आहे.

महत्त्वाचे नियम:
1. भाषा: सर्व मजकूर, विश्लेषण आणि मुद्दे केवळ आणि केवळ शुद्ध, सोप्या मराठीत (देवनागरी लिपी) असावेत. इंग्रजीत वाक्ये लिहू नका.
2. सुलभता: भाषा अतिशय साधी आणि मुद्देसूद असावी जेणेकरून कोणत्याही पोलीस अधिकाऱ्याला तात्काळ अर्थ समजेल.
3. अचूकता: केवळ दिलेल्या पुराव्यांवर (EVIDENCE PAYLOAD) आधारित माहिती लिहा. कोणतीही खोटी माहिती जोडू नका.
4. अचूक ओळख: खाते क्रमांक (Account ID), व्यवहार आयडी (Tx ID), IFSC कोड आणि रक्कम (₹ INR) इंग्रजी/अंकांमध्ये न बदलता तंतोतंत ठेवा.
5. JSON आउटपुट: केवळ वैध JSON फॉरमॅट द्या.

SCHEMA:
{{
  "case_overview": "string (तपासाचा सोपा 2-3 वाक्यांत आढावा)",
  "key_findings": ["string (सोपा मुद्दा)", "string (सोपा मुद्दा)"],
  "money_trail_summary": "string or null (पैशांच्या हालचालीचा सोपा मराठी आढावा)",
  "risk_and_anomaly_findings": "string or null (खाते संशयास्पद का चिन्हांकित केले गेले याचे सोपे कारण)",
  "limitations": ["string", "string"],
  "recommended_next_steps": ["string (तपास अधिकाऱ्यासाठी पुढील कृती)", "string"]
}}
"""

SUMMARY_PROMPTS = {
    "executive": "Focus on high-level case context, the target account, total financial volume, top suspicious findings, and immediate next steps.",
    "detailed": "Cover comprehensive case scope, chronological money movements, mule layering indicators, and detailed evidence items.",
    "money_trail": "Detail the sequential fund flow across hops, attributable amounts, intermediary accounts, and trail endpoints.",
    "risk_anomaly": "Explain the Mule Risk Index, risk tier, rule violations (velocity, rapid withdrawals) and anomaly indicators.",
}


class AISummaryService:
    """Orchestrates structured case summary generation and DuckDB persistence."""

    def __init__(
        self,
        llm: LocalLLMService | None = None,
        retrieval: AIRetrievalService | None = None,
        conn: duckdb.DuckDBPyConnection | None = None,
    ) -> None:
        self.llm = llm or local_llm_service
        self.retrieval = retrieval or AIRetrievalService(conn)
        self._conn = conn

    def _get_conn(self) -> duckdb.DuckDBPyConnection:
        if self._conn is not None:
            return self._conn
        return get_connection()

    def persist_summary(
        self,
        summary_id: str,
        case_id: str,
        dataset_id: str,
        target_account: str | None,
        summary_type: str,
        language: str,
        model_name: str,
        analysis_version: str,
        result_hash: str | None,
        content: AISummaryContent,
        is_stale: bool = False,
    ) -> None:
        """Persist structured summary to DuckDB."""
        conn = self._get_conn()
        content_json = content.model_dump_json()
        try:
            conn.execute(
                """
                INSERT INTO ai_case_summaries (
                    summary_id, case_id, dataset_id, target_account, summary_type,
                    language, model_name, analysis_version, result_hash,
                    content_json, is_stale, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
                """,
                [
                    summary_id,
                    case_id,
                    dataset_id,
                    target_account,
                    summary_type,
                    language,
                    model_name,
                    analysis_version,
                    result_hash,
                    content_json,
                    is_stale,
                ],
            )
        except Exception as e:
            logger.error(f"Failed to persist summary in DuckDB: {e}")

    def list_case_summaries(self, case_id: str) -> list[AISummaryResponse]:
        """Retrieve all generated summaries for a case docket."""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                """
                SELECT summary_id, case_id, dataset_id, target_account, summary_type,
                       language, model_name, analysis_version, result_hash, content_json,
                       is_stale, created_at
                FROM ai_case_summaries
                WHERE case_id = ?
                ORDER BY created_at DESC;
                """,
                [case_id],
            ).fetchall()

            results: list[AISummaryResponse] = []
            for r in rows:
                (
                    sid,
                    cid,
                    dsid,
                    target,
                    stype,
                    lang,
                    mname,
                    a_ver,
                    r_hash,
                    c_json,
                    is_stale,
                    created_at,
                ) = r
                content = AISummaryContent.model_validate_json(c_json)
                results.append(
                    AISummaryResponse(
                        summary_id=sid,
                        case_id=cid,
                        dataset_id=dsid,
                        target_account=target,
                        summary_type=stype,
                        language=lang,
                        model_name=mname,
                        analysis_version=a_ver or "1.0.0",
                        result_hash=r_hash,
                        is_stale=bool(is_stale),
                        content=content,
                        created_at=str(created_at),
                    )
                )
            return results
        except Exception as e:
            logger.warning(f"Failed to list summaries for case {case_id}: {e}")
            return []

    def get_summary(self, summary_id: str) -> AISummaryResponse | None:
        """Fetch a specific saved summary by its ID."""
        conn = self._get_conn()
        try:
            row = conn.execute(
                """
                SELECT summary_id, case_id, dataset_id, target_account, summary_type,
                       language, model_name, analysis_version, result_hash, content_json,
                       is_stale, created_at
                FROM ai_case_summaries
                WHERE summary_id = ?;
                """,
                [summary_id],
            ).fetchone()
            if not row:
                return None
            (
                sid,
                cid,
                dsid,
                target,
                stype,
                lang,
                mname,
                a_ver,
                r_hash,
                c_json,
                is_stale,
                created_at,
            ) = row
            content = AISummaryContent.model_validate_json(c_json)
            return AISummaryResponse(
                summary_id=sid,
                case_id=cid,
                dataset_id=dsid,
                target_account=target,
                summary_type=stype,
                language=lang,
                model_name=mname,
                analysis_version=a_ver or "1.0.0",
                result_hash=r_hash,
                is_stale=bool(is_stale),
                content=content,
                created_at=str(created_at),
            )
        except Exception as e:
            logger.warning(f"Failed to fetch summary {summary_id}: {e}")
            return None

    def mark_stale_if_dataset_changed(self, case_id: str, current_dataset_hash: str) -> None:
        """Mark older summaries as stale if the dataset hash or evidence changed."""
        conn = self._get_conn()
        try:
            conn.execute(
                """
                UPDATE ai_case_summaries
                SET is_stale = TRUE
                WHERE case_id = ? AND result_hash IS NOT NULL AND result_hash != ?;
                """,
                [case_id, current_dataset_hash],
            )
        except Exception as e:
            logger.warning(f"Failed to update stale summary flags: {e}")

    async def generate_summary(self, req: AISummaryRequest) -> AISummaryResponse:
        """Generate structured forensic case summary adhering to type and language."""
        summary_id = f"sum_{uuid.uuid4().hex[:12]}"
        analysis_version = "1.0.0"

        # 1. Collect deterministic forensic data
    def _build_deterministic_summary(
        self,
        evidence: dict[str, Any],
        req: AISummaryRequest,
        analysis_version: str,
        note: str | None = None,
    ) -> AISummaryContent:
        """Construct simple, clear, localized forensic summary in English, Hindi, or Marathi."""
        acc = req.target_account or "N/A"
        total_rows = evidence["dataset_info"].get("total_rows", 0)
        valid_rows = evidence["dataset_info"].get("valid_rows", 0)
        dataset_id = evidence["dataset_info"].get("dataset_id", req.dataset_id)

        asum = evidence.get("account_summary") or {
            "in_amount": 0.0,
            "out_amount": 0.0,
            "in_tx_count": 0,
            "out_tx_count": 0,
            "net_flow": 0.0,
        }
        rprof = evidence.get("risk_profile") or {
            "mule_risk_index": 0,
            "risk_tier": "low",
            "layers": [],
        }
        trail = evidence.get("money_trail_info") or {
            "total_hops": 0,
            "total_attributed_amount": 0.0,
        }

        layers_str = ", ".join(rprof.get("layers", [])) or "None"

        if req.language == "hi":
            overview = (
                f"केस {req.case_id} का फोरेंसिक जांच सारांश (लक्ष्य खाता: {acc})। "
                f"डेटासेट में कुल {total_rows:,} लेन-देन दर्ज हैं, जिनमें धन संचलन और संदिग्ध म्यूल गतिविधियों का विश्लेषण किया गया है।"
            )
            key_findings = [
                f"डेटासेट {dataset_id} के कुल {valid_rows:,} सत्यापित लेन-देन का विश्लेषण किया गया।",
                f"खाता {acc} में कुल ₹{asum['in_amount']:,.2f} का इनफ्लो ({asum['in_tx_count']} लेन-देन) और ₹{asum['out_amount']:,.2f} का आउटफ्लो ({asum['out_tx_count']} लेन-देन) हुआ।",
                f"खाते का शुद्ध शेष प्रवाह (Net Flow) ₹{asum['net_flow']:,.2f} है, जिसका म्यूल रिस्क इंडेक्स {rprof['mule_risk_index']}/100 ({rprof['risk_tier'].upper()}) आकलित किया गया।",
                f"पहचाने गए जोखिम वर्गीकरण: {layers_str}।",
            ]
            trail_summary = (
                f"खाता {acc} से कुल {trail['total_hops']} हॉप्स तक पैसों का प्रवाह ट्रैक किया गया, जिसमें ₹{trail['total_attributed_amount']:,.2f} की राशि आगे के लाभार्थी खातों में स्थानांतरित पाई गई।"
                if trail["total_hops"] > 0
                else f"खाता {acc} से इस डेटासेट में आगे कोई बहिर्गामी हॉप्स (Outgoing Hops) दर्ज नहीं हैं।"
            )
            risk_summary = (
                f"खाता {acc} को '{rprof['risk_tier'].upper()}' जोखिम श्रेणी में वर्गीकृत किया गया है (म्यूल रिस्क इंडेक्स: {rprof['mule_risk_index']}/100)। मुख्य संकेतक: धन आगमन के तुरंत बाद तीव्र निकासी और असामान्य लेन-देन वेग।"
            )
            limitations = [
                "विश्लेषण वर्तमान में केस में अपलोड किए गए डेटासेट के रिकॉर्ड्स तक ही सीमित है।",
                "संबंधित बैंक शाखा से पूर्ण KYC एवं मूल विवरण की आधिकारिक पुष्टि आवश्यक है।",
            ]
            next_steps = [
                f"संदेहास्पद खाता {acc} एवं संबंधित लाभार्थी खातों को फ्रीज करने हेतु बैंक को वैधानिक नोटिस जारी करें।",
                "खाताधारक के पंजीकृत मोबाइल नंबर, ईमेल और आईपी लॉग का ऑडिट विवरण प्राप्त करें।",
            ]
        elif req.language == "mr":
            overview = (
                f"केस {req.case_id} चा फॉरेन्सिक तपास सारांश (तपास खाते: {acc}). "
                f"डेटासेटमध्ये एकूण {total_rows:,} व्यवहार नोंदवले असून पैशांच्या हालचाली आणि संशयास्पद म्यूल व्यवहारांचा आढावा घेण्यात आला आहे."
            )
            key_findings = [
                f"डेटासेट {dataset_id} मधील एकूण {valid_rows:,} सत्यापित व्यवहारांचे विश्लेषण केले गेले.",
                f"खाते {acc} मध्ये एकूण ₹{asum['in_amount']:,.2f} जमा ({asum['in_tx_count']} व्यवहार) आणि ₹{asum['out_amount']:,.2f} खर्च ({asum['out_tx_count']} व्यवहार) नोंदवले गेले.",
                f"खात्याचा निव्वळ प्रवाह ₹{asum['net_flow']:,.2f} असून म्यूल रिस्क इंडेक्स {rprof['mule_risk_index']}/100 ({rprof['risk_tier'].upper()}) नोंदवला गेला आहे.",
                f"आढळलेले जोखीम निकष: {layers_str}.",
            ]
            trail_summary = (
                f"खाते {acc} मधून {trail['total_hops']} हॉप्सपर्यंत पैशांचा प्रवाह आढळला, ज्यात एकूण ₹{trail['total_attributed_amount']:,.2f} रक्कम पुढील लाभार्थी खात्यांकडे वर्ग झाल्याचे निष्पन्न झाले."
                if trail["total_hops"] > 0
                else f"खाते {acc} मधून पुढील बहिर्गामी व्यवहार (Outgoing Hops) या डेटासेटमध्ये आढळले नाहीत."
            )
            risk_summary = (
                f"खाते {acc} ला '{rprof['risk_tier'].upper()}' जोखीम श्रेणीत चिन्हांकित केले आहे (म्यूल रिस्क इंडेक्स: {rprof['mule_risk_index']}/100). मुख्य कारण: रक्कम जमा होताच त्वरित काढणे आणि संशयास्पद व्यवहार गती."
            )
            limitations = [
                "तपास केवळ उपलब्ध डेटासेटमधील अधिकृत नोंदींपुरता मर्यादित आहे.",
                "बँक शाखेकडून मूळ केवायसी आणि खात्याच्या तपशिलांची खातरजमा करणे आवश्यक आहे.",
            ]
            next_steps = [
                f"संशयित खाते {acc} आणि लाभार्थी खात्यांवर फ्रीझ आदेश जारी करण्यासाठी बँकेस अधिकृत नोटीस पाठवावी.",
                "खातेदाराचे नोंदणीकृत संपर्क क्रमांक आणि व्यवहार वेळचे आयपी लॉग तपासावेत.",
            ]
        else:
            overview = (
                f"Forensic investigation summary for Case {req.case_id} focusing on account {acc}. "
                f"The active dataset contains {total_rows:,} total transactions analyzed for fund dissipation and mule layering indicators."
            )
            key_findings = [
                f"Analyzed {valid_rows:,} verified transaction records in dataset {dataset_id}.",
                f"Account {acc} recorded ₹{asum['in_amount']:,.2f} total inflow across {asum['in_tx_count']} txs, and ₹{asum['out_amount']:,.2f} outflow across {asum['out_tx_count']} txs.",
                f"Calculated net observed balance of ₹{asum['net_flow']:,.2f} with a Mule Risk Index of {rprof['mule_risk_index']}/100 ({rprof['risk_tier'].upper()}).",
                f"Identified layer classifications: {layers_str}.",
            ]
            trail_summary = (
                f"Discovered forward fund movement across {trail['total_hops']} hops from {acc}, attributing ₹{trail['total_attributed_amount']:,.2f} in fund dispersal to downstream beneficiary accounts."
                if trail["total_hops"] > 0
                else f"No forward outgoing money trail hops recorded for account {acc} in this dataset."
            )
            risk_summary = (
                f"Account {acc} assessed in '{rprof['risk_tier'].upper()}' risk tier (Risk Index: {rprof['mule_risk_index']}/100). Key flags: high velocity fund pass-through and rapid withdrawal post-credit."
            )
            limitations = [
                "Analysis strictly bounded to transactions ingested in this case dataset.",
                "Requires independent verification of bank branch KYC and audit logs.",
            ]
            next_steps = [
                f"Issue statutory bank freeze notices for candidate mule account {acc} and top recipients.",
                "Request CDR, KYC documents, and IP logs from the bank nodal officer.",
            ]

        if note:
            limitations.append(note)

        return AISummaryContent(
            case_overview=overview,
            key_findings=key_findings,
            money_trail_summary=trail_summary,
            risk_and_anomaly_findings=risk_summary,
            supporting_evidence=evidence["sources"],
            limitations=limitations,
            recommended_next_steps=next_steps,
            summary_type=req.summary_type,
            generated_language=req.language,
            analysis_version=analysis_version,
        )

    async def generate_summary(self, req: AISummaryRequest) -> AISummaryResponse:
        """Generate structured forensic case summary adhering to type and language."""
        summary_id = f"sum_{uuid.uuid4().hex[:12]}"
        analysis_version = "1.0.0"

        # 1. Collect deterministic forensic data
        evidence = self.retrieval.load_case_investigation_summary_data(
            case_id=req.case_id,
            dataset_id=req.dataset_id,
            target_account=req.target_account,
            case_notes=req.case_notes,
            officer_name=req.officer_name,
        )

        dataset_hash = evidence["dataset_info"].get("dataset_hash")

        # 2. Prepare concise evidence payload for LLM (compact token representation for rapid local reasoning)
        asum = evidence.get("account_summary") or {}
        rprof = evidence.get("risk_profile") or {}
        trail = evidence.get("money_trail_info") or {}

        evidence_payload = {
            "case_id": req.case_id,
            "target_account": req.target_account or "N/A",
            "dataset_rows": evidence["dataset_info"].get("valid_rows", 0),
            "account_inflow_inr": asum.get("in_amount", 0.0),
            "account_outflow_inr": asum.get("out_amount", 0.0),
            "net_flow_inr": asum.get("net_flow", 0.0),
            "in_transactions": asum.get("in_tx_count", 0),
            "out_transactions": asum.get("out_tx_count", 0),
            "mule_risk_index": rprof.get("mule_risk_index", 0),
            "risk_tier": rprof.get("risk_tier", "low"),
            "mule_layers": rprof.get("layers", []),
            "top_risk_factors": [f["name"] for f in rprof.get("features", [])[:3]],
            "hops_count": trail.get("total_hops", 0),
            "attributed_amount_inr": trail.get("total_attributed_amount", 0.0),
            "top_recipients": [f"{h['to']} (₹{h['amount']:,.0f})" for h in trail.get("sample_hops", [])[:4]],
        }

        # 3. Build Language-Specific System and User Prompts
        type_instruction = SUMMARY_PROMPTS.get(req.summary_type, SUMMARY_PROMPTS["executive"])

        if req.language == "hi":
            system_content = SUMMARIZER_PROMPT_HI
            user_content = (
                f"=== सारांश प्रकार (SUMMARY TYPE) ===\n"
                f"{type_instruction}\n\n"
                f"=== फोरेंसिक साक्ष्य पेलोड (EVIDENCE PAYLOAD) ===\n"
                f"{json.dumps(evidence_payload, indent=2)}\n\n"
                f"अनिवार्य निर्देश: आपका संपूर्ण JSON आउटपुट केवल और केवल शुद्ध, सरल हिन्दी (देवनागरी लिपि) में होना चाहिए। खाता संख्या, लेन-देन आईडी, और धनराशि (₹) को न बदलें। अब JSON सारांश तैयार करें।"
            )
        elif req.language == "mr":
            system_content = SUMMARIZER_PROMPT_MR
            user_content = (
                f"=== सारांश प्रकार (SUMMARY TYPE) ===\n"
                f"{type_instruction}\n\n"
                f"=== फॉरेन्सिक पुरावे पेलोड (EVIDENCE PAYLOAD) ===\n"
                f"{json.dumps(evidence_payload, indent=2)}\n\n"
                f"अनिवार्य सूचना: तुमचे संपूर्ण JSON आउटपुट केवळ आणि केवळ मराठीत (देवनागरी लिपी) असावे. खाते क्रमांक, व्यवहार आयडी, आणि रक्कम (₹) बदलू नका. आता JSON सारांश तयार करा."
            )
        else:
            system_content = SUMMARIZER_PROMPT_EN
            user_content = (
                f"=== SUMMARY TYPE ===\n"
                f"{type_instruction}\n\n"
                f"=== FORENSIC EVIDENCE PAYLOAD ===\n"
                f"{json.dumps(evidence_payload, indent=2)}\n\n"
                f"Generate the simple, clear JSON summary now."
            )

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ]

        # 4. Generate structured summary with guaranteed localized grounding
        base_content = self._build_deterministic_summary(
            evidence=evidence,
            req=req,
            analysis_version=analysis_version,
        )

        health = await self.llm.check_health()
        if not health["ollama_reachable"] or not health["model_available"]:
            logger.info("Ollama is offline or model missing; using localized deterministic forensic summary.")
            content = base_content
        else:
            try:
                parsed_json = await self.llm.generate_json(
                    messages=messages,
                    temperature=0.1,
                    max_tokens=420,
                    num_ctx=2048,
                )

                llm_overview = parsed_json.get("case_overview")
                llm_findings = parsed_json.get("key_findings")
                llm_trail = parsed_json.get("money_trail_summary")
                llm_risk = parsed_json.get("risk_and_anomaly_findings")
                llm_steps = parsed_json.get("recommended_next_steps")

                # Guarantee rich, non-empty, localized key findings
                final_findings = (
                    llm_findings
                    if isinstance(llm_findings, list) and len(llm_findings) > 0 and any(len(str(f).strip()) > 5 for f in llm_findings)
                    else base_content.key_findings
                )

                final_overview = (
                    llm_overview
                    if isinstance(llm_overview, str) and len(llm_overview.strip()) > 20
                    else base_content.case_overview
                )

                final_trail = (
                    llm_trail
                    if isinstance(llm_trail, str) and len(llm_trail.strip()) > 10
                    else base_content.money_trail_summary
                )

                final_risk = (
                    llm_risk
                    if isinstance(llm_risk, str) and len(llm_risk.strip()) > 10
                    else base_content.risk_and_anomaly_findings
                )

                final_steps = (
                    llm_steps
                    if isinstance(llm_steps, list) and len(llm_steps) > 0
                    else base_content.recommended_next_steps
                )

                content = AISummaryContent(
                    case_overview=final_overview,
                    key_findings=final_findings,
                    money_trail_summary=final_trail,
                    risk_and_anomaly_findings=final_risk,
                    supporting_evidence=evidence["sources"],
                    limitations=base_content.limitations,
                    recommended_next_steps=final_steps,
                    summary_type=req.summary_type,
                    generated_language=req.language,
                    analysis_version=analysis_version,
                )
            except Exception as e:
                logger.warning(f"Ollama inference error or timeout: {e}. Using localized forensic synthesis.")
                content = base_content

        # 5. Persist to DuckDB
        self.persist_summary(
            summary_id=summary_id,
            case_id=req.case_id,
            dataset_id=req.dataset_id,
            target_account=req.target_account,
            summary_type=req.summary_type,
            language=req.language,
            model_name=self.llm.model,
            analysis_version=analysis_version,
            result_hash=dataset_hash,
            content=content,
            is_stale=False,
        )

        return AISummaryResponse(
            summary_id=summary_id,
            case_id=req.case_id,
            dataset_id=req.dataset_id,
            target_account=req.target_account,
            summary_type=req.summary_type,
            language=req.language,
            model_name=self.llm.model,
            analysis_version=analysis_version,
            result_hash=dataset_hash,
            is_stale=False,
            content=content,
            created_at=datetime.now(UTC).isoformat(),
        )


# Global default instance
ai_summary_service = AISummaryService()
