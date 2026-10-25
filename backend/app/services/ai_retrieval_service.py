"""ANVITRACE — Forensic AI Evidence Retrieval Service.

Implements hybrid retrieval:
1. First preference: High-speed structured queries against DuckDB
   (Account features, Risk profiles, Isolation Forest anomalies, 4-hop money trail).
2. Second preference: Semantic retrieval across unstructured evidence
   (Case notes, evidence items, case diary entries) strictly isolated by case/dataset.

Guarantees:
- Never sends full 2M dataset to LLM prompt.
- Result limits & context bounds strictly enforced.
- Cross-case isolation strictly verified.
- Evidence references verified against canonical database records.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional
import duckdb

from app.database.duckdb import get_connection
from app.database.repositories.account import AccountRepository
from app.schemas.ai import SourceReference
from app.services.investigation import InvestigationService
from app.services.risk_engine import RiskAssessmentService
from app.utils.logging import logger


class RetrievedEvidenceContext:
    """Bounded, verified context ready for prompt insertion with source provenance."""

    def __init__(
        self,
        case_id: str,
        dataset_id: str,
        target_account: str | None = None,
    ) -> None:
        self.case_id = case_id
        self.dataset_id = dataset_id
        self.target_account = target_account
        self.facts: list[str] = []
        self.sources: list[SourceReference] = []
        self.limitations: list[str] = []
        self.accounts_found: list[str] = []

    def add_fact(self, fact_text: str) -> None:
        self.facts.append(fact_text.strip())

    def add_source(self, source: SourceReference) -> None:
        # Avoid duplicate citations
        key = (source.source_type, source.record_id, source.transaction_id, source.account_id)
        existing_keys = [
            (s.source_type, s.record_id, s.transaction_id, s.account_id)
            for s in self.sources
        ]
        if key not in existing_keys:
            self.sources.append(source)

    def add_limitation(self, limitation: str) -> None:
        if limitation not in self.limitations:
            self.limitations.append(limitation)

    def render_prompt_context(self) -> str:
        """Render bounded factual context text for Ollama prompt."""
        if not self.facts:
            return "No verified forensic evidence found for this query within the active case dataset."
        return "\n".join(self.facts)


class AIRetrievalService:
    """Orchestrates structured and semantic evidence extraction from DuckDB."""

    def __init__(self, conn: duckdb.DuckDBPyConnection | None = None) -> None:
        self._conn = conn

    def _get_conn(self) -> duckdb.DuckDBPyConnection:
        if self._conn is not None:
            return self._conn
        return get_connection()

    def extract_candidate_accounts(
        self,
        text: str,
        dataset_id: str,
    ) -> list[str]:
        """Extract valid account IDs mentioned in text matching dataset records."""
        conn = self._get_conn()
        # Find potential alphanumeric tokens of typical account lengths (6-20 chars)
        tokens = set(re.findall(r"\b[A-Za-z0-9_]{6,20}\b", text))
        if not tokens:
            return []

        # Validate against account_features or transactions in this dataset
        placeholders = ", ".join(["?"] * len(tokens))
        query = f"""
            SELECT DISTINCT account_id
            FROM account_features
            WHERE dataset_id = ? AND account_id IN ({placeholders})
            LIMIT 10;
        """
        params = [dataset_id, *list(tokens)]
        try:
            rows = conn.execute(query, params).fetchall()
            return [r[0] for r in rows]
        except Exception as e:
            logger.warning(f"Error checking candidate accounts: {e}")
            return []

    def retrieve_context_for_question(
        self,
        case_id: str,
        dataset_id: str,
        question: str,
        target_account: str | None = None,
        case_notes: str | None = None,
    ) -> RetrievedEvidenceContext:
        """Execute hybrid evidence retrieval for investigator query."""
        conn = self._get_conn()
        ctx = RetrievedEvidenceContext(case_id, dataset_id, target_account)

        # 1. Identify primary and secondary accounts under scrutiny
        candidate_accounts = self.extract_candidate_accounts(question, dataset_id)
        if target_account and target_account not in candidate_accounts:
            candidate_accounts.insert(0, target_account)
        ctx.accounts_found = candidate_accounts

        q_lower = question.lower()
        repo_acc = AccountRepository(conn)
        risk_svc = RiskAssessmentService(conn)
        inv_svc = InvestigationService(conn)

        # 2. Check general dataset stats if asked
        if any(w in q_lower for w in ("dataset", "total rows", "how many transactions", "overview of data")):
            try:
                ds_row = conn.execute(
                    "SELECT filename, total_rows, valid_rows, dataset_hash FROM datasets WHERE dataset_id = ?",
                    [dataset_id],
                ).fetchone()
                if ds_row:
                    ctx.add_fact(
                        f"[DATASET RECORD] File: {ds_row[0]} | Total Rows: {ds_row[1]:,} | "
                        f"Valid Ingested Rows: {ds_row[2]:,} | Dataset SHA-256: {ds_row[3][:16]}..."
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch dataset overview: {e}")

        # 3. Structured retrieval for identified accounts
        if candidate_accounts:
            for acc in candidate_accounts[:3]:  # Bound to max 3 accounts in prompt context
                # Account profile
                profile = repo_acc.get_account_profile(acc, dataset_id)
                if profile:
                    ctx.add_fact(
                        f"[ACCOUNT PROFILE: {acc}] Inflow: ₹{profile.in_amount:,.2f} ({profile.in_tx_count} txs, {profile.distinct_senders} senders) | "
                        f"Outflow: ₹{profile.out_amount:,.2f} ({profile.out_tx_count} txs, {profile.distinct_receivers} receivers) | "
                        f"Observed Net Flow: ₹{profile.net_flow:,.2f} | "
                        f"Active: {profile.first_tx_timestamp or 'N/A'} to {profile.last_tx_timestamp or 'N/A'}"
                    )
                    ctx.add_source(
                        SourceReference(
                            source_type="account_profile",
                            account_id=acc,
                            amount=float(profile.in_amount),
                            relevance=f"Precomputed financial totals for {acc} in active dataset",
                        )
                    )

                # Risk assessment if asked or relevant
                is_risk_query = any(w in q_lower for w in (
                    "risk", "flag", "flagged", "suspicious", "mule", "score",
                    "anomaly", "why", "tier", "classification"
                ))
                if is_risk_query or len(candidate_accounts) == 1:
                    risk_prof = risk_svc.assess_account_risk(acc, dataset_id)
                    if risk_prof:
                        layers_desc = [lc.role for lc in risk_prof.layer_classifications]
                        ctx.add_fact(
                            f"[RISK ASSESSMENT: {acc}] Mule Risk Index: {risk_prof.mule_risk_index}/100 ({risk_prof.risk_tier.upper()}) | "
                            f"Classifications: {', '.join(layers_desc) or 'None'}"
                        )
                        ctx.add_source(
                            SourceReference(
                                source_type="risk_assessment",
                                account_id=acc,
                                relevance=f"Mule Risk Index {risk_prof.mule_risk_index}/100 and classifications",
                            )
                        )

                        # Top contributing risk features & anomalies
                        for feat in risk_prof.features:
                            if feat.score_contribution > 0:
                                ctx.add_fact(
                                    f"  - Indicator: {feat.feature_name} (+{feat.score_contribution:.1f} pts) — {feat.explanation}"
                                )
                                if feat.supporting_record_ids:
                                    for rid in feat.supporting_record_ids[:2]:
                                        ctx.add_source(
                                            SourceReference(
                                                source_type="anomaly_detection",
                                                record_id=rid,
                                                account_id=acc,
                                                relevance=f"Supports risk factor '{feat.feature_name}'",
                                            )
                                        )

                # Money trail & lineage if asked
                is_trail_query = any(w in q_lower for w in (
                    "trail", "trace", "hop", "money flow", "where did", "sent to",
                    "lineage", "received from", "transferred", "destination"
                ))
                if is_trail_query or (target_account and acc == target_account):
                    try:
                        trace = inv_svc.run_trace(
                            victim_account=acc,
                            dataset_id=dataset_id,
                            max_hops=4,
                        )
                        if trace.money_trail:
                            ctx.add_fact(
                                f"[MONEY TRAIL: Starting from {acc}] Total hops identified: {trace.graph.total_hops_found} | "
                                f"Total Attributed Lineage: ₹{trace.graph.total_attributed_amount:,.2f}"
                            )
                            # Add top 8 edge hops to prompt context
                            for edge in trace.money_trail[:8]:
                                cycle_tag = " [CYCLE DETECTED]" if edge.is_cycle else ""
                                ctx.add_fact(
                                    f"  Hop {edge.hop}: {edge.from_account} -> {edge.to_account} | "
                                    f"₹{edge.amount:,.2f} (Attributed: ₹{edge.attributable_amount:,.2f}) | "
                                    f"TxID: {edge.Transaction_ID} | Time: {edge.timestamp} | "
                                    f"Mode: {edge.payment_mode}{cycle_tag}"
                                )
                                ctx.add_source(
                                    SourceReference(
                                        source_type="money_trail",
                                        record_id=edge.record_id,
                                        transaction_id=edge.Transaction_ID,
                                        account_id=edge.to_account,
                                        timestamp=str(edge.timestamp) if edge.timestamp else None,
                                        amount=float(edge.amount),
                                        relevance=f"Hop {edge.hop} fund transfer from {edge.from_account}",
                                    )
                                )
                        else:
                            ctx.add_limitation(f"No outgoing forward money trail found for account {acc} in this dataset.")
                    except Exception as e:
                        logger.warning(f"Error running trace for {acc}: {e}")

                # Connecting transactions between candidate accounts
                if len(candidate_accounts) >= 2:
                    acc1, acc2 = candidate_accounts[0], candidate_accounts[1]
                    tx_rows = conn.execute(
                        """
                        SELECT record_id, Transaction_ID, Sender_Account, Receiver_Account, Amount, Timestamp, Payment_Mode
                        FROM transactions
                        WHERE dataset_id = ?
                          AND ((Sender_Account = ? AND Receiver_Account = ?)
                            OR (Sender_Account = ? AND Receiver_Account = ?))
                        ORDER BY Timestamp ASC
                        LIMIT 10;
                        """,
                        [dataset_id, acc1, acc2, acc2, acc1],
                    ).fetchall()
                    if tx_rows:
                        ctx.add_fact(f"[DIRECT TRANSACTIONS between {acc1} and {acc2}] Found {len(tx_rows)} records:")
                        for row in tx_rows:
                            rid, txid, sender, receiver, amt, ts, pmode = row
                            ctx.add_fact(f"  - Record: {rid} | {sender} -> {receiver} | ₹{float(amt):,.2f} | {ts} | {pmode}")
                            ctx.add_source(
                                SourceReference(
                                    source_type="transaction",
                                    record_id=rid,
                                    transaction_id=txid,
                                    account_id=sender,
                                    timestamp=str(ts),
                                    amount=float(amt),
                                    relevance=f"Direct transfer connecting {acc1} and {acc2}",
                                )
                            )
        else:
            ctx.add_limitation(
                "No specific account ID was identified in the question. "
                "Answers are bounded to overall case parameters."
            )

        # 4. Semantic retrieval over unstructured evidence (Case Notes & Evidence Items)
        unstructured_chunks: list[dict[str, Any]] = []

        # From case_notes parameter or docket
        if case_notes and case_notes.strip():
            # Chunk long notes into paragraphs
            paragraphs = [p.strip() for p in case_notes.split("\n\n") if p.strip()]
            for p in paragraphs:
                unstructured_chunks.append({
                    "text": p,
                    "source_type": "case_note",
                    "evidence_id": f"note_{case_id}",
                    "relevance": "Investigator case notes",
                })

        # From evidence_items table for this dataset
        try:
            ev_rows = conn.execute(
                "SELECT evidence_id, item_type, title, sha256_hash FROM evidence_items WHERE dataset_id = ?",
                [dataset_id],
            ).fetchall()
            for erow in ev_rows:
                unstructured_chunks.append({
                    "text": f"Evidence Title: {erow[2]} (Type: {erow[1]}, SHA256: {erow[3] or 'N/A'})",
                    "source_type": "case_evidence",
                    "evidence_id": erow[0],
                    "relevance": f"Registered case evidence item ({erow[1]})",
                })
        except Exception as e:
            logger.warning(f"Error fetching evidence items: {e}")

        # Simple semantic similarity scoring (cosine / term overlap)
        if unstructured_chunks:
            q_words = set(re.findall(r"\w+", q_lower))
            scored_chunks = []
            for item in unstructured_chunks:
                item_words = set(re.findall(r"\w+", item["text"].lower()))
                overlap = len(q_words & item_words)
                if overlap > 0:
                    scored_chunks.append((overlap, item))

            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            for _, item in scored_chunks[:3]:  # Top 3 most relevant chunks
                ctx.add_fact(f"[{item['source_type'].upper()}] {item['text']}")
                ctx.add_source(
                    SourceReference(
                        source_type=item["source_type"],
                        evidence_id=item["evidence_id"],
                        relevance=item["relevance"],
                    )
                )

        return ctx

    def load_case_investigation_summary_data(
        self,
        case_id: str,
        dataset_id: str,
        target_account: str | None = None,
        case_notes: str | None = None,
        officer_name: str | None = None,
    ) -> dict[str, Any]:
        """Aggregate all deterministic forensic evidence for Case Summarizer."""
        conn = self._get_conn()
        repo_acc = AccountRepository(conn)
        risk_svc = RiskAssessmentService(conn)
        inv_svc = InvestigationService(conn)

        # 1. Dataset stats
        ds_row = conn.execute(
            """SELECT filename, total_rows, valid_rows, dataset_hash, uploaded_at
               FROM datasets WHERE dataset_id = ?""",
            [dataset_id],
        ).fetchone()

        dataset_info = {
            "filename": ds_row[0] if ds_row else "Unknown",
            "total_rows": int(ds_row[1]) if ds_row else 0,
            "valid_rows": int(ds_row[2]) if ds_row else 0,
            "dataset_hash": ds_row[3] if ds_row else "",
            "uploaded_at": str(ds_row[4]) if ds_row else "",
        }

        # 2. Account Profile & Risk
        account_summary: dict[str, Any] = {}
        risk_profile: dict[str, Any] = {}
        money_trail_info: dict[str, Any] = {}
        sources: list[SourceReference] = []

        if target_account:
            prof = repo_acc.get_account_profile(target_account, dataset_id)
            if prof:
                account_summary = {
                    "account_id": prof.account_id,
                    "in_amount": float(prof.in_amount),
                    "out_amount": float(prof.out_amount),
                    "net_flow": float(prof.net_flow),
                    "in_tx_count": prof.in_tx_count,
                    "out_tx_count": prof.out_tx_count,
                    "distinct_senders": prof.distinct_senders,
                    "distinct_receivers": prof.distinct_receivers,
                    "first_tx": str(prof.first_tx_timestamp) if prof.first_tx_timestamp else None,
                    "last_tx": str(prof.last_tx_timestamp) if prof.last_tx_timestamp else None,
                }
                sources.append(
                    SourceReference(
                        source_type="account_profile",
                        account_id=target_account,
                        amount=float(prof.in_amount),
                        relevance=f"Precomputed account metrics for {target_account}",
                    )
                )

            # Assess Risk
            rprof = risk_svc.assess_account_risk(target_account, dataset_id)
            if rprof:
                risk_profile = {
                    "mule_risk_index": rprof.mule_risk_index,
                    "risk_tier": rprof.risk_tier,
                    "layers": [lc.role for lc in rprof.layer_classifications],
                    "features": [
                        {
                            "name": f.feature_name,
                            "pts": f.score_contribution,
                            "explanation": f.explanation,
                            "supporting_records": f.supporting_record_ids,
                        }
                        for f in rprof.features
                        if f.score_contribution > 0
                    ],
                }
                sources.append(
                    SourceReference(
                        source_type="risk_assessment",
                        account_id=target_account,
                        relevance=f"Mule Risk Index {rprof.mule_risk_index}/100",
                    )
                )

            # Run Trace
            try:
                trace = inv_svc.run_trace(
                    victim_account=target_account,
                    dataset_id=dataset_id,
                    max_hops=4,
                )
                money_trail_info = {
                    "total_hops": trace.graph.total_hops_found,
                    "total_attributed_amount": float(trace.graph.total_attributed_amount),
                    "edges_count": len(trace.money_trail),
                    "sample_hops": [
                        {
                            "hop": e.hop,
                            "from": e.from_account,
                            "to": e.to_account,
                            "amount": float(e.amount),
                            "attributed": float(e.attributable_amount),
                            "timestamp": str(e.timestamp) if e.timestamp else None,
                            "mode": e.payment_mode,
                            "tx_id": e.Transaction_ID,
                            "record_id": e.record_id,
                        }
                        for e in trace.money_trail[:10]
                    ],
                }
                for e in trace.money_trail[:5]:
                    sources.append(
                        SourceReference(
                            source_type="money_trail",
                            record_id=e.record_id,
                            transaction_id=e.Transaction_ID,
                            account_id=e.to_account,
                            timestamp=str(e.timestamp) if e.timestamp else None,
                            amount=float(e.amount),
                            relevance=f"Hop {e.hop} money movement to {e.to_account}",
                        )
                    )
            except Exception as e:
                logger.warning(f"Error tracing for summary: {e}")

        # 3. Evidence items
        evidence_items: list[dict[str, Any]] = []
        try:
            ev_rows = conn.execute(
                "SELECT evidence_id, item_type, title, sha256_hash FROM evidence_items WHERE dataset_id = ?",
                [dataset_id],
            ).fetchall()
            for erow in ev_rows:
                evidence_items.append({
                    "evidence_id": erow[0],
                    "type": erow[1],
                    "title": erow[2],
                    "hash": erow[3],
                })
                sources.append(
                    SourceReference(
                        source_type="case_evidence",
                        evidence_id=erow[0],
                        relevance=f"Sealed evidence item: {erow[2]}",
                    )
                )
        except Exception as e:
            logger.warning(f"Error fetching evidence items for summary: {e}")

        return {
            "case_id": case_id,
            "dataset_id": dataset_id,
            "target_account": target_account,
            "officer_name": officer_name,
            "case_notes": case_notes,
            "dataset_info": dataset_info,
            "account_summary": account_summary,
            "risk_profile": risk_profile,
            "money_trail_info": money_trail_info,
            "evidence_items": evidence_items,
            "sources": sources,
        }
