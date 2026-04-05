import {Component, AfterViewInit, ElementRef, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from "../../services/sticker-player.service";
import {WorldStore} from "../../../../core/world.store";
import {GameSessionStore} from "../../../../core/challenge.store";
import {StickerVotingComponent} from "../sticker-voting/sticker-voting.component";
import gsap from "gsap";

@Component({
    selector: "app-player-voting",
    standalone: true,
    imports: [CommonModule, StickerVotingComponent],
    templateUrl: "./player-voting.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingComponent implements AfterViewInit {
    public readonly stickerService = inject(StickerPlayerService);
    public readonly worldStore = inject(WorldStore);
    public readonly sessionStore = inject(GameSessionStore);
    private readonly el = inject(ElementRef);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector(".p-anim-banner");
        const items = this.el.nativeElement.querySelectorAll(".p-anim");
        if (banner) gsap.fromTo(banner, {opacity: 0, y: -20}, {opacity: 1, y: 0, duration: 0.4, ease: "power2.out"});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 0.35, stagger: 0.06, delay: 0.15, ease: "power2.out"});
    }
}

