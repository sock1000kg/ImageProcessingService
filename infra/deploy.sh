#!/usr/bin/env bash
# Deploy the ImageProcessing tenant to the Lab-sock k3s cluster.
#
#   infra/deploy.sh cluster   # KEDA, namespace keda (once per cluster)
#   infra/deploy.sh app       # namespace imgproc (default if no argument)
#
# KUBE_CONTEXT overrides the kubectl context (default: current context).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
usage: deploy.sh [cluster|app]

  cluster  install KEDA into namespace keda (--server-side, CRDs are large)
  app      deploy namespace imgproc (default)
EOF
}

die() {
  echo "deploy.sh: $*" >&2
  exit 1
}

log() {
  echo "[deploy] $*"
}

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
KUBECTL=(kubectl)
if [ -n "$KUBE_CONTEXT" ]; then
  KUBECTL+=(--context "$KUBE_CONTEXT")
fi

ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-300s}"
JOB_TIMEOUT="${JOB_TIMEOUT:-300s}"
APISERVICE_TIMEOUT="${APISERVICE_TIMEOUT:-180s}"

require_sealed_secret() {
  sealed="$SCRIPT_DIR/app/sealed-secret.yaml"
  [ -f "$sealed" ] || die "missing $sealed
run: infra/seal.sh"
  if grep -q "PLACEHOLDER" "$sealed"; then
    die "$sealed is still the committed placeholder
create $SCRIPT_DIR/app/real-secret.yaml and run: infra/seal.sh"
  fi
}

wait_for_workloads() {
  ns="$1"
  log "waiting for rollouts in $ns"
  "${KUBECTL[@]}" -n "$ns" rollout status statefulset/nats --timeout "$ROLLOUT_TIMEOUT"
  "${KUBECTL[@]}" -n "$ns" rollout status statefulset/postgresql --timeout "$ROLLOUT_TIMEOUT"
  "${KUBECTL[@]}" -n "$ns" rollout status deployment/minio --timeout "$ROLLOUT_TIMEOUT"
}

wait_for_setup_jobs() {
  ns="$1"
  for job in nats-setup minio-setup; do
    log "waiting for job/$job in $ns"
    if ! "${KUBECTL[@]}" -n "$ns" wait --for=condition=complete "job/$job" --timeout "$JOB_TIMEOUT"; then
      echo "--- logs of job/$job ---" >&2
      "${KUBECTL[@]}" -n "$ns" logs "job/$job" --all-containers --tail=200 >&2 || true
      die "job/$job did not complete in $ns"
    fi
  done
}

# true when the keda metrics apiserver has a pod stuck in CrashLoopBackOff
metrics_apiserver_crashlooping() {
  "${KUBECTL[@]}" -n keda get pod \
    -l app.kubernetes.io/name=keda-operator-metrics-apiserver \
    -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}' \
    2>/dev/null | grep -q CrashLoopBackOff
}

deploy_cluster() {
  log "applying KEDA (namespace keda, server-side apply)"

  # the previous run left this in keda, where the extension-apiserver configmap
  # reader grants nothing and the metrics apiserver crash-loops; the chart now
  # renders it into kube-system
  log "removing the stray RoleBinding keda/keda-operator-auth-reader (if any)"
  stray_deleted=0
  if [ -n "$("${KUBECTL[@]}" -n keda delete rolebinding keda-operator-auth-reader \
      --ignore-not-found=true -o name 2>/dev/null || true)" ]; then
    stray_deleted=1
    log "the stray RoleBinding existed and was deleted"
  fi

  kubectl kustomize --enable-helm "$SCRIPT_DIR/cluster/keda" |
    "${KUBECTL[@]}" apply --server-side --force-conflicts -f -

  # A metrics apiserver that crash-looped under the broken kustomization, or one
  # that was running when we removed the stray RoleBinding, will not recover on
  # its own. This must happen BEFORE the rollout waits: `rollout status` blocks
  # until ROLLOUT_TIMEOUT on a crash-looping pod, so waiting first would never
  # reach the restart.
  if [ "$stray_deleted" = 1 ] || metrics_apiserver_crashlooping; then
    log "restarting deployment/keda-operator-metrics-apiserver"
    "${KUBECTL[@]}" -n keda rollout restart deployment/keda-operator-metrics-apiserver
  fi

  log "waiting for KEDA rollouts"
  for deployment in keda-operator keda-operator-metrics-apiserver keda-admission-webhooks; do
    log "waiting for deployment/$deployment in keda"
    "${KUBECTL[@]}" -n keda rollout status "deployment/$deployment" --timeout "$ROLLOUT_TIMEOUT"
  done

  log "waiting for apiservice/v1beta1.external.metrics.k8s.io to become Available"
  if ! "${KUBECTL[@]}" wait --for=condition=Available \
      apiservice/v1beta1.external.metrics.k8s.io --timeout "$APISERVICE_TIMEOUT"; then
    echo "--- logs of the keda metrics apiserver ---" >&2
    "${KUBECTL[@]}" -n keda logs deployment/keda-operator-metrics-apiserver \
      --all-containers --tail=200 >&2 || true
    die "apiservice/v1beta1.external.metrics.k8s.io did not become Available"
  fi
  log "cluster components ready"
}

deploy_app() {
  ns="imgproc"
  require_sealed_secret

  # Job specs are immutable, so the previous run's jobs must go first
  log "removing previous setup jobs in $ns"
  "${KUBECTL[@]}" delete job -n "$ns" -l app.kubernetes.io/part-of=imgproc-setup --ignore-not-found=true

  log "applying $SCRIPT_DIR/app"
  kubectl kustomize --enable-helm "$SCRIPT_DIR/app" |
    "${KUBECTL[@]}" apply -f -

  wait_for_workloads "$ns"
  wait_for_setup_jobs "$ns"
  log "app ($ns) is ready"
}

main() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found in PATH"
  target="${1:-app}"
  case "$target" in
    cluster) deploy_cluster ;;
    app) deploy_app ;;
    -h|--help)
      usage
      ;;
    *)
      usage >&2
      die "unknown target: $1"
      ;;
  esac
}

main "$@"
