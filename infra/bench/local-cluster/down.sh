#!/usr/bin/env bash
# Tear down the local throwaway k3s cluster on the laptop.
# Must be executed as root (e.g. sudo -E infra/bench/local-cluster/down.sh).
#
# Usage:
#   sudo -E infra/bench/local-cluster/down.sh
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: sudo -E down.sh

Tears down the local throwaway k3s benchmark cluster, cleans up its volumes and
kubeconfig, while preserving the NVIDIA Container Toolkit.
EOF
}

if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
fi

KUBE_CONTEXT="${KUBE_CONTEXT:-bench-local}"
if [ "$KUBE_CONTEXT" = "default" ]; then
  echo "ERROR: Refusing to run with context 'default'! The lab context must never be modified." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: down.sh must be run with root privileges (e.g. sudo -E infra/bench/local-cluster/down.sh)" >&2
  exit 1
fi

INVOKING_USER="${SUDO_USER:-$(id -un)}"
INVOKING_HOME="$(getent passwd "$INVOKING_USER" | cut -d: -f6)"
KUBECONFIG="$INVOKING_HOME/.kube/bench-local.yaml"

echo "==> Stopping k3s server process..."
pkill -f "k3s server" 2>/dev/null || true

if [ -f /usr/local/bin/k3s-killall.sh ]; then
  echo "==> Running k3s-killall.sh..."
  /usr/local/bin/k3s-killall.sh
fi

if [ -f /usr/local/bin/k3s-uninstall.sh ]; then
  echo "==> Running k3s-uninstall.sh (removes k3s binaries, images, and volumes)..."
  /usr/local/bin/k3s-uninstall.sh
fi

if [ -f "$KUBECONFIG" ]; then
  echo "==> Removing $KUBECONFIG..."
  rm -f "$KUBECONFIG"
fi

echo ""
echo "========================================================================"
echo "Local k3s cluster and benchmark kubeconfig have been removed."
echo "NVIDIA Container Toolkit remains installed."
echo "To uninstall NVIDIA Container Toolkit, run:"
echo "  sudo apt-get remove --purge -y nvidia-container-toolkit"
echo "========================================================================"
