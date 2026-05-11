import {Component, computed, input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../../shared/svg/svg.component';

@Component({
    selector: 'app-stars-display',
    standalone: true,
    imports: [CommonModule, SvgComponent],
    templateUrl: './stars-display.component.html',
    host: {class: 'flex items-center justify-center gap-1'},
})
export class StarsDisplayComponent {
    public readonly count = input.required<number>();
    public readonly starSize = input<number>(16);
    public readonly starIcon = input('icon-star-sm');
    public readonly emptyLabel = input<string>('Keine Sterne');
    public readonly colorClass = input('text-amber-500');

    public readonly starsArray = computed(() => Array.from({length: this.count()}, (_, i) => i));
}
