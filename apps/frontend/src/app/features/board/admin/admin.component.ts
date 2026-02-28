import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";

@Component({
  selector: "app-admin-overlay",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./admin.component.html"
})
export class AdminOverlayComponent {
  @Input({ required: true })
  public visible!: boolean;

  @Input()
  public errorText: string | null = null;

  @Output()
  public readonly submitAdminKey = new EventEmitter<string>();

  public readonly adminKeyInput = signal<string>("");

  public submit(): void {
    const trimmed: string = this.adminKeyInput().trim();
    if (trimmed.length === 0) {
      return;
    }
    this.submitAdminKey.emit(trimmed);
  }
}
