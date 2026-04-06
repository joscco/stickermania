import { Component, inject, output, signal } from "@angular/core";
import { OnScreenKeyboardComponent } from '../../../shared/keyboard/on-screen-keyboard.component';
import {GameSessionStore} from '../../../../core/challenge.store';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';

@Component({
  selector: "app-lobby-name",
  standalone: true,
  imports: [OnScreenKeyboardComponent, AnimOnInitDirective, AnimGroupDirective],
  templateUrl: './lobby-name.component.html',
})
export class LobbyNameComponent {
  private readonly sessionStore = inject(GameSessionStore);
  public readonly nameInput = signal(this.sessionStore.playerName());
  public readonly nameSubmitted = output<string>();

  public submit(): void {
    const name = this.nameInput();
    if (name.length > 0) {
      this.nameSubmitted.emit(name);
    }
  }
}
