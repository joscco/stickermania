import {Component, input} from '@angular/core';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../shared/svg/svg.component';

@Component({
    selector: 'app-player-status-screen',
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, SvgComponent],
    templateUrl: './player-status-screen.component.html',
    host: {class: 'flex-1 flex flex-col overflow-hidden'},
})
export class PlayerStatusScreenComponent {
    public readonly icon = input<string>('');
    public readonly title = input<string>('');
    public readonly titleClass = input('text-neutral-700 text-base font-medium');
    public readonly subtitle = input<string>('');
    public readonly subtitleClass = input('text-neutral-500 text-sm');
    public readonly iconClass = input('');
}
