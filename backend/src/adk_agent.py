"""Background Agent using Google GenAI directly (no ADK).

Periodically analyzes conversation context via Gemini Flash with function calling,
dispatches tool calls to update Firestore dashboard state.
"""
import asyncio
import json
from typing import List, Optional

from google import genai
from google.genai import types

from .config import settings
from .firestore_writer import FirestoreWriter

# Tool declarations for Gemini function calling
TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="update_summary",
        description="Update the global meeting summary after significant context changes.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "summary": types.Schema(type="STRING", description="Markdown summary of the meeting."),
                "topics_discussed": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Topics discussed."),
                "title": types.Schema(type="STRING", description="Concise 3-4 word title for the meeting."),
            },
            required=["summary", "topics_discussed"],
        ),
    ),
    types.FunctionDeclaration(
        name="upsert_outline_node",
        description="Add or update a node in the hierarchical requirements/planning outline.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "id": types.Schema(type="STRING", description="Unique ID for this node."),
                "parent_id": types.Schema(type="STRING", description="Parent node ID, or empty if root."),
                "text": types.Schema(type="STRING", description="Text content of the node."),
                "type": types.Schema(type="STRING", description="requirement, goal, assumption, or note"),
                "order": types.Schema(type="INTEGER", description="Ordering priority among siblings."),
            },
            required=["id", "text", "type", "order"],
        ),
    ),
    types.FunctionDeclaration(
        name="upsert_architecture_element",
        description="Add a node or edge to the system architecture diagram.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "id": types.Schema(type="STRING", description="Unique ID."),
                "type": types.Schema(type="STRING", description="'node' or 'edge'."),
                "label": types.Schema(type="STRING", description="Label (for nodes)."),
                "source": types.Schema(type="STRING", description="Source node ID (for edges)."),
                "target": types.Schema(type="STRING", description="Target node ID (for edges)."),
            },
            required=["id", "type"],
        ),
    ),
    types.FunctionDeclaration(
        name="upsert_task",
        description="Add or update a task on the Kanban board.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "id": types.Schema(type="STRING", description="Unique task ID."),
                "title": types.Schema(type="STRING", description="Task title."),
                "status": types.Schema(type="STRING", description="todo, in_progress, or done."),
                "priority": types.Schema(type="STRING", description="high, medium, or low."),
                "assignee": types.Schema(type="STRING", description="Assignee name or email."),
            },
            required=["id", "title", "status", "priority"],
        ),
    ),
    types.FunctionDeclaration(
        name="upsert_schedule_item",
        description="Add or update a timeline item on the schedule Gantt chart.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "id": types.Schema(type="STRING", description="Unique ID."),
                "name": types.Schema(type="STRING", description="Item name."),
                "start_date": types.Schema(type="STRING", description="ISO date YYYY-MM-DD."),
                "end_date": types.Schema(type="STRING", description="ISO date YYYY-MM-DD."),
                "progress": types.Schema(type="INTEGER", description="0-100 percent."),
                "dependencies": types.Schema(type="ARRAY", items=types.Schema(type="STRING"), description="Dependency IDs."),
            },
            required=["id", "name", "start_date", "end_date", "progress"],
        ),
    ),
    types.FunctionDeclaration(
        name="inject_thought",
        description="Inject a thought, risk, or question for the Live AI to voice.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "message": types.Schema(type="STRING", description="Message to send to Live AI."),
            },
            required=["message"],
        ),
    ),
]

SYSTEM_INSTRUCTION_TEMPLATE = (
    "You are the background strategic brain behind a technical consulting AI. "
    "You will receive batches of transcript from an ongoing meeting. "
    "{language_instruction}\n"
    "Your job is to:\n"
    "1. Keep the meeting summary updated using 'update_summary' if topics change. Always generate a concise 3-4 word title.\n"
    "2. Maintain an Outline of Requirements, Goals, and Assumptions using 'upsert_outline_node'.\n"
    "3. Build an Architecture Diagram when system components are discussed using 'upsert_architecture_element'.\n"
    "4. Track action items on a Kanban board using 'upsert_task'.\n"
    "5. Plot timelines and schedules on a Gantt chart using 'upsert_schedule_item'.\n"
    "6. If you spot a critical technical contradiction or risk, use 'inject_thought'.\n"
    "You do NOT speak to the user directly. You ONLY call tools to manage state. "
    "Always call at least one tool per evaluation."
)

LANGUAGE_INSTRUCTIONS = {
    "ja": "All tool content (labels, titles, text, summaries) MUST be written in Japanese (日本語).",
    "en": "All tool content (labels, titles, text, summaries) MUST be written in English.",
}


class BackgroundAgent:
    """Background agent using genai directly with function calling."""

    TOOL_PANE_MAP = {
        "upsert_outline_node": "outline",
        "upsert_architecture_element": "graffle",
        "upsert_task": "focus",
        "upsert_schedule_item": "plan",
    }

    def __init__(self, session_id: str, live_client, language: str = "ja", on_pane_update=None):
        self.session_id = session_id
        self.live_client = live_client
        self.language = language
        self.on_pane_update = on_pane_update  # async callback(pane: str)
        self.firestore_writer = FirestoreWriter(session_id)
        self._client = genai.Client(api_key=settings.google_api_key)
        self._active = False
        self._transcript_buffer: List[str] = []
        self._bg_task: Optional[asyncio.Task] = None
        self._history: list = []  # conversation history for multi-turn
        self._trigger = asyncio.Event()
        self._last_transcript_time: float = 0

    async def initialize(self):
        """Initialize Firestore and seed past context."""
        await self.firestore_writer.initialize()

        if self.firestore_writer._doc_ref:
            doc = await self.firestore_writer._doc_ref.get()
            if doc.exists:
                data = doc.to_dict() or {}
                transcript = data.get("transcript", [])
                summary_text = data.get("summary", {}).get("text", "")
                if transcript:
                    primer = "[Resuming previous session.]\n"
                    if summary_text:
                        primer += f"Summary: {summary_text}\n"
                    recent = transcript[-20:]
                    primer += "\n".join(f"{t.get('role')}: {t.get('text')}" for t in recent)
                    self._history.append(types.Content(
                        role="user", parts=[types.Part(text=primer)]
                    ))
                    self._history.append(types.Content(
                        role="model", parts=[types.Part(text="Acknowledged. Ready to process new transcript.")]
                    ))

        self._active = True

    def append_transcript(self, role: str, text: str):
        if self._active:
            self._transcript_buffer.append(f"{role}: {text}")
            self._last_transcript_time = asyncio.get_event_loop().time()
            self._trigger.set()

    async def run_evaluation_loop(self):
        """Event-driven evaluation with debounce."""
        while self._active:
            await self._trigger.wait()
            self._trigger.clear()
            await asyncio.sleep(settings.background_agent_debounce_sec)
            if not self._transcript_buffer:
                continue

            context = "\n".join(self._transcript_buffer)
            self._transcript_buffer.clear()

            try:
                print(f"[Agent] Evaluating {len(context)} chars...")

                # Get current dashboard state
                current_state_str = "{}"
                if self.firestore_writer._doc_ref:
                    doc = await self.firestore_writer._doc_ref.get()
                    if doc.exists:
                        data = doc.to_dict() or {}
                        state = {
                            "user_focus": data.get("user_focus"),
                            "outline_nodes": data.get("outline_nodes", []),
                            "architecture_elements": data.get("architecture_elements", []),
                            "tasks": data.get("tasks", []),
                            "schedule_items": data.get("schedule_items", []),
                        }
                        current_state_str = json.dumps(state, ensure_ascii=False)

                prompt = (
                    f"New transcript:\n{context}\n\n"
                    f"Current dashboard state:\n```json\n{current_state_str}\n```\n\n"
                    "Update the dashboard using tools. Do NOT duplicate existing items. "
                    "Pay attention to 'user_focus' to resolve references."
                )

                # Build messages
                messages = list(self._history)
                messages.append(types.Content(role="user", parts=[types.Part(text=prompt)]))

                # Call Gemini Flash with tools
                response = await self._client.aio.models.generate_content(
                    model=settings.gemini_flash_model,
                    contents=messages,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION_TEMPLATE.format(
                            language_instruction=LANGUAGE_INSTRUCTIONS.get(self.language, LANGUAGE_INSTRUCTIONS["ja"])
                        ),
                        tools=[types.Tool(function_declarations=TOOL_DECLARATIONS)],
                        temperature=0.1,
                    ),
                )

                # Process function calls
                tool_calls_made = 0
                if response.candidates and response.candidates[0].content:
                    for part in response.candidates[0].content.parts:
                        if part.function_call:
                            fc = part.function_call
                            print(f"[Agent] Tool call: {fc.name}({json.dumps(dict(fc.args), ensure_ascii=False)[:200]})")
                            await self._dispatch_tool(fc.name, dict(fc.args))
                            tool_calls_made += 1
                        elif part.text:
                            print(f"[Agent] Text response: {part.text[:200]}")

                # Keep history compact (last 6 turns)
                self._history.append(types.Content(role="user", parts=[types.Part(text=prompt)]))
                if response.candidates and response.candidates[0].content:
                    self._history.append(response.candidates[0].content)
                if len(self._history) > 12:
                    self._history = self._history[-12:]

                print(f"[Agent] Done. {tool_calls_made} tool(s) called.")

            except Exception as e:
                print(f"[Agent] Evaluation error: {e}")

    async def _dispatch_tool(self, name: str, args: dict):
        """Execute a tool call against Firestore."""
        try:
            if name == "update_summary":
                await self.firestore_writer.update_summary(
                    args.get("summary", ""),
                    args.get("topics_discussed", []),
                    args.get("title", ""),
                )
                print(f"[Agent Tool] Summary updated")

            elif name == "upsert_outline_node":
                await self.firestore_writer.upsert_outline_node(args)
                print(f"[Agent Tool] Outline node: {args.get('id')}")

            elif name == "upsert_architecture_element":
                await self.firestore_writer.upsert_architecture_element(args)
                print(f"[Agent Tool] Architecture: {args.get('id')}")

            elif name == "upsert_task":
                await self.firestore_writer.upsert_task(args)
                print(f"[Agent Tool] Task: {args.get('id')}")

            elif name == "upsert_schedule_item":
                await self.firestore_writer.upsert_schedule_item(args)
                print(f"[Agent Tool] Schedule: {args.get('id')}")

            # Notify frontend to focus the relevant pane
            pane = self.TOOL_PANE_MAP.get(name)
            if pane and self.on_pane_update:
                await self.on_pane_update(pane)

            elif name == "inject_thought":
                msg = args.get("message", "")
                if msg and self.live_client:
                    await self.live_client.send_text_context(
                        f"[Background System Note]: {msg}"
                    )
                    print(f"[Agent Tool] Injected: {msg[:100]}")

        except Exception as e:
            print(f"[Agent Tool] Error in {name}: {e}")

    def start(self):
        self._active = True
        self._bg_task = asyncio.create_task(self.run_evaluation_loop())

    async def stop(self):
        self._active = False
        if self._bg_task:
            self._bg_task.cancel()
        await self.firestore_writer.close()
