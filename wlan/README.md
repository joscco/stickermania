# Wi-Fi QR Code Helper

This folder contains an optional helper for creating a Wi-Fi QR code image. The generated QR code can be printed or shown next to the game board so players can join the local network more easily.

## Files

| File | Purpose |
|---|---|
| `wlan-config.example.json` | Versioned template with placeholder Wi-Fi settings |
| `wlan-config.json` | Your local Wi-Fi settings, ignored by Git |
| `wlan-qr.mjs` | QR code generator script |
| `wlan-qr.png` | Generated QR image, ignored by Git |

## Create A QR Code

From the repository root:

```bash
cp wlan/wlan-config.example.json wlan/wlan-config.json
```

Edit `wlan/wlan-config.json` and enter your local network name and password.

Then run:

```bash
npm run wlan:qr
```

The script writes `wlan/wlan-qr.png`.

## Configuration

```json
{
  "wifi": {
    "ssid": "YOUR-WIFI-NAME",
    "password": "your-wifi-password",
    "security": "WPA",
    "hidden": false,
    "showWifiSectionByDefault": true
  }
}
```

Use `"security": "nopass"` for an open network. In that case the password field is ignored.

## Privacy

Do not commit `wlan-config.json` or `wlan-qr.png`. Both files can expose your Wi-Fi credentials and are ignored by `.gitignore`.
