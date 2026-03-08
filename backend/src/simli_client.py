"""Simli Avatar Client for lip-sync and video generation"""
import asyncio
from typing import Callable, Optional, Awaitable
import aiohttp
import json


class SimliAvatarClient:
    """
    Client for Simli avatar API.

    Handles:
    - WebSocket connection to Simli
    - Sending PCM audio for lip-sync
    - Receiving video/audio frames
    """

    SIMLI_WS_URL = "wss://api.simli.ai/StartWebRTCSession"

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

        self._ws = None
        self._session = None
        self._connected = False
        self._running = False

    async def connect(self) -> None:
        """Initialize connection to Simli"""
        self._session = aiohttp.ClientSession()

        # Connect to Simli WebSocket
        self._ws = await self._session.ws_connect(
            self.SIMLI_WS_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
            },
        )

        # Send initialization message
        init_message = {
            "type": "init",
            "faceId": self.face_id,
            "handleSilence": True,
            "syncAudio": True,
            "maxSessionLength": 3600,
            "maxIdleTime": 600,
        }
        await self._ws.send_json(init_message)

        # Wait for connection confirmation
        response = await self._ws.receive_json()
        if response.get("type") == "connected":
            self._connected = True
            self._running = True
            print(f"[Simli] Connected with face_id: {self.face_id}")

            # Start frame processing task
            asyncio.create_task(self._process_incoming_frames())
        else:
            raise Exception(f"Simli connection failed: {response}")

    async def _process_incoming_frames(self) -> None:
        """Process incoming video/audio frames from Simli"""
        while self._running and self._ws:
            try:
                msg = await asyncio.wait_for(
                    self._ws.receive(),
                    timeout=1.0
                )

                if msg.type == aiohttp.WSMsgType.BINARY:
                    # Binary data - could be video or audio frame
                    data = msg.data
                    # First byte indicates frame type: 0=video, 1=audio
                    if len(data) > 1:
                        frame_type = data[0]
                        frame_data = data[1:]

                        if frame_type == 0 and self.on_video_frame:
                            await self.on_video_frame(frame_data)
                        elif frame_type == 1 and self.on_audio_frame:
                            await self.on_audio_frame(frame_data)

                elif msg.type == aiohttp.WSMsgType.TEXT:
                    # JSON message
                    try:
                        event = json.loads(msg.data)
                        event_type = event.get("type", "")

                        if event_type == "error":
                            print(f"[Simli] Error: {event.get('message', 'Unknown error')}")
                        elif event_type == "disconnected":
                            print("[Simli] Disconnected by server")
                            self._connected = False
                            break

                    except json.JSONDecodeError:
                        pass

                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.ERROR):
                    print("[Simli] WebSocket closed or error")
                    self._connected = False
                    break

            except asyncio.TimeoutError:
                # No message received, continue
                continue
            except Exception as e:
                print(f"[Simli] Error processing frames: {e}")
                break

        self._running = False

    async def send_audio(self, pcm_data: bytes) -> None:
        """
        Send PCM16 16kHz audio to Simli for lip sync.

        Args:
            pcm_data: PCM16 little-endian audio data at 16kHz
        """
        if self._ws and self._connected:
            try:
                # Send audio with type prefix (1 = audio)
                message = bytes([1]) + pcm_data
                await self._ws.send_bytes(message)
            except Exception as e:
                print(f"[Simli] Failed to send audio: {e}")

    async def close(self) -> None:
        """Close the Simli connection"""
        self._running = False
        self._connected = False

        if self._ws:
            await self._ws.close()
            self._ws = None

        if self._session:
            await self._session.close()
            self._session = None

        print("[Simli] Connection closed")

    @property
    def is_connected(self) -> bool:
        return self._connected
