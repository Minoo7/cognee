# Inspect native session coverage

Use the exact owner UUID and session ID from `GET /api/v1/sessions?range=all`.
Send your existing authenticated cookie or API key. For example, with an API key
already available in the environment:

```sh
curl --get "$COGNEE_API_URL/api/v1/sessions/$SESSION_ID/coverage" \
  --data-urlencode "owner_id=$OWNER_ID" \
  --header "X-Api-Key: $COGNEE_API_KEY"
```

URL-encode the session ID when it contains reserved path characters.
The owner is required. An invalid or missing owner returns 400. Wrong-owner,
invisible and missing sessions all return the same 404.

The response contains identity, dataset ID, observation time, and independent
`qa` and `trace` categories. `received` is `counted`, `unavailable` or `read_error`.
`checkpoint` is `recorded`, `missing`, `malformed`, `unavailable` or `read_error`.
A recorded checkpoint retains a valid count even when `updated_at` is null.
`comparison` is `difference` with a numeric count, `inconsistent_history` when
the checkpoint exceeds retention, or `not_comparable`.

These are independent reads. Expiry or deletion followed by new records can
produce equal counts without persistence. A missing checkpoint can mean expired
context. A checkpoint can advance before a later improve step fails. Counts do
not identify individual persisted records, dataset membership, current graph
presence, all client turns, or the client replay backlog. The endpoint returns
no prompt or trace bodies and starts no processing.
