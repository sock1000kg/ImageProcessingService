#!/usr/bin/env bash
# Provision local k3s cluster with GPU support for benchmarking on laptop (WSL2).
# Must be executed as root (e.g. sudo -E infra/bench/local-cluster/up.sh).
#
# Usage:
#   sudo -E infra/bench/local-cluster/up.sh [--cpu]
#
# Flags:
#   --cpu       Skip GPU configuration and smoke test (CPU baseline mode)
#   -h, --help  Show this help message
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEDA_DIR="$(cd "$SCRIPT_DIR/../../cluster/keda" && pwd)"
OVERLAY_DIR="$SCRIPT_DIR/overlay"

K3S_VERSION="v1.31.2+k3s1"
CUDA_SMOKE_IMAGE="nvidia/cuda:12.4.1-base-ubuntu22.04"

usage() {
  cat <<'EOF'
Usage: sudo -E up.sh [--cpu]

Provisions a local throwaway k3s cluster on the laptop with NVIDIA GPU runtime
and deploys the ImageProcessing app and KEDA for benchmarking.

Options:
  --cpu       Skip GPU runtime and patches (runs workers on CPU for baseline)
  -h, --help  Show this help message and exit
EOF
}

CPU_MODE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cpu)
      CPU_MODE=1
      shift
      ;;
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
done

KUBE_CONTEXT="${KUBE_CONTEXT:-bench-local}"

# Safety check: ensure we never touch the lab 'default' context
if [ "$KUBE_CONTEXT" = "default" ]; then
  echo "ERROR: Refusing to run with context 'default'! The lab context must never be modified." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: up.sh must be run with root privileges (e.g. sudo -E infra/bench/local-cluster/up.sh)" >&2
  exit 1
fi

# Determine invoking user and their home directory
INVOKING_USER="${SUDO_USER:-$(id -un)}"
INVOKING_HOME="$(getent passwd "$INVOKING_USER" | cut -d: -f6)"
INVOKING_GROUP="$(id -gn "$INVOKING_USER")"

KUBECONFIG="$INVOKING_HOME/.kube/bench-local.yaml"
KUBE_CONTEXT="bench-local"

# Safety check: ensure we never touch the lab 'default' context
if [ "$KUBE_CONTEXT" = "default" ]; then
  echo "ERROR: Refusing to run with context 'default'! The lab context must never be modified." >&2
  exit 1
fi

KUBECTL_CMD=(kubectl --kubeconfig "$KUBECONFIG" --context "$KUBE_CONTEXT")

# -----------------------------------------------------------------------------
# 1. Install NVIDIA Container Toolkit if missing (GPU mode only)
# -----------------------------------------------------------------------------
if [ "$CPU_MODE" -eq 0 ]; then
  if ! command -v nvidia-ctk >/dev/null 2>&1 && ! command -v nvidia-container-runtime >/dev/null 2>&1; then
    echo "==> NVIDIA Container Toolkit not found. Installing from official repository..."
    mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
    apt-get update
    apt-get install -y nvidia-container-toolkit
    echo "==> NVIDIA Container Toolkit installed successfully."
  else
    echo "==> NVIDIA Container Toolkit is already installed."
  fi
fi

# -----------------------------------------------------------------------------
# 2. Install k3s without systemd (pinned version)
# -----------------------------------------------------------------------------
if ! command -v k3s >/dev/null 2>&1; then
  echo "==> Installing k3s ($K3S_VERSION) without systemd..."
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_SKIP_ENABLE=true \
    INSTALL_K3S_SKIP_START=true \
    INSTALL_K3S_VERSION="$K3S_VERSION" \
    sh -
else
  echo "==> k3s is already installed."
fi

# Start k3s server in background if not already running
if ! pgrep -f "k3s server" >/dev/null 2>&1; then
  echo "==> Starting k3s server in background (detached, logs to /var/log/k3s-bench.log)..."
  mkdir -p /var/log
  setsid nohup k3s server > /var/log/k3s-bench.log 2>&1 &
fi

# Wait for k3s kubeconfig and node to become Ready
echo "==> Waiting for k3s server node to reach Ready state..."
for _ in $(seq 1 60); do
  if [ -f /etc/rancher/k3s/k3s.yaml ] && k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null | grep -q " Ready"; then
    break
  fi
  sleep 2
done

if ! k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null | grep -q " Ready"; then
  echo "ERROR: k3s node did not become Ready within 120 seconds. Check /var/log/k3s-bench.log" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 3. Configure separate kubeconfig ~/.kube/bench-local.yaml
# -----------------------------------------------------------------------------
echo "==> Setting up separate kubeconfig at $KUBECONFIG..."
mkdir -p "$INVOKING_HOME/.kube"
cp /etc/rancher/k3s/k3s.yaml "$KUBECONFIG"
# Rename every reference (cluster, user, context names and the context's cluster/user fields), or the context points nowhere.
sed -i -E 's/^([[:space:]]*-?[[:space:]]*(name|cluster|user|current-context): )default$/\1bench-local/' "$KUBECONFIG"
chown "$INVOKING_USER:$INVOKING_GROUP" "$KUBECONFIG"
chmod 600 "$KUBECONFIG"

resolved_ctx="$("${KUBECTL_CMD[@]}" config current-context 2>/dev/null || true)"
if [ "$resolved_ctx" = "default" ]; then
  echo "ERROR: resolved context is 'default'! Refusing to proceed." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 4. RuntimeClass and GPU smoke test
# -----------------------------------------------------------------------------
if [ "$CPU_MODE" -eq 0 ]; then
  echo "==> Registering RuntimeClass 'nvidia'..."
  "${KUBECTL_CMD[@]}" apply -f - <<'EOF'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: nvidia
handler: nvidia
EOF

  echo "==> Running GPU smoke test (pod with nvidia runtime running nvidia-smi)..."
  "${KUBECTL_CMD[@]}" delete pod gpu-smoke-test --ignore-not-found=true >/dev/null 2>&1 || true

  "${KUBECTL_CMD[@]}" apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: gpu-smoke-test
  namespace: default
spec:
  restartPolicy: Never
  runtimeClassName: nvidia
  containers:
  - name: cuda-test
    image: $CUDA_SMOKE_IMAGE
    command: ["nvidia-smi"]
    env:
    - name: NVIDIA_VISIBLE_DEVICES
      value: "all"
    - name: NVIDIA_DRIVER_CAPABILITIES
      value: "compute,utility"
EOF

  smoke_ok=0
  for _ in $(seq 1 60); do
    phase="$("${KUBECTL_CMD[@]}" get pod gpu-smoke-test -o jsonpath='{.status.phase}' 2>/dev/null || true)"
    if [ "$phase" = "Succeeded" ]; then
      smoke_ok=1
      break
    fi
    if [ "$phase" = "Failed" ]; then
      break
    fi
    sleep 2
  done

  if [ "$smoke_ok" -ne 1 ]; then
    echo "ERROR: GPU smoke test failed! The pod running nvidia-smi did not succeed." >&2
    echo "Logs from gpu-smoke-test pod:" >&2
    "${KUBECTL_CMD[@]}" logs pod/gpu-smoke-test >&2 || true
    "${KUBECTL_CMD[@]}" delete pod gpu-smoke-test --ignore-not-found=true >/dev/null 2>&1 || true
    exit 1
  fi

  echo "==> GPU smoke test passed successfully:"
  "${KUBECTL_CMD[@]}" logs pod/gpu-smoke-test | head -n 12 || true
  "${KUBECTL_CMD[@]}" delete pod gpu-smoke-test --ignore-not-found=true >/dev/null 2>&1 || true
else
  echo "==> CPU mode selected: skipping RuntimeClass nvidia and GPU smoke test."
fi

# -----------------------------------------------------------------------------
# 5. Install KEDA from infra/cluster/keda
# -----------------------------------------------------------------------------
echo "==> Deploying KEDA from $KEDA_DIR..."
kubectl kustomize --enable-helm "$KEDA_DIR" | \
  "${KUBECTL_CMD[@]}" apply --server-side --force-conflicts -f -

echo "==> Waiting for KEDA rollouts..."
for dep in keda-operator keda-operator-metrics-apiserver keda-admission-webhooks; do
  "${KUBECTL_CMD[@]}" -n keda rollout status "deployment/$dep" --timeout=300s
done

echo "==> Waiting for KEDA external metrics API service..."
"${KUBECTL_CMD[@]}" wait --for=condition=Available apiservice/v1beta1.external.metrics.k8s.io --timeout=180s

# -----------------------------------------------------------------------------
# 6. Create namespace and random secrets for local cluster
# -----------------------------------------------------------------------------
echo "==> Setting up namespace imgproc and random secrets..."
"${KUBECTL_CMD[@]}" create namespace imgproc --dry-run=client -o yaml | \
  "${KUBECTL_CMD[@]}" apply -f -

if ! "${KUBECTL_CMD[@]}" -n imgproc get secret imgproc-minio >/dev/null 2>&1; then
  minio_user="minio_$(openssl rand -hex 4)"
  minio_pass="$(openssl rand -hex 16)"
  "${KUBECTL_CMD[@]}" -n imgproc create secret generic imgproc-minio \
    --from-literal=rootUser="$minio_user" \
    --from-literal=rootPassword="$minio_pass"
fi

if ! "${KUBECTL_CMD[@]}" -n imgproc get secret imgproc-postgres >/dev/null 2>&1; then
  pg_admin_pass="$(openssl rand -hex 16)"
  pg_user_pass="$(openssl rand -hex 16)"
  "${KUBECTL_CMD[@]}" -n imgproc create secret generic imgproc-postgres \
    --from-literal=postgres-password="$pg_admin_pass" \
    --from-literal=password="$pg_user_pass"
fi

# -----------------------------------------------------------------------------
# 7. Apply application overlay and wait for readiness
# -----------------------------------------------------------------------------
echo "==> Applying app manifests from overlay ($OVERLAY_DIR)..."
"${KUBECTL_CMD[@]}" delete job -n imgproc -l app.kubernetes.io/part-of=imgproc-setup --ignore-not-found=true

if [ "$CPU_MODE" -eq 1 ]; then
  # Skip the GPU patch by creating a temporary overlay without gpu-patch.yaml
  tmp_overlay="$SCRIPT_DIR/.overlay-cpu-$$"
  mkdir -p "$tmp_overlay"
  cp -r "$OVERLAY_DIR"/* "$tmp_overlay"/
  sed -i '/gpu-patch\.yaml/d' "$tmp_overlay/kustomization.yaml"
  kubectl kustomize --enable-helm "$tmp_overlay" | "${KUBECTL_CMD[@]}" apply -f -
  rm -rf "$tmp_overlay"
else
  kubectl kustomize --enable-helm "$OVERLAY_DIR" | "${KUBECTL_CMD[@]}" apply -f -
fi

echo "==> Waiting for core workloads to be ready..."
"${KUBECTL_CMD[@]}" -n imgproc rollout status statefulset/nats --timeout=300s
"${KUBECTL_CMD[@]}" -n imgproc rollout status statefulset/postgresql --timeout=300s
"${KUBECTL_CMD[@]}" -n imgproc rollout status deployment/minio --timeout=300s

echo "==> Waiting for setup jobs to complete..."
for job in nats-setup minio-setup; do
  "${KUBECTL_CMD[@]}" -n imgproc wait --for=condition=complete "job/$job" --timeout=300s
done

echo "==> Waiting for web and worker deployments..."
"${KUBECTL_CMD[@]}" -n imgproc rollout status deployment/web --timeout=300s
"${KUBECTL_CMD[@]}" -n imgproc rollout status deployment/image-worker --timeout=300s
"${KUBECTL_CMD[@]}" -n imgproc rollout status deployment/video-worker --timeout=300s

echo ""
echo "========================================================================"
echo "Local benchmark cluster is ready!"
echo ""
echo "To run benchmark tests against this cluster:"
echo "  KUBECONFIG=$KUBECONFIG KUBE_CONTEXT=$KUBE_CONTEXT infra/bench/run.sh --machine laptop-rtx3050 --workers 1"
echo ""
echo "To run with autoscale:"
echo "  KUBECONFIG=$KUBECONFIG KUBE_CONTEXT=$KUBE_CONTEXT infra/bench/run.sh --machine laptop-rtx3050 --autoscale --min 0 --max 3"
echo "========================================================================"
