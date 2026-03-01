import { Injectable, computed, signal } from "@angular/core";
import type { ChallengeStateDto } from "./api.service";

@Injectable({ providedIn: "root" })
export class ChallengeStore {
  public readonly state = signal<ChallengeStateDto | null>(null);

  public readonly revision = computed(() => this.state()?.revision ?? null);
  public readonly activeChallenge = computed(() => this.state()?.activeChallenge ?? null);
  public readonly activeSubmission = computed(() => this.state()?.activeSubmission ?? null);

  public setState(next: ChallengeStateDto): void {
    this.state.set(next);
  }
}
