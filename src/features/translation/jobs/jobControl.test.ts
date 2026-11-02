import assert from "node:assert/strict";
import test from "node:test";

import { cancelJobs, pauseJobs, resumeJobs, type ControlledJob } from "./jobControl";

test("cancel after pause retains the active job until its worker settles", () => {
  const active: ControlledJob = { id: "active", status: "running" };
  const queued: ControlledJob = { id: "queued", status: "queued" };
  const jobs = [active, queued];
  const cancellation = new Set<string>();

  pauseJobs(jobs);
  assert.deepEqual(jobs.map((job) => job.status), ["paused", "paused"]);
  const result = cancelJobs(jobs, active.id, cancellation);

  assert.equal(result.count, 2);
  assert.deepEqual(result.remaining, [active]);
  assert.equal(active.status, "cancelling");
  assert.equal(cancellation.has(active.id), true);
});

test("resuming before the active page settles does not queue it twice", () => {
  const jobs: ControlledJob[] = [
    { id: "active", status: "running" },
    { id: "waiting", status: "queued" },
  ];
  pauseJobs(jobs);
  resumeJobs(jobs, "active");
  assert.deepEqual(jobs.map((job) => job.status), ["running", "queued"]);
});
