"""Score the Engine's video redaction against human labels from CVAT.

Video bench scorer (engine/training/video/). Inputs:
  * <prelabels>/<name>.engine.json - written by prelabel.py: what the Engine detected, interpolated, held and kept
  * the CVAT task <name> - your corrected labels, exported here as "CVAT for video 1.1" (every frame, interpolated)

What "blurred" means here is exactly what the render pass blurs: every non-whitelisted track's detected or
interpolated box, plus the 200 ms held boxes, each grown by the job's padding (default 0.1).

Metrics (per label, then split by occluded / box width):
  * Blur coverage per labelled box per frame: fully blurred (>= --full of its area), partly (some, not enough), missed.
  * Leak runs: per labelled track, consecutive frames not fully blurred; count and the longest, in ms.
  * Detection recall: labelled boxes matched by a raw (non-interpolated) Engine detection with IoU >= --iou.
  * Engine boxes on nothing labelled (unreadable plates are not labelled, so this is an upper bound on false boxes).
  * Track breaks: distinct Engine track ids that matched one labelled track.
  * Allow list (only if some track has identity=owner): owner frames kept (not blurred) vs stranger frames leaked.

Run from engine/: .venv/bin/python training/video/score.py plate-test1 [--labels <saved CVAT zip>] (see run_dashcam.sh)
"""

import argparse
import json
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import numpy as np
import requests

CVAT_URL = "http://localhost:8099"
HOME = Path.home() / "cvat-local"  # the local CVAT install: login.txt
BENCH_DIR = Path(__file__).resolve().parents[1] / "datasets/whitelist-videos/bench"  # labels, Engine runs, scores (gitignored)
SIZE_BUCKETS = [(0, 40, "<40 px"), (40, 80, "40-80 px"), (80, 10**9, ">=80 px")]


def export_labels(name: str, dest: Path) -> Path:
    """Download the task's annotations as CVAT for video 1.1 (one zip, annotations.xml inside)."""
    user, password = (HOME / "login.txt").read_text().split()
    s = requests.Session()
    s.post(f"{CVAT_URL}/api/auth/login", json={"username": user, "password": password}).raise_for_status()
    s.headers["X-CSRFToken"] = s.cookies.get("csrftoken", "")
    r = s.get(f"{CVAT_URL}/api/tasks", params={"name": name})
    r.raise_for_status()
    tid = r.json()["results"][0]["id"]
    r = s.post(f"{CVAT_URL}/api/tasks/{tid}/dataset/export",
               params={"format": "CVAT for video 1.1", "save_images": "false"})
    r.raise_for_status()
    rq = r.json()["rq_id"]
    while True:
        st = s.get(f"{CVAT_URL}/api/requests/{rq}").json()
        if st["status"] == "finished":
            break
        if st["status"] == "failed":
            raise RuntimeError(st.get("message"))
        time.sleep(1)
    r = s.get(st["result_url"])
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def load_labels(zip_path: Path):
    """Labelled boxes: {frame: [dict(track, label, box, occluded, identity)]}, deduplicated per frame."""
    import zipfile

    with zipfile.ZipFile(zip_path) as z:
        root = ET.fromstring(z.read("annotations.xml"))
    frames = defaultdict(list)
    identities = {}
    for tr in root.iter("track"):
        tid, label = int(tr.get("id")), tr.get("label")
        for b in tr.iter("box"):
            if b.get("outside") == "1":
                continue
            attrs = {a.get("name"): (a.text or "") for a in b.iter("attribute")}
            identities.setdefault(tid, attrs.get("identity", "unknown"))
            box = [float(b.get(k)) for k in ("xtl", "ytl", "xbr", "ybr")]
            frames[int(b.get("frame"))].append(
                {"track": tid, "label": label, "box": box, "occluded": b.get("occluded") == "1"})
    # Pieces of one object may overlap for a frame (gap track switched outside one frame late): keep one.
    for f, items in frames.items():
        kept = []
        for it in items:
            if not any(k["label"] == it["label"] and iou(k["box"], it["box"]) > 0.5 for k in kept):
                kept.append(it)
        frames[f] = kept
    return frames, identities


def load_engine(path: Path, padding: float):
    d = json.loads(path.read_text())
    w, h, fps = d["video"]["width"], d["video"]["height"], d["video"]["fps"]
    blurred = defaultdict(list)   # frame -> padded boxes actually blurred
    raw = defaultdict(list)       # frame -> (engine track id, label, box) for real detections
    global kept
    kept = defaultdict(list)      # frame -> boxes of tracks the Engine kept (allow list)
    for t in d["tracks"]:
        for f, b in t["boxes"].items():
            if not b["interp"]:
                raw[int(f)].append((t["trackId"], t["label"], b["box"]))
            if not t["whitelisted"]:
                blurred[int(f)].append(pad(b["box"], padding, w, h))
        if t["whitelisted"]:
            for f, b in t["boxes"].items():
                kept[int(f)].append(b["box"])
        if not t["whitelisted"]:
            for f, box in t["held"].items():
                blurred[int(f)].append(pad(box, padding, w, h))
    return blurred, raw, fps, (w, h)


def pad(b, p, w, h):
    x1, y1, x2, y2 = b
    px, py = int((x2 - x1) * p), int((y2 - y1) * p)
    return [max(0, x1 - px), max(0, y1 - py), min(w, x2 + px), min(h, y2 + py)]


def iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def coverage(box, blur_boxes):
    """Share of `box` covered by the union of blur boxes (pixel mask; boxes are small)."""
    x1, y1, x2, y2 = (int(round(v)) for v in box)
    if x2 <= x1 or y2 <= y1:
        return 1.0
    m = np.zeros((y2 - y1, x2 - x1), bool)
    for bx1, by1, bx2, by2 in blur_boxes:
        ax1, ay1, ax2, ay2 = max(bx1, x1), max(by1, y1), min(bx2, x2), min(by2, y2)
        if ax2 > ax1 and ay2 > ay1:
            m[ay1 - y1:ay2 - y1, ax1 - x1:ax2 - x1] = True
    return float(m.mean())


def size_bucket(box):
    wpx = box[2] - box[0]
    return next(n for lo, hi, n in SIZE_BUCKETS if lo <= wpx < hi)


def pct(a, b):
    return f"{100 * a / b:5.1f}%" if b else "   - "


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="CVAT task name, same as prelabel.py --name")
    ap.add_argument("--padding", type=float, default=0.1)
    ap.add_argument("--full", type=float, default=0.9, help="coverage that counts as fully blurred")
    ap.add_argument("--iou", type=float, default=0.5)
    ap.add_argument("--json", type=Path, help="also write the numbers here")
    ap.add_argument("--engine", help="score another Engine run of the same clip: prelabels/<this>.engine.json")
    ap.add_argument("--dir", type=Path, default=BENCH_DIR / "prelabels", help="folder with <name>.engine.json")
    ap.add_argument("--labels", type=Path, help="saved CVAT export zip; skips downloading from CVAT")
    a = ap.parse_args()

    out = a.dir
    labels_zip = a.labels or export_labels(a.name, out / f"{a.name}.labels.zip")
    gt, identities = load_labels(labels_zip)
    blurred, raw, fps, _ = load_engine(out / f"{a.engine or a.name}.engine.json", a.padding)
    has_owner = any(v == "owner" for v in identities.values())

    # Per labelled box: coverage, detection match.
    stats = defaultdict(lambda: defaultdict(int))  # (label, group) -> counters
    per_track = defaultdict(list)                  # labelled track -> [(frame, fully_blurred, owner)]
    engine_ids = defaultdict(set)                  # labelled track -> engine track ids matched
    allow = defaultdict(int)
    matched_engine = set()
    for f, items in gt.items():
        for it in items:
            cov = coverage(it["box"], blurred.get(f, []))
            best = max(((iou(it["box"], rb), eid) for eid, lab, rb in raw.get(f, []) if lab == it["label"]),
                       default=(0.0, None))
            detected = best[0] >= a.iou
            if detected:
                engine_ids[it["track"]].add(best[1])
                matched_engine.add((f, best[1]))
            owner = identities.get(it["track"]) == "owner"
            # The owner's frames are meant to stay visible: they count only in the allow-list section.
            groups = [] if owner else ["all", "occluded" if it["occluded"] else "visible", size_bucket(it["box"])]
            for g in groups:
                s = stats[(it["label"], g)]
                s["n"] += 1
                s["full"] += cov >= a.full
                s["partly"] += 0 < cov < a.full
                s["missed"] += cov == 0
                s["detected"] += detected
            per_track[it["track"]].append((f, cov >= a.full, it["label"]))
            if has_owner and identities.get(it["track"]) != "mixed":  # mixed = the labeller cannot tell: left out
                key = "owner" if owner else "stranger"
                allow[f"{key}_frames"] += 1
                # Owner kept = left visible (under 10% blurred); stranger leaked = not fully blurred.
                allow[f"{key}_hit"] += (cov < 0.1) if owner else (cov < a.full)
                if not owner and cov < a.full and any(iou(it["box"], k) >= 0.3 for k in kept.get(f, [])):
                    allow["stranger_kept_by_allow_list"] += 1

    # Engine boxes that matched no labelled box (on frames at all).
    unmatched = defaultdict(int)
    total_raw = defaultdict(int)
    for f, dets in raw.items():
        for eid, lab, rb in dets:
            total_raw[lab] += 1
            if (f, eid) not in matched_engine and not any(
                    i["label"] == lab and iou(i["box"], rb) >= 0.1 for i in gt.get(f, [])):
                unmatched[lab] += 1

    # Leak runs per labelled track (strangers only when an owner exists).
    runs = defaultdict(list)
    for tid, rows in per_track.items():
        if identities.get(tid) == "owner":
            continue
        rows.sort()
        cur, prev = 0, None
        for f, ok, lab in rows:
            if not ok and (prev is None or f == prev + 1) and cur:
                cur += 1
            elif not ok:
                if cur:
                    runs[lab].append(cur)
                cur = 1
            else:
                if cur:
                    runs[lab].append(cur)
                cur = 0
            prev = f
        if cur:
            runs[lab].append(cur)

    print(f"\n{a.name}: {len(gt)} labelled frames, fps {fps:.0f}, padding {a.padding}, fully blurred = >= {a.full:.0%} covered")
    result = {}
    for lab in ("plate", "face"):
        if not stats.get((lab, "all")):
            continue
        print(f"\n== {lab}s ==")
        print(f"{'group':<10}{'boxes':>7}{'fully blurred':>15}{'partly':>9}{'missed':>9}{'detected':>10}")
        for g in ["all", "visible", "occluded"] + [n for _, _, n in SIZE_BUCKETS]:
            s = stats.get((lab, g))
            if not s:
                continue
            print(f"{g:<10}{s['n']:>7}{pct(s['full'], s['n']):>15}{pct(s['partly'], s['n']):>9}"
                  f"{pct(s['missed'], s['n']):>9}{pct(s['detected'], s['n']):>10}")
            result[f"{lab}/{g}"] = dict(s)
        r = runs.get(lab, [])
        def ms(n):
            return round(1000 * n / fps)
        tracks = {t for t, rows in per_track.items() if rows[0][2] == lab}
        leaky = sum(1 for t in tracks if any(not ok for _, ok, _ in per_track[t]))
        print(f"labelled tracks: {len(tracks)}, with any frame not fully blurred: {leaky}")
        if r:
            print(f"leak runs: {len(r)}, median {ms(int(np.median(r)))} ms, longest {ms(max(r))} ms, "
                  f"runs >= 200 ms: {sum(1 for x in r if ms(x) >= 200)}")
        breaks = [len(engine_ids[t]) for t in tracks if engine_ids[t]]
        if breaks:
            print(f"engine track ids per labelled track: median {np.median(breaks):.0f}, max {max(breaks)} "
                  f"(1 = never lost)")
        print(f"engine detections on nothing labelled: {unmatched[lab]} of {total_raw[lab]} "
              f"(includes real but unreadable {lab}s)")
        result[f"{lab}/runs"] = r
    if has_owner:
        print(f"\n== allow list ==\nowner frames kept (left visible): {allow['owner_hit']} of {allow['owner_frames']}"
              f" -> {pct(allow['owner_hit'], allow['owner_frames'])}")
        print(f"stranger frames not fully blurred: {allow['stranger_hit']} of {allow['stranger_frames']}"
              f" -> {pct(allow['stranger_hit'], allow['stranger_frames'])}")
        print(f"  of which under a box the Engine kept as the owner: {allow['stranger_kept_by_allow_list']}")
        result["allow"] = dict(allow)
    if a.json:
        a.json.write_text(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
