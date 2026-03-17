import asyncio
from firestore_writer import FirestoreWriter
from google.cloud import firestore

async def main():
    writer = FirestoreWriter("test-session-123")
    print("Testing try_lock_session...")
    res = await writer.try_lock_session("test-connection-123")
    print(f"Result: {res}")

if __name__ == "__main__":
    asyncio.run(main())
