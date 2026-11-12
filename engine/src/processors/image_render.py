"""Image Render Processor for manual box redaction without AI inference."""
import io
import os
import time
import logging
from typing import Tuple, Dict, Any, Optional, Callable
import numpy as np
import cv2
from PIL import Image

from .base import (
    BaseProcessor,
    DEFAULT_REDACTION_STRENGTHS,
    apply_redaction_style,
)
from .image_redact import InvalidInputFileError

logger = logging.getLogger(__name__)


class ImageRenderProcessor(BaseProcessor):
    """Processor for 'image-render' job type (Contract §2C).

    Applies bounding boxes directly from `params.boxes` without running any AI
    detection models (pure OpenCV/Pillow graphics processing, latency < 50ms on CPU).
    Used for Web UI 'Edit Image' preview and manual box adjustments.
    """

    def process(
        self,
        input_bytes: bytes,
        params: Dict[str, Any],
        output_key: str = "",
        storage_client: Optional[Any] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Tuple[bytes, Dict[str, Any], str]:
        start_time = time.perf_counter()

        # 1. Validate input bytes and decode image
        if not input_bytes or len(input_bytes) == 0:
            raise InvalidInputFileError("Input image file is empty (0 bytes).")

        ext = os.path.splitext(output_key)[1].lower().replace(".", "") if output_key else "jpg"

        # High-performance decoding via OpenCV, with PIL fallback
        img_bgr = None
        orig_w, orig_h = 0, 0

        try:
            np_buf = np.frombuffer(input_bytes, dtype=np.uint8)
            cv_img = cv2.imdecode(np_buf, cv2.IMREAD_UNCHANGED)
            if cv_img is not None and cv_img.size > 0:
                h, w = cv_img.shape[:2]
                orig_w, orig_h = w, h

                if cv_img.ndim == 2:
                    # Grayscale
                    img_bgr = cv2.cvtColor(cv_img, cv2.COLOR_GRAY2BGR)
                elif cv_img.shape[2] == 4:
                    # BGRA with alpha channel
                    if ext in ("jpg", "jpeg"):
                        # Composite onto solid white background per contract §2
                        b, g, r, a = cv2.split(cv_img)
                        alpha = a.astype(np.float32) / 255.0
                        inv_alpha = 1.0 - alpha
                        b = np.clip(b.astype(np.float32) * alpha + 255.0 * inv_alpha, 0, 255).astype(np.uint8)
                        g = np.clip(g.astype(np.float32) * alpha + 255.0 * inv_alpha, 0, 255).astype(np.uint8)
                        r = np.clip(r.astype(np.float32) * alpha + 255.0 * inv_alpha, 0, 255).astype(np.uint8)
                        img_bgr = cv2.merge([b, g, r])
                    else:
                        img_bgr = cv_img  # Keep alpha for PNG/WEBP
                elif cv_img.shape[2] == 3:
                    img_bgr = cv_img
        except Exception:
            img_bgr = None

        if img_bgr is None:
            # Fallback to PIL for non-standard formats or corrupt headers
            try:
                pil_img = Image.open(io.BytesIO(input_bytes))
                pil_img.load()
                has_alpha = (pil_img.mode in ("RGBA", "LA") or ("transparency" in pil_img.info))
                if has_alpha and ext in ("jpg", "jpeg"):
                    white_bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                    rgba_img = pil_img.convert("RGBA")
                    white_bg.paste(rgba_img, mask=rgba_img.split()[3])
                    pil_img = white_bg
                elif pil_img.mode not in ("RGB", "RGBA"):
                    pil_img = pil_img.convert("RGB")

                orig_w, orig_h = pil_img.size
                if pil_img.mode == "RGBA":
                    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGBA2BGRA)
                else:
                    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception as e:
                raise InvalidInputFileError(f"Cannot identify or decode image file: {e}")

        if orig_w <= 0 or orig_h <= 0 or img_bgr is None:
            raise InvalidInputFileError(f"Invalid image dimensions: {orig_w}x{orig_h}")

        # 2. Parse global redaction configuration
        params = params or {}
        redaction_cfg = params.get("redaction", {}) if isinstance(params, dict) else {}
        if not isinstance(redaction_cfg, dict):
            redaction_cfg = {}

        default_style = str(redaction_cfg.get("style", "blur")).lower()
        if default_style not in ("blur", "pixelate", "blackout"):
            default_style = "blur"

        default_strength = redaction_cfg.get("strength")
        if default_strength is not None:
            try:
                default_strength = int(default_strength)
            except (ValueError, TypeError):
                default_strength = DEFAULT_REDACTION_STRENGTHS.get(default_style, 15)
        else:
            default_strength = DEFAULT_REDACTION_STRENGTHS.get(default_style, 15)

        default_padding = float(redaction_cfg.get("padding", 0.1))
        default_padding = max(0.0, min(0.5, default_padding))

        # 3. Parse and validate boxes list
        raw_boxes = params.get("boxes", []) if isinstance(params, dict) else []
        if raw_boxes is None:
            raw_boxes = []
        if not isinstance(raw_boxes, list):
            raise InvalidInputFileError(f"'boxes' parameter must be a list, got {type(raw_boxes).__name__}")

        processed_boxes_count = 0

        # 4. Apply redaction for each box
        for idx, item in enumerate(raw_boxes):
            if not isinstance(item, dict):
                raise InvalidInputFileError(f"Box at index {idx} must be a dictionary, got {type(item).__name__}")

            box = item.get("box")
            if not isinstance(box, (list, tuple)) or len(box) != 4:
                raise InvalidInputFileError(
                    f"Box at index {idx} must be a list/tuple of 4 numbers [x1, y1, x2, y2], got: {box}"
                )

            try:
                raw_x1, raw_y1, raw_x2, raw_y2 = [float(c) for c in box]
            except (ValueError, TypeError):
                raise InvalidInputFileError(f"Box coordinates at index {idx} must be numeric: {box}")

            # Check for negative or inverted coordinates
            if raw_x2 <= raw_x1 or raw_y2 <= raw_y1:
                raise InvalidInputFileError(
                    f"Invalid box coordinates at index {idx}: [x1, y1, x2, y2]={box} (x2 <= x1 or y2 <= y1)"
                )

            # Check if box is completely outside image boundary
            if raw_x2 <= 0 or raw_x1 >= orig_w or raw_y2 <= 0 or raw_y1 >= orig_h:
                raise InvalidInputFileError(
                    f"Box at index {idx} is completely outside image boundaries ({orig_w}x{orig_h}): {box}"
                )

            # Clamp coordinates to image boundaries (Contract §2C: Box ngoài biên ảnh thì cắt vào trong)
            x1 = max(0, min(orig_w, int(round(raw_x1))))
            y1 = max(0, min(orig_h, int(round(raw_y1))))
            x2 = max(0, min(orig_w, int(round(raw_x2))))
            y2 = max(0, min(orig_h, int(round(raw_y2))))

            if x2 <= x1 or y2 <= y1:
                raise InvalidInputFileError(
                    f"Box at index {idx} has zero area after clamping to image bounds: {box}"
                )

            # Resolve per-box redaction style overrides
            box_style = str(item.get("style", default_style)).lower()
            if box_style not in ("blur", "pixelate", "blackout"):
                box_style = default_style

            if "strength" in item and item["strength"] is not None:
                try:
                    box_strength = int(item["strength"])
                except (ValueError, TypeError):
                    box_strength = default_strength
            else:
                if box_style != default_style:
                    box_strength = DEFAULT_REDACTION_STRENGTHS.get(box_style, 15)
                else:
                    box_strength = default_strength

            if "padding" in item and item["padding"] is not None:
                try:
                    box_padding = float(item["padding"])
                    box_padding = max(0.0, min(0.5, box_padding))
                except (ValueError, TypeError):
                    box_padding = default_padding
            else:
                box_padding = default_padding

            # Apply padding expansion
            bw = x2 - x1
            bh = y2 - y1
            pad_x = int(round(bw * box_padding))
            pad_y = int(round(bh * box_padding))

            px1 = max(0, x1 - pad_x)
            py1 = max(0, y1 - pad_y)
            px2 = min(orig_w, x2 + pad_x)
            py2 = min(orig_h, y2 + pad_y)

            if px2 > px1 and py2 > py1:
                roi = img_bgr[py1:py2, px1:px2]
                img_bgr[py1:py2, px1:px2] = apply_redaction_style(roi, box_style, box_strength)
                processed_boxes_count += 1

        # 5. Encode output image according to quality preset and strip EXIF
        output_cfg = params.get("output", {}) if isinstance(params, dict) else {}
        if not isinstance(output_cfg, dict):
            output_cfg = {}

        quality_level = str(output_cfg.get("quality", "high")).lower()
        if quality_level not in ("standard", "high", "max"):
            quality_level = "high"

        if ext in ("jpg", "jpeg"):
            content_type = "image/jpeg"
            enc_fmt = ".jpg"
            if quality_level == "standard":
                enc_params = [cv2.IMWRITE_JPEG_QUALITY, 80]
            elif quality_level == "max":
                # Quality 95, chroma 4:4:4 per contract §2
                enc_params = [
                    cv2.IMWRITE_JPEG_QUALITY, 95,
                    cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444,
                ]
            else:  # high (default)
                enc_params = [cv2.IMWRITE_JPEG_QUALITY, 90]

        elif ext == "png":
            content_type = "image/png"
            enc_fmt = ".png"
            # Lossless compression level 3 offers good speed/size balance
            enc_params = [cv2.IMWRITE_PNG_COMPRESSION, 3]

        elif ext == "webp":
            content_type = "image/webp"
            enc_fmt = ".webp"
            if quality_level == "standard":
                enc_params = [cv2.IMWRITE_WEBP_QUALITY, 75]
            elif quality_level == "max":
                enc_params = [cv2.IMWRITE_WEBP_QUALITY, 101]  # > 100 indicates lossless in OpenCV
            else:  # high (default)
                enc_params = [cv2.IMWRITE_WEBP_QUALITY, 85]

        else:
            # Fallback to JPEG high
            content_type = "image/jpeg"
            enc_fmt = ".jpg"
            enc_params = [cv2.IMWRITE_JPEG_QUALITY, 90]

        # cv2.imencode natively strips all EXIF/GPS metadata from the buffer
        success, encoded_buf = cv2.imencode(enc_fmt, img_bgr, enc_params)
        if not success:
            raise ValueError(f"Failed to encode rendered image as {enc_fmt}")
        output_bytes = encoded_buf.tobytes()

        # 6. Build resultSummary compliant with Contract §3B3
        processing_time_ms = round((time.perf_counter() - start_time) * 1000)

        result_summary = {
            "imageSize": [orig_w, orig_h],
            "boxes": processed_boxes_count,
            "redaction": {
                "style": default_style,
                "strength": default_strength,
                "padding": default_padding,
            },
            "processingTimeMs": processing_time_ms,
        }

        logger.info(
            f"Image rendering complete: {processed_boxes_count} boxes rendered in {processing_time_ms}ms"
        )
        return output_bytes, result_summary, content_type
