# ResearchMind Cloud Web

Cloud Platform for ResearchMind. **Desktop is the research IDE**; this app only handles cloud surfaces (reports, backups, devices, team, billing, public pages).

## Data rules

- **No mock / seed data** in the client.
- All dashboard data comes from the real FastAPI backend at `backend/` (`VITE_API_BASE_URL`).
- Public / owned reports come from Cloudflare Pages Functions (`VITE_CLOUD_API_BASE_URL`).
- Empty API responses render empty states — nothing is fabricated.

## Feature scope (Cloud only)

| Area | Pages |
| --- | --- |
| Public | Landing, Pricing, Download, Blog, Docs, Report Viewer, Snapshots |
| Account | Login / Register, Profile, Devices, Settings (security prefs), API Keys shell |
| Workspace | List, members, share/invite, sync-related activity |
| Report Center | Live reports, snapshots, public links |
| Cloud | Backups, restore, activity feed, notifications, dashboard |
| SaaS | Billing, license activation, plan status |

AI chat, PDF OCR, embeddings, and local library stay on Desktop / local backend routes — not in this SPA.

## Env

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | FastAPI backend, default `http://localhost:8000/api` |
| `VITE_CLOUD_API_BASE_URL` | Report API, default `https://researchmind.pages.dev/api/v1` |
| `VITE_AUTH_REQUIRED` | `true` in production to force Firebase sign-in for `/app/*` |
| `VITE_FIREBASE_*` | Firebase Auth for real login / register |

## Develop

```bash
# terminal 1 — backend
cd backend
# run your usual FastAPI command, e.g. uvicorn main:app --reload --port 8000

# terminal 2 — web
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000

With `VITE_AUTH_REQUIRED=false` (default), `/app` works against a local backend without Firebase. Auth screens still require configured Firebase for real sign-in.

## Backend endpoints used

- `GET /workspaces`, `GET|POST /workspaces/:id/members`
- `GET|POST|DELETE /sync/devices`, `GET /activity`
- `GET|POST /backups`, `POST /backups/:name/restore`
- `GET /license/status|entitlements`, `POST /license/activate`
- `GET /stats`, `GET|PUT /settings`
- Cloud: `GET /reports/me`, `GET /reports/:id`, `GET /workspaces/:id/report`

## Build

```bash
npm run build
```
