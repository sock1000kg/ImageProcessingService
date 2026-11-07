"""License Plate OCR and Whitelist Matching Module for Phase 2.

Complies with Contract §2A & §2B:
- Normalizes plate strings: uppercase, strips spaces, hyphens, dots, and newlines.
- Evaluates 1-line and 2-line Vietnamese license plates.
- Privacy by Design: When OCR is uncertain or fails, default to redacting (Recall > Precision).
- Supports pluggable OCR backends with zero-dependency fallback for CPU & offline environments.
"""
import re
import logging
from typing import Tuple, List, Optional, Set
import numpy as np
import cv2

logger = logging.getLogger(__name__)


def normalize_plate_text(text: Optional[str]) -> str:
    """Normalize license plate text per Contract §2A.

    Rules:
    - Uppercase all characters.
    - Remove spaces, dashes (-), dots (.), commas (,), underscores, and newlines.
    - Keep only alphanumeric characters [A-Z0-9].

    Examples:
        '30A - 123.45' -> '30A12345'
        '51G-678.90'   -> '51G67890'
        '29-V1\\n123.45' -> '29V112345'
    """
    if not text:
        return ""
    # Strip any non-alphanumeric characters
    cleaned = re.sub(r"[^A-Za-z0-9]", "", str(text)).upper()
    return cleaned


class PlateOCRRecognizer:
    """OCR engine for Vietnamese license plates (1-line and 2-line)."""

    def __init__(self, min_confidence: float = 0.50):
        self.min_confidence = min_confidence
        self._backend = self._init_backend()

    def _init_backend(self) -> str:
        """Probe available OCR backends in the environment."""
        # 1. Try PaddleOCR (very accurate on Vietnamese plates)
        try:
            from paddleocr import PaddleOCR
            self._paddle = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            logger.info("PlateOCR initialized using PaddleOCR backend.")
            return "paddleocr"
        except Exception:
            pass

        # 2. Try EasyOCR
        try:
            import easyocr
            self._easyocr = easyocr.Reader(["en"], gpu=False)
            logger.info("PlateOCR initialized using EasyOCR backend.")
            return "easyocr"
        except Exception:
            pass

        # 3. Try pytesseract
        try:
            import pytesseract
            self._pytesseract = pytesseract
            logger.info("PlateOCR initialized using PyTesseract backend.")
            return "pytesseract"
        except Exception:
            pass

        logger.info("PlateOCR initialized in fallback heuristic / mock mode.")
        return "fallback"

    def preprocess_plate(self, plate_bgr: np.ndarray) -> np.ndarray:
        """Preprocess plate image to enhance character edges and contrast."""
        h, w = plate_bgr.shape[:2]
        if h <= 0 or w <= 0:
            return plate_bgr

        # Resize to standard height for OCR
        target_h = 120
        scale = target_h / float(h)
        target_w = max(1, int(w * scale))
        resized = cv2.resize(plate_bgr, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        # Contrast Limited Adaptive Histogram Equalization (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        return enhanced

    def recognize(self, plate_bgr: np.ndarray) -> Tuple[str, float]:
        """Recognize text on a license plate ROI.

        Returns:
            (normalized_text, confidence)
        """
        if plate_bgr is None or plate_bgr.size == 0:
            return "", 0.0

        h, w = plate_bgr.shape[:2]
        if h < 10 or w < 20:
            return "", 0.0

        enhanced = self.preprocess_plate(plate_bgr)

        if self._backend == "paddleocr":
            try:
                results = self._paddle.ocr(enhanced, cls=True)
                texts, confs = [], []
                if results and results[0]:
                    for line in results[0]:
                        text, conf = line[1]
                        texts.append(text)
                        confs.append(conf)
                combined = "".join(texts)
                mean_conf = float(np.mean(confs)) if confs else 0.0
                return normalize_plate_text(combined), mean_conf
            except Exception as e:
                logger.warning(f"PaddleOCR recognition failed: {e}")
                return "", 0.0

        elif self._backend == "easyocr":
            try:
                results = self._easyocr.readtext(enhanced)
                texts, confs = [], []
                for _, text, conf in results:
                    texts.append(text)
                    confs.append(conf)
                combined = "".join(texts)
                mean_conf = float(np.mean(confs)) if confs else 0.0
                return normalize_plate_text(combined), mean_conf
            except Exception as e:
                logger.warning(f"EasyOCR recognition failed: {e}")
                return "", 0.0

        elif self._backend == "pytesseract":
            try:
                cfg = "--psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
                text = self._pytesseract.image_to_string(enhanced, config=cfg)
                return normalize_plate_text(text), 0.70
            except Exception as e:
                logger.warning(f"PyTesseract recognition failed: {e}")
                return "", 0.0

        # Fallback: returns empty or can be overridden/mocked in tests
        return "", 0.0


class PlateWhitelistManager:
    """Manages license plate whitelist matching according to Contract §2A."""

    def __init__(self, recognizer: Optional[PlateOCRRecognizer] = None):
        self.recognizer = recognizer or PlateOCRRecognizer()

    @staticmethod
    def normalize_whitelist(plates: List[str]) -> Set[str]:
        """Convert a list of whitelist plate patterns into a normalized set."""
        return {normalize_plate_text(p) for p in plates if normalize_plate_text(p)}

    def evaluate_plate(
        self,
        plate_bgr: np.ndarray,
        whitelist_plates: List[str],
        min_confidence: float = 0.50,
    ) -> Tuple[bool, str, float]:
        """Evaluate whether a plate crop matches any entry in whitelist_plates.

        Returns:
            (is_whitelisted, recognized_norm_text, confidence)
        """
        if not whitelist_plates:
            return False, "", 0.0

        norm_whitelist = self.normalize_whitelist(whitelist_plates)
        if not norm_whitelist:
            return False, "", 0.0

        recognized_text, confidence = self.recognizer.recognize(plate_bgr)
        norm_recognized = normalize_plate_text(recognized_text)

        # Privacy by Design (Contract §2A):
        # OCR must be confident and the string must match 100% exactly after normalization.
        if confidence >= min_confidence and norm_recognized in norm_whitelist:
            logger.info(
                f"License plate '{norm_recognized}' WHITELISTED (confidence={confidence:.2f})"
            )
            return True, norm_recognized, confidence

        logger.debug(
            f"License plate '{norm_recognized}' not whitelisted (confidence={confidence:.2f})"
        )
        return False, norm_recognized, confidence
