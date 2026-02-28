import { Routes } from "@angular/router";
import { PlayerComponent } from "./features/player/player.component";
import { BoardComponent } from "./features/board/board.component";

export const routes: Routes = [
  { path: "", redirectTo: "board", pathMatch: "full" },
  { path: "player", component: PlayerComponent },
  { path: "board", component: BoardComponent },
  { path: "**", redirectTo: "player" }
];
