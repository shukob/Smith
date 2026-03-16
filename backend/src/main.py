"""Smith - Speculative Turn-taking S2S Technical Consultant Agent.

FastAPI application with WebSocket endpoint for real-time voice meetings.
"""
import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import firebase_admin
from firebase_admin import auth as firebase_auth

from .config import settings
from .session_manager import SessionManager
from .firestore_writer import FirestoreWriter


session_manager = SessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    print("[Smith] Starting up...")
    firebase_admin.initialize_app()
    print("[Smith] Firebase Admin initialized")
    yield
    print("[Smith] Shutting down...")
    await session_manager.close_all()


app = FastAPI(
    title="Smith - Speculative Turn-taking Agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint for Cloud Run."""
    return {"status": "healthy", "service": "smith"}


@app.websocket("/ws/meeting/{session_id}")
async def meeting_websocket(websocket: WebSocket, session_id: str, force: bool = False, token: str = Query(default="")):
    """WebSocket endpoint for a meeting session.

    Protocol:
    - Client sends binary frames: PCM16 16kHz mono audio
    - Client sends text frames: JSON control messages
    - Server sends binary frames: 0x01 + PCM 24kHz audio | 0x02 + JPEG video
    - Server sends text frames: JSON events (transcripts, requirements, divergence)

    Control messages from client:
    - {"type": "configure", ...}: Initialize session
    - {"type": "toggle_speculative", "enabled": bool}: Toggle speculative engine
    - {"type": "disconnect"}: Close session
    """
    await websocket.accept()

    # Verify Firebase ID token
    if not token:
        await websocket.send_json({"type": "error", "message": "Unauthorized: no token"})
        await websocket.close(code=4401)
        return

    try:
        decoded_token = firebase_auth.verify_id_token(token)
        user_uid = decoded_token["uid"]
        print(f"[WebSocket] Authenticated user={user_uid}, session_id={session_id}")
    except Exception as e:
        print(f"[WebSocket] Token verification failed: {e}")
        await websocket.send_json({"type": "error", "message": "Unauthorized: invalid token"})
        await websocket.close(code=4401)
        return

    print(f"[WebSocket] Connected session_id={session_id}, force={force}")
    
    connection_id = str(uuid.uuid4())
    writer = FirestoreWriter(session_id)
    await writer.initialize()
    
    if not await writer.try_lock_session(connection_id, force=force):
        await websocket.send_json({
            "type": "error", 
            "message": "Session already active"
        })
        await websocket.close()
        return

    session = await session_manager.create_session(session_id, websocket)

    try:
        # Initialize session components
        await session.initialize()

        # Send ready signal
        simli_ok = session.simli_client and session.simli_client.is_connected
        await websocket.send_json({
            "type": "ready",
            "session_id": session_id,
            "speculative_engine": settings.enable_speculative_engine,
            "simli_connected": bool(simli_ok),
        })

        # Main message loop
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Binary frame = audio data
            if "bytes" in message and message["bytes"]:
                await session.handle_browser_audio(message["bytes"])

            # Text frame = JSON control message
            elif "text" in message and message["text"]:
                import json
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type", "")

                    if msg_type == "toggle_speculative":
                        await session.toggle_speculative_engine(
                            data.get("enabled", True)
                        )
                    elif msg_type == "disconnect":
                        break
                    elif msg_type == "video_frame":
                        await session.handle_browser_video(data.get("data", ""))
                    elif msg_type == "file_context":
                        await session.handle_browser_file(
                            data.get("filename", ""),
                            data.get("mimeType", ""),
                            data.get("data", "")
                        )
                    elif msg_type == "user_edit_outline":
                        await session.handle_user_edit_outline(data.get("node", {}))
                    elif msg_type == "user_delete_outline":
                        await session.handle_user_delete_outline(data.get("id", ""))
                    elif msg_type == "user_edit_task":
                        await session.handle_user_edit_task(data.get("task", {}))
                    elif msg_type == "user_delete_task":
                        await session.handle_user_delete_task(data.get("id", ""))
                    elif msg_type == "user_edit_arch":
                        await session.handle_user_edit_arch(data.get("element", {}))
                    elif msg_type == "user_delete_arch":
                        await session.handle_user_delete_arch(data.get("id", ""))
                    elif msg_type == "user_edit_schedule":
                        await session.handle_user_edit_schedule(data.get("item", {}))
                    elif msg_type == "user_delete_schedule":
                        await session.handle_user_delete_schedule(data.get("id", ""))
                    elif msg_type == "user_set_focus":
                        await session.handle_user_set_focus(data.get("focus", {}))
                    elif msg_type == "user_edit_title":
                        await session.handle_user_edit_title(data.get("title", ""))
                    elif msg_type == "user_toggle_archive":
                        await session.handle_user_toggle_archive(data.get("is_archived", False))

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        print(f"[Smith] Client disconnected: {session_id}")
    except Exception as e:
        print(f"[Smith] Session error: {e}")
    finally:
        await writer.unlock_session(connection_id)
        await session_manager.close_session(session_id)


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level="info",
    )
