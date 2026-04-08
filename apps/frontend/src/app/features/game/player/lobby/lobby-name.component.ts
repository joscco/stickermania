import { Component, inject, output, signal } from "@angular/core";
import {GameSessionStore} from '../../../../core/challenge.store';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';

@Component({
  selector: "app-lobby-name",
  standalone: true,
  imports: [AnimOnInitDirective, AnimGroupDirective],
  templateUrl: './lobby-name.component.html',
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class LobbyNameComponent {
  private readonly sessionStore = inject(GameSessionStore);
  public readonly nameInput = signal(this.sessionStore.playerName());
  public readonly nameSubmitted = output<string>();

  public onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value.slice(0, 24));
  }

  public submit(): void {
    const name = this.nameInput().trim();
    if (name.length > 0) {
      this.nameSubmitted.emit(name);
    }
  }
}
