import {Component, computed, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {MinigameTask} from '@birthday/shared';
import {minigameRegistry} from '@birthday/shared';

@Component({
  selector: 'app-minigame-shell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './minigame-shell.component.html',
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class MinigameShellComponent {
  readonly task = input.required<MinigameTask>();
  readonly roundIndex = input.required<number>();

  readonly skipRound = output<void>();
  readonly submit = output<void>();

  readonly description = computed(() => {
    const handler = minigameRegistry.getHandlerForTask(this.task());
    return handler?.getDescription(this.task() as any) ?? '';
  });

  readonly taskTitle = computed(() => {
    const t = this.task();
    return 'title' in t ? (t as any).title ?? '' : '';
  });
}
