import { Routes } from "@angular/router";
import {BoardComponent} from './features/game/board/board.component';
import {PlayerComponent} from './features/game/player/player.component';
import {JoinComponent} from './features/game/player/join/join.component';

export const routes: Routes = [
  { path: "", redirectTo: "board", pathMatch: "full" },
  { path: "player", component: PlayerComponent },
  { path: "join", component: JoinComponent },
  { path: "join/:sessionCode", component: JoinComponent },
  { path: "board", component: BoardComponent },
  { path: "board/:sessionCode", component: BoardComponent },
  { path: "**", redirectTo: "board" }
];
