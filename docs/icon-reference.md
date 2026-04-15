# Icon-Referenz für Grafiker

## Konvention

Jede Icon-SVG-Datei wird nach dem Schema `icon-{name}-{size}.svg` benannt und in
`apps/frontend/public/assets/svg/` abgelegt. Der Sprite-Builder (`npm run sprite`)
bündelt sie automatisch.

### Größen-Stufen (Design Tiers)

Im Code gibt es drei feste Darstellungsgrößen. Der Grafiker liefert **pro Größe eine eigene SVG**,
damit die Detaildichte und Strichstärke zur jeweiligen Darstellungsgröße passt:

| Suffix | Pixel | viewBox | Gestaltungs-Hinweis |
|--------|------:|---------|---------------------|
| `-sm`  | 16 px | `0 0 16 16` | Dicke Striche, minimale Details, gut lesbar in Menüs & Inline-Text |
| `-md`  | 24 px | `0 0 24 24` | Standard-Detail, ausgewogene Proportionen |
| `-lg`  | 40 px | `0 0 40 40` | Voller Detailgrad, feinere Striche, Hero-Icons & Feature-Illustrationen |

**Nur die Varianten liefern, die in der Tabelle unten mit ✓ markiert sind.**

---

## Im Code verwendete Icons

Die `<app-icon>` Komponente wird so genutzt:

```html
<app-icon name="star" size="sm"/>   →  lädt sprite.svg#icon-star-sm  (16×16)
<app-icon name="star" size="md"/>   →  lädt sprite.svg#icon-star-md  (24×24)
<app-icon name="star" size="lg"/>   →  lädt sprite.svg#icon-star-lg  (40×40)
```

---

## Benötigte Icons

| Name | sm | md | lg | Verwendung |
|------|:--:|:--:|:--:|------------|
| `star` | ✓ | ✓ | ✓ | Score-Anzeige (sm), Results-Badges (md), Offline-Deko (lg) |
| `timer` | ✓ | | ✓ | Timer-Anzeige im Spieler-Header (sm), Reconnecting (lg) |
| `trophy` | ✓ | ✓ | ✓ | Player-Results Badges (sm), Board-Results (md), Offline-Deko (lg) |
| `cake` | | | ✓ | Lobby-Begrüßung |
| `paintbrush` | | | ✓ | Lobby-Waiting, Next-Round, Offline-Deko |
| `camera` | | | ✓ | Voting-Szene Platzhalter |
| `checkmark` | ✓ | ✓ | ✓ | Player-Results Badges (sm), Board-Results (md), Eingereicht/Voting/Lobby (lg) |
| `home` | ✓ | | | Board-Navigation |
| `settings` | ✓ | | | Board-Einstellungen |
| `download` | ✓ | | | Board-Lobby Collage-Download |
| `trash` | ✓ | ✓ | | Board-Lobby & Setup-Drawer (sm), Canvas-Löschzone (md) |
| `hourglass` | | | ✓ | Disconnected-Szene |
| `pause` | | | ✓ | Building-Skipped-Szene |
| `search` | | | ✓ | Hitbox-Editor Platzhalter |
| `medal-gold` | | | ✓ | Player-Results 1. Platz |
| `medal-silver` | | | ✓ | Player-Results 2. Platz |
| `medal-bronze` | | | ✓ | Player-Results 3. Platz |
| `drag-pan` | | ✓ | | Canvas-Platzhalter „Sticker hierher ziehen" |
| `overlay-move` | | ✓ | | Selection-Overlay Zentrum |
| `overlay-rotate` | | ✓ | | Selection-Overlay Drehen-Handle |
| `overlay-menu` | | ✓ | | Selection-Overlay Menü-Handle |
| `overlay-scale` | | ✓ | | Selection-Overlay Skalieren-Handle |
| `palette-prev` | | ✓ | | Sticker-Palette Blättern links |
| `palette-next` | | ✓ | | Sticker-Palette Blättern rechts |
| `editor-clear-all` | ✓ | | | Editor-Toolbar „Alle entfernen" |
| `ctx-delete` | ✓ | | | Kontext-Menü |
| `ctx-duplicate` | ✓ | | | Kontext-Menü |
| `ctx-flip-h` | ✓ | | | Kontext-Menü |
| `ctx-stretch` | ✓ | | | Kontext-Menü |
| `ctx-z-front` | ✓ | | | Kontext-Menü |
| `ctx-z-forward` | ✓ | | | Kontext-Menü |
| `ctx-z-backward` | ✓ | | | Kontext-Menü |
| `ctx-z-back` | ✓ | | | Kontext-Menü |
| `ctx-group` | ✓ | | | Kontext-Menü |
| `ctx-ungroup` | ✓ | | | Kontext-Menü |

**Gesamt: 34 Icon-Namen × benötigte Varianten = 49 SVG-Dateien**

---

## Dateinamen-Beispiel

Für das Star-Icon (wird in allen 3 Größen gebraucht):
```
public/assets/svg/
  icon-star-sm.svg      ← 16×16, dicke Striche
  icon-star-md.svg      ← 24×24, Standard
  icon-star-lg.svg      ← 40×40, feiner detailliert
```

Für das Trash-Icon (nur sm):
```
public/assets/svg/
  icon-trash-sm.svg     ← 16×16
```

---

## Workflow

1. SVGs in `apps/frontend/public/assets/svg/` ablegen
2. `npm run sprite` → baut `public/assets/sprite.svg`
3. `npm run check-assets` → prüft, ob alle referenzierten Symbole vorhanden sind
