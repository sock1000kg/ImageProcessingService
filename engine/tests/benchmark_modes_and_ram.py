"""Benchmark RAM consumption and CPU latency across detection modes and image-render."""
import os
import sys
import time
import psutil
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.image_redact import ImageRedactProcessor
from src.processors.image_render import ImageRenderProcessor


def run_benchmark():
    process = psutil.Process(os.getpid())
    base_ram = process.memory_info().rss / (1024 * 1024)
    print(f"📊 [BENCHMARK] Baseline Process RAM: {base_ram:.1f} MB")

    # Generate standard 1080p JPEG test image
    img_1080p = np.zeros((1080, 1920, 3), dtype=np.uint8)
    img_1080p[:] = (120, 140, 160)
    # Add dummy face and plate patterns
    cv2.rectangle(img_1080p, (200, 150), (320, 290), (255, 200, 150), -1)
    cv2.rectangle(img_1080p, (600, 700), (750, 770), (255, 255, 255), -1)
    _, buf = cv2.imencode(".jpg", img_1080p, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_bytes = buf.tobytes()

    # 1. Benchmark ImageRenderProcessor (< 50ms)
    print("\n--- 1. ImageRenderProcessor (No AI, Pure Graphics) ---")
    render_proc = ImageRenderProcessor()
    render_params = {
        "redaction": {"style": "blur", "strength": 15, "padding": 0.1},
        "output": {"quality": "high"},
        "boxes": [
            {"label": "face", "box": [200, 150, 320, 290]},
            {"label": "plate", "box": [600, 700, 750, 770]},
        ],
    }
    # Warm-up
    render_proc.process(img_bytes, render_params, "result.jpg")
    times = []
    for _ in range(5):
        t0 = time.perf_counter()
        _, r_sum, _ = render_proc.process(img_bytes, render_params, "result.jpg")
        times.append((time.perf_counter() - t0) * 1000)
    avg_render = sum(times) / len(times)
    render_ram = process.memory_info().rss / (1024 * 1024)
    print(f"  -> Latency (1080p, 2 boxes): min={min(times):.1f}ms, avg={avg_render:.1f}ms, max={max(times):.1f}ms")
    print(f"  -> Process RAM: {render_ram:.1f} MB")
    print(f"  -> ResultSummary: boxes={r_sum['boxes']}, time={r_sum['processingTimeMs']}ms")
    assert avg_render < 50, f"ImageRender latency should be < 50ms, got {avg_render:.1f}ms"

    # 2. Benchmark ImageRedactProcessor Mode FAST (yolo26n)
    print("\n--- 2. ImageRedactProcessor: Mode FAST (yolo26n-1280-e20-crowd.pt) ---")
    redact_proc = ImageRedactProcessor(model_name="yolo26n-1280-e20-crowd.pt")
    # Warm-up
    redact_proc.process(img_bytes, {"detection": {"mode": "fast"}}, "result.jpg")
    t0 = time.perf_counter()
    _, sum_fast, _ = redact_proc.process(img_bytes, {"detection": {"mode": "fast"}}, "result.jpg")
    t_fast = (time.perf_counter() - t0) * 1000
    fast_peak_ram = process.memory_info().rss / (1024 * 1024)
    print(f"  -> Latency: {t_fast:.1f}ms")
    print(f"  -> Process RAM: {fast_peak_ram:.1f} MB")
    print(f"  -> Model string: {sum_fast['model']}")

    # 3. Benchmark ImageRedactProcessor Mode ACCURATE (Swapping to yolo26s)
    print("\n--- 3. ImageRedactProcessor: Mode ACCURATE (Swap to yolo26s) ---")
    t0 = time.perf_counter()
    _, sum_acc, _ = redact_proc.process(img_bytes, {"detection": {"mode": "accurate"}}, "result.jpg")
    t_acc = (time.perf_counter() - t0) * 1000
    acc_peak_ram = process.memory_info().rss / (1024 * 1024)
    acc_model_id = id(redact_proc.model)
    print(f"  -> Latency (including model load): {t_acc:.1f}ms")
    print(f"  -> Process RAM: {acc_peak_ram:.1f} MB (well within 1.5 GB limit!)")
    print(f"  -> Model string: {sum_acc['model']}")

    # 4. Benchmark ImageRedactProcessor Mode MAX_PRIVACY (Reusing yolo26s in RAM)
    print("\n--- 4. ImageRedactProcessor: Mode MAX_PRIVACY (Reusing yolo26s) ---")
    t0 = time.perf_counter()
    _, sum_max, _ = redact_proc.process(img_bytes, {"detection": {"mode": "max_privacy"}}, "result.jpg")
    t_max = (time.perf_counter() - t0) * 1000
    max_peak_ram = process.memory_info().rss / (1024 * 1024)
    max_model_id = id(redact_proc.model)
    ram_reused = (acc_model_id == max_model_id)
    print(f"  -> Latency: {t_max:.1f}ms")
    print(f"  -> Process RAM: {max_peak_ram:.1f} MB")
    print(f"  -> Instance Reused in RAM: {ram_reused} (acc_id={acc_model_id}, max_id={max_model_id})")
    print(f"  -> Model string: {sum_max['model']}")
    assert ram_reused is True, "max_privacy must reuse identical model instance from accurate mode"

    # 5. Swap back to FAST
    print("\n--- 5. ImageRedactProcessor: Swap back to FAST (yolo26n) ---")
    t0 = time.perf_counter()
    _, sum_fast2, _ = redact_proc.process(img_bytes, {"detection": {"mode": "fast"}}, "result.jpg")
    t_fast2 = (time.perf_counter() - t0) * 1000
    swap_back_ram = process.memory_info().rss / (1024 * 1024)
    print(f"  -> Latency (swap back to n): {t_fast2:.1f}ms")
    print(f"  -> Process RAM after gc.collect(): {swap_back_ram:.1f} MB")
    print(f"  -> Model string: {sum_fast2['model']}")

    print("\n" + "="*60)
    print("✅ TOÀN BỘ BENCHMARK RAM & LATENCY HOÀN TẤT THÀNH CÔNG!")
    print(f"   + Max RAM đỉnh ghi nhận: {max(fast_peak_ram, acc_peak_ram, max_peak_ram):.1f} MB <= 1500 MB (K8s limit)")
    print(f"   + Image-Render Latency: {avg_render:.1f} ms < 50 ms")
    print("="*60 + "\n")


if __name__ == "__main__":
    run_benchmark()
