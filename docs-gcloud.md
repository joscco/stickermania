# Deployment auf Google Cloud Run

Diese Anleitung beschreibt, wie das Spiel als Docker-Container gebaut und auf **Google Cloud Run** bereitgestellt wird.

## Voraussetzungen

- ein Google-Cloud-Projekt (`birthday-game-2026`)
- **Google Cloud CLI** (`gcloud`) installiert und eingerichtet (`gcloud auth login`)

Kein lokales Docker nötig — der Build läuft auf Google Cloud Build.

---

## Wichtige Hinweise vorab

### 1. Cloud Run erwartet `linux/amd64`

Cloud Run akzeptiert nur Container-Images für `linux/amd64`. Auf Apple-Silicon-Macs muss beim Bauen die Zielplattform explizit angegeben werden.

### 2. Der Container muss auf `PORT` lauschen

Cloud Run setzt die Umgebungsvariable `PORT=8080`. Das Backend liest diese Variable automatisch aus.

### 3. Timeout für WebSockets

Cloud Run hat standardmäßig 300 Sekunden Timeout. Der Deploy-Befehl setzt `--timeout 3600` (60 Minuten) für lange Spielsitzungen.

### 4. Nur eine Instanz (`--max-instances 1`)

Das Spiel speichert Sessions und Assets **lokal im Container-Dateisystem**. Würden mehrere Instanzen gleichzeitig laufen, würden Spieler auf verschiedene Instanzen treffen und ihre Session nicht finden. Daher wird Cloud Run auf genau eine Instanz begrenzt. Das ist für Demonstrations-Sessions mit wenigen Teilnehmern völlig ausreichend.

> **Wichtig**: Wenn die Instanz neugestartet wird (z. B. nach einem neuen Deploy), sind alle laufenden Sessions verloren. Der `cloud:start` / `cloud:stop`-Zyklus ist dafür gedacht, die Instanz nur während Demonstrationen laufen zu lassen.

### 5. Passwortschutz

Der Board-Zugang ist durch ein Passwort geschützt. Es steht in der **gitignored** `game.config.json`:

```json
{ "adminPassword": "mein-sicheres-passwort" }
```

`npm run cloud:deploy` liest diesen Wert und übergibt ihn automatisch als `ADMIN_PASSWORD` Env-Var an Cloud Run — kein weiterer Schritt nötig.

Ohne gesetztes Passwort ist der Board-Zugang offen — **nicht für öffentliche Deployments empfohlen**.

---

## Sicherheitshinweise

- `game.config.json` ist in `.gitignore` — enthält nur `adminPassword`, **niemals einchecken**
- `game.config.public.json` ist committed und enthält alle Spieleinstellungen — **kein Secret darin**
- Das Docker-Image enthält nur `game.config.public.json`; `adminPassword` kommt per `ADMIN_PASSWORD` Env-Var
- `wlan/wlan-config.json` ist gitignored und nie im Image

---

## Einmalige Einrichtung

### APIs aktivieren

```bash
gcloud config set project birthday-game-2026

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### Artifact Registry Repository anlegen

```bash
gcloud artifacts repositories create birthday-game \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Stickermania images"
```


---

## Workflow: Deploy → Start → Stop

Es gibt **zwei separate Docker-Images**:

| Image | Inhalt | Wann |
|---|---|---|
| `birthday-game:latest` | Node.js Backend + Angular App | Spielbetrieb |
| `birthday-game-offline:latest` | nginx + statische Angular Offline-Seite | Wenn das Spiel nicht läuft |

---

### `npm run cloud:deploy` — Spiel-Image bauen & deployen

Baut das vollständige Spiel-Image lokal und deployt es. **Nur nach Code-Änderungen nötig.**

```bash
npm run cloud:deploy
```

---

### `npm run cloud:stop` — Spiel stoppen, Offline-Seite zeigen

Baut und deployt das Offline-Image (nginx + statische Angular-Seite). Besucher sehen eine schöne Offline-Seite statt einem Fehler.

```bash
npm run cloud:stop
```

> Dauert ~2 Minuten (Angular Build + Docker Push). Das Offline-Image ist klein und startet sofort.

---

### `npm run cloud:start` — Spiel wieder starten

Deployt das zuletzt gebaute Spiel-Image erneut. Entspricht `cloud:deploy`.

```bash
npm run cloud:start
```

---

### `npm run cloud:deploy` — Image bauen & deployen

Führt `scripts/cloud-deploy.mjs` aus, das:

1. `adminPassword` aus der lokalen `game.config.json` liest
2. Das Image **lokal** mit Docker baut (`docker build --platform linux/amd64`) — **kein Cloud Build**
3. Das Image in die Artifact Registry pushed
4. Das Image auf Cloud Run deployt und `ADMIN_PASSWORD` dabei als Env-Var setzt

```bash
npm run cloud:deploy
```

> **Voraussetzung:** Docker Desktop muss lokal laufen.

> ⚠️ **Nur nach Code-Änderungen ausführen.** Der Build dauert ~3–5 Minuten lokal.
> `cloud:start` und `cloud:stop` kosten nichts — die verändern nur Env-Vars des bereits deployt Images.

**Warum lokal statt Cloud Build?**
Cloud Build kostet Geld (E2-Maschinenzeit), auch wenn das Free Tier 120 min/Tag bietet.
Lokaler Docker-Build ist kostenlos und auf einem modernen Mac sogar schneller.
Cloud Build wird nur noch gebraucht wenn kein Docker lokal verfügbar ist (z. B. CI/CD).

Weitere Env-Vars (werden **nicht** automatisch gesetzt, können manuell ergänzt werden):

| Variable | Bedeutung | Standard |
|---|---|---|
| `ADMIN_PASSWORD` | Board-Passwort (wird automatisch gesetzt) | *(kein Passwort)* |
| `PORT` | HTTP-Port | Cloud Run setzt 8080 automatisch |
| `DATA_ROOT` | Pfad für Sessions & Assets | `.data` |

---

### `npm run cloud:start` — Vor der Demonstration

Setzt `OFFLINE_MODE=false` und startet mindestens eine Instanz:

```bash
gcloud run services update birthday-game \
  --region europe-west1 \
  --ingress all \
  --min-instances 1 \
  --set-env-vars OFFLINE_MODE=false
```

Die App ist danach öffentlich erreichbar. Beim ersten Start kann es ~30 Sekunden dauern (Cold Start).

---

### `npm run cloud:stop` — Nach der Demonstration

Setzt `OFFLINE_MODE=true`, behält aber **min-instances 1**:

```bash
gcloud run services update birthday-game \
  --region europe-west1 \
  --ingress all \
  --min-instances 1 \
  --set-env-vars OFFLINE_MODE=true
```

Statt des hässlichen Google-Fehlers „Page not found" wird die **Offline-Seite** angezeigt — eine vollwertige Angular-Komponente unter `/offline` mit dem echten App-Design (Tailwind, Darumadrop-Font, `animOnInit`-Animation).

**Warum `min-instances 1` statt 0?**

Mit einer dauerhaft laufenden Instanz passiert folgendes bei einem Request-Bombardement:
- Die eine Instanz antwortet sofort (kein Cold Start)
- `--max-instances 1` verhindert, dass weitere Instanzen starten
- Das einfache `offline.html` kann tausende Requests/Sekunde problemlos beantworten
- Keine neuen Instanzen → keine Kosten-Explosion

Die Kosten für eine dauerhaft laufende Instanz im Leerlauf sind minimal (~$0.50–2/Monat je nach Region) — deutlich günstiger als das Risiko durch ein unkontrolliertes Hochskalieren bei 0 Instanzen.

> ⚠️ Durch den Wechsel in den Offline-Modus sind alle laufenden Sessions verloren (der Container wird neu gestartet).

---

## Zugriff auf die App

Nach `cloud:start` gibt `gcloud` die URL aus. Die App ist dann unter der `run.app`-URL erreichbar:

```
https://<DEINE-CLOUD-RUN-URL>/
```

- Spieler öffnen diese URL auf ihrem Handy und geben den Session-Code ein
- Der Moderator klickt auf "Zum Board", gibt das Passwort ein und legt eine Session an

---

## Nützliche Diagnose-Befehle

```bash
# Status des Services anzeigen
gcloud run services describe birthday-game --region europe-west1

# Alle Cloud-Run-Services auflisten
gcloud run services list --region europe-west1

# Images in Artifact Registry anzeigen
gcloud artifacts docker images list \
  europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game


# Service komplett löschen (z. B. nach der Veranstaltung)
gcloud run services delete birthday-game --region europe-west1
```

---

## `.dockerignore`

```
node_modules
dist
.git
.gitignore
README.md
.data
wlan/
```

---

## Spätere Verbesserungsmöglichkeiten

Für eine robustere Cloud-Version (mehrere Instanzen, kein Datenverlust bei Restarts):

- **Firestore** für Sessions und Spielzustand
- **Cloud Storage** für Avatare und Einsendungen

Das bestehende Repository-Pattern (`SessionRepository`, `AssetRepository`) ist dafür vorbereitet — es braucht nur neue Implementierungen.
