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

Der Board-Zugang ist durch ein Passwort geschützt. Das Passwort wird in `game.config.json` unter `adminPassword` gesetzt und beim Deploy automatisch als `ADMIN_PASSWORD` Env-Var an Cloud Run übergeben:

```json
// game.config.json
{
  "adminPassword": "mein-sicheres-passwort",
  ...
}
```

Dann einfach `npm run cloud:deploy` ausführen — kein weiterer Schritt nötig.

Ohne gesetztes Passwort ist der Board-Zugang offen — **nicht für öffentliche Deployments empfohlen**.

---

## Sicherheitshinweise

- `game.config.json` ist in `.gitignore` — **niemals ins Repository einchecken**
- `wlan/wlan-config.json` ist ebenfalls gitignored
- `ADMIN_PASSWORD` (und andere Secrets) gehören als Env-Var in Cloud Run, nicht in den Code oder das Image
- Das Image enthält **keine** `game.config.json` — alle relevanten Werte kommen zur Laufzeit per Env-Var rein

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

### `npm run cloud:deploy` — Image bauen & deployen

Führt `scripts/cloud-deploy.mjs` aus, das:

1. `adminPassword` aus der lokalen `game.config.json` liest
2. Das Image via **Google Cloud Build** baut (`linux/amd64`, kein lokales Docker nötig)
3. Das Image auf Cloud Run deployt und `ADMIN_PASSWORD` dabei als Env-Var setzt

```bash
npm run cloud:deploy
```

> Beim ersten Deploy oder nach Code-Änderungen ausführen. Dauert ~3–5 Minuten.

Das Passwort wird bei **jedem** Deploy aus `game.config.json` übernommen — kein separater `gcloud run services update` Schritt nötig.

Weitere Env-Vars (werden **nicht** automatisch gesetzt, können manuell ergänzt werden):

| Variable | Bedeutung | Standard |
|---|---|---|
| `ADMIN_PASSWORD` | Board-Passwort (wird automatisch gesetzt) | *(kein Passwort)* |
| `PORT` | HTTP-Port | Cloud Run setzt 8080 automatisch |
| `DATA_ROOT` | Pfad für Sessions & Assets | `.data` |

---

### `npm run cloud:start` — Vor der Demonstration

Setzt Ingress auf `all` und startet mindestens eine Instanz:

```bash
gcloud run services update birthday-game \
  --region europe-west1 \
  --ingress all \
  --min-instances 1
```

Die App ist danach öffentlich erreichbar. Beim ersten Start kann es ~30 Sekunden dauern (Cold Start).

---

### `npm run cloud:stop` — Nach der Demonstration

Setzt Ingress auf `internal` (kein öffentlicher Zugriff mehr) und skaliert auf 0 Instanzen:

```bash
gcloud run services update birthday-game \
  --region europe-west1 \
  --ingress internal \
  --min-instances 0
```

> ⚠️ Durch das Herunterskalieren auf 0 wird der Container gestoppt — alle laufenden Sessions und gespeicherten Assets gehen verloren.

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
- **Cloud Storage** für Avatare und Collagen

Das bestehende Repository-Pattern (`SessionRepository`, `AssetRepository`) ist dafür vorbereitet — es braucht nur neue Implementierungen.
