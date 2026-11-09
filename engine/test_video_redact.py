"""Script kiểm thử thủ công tính năng Video Redaction & Whitelist Biển Số Xe / Khuôn Mặt.

Hướng dẫn sử dụng:
1. Chạy với video thực tế của bạn:
   python engine/test_video_redact.py --input test.mp4 --output result.mp4 --plates "30A-123.45" "29V1-678.90"

2. Chạy chế độ demo (tự sinh video mẫu để test toàn trình nếu bạn chưa có video sẵn):
   python engine/test_video_redact.py --demo
"""
import argparse
import os
import sys
import time

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import cv2
import numpy as np

# Đảm bảo đường dẫn engine nằm trong sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from src.processors.video_redact import VideoRedactProcessor, resolve_ffmpeg_bin  # noqa: E402


def create_demo_video(output_path: str = "demo_input.mp4", duration_sec: int = 4, fps: float = 25.0):
    """Tự động tạo video mẫu có biển số xe chuyển động để test tính năng."""
    width, height = 640, 480
    total_frames = int(duration_sec * fps)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    print(f"[*] Đang tự động sinh video demo ({total_frames} frames) tại '{output_path}'...")
    for f in range(total_frames):
        frame = np.full((height, width, 3), 180, dtype=np.uint8)

        # Xe 1 (Biển số xe quen: 30A-123.45) di chuyển từ trái qua phải
        x1 = 40 + int(f * 3.5)
        y1 = 120
        # Vẽ khung biển số trắng
        cv2.rectangle(frame, (x1, y1), (x1 + 180, y1 + 60), (255, 255, 255), -1)
        cv2.rectangle(frame, (x1, y1), (x1 + 180, y1 + 60), (0, 0, 0), 2)
        cv2.putText(frame, "30A12345", (x1 + 10, y1 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 0, 0), 2)

        # Xe 2 (Biển số xe lạ: 51G-888.88) di chuyển ngược lại
        x2 = width - 220 - int(f * 2.5)
        y2 = 280
        cv2.rectangle(frame, (x2, y2), (x2 + 180, y2 + 60), (255, 255, 255), -1)
        cv2.rectangle(frame, (x2, y2), (x2 + 180, y2 + 60), (0, 0, 0), 2)
        cv2.putText(frame, "51G88888", (x2 + 10, y2 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 0, 0), 2)

        out.write(frame)

    out.release()
    print("[*] Sinh video demo hoàn tất!")


def main():
    parser = argparse.ArgumentParser(description="Test Video Redaction with License Plate Whitelist.")
    parser.add_argument("--input", "-i", type=str, default="", help="Path to input MP4 video file.")
    parser.add_argument("--output", "-o", type=str, default="result.mp4", help="Path to output redacted MP4 video.")
    parser.add_argument(
        "--plates",
        "-p",
        nargs="+",
        default=["30A-123.45"],
        help="List of whitelisted plates (e.g. --plates 30A-123.45 29V1-678.90).",
    )
    parser.add_argument(
        "--targets",
        "-t",
        nargs="+",
        default=["plate", "face"],
        choices=["plate", "face"],
        help="Target objects to redact: plate, face, or both (default: plate face). Example: --targets plate",
    )
    parser.add_argument(
        "--conf-face",
        type=float,
        default=0.45,
        help="Confidence threshold for human faces (default: 0.45). Set >= 0.50 for dashcam videos to eliminate false positives on vehicle mirrors/mounts.",
    )
    parser.add_argument(
        "--conf-plate",
        type=float,
        default=0.25,
        help="Confidence threshold for license plates (default: 0.25).",
    )
    parser.add_argument(
        "--style",
        "-s",
        type=str,
        default="pixelate",
        choices=["blur", "pixelate", "blackout"],
        help="Redaction style: pixelate (default), blur, blackout.",
    )
    parser.add_argument("--strength", type=int, default=8, help="Relative redaction strength (default: 8).")
    parser.add_argument("--demo", action="store_true", help="Auto-generate a demo video to test pipeline.")
    args = parser.parse_args()

    input_file = args.input
    if not input_file:
        if args.demo or not os.path.exists("test.mp4"):
            input_file = "demo_input.mp4"
            create_demo_video(input_file)
        else:
            input_file = "test.mp4"

    if not os.path.exists(input_file):
        print(f"[!] Lỗi: Không tìm thấy file video '{input_file}'.")
        print("    Bạn có thể dùng cờ '--demo' để tự động tạo video mẫu:")
        print("    python engine/test_video_redact.py --demo")
        return

    ffmpeg_bin = resolve_ffmpeg_bin()

    print("\n=======================================================")
    print("[*] BẮT ĐẦU TEST VIDEO REDACTION & WHITELIST BIỂN SỐ")
    print(f"    - File đầu vào:        {input_file}")
    print(f"    - File xuất ra:        {args.output}")
    print(f"    - Đối tượng che:       {args.targets}")
    print(f"    - Ngưỡng tin cậy (conf): face={args.conf_face}, plate={args.conf_plate}")
    print(f"    - Whitelist plates:    {args.plates}")
    print(f"    - Kiểu che (style):    {args.style} (strength={args.strength})")
    print(f"    - FFmpeg engine:       {ffmpeg_bin}")
    print("=======================================================\n")

    # Đọc file video đầu vào
    with open(input_file, "rb") as f:
        input_bytes = f.read()

    # Cấu hình tham số theo chuẩn Contract §2B
    params = {
        "redaction": {
            "targets": args.targets,
            "style": args.style,
            "strength": args.strength,
            "padding": 0.1,
        },
        "confidenceThresholds": {
            "face": args.conf_face,
            "plate": args.conf_plate,
        },
        "output": {"quality": "high"},
        "whitelist": {
            "plates": args.plates,
        },
    }

    # Callback hiển thị tiến độ %
    def on_progress(pct: int, stage: str):
        bar_len = 30
        filled = int(bar_len * pct / 100)
        bar = "=" * filled + "-" * (bar_len - filled)
        sys.stdout.write(f"\r[{stage:10s}] [{bar}] {pct:3d}%")
        sys.stdout.flush()

    start_time = time.time()
    processor = VideoRedactProcessor(ffmpeg_bin=ffmpeg_bin)

    try:
        out_bytes, summary, _ = processor.process(
            input_bytes=input_bytes,
            params=params,
            output_key=args.output,
            progress_callback=on_progress,
        )
        print()  # Xuống dòng sau progress bar
    except Exception as e:
        print(f"\n[!] Lỗi trong quá trình xử lý video: {e}")
        return

    # Lưu kết quả
    with open(args.output, "wb") as f:
        f.write(out_bytes)

    elapsed = time.time() - start_time
    print(f"\n[+] XỬ LÝ THÀNH CÔNG trong {elapsed:.2f}s!")
    print(f"[+] File kết quả đã lưu tại: {os.path.abspath(args.output)}")
    print("\n--- BÁO CÁO TÓM TẮT (resultSummary) ---")
    counts = summary.get("counts", {})
    print(f"  • Tổng số track biển số:      {counts.get('plateTracks', 0)}")
    print(f"  • Số track được Whitelist:   {counts.get('whitelistedPlateTracks', 0)} (giữ nguyên không che)")
    print(f"  • Số track bị Che (Redacted): {counts.get('redactedTracks', 0)}")

    tracks = summary.get("tracks", [])
    if tracks:
        print("\n--- CHI TIẾT TỪNG ĐỐI TƯỢNG (TRACKS) ---")
        for t in tracks:
            label = t.get("label", "unknown")
            tid = t.get("trackId")
            p_text = t.get("plateText", "N/A")
            is_w = t.get("whitelisted", False)
            status = "KHÔNG CHE (WHITELISTED)" if is_w else "ĐÃ CHE (REDACTED)"
            print(f"  - Track #{tid} ({label}): Biển số='{p_text}' -> {status}")


if __name__ == "__main__":
    main()
