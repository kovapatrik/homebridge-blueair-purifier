// A trailing debounce: replace intermediate slider values instead of sending
// each one. The timer restarts on every update. An already-started operation
// cannot be undone, so changes arriving during it form one subsequent batch.
export class CoalescedControl<T> {
  private pending?: { value: T; waiters: { resolve: () => void; reject: (error: unknown) => void }[] };
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly execute: (value: T) => Promise<void>,
    private readonly delay = 2000,
  ) {}

  set(value: T): Promise<void> {
    // These promises track execution internally. The HomeKit handler does not
    // await them: it acknowledges acceptance immediately and observes failures
    // separately to restore the last reported value in HomeKit.
    return new Promise((resolve, reject) => {
      if (this.pending) {
        this.pending.value = value;
        this.pending.waiters.push({ resolve, reject });
      } else {
        this.pending = { value, waiters: [{ resolve, reject }] };
      }
      this.schedule();
    });
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.running) {
      this.timer = setTimeout(() => void this.flush(), this.delay);
    }
  }

  private async flush() {
    const batch = this.pending;
    if (!batch) {
      return;
    }
    this.pending = undefined;
    this.running = true;
    try {
      await this.execute(batch.value);
      batch.waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      batch.waiters.forEach(({ reject }) => reject(error));
      // Do not replay queued slider intent after a failed/throttled command.
      this.rejectPending(error);
    } finally {
      this.running = false;
      if (this.pending) {
        // Give a new batch a full quiet window after the active operation.
        // Never overlap two speed operations for the same accessory.
        this.schedule();
      }
    }
  }

  private rejectPending(error: unknown) {
    this.pending?.waiters.forEach(({ reject }) => reject(error));
    this.pending = undefined;
  }

  cancel() {
    // Cancel unsent intent only. A command already in progress may finish;
    // the platform's command lock orders a subsequent power-off after it.
    clearTimeout(this.timer);
    this.rejectPending(new Error('Queued speed cancelled'));
  }
}
