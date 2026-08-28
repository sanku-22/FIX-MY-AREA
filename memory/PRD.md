# CivicFix — Product Requirements Document

## Original Problem Statement
Build **CivicFix**, a mobile-first civic issue reporting web app. Citizens report civic issues (potholes, garbage, broken streetlights, etc.) with a photo + GPS location and see all reports on a shared live map. Goal: file a report in under 30 seconds. Admin/municipal staff manage reports (status, category) via a dashboard.

## User Choices (locked)
- **No login/signup anywhere** — fully open access (browse + report + confirm + comment).
- **Photo storage**: Emergent object storage.
- **Reverse geocoding**: Nominatim / OpenStreetMap (free, no key).
- **Auto-categorization**: keyword detection from the description.
- Frontend-first focus.

## Architecture
- **Frontend**: React 19 + react-router-dom, react-leaflet + Leaflet (OSM tiles), vaul (bottom sheet), framer-motion, sonner, Tailwind. Fonts: Cabinet Grotesk (headings), Satoshi (body), IBM Plex Mono (IDs/coords).
- **Backend**: FastAPI + Motor (MongoDB). Object storage via `storage.py` (Emergent, EMERGENT_LLM_KEY).
- **DB**: MongoDB. Single `issues` collection with embedded `timeline` and `comments` arrays.

## User Personas
1. **Citizen** — reports issues, browses map, confirms/upvotes, comments, tracks own reports in My Issues.
2. **Admin / Municipal Staff** — reviews all reports, changes status/category, adds internal notes, views metrics.

## Core Requirements (static)
- Full-screen Leaflet map, colored pins by category with status-colored ring, filter chips, locate-me, list toggle.
- 3-step report wizard: Photo (required) → Location (draggable pin + Nominatim address confirm popup) → optional description → submit.
- Issue detail: hero photo, status pill, ID, category, description, address, Confirm (idempotent per device), Share, status timeline, comments.
- My Issues (per-device via localStorage device id), sortable.
- Admin dashboard `/admin`: metrics, filterable table, edit panel (status/category/note).

## Implemented (2026-06)
- [x] Full backend API: upload/files, issues CRUD, confirm (idempotent), comments, status update (with timeline), category update, admin metrics. Keyword auto-categorization.
- [x] Object storage integration for photos (verified round-trip).
- [x] Map/Home with pins, filter chips, FAB, locate-me, nearby-list bottom sheet, 15s polling.
- [x] 3-step report wizard with real photo upload + Nominatim reverse geocoding + address confirm popup.
- [x] Issue Detail with confirm/share/comments/timeline.
- [x] My Issues (device-scoped) with sort.
- [x] Admin dashboard with metrics, filters, and edit panel.
- [x] 3 seeded demo issues (pothole/garbage/streetlight).
- [x] E2E tested: 18/18 backend, 100% frontend flows.

## Backlog (prioritized)
- **P1**: Automatic photo-based category detection (image classification) — data model ready.
- **P1**: WebSocket real-time updates (currently 15s polling).
- **P2**: Image compression/resize on upload to shrink payloads.
- **P2**: Pagination on `GET /api/issues` for scale.
- **P2**: Distinct "Acknowledged" top-level status in citizen UI.
- **P2**: Area/date-range filters on admin dashboard.

## Next Tasks
- Add lightweight auth if spam becomes an issue (currently open by design).
- Photo classification extension point in `classify()` / issue creation.
