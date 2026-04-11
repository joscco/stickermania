import {signal} from '@angular/core';
import type {StickerPlacement} from '@birthday/shared';

const MAX_HISTORY = 50;

/**
 * Linear undo/redo stack for placement arrays.
 * Instantiated per StickerEditorComponent.
 */
export class EditorUndoStack {
    private history: StickerPlacement[][] = [];
    private pointer = -1;

    readonly canUndo = signal(false);
    readonly canRedo = signal(false);

    push(placements: StickerPlacement[]): void {
        // Trim forward history
        this.history = this.history.slice(0, this.pointer + 1);
        // Deduplicate: don't push if nothing changed
        const last = this.history[this.pointer];
        if (last && JSON.stringify(last) === JSON.stringify(placements)) return;
        // Enforce max size
        if (this.history.length >= MAX_HISTORY) {
            this.history.shift();
            this.pointer = Math.max(0, this.pointer - 1);
        }
        this.history.push(placements.map(p => ({...p})));
        this.pointer = this.history.length - 1;
        this.sync();
    }

    undo(): StickerPlacement[] | null {
        if (this.pointer <= 0) return null;
        this.pointer--;
        this.sync();
        return this.history[this.pointer].map(p => ({...p}));
    }

    redo(): StickerPlacement[] | null {
        if (this.pointer >= this.history.length - 1) return null;
        this.pointer++;
        this.sync();
        return this.history[this.pointer].map(p => ({...p}));
    }

    private sync(): void {
        this.canUndo.set(this.pointer > 0);
        this.canRedo.set(this.pointer < this.history.length - 1);
    }
}

