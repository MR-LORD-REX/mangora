export type ControlledJobStatus =
  | "queued" | "running" | "paused" | "cancelling" | "completed" | "failed";

export interface ControlledJob {
  id: string;
  status: ControlledJobStatus;
}

/** Mutate the active job object in place because its worker holds a reference. */
export function pauseJobs<T extends ControlledJob>(jobs: T[]): void {
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "running") job.status = "paused";
  }
}

export function resumeJobs<T extends ControlledJob>(jobs: T[], activeJobId: string | null): void {
  for (const job of jobs) {
    if (job.status === "paused") job.status = job.id === activeJobId ? "running" : "queued";
  }
}

export function cancelJobs<T extends ControlledJob>(
  jobs: T[],
  activeJobId: string | null,
  cancelRequested: Set<string>,
): { remaining: T[]; count: number } {
  let count = 0;
  const remaining = jobs.filter((job) => {
    if (job.status === "queued" || job.status === "running" || job.status === "paused") count += 1;
    if (job.id === activeJobId &&
        (job.status === "running" || job.status === "paused" || job.status === "cancelling")) {
      cancelRequested.add(job.id);
      job.status = "cancelling";
      return true;
    }
    return job.status !== "queued" && job.status !== "paused";
  });
  return { remaining, count };
}
