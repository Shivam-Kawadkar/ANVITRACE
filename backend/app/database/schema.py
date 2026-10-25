"""DuckDB schema definitions and migrations for ANVITRACE."""

import contextlib

import duckdb

SCHEMA_SQL = """
-- 1. Datasets registry
CREATE TABLE IF NOT EXISTS datasets (
    dataset_id VARCHAR PRIMARY KEY,
    dataset_hash VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    total_rows BIGINT NOT NULL DEFAULT 0,
    valid_rows BIGINT NOT NULL DEFAULT 0,
    invalid_rows BIGINT NOT NULL DEFAULT 0,
    repeated_tx_ids BIGINT NOT NULL DEFAULT 0,
    exact_duplicates BIGINT NOT NULL DEFAULT 0,
    schema_version VARCHAR NOT NULL,
    normalization_version VARCHAR NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR NOT NULL DEFAULT 'PENDING'
);

-- 2. Ingestion runs log
CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id VARCHAR PRIMARY KEY,
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds DOUBLE,
    peak_memory_mb DOUBLE,
    rows_per_second DOUBLE,
    status VARCHAR NOT NULL,
    error_message VARCHAR
);

-- 3. Canonical transactions table (Financial grade)
-- Note: record_id is surrogate primary key and Transaction_ID is preserved as source data
CREATE TABLE IF NOT EXISTS transactions (
    record_id VARCHAR PRIMARY KEY,
    Transaction_ID VARCHAR NOT NULL,
    Sender_Account VARCHAR NOT NULL,
    Receiver_Account VARCHAR NOT NULL,
    Sender_IFSC VARCHAR NOT NULL,
    Receiver_IFSC VARCHAR NOT NULL,
    Amount DECIMAL(18, 2) NOT NULL,
    Timestamp TIMESTAMP NOT NULL,
    Payment_Mode VARCHAR NOT NULL,
    Narration VARCHAR,
    IP_Address VARCHAR,
    Device_Type VARCHAR,
    raw_timestamp VARCHAR,
    raw_amount VARCHAR,
    raw_payment_mode VARCHAR,
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    source_row BIGINT NOT NULL,
    validation_status VARCHAR NOT NULL,
    is_repeated_tx BOOLEAN NOT NULL DEFAULT FALSE,
    is_exact_duplicate BOOLEAN NOT NULL DEFAULT FALSE
);

-- Essential database indexes on transactions for filtering & join performance
CREATE INDEX IF NOT EXISTS idx_tx_dataset_id ON transactions (dataset_id);
CREATE INDEX IF NOT EXISTS idx_tx_sender_acc ON transactions (Sender_Account);
CREATE INDEX IF NOT EXISTS idx_tx_receiver_acc ON transactions (Receiver_Account);
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions (Timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_transaction_id ON transactions (Transaction_ID);

-- 4. Account precomputed analytical features
CREATE TABLE IF NOT EXISTS account_features (
    account_id VARCHAR NOT NULL,
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    in_tx_count BIGINT NOT NULL DEFAULT 0,
    out_tx_count BIGINT NOT NULL DEFAULT 0,
    in_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    out_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    distinct_senders BIGINT NOT NULL DEFAULT 0,
    distinct_receivers BIGINT NOT NULL DEFAULT 0,
    first_tx_timestamp TIMESTAMP,
    last_tx_timestamp TIMESTAMP,
    PRIMARY KEY (account_id, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_acc_feat_dataset ON account_features (dataset_id);

-- 5. Transaction forensic features placeholder
CREATE TABLE IF NOT EXISTS transaction_features (
    record_id VARCHAR PRIMARY KEY REFERENCES transactions(record_id),
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    velocity_1h INTEGER DEFAULT 0,
    velocity_24h INTEGER DEFAULT 0,
    rapid_flow_flag BOOLEAN DEFAULT FALSE,
    structuring_flag BOOLEAN DEFAULT FALSE,
    odd_hour_flag BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_tx_feat_dataset ON transaction_features (dataset_id);

-- 6. Investigation snapshots
CREATE TABLE IF NOT EXISTS investigation_snapshots (
    snapshot_id VARCHAR PRIMARY KEY,
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    target_account VARCHAR NOT NULL,
    max_hops INTEGER NOT NULL DEFAULT 4,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    snapshot_data VARCHAR -- JSON or metadata
);

-- 7. Evidence items
CREATE TABLE IF NOT EXISTS evidence_items (
    evidence_id VARCHAR PRIMARY KEY,
    dataset_id VARCHAR NOT NULL REFERENCES datasets(dataset_id),
    item_type VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    file_path VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sha256_hash VARCHAR
);

-- 8. AI Case Summaries
CREATE TABLE IF NOT EXISTS ai_case_summaries (
    summary_id VARCHAR PRIMARY KEY,
    case_id VARCHAR NOT NULL,
    dataset_id VARCHAR NOT NULL,
    target_account VARCHAR,
    summary_type VARCHAR NOT NULL,
    language VARCHAR NOT NULL DEFAULT 'en',
    model_name VARCHAR NOT NULL,
    analysis_version VARCHAR,
    result_hash VARCHAR,
    content_json VARCHAR NOT NULL,
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_sum_case ON ai_case_summaries (case_id);
CREATE INDEX IF NOT EXISTS idx_ai_sum_dataset ON ai_case_summaries (dataset_id);

-- 9. AI Case Chat History
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    message_id VARCHAR PRIMARY KEY,
    case_id VARCHAR NOT NULL,
    dataset_id VARCHAR NOT NULL,
    session_id VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    content VARCHAR NOT NULL,
    sources_json VARCHAR,
    language VARCHAR NOT NULL DEFAULT 'en',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_case ON ai_chat_messages (case_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_session ON ai_chat_messages (session_id);
"""


from app.utils.logging import logger


def apply_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """Execute DDL statements to ensure all canonical tables and indexes exist."""
    # Strip single-line comments (-- ...) before splitting by semicolon
    cleaned_lines = []
    for line in SCHEMA_SQL.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("--"):
            continue
        cleaned_lines.append(line)
    cleaned_sql = "\n".join(cleaned_lines)

    for statement in cleaned_sql.split(";"):
        stmt = statement.strip()
        if stmt:
            try:
                conn.execute(stmt + ";")
            except Exception as e:
                logger.error(f"DDL statement error:\n{stmt}\nError: {e}")

    # Schema migration: add provenance columns if table was created previously
    for col in ("raw_timestamp", "raw_amount", "raw_payment_mode"):
        with contextlib.suppress(Exception):
            conn.execute(f"ALTER TABLE transactions ADD COLUMN {col} VARCHAR;")

