/**
 * Admin API client. Endpoints require role=admin on the server —
 * client checks are UX only.
 */
import type { RemoteUser } from '@/types/remoteApi';
import { REMOTE_API_BASE } from '@/datasets/remoteApi';

export interface AdminOverview {
  usersTotal: number;
  admins: number;
  traders: number;
  datasetsTotal: number;
  datasetsReady: number;
  jobsTotal: number;
  jobsFailed: number;
  jobsRunning: number;
  storage: string;
  service: string;
}

export interface AdminUserRow extends RemoteUser {
  createdAt?: string;
}

export interface AdminJobRow {
  id: string;
  type: string;
  status: string;
  userId: string;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${REMOTE_API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const raw = await res.text();
  let payload: (T & { error?: string }) | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(`Admin API ${path} returned non-JSON`);
    }
  }
  if (!res.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `Admin API ${res.status} ${path}`,
    );
  }
  if (payload == null) throw new Error(`Admin API ${path} empty body`);
  return payload;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const body = await adminJson<{ overview: AdminOverview }>('/admin/overview');
  return body.overview;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const body = await adminJson<{ users: AdminUserRow[] }>('/admin/users');
  return body.users;
}

export async function patchAdminUserRole(
  userId: string,
  role: 'user' | 'admin',
): Promise<AdminUserRow> {
  const body = await adminJson<{ user: AdminUserRow }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
  return body.user;
}

export async function fetchAdminJobs(): Promise<AdminJobRow[]> {
  const body = await adminJson<{ jobs: AdminJobRow[] }>('/admin/jobs');
  return body.jobs;
}
