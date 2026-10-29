import { randomBytes } from 'node:crypto';

/**
 * The revision of the data Teams shares with Talents, and a way to wait for it to change (long polling).
 * The revision starts with a per-process id, so a restarted Teams never repeats one a reader already holds.
 */
export class SharedChanges {
  private readonly boot = randomBytes(4).toString('hex');
  private count = 0;
  private waiting = new Set<() => void>();
  /** Set when Teams shuts down: nothing waits any more, so the server can close without waiting for the readers. */
  closed = false;
  get revision() { return this.boot + '.' + this.count; }
  changed() { this.count++; this.release(); }
  close() { this.closed = true; this.release(); }
  private release() {
    const waiting = this.waiting; this.waiting = new Set();
    for (const wake of waiting) wake();
  }
  /** Resolves with the revision once it differs from `after`, or with the unchanged revision after `timeout` ms. */
  next(after: string, timeout: number): Promise<string> {
    if (after !== this.revision || this.closed) return Promise.resolve(this.revision);
    return new Promise(resolve => {
      const wake = () => { clearTimeout(timer); this.waiting.delete(wake); resolve(this.revision); };
      const timer = setTimeout(wake, timeout);
      this.waiting.add(wake);
    });
  }
}
