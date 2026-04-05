#!/bin/bash
# Fix all import paths in the new game/ and editors/ directories
# after restructuring from the old features/ layout.
set -euo pipefail

BASE="/Users/jonathanschmitz/Desktop/birthday-sandbox-grid/apps/frontend/src/app/features"

# Helper: fix imports in a file
# Usage: fix_imports <file> <core_prefix> [extra sed commands...]
fix_imports() {
  local file="$1"
  local core="$2"
  shift 2

  if [ ! -f "$file" ]; then
    echo "  SKIP (not found): $file"
    return
  fi

  # Fix core imports
  sed -i '' \
    -e "s|from ['\"]\.\.\/\.\.\/core\/|from '${core}core/|g" \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/core\/|from '${core}core/|g" \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/\.\.\/core\/|from '${core}core/|g" \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/core\/|from '${core}core/|g" \
    "$file"

  # Fix environment imports
  sed -i '' \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/environments\/|from '${core}../environments/|g" \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/\.\.\/environments\/|from '${core}../environments/|g" \
    -e "s|from ['\"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/environments\/|from '${core}../environments/|g" \
    "$file"

  # Apply extra sed commands
  for cmd in "$@"; do
    sed -i '' "$cmd" "$file"
  done

  echo "  OK: $file"
}

echo "=== Fixing game/board/ (shell) ==="
# game/board/*.ts → core is at ../../../core/
for f in "$BASE/game/board/board.component.ts" \
         "$BASE/game/board/board-lobby.component.ts" \
         "$BASE/game/board/sticker-board-scene.component.ts"; do
  fix_imports "$f" "../../../"
done

# board.component.ts: fix references to sub-components
sed -i '' \
  -e "s|from ['\"]\.\/board-lobby\/board-lobby\.component['\"]|from './board-lobby.component'|g" \
  -e "s|from ['\"]\.\/setup-drawer\/board-setup-drawer\.component['\"]|from './setup-drawer/board-setup-drawer.component'|g" \
  -e "s|from ['\"]\.\/event-toast\/event-toasts\.component['\"]|from './event-toast/event-toasts.component'|g" \
  -e "s|from ['\"]\.\.\/sticker-game\/board\/sticker-board-scene\.component['\"]|from './sticker-board-scene.component'|g" \
  -e "s|from ['\"]\.\.\/sticker-game\/services\/sticker-event-handler['\"]|from '../services/sticker-event-handler'|g" \
  "$BASE/game/board/board.component.ts"

# sticker-board-scene.component.ts: fix scene imports
sed -i '' \
  -e "s|from ['\"]\.\/board-lobby\/board-lobby-scene\.component['\"]|from './scenes/lobby/board-lobby-scene.component'|g" \
  -e "s|from ['\"]\.\/board-building\/board-building-scene\.component['\"]|from './scenes/building/board-building-scene.component'|g" \
  -e "s|from ['\"]\.\/board-voting\/board-voting-scene\.component['\"]|from './scenes/voting/board-voting-scene.component'|g" \
  -e "s|from ['\"]\.\/board-results\/board-results-scene\.component['\"]|from './scenes/results/board-results-scene.component'|g" \
  "$BASE/game/board/sticker-board-scene.component.ts"

echo "=== Fixing game/board/scenes/ ==="
# scenes are at game/board/scenes/<phase>/ → core is ../../../../../core/
for f in "$BASE/game/board/scenes/lobby/board-lobby-scene.component.ts" \
         "$BASE/game/board/scenes/building/board-building-scene.component.ts" \
         "$BASE/game/board/scenes/voting/board-voting-scene.component.ts" \
         "$BASE/game/board/scenes/results/board-results-scene.component.ts"; do
  fix_imports "$f" "../../../../../"
done

echo "=== Fixing game/board/setup-drawer/ ==="
fix_imports "$BASE/game/board/setup-drawer/board-setup-drawer.component.ts" "../../../../"

echo "=== Fixing game/board/event-toast/ ==="
fix_imports "$BASE/game/board/event-toast/event-toasts.component.ts" "../../../../"

echo "=== Fixing game/player/ (shell) ==="
# game/player/*.ts → core is ../../../core/
fix_imports "$BASE/game/player/player.component.ts" "../../../"
fix_imports "$BASE/game/player/sticker-player-view.component.ts" "../../../"

# player.component.ts: fix sub-component references
sed -i '' \
  -e "s|from ['\"]\.\/lobby\/lobby-avatar\.component['\"]|from './lobby/lobby-avatar.component'|g" \
  -e "s|from ['\"]\.\/lobby\/lobby-name\.component['\"]|from './lobby/lobby-name.component'|g" \
  -e "s|from ['\"]\.\/lobby\/lobby-ready\.component['\"]|from './lobby/lobby-ready.component'|g" \
  -e "s|from ['\"]\.\/services\/player-message-handler\.service['\"]|from '../services/player-message-handler.service'|g" \
  -e "s|from ['\"]\.\/services\/player-timer\.service['\"]|from '../services/player-timer.service'|g" \
  -e "s|from ['\"]\.\.\/sticker-game\/player\/sticker-player-view\.component['\"]|from './sticker-player-view.component'|g" \
  -e "s|from ['\"]\.\.\/sticker-game\/services\/sticker-player\.service['\"]|from '../services/sticker-player.service'|g" \
  -e "s|from ['\"]\.\.\/sticker-game\/services\/sticker-event-handler['\"]|from '../services/sticker-event-handler'|g" \
  "$BASE/game/player/player.component.ts"

# sticker-player-view.component.ts: fix scene imports
sed -i '' \
  -e "s|from ['\"]\.\.\/services\/sticker-player\.service['\"]|from '../services/sticker-player.service'|g" \
  -e "s|from ['\"]\.\/player-lobby\/player-lobby\.component['\"]|from './scenes/lobby/player-lobby.component'|g" \
  -e "s|from ['\"]\.\/player-building\/player-building\.component['\"]|from './scenes/building/player-building.component'|g" \
  -e "s|from ['\"]\.\/player-voting\/player-voting\.component['\"]|from './scenes/voting/player-voting.component'|g" \
  -e "s|from ['\"]\.\/player-results\/player-results\.component['\"]|from './scenes/results/player-results.component'|g" \
  -e "s|from ['\"]\.\/player-next-round\/player-next-round\.component['\"]|from './scenes/next-round/player-next-round.component'|g" \
  "$BASE/game/player/sticker-player-view.component.ts"

echo "=== Fixing game/player/join/ ==="
fix_imports "$BASE/game/player/join/join.component.ts" "../../../../"

echo "=== Fixing game/player/lobby/ ==="
for f in "$BASE/game/player/lobby/lobby-avatar.component.ts" \
         "$BASE/game/player/lobby/lobby-name.component.ts" \
         "$BASE/game/player/lobby/lobby-ready.component.ts"; do
  fix_imports "$f" "../../../../"
done

# Fix shared component references in lobby
sed -i '' \
  -e "s|from ['\"]\.\.\/shared\/paint-canvas\/drawing-canvas\.component['\"]|from '../../../shared/paint-canvas/drawing-canvas.component'|g" \
  -e "s|from ['\"]\.\.\/shared\/keyboard\/on-screen-keyboard\.component['\"]|from '../../../shared/keyboard/on-screen-keyboard.component'|g" \
  "$BASE/game/player/lobby/lobby-avatar.component.ts"

sed -i '' \
  -e "s|from ['\"]\.\.\/shared\/keyboard\/on-screen-keyboard\.component['\"]|from '../../../shared/keyboard/on-screen-keyboard.component'|g" \
  "$BASE/game/player/lobby/lobby-name.component.ts"

echo "=== Fixing game/player/scenes/ ==="
# scenes are at game/player/scenes/<phase>/ → core is ../../../../../core/
for f in "$BASE/game/player/scenes/lobby/player-lobby.component.ts" \
         "$BASE/game/player/scenes/building/player-building.component.ts" \
         "$BASE/game/player/scenes/voting/player-voting.component.ts" \
         "$BASE/game/player/scenes/results/player-results.component.ts" \
         "$BASE/game/player/scenes/next-round/player-next-round.component.ts"; do
  fix_imports "$f" "../../../../../"
done

# Fix service references in player scenes
for f in "$BASE/game/player/scenes/lobby/player-lobby.component.ts" \
         "$BASE/game/player/scenes/next-round/player-next-round.component.ts"; do
  sed -i '' \
    -e "s|from ['\"]\.\.\/\.\.\/services\/sticker-player\.service['\"]|from '../../../services/sticker-player.service'|g" \
    "$f"
done

sed -i '' \
  -e "s|from ['\"]\.\.\/\.\.\/services\/sticker-player\.service['\"]|from '../../../services/sticker-player.service'|g" \
  -e "s|from ['\"]\.\.\/sticker-canvas\/sticker-canvas\.component['\"]|from '../../canvas/sticker-canvas.component'|g" \
  -e "s|from ['\"]\.\.\/sticker-hand\/sticker-hand\.component['\"]|from '../../hand/sticker-hand.component'|g" \
  -e "s|from ['\"]\.\.\/sticker-swap-modal\/sticker-swap-modal\.component['\"]|from '../../swap-modal/sticker-swap-modal.component'|g" \
  "$BASE/game/player/scenes/building/player-building.component.ts"

sed -i '' \
  -e "s|from ['\"]\.\.\/\.\.\/services\/sticker-player\.service['\"]|from '../../../services/sticker-player.service'|g" \
  -e "s|from ['\"]\.\.\/sticker-voting\/sticker-voting\.component['\"]|from '../../voting/sticker-voting.component'|g" \
  "$BASE/game/player/scenes/voting/player-voting.component.ts"

sed -i '' \
  -e "s|from ['\"]\.\.\/\.\.\/services\/sticker-player\.service['\"]|from '../../../services/sticker-player.service'|g" \
  "$BASE/game/player/scenes/results/player-results.component.ts"

echo "=== Fixing game/player/canvas|hand|voting|swap-modal ==="
# These are at game/player/<subdir>/ → core is ../../../../core/
for f in "$BASE/game/player/canvas/sticker-canvas.component.ts" \
         "$BASE/game/player/hand/sticker-hand.component.ts" \
         "$BASE/game/player/voting/sticker-voting.component.ts" \
         "$BASE/game/player/swap-modal/sticker-swap-modal.component.ts"; do
  fix_imports "$f" "../../../../"
done

echo "=== Fixing game/services/ ==="
# game/services/*.ts → core is ../../../core/
for f in "$BASE/game/services/sticker-player.service.ts" \
         "$BASE/game/services/sticker-event-handler.ts" \
         "$BASE/game/services/player-message-handler.service.ts" \
         "$BASE/game/services/player-timer.service.ts"; do
  fix_imports "$f" "../../../"
done

echo "=== Fixing editors/ ==="
# editors/hitbox-editor/*.ts → core is ../../../core/
for f in "$BASE/editors/hitbox-editor/hitbox-editor.component.ts" \
         "$BASE/editors/hitbox-editor/helper/hitbox-persistence.service.ts" \
         "$BASE/editors/hitbox-editor/helper/polygon-edit.service.ts" \
         "$BASE/editors/hitbox-editor/helper/editor-interaction.handler.ts" \
         "$BASE/editors/hitbox-editor/helper/auto-hitbox.util.ts"; do
  fix_imports "$f" "../../../" 2>/dev/null || true
done

fix_imports "$BASE/editors/sticker-editor/sticker-editor-test.component.ts" "../../../"

# Fix sticker-editor canvas import
sed -i '' \
  -e "s|from ['\"]\.\.\/sticker-game\/player\/sticker-canvas\/sticker-canvas\.component['\"]|from '../../game/player/canvas/sticker-canvas.component'|g" \
  "$BASE/editors/sticker-editor/sticker-editor-test.component.ts"

echo "=== Fixing shared/ ==="
# shared components typically don't import from core, but check anyway
for f in "$BASE/shared/keyboard/on-screen-keyboard.component.ts" \
         "$BASE/shared/paint-canvas/drawing-canvas.component.ts"; do
  fix_imports "$f" "../../../" 2>/dev/null || true
done

echo "=== All import fixes done ==="

