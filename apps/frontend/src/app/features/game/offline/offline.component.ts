import {Component} from '@angular/core';
import {AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../shared/svg/svg.component';

@Component({
    selector: 'app-offline',
    standalone: true,
    imports: [AnimOnInitDirective, SvgComponent],
    templateUrl: './offline.component.html',
})
export class OfflineComponent {}

