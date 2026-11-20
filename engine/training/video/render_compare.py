"""Side-by-side video of two Engine runs on one clip (left = run A, right = run B), to see what each blurred.

Blurs what the Engine blurs: every box of a track not on the allow list (detected, interpolated and held boxes, grown by
the 0.1 padding). Outlines every box: red = blurred plate, blue = blurred face, green = kept by the allow list.

    render_compare.py <video> <a.engine.json> <b.engine.json> <out.mp4> "<label A>" "<label B>" \
        [--from 150 --to 330 --fps 10 --ids]

The .engine.json files are written by prelabel.py. Each half is the frame at half size; --ids writes each box's track id.
"""

import argparse
import json
import subprocess

import cv2
import numpy as np

PADDING = 0.1
RED, BLUE, GREEN, WHITE, BLACK = (0, 0, 255), (255, 120, 0), (0, 200, 0), (255, 255, 255), (0, 0, 0)


def boxes_per_frame(path):
    """frame -> [(box, label, allow-listed, track id)] for every detected, interpolated or held box of a run."""
    by_frame = {}
    for track in json.load(open(path))["tracks"]:
        boxes = {int(f): b["box"] for f, b in track["boxes"].items()}
        boxes.update({int(f): b for f, b in track.get("held", {}).items()})
        for f, box in boxes.items():
            by_frame.setdefault(f, []).append((box, track["label"], track["whitelisted"], track["trackId"]))
    return by_frame


def outlined_text(img, text, org, scale, color):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, BLACK, 5)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2)


def render_half(frame, items, size, show_ids):
    """The frame as the Engine would output it, with every box outlined, shrunk to `size`."""
    img = frame.copy()
    height, width = img.shape[:2]
    for (x1, y1, x2, y2), label, allowed, track_id in items:
        pad_x, pad_y = PADDING * (x2 - x1), PADDING * (y2 - y1)
        x1, y1 = max(0, int(x1 - pad_x)), max(0, int(y1 - pad_y))
        x2, y2 = min(width, int(x2 + pad_x)), min(height, int(y2 + pad_y))
        if x2 <= x1 or y2 <= y1:
            continue
        if not allowed:
            img[y1:y2, x1:x2] = cv2.GaussianBlur(img[y1:y2, x1:x2], (0, 0), max(3, (x2 - x1) / 6))
        color = GREEN if allowed else (RED if label == "plate" else BLUE)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)
        if show_ids:
            outlined_text(img, f"{track_id} {'ALLOWED' if allowed else 'BLURRED'}", (x1, max(20, y1 - 10)), 1.1, color)
    return cv2.resize(img, size)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("video", "run_a", "run_b", "out", "label_a", "label_b"):
        ap.add_argument(name)
    ap.add_argument("--from", dest="start", type=int, default=0, help="first frame")
    ap.add_argument("--to", dest="end", type=int, default=10**9, help="last frame")
    ap.add_argument("--fps", type=float, help="output frame rate (default: the clip's; lower = slow motion)")
    ap.add_argument("--ids", action="store_true", help="write each box's track id and allow-list state")
    a = ap.parse_args()

    run_a, run_b = boxes_per_frame(a.run_a), boxes_per_frame(a.run_b)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    half = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) // 4 * 2, int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) // 4 * 2)
    encoder = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{2 * half[0]}x{half[1]}",
         "-r", str(a.fps or fps), "-i", "-", "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", a.out],
        stdin=subprocess.PIPE)

    frame_idx, written = 0, 0
    while frame_idx <= a.end:
        ok, frame = cap.read()  # decode every frame in order: seeking in H.264 is not frame-exact
        if not ok:
            break
        if frame_idx >= a.start:
            left = render_half(frame, run_a.get(frame_idx, []), half, a.ids)
            right = render_half(frame, run_b.get(frame_idx, []), half, a.ids)
            outlined_text(left, f"{a.label_a}  frame {frame_idx}", (12, 36), 1.0, WHITE)
            outlined_text(right, f"{a.label_b}  frame {frame_idx}", (12, 36), 1.0, WHITE)
            encoder.stdin.write(np.hstack([left, right]).tobytes())
            written += 1
        frame_idx += 1
    encoder.stdin.close()
    encoder.wait()
    print(f"{a.out}: {written} frames")


if __name__ == "__main__":
    main()
