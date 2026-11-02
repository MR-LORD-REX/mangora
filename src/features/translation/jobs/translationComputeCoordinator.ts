/** Serializes memory-heavy vision work while giving visible reader pages priority. */

export type TranslationComputePriority = "reader" | "background" | "maintenance";

type WaitingTask = {
  priority: TranslationComputePriority;
  start: () => void;
};

export class TranslationComputeCoordinator {
  private active = false;
  private readonly waiting: WaitingTask[] = [];
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundReady = false;

  async run<T>(priority: TranslationComputePriority, work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.waiting.push({ priority, start: resolve });
      this.pump();
    });
    try {
      return await work();
    } finally {
      this.active = false;
      this.pump();
    }
  }

  private pump(): void {
    if (this.active || this.waiting.length === 0) return;
    let index = this.waiting.findIndex((task) => task.priority === "reader");
    if (index < 0) index = this.waiting.findIndex((task) => task.priority === "maintenance");
    if (index < 0 && !this.backgroundReady) {
      if (!this.backgroundTimer) {
        // Reader OCR is queued after its scan promise resolves. Give that
        // continuation a turn before admitting the next background page.
        this.backgroundTimer = setTimeout(() => {
          this.backgroundTimer = null;
          this.backgroundReady = true;
          this.pump();
        }, 0);
      }
      return;
    }
    if (index < 0) index = 0;
    if (this.backgroundTimer) clearTimeout(this.backgroundTimer);
    this.backgroundTimer = null;
    this.backgroundReady = false;
    const next = this.waiting.splice(index, 1)[0];
    this.active = true;
    next.start();
  }
}

const coordinator = new TranslationComputeCoordinator();

export function withTranslationComputePermit<T>(
  priority: TranslationComputePriority,
  work: () => Promise<T>,
): Promise<T> {
  return coordinator.run(priority, work);
}
