import {Component} from '@angular/core';
import {AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../shared/icon/icon.component';

@Component({
    selector: 'app-offline',
    standalone: true,
    imports: [AnimOnInitDirective, IconComponent],
    templateUrl: './offline.component.html',
})
export class OfflineComponent {}

