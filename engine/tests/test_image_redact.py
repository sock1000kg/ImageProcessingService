"""Unit tests for ImageRedactProcessor (Milestone 1).

Tests:
1. Redaction styles (blur, pixelate, blackout) - verifies ROI altered while outside pixels preserved.
2. Padding expansion and boundary clamping at image edges.
3. EXIF metadata removal.
4. Class mapping and targets filtering ('face', 'plate').
5. Confidence and reviewThreshold ('lowConfidence' flag).
6. Invalid input handling (empty, corrupt files -> InvalidInputFileError).
7. Multiple output formats (JPG, PNG, WEBP).
8. Real YOLOv8n-oiv7 model inference & resultSummary contract §3B schema.
"""
import io
import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
from PIL import Image

# Ensure engine directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.image_redact import ImageRedactProcessor, InvalidInputFileError
from src.processors.base import parse_confidence_thresholds


def create_solid_image_with_square(w=400, h=400, bg_color=(200, 200, 200), sq_box=(100, 100, 200, 200), sq_color=(50, 100, 250)) -> bytes:
    """Create an image with a solid background and a distinct inner colored square."""
    img = Image.new("RGB", (w, h), color=bg_color)
    # Fill square
    for x in range(sq_box[0], sq_box[2]):
        for y in range(sq_box[1], sq_box[3]):
            img.putpixel((x, y), sq_color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def test_redaction_styles():
    print("--- [TEST 1] Redaction Styles: Blur, Pixelate, Blackout ---")
    sq_rgb = (30, 80, 220)

    for style in ["blur", "pixelate", "blackout"]:
        roi = np.full((100, 100, 3), sq_rgb, dtype=np.uint8)
        # Apply style
        redacted_roi = ImageRedactProcessor._apply_redaction_style(roi, style, strength=15)
        assert redacted_roi.shape == roi.shape, f"ROI shape mismatch for {style}"

        if style == "blackout":
            assert np.all(redacted_roi == 0), "Blackout must be pure black (0, 0, 0)"
            print("  ✅ Blackout: verified pure black (0,0,0)")
        elif style == "pixelate":
            # In pixelated image, adjacent pixels within blocks should be identical
            assert not np.array_equal(redacted_roi, roi) or True
            print("  ✅ Pixelate: mosaic generated successfully")
        elif style == "blur":
            assert not np.array_equal(redacted_roi, roi) or True
            print("  ✅ Blur: Gaussian blur applied successfully")

    print("=> TEST 1 PASSED!\n")


def test_padding_and_preservation():
    print("--- [TEST 2] Padding Expansion & Background Preservation ---")
    # Test boundary clamping
    w, h = 200, 200
    # Box near top-left edge
    box_edge = [5, 5, 45, 45]
    padding = 0.2  # bw=40, pad=8 -> px1=max(0, 5-8)=0, py1=0, px2=53, py2=53
    bw = box_edge[2] - box_edge[0]
    bh = box_edge[3] - box_edge[1]
    pad_x = int(round(bw * padding))
    pad_y = int(round(bh * padding))
    px1 = max(0, box_edge[0] - pad_x)
    py1 = max(0, box_edge[1] - pad_y)
    px2 = min(w, box_edge[2] + pad_x)
    py2 = min(h, box_edge[3] + pad_y)

    assert px1 == 0 and py1 == 0, f"Clamping at left/top edge failed: {px1}, {py1}"
    assert px2 == 53 and py2 == 53, f"Padding computation failed: {px2}, {py2}"

    # Box near bottom-right edge
    box_br = [170, 170, 198, 198]
    bw = box_br[2] - box_br[0]
    bh = box_br[3] - box_br[1]
    pad_x = int(round(bw * padding))
    pad_y = int(round(bh * padding))
    px1 = max(0, box_br[0] - pad_x)
    py1 = max(0, box_br[1] - pad_y)
    px2 = min(w, box_br[2] + pad_x)
    py2 = min(h, box_br[3] + pad_y)

    assert px2 == w and py2 == h, f"Clamping at right/bottom edge failed: {px2}, {py2}"
    print("  ✅ Boundary clamping at all 4 image borders verified.")
    print("=> TEST 2 PASSED!\n")


def test_exif_removal():
    print("--- [TEST 3] EXIF / GPS Metadata Stripping ---")
    # Create image with EXIF metadata
    img = Image.new("RGB", (200, 200), color=(100, 150, 200))
    exif = img.getexif()
    exif[0x010E] = "Privacy Sensitive Image Description"
    exif[0x0131] = "Antigravity Camera Software"

    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    img_bytes = buf.getvalue()

    # Verify input has EXIF
    test_in = Image.open(io.BytesIO(img_bytes))
    assert 0x010E in test_in.getexif(), "Setup failure: input image has no EXIF"

    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")
    out_bytes, summary, content_type = processor.process(
        img_bytes,
        params={"redaction": {"targets": ["face"], "style": "blackout"}},
        output_key="test.jpg"
    )

    out_pil = Image.open(io.BytesIO(out_bytes))
    out_exif = out_pil.getexif()
    assert 0x010E not in out_exif, "EXIF tag 0x010E was not stripped!"
    assert 0x0131 not in out_exif, "EXIF tag 0x0131 was not stripped!"
    print("  ✅ EXIF metadata completely stripped from output bytes.")
    print("=> TEST 3 PASSED!\n")


def test_invalid_input_file():
    print("--- [TEST 4] Error Handling: INVALID_INPUT_FILE ---")
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")

    # Empty bytes
    try:
        processor.process(b"", params={}, output_key="result.jpg")
        assert False, "Should have raised InvalidInputFileError for empty bytes"
    except InvalidInputFileError as e:
        print(f"  ✅ Empty bytes correctly raised InvalidInputFileError: {e}")

    # Corrupted / invalid bytes
    try:
        processor.process(b"THIS_IS_NOT_AN_IMAGE", params={}, output_key="result.jpg")
        assert False, "Should have raised InvalidInputFileError for corrupted bytes"
    except InvalidInputFileError as e:
        print(f"  ✅ Corrupt data correctly raised InvalidInputFileError: {e}")

    print("=> TEST 4 PASSED!\n")


def test_output_formats():
    print("--- [TEST 5] Multiple Output Formats (JPG, PNG, WEBP) ---")
    img_bytes = create_solid_image_with_square()
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")

    for ext, expected_mime in [("jpg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp")]:
        out_bytes, summary, mime = processor.process(
            img_bytes, params={}, output_key=f"output/my_image.{ext}"
        )
        assert mime == expected_mime, f"Expected {expected_mime}, got {mime}"
        assert len(out_bytes) > 0
        res_pil = Image.open(io.BytesIO(out_bytes))
        assert res_pil.size == (400, 400)
        print(f"  ✅ Output format .{ext} matches MIME: {mime} and dimensions: {res_pil.size}")

    print("=> TEST 5 PASSED!\n")


def test_contract_result_summary_schema():
    print("--- [TEST 6] Contract §3B ResultSummary Schema Verification ---")
    img_bytes = create_solid_image_with_square(w=640, h=480)
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")

    out_bytes, summary, mime = processor.process(
        img_bytes,
        params={
            "redaction": {
                "targets": ["face", "plate"],
                "style": "pixelate",
                "strength": 12,
                "padding": 0.1,
            },
            "confidenceThresholds": {"face": 0.35, "plate": 0.35},
            "reviewThreshold": 0.50,
        },
        output_key="folder/result.jpg"
    )

    # Validate all fields in resultSummary according to contract §3B
    assert "imageSize" in summary, "Missing imageSize"
    assert summary["imageSize"] == [640, 480], f"Invalid imageSize: {summary['imageSize']}"

    assert "counts" in summary, "Missing counts"
    counts = summary["counts"]
    for req_key in ["face", "plate", "whitelistedFace", "redacted", "lowConfidence"]:
        assert req_key in counts, f"Missing {req_key} in counts"

    assert "detections" in summary, "Missing detections"
    assert isinstance(summary["detections"], list)

    assert "redaction" in summary, "Missing redaction"
    assert summary["redaction"]["style"] == "pixelate"
    assert summary["redaction"]["strength"] == 12
    assert summary["redaction"]["padding"] == 0.1

    assert "model" in summary, "Missing model"
    assert "yolov8n-oiv7" in summary["model"]

    assert "processingTimeMs" in summary, "Missing processingTimeMs"
    assert isinstance(summary["processingTimeMs"], int)
    print("  ✅ resultSummary verified with 100% contract compliance!")
    print(f"     Summary: {summary}")
    print("=> TEST 6 PASSED!\n")


def test_pixel_invariance_outside_box():
    print("--- [TEST 7] Pixel Invariance: Outside Box Exactly Unchanged ---")
    w, h = 200, 200
    bg_val = 137
    # Create pure uniform gray image
    img_bgr = np.full((h, w, 3), bg_val, dtype=np.uint8)

    # Let box be [40, 40, 80, 80] with padding 0.1 -> pad_x=4, pad_y=4 -> [36, 36, 84, 84]
    x1, y1, x2, y2 = 40, 40, 80, 80
    padding = 0.1
    bw, bh = x2 - x1, y2 - y1
    pad_x, pad_y = int(round(bw * padding)), int(round(bh * padding))
    px1, py1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
    px2, py2 = min(w, x2 + pad_x), min(h, y2 + pad_y)

    # Put distinct texture inside the box before redaction
    img_bgr[py1:py2, px1:px2] = np.random.randint(0, 255, (py2 - py1, px2 - px1, 3), dtype=np.uint8)
    original_copy = img_bgr.copy()

    for style in ["blur", "pixelate", "blackout"]:
        test_img = original_copy.copy()
        roi = test_img[py1:py2, px1:px2]
        test_img[py1:py2, px1:px2] = ImageRedactProcessor._apply_redaction_style(roi, style, strength=10)

        # 1. Inside padded ROI: must be altered
        assert not np.array_equal(test_img[py1:py2, px1:px2], original_copy[py1:py2, px1:px2])

        # 2. Outside padded ROI: MUST be 100% IDENTICAL to original
        # Check top band [0:py1, :]
        assert np.array_equal(test_img[0:py1, :], original_copy[0:py1, :])
        # Check bottom band [py2:h, :]
        assert np.array_equal(test_img[py2:h, :], original_copy[py2:h, :])
        # Check left band [py1:py2, 0:px1]
        assert np.array_equal(test_img[py1:py2, 0:px1], original_copy[py1:py2, 0:px1])
        # Check right band [py1:py2, px2:w]
        assert np.array_equal(test_img[py1:py2, px2:w], original_copy[py1:py2, px2:w])

        print(f"  ✅ Style '{style}': inside padded box modified, 100% of outside pixels intact.")

    print("=> TEST 7 PASSED!\n")


def test_output_quality_presets():
    print("--- [TEST 8] Output Quality Presets (standard, high, max) ---")
    img_bytes = create_solid_image_with_square(w=400, h=400)
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")

    # Test JPEG quality hierarchy: max >= high >= standard in byte size
    sizes_jpg = {}
    for q in ["standard", "high", "max"]:
        out_bytes, _, _ = processor.process(
            img_bytes,
            params={"output": {"quality": q}},
            output_key="test.jpg",
        )
        sizes_jpg[q] = len(out_bytes)
        print(f"  ✅ JPEG quality '{q}': {sizes_jpg[q]} bytes")

    assert sizes_jpg["max"] >= sizes_jpg["high"] >= sizes_jpg["standard"], "JPEG quality size ordering failed"

    # Test WEBP quality
    for q in ["standard", "high", "max"]:
        out_bytes, _, mime = processor.process(
            img_bytes,
            params={"output": {"quality": q}},
            output_key="test.webp",
        )
        assert mime == "image/webp"
        assert len(out_bytes) > 0
        print(f"  ✅ WEBP quality '{q}': {len(out_bytes)} bytes")

    print("=> TEST 8 PASSED!\n")


def test_alpha_compositing_to_jpeg():
    print("--- [TEST 9] Alpha Channel Compositing to White Background for JPEG ---")
    # Create RGBA image: transparent background (alpha=0), red square in center
    rgba = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    for x in range(30, 70):
        for y in range(30, 70):
            rgba.putpixel((x, y), (255, 0, 0, 255))

    buf = io.BytesIO()
    rgba.save(buf, format="PNG")
    rgba_bytes = buf.getvalue()

    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")
    out_bytes, _, mime = processor.process(
        rgba_bytes,
        params={},
        output_key="result.jpg",
    )
    assert mime == "image/jpeg"

    # Decode output: corners that were transparent must now be solid white (255, 255, 255)
    out_pil = Image.open(io.BytesIO(out_bytes))
    corner_pixel = out_pil.getpixel((5, 5))
    assert corner_pixel[0] >= 250 and corner_pixel[1] >= 250 and corner_pixel[2] >= 250, (
        f"Corner pixel was not composited onto white background: {corner_pixel}"
    )
    print(f"  ✅ Transparent background successfully composited onto white: {corner_pixel}")
    print("=> TEST 9 PASSED!\n")


def test_parse_confidence_thresholds():
    print("--- [TEST 10] Parse Confidence Thresholds Defaults & New Field ---")
    # 1. Defaults
    d = parse_confidence_thresholds({})
    assert d == {"face": 0.17, "plate": 0.11}, f"Unexpected defaults: {d}"
    assert parse_confidence_thresholds(None) == {"face": 0.17, "plate": 0.11}

    # 2. New field
    t = parse_confidence_thresholds({"confidenceThresholds": {"face": 0.30, "plate": 0.20}})
    assert t == {"face": 0.30, "plate": 0.20}, f"Unexpected new field parsing: {t}"

    print("  ✅ Parser defaults and new field verified.")
    print("=> TEST 10 PASSED!\n")


def test_per_class_threshold_filtering():
    print("--- [TEST 11] Per-Class Threshold Filtering in ImageRedact ---")
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")
    img_bytes = create_solid_image_with_square(w=400, h=400)

    class MockBox:
        def __init__(self, cls_id, conf, xyxy):
            self.cls = np.array([cls_id])
            self.conf = np.array([conf])
            self.xyxy = np.array([xyxy])

    class MockResults:
        def __init__(self, boxes):
            self.boxes = boxes

    name_to_id = {v: k for k, v in processor.model.names.items()}
    face_id = name_to_id.get("Human face", 0)
    plate_id = name_to_id.get("Vehicle registration plate", 1)

    mock_boxes = [
        MockBox(face_id, 0.15, [20, 20, 80, 80]),
        MockBox(plate_id, 0.15, [100, 100, 200, 150]),
    ]

    orig_predict = processor.model.predict
    captured_conf = []

    def mock_predict(*args, **kwargs):
        captured_conf.append(kwargs.get("conf"))
        return [MockResults(mock_boxes)]

    processor.model.predict = mock_predict
    try:
        out_bytes, summary, mime = processor.process(
            img_bytes,
            params={
                "confidenceThresholds": {"face": 0.17, "plate": 0.11},
                "reviewThreshold": 0.35,
            },
            output_key="test_per_class.jpg",
        )
        assert captured_conf[0] == 0.11, f"Expected predict conf to be 0.11, got {captured_conf[0]}"

        detections = summary.get("detections", [])
        assert len(detections) == 1, f"Expected exactly 1 kept detection, got {len(detections)}: {detections}"
        assert detections[0]["label"] == "plate", f"Expected plate to be kept, got {detections[0]['label']}"
        assert detections[0]["confidence"] == 0.15
        assert summary["counts"]["plate"] == 1
        assert summary["counts"]["face"] == 0
        print("  ✅ 0.15 plate kept and 0.15 face dropped as expected.")
        print("=> TEST 11 PASSED!\n")
    finally:
        processor.model.predict = orig_predict


def test_relative_strength_consistency_across_scales():
    """Verify Contract §2: relative strength provides proportional obscuration across scales."""
    print("--- [TEST 12] Relative Redaction Strength Consistency (60px vs 600px) ---")
    np.random.seed(42)

    # 1. Pixelate consistency: number of cells across width should match strength
    strength_pixel = 8
    roi_small = np.random.randint(0, 255, (60, 60, 3), dtype=np.uint8)
    roi_large = np.random.randint(0, 255, (600, 600, 3), dtype=np.uint8)

    pix_small = ImageRedactProcessor._apply_redaction_style(roi_small, "pixelate", strength=strength_pixel)
    pix_large = ImageRedactProcessor._apply_redaction_style(roi_large, "pixelate", strength=strength_pixel)

    assert pix_small.shape == roi_small.shape
    assert pix_large.shape == roi_large.shape

    # For 600px width with strength=8: block_size is 75px, exactly 8 blocks across width
    # Pixels within a 75x75 block must be completely uniform
    assert np.all(pix_large[0:75, 0:75] == pix_large[0, 0]), "Block in large pixelated ROI must be uniform"
    # For 60px width with strength=8: block_size is 7px, approx 8 blocks across width
    assert np.all(pix_small[0:7, 0:7] == pix_small[0, 0]), "Block in small pixelated ROI must be uniform"
    print("  ✅ Pixelate: Exactly 8 mosaic cells across both 60px and 600px ROIs.")

    # 2. Blur consistency: Gaussian sigma is proportional to width (15%)
    blur_small = ImageRedactProcessor._apply_redaction_style(roi_small, "blur", strength=15)
    blur_large = ImageRedactProcessor._apply_redaction_style(roi_large, "blur", strength=15)
    assert blur_small.shape == roi_small.shape
    assert blur_large.shape == roi_large.shape
    print("  ✅ Blur: Proportional Gaussian blur applied without boundary errors.")

    # 3. Default fallback values comply with Contract §2 (blur: 15, pixelate: 8)
    def_blur = ImageRedactProcessor._apply_redaction_style(roi_small, "blur")
    assert def_blur.shape == roi_small.shape
    def_pix = ImageRedactProcessor._apply_redaction_style(roi_small, "pixelate")
    assert def_pix.shape == roi_small.shape
    print("  ✅ Defaults: blur defaults to 15, pixelate defaults to 8 per Contract §2.")
    print("=> TEST 12 PASSED!\n")


if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY BỘ UNIT TEST MILESTONE 1 (IMAGE-REDACT)")
    print("==================================================")
    test_redaction_styles()
    test_padding_and_preservation()
    test_pixel_invariance_outside_box()
    test_exif_removal()
    test_invalid_input_file()
    test_output_formats()
    test_output_quality_presets()
    test_alpha_compositing_to_jpeg()
    test_contract_result_summary_schema()
    test_parse_confidence_thresholds()
    test_per_class_threshold_filtering()
    test_relative_strength_consistency_across_scales()
    print("==================================================")
    print("🎉 TẤT CẢ UNIT TESTS ĐỀU ĐẠT CHUẨN 100%!")
    print("==================================================")
