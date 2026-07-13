import {CommonModule} from "@angular/common";
import {Component, inject} from "@angular/core";
import {AppRuntimeService} from './core/runtime/app-runtime.service';
import {CloudFrontendShellComponent} from "./shells/cloud-frontend-shell.component";
import {LanHostFrontendShellComponent} from "./shells/lan-host-frontend-shell.component";
import {LocalWebFrontendShellComponent} from "./shells/local-web-frontend-shell.component";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [CommonModule, CloudFrontendShellComponent, LanHostFrontendShellComponent, LocalWebFrontendShellComponent],
  templateUrl: "./app-shell.component.html",
})
export class AppShellComponent {
  readonly runtime = inject(AppRuntimeService);
}
