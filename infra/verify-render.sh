#!/usr/bin/env bash
# Rendered-manifest checks (acceptance criteria #1 and #2).
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

MEM_LIMIT_TOTAL_MI=0
MEM_STEADY_TOTAL_MI=0

check_workloads() {
  local file="$1"
  local ns="$2"
  python3 - "$file" "$ns" <<'PY'
import sys, yaml

path, ns = sys.argv[1], sys.argv[2]
problems = []
total = 0
steady = 0
for doc in yaml.safe_load_all(open(path)):
    if not doc:
        continue
    kind = doc.get("kind")
    if kind not in ("Deployment", "StatefulSet", "Job"):
        continue
    md = doc.get("metadata", {})
    name = md.get("name")
    got_ns = md.get("namespace")
    if got_ns != ns:
        problems.append(f"{kind}/{name}: namespace {got_ns} != {ns}")
    spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    sel = (spec.get("nodeSelector") or {}).get("kubernetes.io/hostname")
    if sel != "home-server":
        problems.append(f"{kind}/{name}: nodeSelector {sel!r} != 'home-server'")
    # init containers are transient too, but they still need a limit
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

# Every Deployment/StatefulSet that mounts a PVC and runs its main container as
# a non-root uid needs an ownership init container: the lab's local-path storage
# dir carries inherited POSIX ACLs whose mask caps the group class, so a
# non-root uid can only write if the volume is *owned* by it.
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
    # StatefulSet PVCs come from volumeClaimTemplates
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
        continue   # runs as root (NATS): the ACL mask does not apply to root

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
            details = []
            for ic in inits:
                sc = ic.get("securityContext") or {}
                caps = (sc.get("capabilities") or {}).get("add") or []
                mounts = {m.get("name") for m in (ic.get("volumeMounts") or [])}
                why = []
                if sc.get("runAsUser") != 0:
                    why.append(f"runAsUser={sc.get('runAsUser')}")
                if "CHOWN" not in caps:
                    why.append(f"capabilities.add={caps or 'none'}")
                if volume not in mounts:
                    why.append(f"does not mount {volume}")
                details.append(f"{ic.get('name')} [{', '.join(why)}]")
            problems.append(
                f"{where}: volume {volume} is mounted by a non-root container but no init "
                f"container chowns it as root with CHOWN"
                + (f" (candidates: {'; '.join(details)})" if details else " (no init containers)"))

for p in problems:
    print("PROBLEM:", p)
sys.exit(1 if problems else 0)
OWN
}

# the public results route must only ever match GET and HEAD
check_results_route() {
  python3 - "$1" "$2" <<'ROUTE'
import sys, yaml

path, want_host = sys.argv[1], sys.argv[2]
problems = []
for doc in yaml.safe_load_all(open(path)):
    if not doc or doc.get("kind") != "HTTPRoute":
        continue
    spec = doc.get("spec") or {}
    name = doc.get("metadata", {}).get("name")
    parents = spec.get("parentRefs") or []
    if not any(p.get("name") == "traefik-gateway" and p.get("namespace") == "traefik" for p in parents):
        problems.append(f"{name}: parentRefs is not traefik-gateway/traefik")
    hosts = spec.get("hostnames") or []
    if hosts != [want_host]:
        problems.append(f"{name}: hostnames {hosts} != [{want_host!r}]")
    for rule in spec.get("rules") or []:
        methods = set()
        for match in rule.get("matches") or []:
            path = (match.get("path") or {}).get("value")
            if path != "/results/":
                problems.append(f"{name}: unexpected path match {path!r}")
            methods.add(match.get("method"))
        if methods != {"GET", "HEAD"}:
            problems.append(f"{name}: methods {sorted(m or "-" for m in methods)} != ['GET', 'HEAD']")
        for backend in rule.get("backendRefs") or []:
            if backend.get("name") != "minio" or backend.get("port") != 9000:
                problems.append(f"{name}: backendRef {backend} is not minio:9000")
for problem in problems:
    print("PROBLEM:", problem)
sys.exit(1 if problems else 0)
ROUTE
}

# no rendered image may reference an image we can no longer pull
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
        containers = list(spec.get("containers") or []) + list(spec.get("initContainers") or [])
    elif kind == "Pod":
        spec = doc.get("spec") or {}
        containers = list(spec.get("containers") or []) + list(spec.get("initContainers") or [])
    elif kind == "CronJob":
        job = ((doc.get("spec") or {}).get("jobTemplate") or {}).get("spec") or {}
        spec = (job.get("template") or {}).get("spec", {})
        containers = list(spec.get("containers") or []) + list(spec.get("initContainers") or [])
    else:
        continue
    for container in containers:
        image = container.get("image") or ""
        for bad in FORBIDDEN:
            if image.startswith(bad) or (":" + bad) in image or ("/" + bad) in image:
                problems.append(f"{where}: container {container.get('name')} uses unpullable image {image}")
for problem in problems:
    print("PROBLEM:", problem)
sys.exit(1 if problems else 0)
IMG
}

# no container may declare the same env var twice: duplicate keys in the merge
# list make `kubectl apply` warn (or fail) on re-apply
check_duplicate_env() {
  python3 - "$1" <<'DUPENV'
import sys, yaml

WORKLOAD_KINDS = ("Deployment", "StatefulSet", "Job", "DaemonSet", "ReplicaSet")
problems = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    kind = doc.get("kind")
    name = doc.get("metadata", {}).get("name")
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
                problems.append(
                    f"{kind}/{name}: container {container.get('name')} declares env {env_name} twice")
            seen.add(env_name)
for problem in problems:
    print("PROBLEM:", problem)
sys.exit(1 if problems else 0)
DUPENV
}

# assert_container_limit <file> <kind> <name> <container> <expected-memory>
assert_container_limit() {
  python3 - "$1" "$2" "$3" "$4" "$5" <<'LIMIT'
import sys, yaml

path, kind, name, container_name, want = sys.argv[1:6]
found = None
for doc in yaml.safe_load_all(open(path)):
    if not doc or doc.get("kind") != kind or doc.get("metadata", {}).get("name") != name:
        continue
    spec = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    for container in spec.get("containers") or []:
        if container.get("name") == container_name:
            found = ((container.get("resources") or {}).get("limits") or {}).get("memory")
if found != want:
    print(f"PROBLEM: {kind}/{name} container {container_name} memory limit {found} != {want}")
    sys.exit(1)
sys.exit(0)
LIMIT
}

for env in dev prod; do
  ns="imgproc-$env"
  if [ "$env" = "prod" ]; then
    suffix=".sock1000kg.io.vn"
  else
    suffix="-dev.sock1000kg.io.vn"
  fi
  out="$(render "overlays/$env")" || {
    fail "kustomize build overlays/$env"
    continue
  }
  pass "kustomize build overlays/$env"

  if result="$(check_workloads "$out" "$ns")"; then
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

  # MinIO memory ceiling: dev stays small, prod takes the upload bursts
  want_minio="256Mi"
  [ "$env" = "prod" ] && want_minio="512Mi"
  if assert_container_limit "$out" Deployment minio minio "$want_minio"; then
    pass "$ns: MinIO memory limit is $want_minio"
  else
    fail "$ns: MinIO memory limit is not $want_minio"
  fi

  # minio must not carry the chart's 16Gi request
  if grep -q "16Gi" "$out"; then
    fail "$ns: rendered output still contains a 16Gi memory request"
  else
    pass "$ns: no 16Gi memory request"
  fi

  # no plaintext passwords outside Secrets
  if python3 - "$out" <<'PY'
import sys, yaml
bad = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind", "").endswith("Secret"):
        continue
    text = yaml.safe_dump(doc).lower()
    for needle in ("rootpassword:", "postgres-password:", "rootuser:"):
        if needle in text:
            bad.append(f"{doc.get('kind')}/{doc.get('metadata', {}).get('name')}: {needle}")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "$ns: no plaintext credentials in non-Secret resources"
  else
    fail "$ns: plaintext credentials found in non-Secret resources"
  fi

  # no :latest images
  if grep -qE 'image: .*:latest' "$out"; then
    fail "$ns: an image uses the :latest tag"
    grep -nE 'image: .*:latest' "$out" | head
  else
    pass "$ns: no :latest image tags"
  fi

  if check_duplicate_env "$out"; then
    pass "$ns: no container declares a duplicate env var"
  else
    fail "$ns: duplicate env vars found"
  fi

  # HTTPRoute wiring, restricted to GET/HEAD
  if check_results_route "$out" "imgproc$suffix"; then
    pass "$ns: HTTPRoute targets traefik-gateway/traefik, matches GET/HEAD only, backend minio:9000"
  else
    fail "$ns: HTTPRoute wiring or methods are wrong"
  fi

  if check_pullable_images "$out"; then
    pass "$ns: no container uses an unpullable MinIO image"
  else
    fail "$ns: unpullable MinIO image still referenced"
  fi

  if check_volume_ownership "$out"; then
    pass "$ns: every PVC-mounted non-root workload has a root/CHOWN ownership init container"
  else
    fail "$ns: a PVC-mounted non-root workload has no ownership init container"
  fi

  # all namespaced resources in the right namespace; a missing namespace is a
  # failure too, because `deploy.sh` applies without `-n` and it would land in
  # the applier's current namespace
  if python3 - "$out" "$ns" <<'PY'
import sys, yaml
CLUSTER_SCOPED = {
    "Namespace",
    "CustomResourceDefinition",
    "ClusterRole",
    "ClusterRoleBinding",
    "APIService",
    "ValidatingWebhookConfiguration",
    "MutatingWebhookConfiguration",
    "PriorityClass",
    "StorageClass",
}
bad = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    md = doc.get("metadata", {})
    if doc.get("kind") in CLUSTER_SCOPED:
        continue
    got = md.get("namespace")
    if got != sys.argv[2]:
        shown = got if got else "<none>"
        bad.append(f"{doc.get('kind')}/{md.get('name')}: {shown}")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "$ns: all namespaced resources land in $ns"
  else
    fail "$ns: resources outside $ns (or with no namespace)"
  fi
done

keda_out="$(render cluster/keda)" || fail "kustomize build cluster/keda"
if [ -n "${keda_out:-}" ]; then
  pass "kustomize build cluster/keda"
  if result="$(check_workloads "$keda_out" keda)"; then
    pass "keda: every Deployment pinned to home-server with memory limits"
  else
    echo "$result" | grep '^PROBLEM:' | sed 's/^/FAIL: /'
    FAILURES=$((FAILURES + 1))
  fi
  keda_total="$(echo "$result" | awk '/TOTAL_MI/ {print $2}')"
  MEM_LIMIT_TOTAL_MI=$((MEM_LIMIT_TOTAL_MI + keda_total))
  MEM_STEADY_TOTAL_MI=$((MEM_STEADY_TOTAL_MI + keda_total))
  echo "     keda memory limits total: ${keda_total}Mi"

  # Namespaced resources belong in `keda`, except the chart's intentional
  # kube-system readers (a top-level `namespace: keda` transformer used to drag
  # RoleBinding/keda-operator-auth-reader out of kube-system, which crashed the
  # metrics apiserver).
  if python3 - "$keda_out" <<'PY'
import sys, yaml
CLUSTER_SCOPED = {
    "Namespace",
    "CustomResourceDefinition",
    "ClusterRole",
    "ClusterRoleBinding",
    "APIService",
    "ValidatingWebhookConfiguration",
    "MutatingWebhookConfiguration",
    "PriorityClass",
    "StorageClass",
}
# namespaced objects the chart deliberately places in kube-system
ALLOW_KUBE_SYSTEM = {
    "RoleBinding/keda-operator-auth-reader",
}
bad = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc:
        continue
    md = doc.get("metadata", {})
    if doc.get("kind") in CLUSTER_SCOPED:
        continue
    where = f"{doc.get('kind')}/{md.get('name')}"
    ns = md.get("namespace")
    # a namespaced kind with no namespace lands in the applier's current
    # namespace (`default` here), which is never what we want
    if not ns:
        bad.append(f"{where}: no metadata.namespace")
        continue
    if ns == "keda":
        continue
    if ns == "kube-system" and where in ALLOW_KUBE_SYSTEM:
        continue
    bad.append(f"{where}: {ns}")
for b in bad:
    print("PROBLEM: resource not in keda (or not on the kube-system allow-list):", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "keda: all namespaced resources land in keda (allow-list: RoleBinding/keda-operator-auth-reader in kube-system)"
  else
    fail "keda: resources outside the keda namespace"
  fi

  # nothing may render into `default`, and a namespaced kind must never be
  # namespace-less either: `kubectl apply` without `-n` would create it in `default`
  if python3 - "$keda_out" <<'PY'
import sys, yaml
CLUSTER_SCOPED = {
    "Namespace", "CustomResourceDefinition", "ClusterRole", "ClusterRoleBinding",
    "APIService", "ValidatingWebhookConfiguration", "MutatingWebhookConfiguration",
    "PriorityClass", "StorageClass",
}
bad = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") in CLUSTER_SCOPED:
        continue
    md = doc.get("metadata", {})
    where = f"{doc.get('kind')}/{md.get('name')}"
    ns = md.get("namespace")
    if ns == "default":
        bad.append(f"{where}: rendered into the default namespace")
    elif not ns:
        bad.append(f"{where}: no metadata.namespace (would be applied into default)")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "keda: nothing renders into the default namespace (and nothing is namespace-less)"
  else
    fail "keda: resources rendered into the default namespace, or with no namespace"
  fi

  # the metrics apiserver needs its configmap reader in kube-system
  if python3 - "$keda_out" <<'PY'
import sys, yaml
bad = []
seen = False
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") != "RoleBinding":
        continue
    md = doc.get("metadata", {})
    if md.get("name") != "keda-operator-auth-reader":
        continue
    seen = True
    if md.get("namespace") != "kube-system":
        bad.append(f"RoleBinding/keda-operator-auth-reader is in {md.get('namespace')}, not kube-system")
    role_ref = doc.get("roleRef") or {}
    if (role_ref.get("kind"), role_ref.get("name")) != (
        "Role", "extension-apiserver-authentication-reader"):
        bad.append(f"roleRef is {role_ref.get('kind')}/{role_ref.get('name')}, "
                   "not Role/extension-apiserver-authentication-reader")
    subs = doc.get("subjects") or []
    if [(s.get("namespace"), s.get("name"), s.get("kind")) for s in subs] != [
            ("keda", "keda-metrics-server", "ServiceAccount")]:
        bad.append(f"subjects are {subs}, not ServiceAccount keda/keda-metrics-server")
if not seen:
    bad.append("RoleBinding/keda-operator-auth-reader is missing")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "keda: RoleBinding/keda-operator-auth-reader binds keda/keda-metrics-server to the kube-system configmap reader"
  else
    fail "keda: RoleBinding/keda-operator-auth-reader is wrong"
  fi

  # the external metrics APIService must point at the keda metrics apiserver
  if python3 - "$keda_out" <<'PY'
import sys, yaml
bad = []
found = False
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") != "APIService":
        continue
    if doc.get("metadata", {}).get("name") != "v1beta1.external.metrics.k8s.io":
        continue
    found = True
    svc = (doc.get("spec") or {}).get("service") or {}
    if (svc.get("namespace"), svc.get("name")) != ("keda", "keda-operator-metrics-apiserver"):
        bad.append(f"spec.service is {svc.get('namespace')}/{svc.get('name')}, "
                   "not keda/keda-operator-metrics-apiserver")
    if (doc.get("spec") or {}).get("group") != "external.metrics.k8s.io":
        bad.append(f"spec.group is {(doc.get('spec') or {}).get('group')!r}")
if not found:
    bad.append("APIService v1beta1.external.metrics.k8s.io is missing")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "keda: APIService v1beta1.external.metrics.k8s.io -> keda/keda-operator-metrics-apiserver"
  else
    fail "keda: APIService v1beta1.external.metrics.k8s.io is wrong"
  fi

  # ClusterRoleBindings may only bind ServiceAccounts from `keda`, except the
  # chart's HPA delegate binding to the built-in kube-system autoscaler SA
  if python3 - "$keda_out" <<'PY'
import sys, yaml
EXTERNAL_SUBJECTS = {("keda-operator-hpa-controller-external-metrics",
                      "kube-system", "horizontal-pod-autoscaler")}
bad = []
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") != "ClusterRoleBinding":
        continue
    name = doc.get("metadata", {}).get("name")
    for s in doc.get("subjects") or []:
        if s.get("kind") != "ServiceAccount":
            continue
        ns, sub = s.get("namespace"), s.get("name")
        if ns == "keda" or (name, ns, sub) in EXTERNAL_SUBJECTS:
            continue
        bad.append(f"ClusterRoleBinding/{name} binds ServiceAccount {ns}/{sub}")
for b in bad:
    print("PROBLEM:", b)
sys.exit(1 if bad else 0)
PY
  then
    pass "keda: every ClusterRoleBinding binds ServiceAccounts in keda"
  else
    fail "keda: a ClusterRoleBinding binds a ServiceAccount outside keda"
  fi

  if grep -qE 'image: .*:latest' "$keda_out"; then
    fail "keda: an image uses the :latest tag"
  else
    pass "keda: no :latest image tags"
  fi

  if check_pullable_images "$keda_out"; then
    pass "keda: no container uses an unpullable MinIO image"
  else
    fail "keda: unpullable MinIO image still referenced"
  fi

  if check_duplicate_env "$keda_out"; then
    pass "keda: no container declares a duplicate env var"
  else
    fail "keda: duplicate env vars found"
  fi

  if check_volume_ownership "$keda_out"; then
    pass "keda: every PVC-mounted non-root workload has a root/CHOWN ownership init container"
  else
    fail "keda: a PVC-mounted non-root workload has no ownership init container"
  fi

  for want in "operator:256Mi" "metricServer:128Mi" "webhooks:64Mi"; do
    dep="${want%%:*}"
    lim="${want##*:}"
    case "$dep" in
      operator) full="keda-operator" ;;
      metricServer) full="keda-operator-metrics-apiserver" ;;
      webhooks) full="keda-admission-webhooks" ;;
    esac
    if assert_container_limit "$keda_out" Deployment "$full" "$full" "$lim"; then
      pass "keda: $full memory limit is $lim"
    else
      fail "keda: $full memory limit is not $lim"
    fi
  done
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
