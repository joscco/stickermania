# Birthday Sticker-Collage

Session-basiertes Party-Spiel: Spieler erstellen gemeinsam lustige Sticker-Collagen und stimmen über die besten ab.

- Gäste treten einer **Session** per QR-Code bei
- Jede Runde gibt es einen **Prompt** — Spieler bauen auf ihrem Handy eine Collage aus Stickern
- Danach wird **abgestimmt**, wer die beste Collage hat
- Der **Gewinner** wählt Prompt, Sticker-Pack und Garantie-Pack für die nächste Runde
- Sticker-Packs werden Runde für Runde **freigeschaltet**

---

## Modi

Die App kennt **drei Modi**:

| | **🎉 Party (LAN)** | **☁️ Cloud** | **🛠️ Dev (Editoren)** |
|---|---|---|---|
| **Einsatz** | Geburtstagsfeier, LAN-Party | Google Cloud Run | Sticker & Hitboxen bearbeiten |
| **Was läuft** | Voller Game-Server + WebSocket | Voller Game-Server | Nur Editor-APIs, kein WebSocket |
| **Frontend** | Board, Player, Join | Board, Player, Join | Hitbox-Editor, Sticker-Editor |
| **WLAN-QR** | ✅ wenn `wlan-config.json` vorhanden | ❌ | ❌ |
| **Script** | `npm run party` | `npm run cloud` | `npm run dev` |

---

## Quick Start

```bash
npm install

# Party-Modus (LAN) — baut alles und startet den Server
npm run party

# Dev-Modus — nur Editoren
npm run dev

# Dev mit Live-Reload (Frontend HMR + Backend)
npm run dev:live
```

### Party-Modus

1. Optional: `cp wlan-config.example.json wlan-config.json` und WLAN-Daten eintragen
2. `npm run party`
3. Board öffnen: `http://<LAN-IP>:3001/#/board`
4. Spieler scannen den QR-Code vom Board

### Dev-Modus

Nur die Editoren, kein Spiel:

```bash
npm run dev
# → http://localhost:3001/#/editor        (Sticker-Editor)
# → http://localhost:3001/#/hitbox-editor  (Hitbox-Editor)
```

Oder mit Live-Reload für Editor-Entwicklung:

```bash
npm run dev:live
# → Frontend: http://localhost:4200 (ng serve mit HMR)
# → Backend:  http://localhost:3001 (API für Hitbox-Daten)
```

### Cloud-Modus

```bash
npm run cloud
# oder via Docker
docker build -t birthday-sticker-collage .
docker run --rm -p 8080:8080 -e PORT=8080 birthday-sticker-collage
```

---

## Spielablauf

```
LOBBY → BUILDING → VOTING → RESULTS → BUILDING → …
```

1. **Lobby** — Spieler treten per QR-Code bei, zeichnen Avatar, wählen Namen
2. **Building** — Jeder bekommt eine Hand aus Stickern und baut eine Collage zum Prompt
3. **Voting** — Alle sehen die Collagen und stimmen ab (max. 3 Stimmen)
4. **Results** — Siegertreppchen + Punkte. Der Gewinner wählt:
   - 🎯 Nächsten **Prompt** (aus 3 zufälligen)
   - 🔓 Ein neues **Sticker-Pack** freischalten
   - ⭐ Ein **"Auf jeden Fall dabei"-Pack** (garantiert 1 Sticker davon in jeder Hand)
5. Zurück zu Schritt 2

---

## Scripts

| Script | Beschreibung |
|---|---|
| `npm run party` | **Party-Modus**: Baut alles, startet Server auf Port 3001 |
| `npm run dev` | **Dev-Modus**: Baut Editoren-Frontend, startet Server (nur Editor-APIs) |
| `npm run dev:live` | **Dev + HMR**: Backend + `ng serve` parallel mit Live-Reload |
| `npm run cloud` | **Cloud**: Baut mit Cloud-Config, startet auf Port 8080 |
| `npm run screenshots` | Playwright-Screenshots aller Screens in verschiedenen Viewports |

> Admin-Passwort: `ADMIN_PASSWORD="geheim" npm run party`

---

## HTTP API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/sessions` | Neue Session erstellen |
| `GET` | `/api/sessions/by-code/:code` | Session per Code finden |
| `GET` | `/api/sessions/:id/state` | Session-State abrufen |
| `POST` | `/api/sessions/:id/reset` | Session zurücksetzen |
| `DELETE` | `/api/sessions/:id` | Session löschen |
| `POST` | `/api/sessions/:id/collage-image` | Collage-PNG hochladen |
| `GET` | `/api/sticker-catalog` | Sticker-Katalog (inkl. Hitbox-Daten) |
| `GET` | `/api/hitbox-data` | Alle Hitbox-Polygone |
| `PUT` | `/api/hitbox-data/:stickerId` | Hitbox-Polygon speichern |
| `DELETE` | `/api/hitbox-data/:stickerId` | Hitbox-Polygon löschen |
| `GET` | `/api/assets/...` | Avatare, Collagen (statische Assets) |
| `GET` | `/api/wlan-config` | WLAN-Config (nur Party-Modus) |

## WebSocket

```
ws://HOST:PORT/ws
```

Join-Message:
```json
{ "type": "join", "kind": "player", "sessionId": "abc123", "playerId": "optional-id" }
```

---

## Konfiguration

### `game.config.json`

Spielparameter (Timer, Handgröße, Prompts, Sticker-Packs, Punkteverteilung etc.)

### `wlan-config.json`

Optionale WLAN-Daten für den Party-Modus (QR-Code auf dem Board):

```bash
cp wlan-config.example.json wlan-config.json
```

> ⚠️ Beide Config-Dateien mit Credentials sind in `.gitignore`.

### `hitbox-data.json`

Vom Hitbox-Editor generierte Polygon-Daten für Sticker-Hitboxen. Wird automatisch geladen und in den Sticker-Katalog gemergt.

---

## Storage

Lokale Dateien in `.data/`:
- **Sessions**: `.data/sessions/<sessionId>.json`
- **Assets**: `.data/assets/<sessionId>/avatars/`, `.data/assets/<sessionId>/collages/`

Für Cloud: Repository-Pattern vorbereitet (`SessionRepository`, `AssetRepository`).

---

## Projektstruktur

```
├── apps/
│   ├── backend/                    # Node.js (Fastify) HTTP + WebSocket Server
│   │   └── src/
│   │       ├── http/               # API-Routen (Game + Editor)
│   │       ├── session/            # Session-Management, Player, Timer
│   │       ├── game-modes/         # Sticker-Collage Engine
│   │       └── infra/              # Repository-Implementierungen
│   └── frontend/                   # Angular SPA
│       └── src/app/
│           ├── core/               # Stores, Services (WebSocket, API, Session)
│           └── features/
│               ├── board/          # Board-Shell (Header, Setup-Drawer)
│               ├── player/         # Player-Shell (Lobby, Join)
│               ├── sticker-game/   # Sticker-Collage Spiel
│               │   ├── board/      # Board-Szenen (Lobby, Building, Voting, Results)
│               │   ├── player/     # Player-Szenen (Lobby, Building, Voting, Results)
│               │   └── services/   # Sticker-Player-Service
│               ├── hitbox-editor/  # Polygon-Editor für Sticker-Hitboxen
│               ├── sticker-editor-test/  # Sticker-Canvas Testumgebung
│               └── dev-landing/    # Dev-Modus Landing Page
├── packages/
│   └── shared/                     # Shared Types, Config-Parser
├── scripts/
│   └── check-sticker-assets.mjs   # Asset-Validierung
├── game.config.json                # Spielkonfiguration
├── hitbox-data.json                # Hitbox-Polygone (generiert)
├── Dockerfile                      # Cloud-Image
└── package.json                    # Workspace-Scripts & Modi
```

---

## Technologie

- **Frontend**: Angular 21 (Standalone Components, Signals, Zoneless)
- **Backend**: Node.js + Fastify + WebSocket
- **Styling**: Tailwind CSS 4
- **Animationen**: GSAP
- **Screenshots**: Playwright
- **Monorepo**: npm Workspaces

