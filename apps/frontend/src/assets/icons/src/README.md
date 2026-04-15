# SVG Quellen — Illustrator-Workflow

Dieses Verzeichnis enthält die **einzelnen SVG-Quelldateien**, die beim Build
automatisch zu einem einzigen Spritesheet gebündelt werden.

## Workflow

### 1. Illustrator-Export

- Jedes Artboard in Illustrator entspricht einem Symbol im Spritesheet.
- **Artboard-Name = Symbol-ID** (z. B. `sticker-eye-round`).
- Exportieren: `File → Export → Export As… → SVG`
  - Format: **SVG**
  - "Use Artboards": **aktiviert**
  - "Responsive": aktiviert (kein festes width/height am `<svg>`)
  - Jedes Artboard landet als eigene `.svg`-Datei.
- Exportierte Dateien in dieses Verzeichnis kopieren.

### 2. Spritesheet bauen

```bash
# Einmalig bauen:
npm run sprite

# Beim Entwickeln automatisch neu bauen wenn sich Dateien ändern:
npm run sprite:watch
```

Das Skript (`scripts/build-sprite.mjs`):
- Liest alle `.svg`-Dateien aus diesem Verzeichnis
- Optimiert sie mit svgo
- Packt sie als `<symbol id="dateiname">` ins Spritesheet
- Schreibt das Ergebnis nach `public/assets/sprite.svg`

### 3. Dateinamen-Konventionen

| Prefix         | Verwendung                      | Beispiel                  |
|----------------|---------------------------------|---------------------------|
| `sticker-`     | Spielbare Sticker               | `sticker-eye-round.svg`   |
| `icon-`        | UI-Icons (Navigation, Buttons)  | `icon-trash.svg`          |
| `draw-btn-`    | Zeichnen-Canvas-Buttons         | `draw-btn-eraser.svg`     |
| `draw-frame`   | Dekorativer Zeichenrahmen       | `draw-frame.svg`          |
| `art-`         | Dekorative Illustrationen       | `art-bench.svg`           |

### 4. Verwendung im Angular-Template

```html
<!-- Sticker (als Grafik, füllt den Parent): -->
<svg class="w-16 h-16" aria-hidden="true">
  <use href="assets/sprite.svg#sticker-eye-round"/>
</svg>

<!-- Icon (currentColor für Färbung): -->
<svg class="w-5 h-5 text-stone-600" aria-hidden="true">
  <use href="assets/sprite.svg#icon-trash"/>
</svg>
```

### 5. Asset-Check

Das Check-Skript validiert vor jedem Build:
- Alle `sprite:#id`-Referenzen im Sticker-Katalog → Symbol existiert im Sprite?
- Alle `<use href="assets/sprite.svg#…">` in HTML-Templates → Symbol existiert?
- Alle `<img src="assets/…">` in HTML-Templates → Datei existiert?

```bash
npm run check-stickers
```

## Vollständige Symbol-Liste

Alle benötigten Symbol-IDs sind im Spritesheet-Gerüst
`public/assets/sprite.svg` als Platzhalter definiert.

