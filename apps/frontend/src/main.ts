import {bootstrapApplication} from "@angular/platform-browser";
import {provideRouter} from "@angular/router";
import {AppComponent} from "./app/app.component";
import {routes} from "./app/app.routes";
import {provideHttpClient} from '@angular/common/http';
import {provideBrowserGlobalErrorListeners, provideZonelessChangeDetection} from '@angular/core';
import {preloadSprite} from './app/shared/stickers/model/sprite-url.util';
import {environment} from './environments/environment';

preloadSprite();
registerLocalWebPwa();

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
  ],
}).catch((error) => console.error(error));

/*
 * Prevent Safari double-tap zoom globally.
 *
 * iOS Safari ignores `user-scalable=no` since iOS 10 and `touch-action: manipulation`
 * doesn't reliably prevent the double-tap-to-zoom gesture in all cases.
 * This listener detects rapid successive taps (< 400 ms) and calls preventDefault()
 * on the second touchend, which is the only reliable cross-version fix.
 */
let lastTouchEnd = 0;
document.addEventListener('touchend', (ev) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 400) {
        ev.preventDefault();
    }
    lastTouchEnd = now;
}, {passive: false});

/* Also prevent the dblclick event entirely — Safari sometimes still zooms via this path. */
document.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
}, {passive: false});

/*
 * Prevent Safari's magnifier loupe & pinch-to-zoom.
 * Safari fires proprietary `gesturestart` / `gesturechange` events
 * for magnifier and zoom gestures. Preventing them kills the loupe.
 */
document.addEventListener('gesturestart', (ev) => {
    ev.preventDefault();
}, {passive: false} as AddEventListenerOptions);

document.addEventListener('gesturechange', (ev) => {
    ev.preventDefault();
}, {passive: false} as AddEventListenerOptions);

function registerLocalWebPwa(): void {
    if (environment.appMode !== "local-web" || typeof document === "undefined") {
        return;
    }

    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "local-web.webmanifest";
    document.head.appendChild(manifest);

    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = "#f8e36a";
    document.head.appendChild(themeColor);

    if (!("serviceWorker" in navigator)) {
        return;
    }

    window.addEventListener("load", () => {
        void navigator.serviceWorker.register("local-web-sw.js").catch(() => {
            // Offline support is best-effort; the app remains usable without a service worker.
        });
    }, {once: true});
}
