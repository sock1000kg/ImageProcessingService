"""License Plate OCR and Whitelist Matching Module for Phase 2.

Complies strictly with Contract §2A & §2B:
- Normalizes plate strings: uppercase, strips spaces, hyphens, dots, and newlines.
- Evaluates 1-line and 2-line Vietnamese license plates using RapidOCR (PP-OCRv4).
- High performance & lightweight: recognition-only on ONNX Runtime (~0.07s/plate on CPU).
- Width stretching (1.3x) prevents adjacent repeated digits from merging (e.g. 43A-444.44).
- 'whole_or_split' strategy compares confidence scores between full crop and top/bottom split.
- Privacy by Design: When OCR is uncertain (confidence < 0.50) or empty, default to redacting (Recall > Precision).
"""
import logging
import re
from typing import List, Optional, Set, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

STRETCH_FACTOR = 1.3
DEFAULT_MIN_CONFIDENCE = 0.50


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
    """OCR engine for Vietnamese license plates (1-line and 2-line) using RapidOCR."""

    def __init__(
        self,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
        stretch_factor: float = STRETCH_FACTOR,
    ):
        self.min_confidence = min_confidence
        self.stretch_factor = stretch_factor
        self._rapid = None
        self._init_rapidocr()

    def _init_rapidocr(self):
        """Initialize RapidOCR engine with ONNX Runtime."""
        try:
            from rapidocr_onnxruntime import RapidOCR

            self._rapid = RapidOCR()
            logger.info("PlateOCRRecognizer initialized with RapidOCR backend (PP-OCRv4).")
        except Exception as e:
            logger.warning(
                f"Failed to initialize RapidOCR backend: {e}. OCR will operate in fallback mode."
            )
            self._rapid = None

    def _widen(self, img: np.ndarray, factor: float) -> np.ndarray:
        """Horizontally stretch plate crop to avoid merging adjacent identical digits."""
        if factor == 1.0 or img is None or img.size == 0:
            return img
        h, w = img.shape[:2]
        new_w = max(1, int(round(w * factor)))
        return cv2.resize(img, (new_w, h), interpolation=cv2.INTER_CUBIC)

    def _recognise_single(self, img: np.ndarray) -> Tuple[str, float]:
        """Perform text recognition on a single image line without text detection."""
        if self._rapid is None or img is None or img.size == 0:
            return "", 0.0
        try:
            # use_det=False, use_cls=False: only run character recognition
            result, _ = self._rapid(img, use_det=False, use_cls=False, use_rec=True)
            if not result or not result[0]:
                return "", 0.0
            text, score = result[0]
            return str(text), float(score)
        except Exception as e:
            logger.warning(f"RapidOCR recognition error: {e}")
            return "", 0.0

    def recognize(self, plate_bgr: np.ndarray) -> Tuple[str, float]:
        """Recognize text on a license plate ROI using 'whole_or_split' with 1.3x widening.

        Returns:
            (normalized_text, confidence)
        """
        if plate_bgr is None or plate_bgr.size == 0:
            return "", 0.0

        h, w = plate_bgr.shape[:2]
        if h < 10 or w < 20:
            return "", 0.0

        if self._rapid is None:
            return "", 0.0

        # Widen the crops horizontally to prevent character merging
        whole_img = self._widen(plate_bgr, self.stretch_factor)
        whole_text, whole_score = self._recognise_single(whole_img)

        # Split into top and bottom halves for 2-line motorcycle / square plates
        half_h = h // 2
        top_half = plate_bgr[:half_h]
        bottom_half = plate_bgr[half_h:]

        top_img = self._widen(top_half, self.stretch_factor)
        bottom_img = self._widen(bottom_half, self.stretch_factor)

        top_text, top_score = self._recognise_single(top_img)
        bottom_text, bottom_score = self._recognise_single(bottom_img)

        split_score = (top_score + bottom_score) / 2.0
        split_text = top_text + bottom_text

        # Select whichever hypothesis has higher recognition confidence
        if whole_score >= split_score:
            selected_text = whole_text
            selected_score = whole_score
        else:
            selected_text = split_text
            selected_score = split_score

        norm_text = normalize_plate_text(selected_text)
        return norm_text, float(selected_score)


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev[j + 1] + 1
            deletions = curr[j] + 1
            substitutions = prev[j] + (c1 != c2)
            curr.append(min(insertions, deletions, substitutions))
        prev = curr
    return prev[-1]


class PlateWhitelistManager:
    """Manages license plate whitelist matching according to Contract §2A & §2B."""

    def __init__(self, recognizer: Optional[PlateOCRRecognizer] = None):
        self.recognizer = recognizer or PlateOCRRecognizer()

    @staticmethod
    def normalize_whitelist(plates: List[str]) -> Set[str]:
        """Convert a list of whitelist plate patterns into a normalized set."""
        return {normalize_plate_text(p) for p in plates if normalize_plate_text(p)}

    @classmethod
    def is_plate_match(cls, recognized_norm: str, whitelist_norm_set: Set[str]) -> Tuple[bool, Optional[str]]:
        """Robust license plate matching for Vietnamese plates.

        Handles:
        1. Exact string match (Contract §2A).
        2. Screw / mount / border artifact containment (e.g. 'JG7L178560', '67L1785601' -> '67L178560').
        3. Common optical OCR confusion pairs in Vietnam plate typography:
           - Letter 'L' vs digit '1' or letter 'I' (e.g. '671178560', '67178560' -> '67L178560').
           - Digit '0' vs letter 'D'/'O'/'Q'.
           - Digit '8' vs letter 'B'.
           - Digit '6' vs letter 'G'.
           - Digit '2' vs letter 'Z'.
           - Digit '5' vs letter 'S'.
        4. Vietnamese plate syntax:
           If province (first 2 digits) and serial tail (last 4-5 digits) match, series letter confusion is tolerated.
        """
        if not recognized_norm or not whitelist_norm_set:
            return False, None

        # 1. Exact match
        if recognized_norm in whitelist_norm_set:
            return True, recognized_norm

        c_map = str.maketrans("ODGBISZ", "0068152")
        rec_canon = recognized_norm.translate(c_map)

        for target in whitelist_norm_set:
            if not target:
                continue

            target_canon = target.translate(c_map)

            # 2. Exact match after canonicalization of common OCR confusions
            if rec_canon == target_canon:
                return True, target

            # 3. Containment (screw/frame border artifacts)
            if len(target) >= 7 and (target in recognized_norm or target_canon in rec_canon):
                return True, target

            # 4. Vietnamese syntax: province code (2 digits) + serial tail (4-5 digits) match
            if len(target) >= 8 and len(recognized_norm) >= 8:
                tail_len = 5 if len(target) >= 9 else 4
                if target[-tail_len:] == recognized_norm[-tail_len:] and target_canon[:2] == rec_canon[:2]:
                    return True, target
                if target[-5:] == recognized_norm[-5:] and target_canon[:2] == rec_canon[:2]:
                    return True, target

            # 5. Fuzzy match under motion blur / road vibration with matching province code
            if len(rec_canon) >= 6 and len(target_canon) >= 6:
                # Direct province match
                if rec_canon[:2] == target_canon[:2] and rec_canon[:2].isdigit():
                    dist = _levenshtein_distance(rec_canon, target_canon)
                    max_allowed = 3 if max(len(rec_canon), len(target_canon)) >= 8 else 2
                    if dist <= max_allowed:
                        return True, target
                # Handled screw prefix (e.g. J67...)
                elif len(rec_canon) >= 7 and rec_canon[1:3] == target_canon[:2] and rec_canon[1:3].isdigit():
                    dist = _levenshtein_distance(rec_canon[1:], target_canon)
                    max_allowed = 3 if max(len(rec_canon[1:]), len(target_canon)) >= 8 else 2
                    if dist <= max_allowed:
                        return True, target

        return False, None

    def evaluate_plate(
        self,
        plate_bgr: np.ndarray,
        whitelist_plates: List[str],
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
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

        # Check robust match
        is_match, matched_canonical = self.is_plate_match(norm_recognized, norm_whitelist)

        # Privacy by Design (Contract §2A):
        # OCR must be confident (>= min_confidence) and string must match whitelist.
        # If OCR is uncertain, blurry, or low-confidence (< min_confidence),
        # default to redacting (Recall > Precision).
        if confidence >= min_confidence and is_match:
            effective_text = matched_canonical or norm_recognized
            logger.info(
                f"License plate '{norm_recognized}' matched whitelist '{effective_text}' (confidence={confidence:.2f})"
            )
            return True, effective_text, confidence

        logger.debug(
            f"License plate '{norm_recognized}' not whitelisted (confidence={confidence:.2f})"
        )
        return False, norm_recognized, confidence
