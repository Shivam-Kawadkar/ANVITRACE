"""Integration test suite for strict case and dataset data isolation across ANVITRACE.

Verifies:
1. Missing or empty dataset_id rejects requests with HTTP 400 (no silent fallback).
2. Non-existent dataset_id returns HTTP 404.
3. Complete dataset isolation between Dataset A and Dataset B:
   - Records belonging to Dataset A are invisible to queries targeting Dataset B.
   - Cross-case query attempts (Querying Account A using Dataset B ID) return 404 / empty.
4. Statutory document generation (Freeze Requisition & Case Diary) strictly requires valid dataset_id
   and isolates records by dataset.
5. Account search and recovery candidate endpoints enforce dataset filtering without leakage.
"""

from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.database import duckdb as db_module
from app.database.schema import apply_schema
from app.main import app
from app.services.ingestion import IngestionService


@pytest.fixture
def isolation_test_db(tmp_path: Path):
    """Setup in-memory DuckDB with two distinct datasets representing separate cases."""
    conn = duckdb.connect(":memory:")
    apply_schema(conn)

    # Monkey-patch get_connection to return this isolated connection
    db_module._connection = conn

    # Dataset A (Case A)
    csv_a = tmp_path / "case_a_evidence.csv"
    rows_a = [
        "TX_A_001,2026-03-01 10:00:00,ACC_CASE_A_VIC,Victim A,SBIN0001001,ACC_CASE_A_MULE,Mule A,HDFC0002001,50000.00,UPI,SUCCESS,FRAUD_A,185.220.101.5,Linux_Script",
        "TX_A_002,2026-03-01 10:15:00,ACC_CASE_A_MULE,Mule A,HDFC0002001,ACC_CASE_A_HOP2,Hop2 A,ICIC0003001,45000.00,IMPS,SUCCESS,LAYER_A,185.220.101.5,Linux_Script",
    ]
    header = "Transaction_ID,Timestamp,Sender_Account,Sender_Name,Sender_IFSC,Receiver_Account,Receiver_Name,Receiver_IFSC,Amount,Payment_Mode,Status,Narration,IP_Address,Device_Type\n"
    csv_a.write_text(header + "\n".join(rows_a) + "\n", encoding="utf-8")

    # Dataset B (Case B)
    csv_b = tmp_path / "case_b_evidence.csv"
    rows_b = [
        "TX_B_001,2026-03-02 11:00:00,ACC_CASE_B_VIC,Victim B,PUNB0004001,ACC_CASE_B_MULE,Mule B,BARB0005001,75000.00,NEFT,SUCCESS,FRAUD_B,192.168.1.1,Android_App",
        "TX_B_002,2026-03-02 11:30:00,ACC_CASE_B_MULE,Mule B,BARB0005001,ACC_CASE_B_HOP2,Hop2 B,UTIB0006001,70000.00,RTGS,SUCCESS,LAYER_B,192.168.1.1,Android_App",
    ]
    csv_b.write_text(header + "\n".join(rows_b) + "\n", encoding="utf-8")

    ingest_svc = IngestionService(conn)
    ingest_svc.ingest_file(csv_a, dataset_id="ds_case_alpha")
    ingest_svc.ingest_file(csv_b, dataset_id="ds_case_beta")

    yield conn

    db_module._connection = None
    conn.close()


def test_missing_dataset_id_returns_400(isolation_test_db):
    """Scenario 1: Missing or empty dataset_id must return HTTP 400 and never fall back silently."""
    client = TestClient(app)

    # 1. Accounts profile
    res1 = client.get("/api/accounts/ACC_CASE_A_VIC")
    assert res1.status_code == 400
    assert "dataset_id is required" in res1.json()["detail"]

    # 2. Account transactions
    res2 = client.get("/api/accounts/ACC_CASE_A_VIC/transactions")
    assert res2.status_code == 400
    assert "dataset_id is required" in res2.json()["detail"]

    # 3. Account risk
    res3 = client.get("/api/accounts/ACC_CASE_A_MULE/risk")
    assert res3.status_code == 400
    assert "dataset_id is required" in res3.json()["detail"]

    # 4. Search accounts
    res4 = client.get("/api/accounts/search?query=ACC_CASE")
    assert res4.status_code == 400
    assert "dataset_id is required" in res4.json()["detail"]

    # 5. Investigation trace
    res5 = client.get("/api/investigations/trace/ACC_CASE_A_VIC")
    assert res5.status_code == 400
    assert "dataset_id is required" in res5.json()["detail"]

    # 6. Recovery candidates
    res6 = client.get("/api/recovery/candidates")
    assert res6.status_code == 400
    assert "dataset_id is required" in res6.json()["detail"]

    # 7. Dataset status
    res7 = client.get("/api/dataset/status")
    assert res7.status_code == 400
    assert "dataset_id is required" in res7.json()["detail"]

    # 8. Freeze Requisition document
    res8 = client.post("/api/documents/freeze-requisition", json={"target_account_id": "ACC_CASE_A_MULE"})
    assert res8.status_code == 400
    assert "dataset_id is required" in res8.json()["detail"]

    # 9. Case Diary document
    res9 = client.post("/api/documents/case-diary", json={"victim_account": "ACC_CASE_A_VIC"})
    assert res9.status_code == 400
    assert "dataset_id is required" in res9.json()["detail"]


def test_nonexistent_dataset_id_returns_404(isolation_test_db):
    """Scenario 2: Querying with a non-existent dataset_id returns HTTP 404 without silent fallback."""
    client = TestClient(app)

    res1 = client.get("/api/accounts/ACC_CASE_A_VIC?dataset_id=ds_non_existent")
    assert res1.status_code == 404
    assert "not found" in res1.json()["detail"]

    res2 = client.get("/api/dataset/status?dataset_id=ds_non_existent")
    assert res2.status_code == 404
    assert "not found" in res2.json()["detail"]

    res3 = client.get("/api/investigations/trace/ACC_CASE_A_VIC?dataset_id=ds_non_existent")
    assert res3.status_code == 404
    assert "not found" in res3.json()["detail"]


def test_strict_cross_case_dataset_isolation(isolation_test_db):
    """Scenario 3 & 7: Verify Dataset A and Dataset B are completely isolated.
    Attempting to query Case A records using Case B dataset ID must return 404 / empty.
    """
    client = TestClient(app)

    # Query Case A account with Dataset A ID -> SUCCESS (200)
    res_a = client.get("/api/accounts/ACC_CASE_A_VIC?dataset_id=ds_case_alpha")
    assert res_a.status_code == 200
    assert res_a.json()["account_id"] == "ACC_CASE_A_VIC"
    assert res_a.json()["dataset_id"] == "ds_case_alpha"

    # Query Case A account with Dataset B ID -> NOT FOUND (404)
    res_a_in_b = client.get("/api/accounts/ACC_CASE_A_VIC?dataset_id=ds_case_beta")
    assert res_a_in_b.status_code == 404

    # Query Case B account with Dataset B ID -> SUCCESS (200)
    res_b = client.get("/api/accounts/ACC_CASE_B_VIC?dataset_id=ds_case_beta")
    assert res_b.status_code == 200
    assert res_b.json()["account_id"] == "ACC_CASE_B_VIC"
    assert res_b.json()["dataset_id"] == "ds_case_beta"

    # Query Case B account with Dataset A ID -> NOT FOUND (404)
    res_b_in_a = client.get("/api/accounts/ACC_CASE_B_VIC?dataset_id=ds_case_alpha")
    assert res_b_in_a.status_code == 404


def test_account_search_isolation(isolation_test_db):
    """Verify account search respects dataset boundaries."""
    client = TestClient(app)

    # Search for "MULE" in Dataset A -> returns only ACC_CASE_A_MULE
    res_a = client.get("/api/accounts/search?query=MULE&dataset_id=ds_case_alpha")
    assert res_a.status_code == 200
    accounts_a = [acc["account_id"] for acc in res_a.json()]
    assert "ACC_CASE_A_MULE" in accounts_a
    assert "ACC_CASE_B_MULE" not in accounts_a

    # Search for "MULE" in Dataset B -> returns only ACC_CASE_B_MULE
    res_b = client.get("/api/accounts/search?query=MULE&dataset_id=ds_case_beta")
    assert res_b.status_code == 200
    accounts_b = [acc["account_id"] for acc in res_b.json()]
    assert "ACC_CASE_B_MULE" in accounts_b
    assert "ACC_CASE_A_MULE" not in accounts_b


def test_investigation_trace_isolation(isolation_test_db):
    """Verify four-hop BFS traversal only discovers nodes from the specified dataset."""
    client = TestClient(app)

    # Trace Victim A in Dataset A
    res_a = client.get("/api/investigations/trace/ACC_CASE_A_VIC?dataset_id=ds_case_alpha")
    assert res_a.status_code == 200
    graph_a = res_a.json()
    node_ids_a = {n["id"] for n in graph_a["nodes"]}
    assert "ACC_CASE_A_VIC" in node_ids_a
    assert "ACC_CASE_A_MULE" in node_ids_a
    # Ensure zero leak from Case B
    assert "ACC_CASE_B_VIC" not in node_ids_a
    assert "ACC_CASE_B_MULE" not in node_ids_a

    # Trace Victim B in Dataset B
    res_b = client.get("/api/investigations/trace/ACC_CASE_B_VIC?dataset_id=ds_case_beta")
    assert res_b.status_code == 200
    graph_b = res_b.json()
    node_ids_b = {n["id"] for n in graph_b["nodes"]}
    assert "ACC_CASE_B_VIC" in node_ids_b
    assert "ACC_CASE_B_MULE" in node_ids_b
    # Ensure zero leak from Case A
    assert "ACC_CASE_A_VIC" not in node_ids_b
    assert "ACC_CASE_A_MULE" not in node_ids_b


def test_statutory_document_generation_isolation(isolation_test_db):
    """Verify document synthesis uses verified records strictly from the specified dataset."""
    client = TestClient(app)

    # Generate Freeze Requisition for Case A Mule using Dataset A
    res_doc_a = client.post(
        "/api/documents/freeze-requisition",
        json={
            "target_account_id": "ACC_CASE_A_MULE",
            "dataset_id": "ds_case_alpha",
            "case_reference": "FIR-CASE-ALPHA-01",
        },
    )
    assert res_doc_a.status_code == 200
    data_a = res_doc_a.json()
    assert data_a["target_account_id"] == "ACC_CASE_A_MULE"
    assert data_a["dataset_id"] == "ds_case_alpha"
    assert data_a["evidence_summary"]["total_credits_inr"] == 50000.0

    # Attempt to generate Freeze Requisition for Case A Mule using Dataset B -> must fail
    res_doc_mismatch = client.post(
        "/api/documents/freeze-requisition",
        json={
            "target_account_id": "ACC_CASE_A_MULE",
            "dataset_id": "ds_case_beta",
            "case_reference": "FIR-CASE-BETA-01",
        },
    )
    # Target account does not exist in Dataset B
    assert res_doc_mismatch.status_code == 500
