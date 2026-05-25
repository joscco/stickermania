import {Routes} from "@angular/router";
import {DevLandingComponent} from './features/editors/dev-landing/dev-landing.component';
import {ShapeSplitEditorComponent} from './features/editors/shape-split-editor/shape-split-editor.component';
import {MinigameEditorComponent} from './features/editors/minigame-editor/minigame-editor.component';
import {CatalogComponent} from './features/catalog/catalog.component';

export const devRoutes: Routes = [
    {path: "", component: DevLandingComponent},
    {path: "shape-split-editor", component: ShapeSplitEditorComponent},
    {path: "minigame-editor", component: MinigameEditorComponent},
    {path: "catalog", component: CatalogComponent},
    {path: "**", redirectTo: ""},
];
