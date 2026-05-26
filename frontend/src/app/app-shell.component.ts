import {CommonModule} from "@angular/common";
import {Component, inject, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {BoardComponent} from './features/game/board/board.component';
import {PlayerComponent} from './features/game/player/player.component';
import {SvgComponent} from './features/shared/svg/svg.component';
import {AudioService} from './core/audio.service';
import {LandingComponent} from './features/game/board/scenes/landing/landing.component';

type AppView = "landing" | "board" | "player";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [CommonModule, LandingComponent, BoardComponent, PlayerComponent, SvgComponent],
  templateUrl: "./app-shell.component.html",
})
export class AppShellComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  public readonly audio = inject(AudioService);

  public readonly musicPlaying = this.audio.musicPlaying;
  public readonly showMusicTooltip = signal(true);

  public readonly currentView = signal<AppView>("landing");
  public readonly boardAuthChecked = signal(false);

  public ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const view = params.get("view") as AppView | null;
      if (view === "board" || view === "player") {
        this.currentView.set(view);
        if (view === "board") {
          this.checkBoardAuth();
        } else if (view === "player") {
          this.audio.musicStop();
        }
      } else {
        this.currentView.set("landing");
        this.boardAuthChecked.set(false);
      }
    });
  }

  public onMusicToggle(): void {
    this.showMusicTooltip.set(false);
    this.audio.musicToggle();
  }

  private async checkBoardAuth(): Promise<void> {
    try {
      await firstValueFrom(this.http.get("/api/auth/board-status"));
      this.boardAuthChecked.set(true);
    } catch {
      void this.router.navigate([], {
        queryParams: {view: null},
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
      this.boardAuthChecked.set(false);
    }
  }
}
