#!/usr/bin/env bash
set -euo pipefail
sudo env RENEWED_LINEAGE=/etc/letsencrypt/live/cognee.planasolutions.ai /etc/letsencrypt/renewal-hooks/deploy/cognee-native-tls
