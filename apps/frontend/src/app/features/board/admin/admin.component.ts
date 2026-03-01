import { Component, input, output, signal } from "@angular/core";

@Component({
  selector: "app-admin-overlay",
  standalone: true,
  templateUrl: "./admin.component.html"
})
export class AdminOverlayComponent {
  public readonly visible = input.required<boolean>();
  public readonly errorText = input<string | null>(null);
  public readonly submitAdminKey = output<string>();

  public readonly adminKeyInput = signal<string>("");

  public submit(): void {
    const trimmed: string = this.adminKeyInput().trim();
    if (trimmed.length === 0) return;
    this.submitAdminKey.emit(trimmed);
  }
}
