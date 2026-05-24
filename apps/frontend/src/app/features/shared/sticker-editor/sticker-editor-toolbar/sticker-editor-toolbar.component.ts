import {Component, input, output} from '@angular/core';
import {SvgComponent} from '../../svg/svg.component';

@Component({
  selector: 'app-sticker-editor-toolbar',
  standalone: true,
  imports: [SvgComponent],
  templateUrl: './sticker-editor-toolbar.component.html',
  host: {class: 'block'},
})
export class StickerEditorToolbarComponent {
  readonly placementCount = input(0);
  readonly maxStickers = input(20);
  readonly canAddMore = input(true);
  readonly showPicker = input(false);
  readonly showGameButtons = input(false);

  readonly clearAll = output<void>();
  readonly togglePicker = output<void>();
  readonly skip = output<void>();
  readonly submit = output<void>();

  readonly isFull = () => this.placementCount() >= this.maxStickers();
}
