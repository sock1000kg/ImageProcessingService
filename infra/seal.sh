#!/usr/bin/env bash
# Seal the real (gitignored) secrets into a SealedSecret.
#
#   infra/seal.sh
#   infra/seal.sh --cert /path/to/lab-cert.pem
#
# Reads infra/app/real-secret.yaml and writes
# infra/app/sealed-secret.yaml.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
usage: seal.sh [--cert <path>]

  --cert <path>  seal offline against the sealed-secrets controller certificate
                 instead of calling the controller in kube-system
EOF
}

die() {
  echo "seal.sh: $*" >&2
  exit 1
}

CERT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
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

command -v kubeseal >/dev/null 2>&1 || die "kubeseal not found in PATH (https://github.com/bitnami-labs/sealed-secrets)"

APP_DIR="$SCRIPT_DIR/app"
REAL_SECRET="$APP_DIR/real-secret.yaml"
SEALED_SECRET="$APP_DIR/sealed-secret.yaml"
EXAMPLE="$APP_DIR/real-secret.example.yaml"

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
