import {CommonModule} from "@angular/common";
import {Component, OnInit, signal} from "@angular/core";
import {LanHostBoardComponent} from "../features/board-screen/lan-host-board.component";
import {PlayerComponent} from "../features/player/player-shell/player.component";
import {preloadSprite} from "../shared/stickers/model/sprite-url.util";

@Component({
  selector: "app-lan-host-frontend-shell",
  standalone: true,
  imports: [CommonModule, LanHostBoardComponent, PlayerComponent],
  templateUrl: "./lan-host-frontend-shell.component.html",
})
export class LanHostFrontendShellComponent implements OnInit {
  readonly isHost = isLoopbackHost();
  readonly boardWarmupDone = signal(!this.isHost);

  async ngOnInit(): Promise<void> {
    if (!this.isHost) {
      return;
    }

    await warmUpHostBoard();
    this.boardWarmupDone.set(true);
  }
}

function isLoopbackHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

async function warmUpHostBoard(): Promise<void> {
  await Promise.allSettled([
    preloadSprite(),
    import("pixi.js"),
    fetch("/assets/svg/board-dot-pattern.svg", {cache: "force-cache"}).then(response => response.arrayBuffer()),
    nextPaint(),
  ]);
  await nextPaint();
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
