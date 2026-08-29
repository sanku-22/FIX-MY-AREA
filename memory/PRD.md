# Fix My Area — PRD

## Problem Statement
A web app for citizens to report civic issues (potholes, garbage, streetlights, water, etc.) with a photo, GPS location, and a live map. Multi-language (English/Hindi), phone-based citizen auth, and a separate admin portal with RBAC + 2FA.

## Tech Stack
- Frontend: React 19, Tailwind, i18next, MapLibre GL JS 4.7 + OpenFreeMap (Liberty style), supercluster
- Backend: FastAPI, Motor (MongoDB), PyOTP
- Integrations: Twilio Verify (demo mode), Google Gemini image verify (Emergent LLM fallback), Nominatim geocoding (server-side)

## Architecture
- /app/backend: server.py (routes/DB), gemini_verify.py, phone_auth.py, security.py
- /app/frontend: components (MapView.jsx, ReportWizard.jsx, ...), pages (MapHome.jsx, AdminPortal.jsx), i18n, lib (api.js)

## Key Endpoints
- Auth: POST /api/auth/phone/start|verify, /api/auth/profile, GET /api/auth/me
- Admin: POST /api/admin/login, /api/admin/2fa/verify (+ RBAC data routes)
- Issues: POST /api/upload, POST /api/issues, GET /api/issues, POST /api/issues/{id}/confirm
- Geocode: GET /api/geocode/reverse, GET /api/geocode/search (Nominatim forward, IN, min 3 chars)

## Implemented
- 2026-06: Full MVP (auth, wizard, admin, AI verify, i18n) — prior sessions
- 2026-06 (this session): **Migrated map Leaflet → MapLibre GL JS + OpenFreeMap Liberty.**
  - MapView.jsx rewritten with proper lifecycle (useRef/useEffect + map.remove() cleanup, ResizeObserver).
  - Marker clustering via supercluster (.cf-cluster), custom SVG status pins (.cf-pin), user dot (.cf-userdot).
  - Click-to-place + draggable pin; recenter/locate-me; filter-based dark mode (CSS filter on .maplibregl-canvas only).
  - NEW debounced (500ms) Nominatim location search in ReportWizard Step 2 (backend GET /api/geocode/search).
  - Verified via testing agent iteration_6: 11/11 frontend behaviors pass, zero re-init/memory-leak errors.

## Backlog
- P2: Admin Review Queue screen for photos that fail AI verification
- P2: Auto category selection from Gemini JSON output
- P3 (cosmetic): Brand title wraps on <400px when logged-in user pill present (TopControls)
- P3: Diff markers by id instead of full re-render on moveend (perf for large datasets)

## Phone Auth (MSG91 OTP Widget)
- 2026-06: Integrated MSG91 OTP Widget into existing citizen phone login (no redesign).
  - Frontend: `src/lib/msg91.js` loads verify.msg91.com/otp-provider.js (fallback verify.phone91.com), `exposeMethods:true`, drives existing PhoneAuth UI via window.sendOtp/verifyOtp/retryOtp. Widget ID + Widget Token from `REACT_APP_MSG91_WIDGET_ID` / `REACT_APP_MSG91_WIDGET_TOKEN`.
  - Backend: `msg91_auth.py` verifies the widget access-token via MSG91 verifyAccessToken using server-only `MSG91_AUTHKEY`; endpoint `POST /api/auth/phone/msg91` issues the existing citizen JWT cookie. Binds MSG91-verified mobile to submitted number.
  - Non-breaking: when `REACT_APP_MSG91_WIDGET_TOKEN` is empty, frontend falls back to existing demo/Twilio flow (msg91Enabled()=false).
  - Env to fill: frontend `REACT_APP_MSG91_WIDGET_TOKEN`; backend `MSG91_AUTHKEY`. (Widget ID 366843667262373335393635 already set.)

## Mocked / Demo
- Twilio OTP: DEMO mode (demo_code returned in API response) — used only when MSG91 not configured
- Gemini: falls back to Emergent LLM key when GEMINI_API_KEY absent
- AI photo verification hardened (2026-06): AI-generated rejection now requires ai_conf>=85 and ignores normal phone-photo artifacts / missing EXIF (fixed real photos being flagged as AI)
