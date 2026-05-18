# K2

A private "climbing twitter" for a small friend group of indoor boulderers. Log your sessions, react to your friends' climbs, see who's planning to go to the gym this week, track the projects you're working on.

It's invite-only — only emails on an allowlist can sign in.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind v4, React Router v7 |
| Backend | Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic) |
| Database | SQLite (single file on disk) |
| Auth | Google OAuth via Authlib, sessions via Flask-Login |
| Media | Local filesystem at `backend/media/`, served by Flask |
| Image handling | Pillow for upload validation |

No external services besides Google OAuth — everything runs locally.

---

## How it works

The frontend (React SPA) and backend (Flask JSON API) are two separate apps that talk over HTTP:

```
   ┌──────────────────────┐       JSON / multipart       ┌──────────────────────┐
   │  React (port 5173)   │  ───────────────────────►   │  Flask (port 8000)   │
   │  Vite dev server     │  ◄───────────────────────   │  SQLite + media/     │
   └──────────────────────┘                              └──────────────────────┘
            ▲
            │  Sign in with Google
            ▼
   ┌──────────────────────┐
   │  Google OAuth        │
   └──────────────────────┘
```

- **Auth**: user clicks "Sign in with Google" → Google → Flask callback validates them, checks if their email is on the invite allowlist, finds-or-creates a `User` row, sets a session cookie.
- **Posts**: photos upload as multipart to `/api/posts`, saved at `media/<user_id>/<uuid>.jpg`. Feed reads via `/api/posts`.
- **Reactions, projects, plans, notifications**: separate REST endpoints; the frontend keeps local state in sync via response payloads.
- **Admin**: a flag on the User row gates `/api/admin/*` routes (invite allowlist + gym management).

Full feature list and deferred items are in `MEMORY.md`-style project notes (out of repo). The short version:

- ✓ Posts (create, feed, edit, delete, permalinks)
- ✓ Emoji reactions
- ✓ Per-user profile with stats + grade pyramids
- ✓ Projects with status, 30-day soft-expire, in-flow creation
- ✓ Intent board: who's climbing when, with join/leave
- ✓ Notifications (reactions to your posts, joins on your plans)
- ✓ Admin: invite allowlist + gym management
- ✓ Dark mode (manual toggle + system preference)
- ✓ Mobile responsive with bottom-tab navigation

---

## Repository layout

```
K2/
├── README.md
├── frontend/                       React + Vite + Tailwind
│   ├── src/
│   │   ├── api.js                  Fetch helpers
│   │   ├── theme.js                Light/dark theme management
│   │   ├── App.jsx                 Router + auth state
│   │   ├── main.jsx
│   │   ├── components/             PostCard, ProjectCard, PlanCard, …
│   │   └── pages/                  Login, Home, Profile, Plans, Admin, …
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── backend/                        Flask
    ├── app.py                      Routes + payload helpers
    ├── models.py                   SQLAlchemy models
    ├── migrations/                 Alembic migration history
    ├── requirements.txt
    └── .env                        Secrets (NOT committed)
```

At runtime the backend also creates:
- `backend/app.db` — SQLite database
- `backend/media/` — uploaded photos
- `backend/.venv/` — Python virtualenv

All three are gitignored.

---

## Setup

### Prerequisites

You'll need:

- **Python 3.12+**
- **Node.js 20+**
- A **Google Cloud project** with an OAuth Web Application client (free)

#### macOS

```bash
# Homebrew is the easiest way
brew install python@3.12 node
```

#### Linux (Debian / Ubuntu)

```bash
sudo apt update
sudo apt install python3.12 python3.12-venv python3-pip
# Node: install nvm and use it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell, then:
nvm install 20
```

#### Windows

Easiest path is via [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):

```powershell
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
```

All commands below assume a Unix-style shell (Git Bash on Windows works, or use WSL).

### 1. Clone

```bash
git clone https://github.com/maplesyrup-0606/K2.git
cd K2
```

### 2. Create a Google OAuth client

You need one to let users sign in. One-time setup:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or use an existing one)
3. **Credentials → Create credentials → OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs — add:
   ```
   http://localhost:8000/api/auth/google/callback
   ```
6. Save and copy the **Client ID** and **Client secret**

### 3. Backend setup

```bash
cd backend

# Virtualenv
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Dependencies
pip install -r requirements.txt

# Create .env (paste your Google credentials)
cat > .env <<EOF
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
FLASK_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
EOF

# Create the database
flask --app app db upgrade
```

Now seed yourself into the invite allowlist (otherwise sign-in will 403):

```bash
sqlite3 app.db "INSERT INTO inviteallowlist (email, created_at) VALUES ('your.email@gmail.com', datetime('now'));"
```

After your first successful sign-in, promote yourself to admin so you can use the `/admin` page:

```bash
sqlite3 app.db "UPDATE users SET is_admin = 1 WHERE email = 'your.email@gmail.com';"
```

### 4. Frontend setup

In a separate terminal:

```bash
cd frontend
npm install
```

### 5. Run

Backend (in `backend/` with the venv activated):

```bash
flask --app app run --debug --port 8000
```

Frontend (in `frontend/`):

```bash
npm run dev
```

Visit **http://localhost:5173**.

### Notes

- **Port 8000 for the backend, not 5000**: macOS reserves 5000 for AirPlay Receiver.
- **Run the backend via `flask --app app run`, not `python app.py`**: avoids a circular-import quirk in the way `app.py` and `models.py` reference each other.
- **First-time sign-in**: after Google OAuth completes, you'll briefly land on a 404 on the backend's `/` — that's the OAuth redirect target — then the frontend's auth-state will pick you up.
- **CORS**: backend allows requests from `http://localhost:5173`. If you change either port, update `CORS(...)` in `backend/app.py` accordingly.

---

## Day-to-day

### Apply schema changes

After editing `backend/models.py`:

```bash
cd backend
flask --app app db migrate -m "describe the change"
flask --app app db upgrade
```

### Inspect the database

```bash
sqlite3 backend/app.db ".tables"
sqlite3 backend/app.db "SELECT id, username FROM users;"
```

### Seed gyms (or do it from the admin page once you're admin)

```bash
sqlite3 backend/app.db \
  "INSERT INTO gyms (name, created_at) VALUES ('Progression', datetime('now'));"
```

### Reset everything

```bash
cd backend
rm app.db
rm -rf media
flask --app app db upgrade
```
