import {inject} from "@angular/core";
import {Router, type CanActivateFn} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";

export const boardAuthGuard: CanActivateFn = async () => {
  const http = inject(HttpClient);
  const router = inject(Router);

  try {
    await firstValueFrom(http.get("/api/auth/board-status"));
    return true;
  } catch {
    await router.navigate(["/"]);
    return false;
  }
};

