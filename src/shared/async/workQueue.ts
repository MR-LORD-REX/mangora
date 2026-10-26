/**
 * workQueue.ts
 * ---------------------------------------------------------------------------
 * Small promise-based worker queue used by translation and reader pipelines.
 *
 * Every independent unit (page scan, bubble OCR, bubble/page translation) is
 * pushed here instead of being fired with Promise.all. Callers choose the
 * concurrency, and the queue hands each task a stable worker slot so AI
 * translation can pin one Gemini model to each worker.
 * ---------------------------------------------------------------------------
 */

export interface WorkQueueTask<T> {
  task: T;
  /** Optional dedupe key; a key can only be pending or running once. */
  key?: string;
}

export interface WorkQueueMetrics {
  name: string;
  pending: number;
  active: number;
  concurrency: number;
}

export class WorkQueue<T> {
  private pending: WorkQueueTask<T>[] = [];
  private keys = new Set<string>();
  private slots: boolean[] = [];
  private activeCount = 0;
  private stopped = false;

  constructor(
    readonly name: string,
    private concurrency: number,
    private readonly worker: (task: T, slot: number) => Promise<void>,
    private readonly onChange?: (metrics: WorkQueueMetrics) => void,
  ) {
    this.resizeSlots();
  }

  private resizeSlots(): void {
    const size = Math.max(1, Math.round(this.concurrency));
    this.slots.length = size;
    for (let i = 0; i < size; i += 1) {
      if (this.slots[i] === undefined) this.slots[i] = false;
    }
    this.concurrency = size;
  }

  private emit(): void {
    this.onChange?.({
      name: this.name,
      pending: this.pending.length,
      active: this.activeCount,
      concurrency: this.concurrency,
    });
  }

  push(task: T, key?: string): boolean {
    if (this.stopped) return false;
    if (key) {
      if (this.keys.has(key)) return false;
      this.keys.add(key);
    }
    this.pending.push({ task, key });
    this.emit();
    this.pump();
    return true;
  }

  setConcurrency(next: number): void {
    this.concurrency = Math.max(1, Math.round(next));
    this.resizeSlots();
    this.emit();
    this.pump();
  }

  clearPending(): void {
    for (const item of this.pending) {
      if (item.key) this.keys.delete(item.key);
    }
    this.pending = [];
    this.emit();
  }

  stop(): void {
    this.stopped = true;
    this.clearPending();
  }

  start(): void {
    this.stopped = false;
    this.pump();
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get activeJobs(): number {
    return this.activeCount;
  }

  private pump(): void {
    if (this.stopped) return;
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const slot = this.slots.findIndex((busy) => !busy);
      if (slot < 0) return;
      const next = this.pending.shift();
      if (!next) return;
      this.slots[slot] = true;
      this.activeCount += 1;
      this.emit();
      void this.worker(next.task, slot)
        .catch((error) => {
          console.warn(`[work-queue] ${this.name} task failed`, {
            key: next.key ?? null,
            error,
          });
        })
        .finally(() => {
          this.slots[slot] = false;
          this.activeCount -= 1;
          if (next.key) this.keys.delete(next.key);
          this.emit();
          this.pump();
        });
    }
  }
}
