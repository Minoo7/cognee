"""Test source functions in isolation; deliberately avoid importing Cognee's DB stack."""

import ast
import logging
import os
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Uuid, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ROOT = Path(__file__).resolve().parents[4]


def source_functions(path, names, namespace):
    tree = ast.parse((ROOT / path).read_text())
    nodes = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names
    ]
    assert len(nodes) == len(names)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)  # noqa: S102
    return namespace


@pytest.mark.asyncio
async def test_membership_query_only_returns_callers_tenants_with_real_ownership(tmp_path):
    class Base(DeclarativeBase):
        pass

    class Tenant(Base):
        __tablename__ = "tenant"
        id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
        name: Mapped[str]
        owner_id: Mapped[UUID]

    class UserTenant(Base):
        __tablename__ = "user_tenant"
        tenant_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
        user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    session_factory = async_sessionmaker(engine)
    caller, other, owned, joined, excluded = [uuid4() for _ in range(5)]
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            session.add_all(
                [
                    Tenant(id=owned, name="Owned", owner_id=caller),
                    Tenant(id=joined, name="Joined", owner_id=other),
                    Tenant(id=excluded, name="Other user", owner_id=other),
                    UserTenant(tenant_id=owned, user_id=caller),
                    UserTenant(tenant_id=joined, user_id=caller),
                    UserTenant(tenant_id=excluded, user_id=other),
                ]
            )
            await session.commit()
        namespace = source_functions(
            "cognee/modules/users/tenants/methods/get_user_tenants.py",
            {"get_user_tenants"},
            {
                "select": select,
                "Tenant": Tenant,
                "UserTenant": UserTenant,
                "User": object,
                "get_relational_engine": lambda: SimpleNamespace(get_async_session=session_factory),
            },
        )
        rows = await namespace["get_user_tenants"](SimpleNamespace(id=caller))
        assert sorted(rows, key=lambda row: row["name"]) == [
            {"id": str(joined), "name": "Joined", "is_owner": False},
            {"id": str(owned), "name": "Owned", "is_owner": True},
        ]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_mcp_tls_uses_current_app_builder_and_awaits_shared_lifespan(monkeypatch):
    adapter = ModuleType("cognee.api.native_tls")
    adapter.listeners_from_env = lambda host, port: (host, port)
    adapter.serve = AsyncMock()
    monkeypatch.setitem(sys.modules, "cognee.api.native_tls", adapter)
    monkeypatch.setenv("TLS_PORT", "8444")
    monkeypatch.setenv("DRAIN_SECONDS", "42")
    app = object()
    calls = []
    namespace = source_functions(
        "cognee-mcp/src/server.py",
        {"_serve_with_cors"},
        {
            "os": os,
            "_build_http_app": lambda *args: calls.append(args) or app,
        },
    )
    await namespace["_serve_with_cors"]("http", "127.0.0.1", 8001, "INFO", "/custom-mcp")
    assert calls == [("http", "127.0.0.1", "/custom-mcp")]
    adapter.serve.assert_awaited_once()
    assert adapter.serve.await_args.args == (app, ("127.0.0.1", 8001), "info")
    assert adapter.serve.await_args.kwargs == {"grace": 42}


def test_api_tls_uses_current_fastapi_app(monkeypatch):
    adapter = ModuleType("cognee.api.native_tls")
    adapter.listeners_from_env = lambda host, port: (host, port)
    adapter.serve = AsyncMock()
    monkeypatch.setitem(sys.modules, "cognee.api.native_tls", adapter)
    monkeypatch.setenv("TLS_PORT", "8443")
    monkeypatch.setenv("DRAIN_SECONDS", "42")
    app = object()
    namespace = source_functions(
        "cognee/api/client.py", {"start_api_server"}, {"os": os, "app": app}
    )
    namespace["start_api_server"]("127.0.0.1", 8000)
    adapter.serve.assert_awaited_once_with(app, ("127.0.0.1", 8000), grace=42)


def test_mcp_tls_adds_https_origins_without_disabling_guard(monkeypatch):
    monkeypatch.setenv("TLS_PORT", "8444")
    monkeypatch.setenv("MCP_ALLOWED_HOSTS", "test.example:*")
    monkeypatch.delenv("MCP_DISABLE_DNS_REBINDING_PROTECTION", raising=False)
    namespace = source_functions(
        "cognee-mcp/src/server.py",
        {"_transport_security_kwargs"},
        {
            "os": os,
            "logger": logging.getLogger("test"),
        },
    )
    config = namespace["_transport_security_kwargs"]("127.0.0.1")
    assert config["host_origin_protection"] is True
    assert "https://test.example:*" in config["allowed_origins"]
    assert "https://localhost:*" in config["allowed_origins"]
