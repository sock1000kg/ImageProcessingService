"""Công cụ Thử nghiệm Trực quan 2 Tính năng Mới của Engine:
1. image-render: Xử lý đồ họa thuần túy cho tính năng 'Sửa ảnh' (tự do chỉnh ảnh theo ý muốn).
2. params.detection.mode: Chọn chế độ 'fast', 'accurate', 'max_privacy' (hoán đổi model & RAM reuse).

Cách sử dụng:
  # 1. TỰ TAY VẼ VÙNG CẦN CHE TRÊN ẢNH BẰNG CHUỘT (Interactive GUI):
  python engine/demo_features.py --interactive --input "duong_dan_anh.jpg"

  # 2. Tự chỉnh kiểu che (pixelate, blur, blackout), độ mờ và tọa độ qua dòng lệnh:
  python engine/demo_features.py --render-only --style pixelate --strength 20 --boxes "100,100,400,400" "500,200,800,600"

  # 3. Chạy demo tự động (sử dụng ảnh mẫu có sẵn trong repo):
  python engine/demo_features.py --demo

  # 4. Đo đạc chi tiết RAM và Latency:
  python engine/demo_features.py --benchmark
"""
import argparse
import json
import os
import sys
import time
from typing import Dict, Any, List, Optional

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import cv2
import numpy as np

# Ensure engine is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from src.processors.image_render import ImageRenderProcessor  # noqa: E402
from src.processors.image_redact import ImageRedactProcessor  # noqa: E402
from src.processors.base import apply_redaction_style  # noqa: E402


DEFAULT_SAMPLE_IMAGE = os.path.join(CURRENT_DIR, "tests", "data", "faces", "group", "two_people.jpg")
OUTPUT_DIR = os.path.join(CURRENT_DIR, "output")


def ensure_output_dir() -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    return OUTPUT_DIR


def get_process_ram_mb() -> float:
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
    except Exception:
        return 0.0


def run_tkinter_gui(img_bytes: bytes, output_dir: str, orig_filename: str = ""):
    """Mở cửa sổ đồ họa Desktop (Tkinter) cho phép người dùng tự kéo chuột vẽ các vùng cần che kèm XEM TRƯỚC TRỰC TIẾP."""
    import io
    import tkinter as tk
    from tkinter import messagebox
    from PIL import Image, ImageTk, ImageOps

    try:
        pil_img = Image.open(io.BytesIO(img_bytes))
        try:
            pil_img = ImageOps.exif_transpose(pil_img)
        except Exception:
            pass
    except Exception as e:
        print(f"❌ Lỗi đọc ảnh: {e}")
        return

    orig_w, orig_h = pil_img.size
    print(f"\n🖼️ Mở trình chỉnh sửa ảnh: Kích thước gốc {orig_w} x {orig_h}")
    print("👉 Hãy thao tác trên cửa sổ vừa hiện lên:")
    print("   1. Dùng chuột trái kéo vẽ các hình chữ nhật quanh vị trí bạn muốn che.")
    print("   2. Xem trước kết quả che (Live Preview) biến đổi theo thời gian thực!")
    print("   3. Đổi kiểu che (Blur/Pixelate/Blackout) hoặc kéo thanh trượt Độ mờ để thấy hiệu ứng ngay.")
    print("   4. Bấm nút màu xanh 'LƯU & XUẤT ẢNH NGAY' khi ưng ý!")

    # Calculate display scale so it fits comfortably on any screen (max 1000x680)
    max_w, max_h = 1000, 680
    scale = min(max_w / orig_w, max_h / orig_h, 1.0)
    disp_w = max(100, int(orig_w * scale))
    disp_h = max(100, int(orig_h * scale))

    disp_img = pil_img.resize((disp_w, disp_h), Image.Resampling.LANCZOS)
    base_disp_rgb = np.array(disp_img.convert("RGB"))

    root = tk.Tk()
    root.title("Cloud-Native Privacy Service - Trình Sửa Ảnh & Live Preview (image-render)")
    root.resizable(False, False)

    boxes_data: List[Dict[str, Any]] = []
    start_pos = [0, 0]
    temp_rect_id = None

    # Header frame
    header_frame = tk.Frame(root, bg="#1e293b", pady=8)
    header_frame.pack(fill=tk.X)
    lbl_title = tk.Label(
        header_frame,
        text="✨ LIVE PREVIEW: Kéo chuột vẽ box và xem kết quả che mờ biến đổi trực tiếp theo thời gian thực!",
        font=("Segoe UI", 10, "bold"),
        fg="#38bdf8",
        bg="#1e293b"
    )
    lbl_title.pack()

    # Canvas frame
    canvas_frame = tk.Frame(root, bg="#0f172a", padx=5, pady=5)
    canvas_frame.pack()

    canvas = tk.Canvas(canvas_frame, width=disp_w, height=disp_h, bg="#334155", cursor="cross", highlightthickness=0)
    canvas.pack()

    tk_photo = ImageTk.PhotoImage(disp_img)
    canvas_img_id = canvas.create_image(0, 0, anchor=tk.NW, image=tk_photo)
    setattr(canvas, "current_photo", tk_photo)

    def update_live_preview():
        """Cập nhật hiệu ứng che trực tiếp trên Canvas theo thời gian thực."""
        cur_style = style_var.get()
        cur_str = scale_str.get()
        cur_pad = scale_pad.get() / 100.0

        if not boxes_data:
            # Revert to original display image
            canvas.itemconfig(canvas_img_id, image=tk_photo)
            return

        preview_arr = base_disp_rgb.copy()
        for b in boxes_data:
            x1_d, y1_d, x2_d, y2_d = b["disp_box"]
            bw = x2_d - x1_d
            bh = y2_d - y1_d
            px = int(round(bw * cur_pad))
            py = int(round(bh * cur_pad))
            x1_p = max(0, x1_d - px)
            y1_p = max(0, y1_d - py)
            x2_p = min(disp_w, x2_d + px)
            y2_p = min(disp_h, y2_d + py)

            if x2_p > x1_p and y2_p > y1_p:
                roi = preview_arr[y1_p:y2_p, x1_p:x2_p]
                preview_arr[y1_p:y2_p, x1_p:x2_p] = apply_redaction_style(roi, cur_style, cur_str)

        preview_pil = Image.fromarray(preview_arr)
        new_photo = ImageTk.PhotoImage(preview_pil)
        setattr(canvas, "preview_photo", new_photo)
        canvas.itemconfig(canvas_img_id, image=new_photo)

    def on_button_press(event):
        nonlocal temp_rect_id
        start_pos[0] = max(0, min(disp_w, event.x))
        start_pos[1] = max(0, min(disp_h, event.y))
        temp_rect_id = canvas.create_rectangle(
            start_pos[0], start_pos[1], start_pos[0], start_pos[1],
            outline="#ef4444", width=2, dash=(4, 2)
        )

    def on_move_press(event):
        if temp_rect_id is not None:
            cur_x = max(0, min(disp_w, event.x))
            cur_y = max(0, min(disp_h, event.y))
            canvas.coords(temp_rect_id, start_pos[0], start_pos[1], cur_x, cur_y)

    def on_button_release(event):
        nonlocal temp_rect_id
        if temp_rect_id is None:
            return
        canvas.delete(temp_rect_id)
        temp_rect_id = None

        end_x = max(0, min(disp_w, event.x))
        end_y = max(0, min(disp_h, event.y))

        x1_disp = min(start_pos[0], end_x)
        y1_disp = min(start_pos[1], end_y)
        x2_disp = max(start_pos[0], end_x)
        y2_disp = max(start_pos[1], end_y)

        # Ignore tiny clicks (< 5px)
        if (x2_disp - x1_disp) < 5 or (y2_disp - y1_disp) < 5:
            return

        # Map back to original coordinate system
        x1_orig = int(round(x1_disp / scale))
        y1_orig = int(round(y1_disp / scale))
        x2_orig = int(round(x2_disp / scale))
        y2_orig = int(round(y2_disp / scale))

        # Clamp to image bounds
        x1_orig = max(0, min(orig_w, x1_orig))
        y1_orig = max(0, min(orig_h, y1_orig))
        x2_orig = max(0, min(orig_w, x2_orig))
        y2_orig = max(0, min(orig_h, y2_orig))

        idx = len(boxes_data) + 1
        perm_rect = canvas.create_rectangle(
            x1_disp, y1_disp, x2_disp, y2_disp,
            outline="#10b981", width=2
        )
        perm_text = canvas.create_text(
            x1_disp + 4, y1_disp + 4, anchor=tk.NW,
            text=f"#{idx}", fill="#10b981", font=("Segoe UI", 9, "bold")
        )

        boxes_data.append({
            "box": [x1_orig, y1_orig, x2_orig, y2_orig],
            "disp_box": [x1_disp, y1_disp, x2_disp, y2_disp],
            "rect_id": perm_rect,
            "text_id": perm_text,
        })
        lbl_box_count.config(text=f"Đã vẽ: {len(boxes_data)} vùng che")
        update_live_preview()

    canvas.bind("<ButtonPress-1>", on_button_press)
    canvas.bind("<B1-Motion>", on_move_press)
    canvas.bind("<ButtonRelease-1>", on_button_release)

    # Control panel frame
    ctrl_frame = tk.Frame(root, padx=10, pady=8)
    ctrl_frame.pack(fill=tk.X)

    # Row 1: Style options
    style_var = tk.StringVar(value="blur")
    lbl_style = tk.Label(ctrl_frame, text="Kiểu che:", font=("Segoe UI", 9, "bold"))
    lbl_style.grid(row=0, column=0, sticky=tk.W, padx=5, pady=3)

    r_blur = tk.Radiobutton(ctrl_frame, text="Làm mờ mịn (Blur)", variable=style_var, value="blur", command=update_live_preview)
    r_pixelate = tk.Radiobutton(ctrl_frame, text="Che hạt mosaic (Pixelate)", variable=style_var, value="pixelate", command=update_live_preview)
    r_blackout = tk.Radiobutton(ctrl_frame, text="Bôi đen (Blackout)", variable=style_var, value="blackout", command=update_live_preview)
    r_blur.grid(row=0, column=1, sticky=tk.W, padx=5)
    r_pixelate.grid(row=0, column=2, sticky=tk.W, padx=5)
    r_blackout.grid(row=0, column=3, sticky=tk.W, padx=5)

    # Row 2: Sliders
    lbl_str = tk.Label(ctrl_frame, text="Độ mạnh (Strength):", font=("Segoe UI", 9, "bold"))
    lbl_str.grid(row=1, column=0, sticky=tk.W, padx=5, pady=3)
    scale_str = tk.Scale(ctrl_frame, from_=1, to=100, orient=tk.HORIZONTAL, length=180, command=lambda _: update_live_preview())
    scale_str.set(15)
    scale_str.grid(row=1, column=1, columnspan=2, sticky=tk.W, padx=5)

    lbl_pad = tk.Label(ctrl_frame, text="Lề nới rộng (Padding):", font=("Segoe UI", 9, "bold"))
    lbl_pad.grid(row=1, column=3, sticky=tk.W, padx=5, pady=3)
    scale_pad = tk.Scale(ctrl_frame, from_=0, to=30, orient=tk.HORIZONTAL, length=120, command=lambda _: update_live_preview())
    scale_pad.set(10)
    scale_pad.grid(row=1, column=4, sticky=tk.W, padx=5)

    # Action buttons frame
    action_frame = tk.Frame(root, pady=8)
    action_frame.pack(fill=tk.X, padx=10)

    lbl_box_count = tk.Label(action_frame, text="Đã vẽ: 0 vùng che", font=("Segoe UI", 10, "bold"), fg="#2563eb")
    lbl_box_count.pack(side=tk.LEFT, padx=10)

    def undo_last():
        if boxes_data:
            last = boxes_data.pop()
            canvas.delete(last["rect_id"])
            canvas.delete(last["text_id"])
            lbl_box_count.config(text=f"Đã vẽ: {len(boxes_data)} vùng che")
            update_live_preview()

    def clear_all():
        while boxes_data:
            last = boxes_data.pop()
            canvas.delete(last["rect_id"])
            canvas.delete(last["text_id"])
        lbl_box_count.config(text="Đã vẽ: 0 vùng che")
        update_live_preview()

    btn_undo = tk.Button(action_frame, text="↩️ Hoàn tác ô trước", command=undo_last, padx=8, pady=4)
    btn_undo.pack(side=tk.LEFT, padx=5)

    btn_clear = tk.Button(action_frame, text="🗑️ Xóa tất cả", command=clear_all, padx=8, pady=4)
    btn_clear.pack(side=tk.LEFT, padx=5)

    def save_and_render():
        if not boxes_data:
            messagebox.showwarning("Chưa có vùng che", "Vui lòng dùng chuột kéo vẽ ít nhất 1 hộp trên ảnh trước khi xuất!")
            return

        chosen_style = style_var.get()
        chosen_str = scale_str.get()
        chosen_pad = scale_pad.get() / 100.0

        params = {
            "redaction": {
                "style": chosen_style,
                "strength": chosen_str,
                "padding": chosen_pad
            },
            "output": {"quality": "high"},
            "boxes": [{"label": "manual", "box": b["box"]} for b in boxes_data]
        }

        processor = ImageRenderProcessor()
        ext = os.path.splitext(orig_filename)[1].lower() if orig_filename else ".jpg"
        if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
            ext = ".jpg"
        out_key = f"custom_render{ext}"
        out_file = os.path.join(output_dir, out_key)

        t0 = time.perf_counter()
        out_bytes, summary, _ = processor.process(img_bytes, params, output_key=out_key)
        latency_ms = (time.perf_counter() - t0) * 1000

        with open(out_file, "wb") as f:
            f.write(out_bytes)

        print("\n🎉 XUẤT ẢNH THÀNH CÔNG THEO Ý BẠN!")
        print(f"   - Độ trễ xử lý đồ họa (Latency): {latency_ms:.2f} ms")
        print(f"   - Số lượng vùng che: {len(boxes_data)}")
        print(f"   - File kết quả: {out_file}")
        print("   - Báo cáo resultSummary chuẩn Contract §3B3:")
        print("     " + json.dumps(summary, indent=6))

        messagebox.showinfo(
            "Xuất ảnh thành công!",
            f"Đã xuất ảnh gốc chất lượng cao với {len(boxes_data)} vùng che ({latency_ms:.1f}ms)!\n\nFile lưu tại:\n{out_file}"
        )

    btn_save = tk.Button(
        action_frame,
        text="💾 LƯU & XUẤT ẢNH NGAY",
        command=save_and_render,
        bg="#059669",
        fg="white",
        font=("Segoe UI", 10, "bold"),
        padx=12,
        pady=5,
        cursor="hand2"
    )
    btn_save.pack(side=tk.RIGHT, padx=10)

    # Center window on screen
    root.update_idletasks()
    win_w = root.winfo_width()
    win_h = root.winfo_height()
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    pos_x = max(0, int((screen_w - win_w) / 2))
    pos_y = max(0, int((screen_h - win_h) / 2))
    root.geometry(f"+{pos_x}+{pos_y}")

    root.mainloop()


def run_demo_render(
    img_bytes: bytes,
    output_dir: str,
    custom_boxes: Optional[List[List[int]]] = None,
    style: str = "blur",
    strength: int = 15,
    padding: float = 0.1,
    quality: str = "high",
    json_params_path: Optional[str] = None
):
    print("\n" + "="*70)
    print("🎨 [DEMO TÍNH NĂNG A]: JOB 'image-render' (Chỉnh & Render ảnh không dùng AI)")
    print("="*70)
    print("Mô tả: Nhận danh sách box người dùng đã sửa/vẽ trên Web UI hoặc truyền vào.")
    print("       Thuần xử lý OpenCV/Pillow, KHÔNG chạy mô hình AI, tốc độ siêu tốc < 50ms.")

    processor = ImageRenderProcessor()

    if json_params_path and os.path.exists(json_params_path):
        with open(json_params_path, "r", encoding="utf-8") as f:
            params = json.load(f)
        print(f"ℹ️ Đã nạp cấu hình tùy chỉnh từ file JSON: {json_params_path}")
    elif custom_boxes:
        # User passed boxes from command line
        params = {
            "redaction": {"style": style, "strength": strength, "padding": padding},
            "output": {"quality": quality},
            "boxes": [{"label": "manual", "box": b} for b in custom_boxes]
        }
        print(f"ℹ️ Áp dụng {len(custom_boxes)} box tùy chỉnh do bạn truyền vào.")
    else:
        # Default sample boxes simulating user adjusting boxes in Web UI
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        h, w = img.shape[:2]

        box1 = [int(w * 0.15), int(h * 0.15), int(w * 0.45), int(h * 0.55)]
        box2 = [int(w * 0.55), int(h * 0.15), int(w * 0.85), int(h * 0.55)]
        box3 = [int(w * 0.25), int(h * 0.75), int(w * 0.75), int(h * 0.90)]

        params = {
            "redaction": {"style": style, "strength": strength, "padding": padding},
            "output": {"quality": quality},
            "boxes": [
                {"label": "face", "box": box1},
                {"label": "face", "box": box2, "style": "pixelate", "strength": 8},
                {"label": "custom", "box": box3, "style": "blackout", "padding": 0.0},
            ],
        }

    out_key = "render_result.jpg"
    out_file = os.path.join(output_dir, out_key)

    t0 = time.perf_counter()
    out_bytes, summary, content_type = processor.process(img_bytes, params, output_key=out_key)
    latency_ms = (time.perf_counter() - t0) * 1000

    with open(out_file, "wb") as f:
        f.write(out_bytes)

    print("\n✅ Kết quả xử lý 'image-render':")
    print(f"   - Độ trễ xử lý (Latency): {latency_ms:.2f} ms (< 50ms: {'ĐẠT CHUẨN ✅' if latency_ms < 50 else 'CHƯA ĐẠT ❌'})")
    print(f"   - File kết quả đã xuất: {out_file}")
    print(f"   - Định dạng & MIME Type: {content_type}")
    print("   - Báo cáo resultSummary chuẩn Contract §3B3:")
    print("     " + json.dumps(summary, indent=6))


def show_modes_comparison_gui(results_summary: List[Dict[str, Any]]):
    """Mở cửa sổ đồ họa hiển thị so sánh 3 ảnh kết quả của 3 chế độ song song."""
    try:
        import tkinter as tk
        from PIL import Image, ImageTk

        root = tk.Tk()
        root.title("So sánh 3 Chế độ Nhận diện: Fast vs Accurate vs Max Privacy")
        root.resizable(False, False)

        header = tk.Label(
            root,
            text="🔍 SO SÁNH 3 CHẾ ĐỘ NHẬN DIỆN AI (FAST vs ACCURATE vs MAX_PRIVACY)",
            font=("Segoe UI", 12, "bold"),
            bg="#0f172a",
            fg="#38bdf8",
            pady=10
        )
        header.pack(fill=tk.X)

        container = tk.Frame(root, padx=10, pady=10)
        container.pack()

        tk_images = []

        for idx, r in enumerate(results_summary):
            col_frame = tk.Frame(container, relief=tk.GROOVE, borderwidth=2, padx=8, pady=8)
            col_frame.grid(row=0, column=idx, padx=6, pady=6)

            mode_name = r["mode"].upper()
            mod_short = r['model_str'].split('@')[0] if '@' in r['model_str'] else r['model_str']
            cnt_face = r['counts'].get('face', 0)
            cnt_plate = r['counts'].get('plate', 0)

            title_lbl = tk.Label(
                col_frame,
                text=f"Mode: {mode_name}\nModel: {mod_short}\nTìm thấy: {cnt_face} mặt, {cnt_plate} biển\nĐộ trễ: {r['latency_ms']:.1f}ms",
                font=("Segoe UI", 9, "bold"),
                fg="#1e293b",
                justify=tk.CENTER
            )
            title_lbl.pack(pady=4)

            # Load and thumbnail image
            with open(r["file"], "rb") as f:
                img = Image.open(f)
                img.thumbnail((360, 400), Image.Resampling.LANCZOS)
                tk_img = ImageTk.PhotoImage(img)
                tk_images.append(tk_img)

            img_lbl = tk.Label(col_frame, image=tk_img)
            img_lbl.pack()

        setattr(root, "tk_images", tk_images)

        # Center window
        root.update_idletasks()
        win_w = root.winfo_width()
        win_h = root.winfo_height()
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        pos_x = max(0, int((screen_w - win_w) / 2))
        pos_y = max(0, int((screen_h - win_h) / 2))
        root.geometry(f"+{pos_x}+{pos_y}")

        root.mainloop()
    except Exception as e:
        print(f"ℹ️ Không mở GUI so sánh ảnh: {e}")


def run_single_mode(
    img_bytes: bytes,
    output_dir: str,
    mode: str,
    conf_face: Optional[float] = None,
    conf_plate: Optional[float] = None,
):
    print("\n" + "="*70)
    print(f"🔍 [CHẠY ĐƠN CHẾ ĐỘ]: MODE '{mode}'")
    print("="*70)
    processor = ImageRedactProcessor(model_name="yolo26n-1280-e20-crowd.pt")
    out_key = f"redact_{mode}.jpg"
    out_file = os.path.join(output_dir, out_key)

    params: Dict[str, Any] = {"detection": {"mode": mode}}
    thresh_override = {}
    if conf_face is not None:
        thresh_override["face"] = conf_face
    if conf_plate is not None:
        thresh_override["plate"] = conf_plate
    if thresh_override:
        params["confidenceThresholds"] = thresh_override
        print(f"ℹ️ Áp dụng ghi đè ngưỡng (confidenceThresholds): {thresh_override}")

    t0 = time.perf_counter()
    out_bytes, summary, _ = processor.process(img_bytes, params, output_key=out_key)
    latency_ms = (time.perf_counter() - t0) * 1000
    ram_mb = get_process_ram_mb()

    with open(out_file, "wb") as f:
        f.write(out_bytes)

    counts = summary.get("counts", {})
    detections = summary.get("detections", [])
    print(f"\n✅ Kết quả xử lý chế độ '{mode}':")
    print(f"   - Model thực tế nạp: {summary.get('model')}")
    print(f"   - Độ trễ xử lý (Latency): {latency_ms:.2f} ms")
    print(f"   - RAM sử dụng: {ram_mb:.1f} MB (Hạn ngạch Pod <= 1500 MB)")
    print(f"   - Tổng đối tượng phát hiện & che: {len(detections)} ({counts.get('face', 0)} mặt, {counts.get('plate', 0)} biển số)")
    print(f"   - File kết quả: {out_file}")
    print("   - Báo cáo resultSummary chuẩn Contract §3B2:")
    print("     " + json.dumps(summary, indent=6))


def run_demo_detection_modes(img_bytes: bytes, output_dir: str):
    print("\n" + "="*70)
    print("🔍 [DEMO TÍNH NĂNG B]: CHỌN CHẾ ĐỘ NHẬN DIỆN ('params.detection.mode')")
    print("="*70)
    print("Mô tả: Web UI cho phép chọn: 'fast' (nhanh), 'accurate' (chính xác), 'max_privacy' (che triệt để).")
    print("       Worker tự động nạp/hoán đổi model và tái sử dụng RAM an toàn (<= 1.5GB/Pod).")

    processor = ImageRedactProcessor(model_name="yolo26n-1280-e20-crowd.pt")
    modes = ["fast", "accurate", "max_privacy"]
    results_summary: List[Dict[str, Any]] = []

    for mode in modes:
        out_key = f"redact_{mode}.jpg"
        out_file = os.path.join(output_dir, out_key)
        params = {"detection": {"mode": mode}}

        t0 = time.perf_counter()
        out_bytes, summary, _ = processor.process(img_bytes, params, output_key=out_key)
        latency_ms = (time.perf_counter() - t0) * 1000
        ram_after = get_process_ram_mb()

        with open(out_file, "wb") as f:
            f.write(out_bytes)

        model_inst_id = id(processor.model)
        counts = summary.get("counts", {})

        results_summary.append({
            "mode": mode,
            "latency_ms": latency_ms,
            "ram_mb": ram_after,
            "model_str": summary.get("model", ""),
            "model_instance_id": model_inst_id,
            "counts": counts,
            "file": out_file,
        })

    # Summary table
    print("\n" + "-"*70)
    print(f"{'Chế độ (Mode)':<15} | {'Model thực tế':<32} | {'Độ trễ':<10} | {'Mặt tìm thấy':<12} | {'RAM Pod'}")
    print("-"*70)
    for r in results_summary:
        cnt_face = r['counts'].get('face', 0)
        cnt_plate = r['counts'].get('plate', 0)
        total_targets = f"{cnt_face} mặt, {cnt_plate} biển"
        mod_short = r['model_str'].split('@')[0] if '@' in r['model_str'] else r['model_str']
        print(f"{r['mode']:<15} | {mod_short:<32} | {r['latency_ms']:>6.1f} ms | {total_targets:<12} | {r['ram_mb']:.1f} MB")
    print("-"*70)

    # Verify RAM reuse
    id_acc = results_summary[1]["model_instance_id"]
    id_max = results_summary[2]["model_instance_id"]
    reused = (id_acc == id_max)
    print("\n🧠 [Kiểm chứng Quản lý Bộ nhớ]:")
    print(f"   - Instance ID của mode 'accurate':    {id_acc}")
    print(f"   - Instance ID của mode 'max_privacy': {id_max}")
    print(f"   - Kết luận tái sử dụng RAM: {'THÀNH CÔNG (Trùng khớp 100% - Zero reload latency) ✅' if reused else 'CHƯA TÁI SỬ DỤNG ❌'}")
    print(f"   - Ảnh kết quả đã lưu tại thư mục: {output_dir}")

    # Open side-by-side comparison GUI
    show_modes_comparison_gui(results_summary)


def parse_cli_box(box_str: str) -> List[int]:
    """Parse 'x1,y1,x2,y2' string into list of 4 integers."""
    parts = [int(p.strip()) for p in box_str.split(",")]
    if len(parts) != 4:
        raise ValueError(f"Box phải có 4 tọa độ x1,y1,x2,y2. Giá trị nhận được: '{box_str}'")
    return parts


def main():
    parser = argparse.ArgumentParser(description="Script thử nghiệm trực quan tính năng image-render và detection.mode")
    parser.add_argument("--input", "-i", type=str, default=None, help="Đường dẫn file ảnh đầu vào (JPG/PNG/WEBP)")
    parser.add_argument("--demo", action="store_true", help="Chạy thử nghiệm tự động với ảnh mẫu two_people.jpg")
    parser.add_argument("--interactive", "-it", action="store_true", help="Bật giao diện GUI kéo-thả chuột để tự vẽ box theo ý muốn")
    parser.add_argument("--render-only", action="store_true", help="Chỉ chạy thử nghiệm tính năng image-render")
    parser.add_argument("--modes-only", action="store_true", help="Chỉ chạy thử nghiệm tính năng detection.mode (so sánh cả 3 mode)")
    parser.add_argument("--mode", type=str, default=None, choices=["fast", "accurate", "max_privacy"], help="Chỉ chạy 1 chế độ AI cụ thể")
    parser.add_argument("--conf-face", type=float, default=None, help="Ghi đè ngưỡng confidence cho class face (mặt)")
    parser.add_argument("--conf-plate", type=float, default=None, help="Ghi đè ngưỡng confidence cho class plate (biển số)")
    parser.add_argument("--benchmark", action="store_true", help="Chạy bộ benchmark định lượng RAM và Latency")

    # Custom redaction parameters for image-render
    parser.add_argument("--style", type=str, default="blur", choices=["blur", "pixelate", "blackout", "mask"], help="Kiểu che (blur/pixelate/blackout)")
    parser.add_argument("--strength", type=int, default=15, help="Độ mạnh che mờ (1-100)")
    parser.add_argument("--padding", type=float, default=0.1, help="Lề mở rộng box (0.0 - 0.5)")
    parser.add_argument("--quality", type=str, default="high", choices=["standard", "high", "max"], help="Chất lượng ảnh nén xuất ra")
    parser.add_argument("--boxes", nargs="*", default=None, help="Danh sách các hộp tọa độ 'x1,y1,x2,y2' (ví dụ: --boxes '100,100,400,400' '500,200,800,600')")
    parser.add_argument("--json-params", type=str, default=None, help="Đường dẫn file JSON chứa params tùy ý")

    args = parser.parse_args()

    if args.benchmark:
        from tests.benchmark_modes_and_ram import run_benchmark
        run_benchmark()
        return

    # Determine input image
    image_path = args.input
    if not image_path or not os.path.exists(image_path):
        if os.path.exists(DEFAULT_SAMPLE_IMAGE):
            image_path = DEFAULT_SAMPLE_IMAGE
            print(f"ℹ️ Không truyền file ảnh hợp lệ -> Tự động dùng ảnh mẫu: {image_path}")
        else:
            print("❌ Lỗi: Không tìm thấy ảnh đầu vào. Vui lòng truyền: --input <duong_dan_anh>")
            sys.exit(1)

    with open(image_path, "rb") as f:
        img_bytes = f.read()

    output_dir = ensure_output_dir()
    print(f"📂 Thư mục chứa ảnh kết quả: {os.path.abspath(output_dir)}")

    # Interactive GUI mode (Tkinter)
    if args.interactive:
        run_tkinter_gui(img_bytes, output_dir, orig_filename=os.path.basename(image_path))
        return

    # Parse custom boxes if provided
    parsed_boxes = None
    if args.boxes:
        parsed_boxes = [parse_cli_box(b) for b in args.boxes]

    if args.mode:
        run_single_mode(
            img_bytes,
            output_dir,
            mode=args.mode,
            conf_face=args.conf_face,
            conf_plate=args.conf_plate,
        )
        return

    if args.render_only:
        run_demo_render(
            img_bytes,
            output_dir,
            custom_boxes=parsed_boxes,
            style=args.style,
            strength=args.strength,
            padding=args.padding,
            quality=args.quality,
            json_params_path=args.json_params,
        )
    elif args.modes_only:
        run_demo_detection_modes(img_bytes, output_dir)
    else:
        # Run both
        run_demo_render(
            img_bytes,
            output_dir,
            custom_boxes=parsed_boxes,
            style=args.style,
            strength=args.strength,
            padding=args.padding,
            quality=args.quality,
            json_params_path=args.json_params,
        )
        run_demo_detection_modes(img_bytes, output_dir)

    print("\n🎉 HOÀN TẤT THỬ NGHIỆM! Bạn có thể mở các file ảnh trong thư mục 'engine/output/' để xem kết quả bằng mắt.")


if __name__ == "__main__":
    main()
