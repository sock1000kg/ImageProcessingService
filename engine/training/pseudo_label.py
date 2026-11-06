"""Add the missing class to each dataset with a trained model ("pseudo-labels").

WIDER labels only faces and the plate set only plates, so training learns that faces in plate photos (and plates in
WIDER photos) are background. This copies datasets/ to --out (images hard-linked, so no extra disk; labels real
copies), runs --weights over it and appends its confident detections of the *other* class (>= --conf). The dataset's
own boxes are never changed.

    .venv/bin/python pseudo_label.py --weights runs/direct-1280/e20/weights/best.pt --out datasets-pl
"""

import argparse
import shutil
import subprocess
from pathlib import Path

from ultralytics import YOLO

HERE = Path(__file__).resolve().parent
# dataset folder -> the class it is missing (ids as in train.py's data file)
MISSING = {"wider-face": (1, "Vehicle registration plate"), "vn-plate": (0, "Human face")}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--weights", required=True)
    p.add_argument("--src", type=Path, default=HERE / "datasets")
    p.add_argument("--out", type=Path, default=HERE / "datasets-pl")
    p.add_argument("--conf", type=float, default=0.5)
    p.add_argument("--imgsz", type=int, default=1280)
    args = p.parse_args()

    if args.out.exists():
        shutil.rmtree(args.out)
    for name in MISSING:
        (args.out / name).mkdir(parents=True)
        subprocess.run(["cp", "-al", str(args.src / name / "images"), str(args.out / name / "images")], check=True)
        shutil.copytree(args.src / name / "labels", args.out / name / "labels", ignore=shutil.ignore_patterns("*.cache"))

    model = YOLO(args.weights)
    class_id = {name: i for i, name in model.names.items()}
    for name, (target_id, target_name) in MISSING.items():
        added = images = 0
        for split in ("train", "val"):
            for result in model.predict(source=str(args.out / name / "images" / split), conf=args.conf,
                                        imgsz=args.imgsz, classes=[class_id[target_name]], stream=True, verbose=False,
                                        project=str(HERE / "runs"), name="predict", exist_ok=True):
                lines = [f"{target_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}" for cx, cy, w, h in result.boxes.xywhn.tolist()]
                if not lines:
                    continue
                label = args.out / name / "labels" / split / (Path(result.path).stem + ".txt")
                with open(label, "a") as fh:
                    fh.write("\n".join(lines) + "\n")
                added += len(lines)
                images += 1
        print(f"{name}: added {added} '{target_name}' boxes in {images} images")


if __name__ == "__main__":
    main()
