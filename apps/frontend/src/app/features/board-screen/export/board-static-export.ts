import JSZip from "jszip";
import type {SessionState} from "@stickermania/shared";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {resolveBrowserAssetUrl} from "../../../core/assets/asset-url-cache";
import {STICKERMANIA_COLORS} from "../../../shared/theme/stickermania-theme";

export type SessionAssetExportInfo = {
  type: "avatar" | "sticker";
  filename: string;
  publicUrl: string;
};

export async function buildStaticBoardExportZip(args: {
  state: SessionState;
  sessionCode: string;
  sessionAssets: SessionAssetExportInfo[];
}): Promise<Blob> {
  const zip = new JSZip();
  const assetLookup = await addExportAssets(zip, args.state, args.sessionAssets);
  const exportState = rewriteStateAssetUrls(args.state, assetLookup);

  zip.file("board-export.json", JSON.stringify(exportState, null, 2));
  zip.file("index.html", staticBoardHtml(exportState));

  return zip.generateAsync({type: "blob"});
}

async function addExportAssets(
  zip: JSZip,
  state: SessionState,
  sessionAssets: SessionAssetExportInfo[],
): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();
  await Promise.all(sessionAssets.map(async (asset) => {
    const folder = asset.type === "avatar" ? "assets/avatars" : "assets/stickers";
    const localPath = `${folder}/${safeFilename(asset.filename)}`;
    await addFetchedFile(zip, asset.publicUrl, localPath);
    lookup.set(normalizedAssetUrl(asset.publicUrl), localPath);
  }));

  await addFetchedFile(zip, "/assets/svg/board-dot-pattern.svg", "assets/svg/board-dot-pattern.svg");

  const stickerUrls = state.gameState.stickerCatalog.map(sticker => sticker.imageUrl);
  if (stickerUrls.some(url => url.startsWith("sprite:#"))) {
    await addFetchedFile(zip, "/assets/sprite.svg", "assets/sprite.svg");
  }

  await Promise.all(stickerUrls
    .filter(url => !url.startsWith("sprite:#"))
    .filter(url => !lookup.has(normalizedAssetUrl(url)))
    .map(async (url) => {
      const localPath = `assets/default-stickers/${safeFilename(url.split("?")[0].split("/").pop() || "sticker.png")}`;
      await addFetchedFile(zip, url, localPath);
      lookup.set(normalizedAssetUrl(url), localPath);
    }));

  return lookup;
}

async function addFetchedFile(zip: JSZip, url: string, path: string): Promise<void> {
  const requestUrl = resolveBrowserAssetUrl(url);
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch ${requestUrl}`);
  }
  zip.file(path, await response.blob());
}

function rewriteStateAssetUrls(state: SessionState, assetLookup: Map<string, string>): SessionState {
  const rewriteUrl = (url: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("sprite:#")) return `assets/sprite.svg#${url.replace("sprite:#", "")}`;
    return assetLookup.get(normalizedAssetUrl(url)) ?? url;
  };

  return {
    ...state,
    players: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [
      id,
      {...player, avatarUrl: rewriteUrl(player.avatarUrl)},
    ])),
    gameState: {
      ...state.gameState,
      stickerCatalog: state.gameState.stickerCatalog.map(sticker => ({
        ...sticker,
        imageUrl: rewriteUrl(sticker.imageUrl) ?? sticker.imageUrl,
      })),
    },
  };
}

function normalizedAssetUrl(url: string): string {
  try {
    const parsed = new URL(resolveBrowserAssetUrl(url), window.location.origin);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9._-]/gi, "_");
}

function staticBoardHtml(state: SessionState): string {
  const embeddedStateJson = JSON.stringify(state).replace(/</g, "\\u003c");
  const bounds = STICKERMANIA_CONFIG.board.bounds;
  const boardWidth = bounds.maxX - bounds.minX;
  const boardHeight = bounds.maxY - bounds.minY;
  const stickerBaseSize = STICKERMANIA_CONFIG.board.stickerBaseSizePx;
  const dotPatternSize = STICKERMANIA_CONFIG.board.dotPatternSizePx;
  const colors = STICKERMANIA_COLORS;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>stickermania Board</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body { margin: 0; overflow: hidden; background: ${colors.board}; color: ${colors.inkHard}; font-family: system-ui, sans-serif; }
    .viewport { position: fixed; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background: ${colors.board}; }
    .viewport.is-panning { cursor: grabbing; }
    .board { position: absolute; left: 0; top: 0; width: ${boardWidth}px; height: ${boardHeight}px; transform-origin: 0 0; will-change: transform; background-color: ${colors.board}; background-image: url("assets/svg/board-dot-pattern.svg"); background-size: ${dotPatternSize}px ${dotPatternSize}px; }
    .sticker { position: absolute; width: ${stickerBaseSize}px; height: ${stickerBaseSize}px; transform-origin: center; display: grid; place-items: center; }
    .sticker img, .sticker svg { display: block; width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <main id="viewport" class="viewport">
    <div id="board" class="board"></div>
  </main>
  <script>
    const BOUNDS = ${JSON.stringify(bounds)};
    const BASE = ${stickerBaseSize};
    const BOARD_WIDTH = ${boardWidth};
    const BOARD_HEIGHT = ${boardHeight};
    const board = document.getElementById("board");
    const viewport = document.getElementById("viewport");
    const camera = {x: 0, y: 0, zoom: 1};
    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function minZoom() {
      return Math.min(viewport.clientWidth / BOARD_WIDTH, viewport.clientHeight / BOARD_HEIGHT) * 0.75;
    }

    function maxZoom() {
      return 5;
    }

    function applyCamera() {
      camera.zoom = clamp(camera.zoom, minZoom(), maxZoom());
      board.style.transform = "translate3d(" + camera.x + "px," + camera.y + "px,0) scale(" + camera.zoom + ")";
    }

    function fitBoard() {
      const padding = 24;
      camera.zoom = Math.min((viewport.clientWidth - padding * 2) / BOARD_WIDTH, (viewport.clientHeight - padding * 2) / BOARD_HEIGHT);
      camera.zoom = clamp(camera.zoom, minZoom(), maxZoom());
      camera.x = (viewport.clientWidth - BOARD_WIDTH * camera.zoom) / 2;
      camera.y = (viewport.clientHeight - BOARD_HEIGHT * camera.zoom) / 2;
      applyCamera();
    }

    function zoomAt(clientX, clientY, nextZoom) {
      const zoom = clamp(nextZoom, minZoom(), maxZoom());
      const boardX = (clientX - camera.x) / camera.zoom;
      const boardY = (clientY - camera.y) / camera.zoom;
      camera.zoom = zoom;
      camera.x = clientX - boardX * zoom;
      camera.y = clientY - boardY * zoom;
      applyCamera();
    }

    function pointerCenter() {
      const values = [...pointers.values()];
      return {
        x: (values[0].clientX + values[1].clientX) / 2,
        y: (values[0].clientY + values[1].clientY) / 2,
      };
    }

    function pointerDistance() {
      const values = [...pointers.values()];
      return Math.hypot(values[1].clientX - values[0].clientX, values[1].clientY - values[0].clientY);
    }

    function stickerElement(sticker) {
      if (sticker.imageUrl.startsWith("assets/sprite.svg#")) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", sticker.imageUrl);
        svg.setAttribute("viewBox", "0 0 200 200");
        svg.appendChild(use);
        return svg;
      }
      const img = document.createElement("img");
      img.src = sticker.imageUrl;
      img.alt = sticker.name || sticker.id;
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          img.parentElement.style.width = (BASE * img.naturalWidth / img.naturalHeight) + "px";
        }
      };
      return img;
    }

    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      zoomAt(event.clientX, event.clientY, camera.zoom * factor);
    }, {passive: false});

    viewport.addEventListener("pointerdown", event => {
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, event);
      viewport.classList.add("is-panning");

      if (pointers.size === 2) {
        const center = pointerCenter();
        pinchStart = {
          distance: pointerDistance(),
          zoom: camera.zoom,
          center,
          boardX: (center.x - camera.x) / camera.zoom,
          boardY: (center.y - camera.y) / camera.zoom,
        };
        dragStart = null;
        return;
      }

      if (pointers.size === 1) {
        dragStart = {clientX: event.clientX, clientY: event.clientY, x: camera.x, y: camera.y};
      }
    });

    viewport.addEventListener("pointermove", event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      pointers.set(event.pointerId, event);

      if (pointers.size === 2 && pinchStart) {
        const center = pointerCenter();
        const zoom = clamp(pinchStart.zoom * pointerDistance() / Math.max(1, pinchStart.distance), minZoom(), maxZoom());
        camera.zoom = zoom;
        camera.x = center.x - pinchStart.boardX * zoom;
        camera.y = center.y - pinchStart.boardY * zoom;
        applyCamera();
        return;
      }

      if (dragStart && pointers.size === 1) {
        camera.x = dragStart.x + event.clientX - dragStart.clientX;
        camera.y = dragStart.y + event.clientY - dragStart.clientY;
        applyCamera();
      }
    });

    function endPointer(event) {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) {
        viewport.classList.remove("is-panning");
        dragStart = null;
        pinchStart = null;
        return;
      }
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        dragStart = {clientX: remaining.clientX, clientY: remaining.clientY, x: camera.x, y: camera.y};
        pinchStart = null;
      }
    }

    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);

    const state = ${embeddedStateJson};
    const catalog = new Map(state.gameState.stickerCatalog.map(sticker => [sticker.id, sticker]));
    const placements = [...state.gameState.boardPlacements].sort((a, b) => a.zIndex - b.zIndex);
    for (const placement of placements) {
      const sticker = catalog.get(placement.stickerId);
      if (!sticker) continue;
      const item = document.createElement("div");
      item.className = "sticker";
      item.style.left = (placement.x - BOUNDS.minX) + "px";
      item.style.top = (placement.y - BOUNDS.minY) + "px";
      item.style.zIndex = placement.zIndex;
      const scaleX = (placement.flipX ? -1 : 1) * placement.scale * (placement.scaleX || 1);
      const scaleY = (placement.flipY ? -1 : 1) * placement.scale * (placement.scaleY || 1);
      item.style.transform = "translate(-50%, -50%) rotate(" + placement.rotation + "deg) scale(" + scaleX + "," + scaleY + ")";
      item.appendChild(stickerElement(sticker));
      board.appendChild(item);
    }
    fitBoard();
    addEventListener("resize", () => applyCamera());
  </script>
</body>
</html>`;
}
