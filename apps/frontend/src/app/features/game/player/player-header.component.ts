import {Component, input, output} from '@angular/core';
import {SvgComponent} from '../../shared/svg/svg.component';
import type {PlayerHeaderViewModel} from './player-view-models';

@Component({
    selector: 'app-player-header',
    standalone: true,
    imports: [SvgComponent],
    templateUrl: './player-header.component.html',
})
export class PlayerHeaderComponent {
    public readonly vm = input.required<PlayerHeaderViewModel>();
    public readonly editName = output<void>();
    public readonly editAvatar = output<void>();
}