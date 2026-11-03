"""Unit test kiểm tra các processor của Engine (Không cần bật Docker hay NATS/MinIO)."""
import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add engine directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Re-direct to the comprehensive test suite in test_image_redact.py and test_whitelist.py
try:
    from test_image_redact import (
        test_redaction_styles,
        test_padding_and_preservation,
        test_pixel_invariance_outside_box,
        test_exif_removal,
        test_invalid_input_file,
        test_output_formats,
        test_output_quality_presets,
        test_alpha_compositing_to_jpeg,
        test_contract_result_summary_schema,
    )
    from test_whitelist import (
        test_face_embedder_basics,
        test_whitelist_cache_and_mock_storage,
        test_whitelist_reference_errors,
        test_vlogger_mode_two_persons,
    )
except ImportError:
    from tests.test_image_redact import (
        test_redaction_styles,
        test_padding_and_preservation,
        test_pixel_invariance_outside_box,
        test_exif_removal,
        test_invalid_input_file,
        test_output_formats,
        test_output_quality_presets,
        test_alpha_compositing_to_jpeg,
        test_contract_result_summary_schema,
    )
    from tests.test_whitelist import (
        test_face_embedder_basics,
        test_whitelist_cache_and_mock_storage,
        test_whitelist_reference_errors,
        test_vlogger_mode_two_persons,
    )

if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY KIỂM THỬ ĐỘC LẬP ENGINE PROCESSORS")
    print("==================================================")
    # Milestone 1: Redaction tests
    test_redaction_styles()
    test_padding_and_preservation()
    test_pixel_invariance_outside_box()
    test_exif_removal()
    test_invalid_input_file()
    test_output_formats()
    test_output_quality_presets()
    test_alpha_compositing_to_jpeg()
    test_contract_result_summary_schema()

    # Milestone 2: Whitelisting tests
    print("==================================================")
    print("🚀 TIẾP TỤC KIỂM THỬ MILESTONE 2: FACE WHITELISTING")
    print("==================================================")
    test_face_embedder_basics()
    test_whitelist_cache_and_mock_storage()
    test_whitelist_reference_errors()
    test_vlogger_mode_two_persons()

    print("==================================================")
    print("🎉 TẤT CẢ PROCESSORS (M1 + M2) ĐÃ ĐẠT CHUẨN 100%!")
    print("==================================================")
