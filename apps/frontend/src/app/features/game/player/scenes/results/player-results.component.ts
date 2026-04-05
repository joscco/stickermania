import {Component, AfterViewInit, ElementRef, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import gsap from "gsap";
import {WorldStore} from '../../../../../core/world.store';

@Component({
    selector: "app-player-results",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./player-results.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerResultsComponent implements AfterViewInit {
    public readonly stickerService = inject(StickerPlayerService);
    public readonly worldStore = inject(WorldStore);
    private readonly el = inject(ElementRef);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector(".p-anim-banner");
        const medal = this.el.nativeElement.querySelector(".p-anim-medal");
        const items = this.el.nativeElement.querySelectorAll(".p-anim");
        const choices = this.el.nativeElement.querySelectorAll(".p-anim-choice");

        if (banner) gsap.fromTo(banner, {opacity: 0, y: -20}, {opacity: 1, y: 0, duration: 0.4, ease: "power2.out"});
        if (medal) gsap.fromTo(medal, {opacity: 0, scale: 0.5}, {opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", delay: 0.15});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 0.35, stagger: 0.06, delay: 0.2, ease: "power2.out"});
        if (choices.length) gsap.fromTo(choices, {opacity: 0, x: -15}, {opacity: 1, x: 0, duration: 0.3, stagger: 0.05, delay: 0.4, ease: "power2.out"});
    }
}

