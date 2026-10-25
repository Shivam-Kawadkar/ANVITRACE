import contextlib
import shutil

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status


from app.config.settings import settings
from app.database.duckdb import get_connection
from app.database.repositories.dataset import DatasetRepository
from app.schemas.dataset import (
    DatasetStatisticsResponse,
    DatasetStatusResponse,
    DatasetUploadResponse,
)
from app.services.ingestion import IngestionService, compute_file_sha256
from app.utils.logging import logger

router = APIRouter(prefix="/dataset", tags=["dataset"])


@router.post(
    "/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload and ingest a forensic transaction dataset",
)
async def upload_dataset(
    file: UploadFile = File(..., description="CSV dataset file of financial transactions"),
):
    """Save uploaded CSV to data/raw, compute SHA-256, and trigger streaming ingestion."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are supported for ingestion.",
        )

    raw_dir = settings.project_root / settings.DATA_RAW_DIR
    raw_dir.mkdir(parents=True, exist_ok=True)
    temp_target = raw_dir / file.filename

    # Save to disk securely with 1MB chunk buffer
    try:
        with open(temp_target, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer, length=1024 * 1024)
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not persist uploaded file: {e}",
        )

    # Compute deterministic SHA-256
    file_hash = compute_file_sha256(temp_target)
    dataset_id = f"ds_{file_hash[:16]}"

    # Execute streaming ingestion in worker thread so event loop remains responsive
    try:
        import asyncio
        service = IngestionService(get_connection())
        result = await asyncio.to_thread(
            service.ingest_file,
            temp_target,
            dataset_id=dataset_id,
            dataset_hash=file_hash,
        )
        return DatasetUploadResponse(
            dataset_id=dataset_id,
            dataset_hash=file_hash,
            filename=file.filename,
            status=result["status"],
            message=f"Dataset ingested successfully. Processed {result['total_rows']:,} rows.",
        )
    except Exception as e:
        logger.error(f"Ingestion failed for {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {e}",
        )


@router.get(
    "/status",
    response_model=DatasetStatusResponse,
    summary="Get ingestion status and progress for a dataset",
)
async def get_dataset_status(
    dataset_id: str | None = Query(
        None, description="Required dataset_id."
    ),
):
    """Retrieve status, duration, throughput and row metrics."""
    if not dataset_id or not dataset_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dataset_id query parameter is required. No active case dataset specified.",
        )

    clean_id = dataset_id.strip()
    conn = get_connection()
    repo = DatasetRepository(conn)

    stat = repo.get_dataset_status(clean_id)
    if not stat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{clean_id}' not found.",
        )
    return stat


@router.get(
    "/statistics",
    response_model=DatasetStatisticsResponse,
    summary="Get forensic statistics, distinct account volumes, and duplicate metrics",
)
async def get_dataset_statistics(
    dataset_id: str | None = Query(
        None, description="Required dataset_id."
    ),
):
    """Retrieve analytical breakdown of volume, accounts, payment modes, and duplicates."""
    if not dataset_id or not dataset_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dataset_id query parameter is required. No active case dataset specified.",
        )

    clean_id = dataset_id.strip()
    conn = get_connection()
    repo = DatasetRepository(conn)

    stats = repo.get_dataset_statistics(clean_id)
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{clean_id}' not found.",
        )
    return stats


@router.post(
    "/reset",
    summary="Clear all ingested datasets and transaction records",
)
async def reset_dataset():
    """Clear all ingested transactions, datasets, and analytical features from DuckDB instantly."""
    from app.database.schema import apply_schema
    conn = get_connection()
    try:
        tables = [
            "cases",
            "evidence_items",
            "legal_documents",
            "evidence_snapshots",
            "investigation_snapshots",
            "transaction_features",
            "account_features",
            "transactions",
            "ingestion_runs",
            "datasets",
        ]
        for t in tables:
            with contextlib.suppress(Exception):
                conn.execute(f"DROP TABLE IF EXISTS {t} CASCADE;")

        apply_schema(conn)
        with contextlib.suppress(Exception):
            conn.execute("CHECKPOINT;")
        logger.info("Successfully cleared all ingested dataset tables and transaction records from DuckDB.")
        return {"status": "success", "message": "All ingested dataset tables and transaction records have been cleared."}
    except Exception as e:
        logger.error(f"Failed to reset database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset database: {e}",
        )



@router.delete(
    "/{dataset_id}",
    summary="Delete a dataset and all its associated transactions and features",
)
async def delete_dataset(dataset_id: str):
    """Delete a specific dataset, all its transactions, features, and evidence items from DuckDB."""
    from app.database.schema import apply_schema

    conn = get_connection()
    try:
        # Check if dataset exists
        exists = conn.execute(
            "SELECT dataset_id, filename FROM datasets WHERE dataset_id = ?",
            [dataset_id],
        ).fetchone()

        filename = exists[1] if exists else None

        # Check total remaining datasets and transactions
        other_ds = 0
        try:
            other_ds = conn.execute(
                "SELECT COUNT(*) FROM datasets WHERE dataset_id != ?",
                [dataset_id],
            ).fetchone()[0]
        except Exception:
            other_ds = 0

        other_tx = 0
        try:
            other_tx = conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE dataset_id != ?",
                [dataset_id],
            ).fetchone()[0]
        except Exception:
            other_tx = 0


        tables = [
            "cases",
            "evidence_items",
            "legal_documents",
            "evidence_snapshots",
            "investigation_snapshots",
            "transaction_features",
            "account_features",
            "transactions",
            "ingestion_runs",
            "datasets",
        ]

        if other_ds == 0 and other_tx == 0:
            # If no other datasets exist, wipe everything and reapply schema cleanly
            for t in tables:
                with contextlib.suppress(Exception):
                    conn.execute(f"DROP TABLE IF EXISTS {t} CASCADE;")
            apply_schema(conn)
            with contextlib.suppress(Exception):
                conn.execute("CHECKPOINT;")

        else:
            # Other datasets exist: preserve them and purge only this dataset's records
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_ds AS SELECT * FROM datasets WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_ir AS SELECT * FROM ingestion_runs WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_tx AS SELECT * FROM transactions WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_af AS SELECT * FROM account_features WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_tf AS SELECT * FROM transaction_features WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_snap AS SELECT * FROM investigation_snapshots WHERE dataset_id != '{dataset_id}'"
            )
            conn.execute(
                f"CREATE TEMPORARY TABLE _keep_ev AS SELECT * FROM evidence_items WHERE dataset_id != '{dataset_id}'"
            )

            for t in tables:
                conn.execute(f"DROP TABLE IF EXISTS {t} CASCADE;")
            apply_schema(conn)

            conn.execute("INSERT INTO datasets SELECT * FROM _keep_ds")
            conn.execute("INSERT INTO ingestion_runs SELECT * FROM _keep_ir")
            conn.execute("INSERT INTO transactions SELECT * FROM _keep_tx")
            conn.execute("INSERT INTO account_features SELECT * FROM _keep_af")
            conn.execute("INSERT INTO transaction_features SELECT * FROM _keep_tf")
            conn.execute("INSERT INTO investigation_snapshots SELECT * FROM _keep_snap")
            conn.execute("INSERT INTO evidence_items SELECT * FROM _keep_ev")

            for tmp in ["_keep_ds", "_keep_ir", "_keep_tx", "_keep_af", "_keep_tf", "_keep_snap", "_keep_ev"]:
                conn.execute(f"DROP TABLE IF EXISTS {tmp}")

            with contextlib.suppress(Exception):
                conn.execute("CHECKPOINT;")


        # Optionally remove raw CSV file if no other dataset references it
        if filename:
            try:
                raw_file = settings.project_root / settings.DATA_RAW_DIR / filename
                if raw_file.exists():
                    other_file_ref = conn.execute(
                        "SELECT 1 FROM datasets WHERE filename = ? LIMIT 1",
                        [filename],
                    ).fetchone()
                    if not other_file_ref:
                        raw_file.unlink(missing_ok=True)
            except Exception as fe:
                logger.warning(f"Could not remove raw file {filename}: {fe}")

        logger.info(f"Dataset '{dataset_id}' successfully deleted from DuckDB.")
        return {
            "status": "success",
            "message": f"Dataset '{dataset_id}' and all associated transactions have been deleted.",
        }
    except Exception as e:
        logger.error(f"Failed to delete dataset '{dataset_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete dataset: {e}",
        )


