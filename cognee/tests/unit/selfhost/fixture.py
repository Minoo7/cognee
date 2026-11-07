"""Disposable ASGI fixture; no Cognee database, credentials, or provider calls."""

import asyncio
import os
from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


def record(value):
    with open(os.environ["EVENTS"], "a") as stream:
        stream.write(value + "\n")


@asynccontextmanager
async def lifespan(app):
    record("startup")
    if os.environ.get("FAIL_START"):
        raise RuntimeError("Intentional startup failure")
    await asyncio.sleep(float(os.environ.get("START_DELAY", "0")))
    yield {"identity": "one-owner"}
    record("background-drain")
    await asyncio.sleep(0.1)
    record("engines-closed")
    record("shutdown")


async def endpoint(request):
    if request.url.path == "/slow":
        record("request")
        await asyncio.sleep(0.5)
    return JSONResponse({"pid": os.getpid(), "identity": request.state.identity})


app = Starlette(routes=[Route("/identity", endpoint), Route("/slow", endpoint)], lifespan=lifespan)


if os.environ.get("MCP_FIXTURE"):
    import ast
    import logging
    from pathlib import Path

    import fastmcp
    from fastmcp import FastMCP
    from fastmcp.server.http import HostOriginGuardMiddleware
    from starlette.middleware import Middleware
    from starlette.middleware.cors import CORSMiddleware

    mcp = FastMCP("isolated")

    @mcp.tool
    def ping() -> str:
        return "isolated"

    logger = logging.getLogger("fixture")
    tree = ast.parse((Path(__file__).resolve().parents[4] / "cognee-mcp/src/server.py").read_text())
    names = {"_transport_security_kwargs", "_get_cors_origins", "_build_http_app"}
    subset = ast.Module(
        body=[
            node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names
        ],
        type_ignores=[],
    )
    exec(compile(subset, "<MCP transport source functions>", "exec"), globals())  # noqa: S102
    app = globals()["_build_http_app"]("http", "0.0.0.0", "/mcp")
