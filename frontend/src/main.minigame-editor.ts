import {CommonModule} from "@angular/common";
import {Component} from "@angular/core";
import {bootstrapApplication} from "@angular/platform-browser";
import {
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import {MinigameEditorComponent} from "./app/features/editors/minigame-editor/minigame-editor.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, MinigameEditorComponent],
  template: `<app-minigame-editor />`,
})
class MinigameEditorRootComponent {}

bootstrapApplication(MinigameEditorRootComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
  ],
}).catch((error) => console.error(error));
