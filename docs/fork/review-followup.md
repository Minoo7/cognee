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

Final verification of `31141d0942b6780cc721af48ecbcffe586cd2b0d` stopped on a
focused-test failure: `cognee-frontend/src/modules/sessions/__tests__/sessionOperations.test.ts:30`
expects fetch options `{ signal }`, but the reader now supplies
`{ signal, authErrors: "throw" }`. The single exact-path run completed 27 suites
(26 passed, 1 failed), with 277 tests passed, 1 failed and 0 skipped. All 12
localFetch cases passed, including the new opt-in errors, option stripping and
retained legacy handler dispatch. They use mocked HTTP and a mocked auth handler.

Per the stop-on-failure instruction, no application/test fixes or repeat run were
made. Scoped lint, the production Webpack build, Python checks and current-build
native API/browser acceptance were not reached. There is no current verified build
ID or current-browser Sign in-link proof; earlier native acceptance is not a green
result for this source. See [receipts/final-verification.json](receipts/final-verification.json)
for the exact command, counts, failure, source/log hashes and cleanup. Ports
8000/3000/3443 are stopped, and prior sandbox dependencies and records are retained.

Public GitHub fetch and remote readback verify published stable
`31e36259aa8a3fc696fdff140feb1bd5f9b9174b` and feature
`31141d0942b6780cc721af48ecbcffe586cd2b0d`; stable is an ancestor of feature.
This verifies publication, not successful final runtime validation. Docker image
builds, production deployment and MCP lock alignment remain outside the completed
acceptance. Production was not changed.
