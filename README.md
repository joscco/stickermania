# Birthday Draw & Search

Session-basiertes Party-Spiel im Drawful-Stil:
- Gäste treten einer **Session** per QR-Code bei
- Spieler **zeichnen Begriffe** auf ihrem Handy
- danach **suchen** sie die Zeichnungen anderer im gemeinsamen Spielfeld
- Punkte werden pro Session verfolgt

---

## Modi

Die App unterstützt **zwei Modi**:

| | **Party (LAN)** | **Cloud (öffentlich)** |
|---|---|---|
| **Typischer Einsatz** | Geburtstagsfeier, LAN-Party – alle im selben Netzwerk | Öffentlich übers Internet, z. B. via Google Cloud Run |
| **WLAN-QR** | ✅ wird angezeigt (Board + Setup-Drawer) | ❌ nie sichtbar, Daten nicht im Image |
| **Player-QR** | ✅ direkter Link (überspringt Join-Screen) | ✅ direkter Link |
| **`wlan-config.json`** | liegt im Projekt-Root, Backend liefert sie per `/api/wlan-config` ans Board | nicht vorhanden → API liefert 404 → kein WLAN-QR |
| **Script** | `npm run party` | `npm run cloud:build` / Docker |

> **Lokaler Modus** (nur localhost) wurde bewusst entfernt – wenn nur dein eigener Rechner zugreifen kann, macht ein Multiplayer-Spiel keinen Sinn.

---

## Quick start (Entwicklung)

```bash
npm install
npm run dev
```

- Board: `http://localhost:5173/#/board`
- Player: QR-Code scannen, der auf dem Board angezeigt wird

Im Dev-Modus läuft der Angular dev-server mit Proxy zum Backend.

---

## Party-Modus (LAN)

Alle Spieler befinden sich im selben WLAN. Der Host-Rechner dient als Server.

### 1. WLAN-Config anlegen (optional)

```bash
cp wlan-config.example.json wlan-config.json
```

Dann `wlan-config.json` (im Projekt-Root neben `game.config.json`) mit echten WLAN-Daten befüllen.
Das Backend lädt die Datei beim Start und stellt sie dem Board per API bereit → WLAN-QR wird automatisch angezeigt.

> ⚠️ `wlan-config.json` ist in `.gitignore` und `.dockerignore` – deine Passwörter landen weder im Repo noch im Docker-Image.

### 2. Starten

```bash
npm install
npm run party
```

Oder mit Admin-Passwort:

```bash
npm run party:admin
```

### 3. Öffnen

- Board: `http://<deine-lan-ip>:3001/#/board`
- Spieler scannen den QR-Code vom Board → werden **direkt** ins Spiel geleitet (kein Join-Screen nötig)

---

## Cloud-Modus (Google Cloud Run)

Das Spiel läuft öffentlich im Internet. **WLAN-Daten werden nie ins Docker-Image gebacken.**

### Lokal testen

```bash
npm run cloud

# Oder Docker bauen
docker build -t birthday-draw-search .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e DATA_ROOT=/tmp/birthday-data \
  birthday-draw-search
```

### Auf Cloud Run deployen

```bash
gcloud run deploy birthday-draw-search \
  --source . \
  --region europe-west3 \
  --allow-unauthenticated \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1
```

`max-instances=1` ist nötig, solange File-basiertes Storage genutzt wird.

---

## Scripts-Übersicht

| Script | Beschreibung |
|---|---|
| `npm run dev` | Entwicklung – Backend + Frontend parallel mit Hot-Reload |
| `npm run party` | **LAN-Party**: baut alles (production/party) & startet Server |
| `npm run cloud` | **Cloud lokal testen**: baut mit Cloud-Config & startet Server auf Port 8080 |

> Admin-Passwort setzen: `ADMIN_PASSWORD="master" npm run party`

---

## HTTP API

- `POST /api/sessions` → neue Session erstellen
- `GET /api/sessions/by-code/:code` → Session per Code auflösen
- `GET /api/sessions/:sessionId/state` → aktuellen State abrufen
- `POST /api/sessions/:sessionId/reset` → Session zurücksetzen
- `GET /api/assets/...` → gespeicherte Avatare und Zeichnungen
- `GET /api/wlan-config` → WLAN-Config (nur wenn `wlan-config.json` im Root vorhanden, sonst 404)

## WebSocket

Join-Message ist session-basiert:

```json
{ "type": "join", "kind": "player", "sessionId": "abcd1234", "playerId": "optional-existing-player-id" }
```

---

## Storage

Aktuell: **lokale Dateien** in `.data/`:
- Sessions: `.data/sessions/<sessionId>.json`
- Assets: `.data/assets/...`

Für eine robustere Cloud-Version können diese Adapter implementiert werden:
- `FirestoreSessionRepository`
- `CloudStorageAssetRepository`

Die App-Architektur ist dafür vorbereitet (Repository-Pattern).

---

## Projektstruktur

```
├── apps/
│   ├── backend/         # Node.js HTTP + WebSocket Server
│   └── frontend/        # Angular SPA
├── packages/
│   └── shared/          # Shared Types & Config
├── Dockerfile           # Cloud-Image (appMode=cloud, kein wlan-config)
├── game.config.json     # Spiel-Konfiguration (Prompts, Farben, Timer)
└── package.json         # Workspace-Scripts
```
