"""Abstract Base Processor Interface."""
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any


class BaseProcessor(ABC):
    @abstractmethod
    def process(
        self,
        input_bytes: bytes,
        params: Dict[str, Any],
        output_key: str = "",
    ) -> Tuple[bytes, Dict[str, Any], str]:
        """Process input bytes and return (output_bytes, result_summary, content_type).

        Args:
            input_bytes: The raw bytes downloaded from MinIO.
            params: Optional configuration dictionary from the job message.
            output_key: The output object key (used to determine format like .jpg, .png, .webp).

        Returns:
            output_bytes: The processed file bytes.
            result_summary: Lightweight metadata dict to report back to backend.
            content_type: MIME type of the output file (e.g. 'image/jpeg', 'image/png').
        """
        pass
