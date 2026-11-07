#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker image inspect sha256:94216bc9e1e9f2ef785740f62dc49e94d259f460e2fc1f4fe338f5c2b71f9920 >/dev/null
docker image inspect sha256:231f3f01d3f687b85fbc8b37e60d5738b35aee583fd06f134eebb174a0c34598 >/dev/null
docker tag sha256:94216bc9e1e9f2ef785740f62dc49e94d259f460e2fc1f4fe338f5c2b71f9920 cognee-native-base-api:94216bc9e1e9
docker tag sha256:231f3f01d3f687b85fbc8b37e60d5738b35aee583fd06f134eebb174a0c34598 cognee-native-base-mcp:231f3f01d3f6
tar xf ui/source-snapshot.tar -C ui
docker build -f Dockerfile.api -t cognee-native-api:20261103 .
docker build -f Dockerfile.mcp -t cognee-native-mcp:20261103 .
docker build -t cognee-native-ui:20261103 ui
docker image inspect cognee-native-api:20261103 cognee-native-mcp:20261103 cognee-native-ui:20261103 --format '{{.RepoTags}} {{.Id}}'
