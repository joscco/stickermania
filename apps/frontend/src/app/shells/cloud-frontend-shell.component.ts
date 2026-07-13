import {CommonModule} from "@angular/common";
import {Component, inject, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {Subscription} from "rxjs";
import {BoardAuthRuntimeService} from "../core/runtime/board-auth-runtime.service";
import {CloudBoardComponent} from "../features/board-screen/cloud-board.component";
import {LandingComponent} from "../features/landing/landing.component";
import {PlayerComponent} from "../features/player/player-shell/player.component";

type CloudView = "landing" | "board" | "player";

@Component({
  selector: "app-cloud-frontend-shell",
  standalone: true,
  imports: [CommonModule, LandingComponent, CloudBoardComponent, PlayerComponent],
  templateUrl: "./cloud-frontend-shell.component.html",
})
export class CloudFrontendShellComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly boardAuth = inject(BoardAuthRuntimeService);
  private routeSubscription: Subscription | null = null;

  readonly currentView = signal<CloudView>("landing");
  readonly boardAuthChecked = signal(false);

  ngOnInit(): void {
    this.routeSubscription = this.route.queryParamMap.subscribe(params => {
      const view = params.get("view") as CloudView | null;
      if (view === "board" || view === "player") {
        this.currentView.set(view);
        if (view === "board") {
          void this.checkBoardAuth();
        } else {
          this.boardAuthChecked.set(false);
        }
        return;
      }

      this.currentView.set("landing");
      this.boardAuthChecked.set(false);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  private async checkBoardAuth(): Promise<void> {
    if (await this.boardAuth.isBoardAuthorized()) {
      this.boardAuthChecked.set(true);
      return;
    }

    this.boardAuthChecked.set(false);
    void this.router.navigate([], {
      queryParams: {view: null},
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }
}
