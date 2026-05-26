import {Routes} from "@angular/router";
import {DevLandingComponent} from './features/editors/dev-landing/dev-landing.component';
import {MinigameEditorComponent} from './features/editors/minigame-editor/minigame-editor.component';
import {CatalogComponent} from './features/catalog/catalog.component';

export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "minigame-editor", component: MinigameEditorComponent},
    {path: "catalog", component: CatalogComponent},
    {path: "**", redirectTo: ""},
];
