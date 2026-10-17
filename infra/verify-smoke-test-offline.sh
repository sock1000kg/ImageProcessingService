#!/usr/bin/env bash
# Offline checks for infra/smoke-test.sh (no cluster needed).
#
#   MINIO_ROOT_USER=... MINIO_ROOT_PASSWORD=... bash infra/verify-smoke-test-offline.sh
#
# 1. Asks smoke-test.sh itself for the exact `kubectl run` argument vector of each
#    throwaway pod (`--print-pod-specs`) and replays every one of them through
#    `kubectl run --dry-run=client -o yaml` against a stub apiserver, asserting
#    command/args, image, nodeSelector and restartPolicy. Replaying the real
#    vector means a regression like `--command=/bin/sh -c ...` (boolean flag
#    misused) or a missing `$0` placeholder fails here.
# 2. Executes the embedded pod scripts locally (POSIX sh) against a local
#    nats-server / minio / mc, using the same `sh -c "$SCRIPT" sh "$ARG"` shape
#    kubectl executes inside the pod.
#
# Needs: kubectl, python3 (+ PyYAML), and for step 2 the nats CLI / mc plus a
# reachable nats-server and minio (see infra/verify-local-setup.sh).
set -uo pipefail

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SMOKE="$REPO/smoke-test.sh"
FAIL=0
ok() { echo "PASS: $*"; }
no() {
  echo "FAIL: $*"
  FAIL=1
}

for tool in kubectl python3; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "verify-smoke-test-offline.sh: $tool not found" >&2
    exit 2
  }
done
python3 -c "import yaml" 2>/dev/null || {
  echo "verify-smoke-test-offline.sh: python3 PyYAML not available" >&2
  exit 2
}

WORK="$(mktemp -d)"
STUB_PID=""
# shellcheck disable=SC2317,SC2329  # invoked indirectly via trap
cleanup() {
  if [ -n "$STUB_PID" ]; then
    kill "$STUB_PID" 2>/dev/null
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---------------------------------------------------------------- stub server
cat >"$WORK/fakeapi.py" <<'STUB'
import http.server, json, socketserver, sys

API_V1 = {
    "kind": "APIResourceList",
    "groupVersion": "v1",
    "resources": [
        {"name": "pods", "singularName": "", "namespaced": True, "kind": "Pod",
         "verbs": ["create", "get", "list", "delete"], "shortNames": ["po"]},
        {"name": "services", "singularName": "", "namespaced": True, "kind": "Service",
         "verbs": ["create", "get", "list"]},
        {"name": "configmaps", "singularName": "", "namespaced": True, "kind": "ConfigMap",
         "verbs": ["create", "get", "list"]},
        {"name": "secrets", "singularName": "", "namespaced": True, "kind": "Secret",
         "verbs": ["create", "get", "list"]},
        {"name": "namespaces", "singularName": "", "namespaced": False, "kind": "Namespace",
         "verbs": ["create", "get", "list"]},
    ],
}
ROOT = {"kind": "APIVersions", "versions": ["v1"], "serverAddressByClientCIDRs": []}
GROUPS = {"kind": "APIGroupList", "apiVersion": "v1", "groups": []}
VER = {"major": "1", "minor": "29", "gitVersion": "v1.29.0", "platform": "linux/amd64"}


LOG_PATH = sys.argv[2]


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def log_request_line(self):
        # record every request so the test can prove print mode never calls us
        with open(LOG_PATH, "a") as fh:
            fh.write(f"{self.command} {self.path}\n")

    def send_json(self, obj, code=200):
        self.log_request_line()
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api":
            return self.send_json(ROOT)
        if path == "/api/v1":
            return self.send_json(API_V1)
        if path == "/apis":
            return self.send_json(GROUPS)
        if path == "/version":
            return self.send_json(VER)
        return self.send_json({"kind": "Status", "status": "Failure", "code": 404})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        self.send_json({"kind": "Status", "status": "Success"}, code=201)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", int(sys.argv[1])), Handler) as httpd:
    httpd.serve_forever()
STUB

PORT="${STUB_PORT:-}"
if [ -z "$PORT" ]; then
  PORT="$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")"
fi
STUB_LOG="$WORK/apiserver-requests.log"
: >"$STUB_LOG"
python3 "$WORK/fakeapi.py" "$PORT" "$STUB_LOG" &
STUB_PID=$!
sleep 2
cat >"$WORK/kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
- name: stub
  cluster:
    server: http://127.0.0.1:$PORT
contexts:
- name: stub
  context:
    cluster: stub
    user: stub
    namespace: imgproc-dev
current-context: stub
users:
- name: stub
  user: {}
EOF
export KUBECONFIG="$WORK/kubeconfig"
# private discovery cache: a warm ~/.kube cache would let kubectl answer from
# disk and make "print mode issued zero requests" pass for the wrong reason
export KUBECACHEDIR="$WORK/kube-cache"

# ------------------------------------- replay the real pod specs via dry-run
echo "== kubectl run --dry-run=client on the specs smoke-test.sh actually builds"
if ! bash "$SMOKE" dev --print-pod-specs >"$WORK/specs.txt" 2>"$WORK/specs.err"; then
  no "smoke-test.sh --print-pod-specs failed: $(cat "$WORK/specs.err")"
elif ! grep -q '^POD nats-smoke$' "$WORK/specs.txt"; then
  no "smoke-test.sh --print-pod-specs did not emit the expected pod specs"
else
  ok "smoke-test.sh --print-pod-specs emitted $(grep -c '^POD ' "$WORK/specs.txt") pod specs"
  cat >"$WORK/replay.py" <<'REPLAY'
import json, subprocess, sys

specs_path, out_path = sys.argv[1], sys.argv[2]

pods, name, args = [], None, []
for line in open(specs_path).read().split("\n"):
    if line.startswith("POD "):
        name, args = line[4:], []
    elif line.startswith("ARG "):
        import base64
        args.append(base64.b64decode(line[4:]).decode())
    elif line == "END" and name is not None:
        pods.append((name, args))
        name = None

report = []
for name, args in pods:
    cmd = ["kubectl", "-n", "imgproc-dev", "run", name,
           "--dry-run=client", "-o", "yaml", "--restart=Never"] + args
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        report.append({"pod": name, "ok": False,
                       "problems": [f"kubectl run failed: {proc.stderr.strip()}"]})
        continue
    import yaml
    doc = yaml.safe_load(proc.stdout)
    container = doc["spec"]["containers"][0]
    problems = []
    # `kubectl run --command -- /bin/sh -c SCRIPT sh ARG` puts the whole vector
    # into `command` (entrypoint + args), so validate the joined vector.
    argv = (container.get("command") or []) + (container.get("args") or [])
    if len(argv) < 3 or argv[0] != "/bin/sh" or argv[1] != "-c":
        problems.append(f"argv starts with {argv[:2]}, expected ['/bin/sh', '-c']")
    else:
        script, tail = argv[2], argv[3:]
        if len(script) < 40:
            problems.append("the embedded script looks truncated")
        # with `sh -c SCRIPT sh ARG`, `sh` is $0 and ARG must be $1
        if tail:
            if tail[0] != "sh":
                problems.append(f"argv[3] is {tail[0]!r}, expected the $0 placeholder 'sh'")
            elif len(tail) < 2 or not tail[1]:
                problems.append("the script argument ($1) is missing or empty")
        elif "docker-compose" in script or "minio" in script:
            problems.append("script takes a positional argument but none was passed")
    node = (doc["spec"].get("nodeSelector") or {}).get("kubernetes.io/hostname")
    if node != "home-server":
        problems.append(f"nodeSelector {node!r} != 'home-server'")
    if doc["spec"].get("restartPolicy") != "Never":
        problems.append("restartPolicy != Never")
    report.append({"pod": name, "ok": not problems, "image": container["image"],
                   "argv_tail": argv[3:], "problems": problems})

with open(out_path, "w") as fh:
    json.dump(report, fh)
failed = False
for entry in report:
    if entry["ok"]:
        print(f"PASS {entry['pod']}")
    else:
        failed = True
        print(f"FAIL {entry['pod']}")
        for problem in entry["problems"]:
            print(f"     {problem}")
sys.exit(1 if failed else 0)
REPLAY
  if python3 "$WORK/replay.py" "$WORK/specs.txt" "$WORK/report.json"; then
    ok "every throwaway pod spec renders to a valid Pod (/bin/sh -c <script> sh <arg>)"
  else
    no "at least one throwaway pod spec does not render as expected"
    FAIL=1
  fi
  python3 - "$WORK/report.json" <<'SUMMARY'
import json, sys

for entry in json.load(open(sys.argv[1])):
    if entry["ok"]:
        print(f"     {entry['pod']}: image={entry['image']} trailing argv={entry['argv_tail']}")
SUMMARY
fi

# ------------------------------- G4: print mode must not contact a cluster
echo "== --print-pod-specs must not contact the apiserver"
: >"$STUB_LOG"
rm -rf "$KUBECACHEDIR"
if bash "$SMOKE" dev --print-pod-specs >"$WORK/specs2.txt" 2>"$WORK/specs2.err"; then
  ok "smoke-test.sh dev --print-pod-specs ran"
else
  no "smoke-test.sh dev --print-pod-specs failed: $(cat "$WORK/specs2.err")"
fi
if [ -s "$STUB_LOG" ]; then
  no "print mode contacted the apiserver:"
  sed 's/^/     /' "$STUB_LOG"
else
  ok "print mode issued zero apiserver requests (stub log is empty)"
fi
if grep -q "secrets" "$STUB_LOG" 2>/dev/null; then
  no "print mode issued a /secrets request"
else
  ok "print mode issued no /secrets request"
fi
decoded="$WORK/specs-decoded.txt"
python3 - "$WORK/specs2.txt" "$decoded" <<'DECODE'
import base64, sys

out = []
for line in open(sys.argv[1]).read().split("\n"):
    if line.startswith("ARG "):
        out.append(base64.b64decode(line[4:]).decode())
    else:
        out.append(line)
open(sys.argv[2], "w").write("\n".join(out))
DECODE
if grep -q "PRINT_ONLY" "$decoded"; then
  ok "printed specs carry the PRINT_ONLY placeholder credentials"
else
  no "printed specs do not contain the PRINT_ONLY placeholder"
fi
if python3 - "$decoded" <<'CREDCHECK'
import re, sys

leaked = []
for line in open(sys.argv[1]):
    for match in re.finditer(r"(PGPASSWORD|MINIO_ROOT_PASSWORD|MINIO_ROOT_USER)=(\S*)", line):
        value = match.group(2).strip("\"'")
        if value and value != "PRINT_ONLY":
            leaked.append(f"{match.group(1)}={value}")
for item in leaked:
    print("     leaked:", item)
sys.exit(1 if leaked else 0)
CREDCHECK
then
  ok "printed specs contain no credential-looking values"
else
  no "printed specs contain credential-looking values"
fi

# ------------------------------------------------- extract the embedded scripts
cat >"$WORK/extract.py" <<'EXTRACT'
import re, sys

src = open(sys.argv[1]).read()
work = sys.argv[2]
names = ("POSTGRES_CHECK_SCRIPT", "NATS_CHECK_SCRIPT",
         "MINIO_CHECK_SCRIPT", "MINIO_CLEANUP_SCRIPT")
missing = []
for name in names:
    match = re.search(rf"{name}=\$\(cat <<'EOS'\n(.*?)\nEOS\n\)", src, re.S)
    if not match:
        missing.append(name)
        continue
    with open(f"{work}/{name}.sh", "w") as fh:
        fh.write(match.group(1) + "\n")
if missing:
    print("could not extract: " + ", ".join(missing), file=sys.stderr)
    sys.exit(1)
print(f"extracted {len(names)} embedded pod scripts")
EXTRACT

if python3 "$WORK/extract.py" "$SMOKE" "$WORK"; then
  ok "extracted the four embedded pod scripts from smoke-test.sh"
else
  no "could not extract the embedded pod scripts from smoke-test.sh"
  exit 1
fi

# ---- M2 item 3: the MinIO check must verify the TTL on BOTH buckets, not
# just count rules. Counting alone lets a disabled rule or a wrong TTL pass,
# so assert the script really requires an enabled 1-day rule on uploads and
# results. This is a source-level check: it runs without mc. Fixed-string
# markers (grep -F) so the regex the script uses is matched literally.
echo "== MINIO_CHECK_SCRIPT verifies an enabled 1-day TTL on both buckets"
if [ -f "$WORK/MINIO_CHECK_SCRIPT.sh" ]; then
  if grep -qF 'for b in uploads results' "$WORK/MINIO_CHECK_SCRIPT.sh" \
      && grep -qF '24h TTL' "$WORK/MINIO_CHECK_SCRIPT.sh" \
      && grep -qF 'exit 24' "$WORK/MINIO_CHECK_SCRIPT.sh" \
      && grep -qF 'exit 25' "$WORK/MINIO_CHECK_SCRIPT.sh"; then
    ok "MINIO_CHECK_SCRIPT requires an enabled 1-day-TTL ILM rule on uploads and results"
  else
    no "MINIO_CHECK_SCRIPT does not verify an enabled 1-day TTL on both buckets"
  fi
else
  no "MINIO_CHECK_SCRIPT.sh was not extracted from smoke-test.sh"
fi

# ---- M3 item: NATS_CHECK_SCRIPT must be worker-aware, skipping pool drains
# when worker Deployments are running to avoid race conditions.
echo "== NATS_CHECK_SCRIPT covers workers-running branch"
if [ -f "$WORK/NATS_CHECK_SCRIPT.sh" ]; then
  if sh -n "$WORK/NATS_CHECK_SCRIPT.sh" 2>"$WORK/nats-shn.log"; then
    ok "sh -n NATS_CHECK_SCRIPT: syntax OK"
  else
    no "sh -n NATS_CHECK_SCRIPT: $(cat "$WORK/nats-shn.log")"
  fi
  if grep -qF 'AI_WORKERS_ACTIVE' "$WORK/NATS_CHECK_SCRIPT.sh" \
      && grep -qF 'IMAGE_WORKERS_ACTIVE' "$WORK/NATS_CHECK_SCRIPT.sh" \
      && grep -qF 'SKIP: ai-workers running, pool drain skipped' "$WORK/NATS_CHECK_SCRIPT.sh" \
      && grep -qF 'SKIP: image-workers running, pool drain skipped' "$WORK/NATS_CHECK_SCRIPT.sh"; then
    ok "NATS_CHECK_SCRIPT contains worker-active branches skipping pool drains"
  else
    no "NATS_CHECK_SCRIPT does not properly handle worker-active branches"
  fi
else
  no "NATS_CHECK_SCRIPT.sh was not extracted from smoke-test.sh"
fi

# ---- M3 item: check_nats must call skip() so skipped pool drains are visible in summary
echo "== check_nats reports worker pool drain skips"
if grep -qF 'skip "nats: ai-worker pool drain (workers running)"' "$SMOKE" \
    && grep -qF 'skip "nats: image-worker pool drain (workers running)"' "$SMOKE"; then
  ok "check_nats reports worker pool drain skips with skip helper"
else
  no "check_nats does not call skip helper for worker pool drains"
fi

# --------------------------------------- execute the embedded scripts locally
NATS_URL="${NATS_URL:-nats://127.0.0.1:4222}"
MINIO_URL="${MINIO_URL:-http://127.0.0.1:9000}"
# the id must have the same shape smoke-test.sh generates: <epoch>-<pid>
TEST_UUID="1791579000-4242"
TEST_KEY="smoke-$TEST_UUID/hello.txt"
TEST_BODY="hello imgproc dev $TEST_UUID"

echo "== embedded scripts executed locally (sh -c SCRIPT sh ARG)"
if command -v nats >/dev/null 2>&1; then
  out="$(NATS_URL="$NATS_URL" sh -c "$(cat "$WORK/NATS_CHECK_SCRIPT.sh")" sh "$TEST_UUID" 2>&1)"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    no "NATS_CHECK_SCRIPT failed (exit $rc): $out"
  elif echo "$out" | grep -q NATS_OK; then
    ok "NATS_CHECK_SCRIPT ran and printed NATS_OK (streams left empty again)"
  else
    no "NATS_CHECK_SCRIPT output: $out"
  fi

  out2="$(AI_WORKERS_ACTIVE=1 IMAGE_WORKERS_ACTIVE=1 NATS_URL="$NATS_URL" sh -c "$(cat "$WORK/NATS_CHECK_SCRIPT.sh")" sh "$TEST_UUID" 2>&1)"
  rc2=$?
  if [ "$rc2" -ne 0 ]; then
    no "NATS_CHECK_SCRIPT with workers active failed (exit $rc2): $out2"
  elif echo "$out2" | grep -q NATS_OK; then
    ok "NATS_CHECK_SCRIPT with workers active ran and printed NATS_OK (drain skipped)"
  else
    no "NATS_CHECK_SCRIPT with workers active output: $out2"
  fi
else
  echo "SKIP: nats CLI not in PATH, cannot execute NATS_CHECK_SCRIPT"
fi

: "${MINIO_ROOT_USER:=}"
: "${MINIO_ROOT_PASSWORD:=}"
if [ -z "$MINIO_ROOT_USER" ] || [ -z "$MINIO_ROOT_PASSWORD" ]; then
  echo "SKIP: set MINIO_ROOT_USER and MINIO_ROOT_PASSWORD to execute the MinIO scripts"
elif ! command -v mc >/dev/null 2>&1; then
  echo "SKIP: mc not in PATH, cannot execute the MinIO scripts"
else
  export MC_CONFIG_DIR
  MC_CONFIG_DIR="$(mktemp -d)"
  mc alias set local "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  out="$(MINIO_URL="$MINIO_URL" MINIO_ROOT_USER="$MINIO_ROOT_USER" \
    MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" BODY="$TEST_BODY" \
    sh -c "$(cat "$WORK/MINIO_CHECK_SCRIPT.sh")" sh "$TEST_KEY" 2>&1)"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    no "MINIO_CHECK_SCRIPT failed (exit $rc): $out"
  elif echo "$out" | grep -q MINIO_OK; then
    ok "MINIO_CHECK_SCRIPT ran and printed MINIO_OK"
  else
    no "MINIO_CHECK_SCRIPT output: $out"
  fi

  got_body="$(curl -s "$MINIO_URL/results/$TEST_KEY")"
  if [ "$got_body" = "$TEST_BODY" ]; then
    ok "uploaded object body matches TEST_BODY exactly, so route_check can pass"
  else
    no "uploaded object body '$got_body' != TEST_BODY '$TEST_BODY'"
  fi

  # route_check replay: the same curl calls smoke-test.sh makes, with a Host
  # header (Gateway routing does not alter the body, so hitting MinIO directly
  # exercises the same path-style mapping the HTTPRoute relies on)
  ROUTE_HOST="imgproc-dev.sock1000kg.io.vn"
  tmp_body="$(mktemp)"
  status="$(curl -s -o "$tmp_body" -w '%{http_code}' -H "Host: $ROUTE_HOST" \
    "$MINIO_URL/results/$TEST_KEY")"
  body="$(cat "$tmp_body")"
  if [ "$status" = "200" ] && [ "$body" = "$TEST_BODY" ]; then
    ok "route_check replay: GET /results/$TEST_KEY with Host: $ROUTE_HOST -> 200, body matches"
  else
    no "route_check replay: -> $status body='$body'"
  fi
  list_status="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $ROUTE_HOST" "$MINIO_URL/results/")"
  case "$list_status" in
    403|404) ok "route_check replay: anonymous listing denied ($list_status)" ;;
    *) no "route_check replay: listing returned $list_status (want 403/404)" ;;
  esac
  rm -f "$tmp_body"

  # ---- G5: an unrelated object must survive the cleanup ----
  echo "-- seeding an unrelated object in both buckets"
  printf 'keep me' >"$WORK/keep.txt"
  printf 'upload me' >"$WORK/upload.txt"
  mc cp "$WORK/keep.txt" local/results/keep-me/a.txt >/dev/null
  mc cp "$WORK/upload.txt" local/uploads/u.txt >/dev/null
  list_state() {
    echo "     results: $(mc ls -r local/results 2>/dev/null | awk '{print "results/"$NF}' | tr '\n' ' ')"
    echo "     uploads: $(mc ls -r local/uploads 2>/dev/null | awk '{print "uploads/"$NF}' | tr '\n' ' ')"
  }
  echo "-- objects before cleanup"
  list_state

  # ---- G2: every unsafe key must be refused without deleting anything ----
  run_cleanup() {
    MINIO_URL="$MINIO_URL" MINIO_ROOT_USER="$MINIO_ROOT_USER" \
      MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
      sh -c "$(cat "$WORK/MINIO_CLEANUP_SCRIPT.sh")" sh "$1"
  }
  echo "-- cleanup with unsafe keys (each must exit non-zero and change nothing)"
  for unsafe in "" "/" ".." "../uploads" "keep-me" "$TEST_KEY/../keep-me" \
    "smoke-1791579000-4242x" "smoke-abc-def/hello.txt"; do
    if run_cleanup "$unsafe" >"$WORK/cleanup.log" 2>&1; then
      no "cleanup accepted the unsafe key '$unsafe' (exit 0)"
    else
      ok "cleanup refused '$unsafe' (exit $?): $(tail -1 "$WORK/cleanup.log")"
    fi

    state="$(list_state)"
    if echo "$state" | grep -q "results/keep-me/a.txt" && echo "$state" | grep -q "uploads/u.txt"; then
      ok "  unrelated objects still intact after '$unsafe'"
    else
      no "  unrelated objects damaged after '$unsafe'"
      echo "$state"
    fi
  done

  # ---- the valid cleanup removes only the smoke prefix ----
  if run_cleanup "$TEST_KEY" >/dev/null 2>&1; then
    echo "-- objects after the valid cleanup"
    list_state
    state="$(list_state)"
    if echo "$state" | grep -q "results/$TEST_KEY"; then
      no "the smoke object survived the valid cleanup"
    else
      ok "valid cleanup removed the smoke prefix results/$TEST_KEY"
    fi
    if echo "$state" | grep -q "results/keep-me/a.txt" && echo "$state" | grep -q "uploads/u.txt"; then
      ok "valid cleanup left the unrelated objects untouched"
    else
      no "valid cleanup damaged an unrelated object"
    fi
    # clean up the unrelated fixtures so re-runs start fresh
    mc rm --recursive --force local/results/keep-me >/dev/null 2>&1
    mc rm --force local/uploads/u.txt >/dev/null 2>&1
  else
    no "the valid cleanup failed"
  fi
fi

# ---- G3: empty-argument guards fire before any server contact ----
echo "== argument guards reject an empty arg before touching the server"
if command -v nats >/dev/null 2>&1; then
  if out="$(NATS_URL="nats://127.0.0.1:1" sh -c "$(cat "$WORK/NATS_CHECK_SCRIPT.sh")" sh "" 2>&1)"; then
    no "NATS_CHECK_SCRIPT accepted an empty arg (exit 0): $out"
  elif echo "$out" | grep -q "missing arg"; then
    ok "NATS_CHECK_SCRIPT exits non-zero on an empty arg before contacting NATS"
  else
    no "NATS_CHECK_SCRIPT rejected an empty arg but not with the guard message: $out"
  fi
fi
if [ -n "${MINIO_ROOT_USER:-}" ] && [ -n "${MINIO_ROOT_PASSWORD:-}" ] && command -v mc >/dev/null 2>&1; then
  if out="$(MINIO_URL="http://127.0.0.1:1" MINIO_ROOT_USER="$MINIO_ROOT_USER" \
    MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" BODY="$TEST_BODY" \
    sh -c "$(cat "$WORK/MINIO_CHECK_SCRIPT.sh")" sh "" 2>&1)"; then
    no "MINIO_CHECK_SCRIPT accepted an empty arg (exit 0): $out"
  elif echo "$out" | grep -q "missing arg"; then
    ok "MINIO_CHECK_SCRIPT exits non-zero on an empty arg before contacting MinIO"
  else
    no "MINIO_CHECK_SCRIPT rejected an empty arg but not with the guard message: $out"
  fi
  if out="$(MINIO_URL="http://127.0.0.1:1" MINIO_ROOT_USER="$MINIO_ROOT_USER" \
    MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
    sh -c "$(cat "$WORK/MINIO_CLEANUP_SCRIPT.sh")" sh "" 2>&1)"; then
    no "MINIO_CLEANUP_SCRIPT accepted an empty arg (exit 0): $out"
  elif echo "$out" | grep -q "missing arg"; then
    ok "MINIO_CLEANUP_SCRIPT exits non-zero on an empty arg before contacting MinIO"
  else
    no "MINIO_CLEANUP_SCRIPT rejected an empty arg but not with the guard message: $out"
  fi
fi

# ---- Postgres: sh -n plus a real local run when a psql binary is available ----
echo "== postgres check script"
if sh -n "$WORK/POSTGRES_CHECK_SCRIPT.sh" 2>"$WORK/shn.log"; then
  ok "sh -n POSTGRES_CHECK_SCRIPT: syntax OK"
else
  no "sh -n POSTGRES_CHECK_SCRIPT: $(cat "$WORK/shn.log")"
fi
if command -v psql >/dev/null 2>&1 && [ -n "${POSTGRES_HOST:-}" ]; then
  out="$(POSTGRES_HOST="$POSTGRES_HOST" POSTGRES_PORT="${POSTGRES_PORT:-5432}" \
    PGUSER="${POSTGRES_USER:-imgproc}" PGDATABASE="${POSTGRES_DATABASE:-imgproc}" \
    sh -c "$(cat "$WORK/POSTGRES_CHECK_SCRIPT.sh")" 2>&1)"
  if [ "$(printf '%s' "$out" | tr -d '[:space:]')" = "1" ]; then
    ok "POSTGRES_CHECK_SCRIPT ran against local postgres at $POSTGRES_HOST:${POSTGRES_PORT:-5432} and returned 1"
  else
    no "POSTGRES_CHECK_SCRIPT output: $out"
  fi
else
  echo "SKIP: no psql binary or POSTGRES_HOST set, only sh -n was run"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "ALL SMOKE-TEST OFFLINE CHECKS PASSED"
else
  echo "SOME SMOKE-TEST OFFLINE CHECKS FAILED"
fi
exit "$FAIL"
