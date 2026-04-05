#!/bin/bash
# Restructure features directory
# Run from project root
set -euo pipefail

BASE="apps/frontend/src/app/features"

echo "Step 1: Copy board shell files"
cp "$BASE/board/board.component.ts"   "$BASE/game/board/board.component.ts"
cp "$BASE/board/board.component.html" "$BASE/game/board/board.component.html"
cp "$BASE/board/board-lobby/board-lobby.component.ts"   "$BASE/game/board/board-lobby.component.ts"
cp "$BASE/board/board-lobby/board-lobby.component.html" "$BASE/game/board/board-lobby.component.html"
cp "$BASE/board/setup-drawer/board-setup-drawer.component.ts"   "$BASE/game/board/setup-drawer/board-setup-drawer.component.ts"
cp "$BASE/board/setup-drawer/board-setup-drawer.component.html" "$BASE/game/board/setup-drawer/board-setup-drawer.component.html"
cp "$BASE/board/event-toast/event-toasts.component.ts"   "$BASE/game/board/event-toast/event-toasts.component.ts"
cp "$BASE/board/event-toast/event-toasts.component.html" "$BASE/game/board/event-toast/event-toasts.component.html"
echo "  -> Board shell done"

echo "Step 2: Copy board scenes (already done in earlier script)"
echo "  -> Already copied"

echo "Step 3: Copy player shell files"
cp "$BASE/player/player.component.ts"   "$BASE/game/player/player.component.ts"
cp "$BASE/player/player.component.html" "$BASE/game/player/player.component.html"
cp "$BASE/player/join/join.component.ts"   "$BASE/game/player/join/join.component.ts"
cp "$BASE/player/join/join.component.html" "$BASE/game/player/join/join.component.html"
for f in lobby-avatar lobby-name lobby-ready; do
  cp "$BASE/player/lobby/${f}.component.ts"   "$BASE/game/player/lobby/${f}.component.ts"
  cp "$BASE/player/lobby/${f}.component.html" "$BASE/game/player/lobby/${f}.component.html"
done
echo "  -> Player shell done"

echo "Step 4: Copy shared components"
cp -R "$BASE/player/shared/keyboard/"*.ts   "$BASE/shared/keyboard/" 2>/dev/null || true
cp -R "$BASE/player/shared/keyboard/"*.html "$BASE/shared/keyboard/" 2>/dev/null || true
cp -R "$BASE/player/shared/paint-canvas/"*  "$BASE/shared/paint-canvas/" 2>/dev/null || true
echo "  -> Shared done"

echo "=== Verification ==="
echo "game/board:"
find "$BASE/game/board" -name '*.ts' | wc -l
echo "game/player:"
find "$BASE/game/player" -name '*.ts' | wc -l
echo "game/services:"
find "$BASE/game/services" -name '*.ts' | wc -l
echo "editors:"
find "$BASE/editors" -name '*.ts' | wc -l
echo "shared:"
find "$BASE/shared" -name '*.ts' | wc -l

echo "=== All restructuring done ==="

