# Native self-hosted feature experiment

This feature branch includes v1.6.7 (`eaa33be5c58cd14584e64e3e0ed2e1479472ee09`),
the published Activity commit `14b3f6f22e69fee4a8ef1f2017bce67e5fdc74e1`, and the
installation layer `selfhost/stable` at `31e36259aa8a3fc696fdff140feb1bd5f9b9174b`,
integrated with a non-fast-forward merge. Published history was preserved.
Activity uses the existing Python API and local authentication; it adds no backend
ledger, Cloud authentication, billing integration, or optional custom memory UI.
The installation layer retains its native TLS/runtime configuration changes; no deployment was run.

| Surface | State | Native boundary / remaining work |
| --- | --- | --- |
| Activity | Implemented | Raw operation and pipeline rows from `GET /api/v1/activity/pipeline-runs`; Refresh and Load more, 50 rows per page, typed read failures, partial/stale states, null metrics retained. |
| Session recorded processing | Implemented with attribution limits | Explicit session links plus a same-caller check: run `user_id` is the caller, not a stored composite session-owner association. This can omit work triggered by a parent account. Older children linked only through parent operations are not reconstructed. Detail/history requests are independent and cancellable; stored detail status and computed list status are separate. |
| API-key management | Deferred, native API backed | Native key endpoints need a scoped CRUD UI and permission handling. |
| Analytics | Deferred, native API backed | Native recorded usage can support a future view with explicit coverage and aggregation semantics. No fabricated prices or savings. |
| Memory Coverage | Not implemented | Needs a defined job/service and coverage semantics; activity rows alone cannot establish coverage. |
| Slack controls | Not implemented | Requires a connector/control service and explicit setup. |
| Billing | Not implemented | No Stripe or Cloud control-plane dependency. |

## Meaning of recorded processing

`modules/sessions/sessionOperations.ts` is the thin native reader and pure selection boundary.
`useSessionProcessing.ts` owns independent detail/history state; Activity shares its feed hook.
Requests use LocalCognee's existing `/v1/...` transport, which mounts under `/api/v1`.
The native feed is a bare array; a full 50-row page permits Load more, a shorter page ends
currently accessible paging. Rows are deduplicated by row ID across pages. Offset paging
has no snapshot cursor or total: concurrent inserts can shift offsets and omit or repeat
records. Refresh starts again at the newest page; no completeness claim is made.

Session history requests send `session_id`, then recheck **both** returned `user_id` and
`session_ids` against the selected owner and session. Run `user_id` identifies the caller;
matching it to the selected owner is an assumption, not a backend composite ownership
relation. It may omit parent-account-triggered work. Older child records linked only
through a parent operation are not reconstructed. Dataset identity, temporal proximity,
and unstamped rows never prove association. Datasetless and multi-session records work.
The processing view keeps the newest recorded state per explicit pipeline run ID; Activity
preserves every row. Parent operation IDs refer to run IDs, not row IDs. No parent/child
usage sums, inferred completion percentages, or five-minute burst grouping are performed.

The session detail endpoint accepts only a session ID, without an owner discriminator.
Native detail returns stored `status`, without the list endpoint's computed
`effective_status`. The panel labels it **Session recorded status**. Live acceptance
found and fixed a strict-reader bug that rejected this valid response; regression
fixtures now match the actual detail payload.
When identical session IDs exist for different owners, the UI rejects a returned owner
mismatch with an explicit error; it never displays another owner's detail as the selected
session. History can still load independently. Supporting arbitrary owner-specific detail
retrieval requires a separate backend contract change, outside this experiment.

Status/outcome values are displayed literally, including `noop`, future/unknown strings,
and null (not recorded). `background` is metadata, not a universal lifecycle rule. Generic
background `succeeded` can record acceptance/start; native improve uses a deferred close
until the detached call finishes. Neither establishes completion of every best-effort child
stage or the entire graph lifecycle. Failures do not prove that no memory was saved.
`INITIATED` is a recorded state, not evidence of a scheduled job.

Null metrics mean not measured; zero means measured zero. The new Activity view adds no
cost estimates or savings. Session detail shows its recorded cost, including unknown and
zero, and no longer prices token counts using a Cloud gateway rate. The session header
no longer shows an estimated aggregate price or a success percentage. Native stats
return `success_rate=1` when no sessions have finished; displaying that as success
misrepresented the running sessions observed during acceptance.

Recording is best-effort, and historical associations were not backfilled. An empty view
says **No linked processing records available**, never that saving failed. The native
session detail returns only the latest **20 Q&As and 20 traces**, with counts over a wider
cache history. Cache/read failures can return empty content without a degradation flag;
this UI discloses that limitation. The session list retains its existing range/page limits.

Same-scope refresh failures retain rows with a stale warning; switching session, owner or
instance clears visible state and cancels/rejects old responses. Detail and history errors
have independent Retry controls. Recording reads preserve native HTTP 401/403 so these
views can show sign-in-required/permission-denied messages without treating denial as an
empty history. Access denial clears the affected resource's cached display.

## Verification receipts

Focused Jest/RTL tests cover shared-dataset A/B separation, identical IDs with different
owners, datasetless and multi-session records, missing historical links, null/zero,
noop/unknown/background metadata, explicit state collapse across pages, row-ID deduplication,
late responses, cancellation, independent detail/history errors, 401/403, stale refresh,
and native session/Activity links. Tests use fixtures and mocked HTTP responses, not a live API.

Commands (from `cognee-frontend`):

```sh
./node_modules/.bin/jest --runInBand --runTestsByPath \
  'src/modules/sessions/__tests__/sessionOperations.test.ts' \
  'src/app/(app)/sessions/partials/__tests__/useSessionProcessing.test.tsx' \
  'src/app/(app)/sessions/__tests__/recordedSession.test.tsx' \
  'src/app/(app)/activity/__tests__/activity.test.tsx' \
  src/modules/instances/__tests__/localFetch.test.ts
flock /tmp/cognee-fork-build.lock env NODE_OPTIONS=--max-old-space-size=2304 npm run build -- --webpack
```

Build/install work shares `/tmp/cognee-fork-build.lock` with the installation checkout.
The sandbox has 4 GiB and 2 CPUs; Jest runs in-band. Frontend dependencies are reused via
an ignored local `node_modules` link; no duplicate installation or dependency cache is created.
Webpack is used for this production build with the shared dependency tree.

The initial missing-dependency blocker was resolved with the actual lockfile's core
requirements and empty `api` extra, without `--all-extras` or lockfile edits:

```sh
flock /tmp/cognee-fork-build.lock env \
  UV_PROJECT_ENVIRONMENT=/tmp/cognee-activity-acceptance-14b3f6f/venv \
  uv sync --frozen --no-dev --extra api
```

### Final source verification: passed defined gates

The clean checkout fetched public `Minoo7/cognee` and fast-forwarded from
`922238acc78fa50413160a0640a0ef1667baffe8` to the exact tested source
`d424820014404663d5562186858430c6d15c68d7`. The only correction since the failed
validator was the request-options assertion requiring `authErrors: "throw"`;
application implementation was unchanged. The failed receipt remains in Git history
at `922238acc`. This verification made no app or test source changes.

- Targeted sessionOperations precheck: **14 passed**. Full exact-path frontend gate:
  **27 suites / 278 tests passed, 0 failed, 0 skipped**. The precheck overlaps the full
  gate and is not added to its total. All **12 localFetch cases** passed, including
  opt-in 401/403, option stripping and default legacy stats/detail/DELETE/dashboard
  auth-handler delegation. These are mocked transport/handler tests, not separate
  live-browser legacy redirect proof.
- Scoped ESLint: **passed**, covering maintained frontend source changed against
  v1.6.7. Production Webpack build: **passed**, including TypeScript and page
  generation, build ID `Kn8Z_iChu1FKvA9T888YK`. The build held the shared lock,
  limited Node heap to 2304 MiB and used two page workers within 4 GiB / 2 CPUs.
  Existing middleware deprecation, Edge-runtime and Browserslist warnings remain.
- Fresh native API and built Chromium acceptance: **passed**. Both Q/A entries were
  naturally stored with `POST /api/v1/remember/entry` for sessions A/B sharing one
  dataset. Both native detail responses omitted `effective_status` and rendered the
  stored session status and transcript. Only A received explicit improve; B's feed
  remained empty before and after seeded fixtures and dataset-only no-op.
- A's improve returned the expected **409** because offline embedding model
  `BAAI/bge-small-en-v1.5` was unavailable. Its natural failed/ValueError record and
  measured zero tokens rendered literally. A separate real dataset-only improve
  returned `status=skipped` and recorded `outcome=noop`, displayed literally.
  Successful graph improvement is **not established**.
- Expired native authentication returned **401** on Refresh, cleared Activity rows,
  kept the view on Activity, and showed a working **Sign in** link to `/local-login`.
  A real native **403** displayed permission text with no rows. For that browser
  case only, the external harness added an inaccessible `dataset_id` to the outgoing
  native feed request under outsider login and forwarded the actual native response
  unchanged; the maintained view does not offer that dataset filter.
- Three explicitly `seeded-*` ledger rows exercise unknown outcome, null/zero,
  nullable caller and background rendering; a regular-member tenant fixture tests
  the native tenant-users 403 gate. These are synthetic contract fixtures, not
  natural agent capture. API 401/403/404/400, outsider isolation and unknown-session
  emptiness also passed. The eight browser cases produced no page errors or
  external browser requests.

The current replay uses fresh private storage at
`/tmp/cognee-activity-acceptance-14b3f6f/verification-d424/`; all earlier storage and
receipts remain intact. Existing venv and shared node_modules were reused. The API
ran with an empty dedicated env file, a minimal environment without provider keys,
native authentication/access control, SQLite cache, `CACHING=true`,
`AUTO_FEEDBACK=false`, `IMPROVE_AUTO_ENABLED=false`, and offline model loading.
Disposable auth was generated solely by the existing harness and stayed private.
No dependencies/models were downloaded and no paid provider was called.

**Reused earlier proof, not rerun:** native API tests **28 passed / 3 optional-OTEL
skips**, isolated installation tests **10 passed**, and real restart persistence
of exact operation rows and both Q/A payloads belong to source
`1d156bfdff0db9e0b41fbfad779d33d9ec3f0b5e`, including stable `31e36259`.
Backend, installation scripts, `server.cjs` and `next.config.ts` have no changes
between that source and d424. This earlier evidence is distinct from the fresh
current-build API/browser acceptance above.

[receipts/final-verification.json](receipts/final-verification.json) contains the
exact commands, suite counts, build ID, new/reused evidence boundaries, screenshot
names/hashes and cleanup. [The native summary](receipts/final-verification-native.json)
and small text logs contain sanitized results only. Executable harnesses, raw private
sandbox evidence and screenshots remain outside Git. API/UI/TLS ports 8000/3000/3443
are stopped; owned browser tabs are closed; dependencies and all fixture data remain.
No images, binaries, raw databases or authentication values are committed.

Other-caller/parent-account work may be absent because `user_id` identifies the caller;
legacy children linked only through a parent operation are not reconstructed. These
limits remain visible. API-key management, Analytics and other Cloud features remain
deferred; the optional memory UI is excluded. Docker/MCP image builds and MCP lock
alignment remain unverified. No production/Mac access, deployment, push or PR occurred.

## Publication and integration

The sandbox GitHub helper's earlier **403** was bypassed through source-only bundle
transfer to the parent, which published the exact original `14b3f6f` commit using
its existing owner CLI. The parent reports successful GitHub remote readback.
No credentials were transferred, renewed or collected, and no Git push was retried.
The original verified bundle was 22,062 bytes, SHA-256
`645234d50d78c6ff79873a6a4e4027c11fe0e1794d2bd6564ec318d608e3a07f`.

The current feature branch preserves that published commit, includes runtime fix
`adaf47a44`, and merges `selfhost/stable` at `31e36259aa8a3fc696fdff140feb1bd5f9b9174b`
with `--no-ff`. Runtime URL configuration and Activity/Sessions typed denial handling
are both retained. The installation checkout and `main` were not edited.
The earlier integrated heads were exported together for parent publication with:

```sh
git bundle create /tmp/cognee-fork-integrated.bundle \
  selfhost/stable experiment/cloud-features \
  ^eaa33be5c58cd14584e64e3e0ed2e1479472ee09
git bundle verify /tmp/cognee-fork-integrated.bundle
git bundle list-heads /tmp/cognee-fork-integrated.bundle
sha256sum /tmp/cognee-fork-integrated.bundle
curl --connect-timeout 10 --max-time 120 --fail-with-body --silent --show-error \
  --data-binary @/tmp/cognee-fork-integrated.bundle \
  http://100.97.84.7:18762/stable-v1.6.7.bundle
```

The integrated bundle heads/hash and receiver receipt are recorded separately in
`/tmp/cognee-activity-acceptance-14b3f6f/integrated-transfer.json`, so the bundle
never contains its own changing hash. Public GitHub fetch and `ls-remote` now verify
`selfhost/stable` at `31e36259aa8a3fc696fdff140feb1bd5f9b9174b` and
`experiment/cloud-features` at `d424820014404663d5562186858430c6d15c68d7`, with stable
an ancestor of feature. The managed GitHub direct-push helper's **403 remains
unrepaired**; the parent published all source refs. This checkout performs no push.
The docs/receipts commit is handed to the prepared private receiver as a source-only
bundle with range `d424820014404663d5562186858430c6d15c68d7..experiment/cloud-features`.
Its verified head, SHA-256 and receiver response are recorded outside the bundle at
`/tmp/cognee-activity-acceptance-14b3f6f/verification-d424/verified-transfer.json`.
The parent publishes that commit by fast-forward; the receiver writes only to its
new OCI run's incoming directory and provides no production access.
