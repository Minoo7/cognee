import ast
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


def record(value):
    with open(os.environ['EVENTS'], 'a') as stream:
        stream.write(value + '\n')


@asynccontextmanager
async def lifespan(app):
    record('startup')
    if os.environ.get('FAIL_START'):
        raise RuntimeError('Intentional startup failure')
    yield {'identity': 'one-owner'}
    record('shutdown')


async def endpoint(request):
    if request.url.path == '/slow':
        record('request')
        await asyncio.sleep(1)
    return JSONResponse({'pid': os.getpid(), 'identity': request.state.identity})


app = Starlette(routes=[Route('/identity', endpoint), Route('/slow', endpoint)], lifespan=lifespan)

if os.environ.get('MCP_FIXTURE'):
    import fastmcp
    import uvicorn
    from fastmcp import FastMCP
    from fastmcp.server.http import HostOriginGuardMiddleware
    from starlette.middleware import Middleware
    from starlette.middleware.cors import CORSMiddleware
    mcp = FastMCP('isolated')
    @mcp.tool
    def ping() -> str:
        return 'isolated'
    logger = logging.getLogger('fixture')
    tree = ast.parse(Path('/opt/cognee-mcp/src/server.py').read_text())
    names = {'_transport_security_kwargs', '_get_cors_origins', '_build_http_app'}
    subset = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
    exec(compile(subset, '<original MCP transport functions>', 'exec'), globals())
    app = _build_http_app('http', '0.0.0.0', '/mcp')
