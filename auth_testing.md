# Auth-Gated App Testing Playbook (Emergent Google Auth)

Login is OPTIONAL in CivicFix — browsing and reporting work without login. Login only attaches identity.

## Create Test User & Session (MongoDB)
```
use('test_database');
var userId = 'user_' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ user_id: userId, email: 'test.user.'+Date.now()+'@example.com', name: 'Test User', picture: 'https://via.placeholder.com/150', is_admin: false, created_at: new Date() });
db.user_sessions.insertOne({ user_id: userId, session_token: sessionToken, expires_at: new Date(Date.now()+7*24*60*60*1000), created_at: new Date() });
print(sessionToken); print(userId);
```

## Backend tests
- GET /api/auth/me with Authorization: Bearer <session_token> → returns user
- POST /api/auth/session with X-Session-ID header (real flow only via browser)
- POST /api/auth/logout clears session

## Browser
Set cookie session_token (httpOnly, secure, sameSite None) then navigate.

## Admin
Owner/admin account: sinpi3323@gmail.com (is_admin true). Admin dashboard at /admin visible to all in MVP but flagged issues surface there.

## Notes
- user_id is a custom UUID field; MongoDB _id excluded with {"_id":0}.
- Session token also accepted via cookie (preferred) or Authorization header fallback.
