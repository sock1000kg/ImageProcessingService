"""Empirical Face Similarity Threshold Benchmark on Standard Datasets.

Evaluates the distribution of Cosine Similarity across:
- Positive Pairs (Same Identity): e.g. Obama ref vs side vs HD, Hopkins ref vs test.
- Negative Pairs (Different Identities / Strangers): e.g. Obama vs Biden, Alex, Angelina, Bradley, etc.

Computes:
1. Mean, Min, Max, Std for Positive & Negative pairs.
2. False Acceptance Rate (FAR) - stranger mistakenly classified as whitelist (privacy leak).
3. False Rejection Rate (FRR) - whitelisted person mistakenly redacted.
4. Optimal similarityThreshold and reviewThreshold recommendations.
5. Real E2E Vlogger-mode test on two_people.jpg (Obama + Biden).
"""
import os
import sys
import itertools
import numpy as np
import cv2
from PIL import Image

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure engine directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.image_redact import ImageRedactProcessor
from src.processors.face_embedding import FaceEmbedder
from src.processors.whitelist import WhitelistManager


def extract_face_embedding(img_path: str, processor: ImageRedactProcessor):
    """Detect largest face in image and extract 512-d normalized embedding."""
    if not os.path.exists(img_path):
        raise FileNotFoundError(f"Image not found: {img_path}")

    pil_img = Image.open(img_path).convert("RGB")
    w, h = pil_img.size
    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    results = processor.model.predict(source=pil_img, conf=0.25, imgsz=640, verbose=False)
    result = results[0]

    best_box = None
    best_area = -1
    if result.boxes is not None and len(result.boxes) > 0:
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            raw_label = processor.model.names.get(cls_id, str(cls_id))
            norm_label = processor.class_mapping.get(raw_label)
            if norm_label != "face":
                continue

            xyxy = box.xyxy[0].tolist()
            x1 = max(0, min(w, int(round(xyxy[0]))))
            y1 = max(0, min(h, int(round(xyxy[1]))))
            x2 = max(0, min(w, int(round(xyxy[2]))))
            y2 = max(0, min(h, int(round(xyxy[3]))))
            area = (x2 - x1) * (y2 - y1)
            if area > best_area and (x2 > x1) and (y2 > y1):
                best_area = area
                best_box = (x1, y1, x2, y2)

    if best_box is None:
        raise ValueError(f"No face detected in {img_path}")

    bx1, by1, bx2, by2 = best_box
    face_roi = img_bgr[by1:by2, bx1:bx2]
    return processor.face_embedder.extract_embedding(face_roi), best_box


def run_benchmark():
    print("======================================================================")
    print("🚀 BẮT ĐẦU THỰC NGHIỆM ĐO ĐẠC NGƯỠNG TƯƠNG ĐỒNG (FACE EMBEDDING THRESHOLD)")
    print("======================================================================")

    data_dir = os.path.join(os.path.dirname(__file__), "data", "faces")
    if not os.path.exists(data_dir):
        print(f"Error: Data directory not found at {data_dir}")
        return

    # Initialize processor
    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")
    manager = WhitelistManager(embedder=embedder)
    processor = ImageRedactProcessor(
        model_name="yolov8n-oiv7.pt",
        face_embedder=embedder,
        whitelist_manager=manager,
    )

    # 1. Load faces and extract embeddings
    identity_map = {}
    all_faces = {}

    for root, dirs, files in os.walk(data_dir):
        rel_dir = os.path.relpath(root, data_dir)
        if rel_dir == "group":
            continue  # Used for E2E scene test

        for f in files:
            if not f.lower().endswith((".jpg", ".png", ".jpeg")):
                continue

            img_path = os.path.join(root, f)
            tag = f"{rel_dir}/{f}"

            # Group identity: person folder name or unique stranger name
            if rel_dir == ".":
                person_id = f
            elif rel_dir == "strangers":
                person_id = f"stranger_{f}"
            else:
                person_id = rel_dir

            try:
                emb, box = extract_face_embedding(img_path, processor)
                all_faces[tag] = {"emb": emb, "person": person_id, "path": img_path}
                identity_map.setdefault(person_id, []).append(tag)
                print(f"  [+] Extracted face from {tag} (ID: {person_id})")
            except Exception as e:
                print(f"  [-] Failed to extract from {tag}: {e}")

    print(f"\n=> Tổng cộng trích xuất thành công {len(all_faces)} khuôn mặt từ {len(identity_map)} danh tính.\n")

    # 2. Form Positive Pairs (Same Identity) and Negative Pairs (Different Identities)
    pos_pairs = []
    neg_pairs = []

    tags = list(all_faces.keys())
    for tag1, tag2 in itertools.combinations(tags, 2):
        item1 = all_faces[tag1]
        item2 = all_faces[tag2]
        sim = embedder.compute_similarity(item1["emb"], item2["emb"])

        if item1["person"] == item2["person"]:
            pos_pairs.append((tag1, tag2, sim))
        else:
            neg_pairs.append((tag1, tag2, sim))

    pos_sims = [s for _, _, s in pos_pairs]
    neg_sims = [s for _, _, s in neg_pairs]

    print("----------------------------------------------------------------------")
    print("📊 THỐNG KÊ PHÂN PHỐI ĐIỂM SỐ COSINE SIMILARITY")
    print("----------------------------------------------------------------------")
    print(f"1. CẶP CÙNG DANH TÍNH (POSITIVE PAIRS) - {len(pos_pairs)} cặp:")
    for t1, t2, s in pos_pairs:
        print(f"   • {t1}  <-->  {t2} : {s:.4f}")
    if pos_sims:
        print(f"   => Mean: {np.mean(pos_sims):.4f} | Min: {np.min(pos_sims):.4f} | Max: {np.max(pos_sims):.4f} | Std: {np.std(pos_sims):.4f}")

    print(f"\n2. CẶP KHÁC DANH TÍNH / NGƯỜI LẠ (NEGATIVE PAIRS) - {len(neg_pairs)} cặp:")
    # Print top 5 highest stranger similarities (most dangerous false acceptance cases)
    sorted_neg = sorted(neg_pairs, key=lambda x: x[2], reverse=True)
    print("   • Top 5 cặp người lạ có độ tương đồng cao nhất (nguy cơ nhận nhầm lớn nhất):")
    for t1, t2, s in sorted_neg[:5]:
        print(f"     - {t1}  <-->  {t2} : {s:.4f}")
    if neg_sims:
        print(f"   => Mean: {np.mean(neg_sims):.4f} | Min: {np.min(neg_sims):.4f} | Max: {np.max(neg_sims):.4f} | Std: {np.std(neg_sims):.4f}")

    # 3. Threshold Analysis across candidates
    print("\n----------------------------------------------------------------------")
    print("🎯 PHÂN TÍCH ĐỘ ĐO TẠI CÁC NGƯỠNG KHÁC NHAU (THRESHOLD TRADEOFF)")
    print("----------------------------------------------------------------------")
    print(f"{'Ngưỡng (tau)':^12} | {'FAR (Lộ người lạ)':^20} | {'FRR (Che nhầm người quen)':^25} | {'Đánh giá an toàn':^20}")
    print("-" * 85)

    threshold_candidates = [0.40, 0.45, 0.50, 0.55, 0.58, 0.60, 0.65, 0.70]
    for tau in threshold_candidates:
        # FAR: negative pair with sim >= tau
        far_count = sum(1 for s in neg_sims if s >= tau)
        far_rate = (far_count / len(neg_sims) * 100) if neg_sims else 0.0

        # FRR: positive pair with sim < tau
        frr_count = sum(1 for s in pos_sims if s < tau)
        frr_rate = (frr_count / len(pos_sims) * 100) if pos_sims else 0.0

        if far_count > 0:
            status = "❌ NGUY HIỂM (Lộ người)"
        elif frr_rate == 0:
            status = "⭐ LÝ TƯỞNG (Hoàn hảo)"
        else:
            status = "✅ AN TOÀN (Bảo thủ)"

        print(f"{tau:^12.2f} | {far_rate:>6.1f}% ({far_count:>2}/{len(neg_sims)})    | {frr_rate:>8.1f}% ({frr_count:>2}/{len(pos_sims)})        | {status}")

    # 4. End-to-End Real Scene Test on two_people.jpg
    print("\n----------------------------------------------------------------------")
    print("🎬 KIỂM THỬ THỰC TẾ LUỒNG VLOGGER TRÊN ẢNH NHIỀU NGƯỜI (TWO_PEOPLE.JPG)")
    print("----------------------------------------------------------------------")
    two_people_path = os.path.join(data_dir, "group", "two_people.jpg")
    obama_ref_path = os.path.join(data_dir, "obama", "01_ref.jpg")

    if os.path.exists(two_people_path) and os.path.exists(obama_ref_path):
        with open(two_people_path, "rb") as f:
            two_people_bytes = f.read()

        with open(obama_ref_path, "rb") as f:
            obama_ref_bytes = f.read()

        # Job params: Whitelist Obama, blur style
        job_params = {
            "redaction": {"targets": ["face"], "style": "blur", "strength": 25, "padding": 0.1},
            "confidenceThreshold": 0.35,
            "reviewThreshold": 0.50,
            "whitelist": {
                "faces": [
                    {"bucket": "uploads", "key": "whitelist/obama.jpg", "bytes": obama_ref_bytes}
                ],
                "similarityThreshold": 0.60,
            },
        }

        out_bytes, summary, _ = processor.process(
            two_people_bytes,
            params=job_params,
            output_key="two_people_redacted.jpg",
        )

        out_path = os.path.join(data_dir, "group", "two_people_redacted_result.jpg")
        with open(out_path, "wb") as f:
            f.write(out_bytes)

        print(f"  • Số lượng mặt phát hiện: {summary['counts']['face']}")
        print(f"  • Số mặt Whitelist giữ nguyên: {summary['counts']['whitelistedFace']}")
        print(f"  • Số mặt bị làm mờ (Redacted): {summary['counts']['redacted']}")
        for idx, det in enumerate(summary["detections"]):
            status_str = "GIỮ NGUYÊN (Whitelist)" if det["whitelisted"] else "LÀM MỜ (Người lạ)"
            ref_str = f", ref={det.get('whitelistRef')}" if "whitelistRef" in det else ""
            print(f"    - Detection #{idx+1}: Box={det['box']}, Sim={det.get('similarity', 'N/A')}{ref_str} => {status_str}")

        print(f"  ✅ Ảnh kết quả E2E đã được xuất thành công tại: {out_path}")

    print("\n======================================================================")
    print("🏁 HOÀN TẤT THỰC NGHIỆM ĐO ĐẠC ĐỊNH LƯỢNG!")
    print("======================================================================")


if __name__ == "__main__":
    run_benchmark()
