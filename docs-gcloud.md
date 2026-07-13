# Google Cloud Run Deployment

Diese Anleitung beschreibt den Cloud-Modus von stickermania. Persönliche Projektwerte und Secrets werden nicht versioniert. Nutze `.env.cloud.example` als Vorlage.

## Voraussetzungen

- Google-Cloud-Projekt mit Billing
- Google Cloud CLI (`gcloud`) installiert und angemeldet
- Docker Desktop lokal laufend
- Berechtigungen für Cloud Run, Artifact Registry, Firestore und Cloud Storage

## Konfiguration

```bash
cp .env.cloud.example .env.cloud
# .env.cloud ausfüllen
set -a
source .env.cloud
set +a
```

Pflichtwerte:

| Variable | Bedeutung |
|---|---|
| `GCP_PROJECT` | Google-Cloud-Projekt-ID |
| `ADMIN_PASSWORD` | Board-Passwort für Cloud-Deployments |

Optionale Werte:

| Variable | Default |
|---|---|
| `CLOUD_REGION` | `europe-west1` |
| `CLOUD_RUN_SERVICE` | `stickermania` |
| `ARTIFACT_REPOSITORY` | Wert von `CLOUD_RUN_SERVICE` |
| `CLOUD_ASSET_BUCKET` | `${GCP_PROJECT}-${CLOUD_RUN_SERVICE}-assets` |
| `CLOUD_RUN_MAX_INSTANCES` | `1` |
| `CLOUD_RUN_CONCURRENCY` | `200` |
| `CLOUD_RUN_CPU` | `2` |
| `CLOUD_RUN_MEMORY` | `2Gi` |

`ADMIN_PASSWORD` hat keinen Default. `cloud:deploy` und `cloud:start` brechen ohne Passwort ab. Für bewusst offene Tests kann `ALLOW_EMPTY_ADMIN_PASSWORD=1` gesetzt werden; für öffentliche Deployments sollte das nicht verwendet werden.

## Einmalige Einrichtung

```bash
gcloud config set project "$GCP_PROJECT"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com
```

`npm run cloud:deploy` legt Artifact Registry, Firestore und den Asset-Bucket bei Bedarf selbst an. Manuelles Anlegen ist deshalb normalerweise nicht nötig.

## Deploy

```bash
npm run cloud:deploy
```

Das Skript:

1. konfiguriert Docker fuer die Artifact Registry
2. stellt Artifact Registry, Firestore und Cloud Storage sicher
3. baut das Docker-Image lokal fuer `linux/amd64`
4. pushed das Image in die Artifact Registry
5. deployed Cloud Run mit `SESSION_STORE=firestore` und `ASSET_STORE=gcs`

Die Cloud-Env-Vars werden über eine temporäre YAML-Datei an `gcloud` übergeben, damit das Admin-Passwort nicht in der geloggten Kommandozeile steht. Die temporäre Datei wird nach dem Deploy wieder gelöscht.

Cloud Run bekommt `--min-instances 0`, damit im Leerlauf keine warmen Instanzkosten entstehen. `--max-instances 1` ist der Default, damit WebSocket-Broadcasts einer Session auf einer Instanz bleiben.

## Start und Stop

```bash
npm run cloud:stop
npm run cloud:start
```

`cloud:stop` setzt Ingress auf `internal`, entfernt den öffentlichen Invoker und lässt `min-instances` auf `0`.

`cloud:start` deployed das zuletzt gepushte Image wieder mit öffentlichem Ingress. Nach Code-Änderungen oder nach `cloud:destroy-project` ist stattdessen `cloud:deploy` nötig.

## Ressourcen löschen

```bash
npm run cloud:destroy-project
```

Das Skript verlangt eine konkrete Bestätigung und löscht nur die App-Ressourcen:

- Cloud Run Service
- Firestore Default-Datenbank
- Cloud Storage Asset-Bucket
- Artifact Registry Repository

Das Google-Cloud-Projekt selbst sowie DNS-/Custom-Domain-Konfigurationen werden nicht gelöscht.

## Cloud Build

`cloudbuild.yaml` enthält keine feste Projekt-ID mehr. Cloud Build verwendet `$PROJECT_ID` und die Substitutions:

- `_CLOUD_REGION`
- `_CLOUD_RUN_SERVICE`
- `_ARTIFACT_REPOSITORY`

Beispiel:

```bash
gcloud builds submit \
  --project "$GCP_PROJECT" \
  --substitutions _CLOUD_REGION="$CLOUD_REGION",_CLOUD_RUN_SERVICE="$CLOUD_RUN_SERVICE",_ARTIFACT_REPOSITORY="$ARTIFACT_REPOSITORY"
```

Der normale Workflow nutzt weiterhin den lokalen Docker-Build über `npm run cloud:deploy`.
