"""Model-only inference time per image, for YOLO weights (CPU or GPU) and deface (CenterFace, CPU).

Times inference alone (no decode/upload/blur), on a few benchmark images, with a fixed number of CPU threads to mimic a
small node (the lab has 2 cores). Prints one markdown table row per model.

    <python with ultralytics> cpu_speed.py yolo --weights a.pt@1280 b.pt@960 [--threads 2] [--images N] [--device 0]
    <deface venv python>      cpu_speed.py deface [--threads 2] [--images N]
"""

import argparse
import os
import sys
import time
from pathlib import Path

IMAGES = Path(__file__).resolve().parent.parent / "dataset" / "images-max"


def pick_images(n):
    files = sorted(IMAGES.iterdir())
    if not files:
        sys.exit(f"No images in {IMAGES}: run infra/bench/dataset/fetch.sh max")
    step = max(1, len(files) // n)  # spread over WIDER and the VN plates
    return [str(p) for p in files[::step][:n]]


def time_yolo(spec, images, threads, device):
    import torch
    from ultralytics import YOLO

    torch.set_num_threads(threads)
    weights, size = spec.rsplit("@", 1)
    model = YOLO(weights)
    for path in images[:3]:  # warm-up (GPU: CUDA init and kernel selection)
        model.predict(path, imgsz=int(size), device=device, verbose=False)
    start = time.perf_counter()
    for path in images:
        model.predict(path, imgsz=int(size), device=device, verbose=False)  # returns boxes on the CPU: synchronised
    path = Path(weights)
    name = f"{path.parent.parent.parent.name}/{path.parent.parent.name}" if path.name in ("best.pt", "last.pt") else path.name
    return (time.perf_counter() - start) / len(images) * 1000, name, f"{size} px"


def time_deface(images, threads):
    import imageio.v2 as iio
    import onnxruntime as ort

    original = ort.InferenceSession

    def pinned(model, *_args, **_kwargs):  # deface builds its own session; pin it to `threads`
        options = ort.SessionOptions()
        options.intra_op_num_threads, options.inter_op_num_threads = threads, 1
        return original(model, options, providers=["CPUExecutionProvider"])

    ort.InferenceSession = pinned
    from deface.centerface import CenterFace

    detector = CenterFace(in_shape=None, backend="onnxrt")
    frames = [iio.imread(p)[..., :3] for p in images]
    detector(frames[0], threshold=0.2)  # warm-up
    start = time.perf_counter()
    for frame in frames:
        detector(frame, threshold=0.2)
    return (time.perf_counter() - start) / len(frames) * 1000, "deface (CenterFace)", "full res"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("tool", choices=["yolo", "deface"])
    p.add_argument("--weights", nargs="*", default=[], help="<weights>@<input size>")
    p.add_argument("--threads", type=int, default=2)
    p.add_argument("--images", type=int, default=20)
    p.add_argument("--device", default="cpu", help="cpu, or a GPU index such as 0 (yolo only)")
    args = p.parse_args()
    if args.device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
    images = pick_images(args.images)
    results = [time_deface(images, args.threads)] if args.tool == "deface" else [
        time_yolo(spec, images, args.threads, args.device) for spec in args.weights
    ]
    for ms, name, size in results:
        where = args.threads if args.device == "cpu" else f"GPU {args.device}"
        print(f"| {name} | {size} | {where} | {len(images)} | {ms:.0f} |" if args.device == "cpu" else
              f"| {name} | {size} | {where} | {len(images)} | {ms:.1f} |")


if __name__ == "__main__":
    main()
