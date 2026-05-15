import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import {SvgComponent} from "../../shared/svg/svg.component";

@Component({
    selector: "app-choice-button",
    standalone: true,
    imports: [CommonModule, SvgComponent],
    templateUrl: "./choice-button.component.html",
    host: {class: "block w-full max-w-lg"},
})
export class ChoiceButtonComponent {
    public readonly id = input.required<string>();
    public readonly label = input.required<string>();
    public readonly iconId = input<string | null>(null);
    public readonly checked = input(false);

    public readonly selected = output<string>();
}
