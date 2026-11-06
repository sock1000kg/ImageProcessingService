"""Fine-tune YOLO for face + plate redaction, locally. Same setup as the team's Colab notebook.

Runs live in runs/<experiment>/<run>/ (weights, results.csv, args.yaml). Running the same
--experiment and --run again resumes from last.pt, including a run started on Colab: copy its Drive
folder runs/<experiment>/<run>/ here first (see README.md).
"""

import argparse
import zipfile
from pathlib import Path

# No PYTORCH_CUDA_ALLOC_CONF=expandable_segments here (unlike Colab): on WSL2 it crashes with
# "CUDA driver error: device not ready / Failed to create GPU mapping" once a batch needs more memory.
import torch
from ultralytics import YOLO

HERE = Path(__file__).resolve().parent
DATASETS = HERE / "datasets"
RUNS = HERE / "runs"
MAX_BOXES = 300  # crowd images above this run the GPU out of memory at 1280 px (same as Colab)

# Class names match the engine's mapping (engine/src/processors/image_redact.py), so the .pt drops in
DATA_YAML_TEXT = """path: {root}
train:
{train}
val:
  - wider-face/images/val
  - vn-plate/images/val
names:
  0: Human face
  1: Vehicle registration plate
"""


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--experiment", required=True, help='folder grouping related runs, e.g. "direct-1280"')
    p.add_argument("--run", required=True, help="same name = resume that run, new name = new run")
    p.add_argument("--imgsz", type=int, default=1280, help="640 | 992 | 1280 (multiple of 32)")
    p.add_argument("--epochs", type=int, default=10)
    p.add_argument("--batch", type=int, default=4, help="same as Colab; 1280 at batch 2 used ~1 GB on the 4 GB GPU")
    p.add_argument("--patience", type=int, default=8, help="stop when val mAP hasn't improved this many epochs")
    p.add_argument("--base", default="yolov8n-oiv7.pt", help="starting weights for a new run, e.g. yolo11n.pt")
    p.add_argument("--data-dir", type=Path, default=DATASETS, help="dataset root (default: datasets/)")
    p.add_argument("--start-from", help='"<experiment>/<run>": start a new run from that run\'s best.pt')
    # each worker holds ~430 MB plus shared batch memory: 8 filled WSL's 10 GB RAM + swap and froze the laptop
    p.add_argument("--workers", type=int, default=2, help="dataloader processes (RAM-bound, not CPU-bound)")
    p.add_argument("--close-mosaic", type=int, default=2, help="default 10 would cover a whole 10-epoch run")
    p.add_argument("--warmup-epochs", type=float, default=1)
    p.add_argument("--lr0", type=float, help="initial learning rate; also pins the optimizer: --optimizer, else AdamW "
                                          "(default: Ultralytics picks both)")
    p.add_argument("--optimizer", choices=["SGD", "AdamW"],
                   help="pin the optimizer (default: Ultralytics' auto; SGD for long runs, what the base runs used)")
    p.add_argument("--freeze", type=int, metavar="N",
                   help="keep the first N layers fixed (fine-tunes; 11 = the whole YOLO26 / YOLO11 backbone)")
    p.add_argument("--tile-crowds", action="store_true", help="add the excluded crowd images back as tiles")
    p.add_argument("--oversample", type=int, default=1, metavar="N",
                   help="list WIDER train images whose faces are mostly 16-96 px N times (default 1 = off)")
    p.add_argument("--plate-copies", type=int, default=1, metavar="N",
                   help="list the plate training images N times (default 1 = off): more weight on plates, which are "
                        "~1/5 of the training images")
    return p.parse_args()


def exclude_crowds(root):
    """Move WIDER train images with more than MAX_BOXES faces aside (not deleted; val untouched)."""
    wider = root / "wider-face"
    excluded = root / "excluded-crowds"
    excluded.mkdir(exist_ok=True)
    moved = 0
    for label in (wider / "labels/train").glob("*.txt"):
        with open(label) as fh:
            boxes = sum(1 for line in fh if line.strip())
        if boxes > MAX_BOXES:
            for image in (wider / "images/train").glob(label.stem + ".*"):
                image.rename(excluded / image.name)
            label.rename(excluded / label.name)
            moved += 1
    if moved:
        print(f"Moved {moved} crowd images (> {MAX_BOXES} faces) to {excluded}")


def tile_crowds(root):
    """Put the excluded crowd images back as a grid of crops with at most MAX_BOXES faces each.

    Their faces are mostly the tiny ones the model misses; cropping keeps each training image under the
    memory limit. A face goes to the tile holding its centre and is clipped to that tile. Tiles go to their
    own folder (crowd-tiles/), which is only added to training with --tile-crowds."""
    from PIL import Image

    excluded = root / "excluded-crowds"
    images_dir, labels_dir = root / "crowd-tiles/images/train", root / "crowd-tiles/labels/train"
    if any(images_dir.glob("*.jpg")):
        return  # already made
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    tiles = 0
    for label in sorted(excluded.glob("*.txt")):
        image = next((p for p in excluded.glob(label.stem + ".*") if p.suffix != ".txt"), None)
        if image is None:
            continue
        boxes = [list(map(float, line.split())) for line in label.read_text().splitlines() if line.strip()]
        for n in range(2, 9):  # smallest grid whose fullest tile fits under MAX_BOXES
            cells = [0] * (n * n)
            for _, cx, cy, _, _ in boxes:
                cells[min(int(cy * n), n - 1) * n + min(int(cx * n), n - 1)] += 1
            if max(cells) <= MAX_BOXES:
                break
        with Image.open(image) as im:
            width, height = im.size
            for row in range(n):
                for col in range(n):
                    x0, x1, y0, y1 = col / n, (col + 1) / n, row / n, (row + 1) / n
                    lines = []
                    for cls, cx, cy, w, h in boxes:
                        if not (x0 <= cx < x1 or (col == n - 1 and cx == 1)) or not (y0 <= cy < y1 or (row == n - 1 and cy == 1)):
                            continue
                        bx0, bx1 = max(cx - w / 2, x0), min(cx + w / 2, x1)
                        by0, by1 = max(cy - h / 2, y0), min(cy + h / 2, y1)
                        lines.append(
                            f"{int(cls)} {((bx0 + bx1) / 2 - x0) * n:.6f} {((by0 + by1) / 2 - y0) * n:.6f} "
                            f"{(bx1 - bx0) * n:.6f} {(by1 - by0) * n:.6f}"
                        )
                    if len(lines) > MAX_BOXES:
                        continue
                    name = f"{label.stem}_t{row}{col}"
                    crop = (round(x0 * width), round(y0 * height), round(x1 * width), round(y1 * height))
                    im.crop(crop).convert("RGB").save(images_dir / f"{name}.jpg", quality=95)
                    (labels_dir / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
                    tiles += 1
    print(f"Added {tiles} crowd tiles (<= {MAX_BOXES} faces each) to {images_dir}")


def oversampled_list(root, folders, copies):
    """Write a training list where images whose faces are mostly 16-96 px wide appear `copies` times.

    Half of WIDER's faces are under 16 px, so training (and the overall benchmark score) is dominated by faces
    too small to recognise. Repeating images rich in recognisable-size faces gives those more weight without
    dropping tiny-face labels (unlabelled faces would be learned as background, i.e. never blurred)."""
    from PIL import Image

    lines, boosted = [], 0
    for folder in folders:
        for image in sorted((root / folder).iterdir()):
            label = root / folder.replace("/images/", "/labels/") / (image.stem + ".txt")
            widths = [float(line.split()[3]) for line in label.read_text().splitlines() if line.strip()] if label.exists() else []
            n = 1
            if widths:
                with Image.open(image) as im:
                    px = [w * im.width for w in widths]
                mid = sum(16 <= w < 96 for w in px)
                if mid and mid * 2 >= len(px):
                    n = copies
                    boosted += 1
            lines += [str(image)] * n
    out = root / f"train-oversample{copies}.txt"
    out.write_text("\n".join(lines) + "\n")
    print(f"Oversampling: {boosted} images with mostly 16-96 px faces listed {copies}x ({len(lines)} entries) -> {out}")
    return out


def gpus():
    """Every visible GPU: Kaggle's T4 x2 trains with DDP (--batch is the total, split across them); laptop: GPU 0."""
    n = torch.cuda.device_count()
    return list(range(n)) if n > 1 else 0


def point_checkpoint_here(last_pt, run_dir, data_yaml, args):
    """A checkpoint keeps the paths and settings it was started with (/content/... on Colab).
    Rewrite them for this machine so Ultralytics can resume it here. Returns False if the run already finished."""
    ckpt = torch.load(last_pt, map_location="cpu", weights_only=False)
    if ckpt.get("epoch", -1) == -1:  # Ultralytics marks the final checkpoint with epoch -1
        return False
    train_args = ckpt["train_args"]
    train_args.update(
        data=str(data_yaml),
        project=str(run_dir.parent),
        name=run_dir.name,
        save_dir=str(run_dir),
        device=gpus(),
        batch=args.batch,  # the effective batch stays 64 (nbs): smaller batches accumulate gradients
        workers=args.workers,
    )
    torch.save(ckpt, last_pt)
    return True


def main():
    args = parse_args()
    root = args.data_dir.resolve()
    for name in ("wider-face", "vn-plate"):
        archive = root / f"{name}-yolo.zip"
        if not (root / name).exists() and archive.exists():
            print(f"Unzipping {archive.name}")
            zipfile.ZipFile(archive).extractall(root)
        if not (root / name).exists():
            raise SystemExit(f"No {root / name} or {archive}: put wider-face-yolo.zip and vn-plate-yolo.zip in {root}")
    exclude_crowds(root)
    face_folders = ["wider-face/images/train"]
    if args.tile_crowds:
        tile_crowds(root)
        face_folders.append("crowd-tiles/images/train")
    train = face_folders
    if args.oversample > 1:
        train = [str(oversampled_list(root, face_folders, args.oversample))]
    plates = "vn-plate/images/train"
    if args.plate_copies > 1:  # same mechanism as --oversample: a list file with every plate image N times
        images = [str(i) for i in sorted((root / plates).iterdir())]
        plates_list = root / f"train-plates{args.plate_copies}.txt"
        plates_list.write_text("\n".join(images * args.plate_copies) + "\n")
        print(f"Plates: {len(images)} images listed {args.plate_copies}x -> {plates_list}")
        plates = str(plates_list)
    train = train + [plates]
    data_yaml = root / "face-plate.yaml"
    data_yaml.write_text(DATA_YAML_TEXT.format(root=root, train="\n".join(f"  - {t}" for t in train)))

    run_dir = RUNS / args.experiment / args.run
    last_pt = run_dir / "weights" / "last.pt"
    if last_pt.exists():
        # a resumed run keeps its saved settings (except batch/workers above); new settings = new --run
        if not point_checkpoint_here(last_pt, run_dir, data_yaml, args):
            print(f"{args.experiment}/{args.run} already finished: {run_dir / 'weights' / 'best.pt'}")
            return
        print(f"Resuming {args.experiment}/{args.run}")
        YOLO(str(last_pt)).train(resume=True)
        return

    weights = args.base
    if args.start_from:
        weights = RUNS / args.start_from / "weights" / "best.pt"
        if not weights.exists():
            raise SystemExit(f"No {weights}")
    print("New run from", weights)
    # optimizer=auto ignores lr0, so an explicit learning rate also pins the optimizer (AdamW unless --optimizer says)
    extra = {}
    if args.lr0 or args.optimizer:
        extra["optimizer"] = args.optimizer or "AdamW"
    if args.lr0:
        extra["lr0"] = args.lr0
    if args.freeze:
        extra["freeze"] = args.freeze
    YOLO(str(weights)).train(
        data=str(data_yaml),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        patience=args.patience,
        device=gpus(),
        workers=args.workers,
        amp=True,
        project=str(run_dir.parent),
        name=args.run,
        exist_ok=True,
        close_mosaic=args.close_mosaic,
        warmup_epochs=args.warmup_epochs,
        **extra,
    )


if __name__ == "__main__":
    main()
