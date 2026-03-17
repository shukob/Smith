import asyncio
import websockets
import json

async def test_connect(force: bool):
    url = "wss://smith-backend-cw6i3mjisa-an.a.run.app/ws/meeting/test-session-456"
    if force:
        url += "?force=true"
        
    print(f"Connecting to {url}")
    try:
        async with websockets.connect(url) as ws:
            msg = await ws.recv()
            print(f"Received: {msg}")
    except Exception as e:
        print(f"Exception: {e}")

async def main():
    print("Test 1: Normal connect (should be locked if connection drops)")
    await test_connect(False)
    
    print("\nTest 2: Force connect (should succeed)")
    await test_connect(True)

if __name__ == "__main__":
    asyncio.run(main())
