# stickermania

Stickermania is a sticker party game. Players create stickers on their phones and place them together on a shared board.

## Play In Your Browser

Open the free browser version:

https://joscco.github.io/stickermania/

This version runs on one device and stores everything locally in your browser. There is no account, no server, and no multiplayer sync. If you clear your browser data, your local board can be lost, so use export when you want to keep a board.

## Install The LAN Host App

Use the LAN host app when several people want to play together in the same Wi-Fi network. One person starts the app on a computer. Everyone else joins from their phone by scanning the QR code shown on the board.

### macOS

1. Open the GitHub repository: https://github.com/joscco/Stickermania
2. Go to **Releases**.
3. Download the latest macOS file, usually a `.dmg` or `.zip`.
4. Open it and start **Stickermania**.
5. If macOS warns that the app cannot be verified, open **System Settings → Privacy & Security** and allow it manually.
6. Keep the app open and let players scan the QR code.

The current public builds are unsigned. A notarized macOS release still requires Apple Developer ID signing.

### Windows

1. Open the GitHub repository: https://github.com/joscco/Stickermania
2. Go to **Releases**.
3. Download the latest Windows installer, usually an `.exe`.
4. Run the installer and start **Stickermania**.
5. If Windows Defender Firewall asks for network access, allow access for **Private networks** so phones in the same Wi-Fi can connect.
6. Keep the app open and let players scan the QR code.

The current public builds are unsigned. Windows may show SmartScreen warnings until code signing is set up.

## Which Version Should I Use?

| Version | Best for | Internet required while playing | Multiplayer |
|---|---|---:|---:|
| Browser version | Trying the app alone, quick local boards | No, after first load | No |
| LAN host app | Parties in one Wi-Fi network | No | Yes |
| Cloud version | Players across different networks | Yes | Yes |

## For Developers

### Requirements

- Node.js 22 or newer
- npm 10 or newer
- For Cloud Run deployments: Docker Desktop and Google Cloud CLI (`gcloud`)
- For desktop distribution builds: macOS for macOS artifacts and Windows for Windows installers

### Local LAN Server

```bash
npm install
npm run start
```

The local server runs at `http://localhost:3001`. It builds the frontend, backend, and shared package, then stores local sessions and uploaded images in `.data/`.

Optional local settings:

```bash
cp .env.example .env
```

The npm scripts do not load `.env` automatically. Export values in your shell when needed:

```bash
ADMIN_PASSWORD="local-password" npm run start
```

### Electron LAN App

```bash
npm run electron:dev       # start the app locally
npm run electron:pack      # build an unpacked app
npm run electron:dist      # build macOS DMG/ZIP
npm run electron:dist:win  # build Windows installer on Windows
```

Electron starts the same LAN host server, opens the board directly, and uses LAN or mDNS addresses for player QR codes. Port `3001` is preferred; if it is busy, the app picks a nearby free port.

To generate custom app icons, place a `1024x1024` PNG at `apps/electron/assets/icon-source.png` and run:

```bash
npm run icon -w @birthday/electron
```

### GitHub Release Builds

The workflow **Build LAN Desktop App** can be started manually in GitHub Actions.

- Leave `release_tag` empty to create downloadable workflow artifacts only.
- Set `release_tag`, for example `lan-v0.1.0`, to attach the build files to a GitHub Release.
- Keep `draft_release=true` if the release should be reviewed before publishing.

Builds currently run with `CSC_IDENTITY_AUTO_DISCOVERY=false`, so they are not code-signed.

### Local Web Build

```bash
npm run local-web:dev
npm run _build:local-web
```

Every push to `main` runs **Deploy Local Web to GitHub Pages** and publishes the browser version. In the GitHub repository settings, Pages must use **GitHub Actions** as the source.

### Cloud Run

Cloud configuration must stay out of the repository:

```bash
cp .env.cloud.example .env.cloud
# fill .env.cloud
set -a
source .env.cloud
set +a
```

Required values:

- `GCP_PROJECT` or `GOOGLE_CLOUD_PROJECT`
- `ADMIN_PASSWORD` for `cloud:deploy` and `cloud:start`

Commands:

```bash
npm run cloud:deploy
npm run cloud:stop
npm run cloud:start
npm run cloud:destroy-project
```

More details are in [docs-gcloud.md](docs-gcloud.md).

## Project Structure

```text
apps/
  backend/      Fastify HTTP/API/WebSocket server
  electron/     Desktop shell for the LAN host
  frontend/     Angular app, assets, frontend scripts
docs/           planning and architecture notes
packages/
  shared/       shared types, config, default sticker catalog
scripts/        cloud and infrastructure scripts
wlan/           optional Wi-Fi QR template and generator
```

## Useful Scripts

| Script | Description |
|---|---|
| `npm run start` | Build and start the LAN host |
| `npm run dev` | Start development tools |
| `npm run local-web:dev` | Start the local-web dev server |
| `npm run _build` | Build shared, frontend, and backend |
| `npm run _build:cloud` | Build cloud frontend and backend |
| `npm run _build:local-web` | Build the static browser version |
| `npm run electron:dev` | Start the Electron host app |
| `npm run electron:pack` | Build an unpacked Electron app |
| `npm run electron:dist` | Build Electron distribution files |
| `npm run wlan:qr` | Generate a Wi-Fi QR code from local config |
| `npm run cloud:deploy` | Build, push, and deploy the Cloud Run image |
| `npm run cloud:start` | Make the Cloud Run service public again |
| `npm run cloud:stop` | Restrict public access to the Cloud Run service |

## Configuration And Secrets

Only templates are versioned, for example `.env.example`, `.env.cloud.example`, and `wlan/wlan-config.example.json`. Local env files, service-account JSONs, certificates, keys, runtime data, build output, and generated QR images are ignored.

Backend variables:

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port, locally `3001` by default; Cloud Run sets `8080` |
| `DATA_ROOT` | local data directory, `.data` by default |
| `ADMIN_PASSWORD` | optional board password; required for cloud scripts |
| `SESSION_STORE` | `file` or `firestore` |
| `ASSET_STORE` | `local` or `gcs` |
| `GCP_PROJECT` | Google Cloud project |
| `FIRESTORE_COLLECTION` | Firestore collection, `sessions` by default |
| `CLOUD_ASSET_BUCKET` | Cloud Storage bucket for avatar and sticker assets |

## More Documentation

- [docs/spielmodi-ohne-abo-plan.md](docs/spielmodi-ohne-abo-plan.md)
- [docs-gcloud.md](docs-gcloud.md)
