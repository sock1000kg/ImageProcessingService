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

# Re-direct to the comprehensive test suite in test_image_redact.py
try:
    from test_image_redact import (
        test_redaction_styles,
        test_padding_and_preservation,
        test_pixel_invariance_outside_box,
        test_exif_removal,
        test_invalid_input_file,
        test_output_formats,
        test_contract_result_summary_schema,
    )
except ImportError:
    from tests.test_image_redact import (
        test_redaction_styles,
        test_padding_and_preservation,
        test_pixel_invariance_outside_box,
        test_exif_removal,
        test_invalid_input_file,
        test_output_formats,
        test_contract_result_summary_schema,
    )

if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY KIỂM THỬ ĐỘC LẬP ENGINE PROCESSORS")
    print("==================================================")
    test_redaction_styles()
    test_padding_and_preservation()
    test_pixel_invariance_outside_box()
    test_exif_removal()
    test_invalid_input_file()
    test_output_formats()
    test_contract_result_summary_schema()
    print("==================================================")
    print("🎉 TẤT CẢ PROCESSOR ĐÃ ĐẠT CHUẨN 100%!")
    print("==================================================")
