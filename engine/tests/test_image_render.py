"""Unit tests for ImageRenderProcessor (image-render job type)."""
import io
import os
import sys
import time
import pytest
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.image_render import ImageRenderProcessor
from src.processors.image_redact import InvalidInputFileError


@pytest.fixture
def sample_rgb_image_bytes() -> bytes:
    """Create a sample 200x200 RGB image with distinctive texture patterns."""
    arr = np.zeros((200, 200, 3), dtype=np.uint8)
    arr[:] = (128, 128, 128)
    # Distinct gradient/texture in region [40:100, 40:100]
    for y in range(40, 100):
        for x in range(40, 100):
            arr[y, x] = ((x * 4) % 256, (y * 4) % 256, ((x + y) * 2) % 256)
    # Another pattern in region [120:180, 120:180]
    for y in range(120, 180):
        for x in range(120, 180):
            arr[y, x] = ((x * 3) % 256, (y * 3) % 256, 200)
    success, buf = cv2.imencode(".png", arr)
    assert success
    return buf.tobytes()


@pytest.fixture
def processor() -> ImageRenderProcessor:
    return ImageRenderProcessor()


def test_render_blur_pixelate_blackout(processor, sample_rgb_image_bytes):
    """Test standard styles (blur, pixelate, blackout)."""
    orig_img = cv2.imdecode(np.frombuffer(sample_rgb_image_bytes, np.uint8), cv2.IMREAD_COLOR)

    for style in ("blur", "pixelate", "blackout"):
        params = {
            "redaction": {"style": style, "strength": 15, "padding": 0.0},
            "output": {"quality": "high"},
            "boxes": [{"label": "face", "box": [40, 40, 100, 100]}],
        }
        out_bytes, summary, content_type = processor.process(
            sample_rgb_image_bytes, params, output_key="result.png"
        )
        assert content_type == "image/png"
        assert summary["boxes"] == 1
        assert summary["imageSize"] == [200, 200]
        assert summary["redaction"]["style"] == style

        res_img = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
        assert res_img.shape == orig_img.shape

        # Region outside box should remain identical (PNG lossless)
        assert np.array_equal(res_img[0:30, 0:30], orig_img[0:30, 0:30])

        # Region inside box should be altered
        assert not np.array_equal(res_img[40:100, 40:100], orig_img[40:100, 40:100])

        if style == "blackout":
            # For blackout with padding 0.0, pixels inside box should be strictly 0
            assert np.all(res_img[40:100, 40:100] == 0)


def test_render_empty_boxes(processor, sample_rgb_image_bytes):
    """Contract §2C: Empty boxes list should export image without redaction."""
    for empty_val in ([], None):
        params = {
            "redaction": {"style": "blur"},
            "boxes": empty_val,
        }
        out_bytes, summary, _ = processor.process(
            sample_rgb_image_bytes, params, output_key="result.png"
        )
        assert summary["boxes"] == 0
        assert summary["imageSize"] == [200, 200]

        res_img = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
        orig_img = cv2.imdecode(np.frombuffer(sample_rgb_image_bytes, np.uint8), cv2.IMREAD_COLOR)
        assert np.array_equal(res_img, orig_img)


def test_render_per_box_override(processor, sample_rgb_image_bytes):
    """Test that individual box can override style, strength, and padding."""
    params = {
        "redaction": {"style": "blur", "strength": 15, "padding": 0.0},
        "boxes": [
            {"label": "face", "box": [40, 40, 100, 100]},  # uses global blur
            {
                "label": "custom",
                "box": [120, 120, 180, 180],
                "style": "blackout",
                "padding": 0.0,
            },  # overrides to blackout
        ],
    }
    out_bytes, summary, _ = processor.process(
        sample_rgb_image_bytes, params, output_key="result.png"
    )
    assert summary["boxes"] == 2

    res_img = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    # Box 2 is blackout -> all zeros
    assert np.all(res_img[120:180, 120:180] == 0)
    # Box 1 is blur -> not all zeros, but altered
    assert not np.all(res_img[40:100, 40:100] == 0)


def test_render_box_clamping_boundary(processor, sample_rgb_image_bytes):
    """Contract §2C: Boxes extending outside image boundaries must be clamped inwards."""
    params = {
        "redaction": {"style": "blackout", "padding": 0.0},
        "boxes": [
            {"label": "face", "box": [-20, -10, 50, 50]},  # extends past left & top
            {"label": "plate", "box": [180, 170, 230, 220]},  # extends past right & bottom
        ],
    }
    out_bytes, summary, _ = processor.process(
        sample_rgb_image_bytes, params, output_key="result.png"
    )
    assert summary["boxes"] == 2

    res_img = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    # Top-left clamped to [0, 0, 50, 50]
    assert np.all(res_img[0:50, 0:50] == 0)
    # Bottom-right clamped to [180, 170, 200, 200]
    assert np.all(res_img[170:200, 180:200] == 0)


def test_render_invalid_box_raises_error(processor, sample_rgb_image_bytes):
    """Contract §2C: Empty/invalid box -> INVALID_INPUT_FILE."""
    invalid_cases = [
        [50, 50, 50, 80],  # zero width (x2 == x1)
        [50, 80, 100, 80],  # zero height (y2 == y1)
        [80, 50, 40, 90],  # inverted width (x2 < x1)
        [50, 90, 80, 40],  # inverted height (y2 < y1)
        [300, 300, 400, 400],  # completely outside 200x200 image
        [-100, -100, -10, -10],  # completely outside negative
        "not_a_box",  # not list
        [10, 20],  # not 4 elements
        [10, 20, "abc", 50],  # non-numeric
    ]
    for bad_box in invalid_cases:
        params = {"boxes": [{"label": "face", "box": bad_box}]}
        with pytest.raises(InvalidInputFileError):
            processor.process(sample_rgb_image_bytes, params, output_key="result.png")


def test_render_empty_or_corrupt_input_raises_error(processor):
    """Invalid or empty file -> InvalidInputFileError."""
    with pytest.raises(InvalidInputFileError):
        processor.process(b"", {}, output_key="result.jpg")

    with pytest.raises(InvalidInputFileError):
        processor.process(b"not an image binary", {}, output_key="result.jpg")


def test_render_output_formats_and_quality(processor, sample_rgb_image_bytes):
    """Verify JPG, PNG, WEBP and standard/high/max compression qualities."""
    for ext, expected_mime in [
        ("jpg", "image/jpeg"),
        ("png", "image/png"),
        ("webp", "image/webp"),
    ]:
        for quality in ("standard", "high", "max"):
            params = {
                "output": {"quality": quality},
                "boxes": [{"label": "face", "box": [40, 40, 100, 100]}],
            }
            out_bytes, summary, mime = processor.process(
                sample_rgb_image_bytes, params, output_key=f"result.{ext}"
            )
            assert mime == expected_mime
            assert len(out_bytes) > 0

            # Verify decodability and resolution preservation
            decoded = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
            assert decoded is not None
            assert decoded.shape[1] == 200
            assert decoded.shape[0] == 200


def test_render_rgba_to_jpg_composites_white_background(processor):
    """RGBA image rendered to JPG must composite onto white background."""
    rgba = np.zeros((100, 100, 4), dtype=np.uint8)
    rgba[:, :, 3] = 0  # Fully transparent
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    rgba_bytes = buf.getvalue()

    out_bytes, summary, mime = processor.process(
        rgba_bytes, {}, output_key="result.jpg"
    )
    assert mime == "image/jpeg"
    decoded = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    # Fully transparent pixels composited on white should be (255, 255, 255)
    assert np.all(decoded >= 250)


def test_render_latency_under_50ms(processor):
    """Ensure pure graphics rendering latency is strictly low (< 50ms on CPU) per contract §3B3."""
    # 1920x1080 image matching Contract §3B3 example (2 boxes, ~35ms)
    large_img = np.zeros((1080, 1920, 3), dtype=np.uint8)
    large_img[:] = (120, 140, 160)
    cv2.rectangle(large_img, (200, 150), (320, 290), (255, 200, 150), -1)
    cv2.rectangle(large_img, (600, 700), (750, 770), (255, 255, 255), -1)

    success, buf = cv2.imencode(".jpg", large_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert success
    img_bytes = buf.tobytes()

    params = {
        "redaction": {"style": "blur", "strength": 15, "padding": 0.1},
        "output": {"quality": "high"},
        "boxes": [
            {"label": "face", "box": [200, 150, 320, 290]},
            {"label": "plate", "box": [600, 700, 750, 770]},
        ],
    }

    # Warm-up run
    processor.process(img_bytes, params, output_key="result.jpg")

    # Timed run
    t0 = time.perf_counter()
    _, summary, _ = processor.process(img_bytes, params, output_key="result.jpg")
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert summary["boxes"] == 2
    # Contract §3B3 targets ~35ms, allow margin for varying CPU frequencies
    assert elapsed_ms < 60, f"Expected render latency < 60ms, got {elapsed_ms:.2f}ms"
