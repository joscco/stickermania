import {Component, AfterViewInit, ElementRef, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import gsap from "gsap";

@Component({
    selector: "app-player-lobby",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./player-lobby.component.html",
})
export class PlayerLobbyComponent implements AfterViewInit {
    private readonly el = inject(ElementRef);

    public ngAfterViewInit(): void {
        const items = this.el.nativeElement.querySelectorAll(".p-anim");
        gsap.fromTo(items, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: "power2.out"});
    }
}

