"""Would a detection confidence threshold that depends on face size beat one global threshold?

Reads a bench run's detections (bench/<name>/detections.jsonl.gz, from bench.py) and the benchmark labels, matches every
predicted face to a ground-truth face (IoU >= 0.5, highest confidence first) and counts, per size bucket
(tiny < 16 px, small 16-32, medium 32-96, large > 96; predictions by their own width, ground truth by its width):

- true / false positives of the predictions at a confidence threshold;
- recall of the ground-truth faces at a threshold.

Then it compares a few size-dependent threshold sets against one global threshold. WIDER FACE leaves many small,
blurred faces unlabelled, so some "false positives" are real faces: precision here is a lower bound.

    engine/.venv/bin/python engine/training/accuracy/size_thresholds.py yolo26n-1280-e20-crowd@1280
Writes nothing; the result is summarised in results/whitelist.md.
"""

import collections
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import evaluate as ev  # noqa: E402

LABELS = HERE.parents[2] / "infra" / "bench" / "dataset" / "labels-max.jsonl"
BENCH = HERE.parent / "bench"
BUCKETS = ("tiny", "small", "medium", "large")
POLICIES = {
    "one global 0.17 (Fast today)": dict(tiny=0.17, small=0.17, medium=0.17, large=0.17),
    "tiny lower only (0.10, rest 0.17)": dict(tiny=0.10, small=0.17, medium=0.17, large=0.17),
    "big higher only (medium 0.30, large 0.40)": dict(tiny=0.17, small=0.17, medium=0.30, large=0.40),
    "both (0.10 / 0.15 / 0.25 / 0.35)": dict(tiny=0.10, small=0.15, medium=0.25, large=0.35),
}


def match(name):
    """Returns (predictions [(confidence, bucket, 1 true / 0 false / None ignored region)], faces per bucket, [(bucket, confidence of its match or 0)])."""
    labels = ev.load_labels(str(LABELS))
    dets = ev.load_detections(str(BENCH / name / "detections.jsonl.gz"))
    preds, gt_count, gt_matched = [], collections.Counter(), []
    for filename, rec in labels.items():
        gts = [b for b in rec["boxes"] if b["label"] == "face"]
        faces = sorted((d for d in dets.get(filename, []) if d["label"] == "face"), key=lambda d: -d["confidence"])
        used, best_conf = set(), {}
        for d in faces:
            bucket = ev._size_bucket(d["box"][2] - d["box"][0])
            best_iou, best_i = 0.0, None
            for i, g in enumerate(gts):
                if i not in used:
                    iou = ev.compute_iou(d["box"], g["box"])
                    if iou > best_iou:
                        best_iou, best_i = iou, i
            if best_i is not None and best_iou >= 0.5:
                used.add(best_i)
                if gts[best_i].get("ignore"):
                    preds.append((d["confidence"], bucket, None))
                else:
                    best_conf[best_i] = d["confidence"]
                    preds.append((d["confidence"], bucket, 1))
            else:
                preds.append((d["confidence"], bucket, 0))
        for i, g in enumerate(gts):
            if not g.get("ignore"):
                bucket = ev._size_bucket(g["box"][2] - g["box"][0])
                gt_count[bucket] += 1
                gt_matched.append((bucket, best_conf.get(i, 0.0)))
    return preds, gt_count, gt_matched


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "yolo26n-1280-e20-crowd@1280"
    preds, gt_count, gt_matched = match(name)
    print(f"== {name}: ground-truth faces {dict(gt_count)}")
    print("threshold | TP/FP (precision) by predicted size | recall by ground-truth size")
    for t in (0.05, 0.10, 0.15, 0.17, 0.25, 0.35, 0.50):
        cells = []
        for b in BUCKETS:
            tp = sum(1 for c, k, x in preds if k == b and c >= t and x == 1)
            fp = sum(1 for c, k, x in preds if k == b and c >= t and x == 0)
            cells.append(f"{b[:3]} {tp}/{fp} ({tp / max(1, tp + fp):.2f})")
        rec = [f"{b[:3]} {sum(1 for k, c in gt_matched if k == b and c >= t) / gt_count[b]:.2f}" for b in BUCKETS]
        print(f"{t:.2f} | " + " | ".join(cells) + " || " + " ".join(rec))
    print("\npolicy | TP | FP | recall | recall tiny/small/medium/large")
    for label, thr in POLICIES.items():
        tp = sum(1 for c, k, x in preds if x == 1 and c >= thr[k])
        fp = sum(1 for c, k, x in preds if x == 0 and c >= thr[k])
        per = [sum(1 for k, c in gt_matched if k == b and c >= thr[b]) / gt_count[b] for b in BUCKETS]
        total = sum(sum(1 for k, c in gt_matched if k == b and c >= thr[b]) for b in BUCKETS) / sum(gt_count.values())
        print(f"{label:45} {tp} | {fp} | {total:.3f} | " + " ".join(f"{r:.3f}" for r in per))


if __name__ == "__main__":
    main()
