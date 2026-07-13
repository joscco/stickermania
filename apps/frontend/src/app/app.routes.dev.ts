import {Routes} from "@angular/router";
import {AppShellComponent} from './app-shell.component';
import {DevLandingComponent} from './features/dev-tools/dev-landing/dev-landing.component';
import {StickerEditorTestComponent} from './features/dev-tools/test-sticker-editor/sticker-editor-test.component';

/**
 * Routes for dev mode.
 */
export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "game", component: AppShellComponent},
    {path: "editor", component: StickerEditorTestComponent},
    {path: "**", redirectTo: ""},
];
