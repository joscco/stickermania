import {Component, AfterViewInit, ElementRef, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import gsap from "gsap";

@Component({
    selector: "app-player-next-round",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./player-next-round.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerNextRoundComponent implements AfterViewInit {
    public readonly stickerService = inject(StickerPlayerService);
    private readonly el = inject(ElementRef);

    public ngAfterViewInit(): void {
        const items = this.el.nativeElement.querySelectorAll(".p-anim");
        gsap.fromTo(items, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: "power2.out"});
    }
}

