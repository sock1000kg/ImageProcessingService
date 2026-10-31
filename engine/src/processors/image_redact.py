"""Image Redaction Processor using YOLOv8 for face and license plate privacy masking."""
import io
import os
import time
import logging
from typing import Tuple, Dict, Any, Optional
import numpy as np
import cv2
from PIL import Image

from ..config import settings
from .base import BaseProcessor

logger = logging.getLogger(__name__)


class InvalidInputFileError(ValueError):
    """Raised when the input file is not a valid or readable image."""
    pass


class ImageRedactProcessor(BaseProcessor):
    """Processor for 'image-redact' job type.

    Detects 'face' and 'plate' objects using YOLOv8 (yolov8n-oiv7.pt or fine-tuned model),
    applies configurable redaction (blur, pixelate, blackout) with boundary padding,
    strips EXIF metadata, and returns contract §3B compliant resultSummary.
    """

    DEFAULT_CLASS_MAPPING = {
        "Human face": "face",
        "Vehicle registration plate": "plate",
        "face": "face",
        "plate": "plate",
    }

    def __init__(
        self,
        model_name: str = "yolov8n-oiv7.pt",
        class_mapping: Optional[Dict[str, str]] = None,
        imgsz: int = 640,
    ):
        from ultralytics import YOLO

        self.class_mapping = class_mapping or self.DEFAULT_CLASS_MAPPING
        if imgsz <= 0 or imgsz % 32 != 0:
            raise ValueError(f"YOLO input size must be a positive multiple of 32, got {imgsz}")
        self.imgsz = imgsz

        # Search for model weights locally
        candidate_paths = [
            os.path.join("models", model_name),
            os.path.join("engine", "models", model_name),
            os.path.join("/app", "models", model_name),
            model_name,
            "engine/models/yolov8n-oiv7.pt",
            "models/yolov8n-oiv7.pt",
        ]
        chosen_model = model_name
        for p in candidate_paths:
            if os.path.exists(p):
                chosen_model = p
                break

        logger.info(f"Initializing YOLO model for image-redact from: {chosen_model}...")
        self.model = YOLO(chosen_model)
        # Extract tag like 'yolov8n-oiv7' without .pt extension
        raw_tag = os.path.splitext(os.path.basename(chosen_model))[0]
        self.model_tag = raw_tag
        logger.info(f"YOLO model ({self.model_tag}) loaded successfully with {len(self.model.names)} classes, input size {self.imgsz}px!")

    @staticmethod
    def _apply_redaction_style(roi: np.ndarray, style: str, strength: int) -> np.ndarray:
        """Apply blur, pixelate, or blackout to a single region of interest."""
        h, w = roi.shape[:2]
        if h <= 0 or w <= 0:
            return roi

        if style == "blackout":
            return np.zeros_like(roi)

        elif style == "pixelate":
            block_size = max(1, int(strength))
            small_w = max(1, w // block_size)
            small_h = max(1, h // block_size)
            # Downscale using linear interpolation, then upscale using nearest neighbor (mosaic)
            small = cv2.resize(roi, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
            return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)

        else:  # Default: Gaussian blur
            ksize = int(strength)
            if ksize % 2 == 0:
                ksize += 1
            ksize = max(3, ksize)
            return cv2.GaussianBlur(roi, (ksize, ksize), 0)

    def process(
        self,
        input_bytes: bytes,
        params: Dict[str, Any],
        output_key: str = "",
    ) -> Tuple[bytes, Dict[str, Any], str]:
        start_time = time.perf_counter()

        # 1. Validate input bytes and decode image
        if not input_bytes or len(input_bytes) == 0:
            raise InvalidInputFileError("Input image file is empty (0 bytes).")

        ext = os.path.splitext(output_key)[1].lower().replace(".", "") if output_key else "jpg"

        try:
            pil_img = Image.open(io.BytesIO(input_bytes))
            pil_img.load()  # Fully decode into memory to verify integrity
            has_alpha = (pil_img.mode in ("RGBA", "LA") or ("transparency" in pil_img.info))
            if has_alpha and ext in ("jpg", "jpeg"):
                # Composite onto solid white background per contract §2
                white_bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                rgba_img = pil_img.convert("RGBA")
                white_bg.paste(rgba_img, mask=rgba_img.split()[3])
                pil_img = white_bg
            elif pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
        except Exception as e:
            raise InvalidInputFileError(f"Cannot identify or decode image file: {e}")

        orig_w, orig_h = pil_img.size
        if orig_w <= 0 or orig_h <= 0:
            raise InvalidInputFileError(f"Invalid image dimensions: {orig_w}x{orig_h}")

        # Convert PIL to BGR OpenCV ndarray for drawing and filtering
        img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        # 2. Parse configuration parameters
        redaction_cfg = params.get("redaction", {}) if params else {}
        targets_param = redaction_cfg.get("targets", ["face", "plate"])
        if isinstance(targets_param, str):
            targets_param = [targets_param]
        targets_set = set(t.lower() for t in targets_param)

        style = str(redaction_cfg.get("style", "blur")).lower()
        if style not in ("blur", "pixelate", "blackout"):
            style = "blur"

        default_strength = 25 if style == "blur" else 12
        strength = int(redaction_cfg.get("strength", default_strength))

        padding = float(redaction_cfg.get("padding", 0.1))
        padding = max(0.0, min(0.5, padding))

        conf_threshold = float(params.get("confidenceThreshold", 0.35))
        review_threshold = float(params.get("reviewThreshold", 0.50))

        # 3. Run YOLO inference
        try:
            results = self.model.predict(
                source=pil_img,
                conf=conf_threshold,
                imgsz=self.imgsz,
                verbose=False,
            )
            result = results[0]
        except Exception as e:
            logger.exception(f"YOLO inference failed: {e}")
            raise

        # 4. Filter detections and extract bounding boxes
        detections = []
        boxes = result.boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                raw_label = self.model.names.get(cls_id, str(cls_id))
                norm_label = self.class_mapping.get(raw_label)

                # Skip classes not mapped or not in requested targets
                if not norm_label or norm_label not in targets_set:
                    continue

                conf = round(float(box.conf[0].item()), 4)
                if conf < conf_threshold:
                    continue

                # Original coordinates [x1, y1, x2, y2] strictly clamped to image size
                xyxy = box.xyxy[0].tolist()
                x1 = max(0, min(orig_w, int(round(xyxy[0]))))
                y1 = max(0, min(orig_h, int(round(xyxy[1]))))
                x2 = max(0, min(orig_w, int(round(xyxy[2]))))
                y2 = max(0, min(orig_h, int(round(xyxy[3]))))

                if x2 <= x1 or y2 <= y1:
                    continue

                is_low_conf = bool(conf < review_threshold)

                # In Milestone 1: no whitelist, all targets are redacted
                detections.append({
                    "label": norm_label,
                    "confidence": conf,
                    "box": [x1, y1, x2, y2],
                    "redacted": True,
                    "whitelisted": False,
                    "lowConfidence": is_low_conf,
                })

        # 5. Apply redaction with padding expansion
        for det in detections:
            if not det.get("redacted", False):
                continue

            x1, y1, x2, y2 = det["box"]
            bw = x2 - x1
            bh = y2 - y1
            pad_x = int(round(bw * padding))
            pad_y = int(round(bh * padding))

            px1 = max(0, x1 - pad_x)
            py1 = max(0, y1 - pad_y)
            px2 = min(orig_w, x2 + pad_x)
            py2 = min(orig_h, y2 + pad_y)

            if px2 > px1 and py2 > py1:
                roi = img_bgr[py1:py2, px1:px2]
                img_bgr[py1:py2, px1:px2] = self._apply_redaction_style(roi, style, strength)

        # 6. Encode output image according to quality preset and strip EXIF
        output_cfg = params.get("output", {}) if params else {}
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
            # PNG is lossless, compression level 3 offers good speed/size balance
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

        success, encoded_buf = cv2.imencode(enc_fmt, img_bgr, enc_params)
        if not success:
            raise ValueError(f"Failed to encode redacted image as {enc_fmt}")
        output_bytes = encoded_buf.tobytes()

        # 7. Compute counts and build resultSummary compliant with contract §3B
        processing_time_ms = round((time.perf_counter() - start_time) * 1000)

        face_count = sum(1 for d in detections if d["label"] == "face")
        plate_count = sum(1 for d in detections if d["label"] == "plate")
        whitelisted_count = sum(1 for d in detections if d.get("whitelisted", False))
        redacted_count = sum(1 for d in detections if d.get("redacted", False))
        low_conf_count = sum(1 for d in detections if d.get("lowConfidence", False))

        result_summary = {
            "imageSize": [orig_w, orig_h],
            "counts": {
                "face": face_count,
                "plate": plate_count,
                "whitelistedFace": whitelisted_count,
                "redacted": redacted_count,
                "lowConfidence": low_conf_count,
            },
            "detections": detections,
            "redaction": {
                "style": style,
                "strength": strength,
                "padding": padding,
            },
            "model": self.model_tag,
            "processingTimeMs": processing_time_ms,
        }

        logger.info(
            f"Image redaction complete: {len(detections)} targets ({redacted_count} redacted, "
            f"{low_conf_count} lowConfidence) in {processing_time_ms}ms"
        )
        return output_bytes, result_summary, content_type
