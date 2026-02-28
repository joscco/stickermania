import { Routes } from "@angular/router";
import { HomeComponent } from "./features/home/home.component";
import { PlayerComponent } from "./features/player/player.component";
import { BoardComponent } from "./features/board/board.component";

export const routes: Routes = [
  { path: "", component: HomeComponent },
  { path: "player", component: PlayerComponent },
  { path: "board", component: BoardComponent },
  { path: "**", redirectTo: "" }
];
