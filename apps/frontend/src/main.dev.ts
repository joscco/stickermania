import {bootstrapApplication} from "@angular/platform-browser";
import {provideRouter} from "@angular/router";
import {AppComponent} from "./app/app.component";
import {devRoutes} from "./app/app.routes.dev";
import {provideHttpClient} from "@angular/common/http";
import {provideBrowserGlobalErrorListeners, provideZonelessChangeDetection} from "@angular/core";

bootstrapApplication(AppComponent, {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideRouter(devRoutes),
    ],
}).catch((error) => console.error(error));

/*
 * Prevent Safari double-tap zoom globally.
 * See main.ts for the full explanation.
 */
let lastTouchEnd = 0;
document.addEventListener('touchend', (ev) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 400) {
        ev.preventDefault();
    }
    lastTouchEnd = now;
}, {passive: false});

document.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
}, {passive: false});

document.addEventListener('gesturestart', (ev) => {
    ev.preventDefault();
}, {passive: false} as AddEventListenerOptions);

document.addEventListener('gesturechange', (ev) => {
    ev.preventDefault();
}, {passive: false} as AddEventListenerOptions);

