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

# All tools for the live session
LIVE_TOOLS = [
    types.Tool(function_declarations=[EXTRACT_REQUIREMENT, UPDATE_SUMMARY, ASK_CLARIFICATION])
]
