import { Routes } from "@angular/router";
import { PlayerComponent } from "./features/player/player.component";
import { BoardComponent } from "./features/board/board.component";
import {JoinComponent} from './features/player/join/join.component';
import {StickerEditorTestComponent} from './features/sticker-editor-test/sticker-editor-test.component';
import {HitboxEditorComponent} from './features/hitbox-editor/hitbox-editor.component';

export const routes: Routes = [
  { path: "", redirectTo: "board", pathMatch: "full" },
  { path: "player", component: PlayerComponent },
  { path: "join", component: JoinComponent },
  { path: "join/:sessionCode", component: JoinComponent },
  { path: "board", component: BoardComponent },
  { path: "board/:sessionCode", component: BoardComponent },
  { path: "editor", component: StickerEditorTestComponent },
  { path: "hitbox-editor", component: HitboxEditorComponent },
  { path: "**", redirectTo: "board" }
];
