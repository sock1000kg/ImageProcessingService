#!/usr/bin/env bash
# Build the web image from the working tree's web/ and import it into the laptop k3s (the overlay runs
# imgproc-web:bench with imagePullPolicy Never). Needs Docker and root for the import:
#   sudo -E bash infra/bench/local-cluster/build-web.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
docker build -t imgproc-web:bench "$ROOT/web"
docker save imgproc-web:bench | k3s ctr images import -
echo "Imported imgproc-web:bench. Apply it with: sudo -E bash infra/bench/local-cluster/up.sh (or restart deploy/web)."
