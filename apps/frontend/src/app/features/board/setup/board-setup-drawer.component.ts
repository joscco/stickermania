import { CommonModule } from "@angular/common";
import {Component, effect, input, output, signal} from "@angular/core";
import * as QRCode from "qrcode";

type WifiSecurity = "WPA" | "WEP" | "nopass";

interface LocalConfig {
  wifi?: {
    ssid?: string;
    password?: string;
    security?: WifiSecurity;
    hidden?: boolean;
    showWifiSectionByDefault?: boolean;
  };
}

@Component({
  selector: "app-board-setup-drawer",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./board-setup-drawer.component.html"
})
export class BoardSetupDrawerComponent {
  public readonly isOpen = input<boolean>(false);

  public readonly playerUrl = input<string>("");
  public readonly playerQrDataUrl = input<string | null>(null);

  public readonly wifiQrGenerated = output<string>();
  public readonly onCloseRequested = output();

  public readonly copyHint = signal<string | null>(null);

  // WiFi form (not persisted)
  public readonly showWifi = signal<boolean>(false);
  public readonly wifiSsid = signal<string>("");
  public readonly wifiPassword = signal<string>("");
  public readonly wifiHidden = signal<boolean>(false);
  public readonly wifiSecurity = signal<WifiSecurity>("WPA");

  public readonly wifiQrDataUrl = signal<string | null>(null);
  public readonly wifiError = signal<string | null>(null);

  public requestClose(): void {
    console.log("onSetupDrawer close");
    this.onCloseRequested.emit()
  }

  public async copyPlayerUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.playerUrl());
      this.copyHint.set("Kopiert!");
    } catch {
      this.copyHint.set("Kopieren nicht möglich.");
    }

    window.setTimeout(() => this.copyHint.set(null), 1500);
  }

  public toggleWifi(): void {
    this.showWifi.set(!this.showWifi());
    this.wifiError.set(null);

    if (!this.showWifi()) {
      this.wifiQrDataUrl.set(null);
    }
  }

  private didLoadLocalConfig: boolean = false;

  constructor() {
    effect(() => {
      void this.tryLoadLocalConfig();
    });
  }

  public async generateWifiQr(): Promise<void> {
    this.wifiError.set(null);

    const ssid: string = this.wifiSsid().trim();
    const security: WifiSecurity = this.wifiSecurity();
    const password: string = this.wifiPassword();
    const hidden: boolean = this.wifiHidden();

    if (ssid.length === 0) {
      this.wifiError.set("Bitte SSID eintragen.");
      this.wifiQrDataUrl.set(null);
      return;
    }

    if (security !== "nopass" && password.trim().length === 0) {
      this.wifiError.set("Bitte WLAN-Passwort eintragen (oder 'nopass' wählen).");
      this.wifiQrDataUrl.set(null);
      return;
    }

    const payload: string =
      `WIFI:T:${security};S:${this.escapeWifiValue(ssid)};` +
      `P:${this.escapeWifiValue(security === "nopass" ? "" : password)};` +
      `H:${hidden ? "true" : "false"};;`;

    try {
      const dataUrl: string = await QRCode.toDataURL(payload, { margin: 1, scale: 6 });
      this.wifiQrDataUrl.set(dataUrl);
      this.wifiQrGenerated.emit(dataUrl);
    } catch {
      this.wifiError.set("QR konnte nicht generiert werden.");
      this.wifiQrDataUrl.set(null);
      this.wifiQrGenerated.emit("");
    }
  }

  private async tryLoadLocalConfig(): Promise<void> {
    if (this.didLoadLocalConfig) {
      return;
    }
    this.didLoadLocalConfig = true;

    try {
      const response: Response = await fetch("/assets/wlan-config.json", { cache: "no-store" });
      if (!response.ok) {
        return; // missing -> ignore
      }

      const config: LocalConfig = await response.json();
      const wifi = config.wifi;
      if (!wifi) {
        return;
      }

      if (typeof wifi.ssid === "string" && wifi.ssid.trim().length > 0) {
        this.wifiSsid.set(wifi.ssid);
      }
      if (typeof wifi.password === "string") {
        this.wifiPassword.set(wifi.password);
      }
      if (wifi.security) {
        this.wifiSecurity.set(wifi.security);
      }
      if (typeof wifi.hidden === "boolean") {
        this.wifiHidden.set(wifi.hidden);
      }
      if (typeof wifi.showWifiSectionByDefault === "boolean") {
        this.showWifi.set(wifi.showWifiSectionByDefault);
      }

      // Auto-generate if enabled by default AND values exist
      if (this.showWifi()) {
        await this.generateWifiQr();
      }
    } catch {
      // ignore in party mode
    }
  }

  private escapeWifiValue(value: string): string {
    // escape characters per common WIFI QR implementations
    return value.replace(/([\\;,:"])/g, "\\$1");
  }
}
