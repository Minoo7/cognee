import asyncio
from datetime import datetime, timezone

from cognee.infrastructure.session.get_session_manager import get_session_manager
from cognee.infrastructure.session.session_persist_watermark import (
    SESSION_PERSIST_WATERMARK,
    TRACE_PERSIST_WATERMARK,
)
from cognee.shared.logging_utils import get_logger

logger = get_logger("session_coverage")
READ_TIMEOUT_SECONDS = 5


def _checkpoint(rows, watermark):
    row = watermark.find_row(rows)
    if row is None:
        return {"state": "missing"}
    count = row.get(watermark.field)
    if type(count) is not int or count < 0:
        return {"state": "malformed"}
    updated_at = row.get("updated_at")
    try:
        parsed = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        updated_at = parsed.isoformat() if parsed.tzinfo is not None else None
    except (AttributeError, TypeError, ValueError):
        updated_at = None
    return {"state": "recorded", "count": count, "updated_at": updated_at}


def _category(received, checkpoint):
    comparison = {"state": "not_comparable"}
    if received["state"] == "counted" and checkpoint["state"] == "recorded":
        delta = received["count"] - checkpoint["count"]
        comparison = (
            {"state": "difference", "count": delta}
            if delta >= 0
            else {"state": "inconsistent_history"}
        )
    return {"received": received, "checkpoint": checkpoint, "comparison": comparison}


async def read_session_coverage(row):
    sm = get_session_manager()
    identity = {"user_id": str(row.user_id), "session_id": row.session_id}
    qa = trace = {"state": "unavailable"}
    qa_checkpoint = trace_checkpoint = {"state": "unavailable"}
    if sm.is_available:
        try:
            rows = await asyncio.wait_for(
                sm.get_session_context_entries(**identity, raise_on_error=True),
                READ_TIMEOUT_SECONDS,
            )
            if not isinstance(rows, list):
                raise ValueError("invalid context result")
            qa_checkpoint = _checkpoint(rows, SESSION_PERSIST_WATERMARK)
            trace_checkpoint = _checkpoint(rows, TRACE_PERSIST_WATERMARK)
        except Exception:
            logger.exception("coverage checkpoint read failed")
            qa_checkpoint = trace_checkpoint = {"state": "read_error"}
        try:
            entries = await asyncio.wait_for(
                sm.get_session(**identity, formatted=False), READ_TIMEOUT_SECONDS
            )
            if not isinstance(entries, list):
                raise ValueError("invalid Q/A result")
            qa = {"state": "counted", "count": len(entries)}
        except Exception:
            logger.exception("coverage Q/A read failed")
            qa = {"state": "read_error"}
        try:
            count = await asyncio.wait_for(
                sm.get_agent_trace_count(**identity), READ_TIMEOUT_SECONDS
            )
            if type(count) is not int or count < 0:
                raise ValueError("invalid trace result")
            trace = {"state": "counted", "count": count}
        except Exception:
            logger.exception("coverage trace read failed")
            trace = {"state": "read_error"}
    return {
        "session_id": row.session_id,
        "owner_id": str(row.user_id),
        "dataset_id": str(row.dataset_id) if row.dataset_id is not None else None,
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "qa": _category(qa, qa_checkpoint),
        "trace": _category(trace, trace_checkpoint),
    }
