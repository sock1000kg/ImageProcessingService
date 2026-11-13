"""Score OpenCV's YuNet face detector on the same accuracy benchmark as bench.py, to compare with our YOLO.

Same inputs and outputs as bench.py (infra/bench "max" set, bench/<name>/detections.jsonl.gz, then accuracy/evaluate.py),
face only: YuNet has no plate class, so ignore the plate rows in its report.

    engine/.venv/bin/python engine/training/bench_yunet.py --name yunet-2023mar
Needs datasets/yunet/yunet.onnx (OpenCV zoo, MIT: github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).
"""

import argparse
import gzip
import json
import subprocess
import sys
from pathlib import Path

import cv2

HERE = Path(__file__).resolve().parent
BENCH = HERE.parent.parent / "infra" / "bench"
IMAGES = BENCH / "dataset" / "images-max"
LABELS = BENCH / "dataset" / "labels-max.jsonl"
MODEL = HERE / "datasets" / "yunet" / "yunet.onnx"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--name", required=True, help="output folder under bench/")
    args = p.parse_args()

    out = HERE / "bench" / args.name
    out.mkdir(parents=True, exist_ok=True)
    detector = cv2.FaceDetectorYN.create(str(MODEL), "", (320, 320), 0.05, 0.3, 5000)  # score floor 0.05 like bench.py
    with gzip.open(out / "detections.jsonl.gz", "wt") as fh:
        for path in sorted(IMAGES.iterdir()):
            img = cv2.imread(str(path))
            if img is None:
                continue
            h, w = img.shape[:2]
            detector.setInputSize((w, h))
            _, faces = detector.detect(img)
            detections = []
            for f in faces if faces is not None else []:
                x1, y1 = max(0, min(w, round(f[0]))), max(0, min(h, round(f[1])))
                x2, y2 = max(0, min(w, round(f[0] + f[2]))), max(0, min(h, round(f[1] + f[3])))
                if x2 > x1 and y2 > y1:
                    detections.append({"label": "face", "confidence": round(float(f[14]), 4), "box": [x1, y1, x2, y2],
                                       "redacted": True})
            fh.write(json.dumps({"original_filename": path.name, "detections": detections, "image_size": [w, h]}) + "\n")

    meta = {"mode": "local", "weights": str(MODEL), "imgsz": "original size", "dataset": "max",
            "confidence_threshold": 0.05, "padding": 0.1}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    subprocess.run([sys.executable, str(HERE / "accuracy" / "evaluate.py"), str(out), "--labels", str(LABELS),
                    "--operating-threshold", "0.15"], check=True)
    metrics = json.loads((out / "accuracy.json").read_text())["metrics"]
    print(f"{args.name}: face AP50 {metrics['face']['ap50']} privacy {metrics['face']['privacy_recall']}")


if __name__ == "__main__":
    main()
