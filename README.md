# K2 — Climbing Log

A "climbing twitter" for a small friend group of indoor boulderers. Personal climbing journeys, shared in a feed, with emoji reactions.

This README is a working log — what's built, what's next, and the things that confused me along the way.

---

## TL;DR — what we've done

**Day 1 (design): Locked the entire v1 scope.** See `.claude/projects/.../memory/project_k2.md` for the full design memory.

**Day 1 (build):**

- **Frontend skeleton** — React 19 + Vite 8 + Tailwind v4, in `frontend/`. Boots, renders a placeholder K2 landing page with a sample feed card and a floating "+" button (the FAB we designed).
- **Backend skeleton** — Flask 3 + SQLAlchemy + SQLite + Flask-Migrate, in `backend/`.
  - 5 models defined and migrated: `User`, `Post`, `Project`, `Reaction`, `InviteAllowList`.
  - SQLite DB lives at `backend/app.db`.
- **Auth: Google OAuth (via Authlib) + Flask-Login.** Sign-in round-trip works end-to-end.
- **One endpoint built so far:** `GET /api/auth/me` — returns your user info when signed in, 401 otherwise.

---

## How to run it

### Backend

```bash
cd backend
source .venv/bin/activate
flask --app app run --debug --port 8000
```

Why port 8000 and not 5000? macOS's AirPlay Receiver hijacks port 5000. Easier to use 8000 than disable AirPlay.

Why `flask --app app run` and not `python app.py`? Python loads `app.py` as `__main__`. Then `models.py` does `from app import db` — Python doesn't realize `__main__` and `app` are the same thing, so it loads `app.py` a *second* time, causing a circular import. The Flask CLI loads it as `app` cleanly the first time.

### Frontend

```bash
cd frontend
npm run dev
```

Runs on `http://localhost:5173`.

### Database

SQLite. The file is `backend/app.db`. Inspect with:

```bash
sqlite3 backend/app.db ".tables"
sqlite3 backend/app.db "SELECT * FROM users;"
```

If you change a model, generate + apply a migration:

```bash
cd backend
flask --app app db migrate -m "describe the change"
flask --app app db upgrade
```

### Secrets (`backend/.env`)

```
FLASK_SECRET_KEY=<random 64-char hex string>
GOOGLE_CLIENT_ID=<from google cloud console>
GOOGLE_CLIENT_SECRET=<from google cloud console>
```

`.env` is loaded by `python-dotenv` (called from `load_dotenv()` in `app.py`). Don't commit it.

---

## OAuth — explained from scratch

The part I was confused about. Here it is in plain language.

### The problem OAuth solves

You don't want to handle passwords. Passwords mean:
- Hashing them properly
- Storing reset flows, emailing reset links
- Worrying about breaches and credential stuffing
- Building "forgot my password" pages

OAuth says: **let someone else handle authentication, and trust them when they say "yes, this is the same person."** For us, "someone else" is Google.

### The mental model

When the user signs in with Google, three parties are involved:

1. **You** (the browser user)
2. **Our app** (the Flask backend) — the "client"
3. **Google** — the "provider"

The whole flow is: our app asks Google "please tell me who this person is, if they agree to share." Google asks you for permission, then sends our app a verified statement about who you are. We then create or look up a row in our `users` table based on that.

### The actual round-trip

In order:

1. **You** click "Sign in with Google" → your browser hits `http://localhost:8000/google/` on our app.
2. **Our app** generates a random `state` string, stores it in your session cookie (signed with `FLASK_SECRET_KEY`), and redirects you to Google's auth endpoint with a URL like:
   ```
   https://accounts.google.com/o/oauth2/v2/auth?
       response_type=code
       &client_id=<our app's ID>
       &redirect_uri=http://localhost:8000/google/auth
       &scope=openid email profile
       &state=<random string>
       &nonce=<random string>
   ```
3. **Google** sees you, recognizes you (or asks you to log in), shows you the consent screen ("K2 wants to see your email and profile"), you click Allow.
4. **Google** redirects your browser to `http://localhost:8000/google/auth?code=<one-time code>&state=<same random string>`.
5. **Our app's `/google/auth` route** runs:
   - Compares the `state` in the URL to the one in your session cookie. If they don't match → `MismatchingStateError` (CSRF protection — someone trying to hijack the flow with a forged URL).
   - Takes the `code` and trades it (via a server-to-server HTTPS call to Google) for an **id_token** that contains your user info (sub, email, name, picture).
   - Looks up the user in our DB by `google_sub` (Google's stable ID for you). If not found, checks the invite allowlist by email. If allowed, creates a row.
   - Calls `login_user(user)` (from Flask-Login) which writes a signed cookie into your browser saying "this session belongs to user #1."
   - Redirects you to `/`.
6. **Subsequent requests** carry that cookie. Flask-Login reads it, calls our `user_loader` callback which fetches the User row, and exposes `current_user` to our handlers.

### Key concepts (jargon decoded)

- **Client ID + Client Secret** — our app's ID and password with Google. Registered in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). The secret is *only* used in server-to-server calls (step 5); it never goes through the user's browser.
- **Redirect URI** — the URL Google is allowed to send the user back to. Must be **exactly** registered in Cloud Console (e.g. `http://localhost:8000/google/auth`). Security feature: prevents someone from setting up a fake site that uses our client_id to phish.
- **Scopes** — what we're asking Google for permission to see. We ask for `openid email profile`:
  - `openid` — enables OpenID Connect (the flavor of OAuth that returns user identity, not just access)
  - `email` — the user's email address
  - `profile` — name and picture
- **State** — a random one-time string we put in the session before redirecting to Google, and Google echoes back. If it doesn't match on return → reject. Protects against CSRF.
- **Code** — a short-lived one-time string Google gives the user to hand back to our app. We then exchange it (with our client_secret) for the real user info. Why this two-step dance? Because the code is visible in the user's browser URL bar (less sensitive), while the actual user info exchange happens server-to-server (more sensitive).
- **`google_sub`** — Google's permanent unique ID for this user account. We key on this, not email, because emails can change but `sub` is forever.
- **Allowlist** — our `InviteAllowList` table. After Google says "yes this is mercurymcindoe@gmail.com," we still check `is this email on our invite list?` before creating an account. This is what makes K2 a closed group.

### The two routes you keep mixing up

- **`/google/`** — start of sign-in. YOU navigate here. The app builds the URL and redirects to Google.
- **`/google/auth`** — the callback. GOOGLE redirects here after you sign in. Never visit it directly — there's no state in your session yet, so Authlib raises `MismatchingStateError`.

---

## Files

```
K2/
├── README.md                  ← you are here
├── .claude/
│   └── launch.json            ← dev server config
├── frontend/                  ← React + Vite + Tailwind
│   ├── src/App.jsx
│   ├── src/index.css          ← @import "tailwindcss";
│   ├── vite.config.js
│   └── package.json
└── backend/                   ← Flask
    ├── app.py                 ← app + routes + OAuth wiring
    ├── models.py              ← 5 SQLAlchemy models
    ├── requirements.txt
    ├── .env                   ← secrets (gitignored)
    ├── app.db                 ← SQLite
    ├── migrations/            ← Alembic
    └── .venv/                 ← virtualenv
```

---

## Where I am right now

**Working:** sign-in via Google, allowlist gating, session cookies, `/api/auth/me`.

**My user row exists** with `username: null` — the design says I should pick a username on first login. That's the next thing to build.

## Next session (in priority order)

1. **Username-selection endpoint** — `PATCH /api/users/me` to set username (validate: alphanumeric, 3–30 chars, unique). Frontend will redirect to onboarding when `username: null`.
2. **Logout endpoint** — `POST /api/auth/logout`. One-liner with `logout_user()`.
3. **Rename routes** to match the design: `/google/` → `/api/auth/google/login`, `/google/auth` → `/api/auth/google/callback`. Update the redirect URI in Google Cloud Console to match.
4. **CORS** — let `localhost:5173` (Vite) talk to `localhost:8000` (Flask). `flask-cors` is already installed.
5. **Posts API** — the core feature. `POST /api/posts` (multipart with photo), `GET /api/posts` (feed), edit, delete.
6. **Photo storage** — local `media/` folder, served at `/media/<path>`.
7. **Reactions, Users (stats), Projects** — in that order.

Then frontend wires up to it.

---

## Gotchas I hit (so I don't hit them again)

- `db.Json` is wrong — it's `db.JSON` (uppercase). Will `AttributeError`.
- `SQLALCHEMY_DATABASE_URL` is wrong — it's `SQLALCHEMY_DATABASE_URI`. Silently ignored otherwise.
- `app['SECRET_KEY'] = ...` is wrong — Flask isn't a dict. Use `app.config['SECRET_KEY'] = ...` or `app.secret_key = ...`.
- `import models` must come **after** `db = SQLAlchemy(app)` (or you get a circular import).
- Authlib v1 requires `requests` to be installed manually — it's not pulled in automatically.
- Don't run via `python app.py` — use `flask --app app run`. Otherwise circular import (see "Backend" section above).
- macOS port 5000 is owned by AirPlay Receiver. Use 8000.
- `parse_id_token(token)` requires `nonce` in modern Authlib. Use `token.get('userinfo')` instead.
- After changing port, update the redirect URI in Google Cloud Console — propagation can take a few minutes.
- Visit `/google/`, never `/google/auth` directly (state mismatch).
