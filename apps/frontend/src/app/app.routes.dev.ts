import {Routes} from "@angular/router";
import {StickerEditorTestComponent} from "./features/sticker-editor-test/sticker-editor-test.component";
import {HitboxEditorComponent} from "./features/hitbox-editor/hitbox-editor.component";
import {DevLandingComponent} from "./features/dev-landing/dev-landing.component";

/**
 * Routes for dev mode — editors only, no game.
 */
export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "editor", component: StickerEditorTestComponent},
    {path: "hitbox-editor", component: HitboxEditorComponent},
    {path: "**", redirectTo: ""},
];

