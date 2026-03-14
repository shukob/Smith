"""Gemini Multimodal Live API client for real-time audio conversation."""
import asyncio
from typing import Callable, Optional, Awaitable

from google import genai
from google.genai import types

from .config import settings
from .system_prompt import SYSTEM_PROMPT
from .function_tools import LIVE_TOOLS


class GeminiLiveClient:
    """
    Wraps the Gemini Live API for bidirectional audio streaming.

    Handles:
    - WebSocket connection to Gemini Live API
    - Sending PCM16 16kHz audio
    - Receiving PCM 24kHz audio responses
    - Function call routing
    - Input transcription for speculative engine
    - Interruption detection
    - Session resumption
    """

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
        self._session_task: Optional[asyncio.Task] = None
        self._connected = False
        self._resumption_handle: Optional[str] = None
        self.is_speaking = False
        
        # Queues to pass data into the async context manager loop
        self._audio_queue: asyncio.Queue = asyncio.Queue()
        self._text_queue: asyncio.Queue = asyncio.Queue()
        self._video_queue: asyncio.Queue = asyncio.Queue()
        self._content_queue: asyncio.Queue = asyncio.Queue()

    async def connect(self) -> None:
        """Establish connection to Gemini Live API."""
        if self._connected:
            return

        self._connected = True
        self._session_task = asyncio.create_task(self._run_session_loop())
        print(f"[Gemini] Connected for session {self.session_id}")

    async def _run_session_loop(self) -> None:
        """Background task maintaining the async context and routing queues."""
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
            async with self._client.aio.live.connect(
                model=settings.gemini_live_model,
                config=config,
            ) as session:
                
                # Start the receive loop task tied strictly to this session
                receive_task = asyncio.create_task(self._receive_loop(session))
                send_audio_task = asyncio.create_task(self._send_audio_loop(session))
                send_text_task = asyncio.create_task(self._send_text_loop(session))
                send_video_task = asyncio.create_task(self._send_video_loop(session))
                send_content_task = asyncio.create_task(self._send_content_loop(session))
                
                # Wait until connected goes false (meaning `close()` was called or error)
                while self._connected:
                    await asyncio.sleep(0.1)
                
                # Clean teardown
                receive_task.cancel()
                send_audio_task.cancel()
                send_text_task.cancel()
                send_video_task.cancel()
                send_content_task.cancel()

        except Exception as e:
            print(f"[Gemini] Session loop died: {e}")
            self._connected = False

    async def _send_audio_loop(self, session) -> None:
        """Consume audio from queue and dispatch to API."""
        try:
            while self._connected:
                pcm_data = await self._audio_queue.get()
                await session.send_realtime_input(
                    audio=types.Blob(data=pcm_data, mime_type="audio/pcm")
                )
                self._audio_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Send audio loop error: {e}")

    async def _send_text_loop(self, session) -> None:
        """Consume context text from queue and dispatch to API."""
        try:
            while self._connected:
                text = await self._text_queue.get()
                await session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part(text=text)],
                    ),
                    turn_complete=False,
                )
                self._text_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Send text loop error: {e}")

    async def _send_video_loop(self, session) -> None:
        """Consume video frames from queue and dispatch to API."""
        try:
            while self._connected:
                image_bytes = await self._video_queue.get()
                await session.send_realtime_input(
                    video=types.Blob(data=image_bytes, mime_type="image/jpeg")
                )
                self._video_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Send video loop error: {e}")

    async def _send_content_loop(self, session) -> None:
        """Consume file uploads from queue and dispatch to API as context."""
        try:
            while self._connected:
                file_msg = await self._content_queue.get()
                await session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part.from_bytes(
                            data=file_msg["data"],
                            mime_type=file_msg["mime_type"],
                        )],
                    ),
                    turn_complete=True,
                )
                self._content_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Send content loop error: {e}")

    async def _receive_loop(self, session) -> None:
        """Process incoming messages from Gemini Live API."""
        try:
            while self._connected:
                async for response in session.receive():
                    await self._handle_response(session, response)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Gemini] Receive loop error: {e}")
            self._connected = False

    async def _handle_response(self, session, response) -> None:
        """Route a single response message."""
        # Server content (audio, text, interruption)
        if response.server_content:
            sc = response.server_content

            # Model audio/text output
            if sc.model_turn:
                if not self.is_speaking:
                    self.is_speaking = True
                    if self.on_turn_started:
                        await self.on_turn_started()

                for part in sc.model_turn.parts:
                    # Audio data (24kHz PCM)
                    if part.inline_data and isinstance(part.inline_data.data, bytes):
                        if self.on_audio:
                            await self.on_audio(part.inline_data.data)

            # Interruption detected by Gemini
            if sc.interrupted:
                self.is_speaking = False
                if self.on_interrupted:
                    await self.on_interrupted()

            # Turn complete
            if sc.generation_complete:
                self.is_speaking = False
                if self.on_turn_complete:
                    await self.on_turn_complete()

            # Input transcription (user's speech text)
            if sc.input_transcription and sc.input_transcription.text:
                if self.on_input_transcript:
                    await self.on_input_transcript(sc.input_transcription.text)

            # Output transcription (AI's speech text)
            if sc.output_transcription and sc.output_transcription.text:
                if self.on_transcript:
                    await self.on_transcript("assistant", sc.output_transcription.text)

        # Function calls
        if response.tool_call:
            for fc in response.tool_call.function_calls:
                if self.on_function_call:
                    result = await self.on_function_call(fc.id, fc.name, fc.args or {})
                    # Send function response back
                    func_response = types.FunctionResponse(
                        id=fc.id,
                        name=fc.name,
                        response=result or {"status": "ok"},
                    )
                    await session.send_tool_response(
                        function_responses=[func_response]
                    )

        # Session resumption update
        if response.session_resumption_update:
            if response.session_resumption_update.resumable:
                self._resumption_handle = response.session_resumption_update.new_handle
                print(f"[Gemini] Session resumption handle updated")

        # Go away signal
        if response.go_away:
            print(f"[Gemini] GoAway received, time left: {response.go_away.time_left}")

    async def send_audio(self, pcm_data: bytes) -> None:
        """Send PCM16 16kHz mono audio to Gemini."""
        if self._connected:
            await self._audio_queue.put(pcm_data)

    async def send_video_frame(self, image_data: bytes) -> None:
        """Send a JPEG/PNG image frame to Gemini."""
        if self._connected:
            await self._video_queue.put(image_data)

    async def send_file_context(self, file_data: bytes, mime_type: str, filename: str) -> None:
        """Upload an entire file to Gemini as context."""
        if self._connected:
            await self._content_queue.put({
                "data": file_data,
                "mime_type": mime_type,
                "filename": filename
            })

    async def send_text_context(self, text: str) -> None:
        """Inject text context into the session (e.g., speaker metadata)."""
        if self._connected:
            await self._text_queue.put(text)

    async def close(self) -> None:
        """Close the Gemini Live connection."""
        self._connected = False
        
        if self._session_task:
            self._session_task.cancel()
            try:
                await self._session_task
            except asyncio.CancelledError:
                pass
            self._session_task = None

        print(f"[Gemini] Connection closed for session {self.session_id}")

    @property
    def connected(self) -> bool:
        return self._connected
