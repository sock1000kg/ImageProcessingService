#!/usr/bin/env bash
# Seal the real (gitignored) secrets of an overlay into a SealedSecret.
#
#   infra/seal.sh dev
#   infra/seal.sh prod --cert /path/to/lab-cert.pem
#
# Reads infra/overlays/<env>/real-secret.yaml and writes
# infra/overlays/<env>/sealed-secret.yaml.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
usage: seal.sh <dev|prod> [--cert <path>]

  --cert <path>  seal offline against the sealed-secrets controller certificate
                 instead of calling the controller in kube-system
EOF
}

die() {
  echo "seal.sh: $*" >&2
  exit 1
}

ENV_NAME=""
CERT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    dev|prod)
      ENV_NAME="$1"
      shift
      ;;
    --cert)
      [ "$#" -ge 2 ] || die "--cert needs a path"
      CERT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$ENV_NAME" ] || {
  usage >&2
  die "environment must be dev or prod"
}

command -v kubeseal >/dev/null 2>&1 || die "kubeseal not found in PATH (https://github.com/bitnami-labs/sealed-secrets)"

OVERLAY_DIR="$SCRIPT_DIR/overlays/$ENV_NAME"
REAL_SECRET="$OVERLAY_DIR/real-secret.yaml"
SEALED_SECRET="$OVERLAY_DIR/sealed-secret.yaml"
EXAMPLE="$OVERLAY_DIR/real-secret.example.yaml"

[ -f "$REAL_SECRET" ] || die "missing $REAL_SECRET
copy $EXAMPLE to $REAL_SECRET, fill in the real values, then re-run"

seal_args=(--format yaml)
if [ -n "$CERT" ]; then
  [ -f "$CERT" ] || die "certificate not found: $CERT"
  seal_args+=(--cert "$CERT")
else
  seal_args+=(--controller-namespace kube-system --controller-name sealed-secrets)
fi

echo "sealing $REAL_SECRET -> $SEALED_SECRET"
kubeseal "${seal_args[@]}" <"$REAL_SECRET" >"$SEALED_SECRET.tmp"
mv "$SEALED_SECRET.tmp" "$SEALED_SECRET"
echo "wrote $SEALED_SECRET"
