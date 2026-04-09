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

Die Spielkonfiguration ist auf zwei Dateien aufgeteilt:

| Datei | Inhalt | Git |
|---|---|---|
| `game.config.public.json` | Spieleinstellungen (Prompts, Timer, Handgröße, …) | ✅ committed |
| `game.config.json` | Nur `adminPassword` | ❌ gitignored |

### Erster Checkout

```bash
cp game.config.example.json game.config.json
# adminPassword in game.config.json setzen
```

Das Backend mergt beide Dateien beim Start. Für Cloud Run wird nur `game.config.public.json` ins Image kopiert — `adminPassword` kommt per Env-Var, die `npm run cloud:deploy` automatisch aus der lokalen `game.config.json` liest.

### `wlan/wlan-config.json`

Optionale WLAN-Daten für den `wlan:qr`-Script:

```bash
cp wlan/wlan-config.example.json wlan/wlan-config.json
npm run wlan:qr  # → wlan/wlan-qr.png
```


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

