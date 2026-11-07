# Native self-hosted feature experiment

This fork experiment starts at v1.6.7 (`eaa33be5c58cd14584e64e3e0ed2e1479472ee09`).
It uses the existing Python API and native local authentication. It adds no backend ledger,
Cloud authentication, billing integration, optional custom memory UI, or deployment changes.

| Surface | State | Native boundary / remaining work |
| --- | --- | --- |
| Activity | Implemented | Raw operation and pipeline rows from `GET /api/v1/activity/pipeline-runs`; Refresh and Load more, 50 rows per page, typed read failures, partial/stale states, null metrics retained. |
| Session recorded processing | Implemented | Explicit `(user_id, session_id)` associations only, independent cancellable detail/history requests, exact owner/session Activity links. Effective session status is separate. |
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
`session_ids` against the selected owner and session. Dataset identity, temporal proximity,
and unstamped rows never prove association. Datasetless and multi-session records work.
The processing view keeps the newest recorded state per explicit pipeline run ID; Activity
preserves every row. Parent operation IDs refer to run IDs, not row IDs. No parent/child
usage sums, inferred completion percentages, or five-minute burst grouping are performed.

The session detail endpoint accepts only a session ID, without an owner discriminator.
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
no longer shows an estimated aggregate price.

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

A real native API import was attempted with a clean environment, native authentication
required, disposable `/tmp/cognee-activity-runtime-*` storage, and no LLM/provider keys.
The available Python environment (`/tmp/cognee-selfhost-tests`) fails before API startup:
`ModuleNotFoundError: No module named 'structlog'`; an explicit availability check also
found `fastapi` missing. No live API/browser/restart/cache-unavailability or permission
proof is claimed. Full runtime dependencies and native authenticated disposable sessions
are required to perform that remaining acceptance check. No production data, credentials,
OCI resources, or deployment were accessed.

The targeted existing Python activity/session contract tests were also attempted:

```sh
/tmp/cognee-selfhost-tests/bin/python -m pytest \
  cognee/tests/unit/api/test_get_activity_router_pipeline_runs.py \
  cognee/tests/unit/api/test_get_sessions_router_with_agent_info.py -q
```

They could not collect because `cognee/tests/conftest.py` imports Cognee, which requires
missing `structlog`. This is a blocked check, not a passing backend verification.

Verified in this sandbox:

- Focused Jest/RTL: **5 suites, 36 tests passed** (mocked HTTP/fixtures).
- Session module regressions: **7 suites, 104 tests passed**; this includes the new adapter suite.
- Scoped ESLint over changed Activity/Sessions files, adapter, fixtures and native transport:
  **exit 0, no warnings/errors**. `git diff --check` also passed.
- Production `npm run build -- --webpack` under the shared lock: **exit 0**, including
  TypeScript and static generation; `/activity` and `/sessions` are in the route output.
  Existing Next Edge-runtime and outdated Browserslist warnings remain.
- Native API startup and Python contract tests: **blocked**, as detailed above.
- Finish-time `git fetch fork refs/heads/selfhost/stable:refs/remotes/fork/selfhost/stable`:
  `fatal: couldn't find remote ref refs/heads/selfhost/stable`. No unpublished local work
  from the installation checkout was imported; integration parent remains v1.6.7.

Raw sandbox logs are `/tmp/cloud-features-jest.log`, `/tmp/cloud-features-session-regressions.log`,
`/tmp/cloud-features-lint.log`, `/tmp/cloud-features-build.log`, `/tmp/cloud-features-runtime.log`,
`/tmp/cloud-features-python-contracts.log`, and `/tmp/cloud-features-fetch.log`.

Publishing was attempted only to `Minoo7/cognee`, new branch `experiment/cloud-features`,
through the existing prepared helper `/home/daytona/cloud-control/github/bin/git-credential-t3-github`.
GitHub rejected the write:

```text
remote: Permission to Minoo7/cognee.git denied to Minoo7.
fatal: unable to access 'https://github.com/Minoo7/cognee.git/': The requested URL returned error: 403
```

A read-only repository metadata check through the prepared `gh` helper reports account
`permissions.push: true`, but that does not resolve the Git write rejection. The helper
has no renewal command in this sandbox. Restoring the managed GitHub grant's write access
is an external blocker. Remote readback via `git ls-remote fork
refs/heads/experiment/cloud-features` returns no branch. No force push, PR or deployment
was performed. Local `main` remains `8853378eae5366addb064e758e560a456146ae1a`.
Publishing logs: `/tmp/cloud-features-push.log`, `/tmp/cloud-features-fork-permissions.log`,
and `/tmp/cloud-features-remote-readback.log`.
