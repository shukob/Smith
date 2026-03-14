"""Firestore real-time writer for meeting data.

Writes requirements, summaries, and transcripts to Firestore.
Frontend listens via onSnapshot for real-time UI updates.
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from google.cloud import firestore_v1 as firestore

from .config import settings


class FirestoreWriter:
    """
    Async Firestore writer for real-time meeting data.

    Document structure:
    smith_sessions/{session_id}/
      metadata: { created, status }
      requirements: [{ id, title, description, priority, category, status }]
      summary: { text, topics_discussed, last_updated }
      transcript: [{ role, text, timestamp }]
      divergence_log: [{ timestamp, score, action, predicted, actual }]
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._db: Optional[firestore.AsyncClient] = None
        self._doc_ref = None

    async def initialize(self) -> None:
        """Initialize Firestore client and create session document."""
        self._db = firestore.AsyncClient(project=settings.gcp_project_id)
        self._doc_ref = self._db.collection(settings.firestore_collection).document(
            self.session_id
        )

        # Create initial session document
        await self._doc_ref.set({
            "metadata": {
                "created": datetime.now(timezone.utc).isoformat(),
                "status": "active",
            },
            "requirements": [],
            "summary": {
                "text": "",
                "topics_discussed": [],
                "last_updated": datetime.now(timezone.utc).isoformat(),
            },
            "outline_nodes": [],
            "architecture_elements": [],
            "tasks": [],
            "schedule_items": [],
            "transcript": [],
            "divergence_log": [],
        })
        print(f"[Firestore] Session document created: {self.session_id}")

    async def upsert_requirement(self, requirement: dict) -> None:
        """Insert or update a requirement."""
        if not self._doc_ref:
            return

        try:
            doc = await self._doc_ref.get()
            data = doc.to_dict() or {}
            requirements = data.get("requirements", [])

            # Check if requirement with same ID exists
            req_id = requirement.get("id", "")
            updated = False
            for i, req in enumerate(requirements):
                if req.get("id") == req_id:
                    requirements[i] = {
                        **requirement,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    updated = True
                    break

            if not updated:
                requirements.append({
                    **requirement,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

            await self._doc_ref.update({"requirements": requirements})
            print(f"[Firestore] Requirement {'updated' if updated else 'added'}: {req_id}")

        except Exception as e:
            print(f"[Firestore] Failed to upsert requirement: {e}")

    async def update_summary(self, summary: str, topics: list[str], title: str = "") -> None:
        """Update the meeting discussion summary."""
        if not self._doc_ref:
            return

        try:
            updates = {
                "summary": {
                    "text": summary,
                    "topics_discussed": topics,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                }
            }
            if title:
                # Get current metadata to preserve status etc, while setting the name if it hasn't been manually set elsewhere
                doc = await self._doc_ref.get()
                data = doc.to_dict() or {}
                metadata = data.get("metadata", {})
                # We only overwrite the title if it doesn't exist, or if we want the AI to constantly update it.
                # Let's let the AI update it, but frontend edits would just get overwritten. 
                # Better: always update it. The frontend manual edit sets it, but the AI might refine it later.
                metadata["name"] = title
                updates["metadata"] = metadata

            await self._doc_ref.update(updates)
        except Exception as e:
            print(f"[Firestore] Failed to update summary: {e}")

    async def update_title(self, title: str) -> None:
        """Manually update the session title from frontend."""
        if not self._doc_ref:
            return
        try:
            doc = await self._doc_ref.get()
            metadata = (doc.to_dict() or {}).get("metadata", {})
            metadata["name"] = title
            await self._doc_ref.update({"metadata": metadata})
        except Exception as e:
            print(f"[Firestore] Failed to update title: {e}")

    @firestore.async_transactional
    async def _lock_transaction(self, transaction, doc_ref, connection_id: str, force: bool = False) -> bool:
        doc = await doc_ref.get(transaction=transaction)
        data = doc.to_dict() or {}
        metadata = data.get("metadata", {})
        
        current_lock = metadata.get("locked_by")
        if current_lock and current_lock != connection_id and not force:
            # Already locked by someone else
            # (In a production system you might check a heartbeat timestamp to break stale locks)
            return False
            
        metadata["locked_by"] = connection_id
        transaction.update(doc_ref, {"metadata": metadata})
        return True

    async def try_lock_session(self, connection_id: str, force: bool = False) -> bool:
        """Attempt to lock the session for a specific connection. Returns True if successful."""
        if not self._doc_ref:
            return False
        try:
            db_client = firestore.AsyncClient(project=settings.google_cloud_project)
            transaction = db_client.transaction()
            return await self._lock_transaction(transaction, self._doc_ref, connection_id, force)
        except Exception as e:
            print(f"[Firestore] Failed to lock session: {e}")
            return False

    async def unlock_session(self, connection_id: str) -> None:
        """Unlock the session if it is currently locked by the given connection_id."""
        if not self._doc_ref:
            return
        try:
            # We can just do a standard read/write here since releasing a lock you own is safe
            doc = await self._doc_ref.get()
            data = doc.to_dict() or {}
            metadata = data.get("metadata", {})
            if metadata.get("locked_by") == connection_id:
                metadata.pop("locked_by", None)
                await self._doc_ref.update({"metadata": metadata})
                print(f"[Firestore] Unlocked session {self.session_id}")
        except Exception as e:
            print(f"[Firestore] Failed to unlock session: {e}")

    async def _upsert_array_item(self, array_field: str, item: dict, id_field: str = "id") -> None:
        """Helper to upsert an item in a document array."""
        if not self._doc_ref:
            return
            
        try:
            doc = await self._doc_ref.get()
            data = doc.to_dict() or {}
            items = data.get(array_field, [])
            
            item_id = item.get(id_field, "")
            updated = False
            for i, existing_item in enumerate(items):
                if existing_item.get(id_field) == item_id:
                    items[i] = {
                        **item,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    updated = True
                    break
                    
            if not updated:
                items.append({
                    **item,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                
            await self._doc_ref.update({array_field: items})
        except Exception as e:
            print(f"[Firestore] Failed to upsert to {array_field}: {e}")

    async def _remove_array_item(self, array_field: str, item_id: str, id_field: str = "id") -> None:
        """Helper to remove an item from a document array by ID."""
        if not self._doc_ref:
            return
            
        try:
            doc = await self._doc_ref.get()
            data = doc.to_dict() or {}
            items = data.get(array_field, [])
            
            initial_count = len(items)
            items = [item for item in items if item.get(id_field) != item_id]
            
            if len(items) < initial_count:
                await self._doc_ref.update({array_field: items})
                print(f"[Firestore] Removed {item_id} from {array_field}")
        except Exception as e:
            print(f"[Firestore] Failed to remove from {array_field}: {e}")

    async def upsert_outline_node(self, node: dict) -> None:
        await self._upsert_array_item("outline_nodes", node)

    async def delete_outline_node(self, node_id: str) -> None:
        await self._remove_array_item("outline_nodes", node_id)

    async def upsert_architecture_element(self, element: dict) -> None:
        await self._upsert_array_item("architecture_elements", element)

    async def delete_architecture_element(self, element_id: str) -> None:
        await self._remove_array_item("architecture_elements", element_id)

    async def upsert_task(self, task: dict) -> None:
        await self._upsert_array_item("tasks", task)

    async def delete_task(self, task_id: str) -> None:
        await self._remove_array_item("tasks", task_id)

    async def upsert_schedule_item(self, item: dict) -> None:
        await self._upsert_array_item("schedule_items", item)

    async def delete_schedule_item(self, item_id: str) -> None:
        await self._remove_array_item("schedule_items", item_id)

    async def append_transcript(self, role: str, text: str) -> None:
        """Append a transcript entry."""
        if not self._doc_ref:
            return

        try:
            await self._doc_ref.update({
                "transcript": firestore.ArrayUnion([{
                    "role": role,
                    "text": text,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }])
            })
        except Exception as e:
            print(f"[Firestore] Failed to append transcript: {e}")

    async def log_divergence(
        self, score: float, action: str, predicted: str, actual: str
    ) -> None:
        """Log a divergence detection event."""
        if not self._doc_ref:
            return

        try:
            await self._doc_ref.update({
                "divergence_log": firestore.ArrayUnion([{
                    "score": score,
                    "action": action,
                    "predicted": predicted,
                    "actual": actual,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }])
            })
        except Exception as e:
            print(f"[Firestore] Failed to log divergence: {e}")

    async def set_status(self, status: str) -> None:
        """Update session status."""
        if not self._doc_ref:
            return

        try:
            await self._doc_ref.update({"metadata.status": status})
        except Exception as e:
            print(f"[Firestore] Failed to set status: {e}")

    async def close(self) -> None:
        """Close the Firestore client."""
        if self._doc_ref:
            await self.set_status("completed")
        if self._db:
            self._db.close()
        print(f"[Firestore] Writer closed for session {self.session_id}")
