# K2

A private climbing log for a small friend group of indoor boulderers. Log your sessions, react to your friends' climbs, see who's planning to go to the gym this week, and track the projects you're working on.

Invite-only — only emails on an allowlist can sign in. Admins manage the allowlist from the app.

---

## Features

- Posts with photos, grade, outcome, attempts
- Emoji reactions
- Per-user profile with stats and grade pyramids
- Projects with status tracking (active / sent / abandoned)
- Intent board — who's climbing when, with join/leave
- Notifications (reactions to your posts, joins on your plans)
- Admin panel — invite allowlist and gym management
- Dark mode (manual toggle + system preference)
- Mobile-first with bottom-tab navigation
- PWA — installable as a native app on iOS, Android, and desktop
- Invite emails via Resend with install instructions

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind v4, React Router v7 |
| Backend | Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic) |
| Database | SQLite |
| Auth | Google OAuth via Authlib, sessions via Flask-Login |
| Media | Local filesystem at `backend/media/`, served by Flask |
| Email | Resend |
| Deployment | Docker Compose, nginx, gunicorn |
| Hosting | Tailscale Funnel (public HTTPS, no port forwarding needed) |
| PWA | vite-plugin-pwa + Workbox |

---

## Architecture

### Development

```
Browser (localhost:5173)
   │
   ▼
Vite dev server :5173       ← serves React, proxies /api/* and /media/*
   │
   ▼
Flask dev server :5000      ← API + SQLite
   │
   ▼
Google OAuth
```

### Production

```
Internet
   │ HTTPS (Tailscale Funnel)
   ▼
https://goon-pod.tail26570e.ts.net
   │ HTTP :8080
   ▼
nginx container             ← serves built React app, proxies /api/* and /media/*
   │ HTTP :5000 (internal Docker network)
   ▼
Flask/gunicorn container    ← API + SQLite
```

---

## Local development setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- A Google Cloud project with an OAuth Web Application client

### 1. Clone

```bash
git clone https://github.com/maplesyrup-0606/K2.git
cd K2
```

### 2. Google OAuth client

1. Go to https://console.cloud.google.com/apis/credentials
2. **Credentials → Create credentials → OAuth client ID → Web application**
3. Authorized redirect URIs: `http://localhost:5173/api/auth/google/callback`
4. Authorized JavaScript origins: `http://localhost:5173`
5. Copy the Client ID and Client secret

### 3. Backend

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Create .env
cat > .env <<EOF
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
FLASK_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
FRONTEND_URL=http://localhost:5173
OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
RESEND_API_KEY=your-resend-api-key
EOF

flask db upgrade
```

Seed yourself into the invite allowlist:

```bash
python3 -c "
from app import app, db
from models import InviteAllowList
with app.app_context():
    db.session.add(InviteAllowList(email='you@gmail.com'))
    db.session.commit()
"
```

### 4. Frontend

```bash
cd frontend
npm install
```

### 5. Run

```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate
flask run --host 0.0.0.0 --port 5000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Visit **http://localhost:5173**.

After your first login, promote yourself to admin:

```bash
cd backend && source .venv/bin/activate
python3 -c "
from app import app, db
from models import User
with app.app_context():
    u = User.query.filter_by(email='you@gmail.com').first()
    u.is_admin = True
    db.session.commit()
"
```

---

## Production deployment

### Prerequisites

- Docker + Docker Compose on the server
- Tailscale installed and authenticated on the server
- Funnel enabled in the [Tailscale admin ACL](https://login.tailscale.com/admin/acls):
  ```json
  "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]
  ```
- Google OAuth client with these URIs added:
  - Redirect URI: `https://<your-ts-hostname>/api/auth/google/callback`
  - JS origin: `https://<your-ts-hostname>`

### First-time deploy

```bash
./deploy.sh
```

`deploy.sh` builds both containers, starts them, and enables Tailscale Funnel on port 8080.

### Deploying updates

```bash
./deploy.sh
```

The SQLite database and uploaded media are mounted as volumes and survive rebuilds.

### Environment variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `FLASK_SECRET_KEY` | Random secret for session signing |
| `FRONTEND_URL` | Frontend URL (overridden by docker-compose in prod) |
| `OAUTH_REDIRECT_URI` | OAuth callback URL (overridden in prod) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for invite emails |

---

## Repository layout

```
K2/
├── README.md
├── deploy.sh                       Production deploy script
├── docker-compose.yml              Orchestrates backend + frontend containers
├── nginx.conf                      nginx config — static files + API proxy
├── frontend/
│   ├── Dockerfile                  Multi-stage: builds React, serves via nginx
│   ├── src/
│   │   ├── api.js                  Fetch helpers (relative URLs, proxied in dev)
│   │   ├── theme.js                Light/dark theme management
│   │   ├── App.jsx                 Router + auth state
│   │   ├── main.jsx
│   │   ├── components/             PostCard, ProjectCard, PlanCard, …
│   │   └── pages/                  Login, Home, Profile, Plans, Admin, Install, …
│   ├── public/
│   │   ├── favicon.svg             App icon (mountain peak)
│   │   ├── icon-192.png            PWA icon
│   │   ├── icon-512.png            PWA icon
│   │   └── logo.svg                Horizontal logo lockup
│   ├── index.html
│   ├── package.json
│   └── vite.config.js              Vite + Tailwind + PWA + dev proxy
└── backend/
    ├── Dockerfile                  Python + gunicorn
    ├── app.py                      Routes + payload helpers
    ├── models.py                   SQLAlchemy models
    ├── migrations/                 Alembic migration history
    ├── requirements.txt
    └── .env                        Secrets (not committed)
```

---

## Day-to-day

### Apply schema changes

```bash
cd backend && source .venv/bin/activate
flask db migrate -m "describe the change"
flask db upgrade
```

### Inspect the database

```bash
sqlite3 backend/app.db ".tables"
sqlite3 backend/app.db "SELECT id, email, is_admin FROM users;"
```

### View production logs

```bash
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
```

### Reset everything

```bash
cd backend
rm app.db
rm -rf media
flask db upgrade
```
