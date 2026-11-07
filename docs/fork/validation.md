# Installation validation

Sandbox: Daytona Linux, Python 3.14.2, Node 24.21.0, npm 11.19.0. Actual cgroup
limits are 4 GiB RAM / 2 CPUs (the initial host-level `free` output is larger).
Initial filesystem free space was about 19 GiB. All commands below used
`/home/daytona/cloud/worktree`; the Activity checkout was not edited.

## Frontend dependencies and focused tests

In `cognee-frontend`, `npm ci --no-audit --no-fund` succeeded. The first install
and build preceded the resource-coordination instruction; subsequent npm
installation/build work used `/tmp/cognee-fork-build.lock`. Jest was serial:

```sh
npx jest --runInBand \
  src/modules/tenant/__tests__/localTenantApi.test.ts \
  src/modules/tenant/__tests__/createWorkspace.test.ts \
  src/modules/tenant/__tests__/LocalProvider.isOwner.test.tsx \
  src/modules/config/__tests__ \
  src/modules/users/__tests__/getLocalApiUrl.test.ts \
  src/modules/users/__tests__/getLocalUser.test.ts \
  src/modules/users/__tests__/getUser.test.ts \
  src/modules/users/__tests__/useCurrentUser.test.tsx \
  src/app/api/__tests__/authenticatedProxies.test.ts \
  src/ui/layout/__tests__/NameWorkspaceModal.test.tsx \
  src/ui/layout/__tests__/TopBarUserName.test.tsx \
  src/ui/layout/__tests__/FilterContext.test.tsx \
  src/modules/instances/__tests__/localFetch.test.ts
```

Result: **14 suites, 82 tests passed**. These cover membership ownership,
personal/team selection, workspace creation, identity, runtime URL readers,
credential forwarding and unauthenticated proxy denials, plus retained upstream
profile/workspace/error behavior. No browser automation or live authenticated
Cognee/native-database flow was run.

## Production build

From the repository root:

```sh
flock /tmp/cognee-fork-build.lock env CIRCLE_NODE_TOTAL=3 \
  NODE_OPTIONS=--max-old-space-size=1536 npm --prefix cognee-frontend run build
```

Result: **passed**, Next 16.3.8/Turbopack, TypeScript passed, page generation used
2 workers. `CIRCLE_NODE_TOTAL=3` yields 2 workers in this pinned Next version.
Upstream warnings remain for the deprecated middleware convention and outdated
Browserslist data. The initial build caught a modal fixture missing the new
mode; the fixture was corrected before the passing builds.

## Isolated Python and production UI runtime

An isolated venv was created with `uv venv /tmp/cognee-selfhost-tests` and:

```sh
uv pip install --python /tmp/cognee-selfhost-tests/bin/python \
  uvicorn==0.53.0 starlette==1.6.0 fastmcp==3.4.11 \
  'sqlalchemy[asyncio]==2.0.54' aiosqlite pytest pytest-asyncio ruff
```

The frontend package and lockfile were copied into `/tmp/selfhost-native-ui-deps`,
then production dependencies were installed using the existing shared npm cache:

```sh
flock /tmp/cognee-fork-build.lock npm ci --omit=dev --ignore-scripts \
  --no-audit --no-fund --prefix /tmp/selfhost-native-ui-deps
SELFHOST_FRONTEND_BUILD=/home/daytona/cloud/worktree/cognee-frontend \
SELFHOST_FRONTEND_MODULES=/tmp/selfhost-native-ui-deps/node_modules \
/tmp/cognee-selfhost-tests/bin/pytest -q -o addopts='' \
  --confcutdir=cognee/tests/unit/selfhost --import-mode=prepend \
  cognee/tests/unit/selfhost
```

Result: **10 tests passed**. Covered: shared ASGI identity/lifespan, HTTPS
redirects, good/bad certificate reload, active-request drain, port reservation
before startup, startup failure, SIGINT during startup, MCP sessions crossing
HTTP/TLS with invalid Host/Origin rejected, source API/MCP wiring, actual tenant
query against disposable SQLite, and production UI HTTP/TLS runtime config,
login rendering, reload and graceful exit. The UI smoke uses full production
dependencies: the first standalone-only attempt failed because Next's tracer
omitted `next/dist/compiled/webpack/webpack-lib`. The maintained custom-server
image target uses the tested full-dependency layout.

`--confcutdir` and prepend import mode avoid importing the full SDK test
conftest; source seams are compiled from this checkout. No native DB engine,
LLM, external application, or production credential was involved. The test
certificates are generated locally and are not committed. Pytest emitted a
fixture-loop-scope deprecation warning; tests passed.

## Lint and preservation checks

ESLint was run against all changed/new frontend TypeScript/TSX and `server.cjs`.
Ruff check/format cover `cognee/api/native_tls.py`, the changed API/MCP files,
`get_user_tenants.py`, and `cognee/tests/unit/selfhost/`. Archived source is kept
byte-for-byte rather than reformatted. `git diff --cached --check -- .
':!deploy/archive/**'` is clean. The full check reports six existing trailing
spaces in the two preserved patch files; those bytes are intentionally retained
and match their archived hashes. Root `Dockerfile`, root `uv.lock`, and
`cognee-mcp/uv.lock` match v1.6.7.

Docker is unavailable, so Dockerfiles/Compose are source-only and unbuilt.
Full SDK suites, real user login/workspace integration, API-mode MCP against the
mixed core version, native DB runtime, certificate issuance/renewal automation
and production rollout remain unverified. No deployment or PR was created.
