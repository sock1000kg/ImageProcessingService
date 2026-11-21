"""Score EgoBlur Gen2 (Meta, face + plate models) on the same accuracy benchmark as bench.py, to compare with our YOLO.

Same inputs and outputs as bench.py (infra/bench "max" set, 3,726 images -> bench/<name>/detections.jsonl.gz, meta.json),
every box >= 0.05, then accuracy/evaluate.py. Run with the EgoBlur venv; setup in README.md, "Other tools".

    ../.cache/egoblur/venv/bin/python bench_egoblur.py --name egoblur-gen2      (from engine/training/detection)
About 40 min on the laptop GPU for both models.
"""

import argparse
import gzip
import json
import subprocess
import time
from pathlib import Path

import imageio.v3 as iio

from egoblur_detect import FACE_MODEL, PLATE_MODEL, Detector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BENCH = REPO / "infra" / "bench"
IMAGES = BENCH / "dataset" / "images-max"
LABELS = BENCH / "dataset" / "labels-max.jsonl"
ENGINE_PY = REPO / "engine" / ".venv" / "bin" / "python"  # the scorer runs in the Engine's venv, as for bench.py


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--name", required=True, help="output folder under bench/")
    args = p.parse_args()

    out = HERE / "bench" / args.name
    out.mkdir(parents=True, exist_ok=True)
    detector = Detector()
    start = time.time()
    files = sorted(f for f in IMAGES.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png"))
    with gzip.open(out / "detections.jsonl.gz", "wt") as fh:
        for i, path in enumerate(files):
            img = iio.imread(path)
            if img.ndim == 2:
                img = img[..., None].repeat(3, -1)
            img = img[..., :3]
            h, w = img.shape[:2]
            detections = []
            for d in detector(img):
                x1, y1, x2, y2 = (round(v) for v in d["box"])
                x1, x2 = max(0, min(w, x1)), max(0, min(w, x2))
                y1, y2 = max(0, min(h, y1)), max(0, min(h, y2))
                if x2 > x1 and y2 > y1:
                    detections.append({"label": d["label"], "confidence": round(d["conf"], 4),
                                       "box": [x1, y1, x2, y2], "redacted": True})
            fh.write(json.dumps({"original_filename": path.name, "detections": detections, "image_size": [w, h]}) + "\n")
            if i % 500 == 0:
                print(f"{i}/{len(files)} {time.time() - start:.0f}s", flush=True)

    meta = {"mode": "local", "tool": "EgoBlur Gen2 (camera-rgb resize 1200)",
            "weights": [FACE_MODEL.name, PLATE_MODEL.name], "dataset": "max", "confidence_threshold": 0.05,
            "padding": 0.1, "seconds": round(time.time() - start)}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    subprocess.run([str(ENGINE_PY), str(HERE / "accuracy" / "evaluate.py"), str(out), "--labels", str(LABELS),
                    "--operating-threshold", "0.67"], check=True)


if __name__ == "__main__":
    main()
