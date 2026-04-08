# Stickermania

Session-basiertes Party-Spiel: Spieler erstellen gemeinsam lustige Sticker-Collagen und stimmen über die besten ab.

- Gäste treten einer **Session** per QR-Code bei
- Jede Runde gibt es einen **Prompt** — Spieler bauen auf ihrem Handy eine Collage aus Stickern
- Danach wird **abgestimmt**, wer die beste Collage hat
- Der **Gewinner** wählt Prompt, Sticker-Pack und Garantie-Pack für die nächste Runde
- Sticker-Packs werden Runde für Runde **freigeschaltet**

---

## Modi

Die App kennt **zwei Modi**:

| | **🎉 Spiel** | **🛠️ Dev (Editoren)** |
|---|---|---|
| **Einsatz** | Party (LAN) oder Google Cloud Run | Sticker & Hitboxen bearbeiten |
| **Was läuft** | Voller Game-Server + WebSocket | Nur Editor-APIs, kein WebSocket |
| **Frontend** | Board, Player | Hitbox-Editor, Sticker-Editor |
| **Script** | `npm run start` | `npm run dev` |

---

## Quick Start

```bash
npm install

# Konfiguration anlegen (einmalig)
cp game.config.example.json game.config.json

# Spiel-Modus — baut alles und startet den Server
npm run start

# Dev-Modus — nur Editoren
npm run dev

# Dev mit Live-Reload (Frontend HMR + Backend)
npm run dev:live
```

### Lokaler Modus

1. `npm run start`
2. Browser öffnen: `http://localhost:3001`
3. Auf "Ich bin der Moderator → Zum Board" klicken und Passwort eingeben
4. Session erstellen, QR-Code anzeigen lassen
5. Spieler öffnen dieselbe URL auf ihrem Handy und geben den Session-Code ein

**Optional: WLAN-QR-Code für Aushang generieren**

```bash
cp wlan/wlan-config.example.json wlan/wlan-config.json
# WLAN-Daten eintragen, dann:
npm run wlan:qr
# → wlan/wlan-qr.png (drucken & aufhängen)
```

### Cloud-Modus (Google Cloud Run)

Siehe [`docs-gcloud.md`](docs-gcloud.md) für die vollständige Anleitung.

```bash
# Image bauen & deployen (einmalig oder nach Änderungen)
npm run cloud:deploy

# Vor der Demonstration hochfahren
npm run cloud:start

# Nach der Demonstration runterfahren (spart Kosten)
npm run cloud:stop
```

### Dev-Modus

Nur die Editoren, kein Spiel:

```bash
npm run dev
# → http://localhost:3001/#/editor        (Sticker-Editor)
# → http://localhost:3001/#/hitbox-editor  (Hitbox-Editor)
```

---

## Board-Zugang & Passwortschutz

Die Startseite (`/`) ist für alle zugänglich: Spieler geben dort ihren Session-Code ein.

Der **"Zum Board"**-Link am unteren Rand führt zu einem Passwort-Dialog. Das Passwort wird vom Backend geprüft. Bei Erfolg setzt das Backend ein HttpOnly-Cookie — der Moderator bleibt eingeloggt, bis der Cookie abläuft oder der Container neugestartet wird.

Das Passwort wird in `game.config.json` unter `adminPassword` gesetzt. Lokal kann es auch per Umgebungsvariable überschrieben werden:

```bash
ADMIN_PASSWORD="geheim" npm run start
```

Ist kein Passwort konfiguriert (`adminPassword: null`), ist der Board-Zugang ohne Passwort möglich.

---

## Spielablauf

```
LOBBY → BUILDING → VOTING → RESULTS → BUILDING → ...
```

1. **Lobby** — Spieler treten per QR-Code bei, zeichnen Avatar, wählen Namen
2. **Building** — Jeder bekommt eine Hand aus Stickern und baut eine Collage zum Prompt
3. **Voting** — Alle sehen die Collagen und stimmen ab (max. 3 Stimmen)
4. **Results** — Siegertreppchen + Punkte. Der Gewinner wählt:
   - 🎯 Nächsten **Prompt** (aus 3 zufälligen)
   - 🔓 Ein neues **Sticker-Pack** freischalten
   - ⭐ Ein **"Auf jeden Fall dabei"-Pack** (garantiert 1 Sticker davon in jeder Hand)
5. Zurück zu Schritt 2

Nach der Session: Im Board auf **"Alle Avatare & Collagen herunterladen"** klicken, um alle Bilder als ZIP zu speichern.

---

## Scripts

| Script | Beschreibung |
|---|---|
| `npm run start` | **Spiel-Modus**: Baut alles, startet Server (LAN auf Port 3001, Cloud auf Port 8080) |
| `npm run dev` | **Dev-Modus**: Baut Editoren-Frontend, startet Server (nur Editor-APIs) |
| `npm run dev:live` | **Dev + HMR**: Backend + `ng serve` parallel mit Live-Reload |
| `npm run wlan:qr` | WLAN-QR-Code als PNG generieren (aus `wlan/wlan-config.json`) |
| `npm run cloud:deploy` | Quellcode an Cloud Build schicken, Image bauen & auf Cloud Run deployen |
| `npm run cloud:start` | Cloud-Run-Service hochfahren (Ingress auf `all`, min. 1 Instanz) |
| `npm run cloud:stop` | Cloud-Run-Service herunterfahren (Ingress auf `internal`, 0 Instanzen) |
| `npm run screenshots` | Baut die App, startet Server, schießt Screenshots aller Screens, stoppt Server |

> Admin-Passwort lokal: `ADMIN_PASSWORD="geheim" npm run start`

---

## Asset-Benennung

Gespeicherte Dateien in `.data/assets/<sessionId>/`:

- **Avatare**: `avatar_<spielername>_<playerId>.png`
- **Collagen**: `collage_<spielername>_<prompt>_<collageId>.png`

Spieler- und Prompt-Namen werden sanitiert (Sonderzeichen → `_`, max. 60 Zeichen). Die IDs am Ende verhindern Namenskollisionen.

---

## HTTP API

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/api/auth/board-login` | — | Board-Login, setzt Cookie |
| `GET` | `/api/auth/board-status` | Cookie | Cookie-Prüfung |
| `GET` | `/api/sessions` | — | Sessions auflisten |
| `POST` | `/api/sessions` | ✅ Cookie | Neue Session erstellen |
| `GET` | `/api/sessions/by-code/:code` | — | Session per Code finden |
| `GET` | `/api/sessions/:id/state` | — | Session-State abrufen |
| `POST` | `/api/sessions/:id/reset` | ✅ Cookie | Session zurücksetzen |
| `DELETE` | `/api/sessions/:id` | ✅ Cookie | Session löschen |
| `POST` | `/api/sessions/:id/collage-image` | — | Collage-PNG hochladen |
| `GET` | `/api/sessions/:id/assets` | — | Asset-Liste für Download |
| `GET` | `/api/assets/...` | — | Avatare, Collagen (statische Assets) |
| `GET` | `/api/sticker-catalog` | — | Sticker-Katalog |

## WebSocket

```
ws://HOST:PORT/ws
```

---

## Konfiguration

### `game.config.json`

Spielparameter (Timer, Handgröße, Prompts, Sticker-Packs, Punkteverteilung, `adminPassword`).

`game.config.json` ist in `.gitignore` — sie enthält lokal das Admin-Passwort. Beim ersten Checkout:

```bash
cp game.config.example.json game.config.json
# Dann adminPassword setzen und ggf. andere Werte anpassen
```

Für Cloud Run wird `game.config.json` **nicht** ins Docker-Image kopiert — `npm run cloud:deploy` liest das Passwort aus der lokalen `game.config.json` und übergibt es automatisch als `ADMIN_PASSWORD` Env-Var an Cloud Run.

### `wlan/wlan-config.json`

Optionale WLAN-Daten für den `wlan:qr`-Script:

```bash
cp wlan/wlan-config.example.json wlan/wlan-config.json
npm run wlan:qr  # → wlan/wlan-qr.png
```

> ⚠️ Beide Config-Dateien sind in `.gitignore` — die `*.example.json` Varianten sind committet.

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
│   │       ├── http/               # API-Routen (authPlugin, apiRoutes, editorApiRoutes, wsPlugin)
│   │       ├── session/            # Session-Management, Player, Timer
│   │       ├── game-modes/         # Sticker-Collage Engine
│   │       └── infra/              # Repository-Implementierungen
│   └── frontend/                   # Angular SPA
│       └── src/app/
│           ├── core/               # Stores, Services (WebSocket, API, Session, BoardAuthGuard)
│           └── features/
│               ├── game/
│               │   ├── landing/    # Startseite: Session-Code-Eingabe + Board-Login
│               │   ├── board/      # Board-Szenen (Lobby, Building, Voting, Results + Download)
│               │   └── player/     # Player-Szenen (Lobby, Building, Voting, Results)
│               └── shared/         # Animationen, gemeinsame Komponenten
├── packages/
│   └── shared/                     # Shared Types, Config-Parser
├── scripts/
│   ├── mock-server.mjs            # Mock-Server für Screenshots
│   └── screenshots.mjs            # Playwright-Screenshot-Runner
├── wlan/
│   ├── wlan-config.example.json   # WLAN-Config-Vorlage
│   └── wlan-qr.mjs               # QR-Code-Generator
├── game.config.json                # Spielkonfiguration (inkl. adminPassword)
├── hitbox-data.json                # Hitbox-Polygone
├── Dockerfile                      # Cloud-Image
└── package.json                    # Workspace-Scripts
```

---

## Technologie

- **Frontend**: Angular 21 (Standalone Components, Signals, Zoneless)
- **Backend**: Node.js + Fastify + WebSocket + @fastify/cookie
- **Styling**: Tailwind CSS 4
- **Animationen**: GSAP
- **ZIP-Download**: JSZip
- **Screenshots**: Playwright
- **Monorepo**: npm Workspaces

