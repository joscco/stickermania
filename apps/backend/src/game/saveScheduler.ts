export class SaveScheduler {
    private timeoutHandle: NodeJS.Timeout | null = null;
    private readonly debounceMs: number;
    private readonly saveFn: () => void;

    public constructor(args: { debounceMs: number; saveFn: () => void }) {
        this.debounceMs = args.debounceMs;
        this.saveFn = args.saveFn;
    }

    public schedule(): void {
        if (this.timeoutHandle !== null) {
            return;
        }

        this.timeoutHandle = setTimeout(() => {
            this.timeoutHandle = null;
            this.saveFn();
        }, this.debounceMs);
    }

    public flushNow(): void {
        if (this.timeoutHandle !== null) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
        this.saveFn();
    }
}