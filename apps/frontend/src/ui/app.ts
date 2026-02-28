import { OBJECT_TYPES, toCellKey, type ObjectType, type ServerToClientMessage } from "@birthday/shared";
import { WsClient } from "../net/wsClient";
import { Store } from "../state/store";
import { clear, el } from "./dom";
import { getRouteFromHash, navigate, type Route } from "./router";

const DEFAULT_WS_URL: string =
  (import.meta as any).env?.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;

export function renderApp(root: HTMLElement | null): void {
  if (!root) {
    return;
  }

  const store = new Store();

  function render(): void {
    const route: Route = getRouteFromHash();
    clear(root);

    if (route === "home") {
      root.appendChild(renderHome());
      return;
    }

    if (route === "player") {
      root.appendChild(renderPlayer(store));
      return;
    }

    if (route === "board") {
      root.appendChild(renderBoard(store));
      return;
    }
  }

  window.addEventListener("hashchange", () => render());
  render();
}

function renderHome(): HTMLElement {
  const container = el("div", { className: "container" });

  const header = el("div", { className: "header" });
  const brand = el("div", { className: "brand" });
  brand.appendChild(el("h1", { text: "Birthday Sandbox Grid" }));
  brand.appendChild(el("span", { className: "badge", text: "MVP" }));
  header.appendChild(brand);

  container.appendChild(header);

  const card = el("div", { className: "card panel", html: `
    <p class="muted">Wähle, was du öffnen willst:</p>
  ` });

  const row = el("div", { className: "row" });

  const playerButton = el("button", { text: "Player UI (Handy)" });
  playerButton.addEventListener("click", () => navigate("player"));

  const boardButton = el("button", { text: "Board UI (Beamer)" });
  boardButton.addEventListener("click", () => navigate("board"));

  row.appendChild(playerButton);
  row.appendChild(boardButton);
  card.appendChild(row);

  card.appendChild(el("p", { className: "footerHint", html: `
    Tipp: Für den Beamer <strong>Board UI</strong> öffnen. Für Gäste QR-Code auf <code>#/player</code>.
  ` }));

  container.appendChild(card);
  return container;
}

function connectOnce(store: Store, kind: "player" | "board"): WsClient {
  const client = new WsClient({ websocketUrl: DEFAULT_WS_URL, kind });

  client.onOpen = () => store.setState({ connectionStatus: "connected", lastError: null });
  client.onClose = () => store.setState({ connectionStatus: "disconnected" });
  client.onError = () => store.setState({ connectionStatus: "disconnected", lastError: "WebSocket error" });

  client.onMessage = (message: ServerToClientMessage) => {
    if (message.type === "state") {
      store.setState({ world: message.state, lastError: null });
      return;
    }
    if (message.type === "error") {
      store.setState({ lastError: message.message });
      return;
    }
  };

  store.setState({ connectionStatus: "connecting" });
  client.connect();
  return client;
}

function renderPlayer(store: Store): HTMLElement {
  const container = el("div", { className: "container" });

  const header = el("div", { className: "header" });
  const brand = el("div", { className: "brand" });
  brand.appendChild(el("h1", { text: "Player UI" }));
  brand.appendChild(el("span", { className: "badge", text: "place + reset" }));
  header.appendChild(brand);

  const linkHome = el("a", { text: "Home", attrs: { href: "#/" } });
  header.appendChild(linkHome);

  container.appendChild(header);

  const layout = el("div", { className: "layout" });

  const left = el("div", { className: "card panel" });
  const right = el("div", { className: "card gridWrap" });

  layout.appendChild(left);
  layout.appendChild(right);
  container.appendChild(layout);

  // State
  let selectedType: ObjectType = "tree";
  const ws = connectOnce(store, "player");

  // Left panel: controls + palette
  const statusPill = el("div", { className: "pill", text: "connecting…" });
  left.appendChild(statusPill);

  const buttonsRow = el("div", { className: "row", attrs: { style: "margin-top: 10px" } });

  const resetButton = el("button", { className: "danger", text: "Reset world" });
  resetButton.addEventListener("click", () => ws.send({ type: "reset" }));

  const removeModeHint = el("div", { className: "pill", text: "Remove: Rechtsklick / Long-press" });

  buttonsRow.appendChild(resetButton);
  left.appendChild(buttonsRow);
  left.appendChild(el("div", { attrs: { style: "margin-top: 10px" } }));
  left.appendChild(removeModeHint);

  left.appendChild(el("p", { className: "muted", text: "Objekt auswählen:" }));

  const palette = el("div", { className: "palette" });
  const paletteButtons: Record<string, HTMLElement> = {};

  for (const entry of OBJECT_TYPES) {
    const item = el("div", { className: "paletteItem", html: `
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="font-size:18px">${entry.emoji}</div>
        <div>
          <div style="font-weight:600">${entry.label}</div>
          <div class="muted" style="font-size:12px">${entry.type}</div>
        </div>
      </div>
      <div class="pill">Select</div>
    ` });

    item.addEventListener("click", () => {
      selectedType = entry.type;
      updatePaletteActive();
    });

    paletteButtons[entry.type] = item;
    palette.appendChild(item);
  }

  left.appendChild(palette);

  function updatePaletteActive(): void {
    for (const [key, button] of Object.entries(paletteButtons)) {
      if (key === selectedType) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }
  }
  updatePaletteActive();

  // Right panel: grid
  const grid = el("div", { className: "grid" });
  right.appendChild(grid);

  function renderGrid(): void {
    const state = store.getState();
    const world = state.world;
    if (!world) {
      grid.style.gridTemplateColumns = `repeat(${30}, var(--cell))`;
      clear(grid);
      grid.appendChild(el("div", { className: "muted", text: "Waiting for world…" }));
      return;
    }

    grid.style.gridTemplateColumns = `repeat(${world.width}, var(--cell))`;
    clear(grid);

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = toCellKey(x, y);
        const placed = world.cells[key];
        const cell = el("div", { className: `cell ${placed ? "occupied" : ""}`, text: placed ? emojiForType(placed.type) : "" });

        cell.addEventListener("click", () => {
          ws.send({ type: "place", x, y, objectType: selectedType });
        });

        // right click remove
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          ws.send({ type: "remove", x, y });
        });

        // long-press remove for touch
        let pressTimer: number | null = null;
        cell.addEventListener("touchstart", () => {
          pressTimer = window.setTimeout(() => {
            ws.send({ type: "remove", x, y });
          }, 450);
        }, { passive: true });

        cell.addEventListener("touchend", () => {
          if (pressTimer !== null) {
            window.clearTimeout(pressTimer);
            pressTimer = null;
          }
        });

        grid.appendChild(cell);
      }
    }
  }

  function updateStatus(): void {
    const state = store.getState();
    statusPill.textContent =
      state.connectionStatus === "connected"
        ? "connected"
        : state.connectionStatus === "connecting"
          ? "connecting…"
          : "disconnected";
    if (state.lastError) {
      statusPill.textContent = `${statusPill.textContent} · ${state.lastError}`;
    }
  }

  const unsubscribe = store.subscribe(() => {
    updateStatus();
    renderGrid();
  });

  window.addEventListener("beforeunload", () => {
    unsubscribe();
    ws.disconnect();
  });

  return container;
}

function renderBoard(store: Store): HTMLElement {
  const container = el("div", { className: "container fullscreenBoard" });

  const topbar = el("div", { className: "card boardTopbar" });

  const leftTitle = el("div", { className: "boardTitle", html: `
    <strong>Board</strong>
    <span class="pill">Beamer view</span>
  ` });

  const rightStatus = el("div", { className: "pill", text: "connecting…" });

  topbar.appendChild(leftTitle);
  topbar.appendChild(rightStatus);
  container.appendChild(topbar);

  const gridCard = el("div", { className: "card gridWrap", attrs: { style: "margin-top: 12px" } });
  const grid = el("div", { className: "grid" });
  gridCard.appendChild(grid);
  container.appendChild(gridCard);

  const ws = connectOnce(store, "board");

  function renderGrid(): void {
    const state = store.getState();
    const world = state.world;
    if (!world) {
      clear(grid);
      grid.appendChild(el("div", { className: "muted", text: "Waiting for world…" }));
      return;
    }

    // bigger cells for beamer
    document.documentElement.style.setProperty("--cell", "44px");

    grid.style.gridTemplateColumns = `repeat(${world.width}, var(--cell))`;
    clear(grid);

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = toCellKey(x, y);
        const placed = world.cells[key];
        const cell = el("div", { className: `cell ${placed ? "occupied" : ""}`, text: placed ? emojiForType(placed.type) : "" });
        grid.appendChild(cell);
      }
    }
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    rightStatus.textContent =
      state.connectionStatus === "connected"
        ? `connected · rev ${state.world?.revision ?? "-"}`
        : state.connectionStatus === "connecting"
          ? "connecting…"
          : "disconnected";

    if (state.lastError) {
      rightStatus.textContent = `${rightStatus.textContent} · ${state.lastError}`;
    }

    renderGrid();
  });

  window.addEventListener("beforeunload", () => {
    unsubscribe();
    ws.disconnect();
  });

  return container;
}

function emojiForType(objectType: ObjectType): string {
  const entry = OBJECT_TYPES.find((t) => t.type === objectType);
  return entry?.emoji ?? "❓";
}
