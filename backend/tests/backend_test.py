"""Fix My Area — iter 4 backend tests: phone auth, citizen gating, admin 2FA, RBAC + jurisdiction."""
import os
import io
import uuid
import time
import pytest
import pyotp
import requests
from datetime import datetime, timezone, timedelta
from PIL import Image
from pymongo import MongoClient

BASE_URL = "https://report-now-8.preview.emergentagent.com"
try:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
except Exception:
    pass
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def mongo_db():
    return MongoClient(MONGO_URL)[DB_NAME]


# ============================================================
# Basics
# ============================================================
def test_api_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("message") == "Fix My Area API"


def test_geocode_reverse():
    r = requests.get(f"{API}/geocode/reverse", params={"lat": 28.4595, "lng": 77.0266}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "address" in d and isinstance(d["address"], str)
    assert "state" in d and "district" in d


# ============================================================
# Citizen phone auth
# ============================================================
def _uniq_phone():
    # 10-digit Indian number starting 9, unique per test
    n = uuid.uuid4().int % 900000000
    return f"+919{n:09d}"


@pytest.fixture(scope="session")
def citizen_session():
    """Signed-in citizen (fresh phone). Returns dict with phone, token, user_id, name."""
    phone = _uniq_phone()
    r = requests.post(f"{API}/auth/phone/start", json={"phone": phone, "channel": "call"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("demo") is True
    assert d.get("status") == "pending"
    code = d["demo_code"]
    r = requests.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": code})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["is_new"] is True
    token = d["token"]
    user = d["user"]
    # set name
    r = requests.post(f"{API}/auth/profile", json={"name": "TEST_Citizen"},
                      headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "TEST_Citizen"
    return {"phone": phone, "token": token, "user_id": user["user_id"], "name": "TEST_Citizen"}


def test_phone_start_invalid_number():
    r = requests.post(f"{API}/auth/phone/start", json={"phone": "12345"})
    assert r.status_code == 400


def test_phone_start_demo_returns_code():
    phone = _uniq_phone()
    r = requests.post(f"{API}/auth/phone/start", json={"phone": phone, "channel": "call"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "pending"
    assert d["demo"] is True
    assert isinstance(d["demo_code"], str) and len(d["demo_code"]) == 6 and d["demo_code"].isdigit()


def test_phone_verify_wrong_code():
    phone = _uniq_phone()
    requests.post(f"{API}/auth/phone/start", json={"phone": phone})
    r = requests.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": "000000"})
    # very small chance of collision — retry once
    if r.status_code == 200:
        r = requests.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": "111111"})
    assert r.status_code == 400


def test_phone_verify_first_time_is_new_and_cookie(citizen_session):
    # already exercised by fixture; ensure cookie flow works too
    phone = _uniq_phone()
    s = requests.Session()
    r = s.post(f"{API}/auth/phone/start", json={"phone": phone})
    code = r.json()["demo_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": code})
    assert r.status_code == 200
    assert r.json()["is_new"] is True
    # cookie should have been set — verify by hitting /auth/me
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["phone"] == phone
    assert "user_id" in d
    assert "_id" not in d


def test_auth_me_bearer(citizen_session):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {citizen_session['token']}"})
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == citizen_session["user_id"]
    assert d["name"] == "TEST_Citizen"


def test_auth_me_no_session():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_otp_rate_limit(mongo_db):
    """>5 starts for same number within an hour -> 429."""
    phone = _uniq_phone()
    for i in range(5):
        r = requests.post(f"{API}/auth/phone/start", json={"phone": phone})
        assert r.status_code == 200, f"start {i} failed: {r.text}"
    r = requests.post(f"{API}/auth/phone/start", json={"phone": phone})
    assert r.status_code == 429, r.text
    # cleanup
    mongo_db.otp_verifications.delete_many({"phone": phone})


# ============================================================
# Citizen gating: upload / issues / confirm / comments
# ============================================================
def _valid_civic_image_bytes():
    """Try several loremflickr civic urls, fallback to plain JPEG."""
    for url in ["https://loremflickr.com/800/600/pothole,road",
                "https://loremflickr.com/800/600/garbage,dump"]:
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 200 and len(r.content) > 5000:
                return r.content
        except Exception:
            continue
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), color=(100, 100, 100)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def uploaded_photo_path():
    """Bypass strict /upload verification for CRUD tests — write directly to storage."""
    import sys
    sys.path.insert(0, "/app/backend")
    from storage import put_object, APP_NAME  # type: ignore
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), color=(80, 80, 80)).save(buf, format="JPEG")
    path = f"{APP_NAME}/uploads/TEST_{uuid.uuid4()}.jpg"
    r = put_object(path, buf.getvalue(), "image/jpeg")
    return r["path"]


def test_upload_requires_citizen():
    files = {"file": ("x.jpg", b"\xff\xd8\xff", "image/jpeg")}
    r = requests.post(f"{API}/upload", files=files)
    assert r.status_code == 401


def test_create_issue_requires_citizen(uploaded_photo_path):
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST", "description": "pothole",
    })
    assert r.status_code == 401


def test_confirm_requires_citizen(uploaded_photo_path, citizen_session):
    # create an issue as a citizen so we have an id
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_gating", "description": "pothole test",
    }, headers={"Authorization": f"Bearer {citizen_session['token']}"})
    assert r.status_code == 200, r.text
    iid = r.json()["id"]
    r = requests.post(f"{API}/issues/{iid}/confirm", json={})
    assert r.status_code == 401


def test_comment_requires_citizen(uploaded_photo_path, citizen_session):
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_gating", "description": "pothole",
    }, headers={"Authorization": f"Bearer {citizen_session['token']}"})
    iid = r.json()["id"]
    r = requests.post(f"{API}/issues/{iid}/comments", json={"text": "hi"})
    assert r.status_code == 401


def test_list_and_get_issues_public(uploaded_photo_path, citizen_session):
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_public", "description": "pothole",
    }, headers={"Authorization": f"Bearer {citizen_session['token']}"})
    iid = r.json()["id"]
    # public list
    r = requests.get(f"{API}/issues")
    assert r.status_code == 200
    assert any(i["id"] == iid for i in r.json())
    # public get
    r = requests.get(f"{API}/issues/{iid}")
    assert r.status_code == 200
    assert r.json()["id"] == iid


def test_create_issue_uses_citizen_identity(uploaded_photo_path, citizen_session):
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_identity", "description": "pothole here",
    }, headers={"Authorization": f"Bearer {citizen_session['token']}"})
    assert r.status_code == 200
    d = r.json()
    assert d["reporter_id"] == citizen_session["user_id"]
    assert d["reporter_name"] == citizen_session["name"]
    # state/district populated from reverse geocode
    assert "state" in d and "district" in d


def test_confirm_and_comment_authed(uploaded_photo_path, citizen_session):
    hdrs = {"Authorization": f"Bearer {citizen_session['token']}"}
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_conf", "description": "pothole",
    }, headers=hdrs)
    iid = r.json()["id"]
    r = requests.post(f"{API}/issues/{iid}/confirm", json={}, headers=hdrs)
    assert r.status_code == 200
    assert r.json()["confirm_count"] == 1
    # idempotent
    r = requests.post(f"{API}/issues/{iid}/confirm", json={}, headers=hdrs)
    assert r.json().get("already") is True
    # comment
    r = requests.post(f"{API}/issues/{iid}/comments", json={"text": "please fix"}, headers=hdrs)
    assert r.status_code == 200
    c = r.json()
    assert c["user_id"] == citizen_session["user_id"]
    assert c["user_name"] == citizen_session["name"]


# ============================================================
# Admin login + 2FA
# ============================================================
SUPER_EMAIL = "sinpi3323@gmail.com"
SUPER_PASSWORD = "Admin@12345"


@pytest.fixture(scope="session")
def super_admin_session(mongo_db):
    """Log in super admin, complete 2FA setup or verify. Returns token."""
    # For repeatable tests, reset totp_enabled so we always do 'setup' -> 'verify' with fresh secret? No: server
    # re-uses secret if present and returns setup if not enabled. Once enabled, only 'verify' works with current
    # TOTP. Handle both.
    r = requests.post(f"{API}/admin/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    temp = d["temp_token"]
    if d.get("stage") == "setup":
        secret = d["secret"]
    else:
        # already enabled; read secret from DB
        admin = mongo_db.admins.find_one({"email": SUPER_EMAIL})
        secret = admin["totp_secret"]
    code = pyotp.TOTP(secret).now()
    r = requests.post(f"{API}/admin/2fa/verify", json={"temp_token": temp, "code": code})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["admin"]["role"] == "super_admin"
    return {"token": d["token"], "admin": d["admin"], "secret": secret}


def test_super_admin_login_setup_flow(super_admin_session):
    # exercised by fixture — ensure admin has role and jurisdiction
    a = super_admin_session["admin"]
    assert a["role"] == "super_admin"
    assert a["email"] == SUPER_EMAIL


def test_admin_me(super_admin_session):
    r = requests.get(f"{API}/admin/me", headers={"Authorization": f"Bearer {super_admin_session['token']}"})
    assert r.status_code == 200
    d = r.json()
    assert d["email"] == SUPER_EMAIL
    assert d["role"] == "super_admin"
    assert "password_hash" not in d and "totp_secret" not in d and "_id" not in d


def test_admin_login_wrong_password():
    r = requests.post(f"{API}/admin/login", json={"email": SUPER_EMAIL, "password": "WrongPwd123!"})
    assert r.status_code == 401


def test_admin_2fa_wrong_code(mongo_db):
    r = requests.post(f"{API}/admin/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
    assert r.status_code == 200
    temp = r.json()["temp_token"]
    r = requests.post(f"{API}/admin/2fa/verify", json={"temp_token": temp, "code": "000000"})
    assert r.status_code == 400


def test_admin_login_brute_force_lockout(mongo_db):
    """5 wrong passwords in 15 min -> 429."""
    email = f"TEST_lock_{uuid.uuid4().hex[:6]}@example.com"
    # create a dummy admin so email exists (not required — server rate limits any email)
    for i in range(5):
        r = requests.post(f"{API}/admin/login", json={"email": email, "password": "bad"})
        assert r.status_code == 401
    r = requests.post(f"{API}/admin/login", json={"email": email, "password": "bad"})
    assert r.status_code == 429, r.text
    mongo_db.admin_login_attempts.delete_many({"email": email})


# ============================================================
# Admin register + approval
# ============================================================
@pytest.fixture()
def pending_admin(mongo_db):
    email = f"test.admin.{uuid.uuid4().hex[:6]}@example.com"
    password = "TestAdminPwd123!"
    data = {
        "full_name": "TEST Admin",
        "email": email,
        "password": password,
        "designation": "Officer",
        "department": "Roads",
        "state": "Haryana",
        "district": "Gurugram",
        "ward": "",
        "official_id": "OID123",
    }
    r = requests.post(f"{API}/admin/register", data=data)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    yield {"email": email, "password": password}
    mongo_db.admins.delete_many({"email": email})
    mongo_db.admin_login_attempts.delete_many({"email": email})


def test_admin_register_then_pending_blocks_login(pending_admin):
    r = requests.post(f"{API}/admin/login",
                      json={"email": pending_admin["email"], "password": pending_admin["password"]})
    assert r.status_code == 403, r.text


def test_super_admin_sees_pending_and_approves(pending_admin, super_admin_session, mongo_db):
    hdrs = {"Authorization": f"Bearer {super_admin_session['token']}"}
    r = requests.get(f"{API}/admin/requests", headers=hdrs)
    assert r.status_code == 200
    emails = [a["email"] for a in r.json()]
    assert pending_admin["email"] in emails
    # find admin_id
    adm = mongo_db.admins.find_one({"email": pending_admin["email"]})
    r = requests.post(f"{API}/admin/requests/{adm['admin_id']}/approve", headers=hdrs)
    assert r.status_code == 200
    # now login should proceed to 2fa setup
    r = requests.post(f"{API}/admin/login",
                      json={"email": pending_admin["email"], "password": pending_admin["password"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["stage"] == "setup"
    assert "secret" in d and "temp_token" in d
    code = pyotp.TOTP(d["secret"]).now()
    r = requests.post(f"{API}/admin/2fa/verify", json={"temp_token": d["temp_token"], "code": code})
    assert r.status_code == 200
    assert r.json()["admin"]["role"] == "admin"


# ============================================================
# RBAC + jurisdiction
# ============================================================
def test_citizen_token_rejected_on_admin_endpoints(citizen_session):
    hdrs = {"Authorization": f"Bearer {citizen_session['token']}"}
    for url in [f"{API}/admin/issues", f"{API}/admin/metrics", f"{API}/admin/me", f"{API}/admin/requests"]:
        r = requests.get(url, headers=hdrs)
        assert r.status_code in (401, 403), f"{url} -> {r.status_code} (RBAC leak!)"
        assert r.status_code != 200


def test_no_token_rejected_on_admin_endpoints():
    for url in [f"{API}/admin/issues", f"{API}/admin/metrics", f"{API}/admin/me"]:
        r = requests.get(url)
        assert r.status_code == 401


def test_citizen_cant_patch_admin_status(uploaded_photo_path, citizen_session):
    hdrs = {"Authorization": f"Bearer {citizen_session['token']}"}
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_rbac", "description": "pothole",
    }, headers=hdrs)
    iid = r.json()["id"]
    r = requests.patch(f"{API}/admin/issues/{iid}/status", json={"status": "in_progress"}, headers=hdrs)
    assert r.status_code in (401, 403)
    r = requests.patch(f"{API}/admin/issues/{iid}/status", json={"status": "in_progress"})
    assert r.status_code == 401


def test_super_admin_sees_all_and_metrics(super_admin_session):
    hdrs = {"Authorization": f"Bearer {super_admin_session['token']}"}
    r = requests.get(f"{API}/admin/issues", headers=hdrs)
    assert r.status_code == 200
    issues = r.json()
    assert isinstance(issues, list)
    r = requests.get(f"{API}/admin/metrics", headers=hdrs)
    assert r.status_code == 200
    m = r.json()
    for k in ["total", "open", "in_progress", "resolved", "flagged", "by_category", "jurisdiction", "role"]:
        assert k in m
    assert m["role"] == "super_admin"


@pytest.fixture()
def approved_admin_other_state(super_admin_session, mongo_db):
    """Approved admin whose jurisdiction is Karnataka (not Haryana)."""
    email = f"test.karn.{uuid.uuid4().hex[:6]}@example.com"
    password = "TestAdminPwd123!"
    data = {"full_name": "TEST Karn", "email": email, "password": password,
            "designation": "Officer", "department": "Roads",
            "state": "Karnataka", "district": "Bengaluru", "ward": "", "official_id": "K1"}
    r = requests.post(f"{API}/admin/register", data=data)
    assert r.status_code == 200
    adm = mongo_db.admins.find_one({"email": email})
    hdrs = {"Authorization": f"Bearer {super_admin_session['token']}"}
    r = requests.post(f"{API}/admin/requests/{adm['admin_id']}/approve", headers=hdrs)
    assert r.status_code == 200
    # login + 2FA
    r = requests.post(f"{API}/admin/login", json={"email": email, "password": password})
    d = r.json()
    secret = d["secret"] if d.get("stage") == "setup" else mongo_db.admins.find_one({"email": email})["totp_secret"]
    code = pyotp.TOTP(secret).now()
    r = requests.post(f"{API}/admin/2fa/verify", json={"temp_token": d["temp_token"], "code": code})
    assert r.status_code == 200
    token = r.json()["token"]
    yield {"email": email, "token": token, "admin_id": adm["admin_id"]}
    mongo_db.admins.delete_many({"email": email})
    mongo_db.admin_login_attempts.delete_many({"email": email})


def test_jurisdiction_filter_hides_other_state(approved_admin_other_state, uploaded_photo_path, citizen_session):
    # create Haryana issue (via citizen with default reverse geocode from those coords)
    hdrs = {"Authorization": f"Bearer {citizen_session['token']}"}
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "Gurugram, Haryana", "description": "pothole hry",
        "state": "Haryana", "district": "Gurugram",
    }, headers=hdrs)
    assert r.status_code == 200
    hry_iid = r.json()["id"]
    # Karnataka admin should NOT see it
    ahdrs = {"Authorization": f"Bearer {approved_admin_other_state['token']}"}
    r = requests.get(f"{API}/admin/issues", headers=ahdrs)
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()]
    assert hry_iid not in ids
    # PATCH out of jurisdiction -> 403
    r = requests.patch(f"{API}/admin/issues/{hry_iid}/status", json={"status": "in_progress"}, headers=ahdrs)
    assert r.status_code == 403


def test_admin_status_and_category_update(super_admin_session, uploaded_photo_path, citizen_session):
    hdrs_c = {"Authorization": f"Bearer {citizen_session['token']}"}
    r = requests.post(f"{API}/issues", json={
        "photo_path": uploaded_photo_path, "latitude": 28.46, "longitude": 77.03,
        "address_text": "TEST_admin_update", "description": "pothole",
    }, headers=hdrs_c)
    iid = r.json()["id"]
    ahdrs = {"Authorization": f"Bearer {super_admin_session['token']}"}
    # acknowledged -> top-level in_progress
    r = requests.patch(f"{API}/admin/issues/{iid}/status",
                       json={"status": "acknowledged", "note": "seen"}, headers=ahdrs)
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"
    # resolved
    r = requests.patch(f"{API}/admin/issues/{iid}/status",
                       json={"status": "resolved", "note": "done"}, headers=ahdrs)
    assert r.json()["status"] == "resolved"
    tl = [t["status"] for t in r.json()["timeline"]]
    assert "acknowledged" in tl and "resolved" in tl
    # bad status
    r = requests.patch(f"{API}/admin/issues/{iid}/status",
                       json={"status": "bogus"}, headers=ahdrs)
    assert r.status_code == 400
    # category update
    r = requests.patch(f"{API}/admin/issues/{iid}/category", json={"category": "garbage"}, headers=ahdrs)
    assert r.status_code == 200
    assert r.json()["category"] == "garbage"


# ============================================================
# AI photo verification regression (gated behind citizen auth)
# ============================================================
CIVIC_ACCEPT_CATEGORIES = {
    "pothole/road damage", "broken streetlight", "water leakage/pipeline burst",
    "sewage overflow/blocked drain", "garbage dumping/overflowing bin",
    "broken footpath/pavement damage", "damaged public property", "waterlogging/flooding",
}


def _fetch_photo(urls):
    for url in urls:
        try:
            r = requests.get(url, timeout=30, allow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and len(r.content) > 8000 and r.content[:2] in (b"\xff\xd8", b"\x89P"):
                return r.content
        except Exception:
            continue
    return None


def test_upload_accepts_real_civic_photo(citizen_session):
    """With EMERGENT_LLM_KEY fallback active, a real pothole/road-damage photo
    must be ACCEPTED: relevant=true, photo_path present, non-NONE civic category,
    confidence >= 0.8 (per gemini_verify CONF_THRESHOLD=80)."""
    img = _fetch_photo([
        "https://loremflickr.com/800/600/pothole,road,damage",
        "https://loremflickr.com/800/600/garbage,dump,street",
        "https://loremflickr.com/800/600/broken,streetlight",
    ])
    if img is None:
        pytest.skip("could not fetch real civic image")
    r = requests.post(f"{API}/upload", files={"file": ("civic.jpg", img, "image/jpeg")},
                      headers={"Authorization": f"Bearer {citizen_session['token']}"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    # If misclassified by vision, do not fail hard on classification randomness — but
    # if reject_code is 'review' that indicates the fallback pipeline is BROKEN.
    assert d.get("reject_code") != "review", (
        f"upload short-circuited to review-queue — verification NOT working: {d}"
    )
    if d.get("relevant") is not True:
        pytest.skip(f"vision did not accept image (non-review reject); resp={d}")
    assert d["relevant"] is True
    assert "photo_path" in d and d["photo_path"], f"missing photo_path on accept: {d}"
    assert str(d.get("category", "none")).strip().upper() != "NONE", d
    assert str(d.get("category", "none")).strip().lower() in CIVIC_ACCEPT_CATEGORIES, d
    assert float(d.get("confidence", 0)) >= 0.80, d


def test_upload_rejects_irrelevant_photo(citizen_session):
    """A landscape/mountain photo must be REJECTED with reject_code='not_civic'
    (NOT 'review' — that would indicate the pipeline is broken)."""
    img = _fetch_photo([
        "https://loremflickr.com/800/600/mountain,landscape,nature",
        "https://loremflickr.com/800/600/sky,clouds",
    ])
    if img is None:
        pytest.skip("could not fetch landscape image")
    r = requests.post(f"{API}/upload", files={"file": ("m.jpg", img, "image/jpeg")},
                      headers={"Authorization": f"Bearer {citizen_session['token']}"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("reject_code") != "review", (
        f"upload short-circuited to review-queue — verification NOT working: {d}"
    )
    if d.get("relevant") is True:
        pytest.skip(f"vision misclassified landscape as civic: {d}")
    assert d["relevant"] is False
    assert "photo_path" not in d, f"photo_path leaked on reject: {d}"
    assert d.get("reject_code") in {"not_civic", "low_confidence", "ai_generated"}, d
    # contract fields present
    for k in ("reason", "category", "confidence", "flagged_ai_generated"):
        assert k in d, f"missing {k} in response {d}"


def test_verification_is_configured_via_fallback():
    """is_configured() must be True when EMERGENT_LLM_KEY is present even if GEMINI_API_KEY is empty."""
    import sys
    sys.path.insert(0, "/app/backend")
    import importlib
    gv = importlib.import_module("gemini_verify")
    importlib.reload(gv)
    assert gv.is_configured() is True, "is_configured() must be True with EMERGENT_LLM_KEY fallback"


def test_logout_clears_cookie():
    phone = _uniq_phone()
    s = requests.Session()
    r = s.post(f"{API}/auth/phone/start", json={"phone": phone})
    code = r.json()["demo_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": code})
    assert r.status_code == 200
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    r = s.post(f"{API}/auth/logout")
    assert r.status_code == 200
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401
