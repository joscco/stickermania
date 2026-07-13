import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {AppRuntimeService} from "./app-runtime.service";

@Injectable({providedIn: "root"})
export class BoardAuthRuntimeService {
  public constructor(
    private readonly http: HttpClient,
    private readonly runtime: AppRuntimeService,
  ) {}

  public async isBoardAuthorized(): Promise<boolean> {
    if (!this.runtime.requiresBoardAuth()) {
      return true;
    }

    try {
      await firstValueFrom(this.http.get("/api/auth/board-status"));
      return true;
    } catch {
      return false;
    }
  }

  public async login(password: string): Promise<void> {
    if (!this.runtime.requiresBoardAuth()) {
      return;
    }
    await firstValueFrom(this.http.post("/api/auth/board-login", {password}));
  }
}
