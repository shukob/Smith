"""Background Agent using Google GenAI ADK.

This agent runs asynchronously alongside the main Gemini Live session.
It periodically analyzes the conversation context, extracts requirements,
updates the meeting summary, and injects follow-up questions or risks
into the live session.
"""
import asyncio
from typing import List, Dict, Any, Optional

from google import genai
from google.genai import types
from google_genai_adk import Agent, Tool

from .config import settings
from .firestore_writer import FirestoreWriter


class AdkBackgroundAgent:
    """Orchestrates structural thinking using ADK behind the scenes."""

    def __init__(self, session_id: str, live_client):
        self.session_id = session_id
        self.live_client = live_client
        self.firestore_writer = FirestoreWriter(session_id)
        
        # Tools exposed to the ADK agent
        self.extract_req_tool = Tool(
            name="extract_requirement",
            description="Extract or update a requirement identified during the meeting discussion.",
            function=self._tool_extract_requirement,
            parameters={
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Unique format 'REQ-001'"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "category": {"type": "string", "enum": ["functional", "non-functional", "constraint", "assumption"]},
                    "status": {"type": "string", "enum": ["proposed", "confirmed", "needs_clarification", "rejected"]},
                },
                "required": ["id", "title", "description", "priority", "category", "status"]
            }
        )

        self.update_summary_tool = Tool(
            name="update_summary",
            description="Update the global meeting summary after significant context changes.",
            function=self._tool_update_summary,
            parameters={
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Markdown summary of the meeting."},
                    "topics_discussed": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "topics_discussed"]
            }
        )

        self.upsert_outline_node_tool = Tool(
            name="upsert_outline_node",
            description="Add or update a node in the hierarchical requirements/planning outline.",
            function=self._tool_upsert_outline_node,
            parameters={
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Unique ID for this node."},
                    "parent_id": {"type": "string", "description": "ID of the parent node, or empty if root."},
                    "text": {"type": "string", "description": "Text content of the node."},
                    "type": {"type": "string", "enum": ["requirement", "goal", "assumption", "note"]},
                    "order": {"type": "integer", "description": "Ordering sibling nodes."}
                },
                "required": ["id", "parent_id", "text", "type", "order"]
            }
        )

        self.upsert_architecture_element_tool = Tool(
            name="upsert_architecture_element",
            description="Add a node or edge to the system architecture diagram.",
            function=self._tool_upsert_architecture_element,
            parameters={
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "type": {"type": "string", "enum": ["node", "edge"]},
                    "label": {"type": "string", "description": "Label for the node (only if type is 'node')."},
                    "source": {"type": "string", "description": "Source node ID (only if type is 'edge')."},
                    "target": {"type": "string", "description": "Target node ID (only if type is 'edge')."}
                },
                "required": ["id", "type"]
            }
        )

        self.upsert_task_tool = Tool(
            name="upsert_task",
            description="Add or update a task on the Kanban board.",
            function=self._tool_upsert_task,
            parameters={
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "status": {"type": "string", "enum": ["todo", "in_progress", "done"]},
                    "assignee": {"type": "string"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]}
                },
                "required": ["id", "title", "status", "priority"]
            }
        )

        self.upsert_schedule_item_tool = Tool(
            name="upsert_schedule_item",
            description="Add or update a timeline item on the schedule Gantt chart.",
            function=self._tool_upsert_schedule_item,
            parameters={
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "start_date": {"type": "string", "description": "ISO format date e.g. YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO format date e.g. YYYY-MM-DD"},
                    "progress": {"type": "integer", "description": "0-100 percentage"},
                    "dependencies": {"type": "array", "items": {"type": "string"}, "description": "Array of item IDs this depends on."}
                },
                "required": ["id", "name", "start_date", "end_date", "progress", "dependencies"]
            }
        )

        self.inject_thought_tool = Tool(
            name="inject_thought",
            description="Inject a thought, technical risk, or clarification question for the Live AI to speak.",
            function=self._tool_inject_thought,
            parameters={
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "The message to send to the Live AI context."},
                },
                "required": ["message"]
            }
        )

        self.agent = Agent(
            name="SmithBackgroundThinker",
            model=settings.gemini_flash_model, # Quick reasoning model
            instructions=(
                "You are the background strategic brain behind a technical consulting AI. "
                "You will receive batches of transcript from an ongoing meeting. "
                "Your job is to: \n"
                "1. Keep the meeting summary updated using 'update_summary' if topics change.\n"
                "2. Maintain an Omni Outline representing Requirements, Goals, and Assumptions using 'upsert_outline_node'.\n"
                "3. Build an Architecture Diagram logically whenever system components are discussed using 'upsert_architecture_element'.\n"
                "4. Track action items on a Kanban board using 'upsert_task'.\n"
                "5. Plot timelines and schedules on a Gantt chart using 'upsert_schedule_item'.\n"
                "6. If you spot a critical technical contradiction, risk, or missing requirement, use 'inject_thought' "
                "to tell the frontend Live AI to bring it up in conversation.\n"
                "You do NOT speak to the user directly. You ONLY use tools to manage state."
            ),
            tools=[
                self.extract_req_tool, self.update_summary_tool, self.inject_thought_tool,
                self.upsert_outline_node_tool, self.upsert_architecture_element_tool,
                self.upsert_task_tool, self.upsert_schedule_item_tool
            ],
        )

        self._active = False
        self._transcript_buffer: List[str] = []
        self._bg_task: Optional[asyncio.Task] = None

    async def initialize(self):
        """Initialize connections."""
        await self.firestore_writer.initialize()
        self._active = True

    def append_transcript(self, role: str, text: str):
        """Buffer new transcript lines."""
        if self._active:
            self._transcript_buffer.append(f"{role}: {text}")

    async def run_evaluation_loop(self):
        """Periodically evaluate the buffered transcript."""
        while self._active:
            await asyncio.sleep(15)  # Every 15 seconds
            
            if not self._transcript_buffer:
                continue

            # Grab current buffer
            context = "\n".join(self._transcript_buffer)
            self._transcript_buffer.clear() # Reset buffer for next batch

            try:
                print(f"[ADK] Evaluating {len(context)} chars of new context...")
                prompt = f"Here is the latest transcript since your last check:\n\n{context}\n\nUpdate state if necessary."
                # ADK executes thought process and calls tools automatically
                await self.agent.run(prompt)
            except Exception as e:
                print(f"[ADK] Agent evaluation error: {e}")

    def start(self):
        """Start the background ADK evaluation loop."""
        self._active = True
        self._bg_task = asyncio.create_task(self.run_evaluation_loop())

    async def stop(self):
        """Stop the background agent."""
        self._active = False
        if self._bg_task:
            self._bg_task.cancel()
        await self.firestore_writer.close()


    # --- Tool Callbacks ---

    async def _tool_extract_requirement(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.upsert_requirement(args)
            print(f"[ADK Tool] Requirement saved: {args.get('id')}")
            return "Requirement saved successfully."
        except Exception as e:
            return f"Error saving requirement: {e}"

    async def _tool_update_summary(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.update_summary(
                args.get("summary", ""),
                args.get("topics_discussed", [])
            )
            print("[ADK Tool] Summary updated.")
            return "Summary updated successfully."
        except Exception as e:
            return f"Error updating summary: {e}"

    async def _tool_inject_thought(self, args: Dict[str, Any]) -> str:
        """Inject context into the live Gemini session."""
        message = args.get("message", "")
        if message and self.live_client:
            injection_text = f"[Background System Note for AI]: {message}"
            await self.live_client.send_text_context(injection_text)
            print(f"[ADK Tool] Injected thought: {message}")
            return "Thought injected into Live AI context."
        return "Failed to inject thought."

    async def _tool_upsert_outline_node(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.upsert_outline_node(args)
            print(f"[ADK Tool] Outline node saved: {args.get('id')}")
            return "Outline node saved successfully."
        except Exception as e:
            return f"Error saving outline node: {e}"

    async def _tool_upsert_architecture_element(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.upsert_architecture_element(args)
            print(f"[ADK Tool] Architecture element saved: {args.get('id')}")
            return "Architecture element saved successfully."
        except Exception as e:
            return f"Error saving architecture element: {e}"

    async def _tool_upsert_task(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.upsert_task(args)
            print(f"[ADK Tool] Task saved: {args.get('id')}")
            return "Task saved successfully."
        except Exception as e:
            return f"Error saving task: {e}"

    async def _tool_upsert_schedule_item(self, args: Dict[str, Any]) -> str:
        try:
            await self.firestore_writer.upsert_schedule_item(args)
            print(f"[ADK Tool] Schedule item saved: {args.get('id')}")
            return "Schedule item saved successfully."
        except Exception as e:
            return f"Error saving schedule item: {e}"
