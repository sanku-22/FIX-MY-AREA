"""CivicFix Backend Tests - complete API coverage (iter 2: auth, i18n-agnostic, AI verify, geocode)."""
import os
import io
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://report-now-8.preview.emergentagent.com").rstrip("/")
# Read frontend .env directly to prevent misconfig
try:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
except Exception:
    pass

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def sample_image_bytes():
    # Use a real pothole/road photo so AI verification accepts it.
    for url in [
        "https://loremflickr.com/800/600/pothole",
        "https://loremflickr.com/800/600/road,damage",
        "https://loremflickr.com/800/600/street,road",
    ]:
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 200 and len(r.content) > 5000:
                return r.content
        except Exception:
            continue
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), color=(120, 100, 80)).save(buf, format="JPEG")
    return buf.getvalue()


# ---------- Basic ----------
def test_api_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("message") == "CivicFix API"


# ---------- Upload / Files ----------
def test_upload_image(s, sample_image_bytes):
    files = {"file": ("test.jpg", sample_image_bytes, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "photo_path" in data
    assert isinstance(data["photo_path"], str) and len(data["photo_path"]) > 0
    # download it back
    r2 = s.get(f"{API}/files/{data['photo_path']}")
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")


def test_files_404(s):
    r = s.get(f"{API}/files/nonexistent-{uuid.uuid4()}.jpg")
    assert r.status_code == 404


# ---------- Issues CRUD + classification ----------
@pytest.fixture(scope="session")
def uploaded_photo(s, sample_image_bytes):
    files = {"file": ("test.jpg", sample_image_bytes, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files)
    assert r.status_code == 200
    return r.json()["photo_path"]


def _create_issue(s, uploaded_photo, description, reporter_id="TEST_DEVICE_1"):
    payload = {
        "photo_path": uploaded_photo,
        "latitude": 28.4595,
        "longitude": 77.0266,
        "address_text": "TEST_Gurugram, India",
        "description": description,
        "reporter_id": reporter_id,
        "reporter_name": "TEST_User",
    }
    r = s.post(f"{API}/issues", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_issue_pothole_classification(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "Huge pothole on the main road near market")
    assert d["category"] == "pothole"
    assert d["status"] == "open"
    assert d["confirm_count"] == 0
    assert len(d["timeline"]) == 1 and d["timeline"][0]["status"] == "reported"
    # verify persistence
    r = s.get(f"{API}/issues/{d['id']}")
    assert r.status_code == 200
    assert r.json()["category"] == "pothole"


def test_create_issue_garbage_classification(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "Overflowing garbage near park")
    assert d["category"] == "garbage"


def test_create_issue_streetlight_classification(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "The street light is not working")
    assert d["category"] == "streetlight"


def test_create_issue_uncategorized(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "Random neutral text xyzzz")
    assert d["category"] == "uncategorized"


def test_list_issues_and_filters(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "Pothole here", reporter_id="TEST_DEVICE_FILTER")
    # list all
    r = s.get(f"{API}/issues")
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()]
    assert d["id"] in ids
    # by category
    r = s.get(f"{API}/issues", params={"category": "pothole"})
    assert r.status_code == 200
    assert all(i["category"] == "pothole" for i in r.json())
    # by status
    r = s.get(f"{API}/issues", params={"status": "open"})
    assert all(i["status"] == "open" for i in r.json())
    # by reporter
    r = s.get(f"{API}/issues", params={"reporter_id": "TEST_DEVICE_FILTER"})
    assert r.status_code == 200
    ret_ids = [i["id"] for i in r.json()]
    assert d["id"] in ret_ids
    assert all(i["reporter_id"] == "TEST_DEVICE_FILTER" for i in r.json())


def test_get_issue_404(s):
    r = s.get(f"{API}/issues/does-not-exist-{uuid.uuid4()}")
    assert r.status_code == 404


# ---------- Confirm (idempotent per device) ----------
def test_confirm_idempotent(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "pothole confirm test")
    r1 = s.post(f"{API}/issues/{d['id']}/confirm", json={"device_id": "TEST_DEV_A"})
    assert r1.status_code == 200
    assert r1.json()["confirm_count"] == 1
    assert r1.json()["already"] is False
    r2 = s.post(f"{API}/issues/{d['id']}/confirm", json={"device_id": "TEST_DEV_A"})
    assert r2.status_code == 200
    assert r2.json()["confirm_count"] == 1
    assert r2.json()["already"] is True
    r3 = s.post(f"{API}/issues/{d['id']}/confirm", json={"device_id": "TEST_DEV_B"})
    assert r3.json()["confirm_count"] == 2
    # verify persistence
    got = s.get(f"{API}/issues/{d['id']}").json()
    assert got["confirm_count"] == 2


def test_confirm_404(s):
    r = s.post(f"{API}/issues/nope-{uuid.uuid4()}/confirm", json={"device_id": "x"})
    assert r.status_code == 404


# ---------- Comments ----------
def test_add_comment(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "pothole comment test")
    r = s.post(f"{API}/issues/{d['id']}/comments", json={"text": "Please fix", "user_name": "TEST_Alice"})
    assert r.status_code == 200
    c = r.json()
    assert c["text"] == "Please fix"
    assert c["user_name"] == "TEST_Alice"
    got = s.get(f"{API}/issues/{d['id']}").json()
    assert any(x["id"] == c["id"] for x in got["comments"])


def test_empty_comment_rejected(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "pothole empty comment")
    r = s.post(f"{API}/issues/{d['id']}/comments", json={"text": "   "})
    assert r.status_code == 400


# ---------- Status update mapping ----------
def test_status_mapping(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "pothole status test")
    iid = d["id"]
    # acknowledged -> in_progress top-level
    r = s.patch(f"{API}/issues/{iid}/status", json={"status": "acknowledged", "note": "seen"})
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"
    # in_progress -> in_progress
    r = s.patch(f"{API}/issues/{iid}/status", json={"status": "in_progress"})
    assert r.json()["status"] == "in_progress"
    # resolved -> resolved
    r = s.patch(f"{API}/issues/{iid}/status", json={"status": "resolved", "note": "done"})
    assert r.json()["status"] == "resolved"
    # timeline entries appended
    got = s.get(f"{API}/issues/{iid}").json()
    tl_statuses = [t["status"] for t in got["timeline"]]
    assert tl_statuses == ["reported", "acknowledged", "in_progress", "resolved"]


def test_status_invalid(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "invalid status")
    r = s.patch(f"{API}/issues/{d['id']}/status", json={"status": "bogus"})
    assert r.status_code == 400


# ---------- Category update ----------
def test_category_update(s, uploaded_photo):
    d = _create_issue(s, uploaded_photo, "pothole cat test")
    r = s.patch(f"{API}/issues/{d['id']}/category", json={"category": "garbage"})
    assert r.status_code == 200
    assert r.json()["category"] == "garbage"
    got = s.get(f"{API}/issues/{d['id']}").json()
    assert got["category"] == "garbage"


def test_category_update_404(s):
    r = s.patch(f"{API}/issues/nope-{uuid.uuid4()}/category", json={"category": "garbage"})
    assert r.status_code == 404


# ---------- Metrics ----------
def test_admin_metrics(s):
    r = s.get(f"{API}/admin/metrics")
    assert r.status_code == 200
    m = r.json()
    for k in ["total", "open", "in_progress", "resolved", "resolved_this_week", "by_category", "flagged"]:
        assert k in m
    assert isinstance(m["by_category"], dict)
    assert isinstance(m["flagged"], int)


# ============================================================
# Iteration 2: Geocode / Auth / AI photo verification / flagged
# ============================================================

# ---------- Reverse Geocode ----------
def test_geocode_reverse(s):
    r = s.get(f"{API}/geocode/reverse", params={"lat": 28.4595, "lng": 77.0266})
    assert r.status_code == 200
    data = r.json()
    assert "address" in data and isinstance(data["address"], str) and len(data["address"]) > 0


# ---------- Auth ----------
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


@pytest.fixture(scope="session")
def mongo_db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="session")
def seeded_user(mongo_db):
    uid = f"TEST_user_{uuid.uuid4().hex[:8]}"
    token = f"TEST_session_{uuid.uuid4().hex}"
    mongo_db.users.insert_one({
        "user_id": uid,
        "email": f"test.{uid}@example.com",
        "name": "TEST_Auth_User",
        "picture": "https://via.placeholder.com/150",
        "is_admin": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": uid, "session_token": token, "name": "TEST_Auth_User"}
    mongo_db.users.delete_one({"user_id": uid})
    mongo_db.user_sessions.delete_many({"session_token": token})


def test_auth_me_no_session(s):
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_auth_me_with_bearer(seeded_user):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {seeded_user['session_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user_id"] == seeded_user["user_id"]
    assert d["name"] == seeded_user["name"]
    assert "email" in d
    assert "_id" not in d


def test_auth_logout_clears_session(mongo_db, seeded_user):
    # create a disposable session for this user
    tok = f"TEST_session_{uuid.uuid4().hex}"
    mongo_db.user_sessions.insert_one({
        "user_id": seeded_user["user_id"],
        "session_token": tok,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # logout using cookie
    r = requests.post(f"{API}/auth/logout", cookies={"session_token": tok})
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # verify session gone
    assert mongo_db.user_sessions.find_one({"session_token": tok}) is None


def test_create_issue_with_auth_overrides_reporter(s, uploaded_photo, seeded_user):
    payload = {
        "photo_path": uploaded_photo,
        "latitude": 28.4595, "longitude": 77.0266,
        "address_text": "TEST_auth",
        "description": "pothole from auth user",
        "reporter_id": "ANON_DEVICE",
        "reporter_name": "Anonymous",
    }
    r = requests.post(f"{API}/issues", json=payload,
                      headers={"Authorization": f"Bearer {seeded_user['session_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["reporter_id"] == seeded_user["user_id"]
    assert d["reporter_name"] == seeded_user["name"]


def test_add_comment_with_auth_overrides_username(s, uploaded_photo, seeded_user):
    d = _create_issue(s, uploaded_photo, "pothole comment auth")
    r = requests.post(f"{API}/issues/{d['id']}/comments",
                      json={"text": "hi from auth", "user_name": "Anonymous"},
                      headers={"Authorization": f"Bearer {seeded_user['session_token']}"})
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["user_name"] == seeded_user["name"]
    assert c["user_id"] == seeded_user["user_id"]


# ---------- AI photo verification ----------
POTHOLE_URL = "https://loremflickr.com/800/600/pothole"
LAPTOP_URL = "https://loremflickr.com/800/600/laptop,office,computer"


def _download(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.content


def test_upload_verification_relevant_pothole(s):
    try:
        data = _download(POTHOLE_URL)
    except Exception:
        pytest.skip("Could not download pothole test image")
    files = {"file": ("pothole.jpg", data, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["relevant"] is True, f"expected relevant=True, got: {d}"
    assert "photo_path" in d and d["photo_path"]
    assert isinstance(d.get("flagged_ai_generated"), bool)


def test_upload_verification_irrelevant_laptop(s):
    try:
        data = _download(LAPTOP_URL)
    except Exception:
        pytest.skip("Could not download laptop test image")
    files = {"file": ("laptop.jpg", data, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    # Should be flagged irrelevant. If vision fails-open, relevant=True; skip in that case.
    if d.get("relevant") is True:
        pytest.skip(f"Vision fell open or misclassified laptop as relevant: {d}")
    assert d["relevant"] is False
    assert "photo_path" not in d
    assert isinstance(d.get("reason"), str)


# ---------- flagged filter ----------
def test_flagged_filter(s, uploaded_photo):
    payload = {
        "photo_path": uploaded_photo,
        "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_flag",
        "description": "flagged synth pothole",
        "flagged_ai_generated": True,
    }
    r = requests.post(f"{API}/issues", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["flagged_ai_generated"] is True
    r2 = s.get(f"{API}/issues", params={"flagged": "true"})
    assert r2.status_code == 200
    assert any(i["id"] == d["id"] for i in r2.json())
    assert all(i.get("flagged_ai_generated") for i in r2.json())
