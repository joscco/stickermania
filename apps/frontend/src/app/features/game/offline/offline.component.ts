import {Component} from '@angular/core';
import {AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';

@Component({
    selector: 'app-offline',
    standalone: true,
    imports: [AnimOnInitDirective],
    templateUrl: './offline.component.html',
})
export class OfflineComponent {}

