/**
 * Simple per-session async mutex to prevent concurrent read-modify-write
 * cycles from racing (e.g. timer callback + game-action arriving at the
 * same time).
 *
 * Usage:
 *   await sessionLock.run(sessionId, async () => { ... });
 */
export class SessionLock {
    private readonly queues = new Map<string, Promise<void>>();

    /**
     * Execute `fn` while holding an exclusive lock for `sessionId`.
     * If another operation is already in progress for the same session,
     * this call will wait until it completes.
     */
    public async run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(sessionId) ?? Promise.resolve();

        let resolve!: () => void;
        const next = new Promise<void>((r) => { resolve = r; });
        this.queues.set(sessionId, next);

        // Wait for the previous operation to complete
        await previous;

        try {
            return await fn();
        } finally {
            resolve();
            // Clean up to avoid unbounded growth (only if we're still the tail)
            if (this.queues.get(sessionId) === next) {
                this.queues.delete(sessionId);
            }
        }
    }
}
