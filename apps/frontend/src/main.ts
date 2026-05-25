import {bootstrapApplication} from "@angular/platform-browser";
import {provideRouter} from "@angular/router";
import {AppComponent} from "./app/app.component";
import {routes} from "./app/app.routes";
import {provideHttpClient} from '@angular/common/http';
import {provideBrowserGlobalErrorListeners, provideZonelessChangeDetection} from '@angular/core';
import {preloadSprite} from "./app/features/shared/svg/sprite-url.util";

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

preloadSprite();

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

