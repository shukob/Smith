"""Background Agent using Google GenAI ADK.

This agent runs asynchronously alongside the main Gemini Live session.
It periodically analyzes the conversation context, extracts requirements,
updates the meeting summary, and injects follow-up questions or risks
into the live session.
"""
import asyncio
from typing import List, Dict, Any, Optional
import os

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .config import settings
from .firestore_writer import FirestoreWriter


class AdkBackgroundAgent:
    """Orchestrates structural thinking using standard tools behind the scenes via ADK."""

    def __init__(self, session_id: str, live_client):
        self.session_id = session_id
        self.live_client = live_client
        self.firestore_writer = FirestoreWriter(session_id)
        
        # We must define the tools as async methods that the ADK Agent can call.
        self.tools = [
            self.extract_requirement,
            self.update_summary,
            self.upsert_outline_node,
            self.upsert_architecture_element,
            self.upsert_task,
            self.upsert_schedule_item,
            self.inject_thought,
        ]

        self.system_instruction = (
            "You are the background strategic brain behind a technical consulting AI. "
            "You will receive batches of transcript from an ongoing meeting. "
            "Your job is to: \n"
            "1. Keep the meeting summary updated using 'update_summary' if topics change. Always generate a concise 3-4 word title for the meeting.\n"
            "2. Maintain an Outline representing Requirements, Goals, and Assumptions using 'upsert_outline_node'.\n"
            "3. Build an Architecture Diagram logically whenever system components are discussed using 'upsert_architecture_element'.\n"
            "4. Track action items on a Kanban board using 'upsert_task'.\n"
            "5. Plot timelines and schedules on a Gantt chart using 'upsert_schedule_item'.\n"
            "6. If you spot a critical technical contradiction, risk, or missing requirement, use 'inject_thought' "
            "to tell the frontend Live AI to bring it up in conversation.\n"
            "7. If you hear a technical question, fact, or unknown that requires internet research, use the 'search_perplexity' tool.\n"
            "You do NOT speak to the user directly. You ONLY use tools to manage state."
        )

        # Setup Perplexity MCP Server Toolset
        from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
        from google.adk.tools.mcp_tool.mcp_session_manager import StdioServerParameters
        import platform

        # Use system node if available, otherwise fallback
        node_cmd = "node"
        if platform.system() == "Darwin" and os.path.exists("/opt/homebrew/bin/node"):
            node_cmd = "/opt/homebrew/bin/node"
            
        self.mcp_toolset = McpToolset(
            connection_params=StdioServerParameters(
                command=node_cmd,
                args=["src/perplexity/build/index.js"],
            )
        )

        all_tools = self.tools + [self.mcp_toolset]

        self.agent = LlmAgent(
            model=settings.gemini_flash_model,
            name="background_meeting_agent",
            description="Background strategic brain behind a technical consulting AI managing Firestore state.",
            instruction=self.system_instruction,
            tools=all_tools,
        )

        self.session_service = InMemorySessionService()
        self.runner = Runner(
            agent=self.agent,
            app_name="funnel_sphere_adk",
            session_service=self.session_service
        )

        self._active = False
        self._transcript_buffer: List[str] = []
        self._bg_task: Optional[asyncio.Task] = None

    async def initialize(self):
        """Initialize connections and seed past memory if resuming a session."""
        await self.firestore_writer.initialize()
        
        # Initialize an ADK session
        await self.session_service.create_session(
            app_name="funnel_sphere_adk",
            user_id="default_user",
            session_id=self.session_id
        )

        # Primer the agent with past context if resuming an old session
        if self.firestore_writer._doc_ref:
            doc = await self.firestore_writer._doc_ref.get()
            if doc.exists:
                data = doc.to_dict() or {}
                transcript = data.get("transcript", [])
                summary = data.get("summary", {}).get("text", "")
                
                if transcript:
                    primer = "[SYSTEM NOTE: Resuming a previous meeting session.]\n"
                    if summary:
                        primer += f"Past Meeting Summary:\n{summary}\n\n"
                    
                    recent_turns = transcript[-20:] # get last 20 turns
                    if recent_turns:
                        primer += "Last few turns from previous session:\n"
                        primer += "\n".join([f"{t.get('role')}: {t.get('text')}" for t in recent_turns])
                        
                    primer += "\n\nPlease briefly acknowledge the resumption of the session internally without calling tools unless absolutely necessary."
                    
                    content = types.Content(role="user", parts=[types.Part(text=primer)])
                    try:
                        print(f"[ADK] Priming agent memory for resumed session: {self.session_id}...")
                        async for event in self.runner.run_async(
                            user_id="default_user",
                            session_id=self.session_id,
                            new_message=content
                        ):
                            pass
                    except Exception as e:
                        print(f"[ADK] Agent priming error: {e}")

        self._active = True

    def append_transcript(self, role: str, text: str):
        """Buffer new transcript lines."""
        if self._active:
            self._transcript_buffer.append(f"{role}: {text}")

    async def run_evaluation_loop(self):
        """Periodically evaluate the buffered transcript using ADK Runner."""
        while self._active:
            await asyncio.sleep(15)  # Every 15 seconds
            
            if not self._transcript_buffer:
                continue

            # Grab current buffer
            context = "\n".join(self._transcript_buffer)
            self._transcript_buffer.clear() # Reset buffer for next batch

            try:
                print(f"[ADK] Evaluating {len(context)} chars of new context...")
                
                # Fetch current state from Firestore to give the agent context
                current_state_str = "Unknown"
                if self.firestore_writer._doc_ref:
                    doc = await self.firestore_writer._doc_ref.get()
                    if doc.exists:
                        data = doc.to_dict() or {}
                        state = {
                            "user_focus": data.get("user_focus", None),
                            "outline": data.get("outline", []),
                            "architecture": data.get("architecture", []),
                            "focus": data.get("focus", []),
                            "schedule": data.get("schedule", [])
                        }
                        import json
                        current_state_str = json.dumps(state, indent=2, ensure_ascii=False)

                prompt = (
                    f"Here is the latest transcript since your last check:\n\n{context}\n\n"
                    f"Here is the CURRENT state of the dashboard panels as modified by the user or you previously:\n"
                    f"```json\n{current_state_str}\n```\n\n"
                    "Based on the transcript and the current dashboard state:\n"
                    "1. Update the state if necessary using your available tools.\n"
                    "2. Do NOT duplicate items that already exist in the state.\n"
                    "3. If the user refers to existing items (e.g., 'that database node'), resolve it against the provided JSON state.\n"
                    "4. VERY IMPORTANT: Pay close attention to 'user_focus' in the JSON state. It tells you exactly which pane and element ID the user is currently editing or looking at. Use this to disambiguate what they are referring to (e.g., 'Make this priority high')."
                )
                
                content = types.Content(role="user", parts=[types.Part(text=prompt)])
                
                async for event in self.runner.run_async(
                    user_id="default_user",
                    session_id=self.session_id,
                    new_message=content
                ):
                    # We don't need to do much with the event stream, 
                    # as ADK handles tool calls automatically during run_async.
                    if event.is_final_response():
                         print(f"[ADK] Finished evaluation step.")

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


    # --- ADK Tools (Native Python Async Methods) ---

    async def extract_requirement(
        self,
        id: str,
        title: str,
        description: str,
        priority: str,
        category: str,
        status: str
    ) -> str:
        """Extract or update a requirement identified during the meeting discussion.

        Args:
            id: Unique format 'REQ-001'
            title: Title of the requirement
            description: Description of the requirement
            priority: high, medium, or low
            category: functional, non-functional, constraint, or assumption
            status: proposed, confirmed, needs_clarification, or rejected
        """
        args = {"id": id, "title": title, "description": description, "priority": priority, "category": category, "status": status}
        try:
            await self.firestore_writer.upsert_requirement(args)
            print(f"[ADK Tool] Requirement saved: {id}")
            return "Requirement saved successfully."
        except Exception as e:
            return f"Error saving requirement: {e}"

    async def update_summary(
        self,
        summary: str,
        topics_discussed: list[str],
        title: str = ""
    ) -> str:
        """Update the global meeting summary after significant context changes.

        Args:
            summary: Markdown summary of the meeting.
            topics_discussed: Array of topics discussed.
            title: A concise 3-4 word title representing the meeting's main subject.
        """
        try:
            await self.firestore_writer.update_summary(summary, topics_discussed, title)
            print("[ADK Tool] Summary updated.")
            return "Summary updated successfully."
        except Exception as e:
            return f"Error updating summary: {e}"

    async def inject_thought(
        self,
        message: str
    ) -> str:
        """Inject a thought, technical risk, or clarification question for the Live AI to speak.

        Args:
            message: The message to send to the Live AI context.
        """
        if message and self.live_client:
            injection_text = f"[Background System Note for AI]: {message}"
            await self.live_client.send_text_context(injection_text)
            print(f"[ADK Tool] Injected thought: {message}")
            return "Thought injected into Live AI context."
        return "Failed to inject thought."

    async def upsert_outline_node(
        self,
        id: str,
        parent_id: str,
        text: str,
        type: str,
        order: int
    ) -> str:
        """Add or update a node in the hierarchical requirements/planning outline.

        Args:
            id: Unique ID for this node.
            parent_id: ID of the parent node, or empty if root.
            text: Text content of the node.
            type: requirement, goal, assumption, or note
            order: Ordering priority among sibling nodes.
        """
        args = {"id": id, "parent_id": parent_id, "text": text, "type": type, "order": order}
        try:
            await self.firestore_writer.upsert_outline_node(args)
            print(f"[ADK Tool] Outline node saved: {id}")
            return "Outline node saved successfully."
        except Exception as e:
            return f"Error saving outline node: {e}"

    async def upsert_architecture_element(
        self,
        id: str,
        type: str,
        label: str = "",
        source: str = "",
        target: str = ""
    ) -> str:
        """Add a node or edge to the system architecture diagram.

        Args:
            id: Unique ID for the node or edge.
            type: Either 'node' or 'edge'.
            label: Label for the node (only if type is 'node').
            source: Source node ID (only if type is 'edge').
            target: Target node ID (only if type is 'edge').
        """
        args = {"id": id, "type": type, "label": label, "source": source, "target": target}
        try:
            await self.firestore_writer.upsert_architecture_element(args)
            print(f"[ADK Tool] Architecture element saved: {id}")
            return "Architecture element saved successfully."
        except Exception as e:
            return f"Error saving architecture element: {e}"

    async def upsert_task(
        self,
        id: str,
        title: str,
        status: str,
        priority: str,
        assignee: str = ""
    ) -> str:
        """Add or update a task on the Kanban board.

        Args:
            id: Unique ID for the task.
            title: Title of the task.
            status: todo, in_progress, or done.
            priority: high, medium, or low.
            assignee: Email or name of assignee.
        """
        args = {"id": id, "title": title, "status": status, "priority": priority, "assignee": assignee}
        try:
            await self.firestore_writer.upsert_task(args)
            print(f"[ADK Tool] Task saved: {id}")
            return "Task saved successfully."
        except Exception as e:
            return f"Error saving task: {e}"

    async def upsert_schedule_item(
        self,
        id: str,
        name: str,
        start_date: str,
        end_date: str,
        progress: int,
        dependencies: list[str]
    ) -> str:
        """Add or update a timeline item on the schedule Gantt chart.

        Args:
            id: Unique ID for the schedule item.
            name: Name of the item.
            start_date: ISO format date e.g. YYYY-MM-DD.
            end_date: ISO format date e.g. YYYY-MM-DD.
            progress: 0-100 percentage of completion.
            dependencies: Array of item IDs this item depends on.
        """
        args = {
            "id": id, "name": name, "start_date": start_date, 
            "end_date": end_date, "progress": progress, "dependencies": dependencies
        }
        try:
            await self.firestore_writer.upsert_schedule_item(args)
            print(f"[ADK Tool] Schedule item saved: {id}")
            return "Schedule item saved successfully."
        except Exception as e:
            return f"Error saving schedule item: {e}"
