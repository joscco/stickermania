import {Component, effect, input, output, signal, ViewChild} from "@angular/core";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {AnimGroupDirective, AnimOnInitDirective, AnimPresenceDirective} from '../../../shared/ui/animations/anim-on-init.directive';
import {SvgComponent} from '../../../shared/ui/svg/svg.component';
import {ProfileAvatarCanvasComponent, type ProfileAvatarDrawMode} from "./avatar-canvas/profile-avatar-canvas.component";

export interface LobbyProfileSubmit {
  name: string;
  avatarDataUrl?: string | null;
}

interface ProfileToolButton {
  id: "clear" | ProfileAvatarDrawMode;
  icon: string;
  ariaLabel: string;
  mode?: ProfileAvatarDrawMode;
}

@Component({
  selector: "app-lobby-profile",
  standalone: true,
  imports: [AnimGroupDirective, AnimOnInitDirective, ProfileAvatarCanvasComponent, SvgComponent, AnimPresenceDirective],
  templateUrl: "./profile.component.html",
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class ProfileComponent {
  public readonly initialName = input("");
  public readonly initialAvatarImage = input<string | null>(null);
  public readonly profileSubmitted = output<LobbyProfileSubmit>();

  public readonly nameInput = signal("");
  public readonly drawMode = signal<ProfileAvatarDrawMode>("paint");
  public readonly avatarPromptVisible = signal(true);
  public readonly avatarToolButtons: ProfileToolButton[] = [
    {id: "clear", icon: "icon-draw-btn-delete", ariaLabel: "Avatar löschen"},
    {id: "paint", icon: "icon-draw-btn-big-lg", ariaLabel: "Dicker Stift", mode: "paint"},
    {id: "erase", icon: "icon-draw-btn-eraser-lg", ariaLabel: "Radierer", mode: "erase"},
  ];

  @ViewChild("avatarCanvas") private avatarCanvas?: ProfileAvatarCanvasComponent;
  private nameTouched = false;
  private avatarTouched = false;
  private avatarCleared = false;

  constructor() {
    effect(() => {
      const name = this.initialName();
      if (!this.nameTouched) {
        this.nameInput.set(name);
      }
    });
    effect(() => {
      const avatarImage = this.initialAvatarImage();
      if (!this.avatarTouched) {
        this.avatarPromptVisible.set(!avatarImage);
      }
    });
  }

  public onNameInput(event: Event): void {
    this.nameTouched = true;
    this.nameInput.set((event.target as HTMLInputElement).value.slice(0, STICKERMANIA_CONFIG.player.maxNameLength));
  }

  public clear(): void {
    this.avatarTouched = true;
    this.avatarCleared = true;
    this.avatarPromptVisible.set(true);
    this.avatarCanvas?.clear();
  }

  public submit(): void {
    const name = this.nameInput().trim();

    if (!this.avatarTouched) {
      this.profileSubmitted.emit({
        name,
        avatarDataUrl: this.initialAvatarImage() ? undefined : null,
      });
      return;
    }

    if (this.avatarCleared || !this.avatarCanvas) {
      this.profileSubmitted.emit({name, avatarDataUrl: null});
      return;
    }

    this.avatarCanvas?.submit();
  }

  public onAvatarSubmitted(avatarDataUrl: string): void {
    const name = this.nameInput().trim();
    this.profileSubmitted.emit({name, avatarDataUrl});
  }

  public onAvatarChanged(): void {
    this.avatarTouched = true;
    this.avatarCleared = false;
    this.avatarPromptVisible.set(false);
  }

  protected selectAvatarTool(tool: ProfileToolButton): void {
    if (tool.id === "clear") {
      this.clear();
      return;
    }
    this.drawMode.set(tool.id);
  }
}
