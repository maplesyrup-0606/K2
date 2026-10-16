# K2

A climbing log for indoor boulderers, built as an installable PWA. Log every climb with a photo, grade, outcome and attempts. Climbs are grouped into **sessions** (one day of climbing), so your profile reads as a history of days rather than a pile of posts. Follow other climbers, react and comment, plan gym trips together, and track your progress over time.

---

## Features

- **Sessions.** Every climb you log on the same day forms one session. A session has a date, a gym, the day's hardest send, totals (climbs, sends, flashes) and its climbs stacked in order.
  - You can pick which climb is the session cover. Without a pick, the cover is the highest-graded climb of the day, sent or not.
  - The hardest send is ranked within the V scale first. Ties go to sent over project-ing over gave up, then to fewer attempts. Comp grades only lead a day with no V climbs.
  - Project-ing is an outcome on a climb, not a tracked entity. Projecting climbs never count toward a session's hardest send.
- **Profile tabs.** *Sessions* (one tile per day), *Progress* (stats and grade pyramids) and *All* (a photo wall of every climb, grouped by month).
- **Home feed.** Session cards from everyone or only the people you follow. Opening one shows the full session.
- **Climbs.** Photo, grade (V scale or comp), outcome (sent, project-ing, gave up), attempts, hold color, gym and notes. Flashes are sent climbs on the first attempt. Share any climb to an Instagram story.
- **Social.** Follow and unfollow, follower and following lists, emoji reactions, threaded comments and climber search.
- **Plans.** Say when you're heading to the gym, invite others, and join or leave plans.
- **Notifications.** In-app bell plus Web Push for reactions, comments, new followers and plan activity, with a one-time prompt after login to enable them.
- **Accounts.** Sign in with Google, Apple or email and password (with email verification and password reset). Registration is open.
- **Admin.** Gym management and admin management from the app.
- **PWA.** Installable on iOS, Android and desktop, with dark mode and mobile-first bottom navigation.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind v4, React Router v7 |
| Backend | Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic), Flask-Limiter |
| Database | SQLite |
| Auth | Google and Apple OAuth via Authlib, email and password, sessions via Flask-Login |
| Media | Local filesystem at `backend/media/`, served by nginx in production |
| Email | Gmail SMTP with an App Password |
| Push | Web Push (VAPID) via pywebpush |
| Deployment | Docker Compose, nginx, gunicorn |
| Hosting | Tailscale Funnel (public HTTPS, no port forwarding needed) |
| PWA | vite-plugin-pwa and Workbox |

---

## Architecture

### Development

```
Browser (https://<your-ts-hostname>:5173)
   │
   ▼
Vite dev server :5173       ← serves React, proxies /api/* and /media/*
   │
   ▼
Flask dev server :5000      ← API + backend/dev.db
```

### Production

```
Internet
   │ HTTPS (Tailscale Funnel)
   ▼
https://<your-ts-hostname>
   │ HTTP :8080
   ▼
nginx container             ← serves the built React app, /media/*, proxies /api/*
   │ HTTP :5000 (internal Docker network)
   ▼
Flask/gunicorn container    ← API + backend/app.db (runs `flask db upgrade` on start)
```

Dev and prod use **separate databases**. The dev stack runs against `backend/dev.db`. `backend/app.db` is production only and is bind-mounted into the backend container.

### How sessions work

A session is never stored. It is the set of one user's posts that share a `climbed_on` date. The only stored piece is `session_covers`, the optional cover pick.

`posts.climbed_on` is the climber's **local** calendar day. The app sends the device's IANA timezone with each new post (and keeps `users.tz_name` in step with the device), and the server freezes the local day when the post is created. A late-evening climb stays on the day it happened, and a later timezone change never moves old sessions.

---

## Local development

### Prerequisites

- Python 3.12+
- Node.js 20+
- tmux (for `dev.sh`)
- A Google Cloud project with an OAuth Web Application client
- Tailscale with HTTPS certificates, if you want to reach dev from a phone

### 1. Clone

```bash
git clone https://github.com/maplesyrup-0606/K2.git
cd K2
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` (see [Environment variables](#environment-variables)):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FLASK_SECRET_KEY=...
FRONTEND_URL=https://<your-ts-hostname>:5173
OAUTH_REDIRECT_URI=https://<your-ts-hostname>:5173/api/auth/google/callback
GMAIL_APP_PASSWORD=...
```

Session cookies are marked Secure, so sign-in only works over HTTPS. Open the dev site at the exact origin in `FRONTEND_URL`, and start the login from that page. A mismatched origin fails with an `OAuthError`.

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Run

```bash
./dev.sh          # tmux session: Flask on :5000 (left), Vite on :5173 (right)
./dev.sh kill     # stop it
```

`dev.sh` points Flask at `backend/dev.db` and runs `flask db upgrade` before starting, so the dev database is created and migrated on first run. Flask runs with `--debug`, so backend changes reload automatically.

### Tests

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npm run lint && npm run build
```

Backend tests run against a throwaway SQLite database, never against `app.db` or `dev.db`.

---

## Production deployment

### Prerequisites

- Docker and Docker Compose on the server
- Tailscale installed and authenticated on the server
- Funnel enabled in the [Tailscale admin ACL](https://login.tailscale.com/admin/acls):
  ```json
  "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]
  ```
- Google OAuth client with these URIs added:
  - Redirect URI: `https://<your-ts-hostname>/api/auth/google/callback`
  - JS origin: `https://<your-ts-hostname>`

### First-time deploy

1. Create `backend/.env` with the variables below. The same file is read by the dev server and the production container, so a secret added for development is already present in production.
2. In `docker-compose.yml`, replace `goon-pod.tail26570e.ts.net` with your Tailscale hostname in `FRONTEND_URL` and `OAUTH_REDIRECT_URI`.
3. Run `./deploy.sh`.

### Deploying updates

```bash
./backup.sh      # always, before a deploy that carries a migration
./deploy.sh
```

`deploy.sh` rebuilds both containers from the working tree, restarts them, and re-enables Tailscale Funnel. The backend container runs `flask db upgrade` on start, so pending migrations apply as part of the deploy. The database and uploaded media are mounted as volumes and survive rebuilds.

Because the service worker caches aggressively, users may need to clear the site's cache to see a new frontend.

### Backups

`./backup.sh` takes a hot-safe SQLite backup of `backend/app.db` plus a snapshot of `backend/media/` into `backups/`, keeping the latest 30. Schedule it with cron (for example every 6 hours), and run it by hand before any deploy that carries a migration.

### Environment variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `OAUTH_REDIRECT_URI` | Google OAuth callback URL |
| `APPLE_CLIENT_ID` | Apple Services ID. Optional. The Apple button stays hidden on the frontend unless `VITE_APPLE_ENABLED=true` |
| `APPLE_CLIENT_SECRET` | ES256 JWT client secret for Apple. Generate it with `backend/scripts/generate_apple_client_secret.py`. It expires in about 6 months and must be re-generated to rotate |
| `APPLE_OAUTH_REDIRECT_URI` | Apple OAuth callback URL |
| `FLASK_SECRET_KEY` | Signs sessions and the email-verification and password-reset tokens |
| `FRONTEND_URL` | Public frontend URL, also used for CORS |
| `GMAIL_APP_PASSWORD` | Gmail App Password for verification, password-reset and invite emails |
| `GMAIL_FROM` | Sender address for those emails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push signing keys |
| `VAPID_CLAIMS_EMAIL` | Contact address included in push requests |
| `K2_DATABASE_URI` | Overrides the database location. Set by `dev.sh` to `backend/dev.db` |

---

## Repository layout

```
K2/
├── README.md
├── dev.sh                          Local dev stack (tmux: Flask + Vite) on dev.db
├── deploy.sh                       Production deploy (rebuild, restart, Funnel)
├── backup.sh                       Hot SQLite + media backup into backups/
├── docker-compose.yml              Backend + frontend containers
├── nginx.conf                      Static files, /media, and the /api proxy
├── frontend/
│   ├── Dockerfile                  Multi-stage: builds React, serves via nginx
│   ├── vite.config.js              Vite + Tailwind + PWA + dev proxy
│   └── src/
│       ├── App.jsx                 Router, auth state, timezone sync
│       ├── api.js                  Fetch helpers (relative URLs, proxied in dev)
│       ├── sw.js                   Service worker (precache + push)
│       ├── components/             PostCard, SessionCards, PhotoWall, StatsPanel, …
│       ├── lib/                    sessionFormat, push, draftStorage, imageAspect, …
│       └── pages/                  Home, Profile, SessionPage, PostPage, Composer, Plans, …
└── backend/
    ├── Dockerfile                  Python + gunicorn; runs migrations on start
    ├── app.py                      App factory: config, extensions, blueprints
    ├── extensions.py               db, migrate, login manager, oauth
    ├── models.py                   SQLAlchemy models
    ├── helpers.py                  Payload serializers and shared helpers
    ├── routes_*.py                 One blueprint per resource: auth, users, posts,
    │                               sessions, comments, plans, gyms, admin,
    │                               notifications, push, invites, media, health
    ├── migrations/                 Alembic migration history
    ├── tests/                      pytest suite
    └── .env                        Secrets (not committed)
```

---

## Day-to-day

### Apply schema changes

```bash
cd backend && source .venv/bin/activate
flask db migrate -m "describe the change"
flask db upgrade            # development: run against dev.db
```

Run `flask db upgrade` against `dev.db` as soon as you change a model. A running debug server reloads onto the new models immediately and fails until the database catches up.

### Inspect the database

```bash
sqlite3 backend/dev.db ".tables"                 # development
sqlite3 backend/app.db ".tables"                 # production (read-only habits only)
```

### View production logs

```bash
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
```

### Reset the development database

```bash
cd backend
rm dev.db
flask db upgrade
```

Never delete or reset `app.db`. It is the production database.
