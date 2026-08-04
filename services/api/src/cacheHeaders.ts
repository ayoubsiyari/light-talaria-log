import type { FastifyReply } from 'fastify';
import { config } from './config.js';

/**
 * Chunk binaries are immutable once written (same key = same bars).
 * Public datasets: long CDN/browser cache. Private: short private cache.
 */
export function applyChunkBinaryHeaders(
  reply: FastifyReply,
  opts: {
    visibility: string;
    checksum?: string | null;
    byteLength: number;
  },
): void {
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Length', String(opts.byteLength));
  reply.header('Accept-Ranges', 'none');
  reply.header('X-Content-Type-Options', 'nosniff');

  if (opts.checksum) {
    const etag = `"${opts.checksum}"`;
    reply.header('ETag', etag);
  }

  if (opts.visibility === 'public_read') {
    // CDN / shared browsers may cache; revalidate via ETag when present.
    reply.header(
      'Cache-Control',
      `public, max-age=${config.cache.publicChunkMaxAge}, immutable`,
    );
  } else {
    reply.header(
      'Cache-Control',
      `private, max-age=${config.cache.privateChunkMaxAge}`,
    );
  }
}

/** Meta JSON — short cache so catalog updates show up quickly. */
export function applyMetaCacheHeaders(reply: FastifyReply, publicOk: boolean): void {
  if (publicOk) {
    reply.header(
      'Cache-Control',
      `public, max-age=${config.cache.metaMaxAge}`,
    );
  } else {
    reply.header('Cache-Control', 'private, no-store');
  }
}
