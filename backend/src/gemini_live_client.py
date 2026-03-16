"""Gemini Multimodal Live API client - simplified direct session."""
import asyncio
import traceback
from typing import Callable, Optional, Awaitable

from google import genai
from google.genai import types

from .config import settings
from .system_prompt import SYSTEM_PROMPT
from .function_tools import LIVE_TOOLS


class GeminiLiveClient:
    """Simplified Gemini Live client. No queues - direct session calls."""

    def __init__(
        self,
        session_id: str,
        on_audio: Optional[Callable[[bytes], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, str], Awaitable[None]]] = None,
        on_input_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_function_call: Optional[Callable[[str, str, dict], Awaitable[dict]]] = None,
        on_interrupted: Optional[Callable[[], Awaitable[None]]] = None,
        on_turn_started: Optional[Callable[[], Awaitable[None]]] = None,
        on_turn_complete: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self.on_audio = on_audio
        self.on_transcript = on_transcript
        self.on_input_transcript = on_input_transcript
        self.on_function_call = on_function_call
        self.on_interrupted = on_interrupted
        self.on_turn_started = on_turn_started
        self.on_turn_complete = on_turn_complete

        self._client = genai.Client(api_key=settings.google_api_key)
        self._session = None
        self._cm = None  # context manager
        self._receive_task: Optional[asyncio.Task] = None
        self._connected = False
        self._resumption_handle: Optional[str] = None
        self.is_speaking = False

    async def connect(self) -> None:
        """Open Live session and start receive loop."""
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=SYSTEM_PROMPT)]
            ),
            tools=LIVE_TOOLS,
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            context_window_compression=types.ContextWindowCompressionConfig(
                sliding_window=types.SlidingWindow()
            ),
            session_resumption=types.SessionResumptionConfig(
                handle=self._resumption_handle
            ) if self._resumption_handle else types.SessionResumptionConfig(),
        )

        try:
            print(f"[Gemini] Connecting (model={settings.gemini_live_model})...")
            self._cm = self._client.aio.live.connect(
                model=settings.gemini_live_model,
                config=config,
            )
            self._session = await self._cm.__aenter__()
            self._connected = True
            print(f"[Gemini] Live session opened!")
            self._receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            print(f"[Gemini] Failed to connect: {e}")
            traceback.print_exc()
            self._connected = False

    async def _receive_loop(self) -> None:
        """Read responses from Gemini."""
        recv_count = 0
        try:
            print("[Gemini] Receive loop started")
            while self._connected and self._session:
                async for response in self._session.receive():
                    recv_count += 1
                    if recv_count <= 5 or recv_count % 50 == 0:
                        print(f"[Gemini] Recv #{recv_count}")
                    await self._handle_response(response)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Receive loop error: {e}")
            self._connected = False
        finally:
            print(f"[Gemini] Receive loop ended ({recv_count} msgs)")

    async def _handle_response(self, response) -> None:
        """Route a single response."""
        if response.server_content:
            sc = response.server_content

            if sc.model_turn:
                if not self.is_speaking:
                    self.is_speaking = True
                    if self.on_turn_started:
                        await self.on_turn_started()
                for part in sc.model_turn.parts:
                    if part.inline_data and isinstance(part.inline_data.data, bytes):
                        if self.on_audio:
                            await self.on_audio(part.inline_data.data)

            if sc.interrupted:
                self.is_speaking = False
                if self.on_interrupted:
                    await self.on_interrupted()

            if sc.generation_complete:
                self.is_speaking = False
                if self.on_turn_complete:
                    await self.on_turn_complete()

            if sc.input_transcription and sc.input_transcription.text:
                if self.on_input_transcript:
                    await self.on_input_transcript(sc.input_transcription.text)

            if sc.output_transcription and sc.output_transcription.text:
                if self.on_transcript:
                    await self.on_transcript("assistant", sc.output_transcription.text)

        if response.tool_call:
            for fc in response.tool_call.function_calls:
                if self.on_function_call:
                    result = await self.on_function_call(fc.id, fc.name, fc.args or {})
                    func_response = types.FunctionResponse(
                        id=fc.id,
                        name=fc.name,
                        response=result or {"status": "ok"},
                    )
                    await self._session.send_tool_response(
                        function_responses=[func_response]
                    )

        if response.session_resumption_update:
            if response.session_resumption_update.resumable:
                self._resumption_handle = response.session_resumption_update.new_handle
                print("[Gemini] Session resumption handle updated")

        if response.go_away:
            print(f"[Gemini] GoAway received, time_left={response.go_away.time_left}s")

    # --- Direct send methods (no queues) ---

    async def send_audio(self, pcm_data: bytes) -> None:
        """Send PCM16 16kHz audio to Gemini."""
        if self._session and self._connected:
            await self._session.send_realtime_input(
                audio=types.Blob(data=pcm_data, mime_type="audio/pcm")
            )

    async def send_video_frame(self, image_data: bytes) -> None:
        """Send a JPEG image frame to Gemini."""
        if self._session and self._connected:
            await self._session.send_realtime_input(
                video=types.Blob(data=image_data, mime_type="image/jpeg")
            )

    async def send_text_context(self, text: str) -> None:
        """Inject text context into the session."""
        if self._session and self._connected:
            await self._session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text=text)],
                ),
                turn_complete=False,
            )

    async def send_file_context(self, file_data: bytes, mime_type: str, filename: str) -> None:
        """Upload a file to Gemini as context."""
        if self._session and self._connected:
            await self._session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part.from_bytes(data=file_data, mime_type=mime_type)],
                ),
                turn_complete=True,
            )

    async def send_interrupt(self) -> None:
        """Force Gemini to yield the floor."""
        if self._session and self._connected and self.is_speaking:
            print("[Gemini] Sending interrupt")
            await self._session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text="[User interrupting]")],
                ),
                turn_complete=True,
            )

    async def close(self) -> None:
        """Close the session."""
        self._connected = False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        if self._cm:
            try:
                await self._cm.__aexit__(None, None, None)
            except Exception:
                pass
            self._cm = None
            self._session = None
        print(f"[Gemini] Closed for session {self.session_id}")

    @property
    def connected(self) -> bool:
        return self._connected
