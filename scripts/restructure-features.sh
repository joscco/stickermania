#!/bin/bash
set -e

F="/Users/jonathanschmitz/Desktop/birthday-sandbox-grid/apps/frontend/src/app/features"

echo "=== Copying player shell ==="
cp "$F/player/player.component.ts" "$F/player/player.component.html" "$F/game/player/"

echo "=== Copying join ==="
cp "$F/player/join/join.component.ts" "$F/player/join/join.component.html" "$F/game/player/join/"

echo "=== Copying lobby ==="
cp "$F/player/lobby/lobby-avatar.component.ts" "$F/player/lobby/lobby-avatar.component.html" "$F/game/player/lobby/"
cp "$F/player/lobby/lobby-name.component.ts" "$F/player/lobby/lobby-name.component.html" "$F/game/player/lobby/"
cp "$F/player/lobby/lobby-ready.component.ts" "$F/player/lobby/lobby-ready.component.html" "$F/game/player/lobby/"

echo "=== Copying player services ==="
cp "$F/player/services/player-message-handler.service.ts" "$F/game/services/"
cp "$F/player/services/player-timer.service.ts" "$F/game/services/"

echo "=== Copying sticker player view ==="
cp "$F/sticker-game/player/sticker-player-view.component.ts" "$F/sticker-game/player/sticker-player-view.component.html" "$F/game/player/"

echo "=== Copying player scenes ==="
cp "$F/sticker-game/player/player-lobby/player-lobby.component.ts" "$F/sticker-game/player/player-lobby/player-lobby.component.html" "$F/game/player/scenes/lobby/"
cp "$F/sticker-game/player/player-building/player-building.component.ts" "$F/sticker-game/player/player-building/player-building.component.html" "$F/game/player/scenes/building/"
cp "$F/sticker-game/player/player-voting/player-voting.component.ts" "$F/sticker-game/player/player-voting/player-voting.component.html" "$F/game/player/scenes/voting/"
cp "$F/sticker-game/player/player-results/player-results.component.ts" "$F/sticker-game/player/player-results/player-results.component.html" "$F/game/player/scenes/results/"
cp "$F/sticker-game/player/player-next-round/player-next-round.component.ts" "$F/sticker-game/player/player-next-round/player-next-round.component.html" "$F/game/player/scenes/next-round/"

echo "=== Copying sticker canvas ==="
cp -r "$F/sticker-game/player/sticker-canvas/"* "$F/game/player/canvas/"

echo "=== Copying sticker hand ==="
cp -r "$F/sticker-game/player/sticker-hand/"* "$F/game/player/hand/"

echo "=== Copying sticker voting ==="
cp -r "$F/sticker-game/player/sticker-voting/"* "$F/game/player/voting/"

echo "=== Copying sticker swap modal ==="
cp -r "$F/sticker-game/player/sticker-swap-modal/"* "$F/game/player/swap-modal/"

echo "=== Copying sticker-game services ==="
cp "$F/sticker-game/services/"* "$F/game/services/"

echo "=== Copying editors ==="
cp "$F/dev-landing/dev-landing.component.ts" "$F/dev-landing/dev-landing.component.html" "$F/editors/dev-landing/"
cp "$F/hitbox-editor/hitbox-editor.component.ts" "$F/hitbox-editor/hitbox-editor.component.html" "$F/editors/hitbox-editor/"
cp "$F/hitbox-editor/helper/"* "$F/editors/hitbox-editor/helper/"
cp "$F/sticker-editor-test/sticker-editor-test.component.ts" "$F/sticker-editor-test/sticker-editor-test.component.html" "$F/editors/sticker-editor/"

echo "=== Copying shared ==="
cp -r "$F/player/shared/keyboard/"* "$F/shared/keyboard/" 2>/dev/null || true
cp -r "$F/player/shared/paint-canvas/"* "$F/shared/paint-canvas/" 2>/dev/null || true

echo "=== All done ==="

