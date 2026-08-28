from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, BeforeValidator
from typing import List, Optional, Annotated
from datetime import datetime, timezone, timedelta

from storage import init_storage, put_object, get_object, APP_NAME

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PyObjectId = Annotated[str, BeforeValidator(str)]

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

CATEGORY_KEYWORDS = {
    "pothole": ["pothole", "pot hole", "road", "crack", "asphalt", "crater", "dig", "sinkhole"],
    "garbage": ["garbage", "trash", "waste", "rubbish", "dump", "litter", "dustbin", "smell", "sewage"],
    "streetlight": ["streetlight", "street light", "light", "lamp", "dark", "bulb", "pole"],
    "water": ["water", "leak", "pipe", "drain", "flood", "waterlogging", "overflow"],
    "signage": ["sign", "signage", "board", "signal", "traffic light", "marking"],
}

STATUS_ORDER = ["reported", "acknowledged", "in_progress", "resolved"]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def classify(description: str) -> str:
    if not description:
        return "uncategorized"
    text = description.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return cat
    return "uncategorized"


# ---------- Models ----------
class IssueCreate(BaseModel):
    photo_path: str
    latitude: float
    longitude: float
    address_text: str
    description: Optional[str] = ""
    reporter_id: Optional[str] = None
    reporter_name: Optional[str] = "Anonymous"


class StatusUpdateIn(BaseModel):
    status: str
    note: Optional[str] = ""


class CategoryUpdateIn(BaseModel):
    category: str


class CommentCreate(BaseModel):
    text: str
    user_id: Optional[str] = None
    user_name: Optional[str] = "Anonymous"


class ConfirmIn(BaseModel):
    device_id: str


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "CivicFix API"}


@api_router.post("/upload")
async def upload(file: UploadFile = File(...)):
    ext = (file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg")
    content_type = MIME_TYPES.get(ext, file.content_type or "image/jpeg")
    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    result = put_object(path, data, content_type)
    return {"photo_path": result["path"]}


@api_router.get("/files/{path:path}")
async def download(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


@api_router.post("/issues")
async def create_issue(payload: IssueCreate):
    issue_id = str(uuid.uuid4())
    short_id = issue_id.split("-")[0].upper()
    ts = now_iso()
    category = classify(payload.description)
    doc = {
        "id": issue_id,
        "short_id": short_id,
        "reporter_id": payload.reporter_id,
        "reporter_name": payload.reporter_name or "Anonymous",
        "photo_path": payload.photo_path,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "address_text": payload.address_text,
        "description": payload.description or "",
        "category": category,
        "status": "open",
        "confirm_count": 0,
        "confirmed_by": [],
        "timeline": [{"status": "reported", "note": "Issue reported by citizen", "created_at": ts}],
        "comments": [],
        "created_at": ts,
        "updated_at": ts,
    }
    await db.issues.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/issues")
async def list_issues(category: Optional[str] = None, status: Optional[str] = None, reporter_id: Optional[str] = None):
    query = {}
    if category and category != "all":
        query["category"] = category
    if status and status != "all":
        query["status"] = status
    if reporter_id:
        query["reporter_id"] = reporter_id
    issues = await db.issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return issues


@api_router.get("/issues/{issue_id}")
async def get_issue(issue_id: str):
    issue = await db.issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@api_router.post("/issues/{issue_id}/confirm")
async def confirm_issue(issue_id: str, payload: ConfirmIn):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    confirmed_by = issue.get("confirmed_by", [])
    if payload.device_id in confirmed_by:
        return {"confirm_count": issue.get("confirm_count", 0), "already": True}
    confirmed_by.append(payload.device_id)
    await db.issues.update_one(
        {"id": issue_id},
        {"$set": {"confirmed_by": confirmed_by, "confirm_count": len(confirmed_by), "updated_at": now_iso()}},
    )
    return {"confirm_count": len(confirmed_by), "already": False}


@api_router.post("/issues/{issue_id}/comments")
async def add_comment(issue_id: str, payload: CommentCreate):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": payload.user_id,
        "user_name": payload.user_name or "Anonymous",
        "text": payload.text.strip(),
        "created_at": now_iso(),
    }
    await db.issues.update_one(
        {"id": issue_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": now_iso()}},
    )
    return comment


@api_router.patch("/issues/{issue_id}/status")
async def update_status(issue_id: str, payload: StatusUpdateIn):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if payload.status not in STATUS_ORDER:
        raise HTTPException(status_code=400, detail="Invalid status")
    entry = {"status": payload.status, "note": payload.note or "", "created_at": now_iso()}
    top_status = "resolved" if payload.status == "resolved" else ("in_progress" if payload.status in ("in_progress", "acknowledged") else "open")
    await db.issues.update_one(
        {"id": issue_id},
        {"$push": {"timeline": entry}, "$set": {"status": top_status, "updated_at": now_iso()}},
    )
    updated = await db.issues.find_one({"id": issue_id}, {"_id": 0})
    return updated


@api_router.patch("/issues/{issue_id}/category")
async def update_category(issue_id: str, payload: CategoryUpdateIn):
    result = await db.issues.update_one(
        {"id": issue_id},
        {"$set": {"category": payload.category, "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Issue not found")
    updated = await db.issues.find_one({"id": issue_id}, {"_id": 0})
    return updated


@api_router.get("/admin/metrics")
async def admin_metrics():
    all_issues = await db.issues.find({}, {"_id": 0}).to_list(1000)
    total = len(all_issues)
    open_count = len([i for i in all_issues if i["status"] == "open"])
    in_progress = len([i for i in all_issues if i["status"] == "in_progress"])
    resolved = len([i for i in all_issues if i["status"] == "resolved"])
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    resolved_this_week = len([
        i for i in all_issues if i["status"] == "resolved" and i.get("updated_at", "") >= week_ago
    ])
    by_category = {}
    for i in all_issues:
        c = i.get("category", "uncategorized")
        by_category[c] = by_category.get(c, 0) + 1
    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress,
        "resolved": resolved,
        "resolved_this_week": resolved_this_week,
        "by_category": by_category,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
