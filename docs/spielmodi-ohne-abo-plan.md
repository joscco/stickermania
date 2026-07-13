# Plan: Spielmodi ohne Abo

Ziel: Stickermania soll ohne laufende Serverkosten nutzbar sein, ohne den bestehenden Cloud-Betrieb zu entfernen. Es gibt drei Auslieferungsmodi: eine freie Web-Version mit lokaler Browser-Speicherung, eine LAN-Host-Version als Electron-App und den bestehenden Cloud-Modus. Sichtbare Sessions und Session-Codes sind nur für den Cloud-Modus relevant.

## Modus 1: Freie Web-Version

Die Web-Version wird als rein statisches Frontend bereitgestellt. Es gibt kein Backend und keine Server-Datenbank. Alle Nutzerdaten liegen lokal im Browser des Users. Die UI startet direkt im normalen Spieler-Frontend mit einem lokalen Einzelspieler-Spielstand, ohne Dashboard, ohne separaten Board-Modus, ohne Profil-/Avatar-Bereich, ohne Session-Liste und ohne Session-Code.

### Technisches Modell

- Hosting als statische App: HTML, JS, CSS, Assets.
- Kleine Einstellungen in `localStorage`.
- Spielstände, Sticker und Bilder in `IndexedDB`.
- Bilder nicht roh in `localStorage` speichern.
- Bilder vor dem Speichern verkleinern und komprimieren.
- Als PWA installierbar machen und geladene App-/Asset-Dateien offline cachen.

### Produkt-Erwartung

- Funktioniert offline/lokal auf einem Gerät.
- Genau ein lokaler Spieler; kein Profil- oder Avatar-Schritt.
- Kein Sync zwischen Geräten.
- Kein gemeinsamer Multiplayer über mehrere Geräte.
- Browserdaten löschen bedeutet: lokale Spielstände können verloren gehen.
- Export/Import ist wichtig, damit Nutzer ihre Daten sichern können.

## Modus 2: Electron LAN Host

Die Electron-App wird vom Host gestartet und bietet lokal Backend und Frontend im Heimnetz an. Andere Spieler brauchen keine App, sondern öffnen die LAN-Adresse im Browser.

### Technisches Modell

- Electron startet einen lokalen Node-Server.
- Server bindet an `0.0.0.0`, bevorzugt Port `3001` und weicht in Electron bei belegtem Port auf einen freien Folgeport aus.
- Server liefert das gebaute Frontend aus.
- Server stellt API/WebSocket bereit.
- Das LAN-Host-Board zeigt erkannte LAN-Adresse, QR-Code und Firewall-Hinweis.
- Clients öffnen einen QR-Direktlink, z.B. `http://192.168.178.42:3001/?view=player`.
- Spielstand und Bilder liegen lokal beim Host.
- Intern existiert ein einzelner Host-Spielstand; er wird Nutzern nicht als Session-Code oder Session-Liste gezeigt.

### Produkt-Erwartung

- Alle Spieler müssen im gleichen Netzwerk sein.
- Host muss die Electron-App laufen lassen.
- Mitspieler brauchen nur Browser und QR-Code, keinen Session-Code.
- Keine Cloud-Kosten.
- Daten liegen lokal beim Host.
- Firewall-Hinweise für Windows/macOS einplanen.
- Für einfache Distribution fehlen noch Code-Signing/Notarisierung und Windows-Test.

## Modus 3: Cloud

Der bestehende Cloud-Modus bleibt erhalten. Er nutzt weiterhin einen öffentlich erreichbaren Server, Firestore für Sessions und Cloud Storage für Bilder/Assets.

### Technisches Modell

- Frontend wird über den Backend-Server ausgeliefert.
- Frontend spricht `/api` und `/ws` auf demselben Origin an.
- Backend nutzt `SESSION_STORE=firestore` und `ASSET_STORE=gcs`.
- Cloud Run kann auf `min-instances=0` laufen, um Kosten zu reduzieren.

### Produkt-Erwartung

- Funktioniert über mehrere Netzwerke und Geräte hinweg.
- Kein gemeinsames LAN erforderlich.
- Laufende Cloud-Ressourcen bleiben möglich, aber konfigurierbar.
- Dieser Modus darf durch lokale Modi nicht regressieren.

## Gemeinsame Architekturentscheidung

- `RemoteBackendAdapter`: Cloud- und LAN-Host-Betrieb über `/api` und `/ws`.
- `LocalIndexedDbAdapter`: freie lokale Web-Version.

Cloud und LAN-Host teilen sich aus Frontend-Sicht die Remote-Runtime über `/api` und `/ws`. Unterschiedlich ist dort vor allem die Backend-Persistenz: Cloud nutzt Firestore/GCS, LAN-Host lokale Dateien. Die freie Web-Version nutzt eine lokale Runtime mit IndexedDB und ohne WebSocket.

## Aktuelle Todo-Liste

- [x] Drei Auslieferungsmodi im Plan und in der README klar benennen.
- [x] Frontend-Delivery-Modes `cloud`, `lan-host`, `local-web`, `dev` modellieren.
- [x] Remote-Runtime-Fassaden für Session-, Sticker-, Realtime- und Board-Auth-Operationen einführen.
- [x] Cloud-Build und Cloud-Deploy explizit auf den Cloud-Frontend-Modus umstellen.
- [x] Shared Initial-State-/Katalog-Logik frontendfähig machen.
- [x] `local-web` Spielstand- und Sticker-State in IndexedDB speichern.
- [x] `local-web` Realtime-Ersatz ohne WebSocket bauen.
- [x] Player-Flow im `local-web`-Modus ohne Backend und ohne Session-Code lauffähig machen.
- [x] `local-web` direkt in das Spieler-Frontend starten; Dashboard und separaten Board-Modus ausblenden.
- [x] `local-web` als Einzelspieler-Modus ohne Profil-/Avatar-Bereich betreiben.
- [x] `local-web` ohne Avatar-Badges/-Schalter im Board betreiben.
- [x] Sticker-Bilder im Browser als Blob-Assets in IndexedDB speichern und Spielstand nur mit Asset-Referenzen persistieren.
- [x] Lokale Blob-Assets vor dem Speichern per Resize/Kompression optimieren.
- [x] Export/Import für den lokalen Spielstand inklusive Blob-Assets ergänzen.
- [x] Storage-Status und Fehlerhinweise ergänzen.
- [x] PWA-Manifest und Offline-Cache für `local-web` ergänzen.
- [x] LAN-Host auf internes Host-Spiel ohne sichtbare Session-Liste und ohne Session-Code umstellen.
- [x] LAN-Host-Board-UI mit LAN-IP-QR, Host-URLs und Firewall-Hinweis ergänzen.
- [x] Electron-LAN-Host-Shell mit LAN-IP, QR-Code, Firewall-Hinweisen und Packaging vorbereiten.
- [x] Electron-Shell an den LAN-Host-Spielstand anbinden.
- [x] Electron/LAN-Host ohne Session-Dashboard starten und QR-Links auf nicht-lokale LAN-/mDNS-Adressen begrenzen.
- [x] Generisches Electron-App-Icon ergänzen.
- [x] Electron-Paketgröße reduzieren, indem Cloud-only Backend-Dependencies aus der LAN-App herausgehalten werden.
- [x] macOS-Signing-Konfiguration mit Hardened Runtime und Entitlements vorbereiten.
- [ ] Apple Developer ID Zertifikat und Notarisierungs-Credentials einrichten.
- [ ] Windows-Build und Firewall-Hinweise auf einem Windows-System testen.

## Todo-Liste: Öffentliche Veröffentlichung

- [x] Board-Badge-Avatare wieder kreisrund maskieren.
- [x] Badge-Pfeil ohne gerasterte SVG-Kante rendern.
- [x] Cloud-Skripte von festen Projektwerten entkoppeln.
- [x] Cloud-Default-Passwort entfernen und `ADMIN_PASSWORD` für Cloud-Start/Deploy verpflichtend machen.
- [x] Env-Templates für lokale und Cloud-Konfiguration ergänzen.
- [x] `.gitignore` für lokale Env-Dateien, Cloud-Credentials, Signing-Dateien und Runtime-Daten härten.
- [x] `cloudbuild.yaml` ohne konkrete Projekt-ID betreiben.
- [x] README auf Installation, Modi, Konfiguration und Projektstruktur verschlanken.
- [x] Cloud-Dokumentation auf template-basierten Workflow umstellen.
- [x] GitHub-Actions-Workflow für manuelle LAN-Desktop-Builds und optionale GitHub-Releases ergänzen.
- [x] GitHub-Actions-Workflow für automatisches Local-Web-Deployment auf GitHub Pages ergänzen.
- [x] Neue Sticker an der zuletzt sichtbaren Board-Position des Spielers platzieren.
- [ ] Apple Developer ID Zertifikat und Notarisierungs-Credentials einrichten.
- [ ] Windows-Build und Firewall-Hinweise auf einem Windows-System testen.
- [ ] GitHub Pages im Repository auf `GitHub Actions` als Source stellen.
- [ ] Ersten manuellen LAN-Desktop-Workflow auf GitHub ausführen und Release-Download prüfen.
- [ ] Vor Veröffentlichung frischen LAN-Host-Smoke-Test mit Handy im WLAN durchführen.
- [ ] Vor Veröffentlichung frischen Local-Web-Smoke-Test inklusive Export/Import durchführen.
- [ ] Vor Veröffentlichung Cloud-Deploy mit echter `.env.cloud` gegen das Zielprojekt testen.
