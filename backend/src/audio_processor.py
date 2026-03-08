"""Audio processing utilities - PCM downsampling and buffering"""
import numpy as np
from typing import Optional


class AudioProcessor:
    """Handles audio format conversion and buffering for voice relay"""

    def __init__(self):
        self._buffer: bytes = b""

    @staticmethod
    def downsample_24k_to_16k(pcm_24k: bytes) -> bytes:
        """
        Downsample PCM16 audio from 24kHz to 16kHz using linear interpolation.

        Input: bytes of PCM16 LE samples at 24kHz
        Output: bytes of PCM16 LE samples at 16kHz

        Ratio: 24000/16000 = 1.5
        """
        if len(pcm_24k) == 0:
            return bytes()

        # Convert bytes to numpy array of int16
        samples_24k = np.frombuffer(pcm_24k, dtype=np.int16)
        num_samples_24k = len(samples_24k)

        if num_samples_24k == 0:
            return bytes()

        ratio = 24000 / 16000  # 1.5
        num_samples_16k = int(num_samples_24k / ratio)

        if num_samples_16k == 0:
            return bytes()

        # Create output indices for interpolation
        output_indices = np.arange(num_samples_16k) * ratio
        floor_indices = output_indices.astype(int)
        fractions = output_indices - floor_indices

        # Handle boundary conditions
        floor_indices = np.clip(floor_indices, 0, num_samples_24k - 1)
        ceil_indices = np.clip(floor_indices + 1, 0, num_samples_24k - 1)

        # Linear interpolation
        samples_16k = (
            samples_24k[floor_indices] * (1 - fractions) +
            samples_24k[ceil_indices] * fractions
        ).astype(np.int16)

        return samples_16k.tobytes()

    @staticmethod
    def upsample_16k_to_24k(pcm_16k: bytes) -> bytes:
        """
        Upsample PCM16 from 16kHz to 24kHz (for sending browser audio to OpenAI)

        Input: bytes of PCM16 LE samples at 16kHz
        Output: bytes of PCM16 LE samples at 24kHz
        """
        if len(pcm_16k) == 0:
            return bytes()

        samples_16k = np.frombuffer(pcm_16k, dtype=np.int16)
        num_samples_16k = len(samples_16k)

        if num_samples_16k == 0:
            return bytes()

        ratio = 16000 / 24000  # 0.667
        num_samples_24k = int(num_samples_16k / ratio)

        if num_samples_24k == 0:
            return bytes()

        output_indices = np.arange(num_samples_24k) * ratio
        floor_indices = output_indices.astype(int)
        fractions = output_indices - floor_indices

        floor_indices = np.clip(floor_indices, 0, num_samples_16k - 1)
        ceil_indices = np.clip(floor_indices + 1, 0, num_samples_16k - 1)

        samples_24k = (
            samples_16k[floor_indices] * (1 - fractions) +
            samples_16k[ceil_indices] * fractions
        ).astype(np.int16)

        return samples_24k.tobytes()

    def buffer_audio(self, audio_data: bytes, min_chunk_size: int = 1024) -> Optional[bytes]:
        """
        Buffer audio data and return when minimum chunk size is reached.

        This helps reduce the number of small audio packets sent over the network.
        """
        self._buffer += audio_data

        if len(self._buffer) >= min_chunk_size:
            result = self._buffer
            self._buffer = b""
            return result

        return None

    def flush_buffer(self) -> bytes:
        """Return any remaining buffered audio data"""
        result = self._buffer
        self._buffer = b""
        return result
