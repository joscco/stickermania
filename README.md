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

---

## Scripts

| Script | Beschreibung |
|---|---|
| `npm run party` | **Party-Modus**: Baut alles, startet Server auf Port 3001 |
| `npm run dev` | **Dev-Modus**: Baut Editoren-Frontend, startet Server (nur Editor-APIs) |
| `npm run dev:live` | **Dev + HMR**: Backend + `ng serve` parallel mit Live-Reload |
| `npm run cloud` | **Cloud**: Baut mit Cloud-Config, startet auf Port 8080 |
| `npm run screenshots` | Baut die App, startet Server, schießt Screenshots aller Screens, stoppt Server |

> Admin-Passwort: `ADMIN_PASSWORD="geheim" npm run party`

---

## Mock-Modus (Screenshots & Dev-Preview)

Das Screenshot-Feature nutzt einen schlanken **Mock-Server** (`scripts/mock-server.mjs`) statt des echten Backends. Das Frontend bleibt dabei völlig unverändert — es verhält sich exakt wie in Produktion.

**Funktionsweise:** Der gewünschte Screen wird als **Cookie** (`mock-screen=<id>`) übergeben — nicht im Session-Code. Im Frontend erscheint damit immer `MOCK` als Session-Code, kurz und sauber.

Das Screenshot-Script setzt den Cookie vor jeder Navigation; der Mock-Server liest ihn aus dem WebSocket-Upgrade-Request:

```
mock-screen=lobby-name         → Player sieht Namenseingabe
mock-screen=lobby-avatar       → Player sieht Avatar-Zeichnen
mock-screen=lobby-waiting      → Player wartet in der Lobby
mock-screen=building           → Player sieht Canvas mit Hand
mock-screen=building-no-hand   → Player sieht "Sticker austeilen"-Button
mock-screen=building-submitted → Player sieht "Eingereicht, warte..."
mock-screen=voting             → Player sieht Voting-Ansicht
mock-screen=board-voting       → Board zeigt Voting-Slideshow
...
```

Das Frontend navigiert ganz normal zu `/#/player?session=MOCK`, löst den Code per HTTP auf, verbindet per WebSocket — und der Mock-Server antwortet auf das `join`-Paket sofort mit dem passenden `session-state`.

**Kein Frontend-Code für Mock nötig.** Die gesamte Logik sitzt in:
- `scripts/mock-server.mjs` — HTTP + WebSocket, Fixture-Daten, State-Aufbau pro Screen
- `scripts/screenshots.mjs` — baut Frontend, startet Mock-Server, schießt Screenshots, stoppt Server

```bash
# Alles in einem Schritt:
npm run screenshots

# Mock-Server gegen bereits laufendes Frontend (überspringt Build):
SCREENSHOT_BASE_URL=http://localhost:3001 npm run screenshots
```

Screenshots landen in `./screenshots/`.

---

## Sticker-Canvas (Player)

### Drag-from-Hand

Sticker können per **Pointer-Drag** aus der Hand auf die Leinwand gezogen werden:

- **Ghost** erscheint in der exakt gleichen Größe wie der Sticker in der Hand
- Der Ghost zeigt den Sticker in seiner tatsächlichen Form (kein rechteckiger Rahmen, kein Scale-Down)
- **Vertikales Scrollen** in der Hand-Liste bleibt erhalten — Drag wird erst nach horizontaler Bewegung ausgelöst
- Nach dem Loslassen über der Leinwand wird der Sticker an der Abwurfposition platziert

### Touch-Interaktion auf der Leinwand

| Geste | Aktion |
|---|---|
| 1 Finger auf Sticker | Sticker auswählen & verschieben |
| 1 Finger auf leere Fläche | Lasso-Auswahl aufziehen |
| 2 Finger (beliebige Position) | Pinch → ausgewählten Sticker/Gruppe skalieren & rotieren |
| Tippen auf leere Fläche | Auswahl aufheben |

> **Pinch ohne Finger auf dem Sticker**: Sobald ein Sticker (oder eine Gruppe) ausgewählt ist, kann die 2-Finger-Geste **irgendwo** auf der Leinwand gestartet werden — der zweite Finger muss nicht auf dem Sticker landen.

### Lasso-Select

- 1 Finger auf **leere** Fläche ziehen → Lasso-Rechteck aufziehen
- Alle Sticker, die das Rechteck schneiden, werden als **Gruppe** markiert
- Gruppe lässt sich gemeinsam **verschieben** (1 Finger auf einem Gruppen-Sticker) und **transformieren** (2 Finger, pinch/rotate)
- Antippen außerhalb der Gruppe hebt die Auswahl auf

### Swap-Modal

Langer Druck (500 ms) auf einen Sticker in der Hand öffnet das Swap-Modal (solange Swaps übrig sind). Ein Sticker aus dem Modal tauscht den gedrückten Sticker in der Hand aus.

---

## Voting

### Board-Ansicht

Die Abstimmungs-Slideshow passt sich automatisch an die Anzahl der Einreichungen an:

- **Wenige Bilder** (passen alle nebeneinander ins Board): zentrierte, statische Darstellung
- **Viele Bilder** (mehr als ins Board passt): automatisch wandernde Endlos-Schleife (Marquee)

Die Entscheidung wird live per `ResizeObserver` neu berechnet — passt sich also auch bei Fenstergrößenänderungen an.

### Player-Ansicht

- Feedback (verbleibende Stimmen / alle Stimmen abgegeben) ist **klein und unauffällig im Header** untergebracht, nicht als großes Banner
- Eigene Collage ist mit einem lila Badge „Deine" markiert und kann nicht gewählt werden
- Bereits abgegebene Stimmen sind mit ⭐ markiert

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
│               ├── game/           # Sticker-Collage Spiel
│               │   ├── board/      # Board-Szenen (Lobby, Building, Voting, Results)
│               │   │               #   voting: adaptive Slideshow (statisch ↔ Marquee)
│               │   ├── player/     # Player-Szenen (Lobby, Building, Voting, Results)
│               │   │   ├── player-screen.enum.ts  # PlayerScreen & BoardScreen Enums
│               │   │   ├── canvas/ #   Sticker-Leinwand (Drag, Pinch, Lasso-Select)
│               │   │   ├── hand/   #   Sticker-Hand (Drag-Ghost, Scroll, Swap-Trigger)
│               │   │   ├── swap-modal/  # Sticker-Tausch-Modal
│               │   │   └── voting/ #   Voting-UI (Feedback im Header)
│               │   └── services/   # Sticker-Player-Service
│               ├── editors/        # Hitbox-Editor, Sticker-Editor-Test
│               └── shared/         # Animationen, gemeinsame Komponenten
├── packages/
│   └── shared/                     # Shared Types, Config-Parser
├── scripts/
│   ├── check-sticker-assets.mjs   # Asset-Validierung
│   ├── mock-server.mjs            # Leichtgewichtiger Mock-Server (HTTP + WS) für Screenshots
│   └── screenshots.mjs            # Playwright-Screenshot-Runner
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

