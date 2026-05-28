# Stickermania

Session-basiertes Party-Spiel mit Board- und Player-Ansicht. Spieler treten per Code bei und spielen kurze Minigames auf ihren Handys; das Board zeigt Lobby, Rundenstatus und Ergebnisse.

- Gäste treten einer **Session** per QR-Code bei
- Jede Runde wird ein **Minigame** aus den registrierten Varianten gestartet
- Spieler geben ihre Minigame-Submission auf dem Handy ab
- Das Backend wertet die Runde über den Minigame-Handler aus
- Der **Player** zeigt die eigene Interaktion, das **Board** den gemeinsamen Spielzustand

---

## Modi

Die App kennt **zwei Modi**:

| | **🎉 Spiel** | **🛠️ Dev (Editoren)** |
|---|---|---|
| **Einsatz** | Party (LAN) oder Google Cloud Run | Entwicklung, Catalog, Editor-Workflows |
| **Was läuft** | Voller Game-Server + WebSocket | Backend im Dev-Modus, Angular Dev-Server, Sprite-Watch |
| **Frontend** | Board, Player | Dev Landing, Catalog, Minigame-Editor, weitere Editoren |
| **Script** | `npm run start` | `npm run dev` |

---

## Quick Start

```bash
npm install

# Konfiguration anlegen (einmalig)
cp game.config.example.json game.config.json

# Spiel-Modus — baut alles und startet den Server
npm run start

# Dev-Modus — Backend, Editoren, Catalog, Minigame-Editor und Sprite-Watch mit Hot Reload
npm run dev

# Sprite-Sheet einmalig bauen
npm run sprite
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
node wlan/wlan-qr.mjs
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

Dev-Stack mit Backend, Angular Dev-Server, Catalog, Minigame-Editor und Sprite-Watch:

```bash
npm run dev
# → http://localhost:4200                  (Dev Landing)
# → http://localhost:4200/catalog          (Screen-Katalog)
# → http://localhost:4200/minigame-editor  (Minigame-Editor)
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
LOBBY → ROUND_ACTIVE → ROUND_RESULTS → ROUND_ACTIVE → ...
```

1. **Lobby** — Spieler treten per QR-Code bei, zeichnen Avatar, wählen Namen
2. **Round Active** — Das Backend wählt ein registriertes Minigame; jeder Spieler interagiert in der Player-Hülle mit der Minigame-UI
3. **Submission** — Die Player-Hülle sendet generisch `submit-minigame`; der jeweilige Minigame-Handler validiert und speichert die Payload
4. **Round Results** — Der Minigame-Handler berechnet Platzierungen, Gewinner und persönliche Ergebnisdaten
5. Zurück zu Schritt 2

Nach der Session: Im Board auf **"Alle Avatare & Rundenbilder herunterladen"** klicken, um alle Bilder als ZIP zu speichern.

---

## Minigames

Minigames sind selbstbeschreibende Module unter `minigames/<minigame-id>`.

- Varianten kommen aus `variants.ts`, nicht aus einer zentralen `minigame.config.json`
- Backend-Integration läuft über `server-handler.ts` und `minigames/registry.ts`
- Frontend-Integration läuft über `frontend-definition.ts` im jeweiligen Minigame-Ordner und `minigames/frontend-registry.ts`
- App-Shells wie Player-Hülle, Result-Screen, Catalog und Editor dürfen keine spezifische Spielelogik kennen

Details und Checkliste: [`minigames/ARCHITECTURE.md`](minigames/ARCHITECTURE.md)

Aktive Referenzspiele:

- `timer-stop`
- `estimate-opinions`

---

## Scripts

| Script | Beschreibung |
|---|---|
| `npm run start` | **Spiel-Modus**: Baut alles, startet Server (LAN auf Port 3001, Cloud auf Port 8080) |
| `npm run dev` | **Dev + HMR**: Backend-Editor-APIs, Angular-Editoren, Catalog, Minigame-Editor und Sprite-Watch |
| `npm run sprite` | Sprite-Sheet einmalig aus den Sticker-Assets bauen |
| `npm run cloud:deploy` | Quellcode an Cloud Build schicken, Image bauen & auf Cloud Run deployen |
| `npm run cloud:start` | Cloud-Run-Service hochfahren (Ingress auf `all`, min. 1 Instanz) |
| `npm run cloud:stop` | Cloud-Run-Service herunterfahren (Ingress auf `internal`, 0 Instanzen) |

> Admin-Passwort lokal: `ADMIN_PASSWORD="geheim" npm run start`

---

## Asset-Benennung

Gespeicherte Dateien in `.data/assets/<sessionId>/`:

- **Avatare**: `avatar_<spielername>_<playerId>.png`
- **Rundenbilder/Uploads**: `submission_<spielername>_<task>_<submissionId>.png`

Spieler- und Task-Namen werden sanitiert (Sonderzeichen → `_`, max. 60 Zeichen). Die IDs am Ende verhindern Namenskollisionen.

---

## Dev-Preview

Der Dev-Stack startet lokale Werkzeuge für UI- und Minigame-Arbeit:

- **Dev Landing**: `http://localhost:4200`
- **Catalog**: `http://localhost:4200/catalog`
- **Minigame-Editor**: `http://localhost:4200/minigame-editor`

Der Catalog zeigt Player- und Board-Screens mit Mock-State. Der Minigame-Editor simuliert mehrere lokale Spieler und rendert die registrierten Minigame-Definitionen direkt aus `minigames/frontend-registry.ts`.

Falls Port `4200` belegt ist, kann der Angular-Dev-Server mit einem alternativen Port gestartet werden:

```bash
npm run dev -w @birthday/frontend -- --port 4201
```

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
| `POST` | `/api/sessions/:id/submission-image` | — | Einsendung-PNG hochladen |
| `GET` | `/api/sessions/:id/assets` | — | Asset-Liste für Download |
| `GET` | `/api/assets/...` | — | Avatare, Rundenbilder (statische Assets) |
| `GET` | `/api/sticker-catalog` | — | Sticker-Katalog |

## WebSocket

```
ws://HOST:PORT/ws
```

---

## Konfiguration

Die private Laufzeitkonfiguration liegt in `game.config.json`.

| Datei | Inhalt | Git |
|---|---|---|
| `game.config.example.json` | Vorlage für lokale Konfiguration | ✅ committed |
| `game.config.json` | Lokale/private Werte, aktuell vor allem `adminPassword` | ❌ gitignored |

### Erster Checkout

```bash
cp game.config.example.json game.config.json
# adminPassword in game.config.json setzen
```

Das Backend lädt `game.config.json` beim Start. Für Cloud Run kommt `adminPassword` per Env-Var, die `npm run cloud:deploy` automatisch aus der lokalen `game.config.json` liest.

Spielbare Minigame-Runden werden nicht hier konfiguriert. Sie werden aus den `variants.ts`-Dateien der Minigame-Ordner über die Minigame-Registries bereitgestellt.

### `wlan/wlan-config.json`

Optionale WLAN-Daten für den `wlan:qr`-Script:

```bash
cp wlan/wlan-config.example.json wlan/wlan-config.json
node wlan/wlan-qr.mjs  # → wlan/wlan-qr.png
```


---

## Storage

Lokale Dateien in `.data/`:
- **Sessions**: `.data/sessions/<sessionId>.json`
- **Assets**: `.data/assets/<sessionId>/avatars/`, `.data/assets/<sessionId>/submissions/`

Für Cloud: Repository-Pattern vorbereitet (`SessionRepository`, `AssetRepository`).

---

## Projektstruktur

```
├── backend/                        # Node.js (Fastify) HTTP + WebSocket Server
│   └── src/
│       ├── http/                   # API-Routen, Auth, Editor-APIs, WebSocket
│       ├── game-modes/             # Party Game Engine und Rundenlogik
│       ├── session/                # Session-Management
│       └── infra/                  # Repository-Implementierungen
├── frontend/                       # Angular SPA
│   └── src/app/
│       ├── core/                   # Stores, Services, Guards
│       └── features/
│           ├── game/
│           │   ├── board/          # Board-Szenen
│           │   └── player/         # Player-Szenen und Player-Hülle
│           ├── catalog/            # Screen-Katalog für UI-Preview
│           └── editors/            # Dev Landing, Minigame-Editor
├── minigames/                      # Selbstbeschreibende Minigame-Module
│   ├── _shared/                    # Gemeinsame Minigame-Stage/Host-Komponenten
│   ├── timer-stop/
│   ├── estimate-opinions/
│   ├── registry.ts                 # Backend-Registry
│   ├── frontend-registry.ts        # Frontend-Registry
│   └── ARCHITECTURE.md             # Regeln für neue Minigames
├── packages/
│   └── shared/                     # Shared Types, Config-Parser
├── scripts/
│   └── dev-live.mjs                # Dev-Stack mit Backend, Frontend und Sprite-Watch
├── wlan/
│   ├── wlan-config.example.json   # WLAN-Config-Vorlage
│   └── wlan-qr.mjs               # QR-Code-Generator
├── game.config.json                # Private lokale Konfiguration
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
- **Monorepo**: npm Workspaces
