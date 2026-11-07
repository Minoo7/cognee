# Maintained native TLS source for v1.6.7

Base: `eaa33be5c58cd14584e64e3e0ed2e1479472ee09`. This directory is source
for review and sandbox verification. No OCI/production machine was contacted,
no production secrets or data were used, and no image was built or deployed.
The old host-specific scripts are archived at
`../archive/installation-v1.6.5/`; their compatibility is not implied.

## Entry points

- API: `python -m cognee.api.native_tls`, or `TLS_PORT=8443 python -m cognee.api.client`.
  Both serve the current FastAPI app, preserving its migration/recovery startup,
  background drain, engine close and telemetry flush. The adapter reserves both
  sockets before the single lifespan starts. It drains HTTP requests on both
  listeners before shutting that lifespan down once.
- MCP: `TLS_PORT=8444` enables dual listeners in the current `_serve_with_cors`.
  The current app builder, path routing, Host/Origin guard, CORS and outer task/client
  cleanup remain in place. HTTPS origins for configured hosts are added when TLS
  is enabled; DNS-rebinding protection remains enabled.
- UI: `node server.cjs` after `npm ci` and `npm run build` in `cognee-frontend`.
  It serves HTTP and HTTPS with one Next app and shares preparation and shutdown.
  **Use full production node_modules**, not `.next/standalone/node_modules`:
  Next's standalone tracer omits modules needed by custom servers. The optional
  `native-tls` Dockerfile target installs those production dependencies; the
  default `runner` target remains the upstream standalone server.

`TLS_DIRECTORY` defaults to `/tls/current` with `fullchain.pem` and `privkey.pem`.
Use a matched certificate/key readable by the runtime user. Switch `current`
atomically to a new directory and send SIGHUP to reload. A bad pair is rejected
and the last loaded context remains active. SIGTERM/SIGINT stop acceptance and
finish active requests before closing the application. The API adapter's
`DRAIN_SECONDS` defaults to the preserved 300-second HTTP request grace; keep the
container stop window longer than request drain plus the application's own
background drain. The example retains the historical 330-second stop window.
The API's existing `BACKGROUND_DRAIN_TIMEOUT_SECONDS` remains unchanged (8 seconds).

`HTTP_PORT`/`BIND_ADDRESS` configure the standalone API adapter; the API client
entry point uses upstream `HTTP_API_PORT`/`HTTP_API_HOST`. MCP keeps its existing
CLI/environment transport settings. UI uses `PORT`/`BIND_ADDRESS` and defaults to
3000/3443. The UI reads backend URLs at request time from `COGNEE_BACKEND_URL`;
it must be reachable and trusted **from the browser**. This is not a login proxy.
Configure API CORS for that browser origin, HTTPS cookies, and a stable
`FASTAPI_USERS_JWT_SECRET`. No password is embedded in the frontend. Bootstrap a
local account with operator-chosen `DEFAULT_USER_EMAIL`/`DEFAULT_USER_PASSWORD`;
upstream applies a default password only once to an account without one.

## Image source (not executed here)

From the repository root:

```sh
docker build -t cognee-selfhost-api:1.6.7 .
docker build -f deploy/native-tls/Dockerfile.api -t cognee-selfhost-api-native:1.6.7 .
docker build -f cognee-mcp/Dockerfile -t cognee-selfhost-mcp:1.6.7 .
docker build -f deploy/native-tls/Dockerfile.mcp -t cognee-selfhost-mcp-native:1.6.7 .
docker build --target native-tls -f cognee-frontend/Dockerfile -t cognee-selfhost-ui-native:1.6.7 cognee-frontend
```

**MCP dependency discrepancy:** stock v1.6.7 `cognee-mcp/uv.lock` resolves core
`cognee==1.6.6`, while the root source/lock is 1.6.7. The lock is unchanged.
The MCP native wrapper adds only the shared adapter module at the stock image's
Python 3.12 install path; all other core code remains 1.6.6 there. This is explicit
source installation, not a claim that MCP runs the fork's full 1.6.7 core. The
wrapper and end-to-end Cognee API-mode compatibility still need an image test.
No cached extension override or old MCP lock workaround has been ported.

`compose.example.yml` binds only loopback and uses a fresh named API volume. Supply
an operator-created `.env` with API CORS, stable auth secrets, a chosen bootstrap
account and the MCP `API_TOKEN` for that account. Never reuse production secrets
for a sandbox. The example does not include a certificate issuer, renewal hook,
production hostname, network route, or deployment automation. The archived hook
and its version-specific image patches have not been promoted to this layer.

## Focused sandbox verification

Use an isolated Python environment (no Cognee install or native database is
needed). Reuse the host's dependency caches:

```sh
uv venv /tmp/cognee-selfhost-tests
uv pip install --python /tmp/cognee-selfhost-tests/bin/python \
  uvicorn==0.53.0 starlette==1.6.0 fastmcp==3.4.11 \
  'sqlalchemy[asyncio]==2.0.54' aiosqlite pytest pytest-asyncio ruff
/tmp/cognee-selfhost-tests/bin/pytest -q -o addopts='' \
  --confcutdir=cognee/tests/unit/selfhost --import-mode=prepend cognee/tests/unit/selfhost
```

The explicit `--confcutdir` isolates these tests from the SDK-wide conftest,
which imports the full Cognee stack. The ASGI/MCP tests use disposable
certificates, localhost ports and fixtures.
SQL ownership tests execute the actual function's AST with a disposable SQLite
schema. API/MCP adapter seam tests compile the current source functions rather
than importing the full SDK. These prove the tested seams, not native DB behavior.
For the production UI smoke test, set `SELFHOST_FRONTEND_BUILD` to the built
frontend directory and `SELFHOST_FRONTEND_MODULES` to a directory installed with
`npm ci --omit=dev --ignore-scripts` using its lockfile. That test verifies both
listeners, runtime config, login-page rendering, good/bad TLS reload and shutdown.
Serialize npm installation/build work with `flock /tmp/cognee-fork-build.lock`
and run Jest with `--runInBand` on the shared 4 GiB/2 CPU sandbox.
