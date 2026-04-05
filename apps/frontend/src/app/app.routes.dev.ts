import {Routes} from "@angular/router";
import {DevLandingComponent} from './features/editors/dev-landing/dev-landing.component';
import {StickerEditorTestComponent} from './features/editors/sticker-editor/sticker-editor-test.component';
import {HitboxEditorComponent} from './features/editors/hitbox-editor/hitbox-editor.component';

/**
 * Routes for dev mode — editors only, no game.
 */
export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "editor", component: StickerEditorTestComponent},
    {path: "hitbox-editor", component: HitboxEditorComponent},
    {path: "**", redirectTo: ""},
];

