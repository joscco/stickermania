import {Component, input} from "@angular/core";
import {CommonModule} from "@angular/common";

/**
 * Zeigt Session-Code + optionale QR-Codes (Mitspielen & WLAN).
 *
 * Varianten:
 *   size="large"  – großes Panel für die Lobby (Standard)
 *   size="small"  – kompaktes Badge für den persistenten Bottom-Right-Overlay
 */
@Component({
    selector: "app-board-qr-panel",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-qr-panel.component.html",
})
export class BoardQrPanelComponent {
    public readonly sessionCode = input<string | null>(null);
    public readonly playerQrDataUrl = input<string | null>(null);
    public readonly wifiQrDataUrl = input<string | null>(null);
}

