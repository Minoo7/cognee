from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cognee.api.v1.sessions.routers import get_sessions_router as m


def test_owner_required_and_concealed_404(monkeypatch):
    uid = uuid4()
    owner = uuid4()
    app = FastAPI()
    app.include_router(m.get_sessions_router(), prefix="/api/v1/sessions")
    app.dependency_overrides[m.get_authenticated_user] = lambda: SimpleNamespace(id=uid)
    monkeypatch.setattr(m, "get_visible_user_ids", AsyncMock(return_value=[uid]))
    monkeypatch.setattr(m, "get_permitted_dataset_ids", AsyncMock(return_value=[]))
    selector = AsyncMock(return_value=None)
    monkeypatch.setattr(m, "get_session_row", selector)
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    app.add_exception_handler(
        RequestValidationError,
        lambda request, exc: JSONResponse(status_code=400, content={"detail": "global handler"}),
    )
    client = TestClient(app)
    assert client.get("/api/v1/sessions/s/coverage").status_code == 400
    assert client.get("/api/v1/sessions/s/coverage?owner_id=bad").status_code == 400
    for sid in ["wrong-owner", "invisible", "missing"]:
        response = client.get(f"/api/v1/sessions/{sid}/coverage?owner_id={owner}")
        assert response.status_code == 404 and response.json() == {"detail": "session not found"}
        assert selector.call_args.kwargs == {
            "session_id": sid,
            "user_id": uid,
            "user_ids": [uid],
            "permitted_dataset_ids": [],
            "owner_id": owner,
        }


def test_success_uses_authorized_row_and_generic_failure(monkeypatch):
    from cognee.modules.session_lifecycle import coverage

    uid = uuid4()
    row = SimpleNamespace(user_id=uid, session_id="agent/run", dataset_id=None)
    app = FastAPI()
    app.include_router(m.get_sessions_router(), prefix="/api/v1/sessions")
    app.dependency_overrides[m.get_authenticated_user] = lambda: SimpleNamespace(id=uid)
    monkeypatch.setattr(m, "get_visible_user_ids", AsyncMock(return_value=[uid]))
    monkeypatch.setattr(m, "get_permitted_dataset_ids", AsyncMock(return_value=[]))
    monkeypatch.setattr(m, "get_session_row", AsyncMock(return_value=row))
    reader = AsyncMock(return_value={"owner_id": str(uid)})
    monkeypatch.setattr(coverage, "read_session_coverage", reader)
    client = TestClient(app)
    assert client.get(f"/api/v1/sessions/agent%2Frun/coverage?owner_id={uid}").json() == {
        "owner_id": str(uid)
    }
    reader.assert_awaited_once_with(row)
    monkeypatch.setattr(m, "get_session_row", AsyncMock(side_effect=RuntimeError("private body")))
    response = client.get(f"/api/v1/sessions/s/coverage?owner_id={uid}")
    assert response.status_code == 500 and response.json() == {"error": "coverage_read_error"}
