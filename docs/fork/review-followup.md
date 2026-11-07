# Review follow-up

The independent review examined Activity commit `14b3f6f22` against upstream v1.6.7. It did not examine installation commit `31e36259`, which was not yet available in its OCI source repository.

## Resolved findings

- The real detail endpoint omits `effective_status`. Runtime contract fix `adaf47a44` removed that requirement and separated the detail type from list-only fields. The native API and built browser accepted the actual response.
- Authentication errors now use an explicit per-request `authErrors: "throw"` option. Only the new readers opt in. The local transport strips the option before browser fetch. Existing session stats, legacy detail, deletion and dashboard callers retain their original authentication handler.
- Unauthorized recording views provide a sign-in link. Network and permission failures retain their distinct messages.
- Invalid transcript timestamps retain the previous zero fallback. Cost display retains four decimal places.
- Components now describe recorded processing and recorded rows. The selector names its latest-row projection. The unused session cost estimator and its implementation-only tests were removed.
- Narrating and stale comments identified in the review were removed.

## Deliberate boundaries

The session association stored by upstream is a session string. A run's `user_id` identifies its caller. This view requires that caller to match the selected session owner and requires an explicit session link. It may omit processing initiated by another account. It does not claim a composite ownership relation stored by the backend.

Older children linked only through a parent operation are not reconstructed. The interface discloses this incomplete history. Adding a historical join needs pagination and provenance work rather than another dataset or time-window guess.

The instance-object effect dependency remains. Current local consumers receive a stable instance. Resubscribing when a provider replaces that object also preserves changed transport credentials. An unstable object constructed by a hypothetical caller does not establish a loop in the actual provider; the real browser acceptance did not loop.

`EnrichmentStatus` remains because upstream's `RunStatus` union still references it. The review's claim that it had no consumer was contradicted by the source.

## Verification and publication

The first source transfer preserved `14b3f6f22` exactly. The second preserved installation `31e36259`, runtime contract fix `adaf47a44` and integration `1d156bfdf`. These transfers contained source Git objects, with fresh sandbox records kept separately.

The integration acceptance used real native API requests and disposable storage. Synthetic rows supplemented null/zero, unknown outcome and background contract cases; they are not evidence of natural agent capture. Q/A capture and failed improve were actual API calls. Graph improvement failed because the offline embedding model was unavailable. Successful graph improvement is not established.

Final verification **passed the defined gates** on
`d424820014404663d5562186858430c6d15c68d7`. The parent corrected the first
validator's sole stale assertion to require the deliberate `authErrors: "throw"`
option; no app implementation changed. The earlier 277-pass/1-fail receipt is
preserved at `922238acc` in Git history.

The repeated targeted file passed **14/14**; the exact 27-suite gate passed
**278/278, 0 skipped**, including all 12 transport cases. Scoped lint and locked
production Webpack build passed, build ID `Kn8Z_iChu1FKvA9T888YK`. Fresh native
API/built-browser acceptance passed: detail without `effective_status`, natural A/B
Q/A on one dataset with A-only failed improve, literal failed/noop and seeded
null/zero/unknown/background outcomes, real expired-auth 401 staying on Activity
with a working Sign in link, and native 403 permission text. The 403 browser case
uses a harness-added inaccessible dataset scope and forwards the real native
response unchanged. Legacy auth delegation is mocked unit proof, not separate
live-browser redirect proof. No browser page errors or external requests occurred.

Earlier **28 API passes / 3 optional tracing skips**, **10 isolated selfhost
passes**, and real restart persistence remain reused `1d156bfd` evidence. Backend
and installation/runtime source did not change; these checks were not repeated.
The new fresh replay is distinct. Offline improve still returns expected **409**;
successful graph improvement is not established. Other-caller/parent-account work
and legacy parent-only child associations can still be absent. API-key/Analytics
and other Cloud features remain deferred; optional memory UI is excluded.

See [receipts/final-verification.json](receipts/final-verification.json) for exact
commands/counts, build ID, screenshot names/hashes, evidence boundaries and cleanup.
Ports 8000/3000/3443 and owned browser tabs are stopped/closed. Fresh and old private
storage, dependencies and fixtures remain outside Git; only sanitized docs/receipts
are committed. Docker/MCP image builds and MCP lock alignment remain unverified.
No production access, deployment, Git push or PR was performed.

Public readback verifies stable `31e36259aa8a3fc696fdff140feb1bd5f9b9174b` and
feature `d424820014404663d5562186858430c6d15c68d7`, with stable an ancestor of
feature. The managed sandbox helper's direct-push **403 remains unrepaired**;
the parent published the refs. This docs-only commit is transferred as a verified
source-only incremental bundle to the prepared private receiver for parent
fast-forward publication. The external `verification-d424/verified-transfer.json`
records the bundle head/hash and receiver response without a self-referential hash.

The maintained TLS guide describes its original isolated Daytona verification. The parent also used a separate OCI development checkout for source preservation, publication and review corrections. Production application configuration and container identities were checked against their baseline. The Mac acted as a controller without a Cognee checkout or database.
