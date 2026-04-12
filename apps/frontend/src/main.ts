import {bootstrapApplication} from "@angular/platform-browser";
import {provideRouter} from "@angular/router";
import {AppComponent} from "./app/app.component";
import {routes} from "./app/app.routes";
import {provideHttpClient} from '@angular/common/http';
import {provideBrowserGlobalErrorListeners, provideZonelessChangeDetection} from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
  ],
}).catch((error) => console.error(error));
