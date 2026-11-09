"""Comprehensive Unit Tests for License Plate OCR and Whitelist Matching (Phase 2).

Verifies Contract §2A & §2B compliance:
1. Plate text normalization (1-line, 2-line, punctuation, whitespace).
2. Width stretching (1.3x) to avoid adjacent repeated character merging.
3. Accurate recognition on 1-line car plates and 2-line motorcycle plates.
4. Preservation of repeated digits (e.g. 43A-444.44).
5. Privacy by Design: Blurry/low-confidence/empty plates default to redacted (Recall > Precision).
6. Full integration with ImageRedactProcessor (params.whitelist.plates).
"""
import io
import os
import sys

import cv2
import numpy as np
from PIL import Image

# Ensure engine is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.image_redact import ImageRedactProcessor
from src.processors.plate_ocr import (
    DEFAULT_MIN_CONFIDENCE,
    PlateOCRRecognizer,
    PlateWhitelistManager,
    normalize_plate_text,
)


def _render_plate_image(text: str, two_line: bool = False, size=(60, 200)) -> np.ndarray:
    """Helper to render synthetic high-contrast plate image with clear text."""
    h, w = size
    img = np.full((h, w, 3), 255, dtype=np.uint8)
    if not two_line:
        font_scale = 0.85 if len(text) >= 8 else 0.95
        cv2.putText(
            img,
            text,
            (10, int(h * 0.70)),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
    else:
        # Split text into top and bottom lines (e.g. "29V1" and "67890")
        line1 = text[:4]
        line2 = text[4:]
        cv2.putText(
            img,
            line1,
            (15, int(h * 0.42)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.85,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            line2,
            (15, int(h * 0.85)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.85,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )
    return img


def test_plate_text_normalization():
    """Verify normalize_plate_text strips formatting characters and preserves uppercase."""
    assert normalize_plate_text("30A - 123.45") == "30A12345"
    assert normalize_plate_text("51G-678.90") == "51G67890"
    assert normalize_plate_text("29-V1\n123.45") == "29V112345"
    assert normalize_plate_text("43A.999.99") == "43A99999"
    assert normalize_plate_text("  29_A1 - 888.88  ") == "29A188888"
    assert normalize_plate_text("72-B1/999.99") == "72B199999"
    assert normalize_plate_text("") == ""
    assert normalize_plate_text(None) == ""
    assert normalize_plate_text("!@#$%^&*()") == ""


def test_widen_transformation():
    """Verify _widen stretches image horizontally by 1.3x and keeps height."""
    rec = PlateOCRRecognizer(stretch_factor=1.3)
    dummy = np.zeros((60, 100, 3), dtype=np.uint8)
    widened = rec._widen(dummy, factor=1.3)
    assert widened.shape[0] == 60
    assert widened.shape[1] == 130


def test_recognize_one_line_plate():
    """Verify RapidOCR correctly reads standard 1-line car plates."""
    rec = PlateOCRRecognizer()
    plate_img = _render_plate_image("30A12345", two_line=False, size=(60, 220))
    text, conf = rec.recognize(plate_img)
    assert text == "30A12345"
    assert conf >= DEFAULT_MIN_CONFIDENCE


def test_recognize_two_line_plate():
    """Verify 'whole_or_split' strategy correctly reads 2-line motorcycle plates."""
    rec = PlateOCRRecognizer()
    plate_img = _render_plate_image("29V167890", two_line=True, size=(80, 160))
    text, conf = rec.recognize(plate_img)
    assert text == "29V167890"
    assert conf >= DEFAULT_MIN_CONFIDENCE


def test_recognize_repeated_digits():
    """Verify 1.3x horizontal stretch prevents merging adjacent repeated digits."""
    rec = PlateOCRRecognizer()
    plate_img = _render_plate_image("43A44444", two_line=False, size=(60, 240))
    text, conf = rec.recognize(plate_img)
    assert text == "43A44444"
    assert conf >= DEFAULT_MIN_CONFIDENCE


def test_privacy_by_design_policy():
    """Verify Privacy by Design: Low confidence, blurry, or non-whitelisted plates stay redacted."""
    rec = PlateOCRRecognizer()
    mgr = PlateWhitelistManager(recognizer=rec)

    whitelist = ["30A - 123.45", "43A99999"]

    # 1. High confidence whitelisted plate -> WHITELISTED (is_whitelisted=True)
    whitelisted_img = _render_plate_image("30A12345", two_line=False, size=(60, 220))
    is_w, text, conf = mgr.evaluate_plate(whitelisted_img, whitelist)
    assert is_w is True
    assert text == "30A12345"
    assert conf >= DEFAULT_MIN_CONFIDENCE

    # 2. Non-whitelisted plate (stranger) -> REDACTED (is_whitelisted=False)
    stranger_img = _render_plate_image("51G88888", two_line=False, size=(60, 220))
    is_w_stranger, text_stranger, _ = mgr.evaluate_plate(stranger_img, whitelist)
    assert is_w_stranger is False
    assert text_stranger == "51G88888"

    # 3. Completely blurred / blank image -> confidence=0.0 -> REDACTED
    blank_img = np.zeros((60, 200, 3), dtype=np.uint8)
    is_w_blank, text_blank, conf_blank = mgr.evaluate_plate(blank_img, whitelist)
    assert is_w_blank is False
    assert conf_blank < DEFAULT_MIN_CONFIDENCE

    # 4. Mock low confidence (< 0.50) matching plate -> REDACTED
    class LowConfRecognizer(PlateOCRRecognizer):
        def recognize(self, plate_bgr):
            return "30A12345", 0.35  # Below 0.50 threshold

    low_conf_mgr = PlateWhitelistManager(recognizer=LowConfRecognizer())
    is_w_low, text_low, conf_low = low_conf_mgr.evaluate_plate(whitelisted_img, whitelist)
    assert is_w_low is False
    assert conf_low == 0.35

    # 5. Empty whitelist -> REDACTED
    is_w_empty, _, _ = mgr.evaluate_plate(whitelisted_img, [])
    assert is_w_empty is False


def test_image_redact_with_plate_whitelist_e2e():
    """Verify ImageRedactProcessor whitelists authorized plates and redacts unauthorized plates."""
    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt")

    # Create synthetic base image 640x480 with gray background
    img = np.full((480, 640, 3), 150, dtype=np.uint8)

    # Plate 1 (Authorized): "30A12345" at box [50, 50, 250, 110]
    p1 = _render_plate_image("30A12345", two_line=False, size=(60, 200))
    img[50:110, 50:250] = p1

    # Plate 2 (Stranger): "51G88888" at box [300, 200, 500, 260]
    p2 = _render_plate_image("51G88888", two_line=False, size=(60, 200))
    img[200:260, 300:500] = p2

    pil_in = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    pil_in.save(buf, format="JPEG", quality=95)
    img_bytes = buf.getvalue()

    plate_cls_id = next(
        k for k, v in processor.model.names.items() if processor.class_mapping.get(v) == "plate"
    )

    # Mock YOLO predict to return exactly these two plate boxes
    class MockBox:
        def __init__(self, xyxy, conf, cls_id):
            self.xyxy = [np.array(xyxy)]
            self.conf = [np.array(conf)]
            self.cls = [np.array(cls_id)]

    class MockResults:
        def __init__(self):
            # Class mapping: "plate"
            self.boxes = [
                MockBox([50, 50, 250, 110], 0.92, plate_cls_id),
                MockBox([300, 200, 500, 260], 0.88, plate_cls_id),
            ]

    orig_predict = processor.model.predict
    processor.model.predict = lambda **kwargs: [MockResults()]

    try:
        # Whitelist contains only "30A - 123.45"
        params = {
            "redaction": {"targets": ["plate"], "style": "blackout", "padding": 0.0},
            "output": {"quality": "high"},
            "whitelist": {
                "plates": ["30A - 123.45"],
            },
        }

        out_bytes, summary, content_type = processor.process(
            input_bytes=img_bytes,
            params=params,
            output_key="result.jpg",
        )

        assert summary["counts"]["plate"] == 2
        assert summary["counts"]["whitelistedPlate"] == 1
        assert summary["counts"]["redacted"] == 1

        detections = summary["detections"]
        assert len(detections) == 2

        # Check Plate 1 is whitelisted
        det1 = next(d for d in detections if d["box"] == [50, 50, 250, 110])
        assert det1["whitelisted"] is True
        assert det1["redacted"] is False
        assert det1["plateText"] == "30A12345"

        # Check Plate 2 is redacted
        det2 = next(d for d in detections if d["box"] == [300, 200, 500, 260])
        assert det2["whitelisted"] is False
        assert det2["redacted"] is True
        assert det2["plateText"] == "51G88888"

        # Check pixel content: Plate 1 is preserved, Plate 2 is blacked out
        out_pil = Image.open(io.BytesIO(out_bytes))
        out_np = cv2.cvtColor(np.array(out_pil), cv2.COLOR_RGB2BGR)

        # Plate 1 area should still have white background (pixels > 100)
        p1_roi = out_np[50:110, 50:250]
        assert np.mean(p1_roi) > 100, "Whitelisted plate was redacted!"

        # Plate 2 area should be blackout (mean near zero, accounting for slight JPEG compression artifacts)
        p2_roi = out_np[200:260, 300:500]
        assert np.mean(p2_roi) < 5.0, "Stranger plate was not blacked out!"

    finally:
        processor.model.predict = orig_predict


def test_fuzzy_levenshtein_plate_matching():
    """Verify Levenshtein distance matches blurred plates under vibration with matching province."""
    norm_wl = PlateWhitelistManager.normalize_whitelist(["67L1-785.60", "29V1-678.90"])

    # 1. Motion blurred '78' -> '35'
    is_m, target = PlateWhitelistManager.is_plate_match("67L13550", norm_wl)
    assert is_m is True
    assert target == "67L178560"

    # 2. Missing digit due to vibration
    is_m2, target2 = PlateWhitelistManager.is_plate_match("67L17550", norm_wl)
    assert is_m2 is True
    assert target2 == "67L178560"

    # 3. Screw prefix + vibration
    is_m3, target3 = PlateWhitelistManager.is_plate_match("J67L17550", norm_wl)
    assert is_m3 is True
    assert target3 == "67L178560"

    # 4. Foreign vehicle (different province) -> NOT MATCH
    is_m4, target4 = PlateWhitelistManager.is_plate_match("84A00732", norm_wl)
    assert is_m4 is False
    assert target4 is None

    # 5. Foreign vehicle (same province but different number) -> NOT MATCH
    is_m5, target5 = PlateWhitelistManager.is_plate_match("67B112345", norm_wl)
    assert is_m5 is False
    assert target5 is None

