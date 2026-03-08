# Deployment auf Google Cloud Run

Diese Anleitung beschreibt, wie das Spiel als Docker-Container gebaut und auf **Google Cloud Run** bereitgestellt wird.

## Voraussetzungen

Benötigt werden:

- ein Google-Cloud-Projekt
- die **Google Cloud CLI** (`gcloud`)
- Docker mit laufender Engine
- ein lokales, erfolgreich gebautes Projekt

Cloud Run kann Container-Images direkt aus **Artifact Registry** deployen. Artifact Registry nutzt dafür die `pkg.dev`-Domains. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/deploying?utm_source=chatgpt.com))

---

## Wichtige Hinweise vorab

### 1. Cloud Run erwartet `linux/amd64`

Cloud Run akzeptiert nur Container-Images, deren Manifest `linux/amd64` unterstützt. Das ist besonders wichtig, wenn lokal auf einem Apple-Silicon-Mac gebaut wird. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/container-contract?utm_source=chatgpt.com))

### 2. Der Container muss auf `PORT` lauschen

Cloud Run injiziert die Umgebungsvariable `PORT` in den Container. Der Dienst muss auf genau diesem Port HTTP-Anfragen annehmen. In diesem Projekt ist das `8080`. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/building/containers?utm_source=chatgpt.com))

### 3. Timeout für WebSockets / lange Requests

Cloud Run hat standardmäßig **300 Sekunden** Timeout und erlaubt maximal **3600 Sekunden**. Für dieses Spiel ist ein höheres Timeout sinnvoll. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/configuring/request-timeout?utm_source=chatgpt.com))

### 4. Aktueller Architekturstand

Dieses Projekt nutzt aktuell noch:

- lokale Dateipersistenz für Sessions
- lokale Asset-Speicherung
- In-Memory-Runtimes im Backend

Das ist für eine Demo okay, aber noch nicht robust gegen Neustarts oder Mehrinstanzbetrieb. Session Affinity kann helfen, ersetzt aber keinen externen Zustandsspeicher. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/deploying?utm_source=chatgpt.com))

---

## Sicherheitswarnung

Lokale Konfigurationsdateien mit sensiblen Daten, zum Beispiel WLAN-Zugangsdaten, dürfen **nicht** ins Image oder Repository gelangen.

Empfohlen:

- echte lokale Dateien in `.gitignore` aufnehmen
- dieselben Dateien zusätzlich in `.dockerignore` aufnehmen
- nur Beispiel-Dateien wie `wlan-config.example.json` versionieren

Beispiel:

```gitignore
apps/frontend/public/assets/wlan-config.json
.data
```

---

## APIs aktivieren

Im gewünschten GCP-Projekt zuerst die nötigen APIs aktivieren:

```bash
gcloud config set project birthday-game-2026

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

Cloud Run, Artifact Registry und Cloud Build sind die zentralen Bausteine für diesen Deploy-Weg. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/deploying?utm_source=chatgpt.com))

---

## Artifact Registry Repository anlegen

Falls noch kein Docker-Repository existiert:

```bash
gcloud artifacts repositories create birthday-game \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Birthday game images"
```

Container-Images werden in Artifact Registry in einem Docker-Repository gespeichert. ([docs.cloud.google.com](https://docs.cloud.google.com/artifact-registry/docs/docker?utm_source=chatgpt.com))

---

## Docker für Artifact Registry authentifizieren

Vor Push/Pull muss Docker für die Ziel-Registry authentifiziert werden:

```bash
gcloud auth login
gcloud auth configure-docker europe-west1-docker.pkg.dev
```

`gcloud auth configure-docker` richtet Docker so ein, dass Requests gegen Artifact Registry mit den Google-Credentials authentifiziert werden. ([docs.cloud.google.com](https://docs.cloud.google.com/artifact-registry/docs/docker/authentication?utm_source=chatgpt.com))

---

## Docker-Image bauen

### Für Cloud Run wichtig: `linux/amd64`

Auf Apple-Silicon-Macs muss das Image explizit für `linux/amd64` gebaut werden.

Empfohlener Build:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game/birthday-game:latest \
  --push \
  .
```

Damit wird das Image:

- für `linux/amd64` gebaut
- korrekt getaggt
- direkt nach Artifact Registry gepusht

Cloud Run verlangt ein Image, das `linux/amd64` unterstützt. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/container-contract?utm_source=chatgpt.com))

---

## Cloud Run Deploy

Wenn das Image erfolgreich in Artifact Registry liegt:

```bash
gcloud run deploy birthday-game \
  --image europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game/birthday-game:latest \
  --region europe-west1 \
  --allow-unauthenticated \
  --timeout 3600 \
  --session-affinity \
  --min-instances 1 \
  --port 8080
```

### Bedeutung der Flags

- `--allow-unauthenticated`  
  Die App ist öffentlich erreichbar.

- `--timeout 3600`  
  Erhöht das Request-Timeout auf 60 Minuten, passend für längere Verbindungen. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/configuring/request-timeout?utm_source=chatgpt.com))

- `--session-affinity`  
  Hilft dabei, dass ein Client möglichst auf derselben Instanz bleibt. Das ist nützlich, weil das Projekt aktuell noch nicht auf Firestore/Cloud Storage umgestellt ist. Session Affinity ist aber nur ein Routing-Helfer. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/deploying?utm_source=chatgpt.com))

- `--min-instances 1`  
  Hält mindestens eine Instanz warm, damit der erste Aufruf nicht kalt startet.

- `--port 8080`  
  Passt zum Container, der auf Port `8080` lauscht. Cloud Run erwartet, dass der Dienst auf dem konfigurierten `PORT` läuft. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/building/containers?utm_source=chatgpt.com))

---

## Zugriff auf die App

Nach erfolgreichem Deploy gibt `gcloud` eine `run.app`-URL zurück.

Die App wird dann über folgende URL geöffnet:

```text
https://<DEINE-CLOUD-RUN-URL>/#/board
```

Von dort aus:

- neue Session starten
- QR-Code erzeugen
- weitere Geräte über Join-Link oder QR beitreten lassen

---

## Service löschen

Falls ein fehlerhafter oder sensibler Deploy entfernt werden soll:

```bash
gcloud run services delete birthday-game --region europe-west1
```

Optional kann zusätzlich das Image aus Artifact Registry gelöscht werden.

---

## Nützliche Diagnose-Befehle

### Vorhandene Cloud-Run-Services anzeigen

```bash
gcloud run services list --region europe-west1
```

### Images in Artifact Registry anzeigen

```bash
gcloud artifacts docker images list \
  europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game
```

### Docker-Images lokal anzeigen

```bash
docker images | grep birthday-game
```

---

## Empfohlene lokale Dateien

### `.dockerignore`

```gitignore
node_modules
dist
.git
.gitignore
README.md
.data
apps/frontend/public/assets/wlan-config.json
```

### `.gitignore`

```gitignore
apps/frontend/public/assets/wlan-config.json
.data
```

---

## Spätere Verbesserung

Für eine robustere Cloud-Version sollte später umgestellt werden auf:

- **Firestore** für Sessions und Spielzustand
- **Cloud Storage** für Zeichnungen und Avatare

Dann wäre das Spiel deutlich stabiler gegen Neustarts und Mehrinstanzbetrieb. Cloud Run selbst unterstützt dieses Muster gut, aber der aktuelle dateibasierte Zustandsspeicher ist dafür noch nicht ideal. ([docs.cloud.google.com](https://docs.cloud.google.com/run/docs/deploying?utm_source=chatgpt.com))

---

## Kurzfassung

```bash
gcloud config set project birthday-game-2026

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

gcloud artifacts repositories create birthday-game \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Birthday game images"

gcloud auth login
gcloud auth configure-docker europe-west1-docker.pkg.dev

docker buildx build \
  --platform linux/amd64 \
  -t europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game/birthday-game:latest \
  --push \
  .

gcloud run deploy birthday-game \
  --image europe-west1-docker.pkg.dev/birthday-game-2026/birthday-game/birthday-game:latest \
  --region europe-west1 \
  --allow-unauthenticated \
  --timeout 3600 \
  --session-affinity \
  --min-instances 1 \
  --port 8080
```
