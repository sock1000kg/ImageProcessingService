"""Download the images of the two fine-tune extras from the lists in lists/ (the exact images we trained on).

    python3 fetch_extras.py bdd100k     # 250 BDD100K dashcam frames -> ../datasets/bdd100k/images/train/
    python3 fetch_extras.py gauges      # 384 Open Images gauge photos + empty labels
                                        #   -> ../datasets/gauge-negatives/{images,labels}/train/
    (from engine/training/detection; any Python 3, standard library only; --limit N for a quick test)

* bdd100k: lists/bdd100k-frames.txt, paths in the unofficial Hugging Face mirror karthik789338/BDD100K-Images (licence:
  docs/datasets.md, BDD100K). Images only: the plate labels are our own CVAT work (local `dashcam-plates/yolo/labels/`,
  and in the private Kaggle dataset imgproc-dashcam-plates). Saved as bdd_<id>.jpg, the names those labels use.
* gauges: lists/gauge-negatives.csv (Open Images V7 ids, CC BY 2.0: each row keeps the author and source page for the
  credit) from the Open Images bucket. Each image gets an empty label file, so the folder is train.py's
  --extra gauge-negatives as is.

How the lists were picked (by hand, not scripted): docs/datasets.md, BDD100K and Open Images rows.
"""

import argparse
import csv
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASETS = HERE.parent / "datasets"
BDD_URL = "https://huggingface.co/datasets/karthik789338/BDD100K-Images/resolve/main/"
OPEN_IMAGES_URL = "https://open-images-dataset.s3.amazonaws.com/train/"


def jobs(name):
    """(url, image path, label path or None) for every image of the set."""
    if name == "bdd100k":
        out = DATASETS / "bdd100k" / "images" / "train"
        for path in (HERE / "lists" / "bdd100k-frames.txt").read_text().split():
            yield BDD_URL + path, out / f"bdd_{Path(path).name}", None
    else:
        root = DATASETS / "gauge-negatives"
        for row in csv.DictReader(open(HERE / "lists" / "gauge-negatives.csv")):
            image_id = row["ImageID"]
            yield (OPEN_IMAGES_URL + f"{image_id}.jpg", root / "images" / "train" / f"oi_{image_id}.jpg",
                   root / "labels" / "train" / f"oi_{image_id}.txt")


def fetch(job):
    url, image, label = job
    if label:
        label.parent.mkdir(parents=True, exist_ok=True)
        label.touch()  # empty label = "nothing to find here" (a hard negative)
    if image.exists() and image.stat().st_size > 0:
        return "kept"
    image.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
    except OSError as err:
        return f"failed {url}: {err}"
    tmp = image.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.rename(image)  # no half-written image if the run is stopped
    return "downloaded"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("set", choices=["bdd100k", "gauges"])
    p.add_argument("--limit", type=int, help="only the first N images (a quick test)")
    args = p.parse_args()
    todo = list(jobs(args.set))[: args.limit]
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(fetch, todo))
    failed = [r for r in results if r.startswith("failed")]
    print(f"{args.set}: {results.count('downloaded')} downloaded, {results.count('kept')} already there, "
          f"{len(failed)} failed")
    for line in failed:
        print(" ", line)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
