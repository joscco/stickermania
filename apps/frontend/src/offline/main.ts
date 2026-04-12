import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {OfflineComponent} from './offline.component';

bootstrapApplication(OfflineComponent, {
    providers: [provideZonelessChangeDetection()],
}).catch(e => console.error(e));
