#!/usr/bin/env bash
# Rendered-manifest checks for dev, prod, and keda overlays.
#   bash infra/verify-render.sh
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
pass() { echo "PASS: $*"; }
fail() {
  echo "FAIL: $*"
  FAILURES=$((FAILURES + 1))
}

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl not found" >&2
  exit 2
}

# Rule 1: Render overlay
render() {
  local dir="$1"
  local out
  out="$WORK/$(echo "$dir" | tr '/' '_').yaml"
  if kubectl kustomize --enable-helm "$SCRIPT_DIR/$dir" >"$out" 2>"$WORK/err"; then
    echo "$out"
  else
    cat "$WORK/err" >&2
    return 1
  fi
}

# Rules 2 & 3: Workloads pinned to home-server with memory limits, platform steady-state memory calculation
check_workloads() {
  local file="$1"
  python3 - "$file" <<'PY'
import sys, yaml

problems = []
total = 0
steady = 0
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    kind = doc.get("kind")
    if kind not in ("Deployment", "StatefulSet", "Job"):
        continue
    md = doc.get("metadata", {})
    name = md.get("name")
    spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    sel = (spec.get("nodeSelector") or {}).get("kubernetes.io/hostname")
    if sel != "home-server":
        problems.append(f"{kind}/{name}: nodeSelector {sel!r} != 'home-server'")
    labels = md.get("labels") or {}
    is_worker = (labels.get("app.kubernetes.io/component") == "worker")
    for c in (spec.get("containers") or []) + (spec.get("initContainers") or []):
        res = c.get("resources") or {}
        lim = (res.get("limits") or {}).get("memory")
        if not lim:
            problems.append(f"{kind}/{name}: container {c.get('name')} has no memory limit")
        else:
            unit = lim[-2:]
            val = int(lim[:-2]) if unit in ("Mi", "Gi") else int(round(float(lim.rstrip("m")) / 1000))
            if unit == "Gi":
                val *= 1024
            # Worker pools are dev-only and reported separately from platform services
            if not is_worker:
                total += val
                # setup Jobs are one-shot (ttlSecondsAfterFinished: 600) and init
                # containers only run before the pod goes Ready, so the steady-state
                # footprint excludes them
                if kind != "Job" and c in (spec.get("containers") or []):
                    steady += val
for p in problems:
    print("PROBLEM:", p)
print("TOTAL_MI:", total)
print("STEADY_MI:", steady)
sys.exit(1 if problems else 0)
PY
}

# Rule 4: No unpullable MinIO images
check_pullable_images() {
  python3 - "$1" <<'IMG'
import sys, yaml

FORBIDDEN = ("quay.io/minio", "minio/mc", "docker.io/minio/")
problems = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    kind = doc.get("kind")
    md = doc.get("metadata", {})
    where = f"{kind}/{md.get('name')}"
    if kind in ("Deployment", "StatefulSet", "Job", "DaemonSet", "ReplicaSet"):
        spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    elif kind == "Pod":
        spec = doc.get("spec") or {}
    elif kind == "CronJob":
        job = ((doc.get("spec") or {}).get("jobTemplate") or {}).get("spec") or {}
        spec = (job.get("template") or {}).get("spec", {})
    else:
        continue
    containers = list(spec.get("containers") or []) + list(spec.get("initContainers") or [])
    for container in containers:
        image = container.get("image") or ""
        for bad in FORBIDDEN:
            if image.startswith(bad) or (":" + bad) in image or ("/" + bad) in image:
                problems.append(f"{where}: container {container.get('name')} uses unpullable image {image}")
for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
IMG
}

# Rule 5: KEDA: nothing renders into default, RoleBinding/keda-operator-auth-reader stays in kube-system
check_keda() {
  python3 - "$1" <<'KEDA'
import sys, yaml

CLUSTER_SCOPED = {
    "Namespace", "CustomResourceDefinition", "ClusterRole", "ClusterRoleBinding",
    "APIService", "ValidatingWebhookConfiguration", "MutatingWebhookConfiguration",
    "PriorityClass", "StorageClass",
}
problems = []
auth_reader_found = False

for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    kind = doc.get("kind")
    md = doc.get("metadata", {})
    name = md.get("name")
    where = f"{kind}/{name}"
    if kind not in CLUSTER_SCOPED:
        ns = md.get("namespace")
        if ns == "default":
            problems.append(f"{where}: rendered into default namespace")
        elif not ns:
            problems.append(f"{where}: no metadata.namespace (would default to default)")
    if kind == "RoleBinding" and name == "keda-operator-auth-reader":
        auth_reader_found = True
        ns = md.get("namespace")
        if ns != "kube-system":
            problems.append(f"{where}: namespace is {ns!r}, expected 'kube-system'")

if not auth_reader_found:
    problems.append("RoleBinding/keda-operator-auth-reader missing")

for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
KEDA
}

# Rule 6: Non-root workload with PVC must have root CHOWN init container
check_volume_ownership() {
  python3 - "$1" <<'OWN'
import sys, yaml

problems = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") not in ("Deployment", "StatefulSet"):
        continue
    md = doc.get("metadata", {})
    where = f"{doc.get('kind')}/{md.get('name')}"
    spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    pod_sc = spec.get("securityContext") or {}

    pvc_volumes = {v["name"] for v in (spec.get("volumes") or [])
                   if (v.get("persistentVolumeClaim") or {}).get("claimName")}
    for tpl in ((doc.get("spec") or {}).get("volumeClaimTemplates") or []):
        pvc_volumes.add(tpl["metadata"]["name"])
    if not pvc_volumes:
        continue

    def runs_as(c):
        uid = ((c.get("securityContext") or {}).get("runAsUser")
               or pod_sc.get("runAsUser"))
        return uid is None or uid == 0   # unset means root

    main = [c for c in (spec.get("containers") or []) if not runs_as(c)]
    if not main:
        continue   # runs as root

    inits = spec.get("initContainers") or []
    for volume in sorted(pvc_volumes):
        fixer = None
        for ic in inits:
            sc = ic.get("securityContext") or {}
            caps = ((sc.get("capabilities") or {}).get("add") or [])
            mounts = {m.get("name") for m in (ic.get("volumeMounts") or [])}
            if sc.get("runAsUser") == 0 and "CHOWN" in caps and volume in mounts:
                fixer = ic
                break
        if fixer is None:
            problems.append(
                f"{where}: volume {volume} is mounted by non-root container but lacks root/CHOWN init container"
            )

for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
OWN
}

# Rule 7: /results/ route allows GET and HEAD only
check_results_route() {
  python3 - "$1" <<'ROUTE'
import sys, yaml

problems = []
found_route = False
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") != "HTTPRoute":
        continue
    name = (doc.get("metadata") or {}).get("name")
    for rule in (doc.get("spec") or {}).get("rules") or []:
        for match in rule.get("matches") or []:
            if (match.get("path") or {}).get("value") == "/results/":
                found_route = True
                methods = {m.get("method") for m in rule.get("matches") or []}
                if methods != {"GET", "HEAD"}:
                    problems.append(f"{name}: /results/ methods {sorted(m or '-' for m in methods)} != ['GET', 'HEAD']")
if not found_route:
    problems.append("HTTPRoute for /results/ not found")
for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
ROUTE
}

# Rule 8: No duplicate env names in any container
check_duplicate_env() {
  python3 - "$1" <<'DUPENV'
import sys, yaml

WORKLOAD_KINDS = ("Deployment", "StatefulSet", "Job", "DaemonSet", "ReplicaSet")
problems = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    kind = doc.get("kind")
    name = (doc.get("metadata") or {}).get("name")
    if kind in WORKLOAD_KINDS:
        spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    elif kind == "Pod":
        spec = doc.get("spec") or {}
    elif kind == "CronJob":
        job = ((doc.get("spec") or {}).get("jobTemplate") or {}).get("spec") or {}
        spec = (job.get("template") or {}).get("spec", {})
    else:
        continue
    containers = list(spec.get("containers") or []) + list(spec.get("initContainers") or [])
    for container in containers:
        seen = set()
        for entry in container.get("env") or []:
            env_name = entry.get("name")
            if env_name in seen:
                problems.append(f"{kind}/{name}: container {container.get('name')} declares env {env_name} twice")
            seen.add(env_name)
for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
DUPENV
}

# Rule 9: Workers: dev only, contract §4 stream/consumer pair
check_workers() {
  local dev_file="$1"
  local prod_file="$2"
  python3 - "$dev_file" "$prod_file" <<'WORKERS'
import sys, yaml

dev_path, prod_path = sys.argv[1], sys.argv[2]
problems = []

# 1. Assert no worker workloads render in prod
for doc in yaml.safe_load_all(open(prod_path)):
    if not doc:
        continue
    kind = doc.get("kind")
    md = doc.get("metadata", {}) or {}
    name = md.get("name", "")
    labels = md.get("labels", {}) or {}
    if labels.get("app.kubernetes.io/component") == "worker" or name in ("ai-worker", "image-worker"):
        problems.append(f"prod: {kind}/{name} rendered in prod (workers must only render in dev)")

# 2. Assert workers in dev follow contract §4
VALID_PAIRS = {("AI_JOBS", "ai-workers"), ("IMAGE_JOBS", "image-workers")}
expected_workers = {"ai-worker", "image-worker"}
found_workers = set()
workers = {}

for doc in yaml.safe_load_all(open(dev_path)):
    if not doc or doc.get("kind") != "Deployment":
        continue
    md = doc.get("metadata", {}) or {}
    name = md.get("name", "")
    labels = md.get("labels", {}) or {}
    if labels.get("app.kubernetes.io/component") != "worker":
        if name in expected_workers:
            problems.append(f"dev: Deployment/{name} is missing 'app.kubernetes.io/component: worker' label")
        continue

    found_workers.add(name)
    spec = doc.get("spec", {}) or {}
    tpl_spec = (spec.get("template", {}) or {}).get("spec", {}) or {}
    containers = tpl_spec.get("containers", []) or []
    if not containers:
        problems.append(f"dev: Deployment/{name} has no containers")
        continue

    main_c = containers[0]
    res = main_c.get("resources", {}) or {}
    lim = (res.get("limits") or {}).get("memory", "")
    unit = lim[-2:]
    mem_limit_mi = int(lim[:-2]) if unit in ("Mi", "Gi") else int(round(float(lim.rstrip("m")) / 1000)) if lim else 0
    if unit == "Gi":
        mem_limit_mi *= 1024

    stream_val = None
    consumer_val = None
    for env_entry in main_c.get("env", []) or []:
        if env_entry.get("name") == "NATS_STREAM_NAME":
            stream_val = env_entry.get("value")
        elif env_entry.get("name") == "NATS_CONSUMER_NAME":
            consumer_val = env_entry.get("value")

    if (stream_val, consumer_val) not in VALID_PAIRS:
        problems.append(
            f"dev: Deployment/{name} has invalid NATS_STREAM_NAME/NATS_CONSUMER_NAME pair: "
            f"({stream_val!r}, {consumer_val!r}) not in contract §4 {sorted(VALID_PAIRS)}"
        )

    replicas = spec.get("replicas", 1) or 1
    total_pool_mem = replicas * mem_limit_mi
    workers[name] = (replicas, mem_limit_mi, total_pool_mem)

missing = expected_workers - found_workers
if missing:
    problems.append(f"dev: missing expected worker deployments: {sorted(missing)}")

for p in problems:
    print("PROBLEM:", p)

for name, (reps, lim, tot) in sorted(workers.items()):
    print(f"WORKER: {name}: {reps} replica(s) x {lim}Mi limit = {tot}Mi")
total_worker_mem = sum(w[2] for w in workers.values())
print("TOTAL_WORKER_MI:", total_worker_mem)

sys.exit(1 if problems else 0)
WORKERS
}

MEM_LIMIT_TOTAL_MI=0
MEM_STEADY_TOTAL_MI=0

DEV_OUT=""
PROD_OUT=""

for env in dev prod; do
  ns="imgproc-$env"
  out="$(render "overlays/$env")" || {
    fail "kustomize build overlays/$env"
    continue
  }
  pass "kustomize build overlays/$env"
  [ "$env" = "dev" ] && DEV_OUT="$out"
  [ "$env" = "prod" ] && PROD_OUT="$out"

  if result="$(check_workloads "$out")"; then
    pass "$ns: every Deployment/StatefulSet/Job pinned to home-server with memory limits"
  else
    echo "$result" | grep '^PROBLEM:' | sed "s/^/FAIL: /"
    FAILURES=$((FAILURES + 1))
  fi
  total="$(echo "$result" | awk '/TOTAL_MI/ {print $2}')"
  steady="$(echo "$result" | awk '/STEADY_MI/ {print $2}')"
  MEM_LIMIT_TOTAL_MI=$((MEM_LIMIT_TOTAL_MI + total))
  MEM_STEADY_TOTAL_MI=$((MEM_STEADY_TOTAL_MI + steady))
  echo "     $ns memory limits total: ${total}Mi (steady-state without setup Jobs: ${steady}Mi)"

  if check_pullable_images "$out"; then
    pass "$ns: no unpullable MinIO images"
  else
    fail "$ns: unpullable MinIO image found"
  fi

  if check_volume_ownership "$out"; then
    pass "$ns: non-root workloads with PVC have root/CHOWN init container"
  else
    fail "$ns: missing root/CHOWN init container on PVC workload"
  fi

  if check_results_route "$out"; then
    pass "$ns: /results/ route allows GET and HEAD only"
  else
    fail "$ns: /results/ route configuration invalid"
  fi

  if check_duplicate_env "$out"; then
    pass "$ns: no duplicate env names in containers"
  else
    fail "$ns: duplicate env names found"
  fi
done

if [ -n "$DEV_OUT" ] && [ -n "$PROD_OUT" ]; then
  echo
  echo "== Worker Deployments (dev only, contract §4)"
  if worker_result="$(check_workers "$DEV_OUT" "$PROD_OUT")"; then
    pass "workers render in dev only with valid contract stream/consumer pairs"
  else
    echo "$worker_result" | grep '^PROBLEM:' | sed "s/^/FAIL: /"
    FAILURES=$((FAILURES + 1))
  fi
  echo "$worker_result" | grep '^WORKER:' | sed 's/^WORKER: /     /'
  worker_total="$(echo "$worker_result" | awk '/TOTAL_WORKER_MI/ {print $2}')"
  echo "     Total worker memory limits (informational, dev only): ${worker_total:-0}Mi"
fi

keda_out="$(render cluster/keda)" || fail "kustomize build cluster/keda"
if [ -n "${keda_out:-}" ]; then
  pass "kustomize build cluster/keda"
  if result="$(check_workloads "$keda_out")"; then
    pass "keda: every Deployment pinned to home-server with memory limits"
  else
    echo "$result" | grep '^PROBLEM:' | sed 's/^/FAIL: /'
    FAILURES=$((FAILURES + 1))
  fi
  keda_total="$(echo "$result" | awk '/TOTAL_MI/ {print $2}')"
  MEM_LIMIT_TOTAL_MI=$((MEM_LIMIT_TOTAL_MI + keda_total))
  MEM_STEADY_TOTAL_MI=$((MEM_STEADY_TOTAL_MI + keda_total))
  echo "     keda memory limits total: ${keda_total}Mi"

  if check_keda "$keda_out"; then
    pass "keda: nothing renders into default and RoleBinding/keda-operator-auth-reader in kube-system"
  else
    fail "keda: namespace checks failed"
  fi

  if check_pullable_images "$keda_out"; then
    pass "keda: no unpullable MinIO images"
  else
    fail "keda: unpullable MinIO image found"
  fi

  if check_duplicate_env "$keda_out"; then
    pass "keda: no duplicate env names in containers"
  else
    fail "keda: duplicate env names found"
  fi
fi

echo
echo "TOTAL memory limits incl. setup Jobs (dev + prod + keda): ${MEM_LIMIT_TOTAL_MI}Mi"
echo "TOTAL memory limits steady-state (setup Jobs excluded):   ${MEM_STEADY_TOTAL_MI}Mi"
if [ "$MEM_STEADY_TOTAL_MI" -le 2560 ]; then
  pass "steady-state memory budget within ~2.5Gi"
else
  fail "steady-state memory budget exceeded: ${MEM_STEADY_TOTAL_MI}Mi > 2560Mi"
fi
echo "(the incl.-Jobs figure is informational only; the gate is the steady-state total)"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL RENDER CHECKS PASSED"
else
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi
