import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {OfflineComponent} from './offline.component';

bootstrapApplication(OfflineComponent, {
    providers: [provideZonelessChangeDetection()],
}).catch(e => console.error(e));

/* Prevent Safari double-tap zoom globally. */
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

