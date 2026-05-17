import {Component, computed, input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../../shared/svg/svg.component';

@Component({
    selector: 'app-placement-badge',
    standalone: true,
    imports: [CommonModule, SvgComponent],
    templateUrl: './placement-badge.component.html',
    host: {class: 'text-center py-4'},
})
export class PlacementBadgeComponent {
    public readonly placement = input.required<number>();

    public readonly medalIcon = computed(() => {
        switch (this.placement()) {
            case 1: return 'icon-medal-gold-lg';
            case 2: return 'icon-medal-silver-lg';
            case 3: return 'icon-medal-bronze-lg';
            default: return null;
        }
    });

    public readonly label = computed(() => {
        switch (this.placement()) {
            case 1: return 'Du hast gewonnen!';
            case 2: return 'Platz 2!';
            case 3: return 'Platz 3!';
            default: return `Platz ${this.placement()}`;
        }
    });

    public readonly textClass = computed(() => {
        switch (this.placement()) {
            case 1: return 'text-lg font-bold text-neutral-900 mt-1';
            case 2: return 'text-lg font-bold text-neutral-700 mt-1';
            case 3: return 'text-lg font-bold text-neutral-600 mt-1';
            default: return 'text-sm text-neutral-500 mt-1';
        }
    });

    public readonly iconColorClass = computed(() => {
        switch (this.placement()) {
            case 1: return 'text-black';
            case 2: return 'text-neutral-600';
            case 3: return 'text-neutral-500';
            default: return '';
        }
    });
}
