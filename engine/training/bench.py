"""Score a .pt on our accuracy benchmark (infra/bench, the "max" set: WIDER val + VN plate Test/Valid), locally.

Predicts like the engine does (engine/src/processors/image_redact.py: same class-name mapping, box rounding and
clamping), saves every detection >= 0.05 to bench/<name>/detections.jsonl.gz, then runs
accuracy/evaluate.py on it (accuracy.json + accuracy.md, operating threshold 0.15). compare.py compares the runs.

    .venv/bin/python bench.py --weights runs/yolo26n-1280/e20-crowd/weights/best.pt --name yolo26n-1280-e20-crowd@1280
"""

import argparse
import gzip
import json
import subprocess
import sys
from pathlib import Path

from ultralytics import YOLO

HERE = Path(__file__).resolve().parent
BENCH = HERE.parent.parent / "infra" / "bench"
IMAGES = BENCH / "dataset" / "images-max"
LABELS = BENCH / "dataset" / "labels-max.jsonl"
CLASS_MAPPING = {"Human face": "face", "Vehicle registration plate": "plate"}  # same as the engine


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--weights", required=True)
    p.add_argument("--name", required=True, help="output folder under bench/")
    p.add_argument("--imgsz", type=int, default=1280)
    args = p.parse_args()

    if not IMAGES.exists() or not LABELS.exists():
        sys.exit(f"Missing {IMAGES} or {LABELS}: run infra/bench/dataset/fetch.sh max first")
    out = HERE / "bench" / args.name
    out.mkdir(parents=True, exist_ok=True)

    model = YOLO(args.weights)
    with gzip.open(out / "detections.jsonl.gz", "wt") as fh:
        for result in model.predict(source=str(IMAGES), conf=0.05, imgsz=args.imgsz, stream=True, verbose=False,
                                     project=str(HERE / "runs"), name="predict", exist_ok=True):
            h, w = result.orig_shape
            detections = []
            for box in result.boxes:
                label = CLASS_MAPPING.get(model.names[int(box.cls[0])])
                if not label:
                    continue
                x1, y1, x2, y2 = (round(v) for v in box.xyxy[0].tolist())
                x1, x2 = max(0, min(w, x1)), max(0, min(w, x2))
                y1, y2 = max(0, min(h, y1)), max(0, min(h, y2))
                if x2 > x1 and y2 > y1:
                    detections.append({"label": label, "confidence": round(float(box.conf[0]), 4),
                                       "box": [x1, y1, x2, y2], "redacted": True})
            fh.write(json.dumps({"original_filename": Path(result.path).name, "detections": detections,
                                 "image_size": [w, h]}) + "\n")

    meta = {"mode": "local", "weights": str(args.weights), "imgsz": args.imgsz, "dataset": "max",
            "confidence_threshold": 0.05, "padding": 0.1}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    subprocess.run([sys.executable, str(HERE / "accuracy" / "evaluate.py"), str(out), "--labels", str(LABELS),
                    "--operating-threshold", "0.15"], check=True)
    metrics = json.loads((out / "accuracy.json").read_text())["metrics"]
    print(f"{args.name}: face AP50 {metrics['face']['ap50']} privacy {metrics['face']['privacy_recall']} | "
          f"plate AP50 {metrics['plate']['ap50']} privacy {metrics['plate']['privacy_recall']}")


if __name__ == "__main__":
    main()
