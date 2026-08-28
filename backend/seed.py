import asyncio
import uuid
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from storage import put_object, APP_NAME  # noqa

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

SAMPLES = [
    {
        "img": "https://images.unsplash.com/photo-1779179015285-120aaa822b1b?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
        "lat": 28.4610, "lng": 77.0300, "category": "pothole", "status": "open",
        "desc": "Deep pothole near the market crossing, dangerous for two-wheelers.",
        "addr": "MG Road, near Sector 14 Gate, Gurugram, Haryana 122001",
        "confirms": 7, "tl": ["reported"],
    },
    {
        "img": "https://images.unsplash.com/photo-1779226421621-b61bb14fff95?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
        "lat": 28.4570, "lng": 77.0230, "category": "garbage", "status": "in_progress",
        "desc": "Garbage bags piling up on the sidewalk, not collected for days.",
        "addr": "DLF Phase 3, Cyber Hub Road, Gurugram, Haryana 122002",
        "confirms": 3, "tl": ["reported", "acknowledged", "in_progress"],
    },
    {
        "img": "https://images.unsplash.com/photo-1594028235752-10a0cb865c7c?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
        "lat": 28.4630, "lng": 77.0210, "category": "streetlight", "status": "resolved",
        "desc": "Street light not working at night, whole lane stays dark.",
        "addr": "Sector 29 Leisure Valley, Gurugram, Haryana 122001",
        "confirms": 12, "tl": ["reported", "acknowledged", "in_progress", "resolved"],
    },
]


async def main():
    await db.issues.delete_many({"seed": True})
    now = datetime.now(timezone.utc)
    for idx, s in enumerate(SAMPLES):
        data = requests.get(s["img"], timeout=60).content
        path = f"{APP_NAME}/uploads/seed-{uuid.uuid4()}.jpg"
        result = put_object(path, data, "image/jpeg")
        issue_id = str(uuid.uuid4())
        created = (now - timedelta(hours=idx * 6 + 2)).isoformat()
        timeline = []
        for j, st in enumerate(s["tl"]):
            timeline.append({"status": st, "note": "", "created_at": (now - timedelta(hours=(len(s["tl"]) - j) * 3)).isoformat()})
        await db.issues.insert_one({
            "id": issue_id,
            "short_id": issue_id.split("-")[0].upper(),
            "reporter_id": "seed",
            "reporter_name": "Anonymous",
            "photo_path": result["path"],
            "latitude": s["lat"], "longitude": s["lng"],
            "address_text": s["addr"],
            "description": s["desc"],
            "category": s["category"],
            "status": s["status"],
            "confirm_count": s["confirms"],
            "confirmed_by": [f"seed{i}" for i in range(s["confirms"])],
            "timeline": timeline,
            "comments": [],
            "created_at": created,
            "updated_at": created,
            "seed": True,
        })
        print("seeded", s["category"])
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
