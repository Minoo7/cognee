#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source ./images.env
export NATIVE_API_IMAGE NATIVE_MCP_IMAGE NATIVE_UI_IMAGE
base=(docker compose -p cognee -f /home/ubuntu/cognee/docker-compose.yml -f /home/ubuntu/cognee/compose.override.yml -f /home/ubuntu/cognee-upgrade-1.6.5/compose.upgrade.yml)
native=("${base[@]}" -f "$PWD/compose.native-tls.yml")
"${native[@]}" config --quiet
for image in "$NATIVE_API_IMAGE" "$NATIVE_MCP_IMAGE" "$NATIVE_UI_IMAGE"; do docker image inspect "$image" >/dev/null; done
if [[ ${1:-check} == check ]]; then exit 0; fi
[[ $1 == apply ]]
[[ -f receipts/ui-provenance.approved ]] || { echo "Blocked. Parent must resolve UI source provenance and record evidence in receipts/ui-provenance.approved." >&2; exit 1; }
sudo test -r /etc/cognee-native-tls/current/fullchain.pem
rollback_on_error() {
  status=$?
  trap - ERR
  echo "Native deployment failed; restoring pinned original services" >&2
  bash scripts/rollback.sh apply || echo "Automatic rollback failed; inspect services before retrying" >&2
  exit "$status"
}
trap rollback_on_error ERR
"${base[@]}" stop -t 330 frontend cognee-mcp cognee
"${native[@]}" up -d --no-deps --no-build --pull never cognee cognee-mcp frontend
for service in cognee cognee-mcp frontend; do
  [[ $(docker inspect --format '{{.State.Running}} {{index .Config.Labels "ai.planasolutions.native-tls"}}' "$service") == 'true enabled' ]]
done
python3 scripts/wait-tls.py
sudo touch /etc/cognee-native-tls/active
trap - ERR
