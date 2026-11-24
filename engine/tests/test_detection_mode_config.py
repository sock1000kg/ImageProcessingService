"""Unit tests for Detection Mode Configuration and Parsers (Task B / Step 3)."""
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.base import (
    DetectionModeConfig,
    parse_mode_config,
    get_detection_mode_config,
    parse_confidence_thresholds,
    resolve_model_path,
)
from src.processors.image_redact import ImageRedactProcessor
from src.processors.video_redact import VideoRedactProcessor
from src.config import settings


def test_parse_mode_config_standard():
    """Verify standard mode configuration string parsing."""
    raw = "yolo26n-1280-e20-crowd.pt@1280:face=0.17,plate=0.11"
    cfg = parse_mode_config("fast", raw)

    assert isinstance(cfg, DetectionModeConfig)
    assert cfg.mode == "fast"
    assert cfg.model_name == "yolo26n-1280-e20-crowd.pt"
    assert cfg.imgsz == 1280
    assert cfg.confidence_thresholds["face"] == 0.17
    assert cfg.confidence_thresholds["plate"] == 0.11


def test_parse_mode_config_fast_and_max_privacy():
    """Verify fast and max_privacy configs have distinct models and thresholds."""
    fast_raw = "yolo26n-1280-e20-crowd.pt@1280:face=0.17,plate=0.11"
    max_raw = "yolo26s-1280-e5-plates-frozen-x3.pt@1280:face=0.06,plate=0.05"

    fast_cfg = parse_mode_config("fast", fast_raw)
    max_cfg = parse_mode_config("max_privacy", max_raw)

    assert fast_cfg.model_name == "yolo26n-1280-e20-crowd.pt"
    assert max_cfg.model_name == "yolo26s-1280-e5-plates-frozen-x3.pt"

    assert fast_cfg.confidence_thresholds["face"] == 0.17
    assert fast_cfg.confidence_thresholds["plate"] == 0.11

    assert max_cfg.confidence_thresholds["face"] == 0.06
    assert max_cfg.confidence_thresholds["plate"] == 0.05


def test_parse_mode_config_robust_fallbacks():
    """Verify safe fallbacks when config string is empty, missing elements, or malformed."""
    # Empty string -> default model & thresholds
    cfg_empty = parse_mode_config("fast", "")
    assert cfg_empty.model_name == "yolo26n-1280-e5-dashcam.pt"
    assert cfg_empty.imgsz == 1280
    assert cfg_empty.confidence_thresholds["face"] == 0.17

    # None -> default model & thresholds
    cfg_none = parse_mode_config("fast", None)
    assert cfg_none.model_name == "yolo26n-1280-e5-dashcam.pt"

    # Only model name without @ or thresholds
    cfg_model_only = parse_mode_config("custom", "my_custom_model.pt")
    assert cfg_model_only.model_name == "my_custom_model.pt"
    assert cfg_model_only.imgsz == 1280
    assert cfg_model_only.confidence_thresholds["face"] == 0.17

    # Non-digit imgsz -> fallback default imgsz 1280
    cfg_bad_sz = parse_mode_config("fast", "model.pt@bad_sz:face=0.20,plate=0.15")
    assert cfg_bad_sz.model_name == "model.pt"
    assert cfg_bad_sz.imgsz == 1280
    assert cfg_bad_sz.confidence_thresholds["face"] == 0.20
    assert cfg_bad_sz.confidence_thresholds["plate"] == 0.15


def test_get_detection_mode_config_settings_resolution():
    """Verify get_detection_mode_config resolves default settings properly."""
    fast_cfg = get_detection_mode_config("fast")
    assert fast_cfg.mode == "fast"
    assert fast_cfg.model_name == "yolo26n-1280-e5-dashcam.pt"
    assert fast_cfg.confidence_thresholds == {"face": 0.17, "plate": 0.11}

    # Accurate or max_privacy aliases to max_privacy
    acc_cfg = get_detection_mode_config("accurate")
    assert acc_cfg.mode == "max_privacy"
    assert acc_cfg.model_name == "yolo26s-1280-e5-dashcam.pt"
    assert acc_cfg.confidence_thresholds == {"face": 0.06, "plate": 0.05}

    max_cfg = get_detection_mode_config("max_privacy")
    assert max_cfg.mode == "max_privacy"
    assert max_cfg.model_name == "yolo26s-1280-e5-dashcam.pt"
    assert max_cfg.confidence_thresholds == {"face": 0.06, "plate": 0.05}

    # Unknown mode falls back to fast
    fallback_cfg = get_detection_mode_config("unknown_mode")
    assert fallback_cfg.mode == "fast"
    assert fallback_cfg.model_name == fast_cfg.model_name


def test_parse_confidence_thresholds_inheritance_and_override():
    """Verify parse_confidence_thresholds correctly inherits mode base thresholds and overrides."""
    base_acc = {"face": 0.13, "plate": 0.09}

    # 1. No params override -> inherits 100% from base
    res1 = parse_confidence_thresholds(params={}, base_thresholds=base_acc)
    assert res1 == {"face": 0.13, "plate": 0.09}

    # 2. Override only face
    params_face = {"confidenceThresholds": {"face": 0.22}}
    res2 = parse_confidence_thresholds(params=params_face, base_thresholds=base_acc)
    assert res2 == {"face": 0.22, "plate": 0.09}

    # 3. Override only plate
    params_plate = {"confidenceThresholds": {"plate": 0.18}}
    res3 = parse_confidence_thresholds(params=params_plate, base_thresholds=base_acc)
    assert res3 == {"face": 0.13, "plate": 0.18}

    # 4. Override both
    params_both = {"confidenceThresholds": {"face": 0.30, "plate": 0.25}}
    res4 = parse_confidence_thresholds(params=params_both, base_thresholds=base_acc)
    assert res4 == {"face": 0.30, "plate": 0.25}


def test_settings_mode_env_variables_present():
    """Verify Settings object exposes mode_fast and mode_max_privacy."""
    assert hasattr(settings, "mode_fast")
    assert hasattr(settings, "mode_max_privacy")
    assert "yolo26n" in settings.mode_fast
    assert "yolo26s" in settings.mode_max_privacy


def test_missing_weights_raise_instead_of_another_model():
    """A weight file that is not there must fail: running another model would break the mode the user picked."""
    assert resolve_model_path("yolo26s-1280-e5-dashcam.pt").endswith("yolo26s-1280-e5-dashcam.pt")
    with pytest.raises(FileNotFoundError, match="no-such-model.pt"):
        resolve_model_path("no-such-model.pt")
    with pytest.raises(FileNotFoundError):
        ImageRedactProcessor._resolve_model_path(None, "no-such-model.pt")
    with pytest.raises(FileNotFoundError):
        VideoRedactProcessor._resolve_model_path("no-such-model.pt")


def test_video_job_deadline_default_matches_contract():
    """Contract §4: 300 s for images, 10800 s for video, also for a worker set up by env only (docker compose)."""
    code = "from src.config import settings; print(settings.job_deadline_seconds)"
    for consumer, expected in (("video-workers", "10800"), ("image-workers", "300")):
        env = {**os.environ, "NATS_CONSUMER_NAME": consumer}
        env.pop("JOB_DEADLINE_SECONDS", None)
        out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True,
                             cwd=os.path.join(os.path.dirname(__file__), ".."))
        assert out.stdout.strip() == expected
