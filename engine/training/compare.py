"""Compare every benchmarked model (bench/<name>/) and deface at matched face precision -> bench/comparison.md.

    .venv/bin/python compare.py                 # every folder in bench/
    .venv/bin/python compare.py <name> <name>   # only these (plus deface), same output file
    .venv/bin/python compare.py --out FILE ...

A detection threshold means something different for each model (and for deface), so models are compared at the same
face precision instead: each run's accuracy.json holds its curves (precision, recall, privacy, per size, plates at every
threshold 0.050-0.950, from accuracy/evaluate.py), and every run is read at the threshold whose face precision is closest
to the target. Three comparisons:

  A. the best model (highest face AP) at our operating threshold (--ref-threshold, 0.15): its face precision
  B. every run at its own best-F1 threshold (a high F1 does not mean many faces are hidden)
  C. deface (full res) at its default threshold 0.2: its face precision

A run is (re)scored only if its accuracy.json is missing, has no curves, or is older than its detections; that writes
its own full report (accuracy.md / accuracy.json, at 0.15, deface 0.2). --rescore scores every run again.
Runs: bench.py writes bench/<name>/ (detections.jsonl.gz + meta.json + accuracy.*); deface runs are copied in.
"""

import argparse
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "accuracy"))
import evaluate as ev  # noqa: E402

BENCH = HERE / "bench"
LABELS = HERE.parent.parent / "infra" / "bench" / "dataset" / "labels-max.jsonl"

# what each run is (the "journey" order); runs not listed come after, by name
RUNS = {
    "yolov8n-oiv7@640": "YOLOv8n-oiv7, base model (no fine-tune)",
    "yolov8n-oiv7@960": "YOLOv8n-oiv7, base model",
    "yolov8n-oiv7@1280": "YOLOv8n-oiv7, base model",
    "direct-1280-e10-b4@1280": "YOLOv8n-oiv7 fine-tuned, 10 epochs",
    "direct-1280-e20@1280": "YOLOv8n-oiv7 fine-tuned, 20 epochs",
    "yolo11-1280-e20@640": "YOLO11n, 20 epochs (trained at 1280)",
    "yolo11-1280-e20@960": "YOLO11n, 20 epochs (trained at 1280)",
    "yolo11-1280-e20@1280": "YOLO11n, 20 epochs",
    "yolo11-1280-e20-pl@1280": "YOLO11n, 20 epochs, pseudo-labels",
    "yolo11-1280-e5-crowd@1280": "YOLO11n, 20 epochs + 5 with crowd tiles (lr0 5e-4)",
    "yolo11-1280-e5-crowd-os2@1280": "YOLO11n, as above + small/medium faces oversampled x2",
    "yolo11s-960-e12@960": "YOLO11s, 12 epochs, crowd tiles",
    "yolo11s-1280-e12@1280": "YOLO11s, 12 epochs, crowd tiles",
    "yolo11n-1280-e20-crowd@1280": "YOLO11n, comparison recipe",
    "yolo26n-1280-e20-crowd@1280": "YOLO26n, comparison recipe",
    "yolo26s-1280-e20-crowd@1280": "YOLO26s, comparison recipe",
    "yolo26s-1280-e5-ft@1280": "YOLO26s, comparison recipe + 5 epochs fine-tune (crowd tiles, lr0 5e-4)",
    "yolo26s-1280-e5-plates-frozen@1280": "YOLO26s, + 5 epochs: plates x2, backbone frozen, SGD lr0 0.002 (from e20)",
    "yolo26s-1280-e5-plates-frozen-x3@1280": "YOLO26s, + 5 more epochs: plates x3, backbone frozen, SGD lr0 0.001",
    "deface-full": "deface (CenterFace), full resolution",
    "deface-640x480": "deface (CenterFace), 640x480",
}


def needs_scoring(run: Path) -> bool:
    acc = run / "accuracy.json"
    dets = ev.find_detections(str(run))
    if not acc.exists() or dets is None or acc.stat().st_mtime < Path(dets).stat().st_mtime:
        return True
    return "curves" not in json.loads(acc.read_text())


def score(name):
    """Score one run (its accuracy.* incl. curves); runs in a worker process."""
    run = BENCH / name
    deface = name.startswith("deface")
    res = ev.evaluate_run(str(run), str(LABELS), operating_threshold_arg=0.2 if deface else 0.15)
    ev.write_single_report(str(run), res)
    return name


def index_of(t):
    return min(range(len(ev.CURVE_THRESHOLDS)), key=lambda i: abs(ev.CURVE_THRESHOLDS[i] - t))


def row(res, i, note=""):
    face, plate = res["curves"]["face"], res["curves"]["plate"]
    return {
        "t": ev.CURVE_THRESHOLDS[i], "note": note, "ap": res["metrics"]["face"]["ap50"],
        "p": face["precision"][i], "r": face["recall"][i], "f1": face["f1"][i], "priv": face["privacy"][i],
        "tiny": face["privacy_tiny"][i], "r16": face["recall_ge16"][i], "priv16": face["privacy_ge16"][i],
        "pp": plate["precision"][i] if plate else None, "pr": plate["recall"][i] if plate else None,
        "ppriv": plate["privacy"][i] if plate else None,
    }


def at_precision(res, target):
    """The lowest threshold reaching the target face precision, or the one just below it if that is closer."""
    prec = res["curves"]["face"]["precision"]
    if prec[0] >= target:  # can't get this low: report the floor
        return row(res, 0, f"lowest P reachable {prec[0]:.3f}")
    for i in range(1, len(prec)):
        if prec[i] >= target:
            return row(res, i if prec[i] - target <= target - prec[i - 1] else i - 1)
    return row(res, len(prec) - 1, f"highest P reachable {prec[-1]:.3f}")


def fmt(v, digits=3):
    return "—" if v is None else f"{v:.{digits}f}"


def tables(title, intro, rows, names):
    lines = [f"## {title}", "", intro, "",
             "| Run | What | Threshold | Face P | Face R | Face F1 | Face privacy | Tiny (<16 px) privacy | Face AP |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for n in names:
        r = rows[n]
        t = f"{r['t']:.3f}" + (f" ({r['note']})" if r["note"] else "")
        lines.append(f"| `{n}` | {RUNS.get(n, '')} | {t} | {fmt(r['p'])} | {fmt(r['r'])} | {fmt(r['f1'])} | "
                     f"**{fmt(r['priv'])}** | {fmt(r['tiny'])} | {fmt(r['ap'])} |")
    lines += ["", "Faces of 16 px and larger, and plates, at the same thresholds:", "",
              "| Run | Face R (>=16 px) | Face privacy (>=16 px) | Plate P | Plate R | Plate privacy |",
              "| --- | --- | --- | --- | --- | --- |"]
    for n in names:
        r = rows[n]
        lines.append(f"| `{n}` | {fmt(r['r16'])} | **{fmt(r['priv16'])}** | {fmt(r['pp'])} | {fmt(r['pr'])} | "
                     f"**{fmt(r['ppriv'])}** |")
    return lines + [""]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("names", nargs="*", help="bench/<name> folders (default: all)")
    p.add_argument("--out", default=str(BENCH / "comparison.md"))
    p.add_argument("--ref-threshold", type=float, default=0.15, help="our operating threshold (comparison A)")
    p.add_argument("--jobs", type=int, default=4, help="runs scored in parallel (each holds its detections in RAM)")
    p.add_argument("--rescore", action="store_true", help="score every run again, not only new or changed ones")
    args = p.parse_args()

    names = args.names or [d.name for d in BENCH.iterdir() if (d / "meta.json").exists()]
    for n in args.names:
        if not (BENCH / n / "meta.json").exists():
            sys.exit(f"no bench/{n}: run bench.py --name {n} first")
    for d in ("deface-full", "deface-640x480"):
        if d not in names and (BENCH / d).exists():
            names.append(d)
    order = list(RUNS)
    names.sort(key=lambda n: (order.index(n) if n in order else len(order), n))

    todo = [n for n in names if args.rescore or needs_scoring(BENCH / n)]
    if todo:
        print(f"scoring {len(todo)} run(s): {' '.join(todo)}")
        with Pool(min(args.jobs, len(todo))) as pool:
            pool.map(score, todo)
    res = {n: json.loads((BENCH / n / "accuracy.json").read_text()) for n in names}
    ours = [n for n in names if not n.startswith("deface")]
    best = max(ours, key=lambda n: res[n]["metrics"]["face"]["ap50"])
    p_best = res[best]["curves"]["face"]["precision"][index_of(args.ref_threshold)]
    p_deface = res["deface-full"]["curves"]["face"]["precision"][index_of(0.2)]
    first = {n: {"B": row(res[n], index_of(res[n]["metrics"]["face"]["best_f1"]["threshold"]))} for n in names}
    second = {n: {"A": at_precision(res[n], p_best), "C": at_precision(res[n], p_deface)} for n in names}

    out = ["# Accuracy comparison", "",
           "Generated by `compare.py` on the benchmark set (`labels-max.jsonl`: 3,726 images, faces from WIDER val, "
           "plates from the VN set). Run folders: `bench/<name>/` (`accuracy.md` there = full breakdown of that run at "
           "threshold 0.15, deface 0.2). Training records of each model: `results/<experiment>/<run>/`.", "",
           "**Privacy** = share of faces (plates) at least 70 % covered by the blurred boxes; **P / R / F1** at IoU >= 0.5. "
           "Models are compared at the **same face precision**, since a threshold means something different for each "
           "model. Our detections are saved from confidence 0.05 (the engine's floor), so a model whose precision is "
           "already above the target there is shown at 0.05 (noted).", ""]
    out += tables(f"A. At the best model's operating point (face precision {p_best:.3f})",
                  f"Best model by face AP: `{best}`, at our operating threshold {args.ref_threshold}; every other run at "
                  "the threshold that gives it the same face precision.",
                  {n: second[n]["A"] for n in names}, names)
    out += tables("B. At each run's best-F1 threshold",
                  "The threshold that maximises face F1 for that run. A high F1 can still leave many faces unblurred: "
                  "compare the privacy columns with A.", {n: first[n]["B"] for n in names}, names)
    out += tables(f"C. At deface's default (threshold 0.2, face precision {p_deface:.3f})",
                  "Every run at the threshold that gives deface's precision at its default: are we better than deface "
                  "while being at least as precise?", {n: second[n]["C"] for n in names}, names)
    Path(args.out).write_text("\n".join(out))
    print(f"{args.out}: {len(names)} runs, best model {best}")


if __name__ == "__main__":
    main()
