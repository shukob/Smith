"""Session Manager - Orchestrates all components for a meeting session."""
import asyncio
from typing import Dict, Optional
from dataclasses import dataclass, field
from fastapi import WebSocket

from .gemini_live_client import GeminiLiveClient
from .speculative_engine import SpeculativeEngine
from .divergence_detector import DivergenceAction
from .firestore_writer import FirestoreWriter
from .adk_agent import BackgroundAgent
from .config import settings


@dataclass
class MeetingSession:
    """
    Represents a single meeting session.

    Orchestrates:
    - Gemini Live API (AI voice + function calling)
    - Speculative engine (prediction + divergence detection)
    - Firestore writer (real-time UI updates)
    - Browser WebSocket (audio + control messages)
    """

    # Binary protocol type prefix
    AUDIO_FRAME = b'\x01'

    session_id: str
    websocket: WebSocket
    language: str = "ja"
    gemini_client: Optional[GeminiLiveClient] = None
    speculative_engine: Optional[SpeculativeEngine] = None
    firestore_writer: Optional[FirestoreWriter] = None
    _initialized: bool = field(default=False)
    _user_transcript_buffer: str = field(default="")

    async def initialize(self) -> None:
        """Initialize all session components."""
        if self._initialized:
            return

        self.speculative_engine = SpeculativeEngine()

        # Initialize Firestore writer
        self.firestore_writer = FirestoreWriter(self.session_id)
        await self.firestore_writer.initialize()

        # Initialize Gemini Live client
        self.gemini_client = GeminiLiveClient(
            session_id=self.session_id,
            language=self.language,
            on_audio=self._handle_gemini_audio,
            on_transcript=self._handle_transcript,
            on_input_transcript=self._handle_input_transcript,
            on_function_call=self._handle_function_call,
            on_interrupted=self._handle_interrupted,
            on_turn_started=self._handle_turn_started,
            on_turn_complete=self._handle_turn_complete,
        )
        await self.gemini_client.connect()

        # Initialize Background Agent (genai direct)
        self.adk_agent = BackgroundAgent(
            session_id=self.session_id, live_client=self.gemini_client,
            language=self.language,
            on_pane_update=self._notify_pane_focus,
        )
        await self.adk_agent.initialize()
        self.adk_agent.start()

        self._initialized = True
        print(f"[Session {self.session_id}] Initialized")

    async def handle_browser_audio(self, audio_data: bytes) -> None:
        """Handle PCM16 16kHz audio from browser microphone."""
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_audio(audio_data)

    async def handle_browser_video(self, base64_data: str) -> None:
        """Handle screen share video frame from browser."""
        import base64
        try:
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]
            image_bytes = base64.b64decode(base64_data)
            if self.gemini_client and self.gemini_client.connected:
                await self.gemini_client.send_video_frame(image_bytes)
        except Exception as e:
            print(f"[Session {self.session_id}] Error handling video frame: {e}")

    async def handle_browser_file(self, filename: str, mime_type: str, base64_data: str) -> None:
        """Handle file upload from browser."""
        import base64
        try:
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]
            file_bytes = base64.b64decode(base64_data)
            if self.gemini_client and self.gemini_client.connected:
                await self.gemini_client.send_file_context(file_bytes, mime_type, filename)
        except Exception as e:
            print(f"[Session {self.session_id}] Error handling file upload: {e}")

    async def handle_user_edit_outline(self, node_data: dict) -> None:
        """Handle user direct edit to an outline node from the frontend."""
        await self.firestore_writer.upsert_outline_node(node_data)
        msg = (
            f"[System: The user directly updated outline node "
            f"'{node_data.get('id')}' to: '{node_data.get('text')}']"
        )
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_delete_outline(self, node_id: str) -> None:
        """Handle user deleting an outline node from the frontend."""
        await self.firestore_writer.delete_outline_node(node_id)
        msg = f"[System: The user deleted outline node '{node_id}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_edit_task(self, task_data: dict) -> None:
        """Handle user direct edit to a task from the frontend."""
        await self.firestore_writer.upsert_task(task_data)
        msg = (
            f"[System: The user directly updated task "
            f"'{task_data.get('id')}' to: '{task_data.get('title')}' "
            f"({task_data.get('status')})]"
        )
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_delete_task(self, task_id: str) -> None:
        """Handle user deleting a task from the frontend."""
        await self.firestore_writer.delete_task(task_id)
        msg = f"[System: The user deleted task '{task_id}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_edit_arch(self, element_data: dict) -> None:
        """Handle user direct edit to an architecture element."""
        await self.firestore_writer.upsert_architecture_element(element_data)
        msg = f"[System: The user directly updated architecture element '{element_data.get('id')}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_delete_arch(self, element_id: str) -> None:
        """Handle user deleting an architecture element."""
        await self.firestore_writer.delete_architecture_element(element_id)
        msg = f"[System: The user deleted architecture element '{element_id}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_edit_schedule(self, schedule_data: dict) -> None:
        """Handle user direct edit to a schedule item."""
        await self.firestore_writer.upsert_schedule_item(schedule_data)
        msg = f"[System: The user directly updated schedule item '{schedule_data.get('id')}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_delete_schedule(self, schedule_id: str) -> None:
        """Handle user deleting a schedule item."""
        await self.firestore_writer.delete_schedule_item(schedule_id)
        msg = f"[System: The user deleted schedule item '{schedule_id}']"
        print(f"[Session {self.session_id}] {msg}")
        if self.gemini_client and self.gemini_client.connected:
            await self.gemini_client.send_text_context(msg)
        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("system", msg)

    async def handle_user_set_focus(self, focus_data: dict) -> None:
        """Store the user's current UI focus state for the Agent to read."""
        await self.firestore_writer.set_user_focus(focus_data)

    async def handle_user_edit_title(self, title: str) -> None:
        """Handle user direct edit to the session title."""
        await self.firestore_writer.update_title(title)
        print(f"[Session {self.session_id}] User updated session title to: {title}")

    async def handle_user_toggle_archive(self, is_archived: bool) -> None:
        """Handle user toggling the archive status of the session."""
        status = "archived" if is_archived else "active"
        await self.firestore_writer.set_status(status)
        print(f"[Session {self.session_id}] User set session status to: {status}")

    async def _handle_gemini_audio(self, audio_data: bytes) -> None:
        """Handle audio from Gemini (24kHz PCM) - send directly to browser."""
        try:
            await self.websocket.send_bytes(self.AUDIO_FRAME + audio_data)
        except Exception as e:
            print(f"[Session {self.session_id}] Failed to send audio to browser: {e}")

    async def _handle_transcript(self, role: str, text: str) -> None:
        """Handle transcript updates from Gemini."""
        try:
            await self.websocket.send_json({
                "type": "transcript",
                "role": role,
                "text": text,
            })
        except Exception:
            pass

        self.speculative_engine.update_context(f"{role}: {text}")
        await self.firestore_writer.append_transcript(role, text)

        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript(role, text)

    async def _handle_input_transcript(self, text: str) -> None:
        """Handle user's speech transcription from Gemini.

        This is the actual stream used for speculative divergence detection.
        """
        self._user_transcript_buffer += text

        if self.gemini_client.is_speaking and self.speculative_engine.active:
            result = self.speculative_engine.evaluate(self._user_transcript_buffer)

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

            await self.firestore_writer.log_divergence(
                score=result.score,
                action=result.action.value,
                predicted=result.closest_prediction or "",
                actual=self._user_transcript_buffer,
            )

            # Act on INTERRUPT: force Gemini to yield the floor
            if result.action == DivergenceAction.INTERRUPT:
                print(f"[Session {self.session_id}] Speculative INTERRUPT triggered (score={result.score:.2f})")
                await self.gemini_client.send_interrupt()

        try:
            await self.websocket.send_json({
                "type": "transcript",
                "role": "user",
                "text": text,
            })
        except Exception:
            pass

        self.speculative_engine.update_context(f"user: {text}")

        if hasattr(self, 'adk_agent'):
            self.adk_agent.append_transcript("user", text)

    async def _handle_function_call(
        self, call_id: str, name: str, args: dict
    ) -> dict:
        """Handle function calls from Gemini."""
        print(f"[Session {self.session_id}] Function call: {name}({args})")

        if name == "extract_requirement":
            await self.firestore_writer.upsert_requirement(args)
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
                args.get("title", ""),
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

        elif name == "upsert_outline_node":
            await self.firestore_writer.upsert_outline_node(args)
            await self._notify_pane_focus("outline")
            if hasattr(self, 'adk_agent'):
                self.adk_agent.append_transcript("system", f"[Live AI added outline node: {args.get('text', '')}]")
            return {"status": "ok", "id": args.get("id")}

        elif name == "upsert_architecture_element":
            await self.firestore_writer.upsert_architecture_element(args)
            await self._notify_pane_focus("graffle")
            if hasattr(self, 'adk_agent'):
                self.adk_agent.append_transcript("system", f"[Live AI added architecture element: {args.get('label', args.get('id', ''))}]")
            return {"status": "ok", "id": args.get("id")}

        elif name == "upsert_task":
            await self.firestore_writer.upsert_task(args)
            await self._notify_pane_focus("focus")
            if hasattr(self, 'adk_agent'):
                self.adk_agent.append_transcript("system", f"[Live AI added task: {args.get('title', '')}]")
            return {"status": "ok", "id": args.get("id")}

        elif name == "upsert_schedule_item":
            await self.firestore_writer.upsert_schedule_item(args)
            await self._notify_pane_focus("plan")
            if hasattr(self, 'adk_agent'):
                self.adk_agent.append_transcript("system", f"[Live AI added schedule item: {args.get('name', '')}]")
            return {"status": "ok", "id": args.get("id")}

        return {"status": "unknown_function"}

    async def _notify_pane_focus(self, pane: str) -> None:
        """Notify frontend to maximize a pane when AI edits it."""
        try:
            await self.websocket.send_json({"type": "pane_focus", "pane": pane})
        except Exception:
            pass

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

        await self.speculative_engine.start_predictions(
            ai_utterance="(AI is starting to speak)"
        )

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

        if hasattr(self, 'adk_agent'):
            await self.adk_agent.stop()

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
        self, session_id: str, websocket: WebSocket, language: str = "ja"
    ) -> MeetingSession:
        """Create and initialize a new meeting session."""
        async with self._lock:
            if session_id in self._sessions:
                await self._sessions[session_id].close()

            session = MeetingSession(
                session_id=session_id,
                websocket=websocket,
                language=language,
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
