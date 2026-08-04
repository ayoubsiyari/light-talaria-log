import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

export function objectKey(datasetId: string, tf: string, chunkIndex: number): string {
  return `datasets/${datasetId}/${tf}/${chunkIndex}.bin`;
}

function diskPath(key: string): string {
  return path.join(config.diskRoot, key);
}

let s3: S3Client | null = null;

function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
    });
  }
  return s3;
}

export async function ensureStorage(): Promise<void> {
  if (config.storageDriver === 'disk') {
    await fs.mkdir(config.diskRoot, { recursive: true });
    return;
  }
  const client = getS3();
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
    } catch {
      // bucket may already exist from createbuckets service
    }
  }
}

export async function putObject(key: string, body: Buffer): Promise<void> {
  if (config.storageDriver === 'disk') {
    const full = diskPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return;
  }
  await getS3().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/octet-stream',
      CacheControl:
        'public, max-age=86400, immutable',
    }),
  );
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (config.storageDriver === 'disk') {
    try {
      return await fs.readFile(diskPath(key));
    } catch {
      return null;
    }
  }
  try {
    const out = await getS3().send(
      new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    );
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

/**
 * URL the SPA uses to fetch a chunk binary.
 * - `public_read` + `CDN_PUBLIC_BASE` → CDN (no cookie; offloads API)
 * - otherwise → API origin (ACL enforced on GET)
 */
export function publicFileUrl(
  datasetId: string,
  tf: string,
  chunkIndex: number,
  visibility: string = 'private',
): string {
  const pathPart = `datasets/${encodeURIComponent(datasetId)}/${encodeURIComponent(tf)}/${chunkIndex}.bin`;
  if (visibility === 'public_read' && config.cdnPublicBase) {
    return `${config.cdnPublicBase}/${pathPart}`;
  }
  return `${config.publicApiUrl}/api/v1/files/${pathPart}`;
}
