"""Simli Avatar Client using official simli-ai SDK (WebRTC)

Uses a bounded async queue to decouple Simli audio sending from the main
audio pipeline, preventing WebRTC backpressure from blocking the event loop.
"""
import asyncio
import io
from typing import Callable, Optional, Awaitable

import av
import numpy as np

# Timeout for Simli operations (seconds)
SEND_TIMEOUT = 1.0
ITERATOR_TIMEOUT = 5.0
# Max queued audio chunks before dropping oldest
AUDIO_QUEUE_MAX = 20


class SimliAvatarClient:
    """
    Client for Simli avatar API using official SDK.

    Handles:
    - WebRTC connection to Simli via simli-ai SDK
    - Sending PCM16 16kHz audio for lip-sync (via bounded queue)
    - Receiving video (JPEG) and audio (PCM16) frames (with timeout)
    """

    def __init__(
        self,
        api_key: str,
        face_id: str,
        on_video_frame: Optional[Callable[[bytes], Awaitable[None]]] = None,
        on_audio_frame: Optional[Callable[[bytes], Awaitable[None]]] = None,
    ):
        self.api_key = api_key
        self.face_id = face_id
        self.on_video_frame = on_video_frame
        self.on_audio_frame = on_audio_frame

        self._client: object = None  # SimliClient (lazy import)
        self._connected = False
        self._video_task: Optional[asyncio.Task] = None
        self._audio_task: Optional[asyncio.Task] = None
        self._send_task: Optional[asyncio.Task] = None
        self._audio_queue: asyncio.Queue = asyncio.Queue(maxsize=AUDIO_QUEUE_MAX)

    async def connect(self) -> None:
        """Initialize connection to Simli via WebRTC"""
        from simli import SimliClient, SimliConfig

        self._client = SimliClient(
            api_key=self.api_key,
            config=SimliConfig(
                faceId=self.face_id,
                handleSilence=True,
                maxSessionLength=3600,
                maxIdleTime=600,
            ),
        )
        await self._client.start()
        self._connected = True
        print(f"[Simli] Connected with face_id: {self.face_id}")

        # Start frame processing tasks
        if self.on_video_frame:
            self._video_task = asyncio.create_task(
                self._process_video_frames()
            )
        if self.on_audio_frame:
            self._audio_task = asyncio.create_task(
                self._process_audio_frames()
            )
        # Start dedicated send consumer
        self._send_task = asyncio.create_task(self._send_consumer())

    async def _process_video_frames(self) -> None:
        """Process incoming video frames from Simli -> JPEG (with timeout)"""
        frame_count = 0
        consecutive_timeouts = 0
        try:
            iterator = self._client.getVideoStreamIterator("rgb24")
            while self._connected:
                try:
                    frame = await asyncio.wait_for(
                        iterator.__anext__(), timeout=ITERATOR_TIMEOUT
                    )
                    consecutive_timeouts = 0
                    frame_count += 1
                    jpeg = self._frame_to_jpeg(frame)
                    if jpeg and self.on_video_frame:
                        await self.on_video_frame(jpeg)
                    if frame_count == 1:
                        print("[Simli] First video frame received")
                except asyncio.TimeoutError:
                    consecutive_timeouts += 1
                    if consecutive_timeouts >= 3:
                        print("[Simli] Video iterator timed out 3x, stopping")
                        break
                except StopAsyncIteration:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Simli] Video stream error: {e}")
        finally:
            print(f"[Simli] Video stream ended ({frame_count} frames)")

    async def _process_audio_frames(self) -> None:
        """Process incoming audio frames from Simli -> PCM16 16kHz (with timeout)"""
        frame_count = 0
        consecutive_timeouts = 0
        try:
            iterator = self._client.getAudioStreamIterator(16000)
            while self._connected:
                try:
                    frame = await asyncio.wait_for(
                        iterator.__anext__(), timeout=ITERATOR_TIMEOUT
                    )
                    consecutive_timeouts = 0
                    frame_count += 1
                    pcm = self._audio_frame_to_pcm16(frame)
                    if pcm and self.on_audio_frame:
                        await self.on_audio_frame(pcm)
                    if frame_count == 1:
                        print("[Simli] First audio frame received")
                except asyncio.TimeoutError:
                    consecutive_timeouts += 1
                    if consecutive_timeouts >= 3:
                        print("[Simli] Audio iterator timed out 3x, stopping")
                        break
                except StopAsyncIteration:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Simli] Audio stream error: {e}")
        finally:
            print(f"[Simli] Audio stream ended ({frame_count} frames)")

    _jpeg_err_count: int = 0

    def _frame_to_jpeg(self, frame: object) -> Optional[bytes]:
        """Convert PyAV VideoFrame to JPEG bytes"""
        try:
            from PIL import Image

            img: Image.Image = frame.to_image()
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=70)
            return buf.getvalue()
        except Exception as e:
            self._jpeg_err_count += 1
            if self._jpeg_err_count <= 3:
                print(f"[Simli] JPEG conversion error: {e}")
            return None

    _pcm_err_count: int = 0

    def _audio_frame_to_pcm16(self, frame: object) -> Optional[bytes]:
        """Convert PyAV AudioFrame to PCM16 mono bytes"""
        try:
            resampler = av.AudioResampler(
                format="s16", layout="mono"
            )
            resampled_frames = resampler.resample(frame)
            parts = []
            for rf in resampled_frames:
                arr = rf.to_ndarray()
                if arr.ndim == 2:
                    arr = arr[0]
                parts.append(arr.astype(np.int16).tobytes())
            return b"".join(parts) if parts else None
        except Exception as e:
            self._pcm_err_count += 1
            if self._pcm_err_count <= 3:
                print(f"[Simli] PCM conversion error: {e}")
            return None

    async def send_audio(self, pcm_data: bytes) -> None:
        """Enqueue PCM16 16kHz audio for Simli lip sync (non-blocking).

        If the queue is full, drops the oldest chunk to maintain real-time pace.
        This method NEVER blocks the caller's event loop.
        """
        if not self._connected:
            return
        if self._audio_queue.full():
            try:
                self._audio_queue.get_nowait()  # drop oldest
            except asyncio.QueueEmpty:
                pass
        try:
            self._audio_queue.put_nowait(pcm_data)
        except asyncio.QueueFull:
            pass  # safety net

    async def _send_consumer(self) -> None:
        """Dedicated task that drains the audio queue and sends to Simli with timeout."""
        dropped = 0
        sent = 0
        try:
            while self._connected:
                try:
                    pcm_data = await asyncio.wait_for(
                        self._audio_queue.get(), timeout=2.0
                    )
                except asyncio.TimeoutError:
                    continue  # no data, just loop

                try:
                    await asyncio.wait_for(
                        self._client.send(pcm_data), timeout=SEND_TIMEOUT
                    )
                    sent += 1
                except asyncio.TimeoutError:
                    dropped += 1
                    if dropped <= 5 or dropped % 50 == 0:
                        print(f"[Simli] send() timed out ({dropped} total drops, {sent} sent)")
                except Exception as e:
                    dropped += 1
                    if dropped <= 3:
                        print(f"[Simli] send() error: {e}")
        except asyncio.CancelledError:
            pass
        finally:
            print(f"[Simli] Send consumer ended (sent={sent}, dropped={dropped})")

    async def close(self) -> None:
        """Close the Simli connection"""
        self._connected = False

        for task in (self._video_task, self._audio_task, self._send_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        if self._client:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None

        print("[Simli] Connection closed")

    @property
    def is_connected(self) -> bool:
        return self._connected
