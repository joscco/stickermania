import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-player-qr-card',
  standalone: true,
  templateUrl: './player-qr-card.component.html'
})
export class PlayerQrCardComponent {
  @Input() playerQrDataUrl: string | null = null;
  @Input() playerUrl: string = '';
  @Input() copyHint: string | null = null;
}

