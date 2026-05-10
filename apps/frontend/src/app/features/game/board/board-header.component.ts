import {Component, input, output} from '@angular/core';
import {SvgComponent} from '../../shared/svg/svg.component';
import type {BoardHeaderViewModel} from './board-view-models';

@Component({
    selector: 'app-board-header',
    standalone: true,
    imports: [SvgComponent],
    templateUrl: './board-header.component.html',
})
export class BoardHeaderComponent {
    readonly vm = input.required<BoardHeaderViewModel>();
    readonly backToLobby = output<void>();
    readonly openSettings = output<void>();
}