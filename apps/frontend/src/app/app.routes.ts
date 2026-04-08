import {Routes} from "@angular/router";
import {LandingComponent} from './features/game/landing/landing.component';
import {BoardComponent} from './features/game/board/board.component';
import {PlayerComponent} from './features/game/player/player.component';
import {boardAuthGuard} from './core/board-auth.guard';

export const routes: Routes = [
  {path: "", component: LandingComponent},
  {path: "join/:sessionCode", component: LandingComponent},
  {path: "player", component: PlayerComponent},
  {path: "board", component: BoardComponent, canActivate: [boardAuthGuard]},
  {path: "board/:sessionCode", component: BoardComponent, canActivate: [boardAuthGuard]},
  {path: "**", redirectTo: ""},
];
