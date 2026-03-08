"""Session Manager - Orchestrates all components for a meeting session."""
import asyncio
from typing import Dict, Optional
from dataclasses import dataclass, field
from fastapi import WebSocket

from .gemini_live_client import GeminiLiveClient
from .simli_client import SimliAvatarClient
from .speculative_engine import SpeculativeEngine
from .audio_processor import AudioProcessor
from .firestore_writer import FirestoreWriter
from .config import settings


@dataclass
class MeetingSession:
    """
    Represents a single meeting session.

    Orchestrates:
    - Gemini Live API (AI voice + function calling)
    - Simli avatar (lip-sync video) [optional]
    - Speculative engine (prediction + divergence detection)
    - Firestore writer (real-time UI updates)
    - Browser WebSocket (audio + control messages)
    """

    session_id: str
    websocket: WebSocket
    gemini_client: Optional[GeminiLiveClient] = None
    simli_client: Optional[SimliAvatarClient] = None
    speculative_engine: Optional[SpeculativeEngine] = None
    audio_processor: Optional[AudioProcessor] = None
    firestore_writer: Optional[FirestoreWriter] = None
    _initialized: bool = field(default=False)
    _user_transcript_buffer: str = field(default="")

    async def initialize(self) -> None:
        """Initialize all session components."""
        if self._initialized:
            return

        self.audio_processor = AudioProcessor()
        self.speculative_engine = SpeculativeEngine()

        # Initialize Firestore writer
        self.firestore_writer = FirestoreWriter(self.session_id)
        await self.firestore_writer.initialize()

        # Initialize Gemini Live client
        self.gemini_client = GeminiLiveClient(
            session_id=self.session_id,
            on_audio=self._handle_gemini_audio,
            on_transcript=self._handle_transcript,
            on_input_transcript=self._handle_input_transcript,
            on_function_call=self._handle_function_call,
            on_interrupted=self._handle_interrupted,
            on_turn_started=self._handle_turn_started,
            on_turn_complete=self._handle_turn_complete,
        )
        await self.gemini_client.connect()

        # Initialize Simli avatar (optional)
        if settings.enable_simli and settings.simli_api_key and settings.simli_face_id:
            self.simli_client = SimliAvatarClient(
                api_key=settings.simli_api_key,
                face_id=settings.simli_face_id,
            )
            try:
                await self.simli_client.connect()
            except Exception as e:
                print(f"[Session {self.session_id}] Simli connection failed: {e}")
                self.simli_client = None

        self._initialized = True
        print(f"[Session {self.session_id}] Initialized successfully")

    async def handle_browser_audio(self, audio_data: bytes) -> None:
        """Handle PCM16 16kHz audio from browser microphone."""
        if self.gemini_client and self.gemini_client.connected:
            # Gemini expects 16kHz - no conversion needed
            await self.gemini_client.send_audio(audio_data)

    async def _handle_gemini_audio(self, audio_data: bytes) -> None:
        """Handle audio from Gemini (24kHz PCM).

        Fork to:
        1. Simli (downsample 24kHz → 16kHz for lip-sync)
        2. Browser (send 24kHz directly via WebSocket)
        """
        # Send to browser
        try:
            await self.websocket.send_bytes(audio_data)
        except Exception as e:
            print(f"[Session {self.session_id}] Failed to send audio to browser: {e}")

        # Send to Simli (downsampled)
        if self.simli_client and self.simli_client.is_connected:
            pcm_16k = self.audio_processor.downsample_24k_to_16k(audio_data)
            await self.simli_client.send_audio(pcm_16k)

    async def _handle_transcript(self, role: str, text: str) -> None:
        """Handle transcript updates from Gemini."""
        # Send to browser
        try:
            await self.websocket.send_json({
                "type": "transcript",
                "role": role,
                "text": text,
            })
        except Exception:
            pass

        # Update context for speculative engine
        self.speculative_engine.update_context(f"{role}: {text}")

        # Write to Firestore
        await self.firestore_writer.append_transcript(role, text)

    async def _handle_input_transcript(self, text: str) -> None:
        """Handle user's speech transcription from Gemini.

        This is the actual stream used for speculative divergence detection.
        """
        self._user_transcript_buffer += text

        # Evaluate divergence if AI is currently speaking
        if self.gemini_client.is_speaking and self.speculative_engine.active:
            result = self.speculative_engine.evaluate(self._user_transcript_buffer)

            # Send divergence score to browser for UI
            try:
                await self.websocket.send_json({
                    "type": "divergence",
                    "score": result.score,
                    "action": result.action.value,
                    "predicted": result.closest_prediction,
                    "actual": self._user_transcript_buffer,
                })
            except Exception:
                pass

            # Log to Firestore
            await self.firestore_writer.log_divergence(
                score=result.score,
                action=result.action.value,
                predicted=result.closest_prediction or "",
                actual=self._user_transcript_buffer,
            )

        # Also send transcript to browser
        try:
            await self.websocket.send_json({
                "type": "transcript",
                "role": "user",
                "text": text,
            })
        except Exception:
            pass

        # Update context
        self.speculative_engine.update_context(f"user: {text}")

    async def _handle_function_call(
        self, call_id: str, name: str, args: dict
    ) -> dict:
        """Handle function calls from Gemini."""
        print(f"[Session {self.session_id}] Function call: {name}({args})")

        if name == "extract_requirement":
            await self.firestore_writer.upsert_requirement(args)
            # Notify browser
            try:
                await self.websocket.send_json({
                    "type": "requirement",
                    "data": args,
                })
            except Exception:
                pass
            return {"status": "requirement_saved", "id": args.get("id")}

        elif name == "update_summary":
            await self.firestore_writer.update_summary(
                args.get("summary", ""),
                args.get("topics_discussed", []),
            )
            try:
                await self.websocket.send_json({
                    "type": "summary",
                    "data": args,
                })
            except Exception:
                pass
            return {"status": "summary_updated"}

        elif name == "ask_clarification":
            try:
                await self.websocket.send_json({
                    "type": "clarification",
                    "data": args,
                })
            except Exception:
                pass
            return {"status": "clarification_requested"}

        return {"status": "unknown_function"}

    async def _handle_interrupted(self) -> None:
        """Handle interruption detected by Gemini."""
        self.speculative_engine.stop()
        self._user_transcript_buffer = ""

        try:
            await self.websocket.send_json({"type": "interrupted"})
        except Exception:
            pass

        print(f"[Session {self.session_id}] AI interrupted by user")

    async def _handle_turn_started(self) -> None:
        """Handle AI starting to speak."""
        self._user_transcript_buffer = ""

        # Start speculative predictions
        await self.speculative_engine.start_predictions(
            ai_utterance="(AI is starting to speak)"
        )

        # Send predictions to browser for UI
        try:
            await self.websocket.send_json({
                "type": "speculation_started",
                "predictions": self.speculative_engine.predictions,
            })
        except Exception:
            pass

    async def _handle_turn_complete(self) -> None:
        """Handle AI finished speaking."""
        self.speculative_engine.stop()
        self._user_transcript_buffer = ""

        try:
            await self.websocket.send_json({"type": "turn_complete"})
        except Exception:
            pass

    async def toggle_speculative_engine(self, enabled: bool) -> None:
        """Toggle speculative engine on/off (for ablation testing)."""
        settings.enable_speculative_engine = enabled
        try:
            await self.websocket.send_json({
                "type": "speculative_engine_toggled",
                "enabled": enabled,
            })
        except Exception:
            pass

    async def close(self) -> None:
        """Close all session connections."""
        print(f"[Session {self.session_id}] Closing...")

        if self.gemini_client:
            await self.gemini_client.close()

        if self.simli_client:
            await self.simli_client.close()

        if self.firestore_writer:
            await self.firestore_writer.close()

        self._initialized = False
        print(f"[Session {self.session_id}] Closed")


class SessionManager:
    """Manages multiple concurrent meeting sessions."""

    def __init__(self):
        self._sessions: Dict[str, MeetingSession] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self, session_id: str, websocket: WebSocket
    ) -> MeetingSession:
        """Create and initialize a new meeting session."""
        async with self._lock:
            if session_id in self._sessions:
                await self._sessions[session_id].close()

            session = MeetingSession(
                session_id=session_id,
                websocket=websocket,
            )
            self._sessions[session_id] = session
            print(f"[SessionManager] Created session: {session_id}")
            return session

    async def close_session(self, session_id: str) -> None:
        """Close and remove a session."""
        async with self._lock:
            if session_id in self._sessions:
                await self._sessions[session_id].close()
                del self._sessions[session_id]

    async def close_all(self) -> None:
        """Close all active sessions."""
        async with self._lock:
            for session in self._sessions.values():
                await session.close()
            self._sessions.clear()
