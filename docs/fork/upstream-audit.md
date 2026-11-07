# Self-hosted installation audit

## Exact source pointers

| Layer | Ref | Commit |
| --- | --- | --- |
| Maintained base | upstream v1.6.7 | `eaa33be5c58cd14584e64e3e0ed2e1479472ee09` |
| Previous base | upstream v1.6.5 | `37f788bd287750e10d7610173e5332b3843f6ebd` |
| Installation preservation | fork `preserved/installation-v1.6.5` | `e2b26016c4f2921334772bf6e13b41a1a37bb43e` |
| Optional UI, separate | fork `custom/memory-ui` | `6c6b67a5430c4f8cbdb1f8018905b10977024d90` |
| Build workaround quarantine | fork `archive/build-workarounds` | `36f6924d8d36d9008d30fb3e16eb400bf0befc29` |
| Fork main at audit | fork `main` | `8853378eae5366addb064e758e560a456146ae1a` |
| Frontend sync retained | upstream | `c1c50392c546708b9db1efa2861f707d065be27e` |
| Cross-user/tenant auth fixes retained | upstream | `23906f0d24236118ba68f8cd1ed063a330007388` |
| Multi-session pipeline stamping retained | upstream | `a959a481edc538f7867b4778642144bd5797924c` |

`selfhost/stable` starts at the exact maintained base, then applies installation
behavior selectively. No old frontend tree was substituted. Remotes are
`upstream=https://github.com/topoteretes/cognee.git` (push URL `DISABLED`) and
`fork=https://github.com/Minoo7/cognee.git`. The preservation branches were fetched
without forcing refs. Authenticated pushes use the existing prepared helper and
only the fork. No PR or deployment belongs to this task.

## Already supplied by v1.6.7

- Better blob presentation: `cognee-frontend/src/modules/datasets/describeTextBlob.ts`
  recognizes anonymous hashed text, reads its first lines, and distinguishes real
  memory headers from arbitrary text. Its tests and upstream consumers remain.
  This avoids reviving the old optional memory-reader implementation.
- `GET /api/v1/activity/pipeline-runs` accepts a singular `session_id` filter and
  returns plural `session_ids` per row. Multi-session improve runs are stamped
  under every participating session via `pipeline_run_sessions`. Existing
  dataset/user visibility filters, operation rows and parent relationships remain.
- Native raw/list/retrieval primitives already exist: dataset listing and data
  listing/count in `cognee/api/v1/datasets/routers/get_datasets_router.py`, raw
  payloads at `/{dataset_id}/data/{data_id}/raw`, session list/detail in
  `cognee/api/v1/sessions/routers/get_sessions_router.py`, and recall/search with
  context/citations through the retrieval modules and API routers. Installation
  does not add a parallel reader or retrieval API.
- Real tenant list/create/select endpoints already exist in the permissions
  router. `get_user_tenants` previously returned only `{id,name}`; only
  `is_owner` is added, computed from `Tenant.owner_id == authenticated_user.id`.
- Runtime URL parsing, document injection and `/api/runtime-config` already
  exist. The frontend sync left several consumers reading build-time constants;
  this patch reconnects those consumers to the existing runtime helpers.
- The current API lifespan handles migrations, recovery, background drain,
  cached engine close and telemetry flush. The new listener adapter uses that
  lifespan once. It does not copy the old API entrypoint/migration comments over
  the new lifecycle. MCP retains its current app builder and outer cleanup.

## Still custom in the maintained installation

- Real browser `/users/me` identity replaces `Local User` placeholders. Server
  identity reads forward the incoming cookie, bearer authorization and API key.
- Local workspace lists expose personal scope (`tenant_id=null`) plus actual
  memberships and ownership. Creation calls the existing tenant endpoint;
  selection persists through the backend, then reloads into that owner context.
  A team called “Personal Workspace” is still a team: personal identity uses
  the explicit UI sentinel for the null backend tenant, not its display name.
- The top bar offers local workspace creation without payment UI, while retaining
  upstream profile display, workspace wake fields and modal cancellation behavior.
- Login email/password inputs start empty. Visualization/provenance/inventory
  routes forward user credentials and preserve backend denials; none log in as
  the default user. Configured default-user classification comes from the backend
  instead of matching `default_user@example.com` in UI code.
- Runtime backend helpers are called at request/render time for local fetch,
  login, identity, providers and server routes; no localhost URL is forced into
  `next.config.ts`.
- Native dual-listener TLS is maintained in `cognee/api/native_tls.py`, the API
  and MCP entrypoint seams, and `cognee-frontend/server.cjs`. The maintained
  source/example is `deploy/native-tls/`; certificate reload and lifecycle tests
  use disposable localhost fixtures only.

## Explicit separation and limits

`custom/memory-ui` remains separate. Used-node filtering, optional memory reader,
Enriched and Sessions Markdown changes were not imported. The upstream Sessions
and activity UI are untouched by this installation layer.

The old OCI deployment bundle is preserved verbatim under
`deploy/archive/installation-v1.6.5/native-tls/`, with an archive notice one level
above. Its image IDs, patch hashes, host paths, compose overlays, hook, rollback
and deploy scripts are version-specific and were not run or certified for 1.6.7.
Only reusable listener behavior was adapted into the maintained source.

The quarantined root Dockerfile cached-Ladybug override and old MCP `uv.lock`
changes were not ported. The root Dockerfile and both Python locks match stock
v1.6.7. Stock v1.6.7 itself includes a best-effort extension preinstall; that
upstream source is retained unchanged. **Stock MCP's lock resolves Cognee 1.6.6**
while the root is 1.6.7. The maintained MCP wrapper adds the TLS adapter module
explicitly; it does not hide or change that core-version discrepancy. Actual
image builds, core/native DB runtime and full API-mode compatibility remain
unverified. See `deploy/native-tls/README.md` for the exact installation seams.

Cloud stubs remain for Activity, Analytics, API-key pages, billing/credits,
cloud onboarding/profile mutations and hosted tenant provisioning. The local
provider supplies membership/owner context, not a fabricated Cloud profile or
billing backend. Activity implementation belongs to the separate parent-managed
workstream. No Cloud stub was implemented here.

## Verification record

See `validation.md` beside this audit for exact commands and results. Python
checks run source seams and disposable ASGI/MCP/SQLite fixtures in an isolated
environment; they do not constitute a full SDK/native DB integration suite.
The production frontend build and native UI runtime test use this checkout only.
No OCI/production endpoint, production data/credentials or Mac files were used.
No poteto hub was present in the checkout or its applicable instruction paths.
