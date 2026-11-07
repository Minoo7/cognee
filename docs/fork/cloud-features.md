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

Fresh storage, an explicitly empty dedicated env file, native authentication,
SQLite session caching, `AUTO_FEEDBACK=false`, and `IMPROVE_AUTO_ENABLED=false`
were used. Provider credentials were excluded from the subprocess environment;
Hugging Face/model downloads were offline. Two disposable users authenticated via
native registration/login. The owner's two sessions share one dataset:

- Owner: `96037265-c5d3-424b-a604-79772da75371`.
- Dataset: `f6374a02-133b-5d73-8262-43f8d0c32156`.
- Sessions: `activity-A-14b3f6f`, `activity-B-14b3f6f`.

Both Q/A entries were naturally stored by `POST /api/v1/remember/entry`, with
no LLM extraction or automatic improvement. Authenticated session detail returned
the exact question and answer. Only A received an explicit improve request.
It returned **409**, with a naturally captured operation row
`f449efb5-ec1a-4e21-862b-d980fc8a770a`, run
`1f4daf34-761c-4eae-8c3a-d14dd1493dca`, `origin=api`, `outcome=failed`,
`error_class=ValueError`, `background=false`, measured token counts `0`, and
`session_ids=["activity-A-14b3f6f"]`. The fatal Q/A persistence stage could not
load offline model `BAAI/bge-small-en-v1.5`. Vector health is unhealthy for this
same reason. This is failure capture proof, **not successful graph ingestion**.
Typed Q/A cache writes do not emit their own `remember` operation rows here.

B's linked Activity feed remained empty. The browser showed both real transcripts,
A's failed improve, and B's empty recorded-processing view; the Activity links kept
both session and owner. A separate real dataset-only improve with no sessions and
both graph stages disabled returned `status=skipped` and recorded `outcome=noop`.
It was displayed literally, with no session association or completion claim.

Three explicitly named `seeded-*` ledger rows supplement natural capture:
unknown outcome `future_outcome`, nullable/zero metrics, a nullable user, and
background acceptance. They are **synthetic contract fixtures**. They verify literal
rendering and the same-caller/session filter, not native recording of those states.
A regular-member tenant fixture exercises the real `/activity/users` 403 gate.
One request made in the fixture's wrong active tenant also recorded a genuine
permission failure; restoring the dataset's default scope allowed the no-op check.

Verified on the earlier integrated source `1d156bfd` (not revalidated on `31141d094`):

- Focused frontend: **24 suites / 206 tests passed** (188 module/installation tests
  plus 18 explicitly selected route/hook tests). The transport regression jointly
  checks runtime backend URL selection and native recording 401/403 preservation.
- Native API contracts: **28 passed, 3 skipped**; skips require the optional OTEL SDK.
  Isolated installation/source/TLS tests: **10 passed**.
- Production Webpack build: **passed**, including TypeScript and page generation.
  Turbopack was attempted but rejects the existing external `node_modules` symlink.
  Existing middleware, Edge-runtime and Browserslist warnings remain.
- Scoped ESLint: **passed**. Non-archive diff whitespace checks passed; the installation
  archive retains its original patch-file whitespace, as documented in validation.md.
- Actual API: **401** unauthenticated, **403** inaccessible dataset and tenant users,
  unrelated user feed empty, unknown session feed empty, unknown detail **404**,
  invalid `limit=0` rejected with the app's **400** validation response.
- Headless Chromium against the built maintained UI server and real local API:
  natural A/B transcripts and processing, seeded null/zero/unknown/background
  rendering, natural no-op, and expired-auth **401** clearing rows without redirect.
  No page errors or external browser requests occurred.
- API restart: exact operation rows and both cached Q/A payloads persisted. JWT login
  was repeated because the sandbox deliberately uses generated per-process secrets.
- Fresh SQLite migrated to Alembic `dd760c09e075`. No paid LLM/embedding calls,
  production keys/data, Cloud authentication, billing, PR or deployment were used.

Executable harnesses, HTTP receipts, logs, screenshots, isolated dependencies and
disposable storage are retained in `/tmp/cognee-activity-acceptance-14b3f6f/` on
Daytona. `natural-capture.json` and `api-receipts.json` precede synthetic fixtures;
`seeded-fixtures.json`, `api-contract-receipts.json`, `browser-natural.json`,
`browser-contract.json` and `restart-persistence.json` identify later evidence.
The `start_api.py`, `start_frontend.py`, `api_acceptance.py`,
`browser_acceptance.py`, `contract_api_acceptance.py`,
`browser_contract_acceptance.py`, `restart_acceptance.py` and `stop_servers.py`
files are executable Python integration commands. Browser screenshots use
`natural-*`, `seeded-*` and `actual-401-*` names. Task-owned listeners are stopped
after final acceptance; dependencies and records remain for inspection.

### Final source verification: stopped on failure

The clean checkout fast-forwarded to published feature head
`31141d0942b6780cc721af48ecbcffe586cd2b0d`. One exact-path Jest run completed
**27 suites: 26 passed, 1 failed; 278 tests: 277 passed, 1 failed, 0 skipped**.
These counts include the route/components/hooks and installation regressions in the
same run; they do not add overlapping earlier results. All **12 localFetch tests**
passed, including opted-in 401/403, stripping `authErrors`, and default legacy auth
handler dispatch. Those tests mock HTTP and the handler; they are not browser proof.

The blocker is `src/modules/sessions/__tests__/sessionOperations.test.ts:30` under
`cognee-frontend`: its exact fetch-call assertion expects `{ signal }`, while the
reader now sends `{ signal, authErrors: "throw" }`. Verification stopped as instructed,
without application or test edits. Scoped lint, the current production Webpack build,
Python checks and current-source native API/browser acceptance were **not run**.
There is no verified build ID for this source. Earlier API/browser/restart receipts
remain evidence for their earlier source only. Source `31141d094` is **not green**.

The exact command, per-suite counts, failure, source/log hashes, prior natural versus
seeded evidence boundaries and cleanup are in
[receipts/final-verification.json](receipts/final-verification.json). API/UI/TLS ports
8000/3000/3443 have no listeners; dependencies and prior records remain on the sandbox.

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
`experiment/cloud-features` at `31141d0942b6780cc721af48ecbcffe586cd2b0d`, with stable
an ancestor of feature. Publication is verified independently of the failed final
check above. This checkout performs no push; the documentation-only validation
bundle is handed to the parent.
