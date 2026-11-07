import hashlib
from pathlib import Path

for name in ["/opt/cognee-mcp/src/server.py", "/app/.venv/lib/python3.12/site-packages/src/server.py"]:
    path = Path(name)
    source = path.read_text()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == '0f16a14171143e8171192cc5bdf5490c8c848acbc8ac6300e4b651f1f6a1bf46'
    path.write_text(source.replace('    config = uvicorn.Config(\n        app,\n        host=host,\n        port=port,\n        log_level=log_level.lower(),\n    )\n    server = uvicorn.Server(config)\n    await server.serve()', '    from native_tls import listeners_from_env, serve\n\n    await serve(app, listeners_from_env(host, port), log_level.lower())', 1))

    path.write_text(path.read_text().replace(
        'allowed_origins = localhost_origins + [f"http://{h}" for h in extra_hosts]',
        'allowed_origins = localhost_origins + [f"https://{h}" for h in localhost_hosts] + [f"{scheme}://{h}" for h in extra_hosts for scheme in ("http", "https")]', 1))
