#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
base=(docker compose -p cognee -f /home/ubuntu/cognee/docker-compose.yml -f /home/ubuntu/cognee/compose.override.yml -f /home/ubuntu/cognee-upgrade-1.6.5/compose.upgrade.yml -f "$PWD/compose.rollback.yml")
"${base[@]}" config --quiet
[[ ${1:-check} == apply ]] || exit 0
"${base[@]}" stop -t 330 frontend cognee-mcp cognee
sudo rm -f /etc/cognee-native-tls/active
"${base[@]}" up -d --no-deps --no-build --pull never cognee cognee-mcp frontend
