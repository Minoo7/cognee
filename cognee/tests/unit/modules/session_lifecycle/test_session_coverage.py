from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from cognee.modules.session_lifecycle import coverage as c


@pytest.mark.parametrize("value", [None, True, False, -1, "5", 1.5])
def test_malformed_count(value):
    assert c._checkpoint(
        [{"id": c.SESSION_PERSIST_WATERMARK.state_id, "persisted_qa_count": value}],
        c.SESSION_PERSIST_WATERMARK,
    ) == {"state": "malformed"}


@pytest.mark.parametrize("stamp", [None, "bad", True, "2026-11-17T12:00:00"])
def test_valid_zero_invalid_timestamp(stamp):
    result = c._checkpoint(
        [
            {
                "kind": c.SESSION_PERSIST_WATERMARK.state_kind,
                "persisted_qa_count": 0,
                "updated_at": stamp,
            }
        ],
        c.SESSION_PERSIST_WATERMARK,
    )
    assert result == {"state": "recorded", "count": 0, "updated_at": None}


def test_missing_and_expiry_replacement_never_saved():
    assert c._checkpoint([], c.SESSION_PERSIST_WATERMARK) == {"state": "missing"}
    for current, prior, expected in [
        (0, 0, {"state": "difference", "count": 0}),
        (1, 2, {"state": "inconsistent_history"}),
        (2, 1, {"state": "difference", "count": 1}),
        (2, 2, {"state": "difference", "count": 0}),
    ]:
        result = c._category(
            {"state": "counted", "count": current}, {"state": "recorded", "count": prior}
        )
        assert result["comparison"] == expected
        assert "saved" not in str(result) and "caught_up" not in str(result)


@pytest.mark.asyncio
@pytest.mark.parametrize("failed", [None, "context", "qa", "trace", "unavailable"])
async def test_order_and_independent_reads(monkeypatch, failed):
    calls = []
    row = SimpleNamespace(user_id=uuid4(), session_id="same", dataset_id=None)

    async def read(name, **kwargs):
        calls.append(name)
        assert kwargs["user_id"] == str(row.user_id)
        if name == "context":
            assert kwargs["raise_on_error"] is True
        if name == failed:
            raise RuntimeError("PRIVATE BODY")
        return 0 if name == "trace" else []

    sm = SimpleNamespace(
        is_available=failed != "unavailable",
        get_session_context_entries=lambda **kw: read("context", **kw),
        get_session=lambda **kw: read("qa", **kw),
        get_agent_trace_count=lambda **kw: read("trace", **kw),
    )
    monkeypatch.setattr(c, "get_session_manager", lambda: sm)
    result = await c.read_session_coverage(row)
    assert calls == ([] if failed == "unavailable" else ["context", "qa", "trace"])
    for name in ["qa", "trace"]:
        assert result[name]["received"]["state"] == (
            "unavailable"
            if failed == "unavailable"
            else "read_error"
            if failed == name
            else "counted"
        )
        assert result[name]["checkpoint"]["state"] == (
            "unavailable"
            if failed == "unavailable"
            else "read_error"
            if failed == "context"
            else "missing"
        )
    assert "PRIVATE" not in str(result)


@pytest.mark.asyncio
async def test_timeout_does_not_discard_other_category(monkeypatch):
    import asyncio

    async def slow(**kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(c, "READ_TIMEOUT_SECONDS", 0.001)
    monkeypatch.setattr(
        c,
        "get_session_manager",
        lambda: SimpleNamespace(
            is_available=True,
            get_session_context_entries=slow,
            get_session=AsyncMock(return_value=[]),
            get_agent_trace_count=AsyncMock(return_value=3),
        ),
    )
    result = await c.read_session_coverage(
        SimpleNamespace(user_id=uuid4(), session_id="s", dataset_id=None)
    )
    assert result["qa"]["checkpoint"]["state"] == "read_error"
    assert result["trace"]["received"] == {"state": "counted", "count": 3}
