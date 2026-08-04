import { query } from './db.js';
import type { AuthUser } from './auth.js';

export async function getDatasetVisibility(
  datasetId: string,
): Promise<'private' | 'shared' | 'public_read' | null> {
  const { rows } = await query<{ visibility: string }>(
    `SELECT visibility FROM datasets WHERE id = $1`,
    [datasetId],
  );
  const v = rows[0]?.visibility;
  if (v === 'private' || v === 'shared' || v === 'public_read') return v;
  return null;
}

export async function canReadDataset(user: AuthUser | null, datasetId: string): Promise<boolean> {
  const { rows } = await query<{
    owner_user_id: string;
    visibility: string;
  }>(`SELECT owner_user_id, visibility FROM datasets WHERE id = $1`, [datasetId]);
  const ds = rows[0];
  if (!ds) return false;
  if (ds.visibility === 'public_read') return true;
  if (!user) return false;
  if (user.role === 'admin' || ds.owner_user_id === user.id) return true;
  const acl = await query(
    `SELECT 1 FROM dataset_acl WHERE dataset_id = $1 AND user_id = $2`,
    [datasetId, user.id],
  );
  return (acl.rowCount ?? 0) > 0;
}

export async function canWriteDataset(user: AuthUser, datasetId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  const { rows } = await query<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM datasets WHERE id = $1`,
    [datasetId],
  );
  const ds = rows[0];
  if (!ds) return false;
  if (ds.owner_user_id === user.id) return true;
  const acl = await query(
    `SELECT 1 FROM dataset_acl WHERE dataset_id = $1 AND user_id = $2 AND role IN ('write','admin')`,
    [datasetId, user.id],
  );
  return (acl.rowCount ?? 0) > 0;
}
