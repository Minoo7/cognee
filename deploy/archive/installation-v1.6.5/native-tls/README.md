# Preserved OCI native TLS deployment

These are source adapters, patches, tests, and deployment scripts copied from the existing installation. They are preserved for review, not instructions to deploy this checkout. Production is unchanged. Set and verify image pins for each build. Existing scripts contain host-specific paths and must be adapted before running from this repository. Credentials, certificate material, environment files, runtime data, and databases are excluded. The source-manifest.json hashes refer to the original source bytes.

The frontend TLS server is cognee-frontend/server.cjs. The current runtime settings and Compose mounts are retained in compose.native-tls.yml. API startup retains the migration preamble and uses one shared lifecycle for its listeners. Renewal publishes a matched key/certificate and reloads listeners in place. The timer retries renewal publication.
