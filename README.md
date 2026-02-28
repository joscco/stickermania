# Birthday Sandbox Grid (MVP)

A tiny party-ready sandbox prototype:
- **Grid world** that everyone sees
- Players can **place items** from a list
- Anyone can **reset** the world (for now)
- A **Board view** for the beamer (read-only)
- Realtime sync via **WebSocket**

## Quick start (local dev)

Requirements:
- Node.js 20+ (18 also works in most cases)

In one terminal:

```bash
npm install
npm run dev
```

Then open:
- Player UI: http://localhost:5173/#/player
- Board UI (beamer): http://localhost:5173/#/board

Backend WebSocket runs at:
- ws://localhost:3001

## Build & run (production-ish)

```bash
npm install
npm run build
npm run start
```

- Frontend build output: `apps/frontend/dist`
- Backend: `apps/backend/dist`

### One-command production run
This repo includes a simple script that serves the built frontend and runs the backend:

```bash
npm run start:prod
```

Then open http://localhost:3001 (backend serves the static frontend in prod mode).

## Notes

- State is kept **in-memory** (and also written to a JSON file for convenience).
- No sessions/auth yet (as requested). For a party, we can add a simple admin secret later.
- Protocol is intentionally dead-simple: server broadcasts full state on every change.

Have fun ✨
