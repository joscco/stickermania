import {Routes} from "@angular/router";
import {DevLandingComponent} from './features/editors/dev-landing/dev-landing.component';
import {StickerEditorTestComponent} from './features/editors/test-sticker-editor/sticker-editor-test.component';
import {HitboxEditorComponent} from './features/editors/hitbox-editor/hitbox-editor.component';
import {CatalogComponent} from './features/catalog/catalog.component';

/**
 * Routes for dev mode — editors and component catalog.
 */
export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "editor", component: StickerEditorTestComponent},
    {path: "hitbox-editor", component: HitboxEditorComponent},
    {path: "catalog", component: CatalogComponent},
    {path: "**", redirectTo: ""},
];
