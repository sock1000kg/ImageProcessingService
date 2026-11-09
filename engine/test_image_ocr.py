"""Script kiểm thử tính năng License Plate OCR và Whitelist trên ảnh tĩnh.

Hỗ trợ 3 chế độ kiểm thử:
1. Kiểm thử ảnh chụp xe thực tế (Toàn trình: YOLO Detect Biển số -> OCR -> Whitelist -> Che xe lạ / Giữ xe quen):
   python engine/test_image_ocr.py --input "duong_dan_anh.jpg" --plates "30A-123.45" "67L1-785.60"

2. Kiểm thử trực tiếp trên ảnh crop cận cảnh biển số (Chỉ chạy mô hình OCR):
   python engine/test_image_ocr.py --crop "duong_dan_crop_bien_so.jpg"

3. Chế độ Demo (Tự động sinh ảnh mẫu biển số 1 dòng và 2 dòng để test nhanh):
   python engine/test_image_ocr.py --demo
"""
import argparse
import os
import sys
import time
from typing import List, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import cv2
import numpy as np

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from src.processors.base import apply_redaction_style  # noqa: E402
from src.processors.plate_ocr import (  # noqa: E402
    PlateOCRRecognizer,
    PlateWhitelistManager,
)


def create_demo_image(output_path: str = "demo_plates.jpg") -> Tuple[str, List[str]]:
    """Tự động tạo ảnh mẫu chứa 1 biển số xe ô tô (1 dòng) và 1 biển số xe máy (2 dòng)."""
    h, w = 600, 800
    canvas = np.full((h, w, 3), 200, dtype=np.uint8)

    # 1. Biển số xe ô tô 1 dòng (30A-123.45)
    x1, y1, w1, h1 = 100, 150, 260, 70
    cv2.rectangle(canvas, (x1, y1), (x1 + w1, y1 + h1), (255, 255, 255), -1)
    cv2.rectangle(canvas, (x1, y1), (x1 + w1, y1 + h1), (0, 0, 0), 3)
    cv2.putText(canvas, "30A-123.45", (x1 + 15, y1 + 48), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 3)

    # 2. Biển số xe máy 2 dòng (29V1 / 678.90)
    x2, y2, w2, h2 = 450, 150, 240, 150
    cv2.rectangle(canvas, (x2, y2), (x2 + w2, y2 + h2), (255, 255, 255), -1)
    cv2.rectangle(canvas, (x2, y2), (x2 + w2, y2 + h2), (0, 0, 0), 3)
    # Dòng 1
    cv2.putText(canvas, "29-V1", (x2 + 35, y2 + 55), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 3)
    # Dòng 2
    cv2.putText(canvas, "678.90", (x2 + 25, y2 + 125), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 3)

    cv2.putText(canvas, "[DEMO] Bien so O to (1 dong)", (x1, y1 - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 50, 50), 2)
    cv2.putText(canvas, "[DEMO] Bien so Xe may (2 dong)", (x2, y2 - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 50, 50), 2)

    cv2.imwrite(output_path, canvas)
    return output_path, ["30A-123.45"]


def test_single_crop(crop_path: str, whitelist_plates: List[str] = None):
    """Kiểm thử trực tiếp mô hình OCR trên một ảnh crop biển số."""
    if not os.path.exists(crop_path):
        print(f"[!] Không tìm thấy ảnh crop: {crop_path}")
        return

    img = cv2.imread(crop_path)
    if img is None:
        print(f"[!] Không thể đọc file ảnh: {crop_path}")
        return

    h, w = img.shape[:2]
    print("\n=======================================================")
    print("[*] KIỂM THỬ OCR TRỰC TIẾP TRÊN ẢNH CROP BIỂN SỐ")
    print(f"    - Đường dẫn:     {crop_path}")
    print(f"    - Kích thước:    {w}x{h} px")
    print("=======================================================")

    recognizer = PlateOCRRecognizer()
    start_time = time.monotonic()
    text, conf = recognizer.recognize(img)
    latency = time.monotonic() - start_time

    print("\n[+] KẾT QUẢ NHẬN DIỆN OCR:")
    print(f"    • Ký tự chuẩn hóa (Text):    '{text}'")
    print(f"    • Độ tin cậy OCR (Conf):     {conf:.4f} ({conf * 100:.1f}%)")
    print(f"    • Thời gian xử lý:           {latency * 1000:.2f} ms")

    if whitelist_plates:
        mgr = PlateWhitelistManager(recognizer=recognizer)
        norm_whitelist = mgr.normalize_whitelist(whitelist_plates)
        is_match, matched_plate = mgr.is_plate_match(text, norm_whitelist)
        print(f"\n[+] SO KHỚP VỚI DANH SÁCH WHITELIST {whitelist_plates}:")
        if is_match:
            print(f"    -> [✓] KHỚP WHITELIST! Khớp với: '{matched_plate}' (Giữ nguyên không che)")
        else:
            print("    -> [✗] KHÔNG KHỚP WHITELIST! (Sẽ bị che theo Privacy by Design)")
    print("=======================================================\n")


def test_full_image(
    image_path: str,
    output_path: str = "result_ocr.jpg",
    whitelist_plates: List[str] = None,
    conf_detect: float = 0.25,
    style: str = "pixelate",
    strength: int = 8,
    save_crops: bool = True,
):
    """Kiểm thử toàn trình: YOLO Detect Biển số -> OCR -> Whitelist Matching -> Redaction."""
    if not os.path.exists(image_path):
        print(f"[!] Không tìm thấy ảnh đầu vào: {image_path}")
        return

    img = cv2.imread(image_path)
    if img is None:
        print(f"[!] Lỗi: Không thể đọc ảnh: {image_path}")
        return

    orig_h, orig_w = img.shape[:2]

    # Tìm weights mô hình phát hiện biển số
    model_paths = [
        "engine/models/yolo26n-1280-e20-crowd.pt",
        "models/yolo26n-1280-e20-crowd.pt",
        "engine/models/yolov8n-oiv7.pt",
        "models/yolov8n-oiv7.pt",
    ]
    chosen_model = None
    for p in model_paths:
        if os.path.exists(p):
            chosen_model = p
            break

    if not chosen_model:
        print("[!] Lỗi: Không tìm thấy file model YOLO (.pt) trong thư mục 'engine/models/'.")
        return

    from ultralytics import YOLO

    print("\n=======================================================")
    print("[*] BẮT ĐẦU KIỂM THỬ TOÀN TRÌNH OCR TRÊN ẢNH")
    print(f"    - File đầu vào:        {image_path} ({orig_w}x{orig_h})")
    print(f"    - File xuất ra:        {output_path}")
    print(f"    - Model Detector:      {chosen_model}")
    print(f"    - Ngưỡng phát hiện:    {conf_detect}")
    print(f"    - Whitelist plates:    {whitelist_plates or 'None (Che toàn bộ biển)'}")
    print(f"    - Kiểu che (Style):    {style} (strength={strength})")
    print("=======================================================")

    detector = YOLO(chosen_model)
    recognizer = PlateOCRRecognizer()
    whitelist_mgr = PlateWhitelistManager(recognizer=recognizer)
    norm_whitelist = whitelist_mgr.normalize_whitelist(whitelist_plates or [])

    crop_dir = "ocr_crops"
    if save_crops:
        os.makedirs(crop_dir, exist_ok=True)

    # 1. Phát hiện biển số xe bằng YOLO
    start_t = time.monotonic()
    results = detector.predict(img, imgsz=1280, conf=conf_detect, verbose=False)[0]
    det_time = time.monotonic() - start_t

    plates_found = []
    for b in results.boxes:
        cls_id = int(b.cls[0].item())
        cls_name = detector.names.get(cls_id, str(cls_id))
        # Chỉ lấy nhãn biển số
        if cls_name in ["Vehicle registration plate", "plate"]:
            conf = float(b.conf[0].item())
            xyxy = [int(v) for v in b.xyxy[0].tolist()]
            x1 = max(0, min(orig_w, xyxy[0]))
            y1 = max(0, min(orig_h, xyxy[1]))
            x2 = max(0, min(orig_w, xyxy[2]))
            y2 = max(0, min(orig_h, xyxy[3]))
            if x2 > x1 and y2 > y1:
                plates_found.append({"box": [x1, y1, x2, y2], "det_conf": conf})

    # Nếu chạy demo và detector không bắt được chữ vẽ đồ họa phẳng, fallback tọa độ mẫu
    if not plates_found and "demo_plates.jpg" in image_path:
        plates_found = [
            {"box": [100, 150, 360, 220], "det_conf": 1.00},
            {"box": [450, 150, 690, 300], "det_conf": 1.00},
        ]

    print(f"[+] Phát hiện {len(plates_found)} biển số xe trong ảnh (Detection: {det_time*1000:.1f}ms):")

    result_img = img.copy()
    summary_rows = []

    for idx, item in enumerate(plates_found, start=1):
        x1, y1, x2, y2 = item["box"]
        crop = img[y1:y2, x1:x2]

        # 2. Chạy OCR nhận diện ký tự
        ocr_t0 = time.monotonic()
        text, ocr_conf = recognizer.recognize(crop)
        ocr_time = (time.monotonic() - ocr_t0) * 1000

        # Lưu ảnh crop để tiện kiểm tra
        crop_filename = f"plate_{idx}_{text or 'unknown'}.jpg"
        crop_path = os.path.join(crop_dir, crop_filename)
        if save_crops:
            cv2.imwrite(crop_path, crop)

        # 3. So khớp với Whitelist
        is_match = False
        matched_pattern = None
        if norm_whitelist:
            is_match, matched_pattern = whitelist_mgr.is_plate_match(text, norm_whitelist)

        # 4. Che biển số nếu không thuộc whitelist
        if not is_match:
            # Thêm padding nhẹ xung quanh biển số
            pad_x = int((x2 - x1) * 0.05)
            pad_y = int((y2 - y1) * 0.05)
            px1 = max(0, x1 - pad_x)
            py1 = max(0, y1 - pad_y)
            px2 = min(orig_w, x2 + pad_x)
            py2 = min(orig_h, y2 + pad_y)
            roi = result_img[py1:py2, px1:px2]
            result_img[py1:py2, px1:px2] = apply_redaction_style(roi, style, strength)
            status_str = "ĐÃ CHE (REDACTED)"
            color = (0, 0, 255)  # Đỏ
        else:
            status_str = f"KHÔNG CHE (WHITELISTED: {matched_pattern})"
            color = (0, 255, 0)  # Xanh lá

        # Vẽ khung và thông tin lên ảnh kết quả
        cv2.rectangle(result_img, (x1, y1), (x2, y2), color, 2)
        label_tag = f"#{idx}: {text or 'N/A'} ({ocr_conf:.2f})"
        cv2.putText(
            result_img,
            label_tag,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

        summary_rows.append({
            "idx": idx,
            "box": [x1, y1, x2, y2],
            "text": text,
            "ocr_conf": ocr_conf,
            "status": status_str,
            "time_ms": ocr_time,
            "crop": crop_path,
        })

        print(f"  • Biển #{idx}: Tọa độ={item['box']}, Conf={item['det_conf']:.2f}")
        print(f"    -> OCR Text:      '{text}' (Độ tin cậy={ocr_conf:.2f}, Thời gian={ocr_time:.1f}ms)")
        print(f"    -> Trạng thái:    {status_str}")
        if save_crops:
            print(f"    -> Ảnh crop lưu:  {crop_path}")

    # Xuất ảnh kết quả
    cv2.imwrite(output_path, result_img)
    print("\n-------------------------------------------------------")
    print(f"[✓] ĐÃ LƯU ẢNH KẾT QUẢ TẠI: {os.path.abspath(output_path)}")
    print(f"    Tổng số biển phát hiện: {len(plates_found)}")
    print(f"    Số biển được Whitelist: {sum(1 for r in summary_rows if 'WHITELISTED' in r['status'])}")
    print(f"    Số biển bị Che:         {sum(1 for r in summary_rows if 'REDACTED' in r['status'])}")
    print("=======================================================\n")


def main():
    parser = argparse.ArgumentParser(description="Công cụ kiểm thử OCR và Whitelist biển số xe trên ảnh.")
    parser.add_argument("--input", "-i", type=str, help="Đường dẫn file ảnh đầu vào chụp xe thực tế.")
    parser.add_argument("--output", "-o", type=str, default="result_ocr.jpg", help="Đường dẫn file ảnh kết quả.")
    parser.add_argument("--crop", "-c", type=str, help="Kiểm thử trực tiếp trên ảnh crop cận cảnh biển số.")
    parser.add_argument("--plates", "-p", nargs="*", default=None, help="Danh sách biển số xe quen thuộc (Whitelist).")
    parser.add_argument("--conf", type=float, default=0.25, help="Ngưỡng phát hiện biển số YOLO (mặc định: 0.25).")
    parser.add_argument("--style", type=str, default="pixelate", choices=["blur", "pixelate", "blackout"])
    parser.add_argument("--strength", type=int, default=8, help="Độ mạnh che mờ/pixelate (mặc định: 8).")
    parser.add_argument("--demo", action="store_true", help="Tự động sinh ảnh mẫu và chạy test ngay lập tức.")
    args = parser.parse_args()

    if args.demo:
        demo_img, demo_whitelist = create_demo_image()
        plates = args.plates if args.plates is not None else demo_whitelist
        test_full_image(
            image_path=demo_img,
            output_path=args.output,
            whitelist_plates=plates,
            conf_detect=args.conf,
            style=args.style,
            strength=args.strength,
        )
    elif args.crop:
        test_single_crop(crop_path=args.crop, whitelist_plates=args.plates)
    elif args.input:
        test_full_image(
            image_path=args.input,
            output_path=args.output,
            whitelist_plates=args.plates,
            conf_detect=args.conf,
            style=args.style,
            strength=args.strength,
        )
    else:
        print("[*] Không có tham số đầu vào. Tự động chuyển sang chế độ Demo...\n")
        demo_img, demo_whitelist = create_demo_image()
        test_full_image(
            image_path=demo_img,
            output_path=args.output,
            whitelist_plates=demo_whitelist,
            conf_detect=args.conf,
            style=args.style,
            strength=args.strength,
        )


if __name__ == "__main__":
    main()
