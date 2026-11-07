#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo install -m 755 src/certificate_hook.py /etc/letsencrypt/renewal-hooks/deploy/cognee-native-tls
sudo env RENEWED_LINEAGE=/etc/letsencrypt/live/cognee.planasolutions.ai /etc/letsencrypt/renewal-hooks/deploy/cognee-native-tls
sudo install -m 644 systemd/cognee-native-tls-reconcile.service systemd/cognee-native-tls-reconcile.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cognee-native-tls-reconcile.timer
