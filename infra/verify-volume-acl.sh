#!/usr/bin/env bash
# Reproduce the lab's ACL'd local-path condition locally, and prove that the
# ownership init containers we ship fix it.
#
#   bash infra/verify-volume-acl.sh                     # needs a Docker daemon
#   VERIFY_ACL_DRY_RUN=1 bash infra/verify-volume-acl.sh # prints every command
#
# The dry run executes nothing and prints each `docker run` vector to STDERR (so
# it does not pollute the captured output the assertions read); STDERR is where
# the real command output is printed too, so a transcript of a run is complete.
#
# Requires a running Docker daemon and network access for `apk add acl`.
# Nothing outside two throwaway docker named volumes is written, and the lab is
# never touched.
#
# Background (round 1.3): on the lab, the local-path PV directory shows
# `drwxrwsrwx+ root <fsGroup>`. The `+` is a POSIX ACL inherited from a default
# ACL on the storage dir; its *mask* caps the group class, so a non-root uid
# that reaches the directory through the group/ACL entries cannot write. Root
# bypasses ACLs (NATS is fine), and an app whose data dir is *owned* by its uid
# works, because the owner class is not capped by the mask. The lab ACL may be a
# dependency of another app, so we leave it alone and fix our own manifests.
#
# Every container is started the way Kubernetes starts it:
#   - image, user, readOnlyRootFilesystem, allowPrivilegeEscalation, capabilities
#     and the emptyDir mount paths come from the **rendered** manifests, and
#   - `command:` REPLACES the image ENTRYPOINT (`docker run --entrypoint <command[0]>`),
#     which is what tripped the first version of this script.
#
# Tests:
#   (a) uid 1000 cannot write          -> reproduces the bug (EXPECTED to fail)
#   (b) after the shipped MinIO init container it can write
#   (c) the shipped MinIO container starts and serves S3 (mc put + get)
#   (d) the shipped Postgres init container works, and uid 1001 can write its data dir
#   (e) running the MinIO init container a second time is a no-op
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd -- "$SCRIPT_DIR/.." && pwd)"

ACL_IMAGE="alpine:3.20"
MINIO_UID=1000
PG_UID=1001

VOL_MINIO="imgproc-acl-minio-$$"
VOL_PG="imgproc-acl-pg-$$"
CONTAINER="imgproc-acl-$$"
WORK="$(mktemp -d)"

DRY_RUN="${VERIFY_ACL_DRY_RUN:-0}"
exec 3>&1

FAILURES=0
pass() {
  [ "$DRY_RUN" = 1 ] && return 0
  echo "PASS: $*"
  return 0
}
fail() {
  [ "$DRY_RUN" = 1 ] && return 0
  echo "FAIL: $*"
  FAILURES=$((FAILURES + 1))
}
info() {
  [ "$DRY_RUN" = 1 ] && return 0
  echo "  --- $*"
}
header() {
  [ "$DRY_RUN" = 1 ] && return 0
  echo "$*"
}

die() {
  echo "verify-volume-acl.sh: $*" >&2
  exit 2
}

# every docker invocation goes through here, so the dry run can intercept all of
# them and so no docker error is ever swallowed silently
docker_exec() {
  [ "${1:-}" = "docker" ] && die "docker_exec called with leading 'docker': $*"
  if [ "$DRY_RUN" = 1 ]; then
    if [ "${1:-}" = "run" ]; then
      printf '[dry-run] docker' >&3
      local a
      for a in "$@"; do printf ' %q' "$a" >&3; done
      printf '\n' >&3
    fi
    return 0
  fi
  docker "$@"
}

# a docker run without an image argument fails confusingly (docker just exits),
# which is exactly the bug this script had; make it loud instead
require_image() {
  [ -n "${1:-}" ] || die "docker run without an image argument: ${*:2}"
}

cleanup() {
  if [ "$DRY_RUN" = 1 ]; then
    rm -rf "$WORK"
    return 0
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm -f "$VOL_MINIO" "$VOL_PG" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
command -v python3 >/dev/null 2>&1 || die "python3 not found in PATH"
if [ "$DRY_RUN" != 1 ]; then
  docker info >/dev/null 2>&1 || die "cannot reach the Docker daemon (is it running?)
(run with VERIFY_ACL_DRY_RUN=1 to print the commands without a daemon)"
fi

# --------------------------------------------------------------------------
# read a container spec out of the rendered manifests
# --------------------------------------------------------------------------
render_dev() {
  kubectl kustomize --enable-helm "$REPO/infra/overlays/dev" >"$WORK/render-dev.yaml" 2>/dev/null ||
    die "kubectl kustomize --enable-helm infra/overlays/dev failed
is kubectl installed, and are the helm charts vendored under infra/base/*/charts?"
}

# records are base64-encoded so multi-line scripts survive intact
emit_spec() {
  python3 - "$WORK/render-dev.yaml" "$1" "$2" "$3" <<'PYEOF'
import base64, sys, yaml

path, kind, name, container = sys.argv[1:5]


def rec(key, *values):
    print(key + " " + " ".join(base64.b64encode(str(v).encode()).decode() for v in values))


def emit(c, pod, pod_sc):
    sc = c.get("securityContext") or {}
    rec("IMAGE", c.get("image", ""))
    rec("USER", sc.get("runAsUser", pod_sc.get("runAsUser", 0)))
    rec("READONLY", int(bool(sc.get("readOnlyRootFilesystem"))))
    rec("NNP", int(sc.get("allowPrivilegeEscalation") is False))
    caps = sc.get("capabilities") or {}
    for cap in caps.get("drop") or []:
        rec("CAPDROP", cap)
    for cap in caps.get("add") or []:
        rec("CAPADD", cap)
    for m in c.get("volumeMounts") or []:
        rec("MOUNT", m.get("name", ""), m.get("mountPath", ""))
    for a in (c.get("command") or []) + (c.get("args") or []):
        rec("ARG", a)


for doc in yaml.safe_load_all(open(path)):
    if not doc or doc.get("kind") != kind or doc.get("metadata", {}).get("name") != name:
        continue
    pod = doc.get("spec", {}).get("template", {}).get("spec", {})
    pod_sc = pod.get("securityContext") or {}
    # emptyDir volumes the container mounts have to be tmpfs in a --read-only run
    for v in pod.get("volumes") or []:
        if "emptyDir" in v:
            rec("EMPTYDIR", v.get("name", ""))
    for c in pod.get("containers") or []:
        if c.get("name") == container:
            emit(c, pod, pod_sc)
            sys.exit(0)
    for c in pod.get("initContainers") or []:
        if c.get("name") == container:
            emit(c, pod, pod_sc)
            sys.exit(0)
sys.exit(1)
PYEOF
}

SPEC_IMAGE=""
SPEC_USER=""
SPEC_READONLY=0
SPEC_NNP=0
SPEC_DROPALL=0
SPEC_CAPS=()
SPEC_ARGV=()
SPEC_EMPTYDIRS=()
SPEC_MOUNTS=()

load_spec() {
  # load_spec <kind> <name> <container>
  local kind="$1" name="$2" container="$3"
  SPEC_IMAGE=""; SPEC_USER=""; SPEC_READONLY=0; SPEC_NNP=0; SPEC_DROPALL=0
  SPEC_CAPS=(); SPEC_ARGV=(); SPEC_EMPTYDIRS=(); SPEC_MOUNTS=()
  local key v1 v2
  while read -r key v1 v2; do
    case "$key" in
      IMAGE) SPEC_IMAGE="$(printf '%s' "$v1" | base64 -d)" ;;
      USER) SPEC_USER="$(printf '%s' "$v1" | base64 -d)" ;;
      READONLY) SPEC_READONLY="$(printf '%s' "$v1" | base64 -d)" ;;
      NNP) SPEC_NNP="$(printf '%s' "$v1" | base64 -d)" ;;
      CAPDROP)
        [ "$(printf '%s' "$v1" | base64 -d)" = "ALL" ] && SPEC_DROPALL=1
        ;;
      CAPADD) SPEC_CAPS+=("$(printf '%s' "$v1" | base64 -d)") ;;
      ARG) SPEC_ARGV+=("$(printf '%s' "$v1" | base64 -d)") ;;
      EMPTYDIR) SPEC_EMPTYDIRS+=("$(printf '%s' "$v1" | base64 -d)") ;;
      MOUNT)
        SPEC_MOUNTS+=("$(printf '%s' "$v1" | base64 -d)|$(printf '%s' "$v2" | base64 -d)")
        ;;
    esac
  done < <(emit_spec "$kind" "$name" "$container" || true)
  [ -n "$SPEC_IMAGE" ] || die "could not read $kind/$name container $container from the rendered dev overlay"
  # a container that declares no command/args keeps the image ENTRYPOINT (the
  # Postgres server does); that is fine as long as we never run it -- we only
  # read its image, user and mounts
}

# mount paths of the emptyDir volumes this container mounts — in a --read-only
# container these are the paths that need a tmpfs
emptydir_mount_paths() {
  local pair name path
  local -a paths=()
  for pair in "${SPEC_MOUNTS[@]}"; do
    name="${pair%%|*}"
    path="${pair##*|}"
    case " ${SPEC_EMPTYDIRS[*]-} " in
      *" $name "*) paths+=("$path") ;;
    esac
  done
  printf '%s\n' "${paths[@]:-}"
}

cap_summary() {
  if [ "$SPEC_DROPALL" = 1 ]; then
    printf 'drop=ALL add=%s' "${SPEC_CAPS[*]:-none}"
  else
    printf 'container defaults (no capabilities in the manifest)'
  fi
}

show_spec() {
  info "$1"
  info "  image:    $SPEC_IMAGE"
  info "  user:     $SPEC_USER"
  info "  caps:     $(cap_summary)"
  info "  readOnly: $SPEC_READONLY   no-new-privileges: $SPEC_NNP"
  info "  emptydir mounts: ${SPEC_MOUNTS[*]:-none}"
  info "  argv:     ${#SPEC_ARGV[@]} element(s)"
  local a
  for a in "${SPEC_ARGV[@]}"; do info "  | $a"; done
}

# --------------------------------------------------------------------------
# run a container the way Kubernetes would
# --------------------------------------------------------------------------
# Callers fill RUN_OPTS=() with extra `docker run` options (mounts, env, ...).
RUN_OPTS=()

# CAPS_DROP_ALL=0 means "keep the runtime's default capability set", which is
# what Kubernetes does when the manifest says nothing.
compose_flags() {
  FLAGS=()
  [ "${CAPS_DROP_ALL:-0}" = 1 ] && FLAGS+=(--cap-drop ALL)
  local c
  for c in ${CAPS_ADD:-}; do FLAGS+=(--cap-add "$c"); done
  [ "${NO_NEW_PRIVS:-0}" = 1 ] && FLAGS+=(--security-opt no-new-privileges)
  [ "${READONLY_ROOTFS:-0}" = 1 ] && FLAGS+=(--read-only)
}

# run_like_k8s <image> <user> -- <command> [args...]
# The first element after `--` becomes the ENTRYPOINT, exactly like `command:` in
# a pod spec (it REPLACES the image ENTRYPOINT); the rest are its args.
run_like_k8s() {
  local image="$1" user="$2"
  shift 2
  [ "${1:-}" = "--" ] && shift
  [ "${1:-}" ] || die "no command to run for $image (the rendered container declares no command/args)"
  local entry="$1"
  shift
  require_image "$image" "${@:-}"
  compose_flags
  local cmd=(run --rm --name "$CONTAINER")
  [ -n "$user" ] && cmd+=(--user "$user")
  cmd+=("${FLAGS[@]}" "${RUN_OPTS[@]}" --entrypoint "$entry" "$image" "$@")
  docker_exec "${cmd[@]}"
}

# detached variant, for the MinIO server in (c)
start_like_k8s() {
  local image="$1" user="$2"
  shift 2
  [ "${1:-}" = "--" ] && shift
  [ "${1:-}" ] || die "no command to run for $image (the rendered container declares no command/args)"
  local entry="$1"
  shift
  require_image "$image" "${@:-}"
  compose_flags
  local cmd=(run -d --name "$CONTAINER")
  [ -n "$user" ] && cmd+=(--user "$user")
  cmd+=("${FLAGS[@]}" "${RUN_OPTS[@]}" --entrypoint "$entry" "$image" "$@")
  docker_exec "${cmd[@]}"
}

render_dev

# --------------------------------------------------------------------------
# the lab's ACL shape
# --------------------------------------------------------------------------
# owned by root:<gid>, setgid (2775) so new subdirs inherit gid <gid>, with an
# access ACL and a matching default ACL whose mask is r-x and other is r-x — so
# a non-root uid that belongs to <gid> matches the group entry and is capped
# by the mask, and root without DAC_OVERRIDE is denied write once ownership changes.
build_acl_dir() {
  # build_acl_dir <volume> <path> <gid> [subdir-to-pre-create]
  local volume="$1" path="$2" gid="$3" sub="${4:-}"
  local subblock="" subgetfacl=""
  if [ -n "$sub" ]; then
    # a half-created subdir, like a failed run leaves behind: because the
    # parent is setgid it inherits BOTH gid <gid> and the default ACL
    subblock="mkdir -p '$path/$sub'"
    subgetfacl="echo '  --- getfacl $path/$sub'
      getfacl -p '$path/$sub' 2>/dev/null | sed 's/^/      /'"
  fi
  require_image "$ACL_IMAGE" "sh -ceu ..."
  docker_exec run --rm --name "$CONTAINER" \
    -v "$volume:$path" "$ACL_IMAGE" sh -ceu "
      apk add --no-cache acl >/dev/null
      mkdir -p '$path'
      chown 0:$gid '$path'
      chmod 2775 '$path'
      setfacl -m u::rwx,g::rwx,o::r-x,m::r-x '$path'
      setfacl -d -m u::rwx,g::rwx,o::r-x,m::r-x '$path'
      $subblock
      echo '  --- getfacl $path'
      getfacl -p '$path' 2>/dev/null | sed 's/^/      /'
      $subgetfacl
    " 2>&1
}

# write a probe file as an unprivileged uid; prints stdout+stderr
probe_write() {
  # probe_write <uid> <image> <script> [docker opts...]
  local uid="$1" image="$2" script="$3"
  shift 3
  require_image "$image" "$script"
  docker_exec run --rm --name "$CONTAINER" --user "$uid:$uid" \
    --cap-drop ALL --security-opt no-new-privileges \
    "$@" "$image" sh -c "$script" 2>&1
}

header "== manifests"
load_spec Deployment minio volume-permissions
show_spec "MinIO init container (from the rendered Deployment/minio)"
MINIO_INIT_IMAGE="$SPEC_IMAGE"
MINIO_INIT_USER="$SPEC_USER"
MINIO_INIT_ARGV=("${SPEC_ARGV[@]}")
MINIO_INIT_FLAGS="$(cap_summary)"
MINIO_INIT_DROP_ALL="$SPEC_DROPALL"
MINIO_INIT_CAPS_ADD="${SPEC_CAPS[*]}"
MINIO_INIT_READONLY="$SPEC_READONLY"
MINIO_INIT_NNP="$SPEC_NNP"

load_spec Deployment minio minio
show_spec "MinIO server container (from the rendered Deployment/minio)"
MINIO_IMAGE="$SPEC_IMAGE"
MINIO_USER="$SPEC_USER"
MINIO_ARGV=("${SPEC_ARGV[@]}")
MINIO_DROP_ALL="$SPEC_DROPALL"
MINIO_CAPS_ADD="${SPEC_CAPS[*]}"
MINIO_READONLY="$SPEC_READONLY"
MINIO_NNP="$SPEC_NNP"

load_spec StatefulSet postgresql init-chmod-data
show_spec "Postgres init container (from the rendered StatefulSet/postgresql)"
PG_INIT_IMAGE="$SPEC_IMAGE"
PG_INIT_USER="$SPEC_USER"
PG_INIT_ARGV=("${SPEC_ARGV[@]}")
PG_INIT_FLAGS="$(cap_summary)"
PG_INIT_DROP_ALL="$SPEC_DROPALL"
PG_INIT_CAPS_ADD="${SPEC_CAPS[*]}"
PG_INIT_READONLY="$SPEC_READONLY"
PG_INIT_NNP="$SPEC_NNP"

# the main container, for the read-only uid-1001 probe in (d)
load_spec StatefulSet postgresql postgresql
show_spec "Postgres main container (from the rendered StatefulSet/postgresql)"
PG_IMAGE="$SPEC_IMAGE"
PG_USER="$SPEC_USER"
PG_EMPTYDIR_PATHS=()
while IFS= read -r p; do
  [ -n "$p" ] && PG_EMPTYDIR_PATHS+=("$p")
done < <(emptydir_mount_paths)
info "  emptyDir mount paths to back with tmpfs: ${PG_EMPTYDIR_PATHS[*]:-none}"

header ""
header "== (a) reproduce the bug: uid $MINIO_UID cannot write to the ACL'd volume"
acl_out="$(build_acl_dir "$VOL_MINIO" /export "$MINIO_UID" ".minio.sys/tmp")" ||
  {
    info "$acl_out"
    die "could not set up the ACL directory"
  }
info "$acl_out"
# getfacl indents both the top dir and the pre-created subdir; each must show a
# group class that is rwx in the ACL but only r-x effective. Without this the
# denial below could come from anything.
masked_count="$(grep -cE '^[[:space:]]*group::rwx[[:space:]]*#effective:r-x' <<<"$acl_out")"
if [ "${masked_count:-0}" -ge 2 ]; then
  pass "(a) the volume enforces the lab's masked-group shape (group::rwx #effective:r-x, top dir and subdir)"
else
  fail "(a) expected a masked group class on the dir AND its subdir, found ${masked_count:-0}; a denial below would be meaningless"
fi
if out="$(probe_write "$MINIO_UID" "$ACL_IMAGE" \
  "mkdir -p /export/.minio.sys/tmp && touch /export/.minio.sys/tmp/probe" \
  -v "$VOL_MINIO:/export")"; then
  fail "(a) uid $MINIO_UID unexpectedly WROTE to the ACL'd directory — the lab condition did not reproduce"
  info "$out"
elif grep -qi "permission denied" <<<"$out"; then
  pass "(a) uid $MINIO_UID got 'Permission denied' — the lab condition reproduced"
  info "$out"
else
  fail "(a) uid $MINIO_UID failed, but not with Permission denied"
  info "$out"
fi

header ""
header "== (b) run the shipped MinIO init container as root with $MINIO_INIT_FLAGS"
RUN_OPTS=(-v "$VOL_MINIO:/export" "--tmpfs" "/tmp:rw,size=8m")
CAPS_DROP_ALL="$MINIO_INIT_DROP_ALL"
CAPS_ADD="$MINIO_INIT_CAPS_ADD"
READONLY_ROOTFS="$MINIO_INIT_READONLY"
NO_NEW_PRIVS="$MINIO_INIT_NNP"
if out="$(run_like_k8s "$MINIO_INIT_IMAGE" "$MINIO_INIT_USER" -- "${MINIO_INIT_ARGV[@]}" 2>&1)"; then
  pass "(b) the init container ran"
  info "$out"
else
  fail "(b) the init container failed"
  info "$out"
  exit 1
fi
if out="$(probe_write "$MINIO_UID" "$ACL_IMAGE" \
  "mkdir -p /export/.minio.sys/tmp && touch /export/.minio.sys/tmp/probe && echo wrote" \
  -v "$VOL_MINIO:/export")"; then
  pass "(b) uid $MINIO_UID can now create .minio.sys/tmp and write in it"
  info "$out"
else
  fail "(b) uid $MINIO_UID still cannot write after the chown"
  info "$out"
fi

header ""
header "== (c) the shipped MinIO container runs as uid $MINIO_UID and serves S3"
RUN_OPTS=(-e MINIO_ROOT_USER=acluser -e MINIO_ROOT_PASSWORD=aclpassword -v "$VOL_MINIO:/export")
CAPS_DROP_ALL="$MINIO_DROP_ALL"
CAPS_ADD="$MINIO_CAPS_ADD"
READONLY_ROOTFS="$MINIO_READONLY"
NO_NEW_PRIVS="$MINIO_NNP"
if MINIO_CID="$(start_like_k8s "$MINIO_IMAGE" "$MINIO_USER" -- "${MINIO_ARGV[@]}" 2>&1)"; then
  # helpers talk to MinIO from inside its own network namespace, so no host port
  # has to be published. -i is required: `mc pipe` reads the object body from
  # stdin, and without it the upload is empty.
  mc_do() {
    require_image "$MINIO_IMAGE" "$@"
    docker_exec run --rm -i --network "container:$CONTAINER" --entrypoint /usr/bin/mc \
      -e MC_CONFIG_DIR=/tmp/.mc "$MINIO_IMAGE" "$@" 2>&1
  }
  HEALTH_ALL=""
  HEALTH_CODE=""
  # sets HEALTH_ALL/HEALTH_CODE as globals (no command substitution, so a broken
  # probe can never be mistaken for "not ready": its output must reach the FAIL
  # message)
  minio_health() {
    require_image "$MINIO_IMAGE" "curl /minio/health/live"
    HEALTH_ALL="$(docker_exec run --rm --network "container:$CONTAINER" \
      --entrypoint /usr/bin/curl "$MINIO_IMAGE" \
      -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/minio/health/live 2>&1)"
    HEALTH_CODE="$(printf '%s' "$HEALTH_ALL" | tr -cd '0-9')"
  }
  out=""
  healthy=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    [ "$DRY_RUN" = 1 ] || sleep 2
    out="$(docker_exec logs "$CONTAINER" 2>&1 | tail -20)"
    minio_health
    if [ "$HEALTH_CODE" = "200" ]; then
      healthy=1
      break
    fi
    [ "$DRY_RUN" = 1 ] && break
  done
  if grep -qiE "file access denied|Unable to initialize backend" <<<"$out"; then
    fail "(c) MinIO hit the storage error we are fixing"
    info "$out"
  elif [ -n "$healthy" ]; then
    pass "(c) MinIO started and /minio/health/live returns 200"
    info "$out"
  else
    fail "(c) MinIO never became healthy; last health probe output was:"
    info "${HEALTH_ALL:-<empty: the probe itself produced no output>}"
    info "--- last 20 log lines:"
    info "$out"
  fi

  header ""
  header "-- S3 round trip with the bundled mc client"
  if out="$(mc_do alias set acl http://127.0.0.1:9000 acluser aclpassword)"; then
    info "$out"
  else
    fail "(c) could not point mc at the MinIO container"
    info "$out"
  fi
  if out="$(mc_do mb --ignore-existing acl/acl-bucket)"; then
    info "$out"
  else
    fail "(c) could not create the acl/acl-bucket bucket"
    info "$out"
  fi
  # PUT on its own, so a failed upload is never reported as a failed GET
  if out="$(echo acl-proof | mc_do pipe acl/acl-bucket/probe.txt)"; then
    pass "(c) S3 PUT probe.txt succeeded (mc pipe, stdin forwarded)"
    info "$out"
  else
    fail "(c) S3 PUT of acl/acl-bucket/probe.txt failed"
    info "$out"
  fi
  # GET, compared byte for byte
  if out="$(mc_do cat acl/acl-bucket/probe.txt)"; then
    got="$(printf '%s' "$out" | tr -d '\r' | sed -e 's/[[:space:]]*$//')"
    if [ "$got" = "acl-proof" ]; then
      pass "(c) S3 GET probe.txt returned exactly 'acl-proof' — the round trip works"
    else
      fail "(c) S3 GET returned $(printf '%q' "$got"), expected 'acl-proof'"
      info "$out"
    fi
  else
    fail "(c) S3 GET of acl/acl-bucket/probe.txt failed"
    info "$out"
  fi
  docker_exec rm -f "$CONTAINER" >/dev/null 2>&1 || true
else
  fail "(c) could not start the MinIO container: $MINIO_CID"
fi

header ""
header "== (d) the shipped Postgres init container, then uid $PG_UID writes its data dir"
info "without DAC_OVERRIDE, root is denied write access to /bitnami/postgresql under the ACL mask once chowned to 1001:1001"
acl_out="$(build_acl_dir "$VOL_PG" /bitnami/postgresql "$PG_UID")" ||
  {
    info "$acl_out"
    die "could not set up the Postgres ACL directory"
  }
info "$acl_out"
# the chart's script ends with `chmod -R 777 /dev/shm`, so give it a tmpfs there
# rather than editing the shipped command
RUN_OPTS=(-v "$VOL_PG:/bitnami/postgresql" "--tmpfs" "/tmp:rw,size=16m" "--tmpfs" "/dev/shm:rw,size=16m")

# Run without DAC_OVERRIDE (expected to fail with Permission denied at mkdir -p)
CAPS_DROP_ALL=1
CAPS_ADD="CHOWN FOWNER"
READONLY_ROOTFS="$PG_INIT_READONLY"
NO_NEW_PRIVS="$PG_INIT_NNP"
if out="$(run_like_k8s "$PG_INIT_IMAGE" "$PG_INIT_USER" -- "${PG_INIT_ARGV[@]}" 2>&1)"; then
  fail "(d) expected init-chmod-data without DAC_OVERRIDE to fail, but it succeeded"
  info "$out"
elif grep -qi "permission denied" <<<"$out"; then
  pass "(d) without DAC_OVERRIDE, init-chmod-data failed with 'Permission denied' — reproduced lab failure"
  info "$out"
else
  fail "(d) init-chmod-data without DAC_OVERRIDE failed, but not with Permission denied"
  info "$out"
fi

# Run with rendered capabilities (now including DAC_OVERRIDE: expected to succeed)
CAPS_DROP_ALL="$PG_INIT_DROP_ALL"
CAPS_ADD="$PG_INIT_CAPS_ADD"
READONLY_ROOTFS="$PG_INIT_READONLY"
NO_NEW_PRIVS="$PG_INIT_NNP"
if out="$(run_like_k8s "$PG_INIT_IMAGE" "$PG_INIT_USER" -- "${PG_INIT_ARGV[@]}" 2>&1)"; then
  pass "(d) with rendered capabilities ($PG_INIT_FLAGS), init-chmod-data succeeded"
  info "$out"
else
  fail "(d) the shipped init-chmod-data failed with $PG_INIT_FLAGS"
  info "$out"
fi

# uid 1001 in the real Postgres image, read-only root filesystem, with a tmpfs
# for every emptyDir the chart mounts (taken from the rendered spec) and for
# /run. Writes into the data dir and reads the file back.
pg_tmpfs=(--tmpfs "/run:rw,size=8m")
for p in "${PG_EMPTYDIR_PATHS[@]:-}"; do
  pg_tmpfs+=("--tmpfs" "$p:rw,size=16m")
done
pg_ro_opts=(--read-only "${pg_tmpfs[@]}")
require_image "$PG_IMAGE" "sh -c <probe>"
if out="$(docker_exec run --rm --name "$CONTAINER" --user "$PG_USER:$PG_USER" \
  --cap-drop ALL --security-opt no-new-privileges \
  "${pg_ro_opts[@]}" -v "$VOL_PG:/bitnami/postgresql" \
  --entrypoint /bin/sh "$PG_IMAGE" -c \
  'set -e; mkdir -p /bitnami/postgresql/data; printf acl-pg-proof > /bitnami/postgresql/data/PROBE; cat /bitnami/postgresql/data/PROBE' 2>&1)"; then
  got="$(printf '%s' "$out" | tr -d '\r' | sed -e 's/[[:space:]]*$//')"
  if [ "$got" = "acl-pg-proof" ]; then
    pass "(d) uid $PG_USER:$PG_USER in $PG_IMAGE with --read-only and tmpfs (${pg_tmpfs[*]:-none}) created /bitnami/postgresql/data, wrote and read back a file"
  else
    fail "(d) the read-only probe returned $(printf '%q' "$got"), expected 'acl-pg-proof'"
    info "$out"
  fi
else
  fail "(d) uid $PG_USER in $PG_IMAGE with --read-only could not write /bitnami/postgresql/data"
  info "$out"
fi

header ""
header "== (e) running the MinIO init container a second time is a no-op"
RUN_OPTS=(-v "$VOL_MINIO:/export" "--tmpfs" "/tmp:rw,size=8m")
CAPS_DROP_ALL="$MINIO_INIT_DROP_ALL"
CAPS_ADD="$MINIO_INIT_CAPS_ADD"
READONLY_ROOTFS="$MINIO_INIT_READONLY"
NO_NEW_PRIVS="$MINIO_INIT_NNP"
if out="$(run_like_k8s "$MINIO_INIT_IMAGE" "$MINIO_INIT_USER" -- "${MINIO_INIT_ARGV[@]}" 2>&1)"; then
  if grep -q "nothing to do" <<<"$out"; then
    pass "(e) the second run detected the correct owner and did nothing"
    info "$out"
  else
    fail "(e) the second run did something it should not have done"
    info "$out"
  fi
else
  fail "(e) the second run of the init container failed"
  info "$out"
fi

header ""
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY RUN: no docker command was executed"
elif [ "$FAILURES" -eq 0 ]; then
  echo "ALL VOLUME ACL CHECKS PASSED"
else
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi