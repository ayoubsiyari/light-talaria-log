/**
 * In-memory job queue stub (no Redis). For ingest + future server backtest.
 * Jobs complete immediately with a placeholder result — real workers come later.
 */

export type JobType = 'ingest' | 'backtest';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  userId: string;
  payload: Record<string, unknown>;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const jobs = new Map<string, JobRecord>();
let seq = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(type: JobType): string {
  seq += 1;
  return `${type}_${Date.now().toString(36)}_${seq}`;
}

export function enqueueJob(
  type: JobType,
  userId: string,
  payload: Record<string, unknown>,
): JobRecord {
  const id = nextId(type);
  const t = nowIso();
  const job: JobRecord = {
    id,
    type,
    status: 'queued',
    userId,
    payload,
    error: null,
    result: null,
    createdAt: t,
    updatedAt: t,
  };
  jobs.set(id, job);

  // Stub: mark running then completed on next ticks (no worker process).
  queueMicrotask(() => {
    const cur = jobs.get(id);
    if (!cur || cur.status === 'cancelled') return;
    cur.status = 'running';
    cur.updatedAt = nowIso();
    queueMicrotask(() => {
      const again = jobs.get(id);
      if (!again || again.status === 'cancelled') return;
      again.status = 'completed';
      again.updatedAt = nowIso();
      if (type === 'ingest') {
        again.result = {
          stub: true,
          message:
            'Ingest job accepted (stub). Place packed .bin chunks under data/chunks/datasets/ and update dataset.json.',
          datasetId: typeof payload.datasetId === 'string' ? payload.datasetId : null,
        };
      } else {
        again.result = {
          stub: true,
          message:
            'Backtest job accepted (stub). Server backtest workers are not implemented yet — use the client Worker.',
        };
      }
    });
  });

  return job;
}

export function getJob(id: string): JobRecord | null {
  return jobs.get(id) ?? null;
}

export function listJobs(): JobRecord[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
