"""Function declarations for Gemini Live API tool use."""
from google import genai
from google.genai import types


# Tool: Extract a requirement from the discussion
EXTRACT_REQUIREMENT = types.FunctionDeclaration(
    name="extract_requirement",
    description="Extract or update a requirement identified during the meeting discussion. Call this whenever a concrete requirement, feature request, or constraint is mentioned by any participant.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "id": types.Schema(
                type="STRING",
                description="Unique identifier for this requirement. Use format 'REQ-001', 'REQ-002', etc. Reuse the same ID when updating an existing requirement.",
            ),
            "title": types.Schema(
                type="STRING",
                description="Short title of the requirement (1 line).",
            ),
            "description": types.Schema(
                type="STRING",
                description="Detailed description of the requirement.",
            ),
            "priority": types.Schema(
                type="STRING",
                description="Priority level.",
                enum=["high", "medium", "low"],
            ),
            "category": types.Schema(
                type="STRING",
                description="Category of the requirement.",
                enum=["functional", "non-functional", "constraint", "assumption"],
            ),
            "status": types.Schema(
                type="STRING",
                description="Current status.",
                enum=["proposed", "confirmed", "needs_clarification", "rejected"],
            ),
        },
        required=["id", "title", "description", "priority", "category", "status"],
    ),
)

# Tool: Update discussion summary
UPDATE_SUMMARY = types.FunctionDeclaration(
    name="update_summary",
    description="Update the current discussion summary. Call this periodically to keep the meeting summary current, especially after important decisions or topic changes.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "summary": types.Schema(
                type="STRING",
                description="Current discussion summary in markdown format. Include key decisions, open questions, and action items.",
            ),
            "topics_discussed": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
                description="List of topics covered so far.",
            ),
        },
        required=["summary", "topics_discussed"],
    ),
)

# Tool: Flag something needing clarification
ASK_CLARIFICATION = types.FunctionDeclaration(
    name="ask_clarification",
    description="Flag a topic that needs clarification from participants. The AI will verbally ask the clarification question.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "topic": types.Schema(
                type="STRING",
                description="The topic needing clarification.",
            ),
            "question": types.Schema(
                type="STRING",
                description="The specific question to ask participants.",
            ),
        },
        required=["topic", "question"],
    ),
)

# Tool: Add/update an outline node
UPSERT_OUTLINE_NODE = types.FunctionDeclaration(
    name="upsert_outline_node",
    description="Add or update a node in the hierarchical requirements/planning outline. Call when the user explicitly mentions a requirement, goal, assumption, or planning item.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "id": types.Schema(type="STRING", description="Unique ID for this node (e.g. 'outline-1')."),
            "text": types.Schema(type="STRING", description="Text content of the node."),
            "type": types.Schema(type="STRING", description="Node type.", enum=["requirement", "goal", "assumption", "note"]),
            "parent_id": types.Schema(type="STRING", description="Parent node ID, or empty string if root."),
            "order": types.Schema(type="INTEGER", description="Order among siblings (0-based)."),
        },
        required=["id", "text", "type"],
    ),
)

# Tool: Add/update an architecture element
UPSERT_ARCHITECTURE_ELEMENT = types.FunctionDeclaration(
    name="upsert_architecture_element",
    description="Add a node or edge to the system architecture diagram. Call when the user explicitly mentions a system component, service, database, or connection between them.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "id": types.Schema(type="STRING", description="Unique ID (e.g. 'auth-svc', 'edge-auth-db')."),
            "type": types.Schema(type="STRING", description="'node' or 'edge'."),
            "label": types.Schema(type="STRING", description="Display label (for nodes)."),
            "source": types.Schema(type="STRING", description="Source node ID (for edges)."),
            "target": types.Schema(type="STRING", description="Target node ID (for edges)."),
        },
        required=["id", "type"],
    ),
)

# Tool: Add/update a task
UPSERT_TASK = types.FunctionDeclaration(
    name="upsert_task",
    description="Add or update a task on the Kanban board. Call when the user explicitly mentions an action item, task, or work to be done.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "id": types.Schema(type="STRING", description="Unique task ID (e.g. 'task-1')."),
            "title": types.Schema(type="STRING", description="Task title."),
            "status": types.Schema(type="STRING", description="Task status.", enum=["todo", "in_progress", "done"]),
            "priority": types.Schema(type="STRING", description="Priority level.", enum=["high", "medium", "low"]),
        },
        required=["id", "title", "status", "priority"],
    ),
)

# Tool: Add/update a schedule item
UPSERT_SCHEDULE_ITEM = types.FunctionDeclaration(
    name="upsert_schedule_item",
    description="Add or update a timeline item on the schedule Gantt chart. Call when the user explicitly mentions a deadline, milestone, or timeline.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "id": types.Schema(type="STRING", description="Unique ID (e.g. 'sched-1')."),
            "name": types.Schema(type="STRING", description="Item name."),
            "start_date": types.Schema(type="STRING", description="Start date ISO YYYY-MM-DD."),
            "end_date": types.Schema(type="STRING", description="End date ISO YYYY-MM-DD."),
            "progress": types.Schema(type="INTEGER", description="Completion 0-100."),
        },
        required=["id", "name", "start_date", "end_date", "progress"],
    ),
)

# All tools for the live session
LIVE_TOOLS = [
    types.Tool(function_declarations=[
        EXTRACT_REQUIREMENT, UPDATE_SUMMARY, ASK_CLARIFICATION,
        UPSERT_OUTLINE_NODE, UPSERT_ARCHITECTURE_ELEMENT,
        UPSERT_TASK, UPSERT_SCHEDULE_ITEM,
    ])
]
