#!/usr/bin/env bash
# Build (and optionally push) the combined MinIO server + mc client image.
#
#   infra/images/build-push.sh            # build + post-build checks
#   infra/images/build-push.sh --push     # also push (only if already logged in)
#
# The push is deliberately conservative: without `--push` nothing leaves the
# machine. With `--push` the script still refuses unless Docker is already
# authenticated as the image owner, and it never reads, prints or stores
# credentials.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT_DIR="$SCRIPT_DIR/minio"
DOCKERFILE="$CONTEXT_DIR/Dockerfile"

IMAGE_OWNER="socknot1000kg"
SERVER_RELEASE="RELEASE.2025-10-15T17-29-55Z"
MC_VERSION="RELEASE.2025-08-13T08-35-41Z"
IMAGE="$IMAGE_OWNER/minio:$SERVER_RELEASE"
PLATFORM="linux/amd64"

PUSH=0

log() { echo "[build-push] $*"; }
die() {
  echo "[build-push] ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<EOF
usage: build-push.sh [--push]

  (no flag)  build \$IMAGE and run the post-build checks
  --push     additionally push, but only when docker is already logged in as $IMAGE_OWNER
EOF
}

# ------------------------------------------------------- docker login detection
DOCKER_HUB_URL="https://index.docker.io/v1/"
DOCKER_HUB_ALIAS="docker.io"

# json_get <file> <key> [<key> ...] — read one string value out of a JSON file,
# walking nested objects one key at a time. Keys are passed separately because a
# registry URL contains dots and cannot be a dotted path. Prints nothing when the
# key is absent. Only ever applied to the local docker config, and only to read
# helper names / usernames — never a secret.
json_get() {
  local file="$1"
  shift
  [ -f "$file" ] || return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
try:
    with open(sys.argv[1]) as fh:
        node = json.load(fh)
except Exception:
    sys.exit(0)
for key in sys.argv[2:]:
    if isinstance(node, dict):
        node = node.get(key)
    else:
        node = None
    if node is None:
        break
if isinstance(node, str):
    sys.stdout.write(node)
' "$file" "$@" 2>/dev/null || true
    return
  fi
  # python3-free fallback: only the flat credsStore key
  if [ "$#" -eq 1 ] && [ "$1" = "credsStore" ]; then
    sed -n 's/.*"credsStore"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -1
  fi
}

# helper_username <helper> — ask a credential helper with `list`, which returns
# only {"serverURL": "username"} and never the secret.
helper_username() {
  local helper="$1"
  command -v "$helper" >/dev/null 2>&1 || return 0
  local listing
  listing="$("$helper" list 2>/dev/null || true)"
  [ -n "$listing" ] || return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
try:
    doc = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
if isinstance(doc, dict):
    for key in (sys.argv[2], sys.argv[3]):
        value = doc.get(key)
        if value:
            sys.stdout.write(value)
            break
' "$listing" "$DOCKER_HUB_URL" "$DOCKER_HUB_ALIAS" 2>/dev/null || true
  fi
}

# detect_login_user — prints the Docker Hub username, or nothing if unknown.
# Never prints or keeps the token: the helper path only ever sees usernames,
# and the auths fallback decodes the base64 blob but keeps only the part
# before the first colon.
detect_login_user() {
  local cfg="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
  local helper=""

  if [ -f "$cfg" ]; then
    # a per-registry helper (credHelpers) wins over the global credsStore
    helper="$(json_get "$cfg" credHelpers "$DOCKER_HUB_URL")"
    [ -n "$helper" ] || helper="$(json_get "$cfg" credHelpers "$DOCKER_HUB_ALIAS")"
    [ -n "$helper" ] || helper="$(json_get "$cfg" credsStore)"
  fi

  if [ -n "$helper" ]; then
    local username
    username="$(helper_username "docker-credential-$helper")"
    if [ -n "$username" ]; then
      printf '%s' "$username"
      return 0
    fi
  fi

  # no usable helper: fall back to an inline auth entry, but only the username
  local auth decoded
  auth="$(json_get "$cfg" auths "$DOCKER_HUB_URL" auth)"
  [ -n "$auth" ] || auth="$(json_get "$cfg" auths "$DOCKER_HUB_ALIAS" auth)"
  if [ -n "$auth" ]; then
    decoded="$(printf '%s' "$auth" | base64 -d 2>/dev/null || true)"
    # keep only "user" from "user:token"; the token is dropped immediately
    printf '%s' "${decoded%%:*}"
  fi
}

# Hidden test hook: run ONLY the login detection and report the result with the
# same exit code the push gate would use. Never builds, never pushes.
#   BUILD_PUSH_DRY_LOGIN_CHECK=1 infra/images/build-push.sh
if [ "${BUILD_PUSH_DRY_LOGIN_CHECK:-0}" = "1" ]; then
  detected="$(detect_login_user)"
  echo "detected docker hub user: '${detected:-<none>}'"
  if [ "$detected" = "$IMAGE_OWNER" ]; then
    echo "result: would allow push (exit 0)"
    exit 0
  fi
  echo "result: would refuse to push (exit 3)"
  exit 3
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --push)
      PUSH=1
      shift
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

[ -f "$DOCKERFILE" ] || die "missing $DOCKERFILE"
command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon"

# ---------------------------------------------------------------------- build
log "building $IMAGE ($PLATFORM)"
log "  server: built from source at $SERVER_RELEASE"
log "  client: official mc $MC_VERSION (sha256-verified in the build)"
docker build \
  --platform "$PLATFORM" \
  --build-arg "MINIO_TAG=$SERVER_RELEASE" \
  --build-arg "MC_VERSION=$MC_VERSION" \
  -t "$IMAGE" \
  -f "$DOCKERFILE" \
  "$CONTEXT_DIR"

# ------------------------------------------------------------ post-build checks
log "post-build checks"

server_version="$(docker run --rm --platform "$PLATFORM" --entrypoint /usr/bin/minio "$IMAGE" --version)"
echo "$server_version"
if ! printf '%s' "$server_version" | grep -qF "version $SERVER_RELEASE"; then
  die "server version does not contain '$SERVER_RELEASE': $server_version"
fi
commit_id="$(printf '%s' "$server_version" | sed -n 's/.*commit-id=\([0-9a-f]*\).*/\1/p')"
[ -n "$commit_id" ] || die "server version does not report a commit-id"
log "  server OK: $SERVER_RELEASE (commit-id=$commit_id)"

client_version="$(docker run --rm --platform "$PLATFORM" --entrypoint /usr/bin/mc "$IMAGE" --version)"
echo "$client_version"
if ! printf '%s' "$client_version" | grep -qF "version $MC_VERSION"; then
  die "mc version does not contain '$MC_VERSION': $client_version"
fi
log "  mc OK: $MC_VERSION"

# the chart runs: /bin/sh -ce "/usr/bin/docker-entrypoint.sh minio server ..."
if ! docker run --rm --platform "$PLATFORM" --entrypoint /bin/sh "$IMAGE" -c \
  'test -x /usr/bin/docker-entrypoint.sh'; then
  die "/usr/bin/docker-entrypoint.sh is missing or not executable"
fi
log "  entrypoint OK: /usr/bin/docker-entrypoint.sh is executable"

if ! docker run --rm --platform "$PLATFORM" --entrypoint /bin/sh "$IMAGE" -c \
  'test -s /licenses/LICENSE'; then
  die "/licenses/LICENSE is missing"
fi
log "  license OK: /licenses/LICENSE present"

image_digest="$(docker image inspect "$IMAGE" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}<local build, not pushed>{{end}}')"
log "local image: $IMAGE"
log "local digest: $image_digest"

# ----------------------------------------------------------------------- push
if [ "$PUSH" -eq 0 ]; then
  log "not pushing (no --push). To publish:"
  log "  docker login -u $IMAGE_OWNER && infra/images/build-push.sh --push"
  exit 0
fi

log "checking whether docker is already authenticated as $IMAGE_OWNER"
logged_in="$(detect_login_user)"

if [ "$logged_in" != "$IMAGE_OWNER" ]; then
  log "cannot confirm docker is logged in as $IMAGE_OWNER (found: '${logged_in:-unknown}')"
  log "NOT pushing. Run:"
  log "  docker login -u $IMAGE_OWNER && infra/images/build-push.sh --push"
  exit 3
fi

log "pushing $IMAGE"
docker push --platform "$PLATFORM" "$IMAGE"

log "verifying an anonymous pull of the pushed image"
tmp_cfg="$(mktemp -d)"
trap 'rm -rf "$tmp_cfg"' EXIT
if DOCKER_CONFIG="$tmp_cfg" docker pull --platform "$PLATFORM" "$IMAGE" >/dev/null; then
  log "anonymous pull OK"
else
  log "anonymous pull FAILED — the repository is probably private."
  log "Make it public at https://hub.docker.com/r/$IMAGE_OWNER/minio/settings (Repository access) and re-test."
  exit 4
fi

pushed_digest="$(docker image inspect "$IMAGE" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}')"
log "pushed digest: $pushed_digest"