import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Prefer repo-root `.env`, then `services/api/.env`. */
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/** Comma-separated origins → array; single value stays one entry. */
function envOrigins(name: string, fallback: string): string[] {
  const raw = env(name, fallback);
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEV_SECRET = 'dev-only-change-me-32chars-minimum!!';

export const config = {
  port: envInt('API_PORT', 8787),
  host: env('API_HOST', '0.0.0.0'),
  nodeEnv: env('NODE_ENV', 'development'),
  publicApiUrl: env('PUBLIC_API_URL', 'http://127.0.0.1:8787'),
  /**
   * Optional CDN / public object prefix for `public_read` chunk URLs.
   * Example: `https://chunks.example.com` →
   *   `{CDN}/datasets/{id}/{tf}/{n}.bin`
   * Leave empty to serve binaries through the API (ACL + Cache-Control).
   */
  cdnPublicBase: env('CDN_PUBLIC_BASE', '').replace(/\/$/, ''),
  corsOrigins: envOrigins('CORS_ORIGIN', 'http://127.0.0.1:5173'),
  secureCookies: envBool('SECURE_COOKIES', false),
  sessionSecret: env('SESSION_SECRET', DEV_SECRET),
  sessionTtlDays: envInt('SESSION_TTL_DAYS', 14),
  databaseUrl: env('DATABASE_URL', 'postgres://talaria:talaria@127.0.0.1:5432/talaria'),
  redisUrl: env('REDIS_URL', 'redis://127.0.0.1:6379'),
  storageDriver: (env('STORAGE_DRIVER', 'disk') === 's3' ? 's3' : 'disk') as 's3' | 'disk',
  s3: {
    endpoint: env('S3_ENDPOINT', 'http://127.0.0.1:9000'),
    region: env('S3_REGION', 'us-east-1'),
    bucket: env('S3_BUCKET', 'talaria-chunks'),
    accessKey: env('S3_ACCESS_KEY', 'talaria'),
    secretKey: env('S3_SECRET_KEY', 'talaria-secret'),
    forcePathStyle: envBool('S3_FORCE_PATH_STYLE', true),
  },
  /** Override in Docker: DISK_ROOT=/app/data/chunks */
  diskRoot: env(
    'DISK_ROOT',
    path.resolve(__dirname, '..', '..', '..', 'data', 'chunks'),
  ),
  quotas: {
    datasetsPerUser: envInt('QUOTA_DATASETS_PER_USER', 50),
    importBytesDay: envInt('QUOTA_IMPORT_BYTES_DAY', 2 * 1024 * 1024 * 1024),
    /** Soft bandwidth guard for authenticated chunk downloads via API. */
    downloadBytesDay: envInt('QUOTA_DOWNLOAD_BYTES_DAY', 10 * 1024 * 1024 * 1024),
    backtestHour: envInt('QUOTA_BACKTEST_HOUR', 30),
  },
  limits: {
    /** Max chunk rows returned from GET …/chunks (viewport-sized). */
    maxChunksPerQuery: envInt('MAX_CHUNKS_PER_QUERY', 24),
    /** Reject published binaries larger than this (~2× 5k×28B). */
    maxChunkBytes: envInt('MAX_CHUNK_BYTES', 512 * 1024),
    /** Global request ceiling (per IP / Redis key). */
    globalRpm: envInt('RATE_LIMIT_GLOBAL_RPM', 300),
    authRpm: envInt('RATE_LIMIT_AUTH_RPM', 20),
    publishRpm: envInt('RATE_LIMIT_PUBLISH_RPM', 60),
    chunkRpm: envInt('RATE_LIMIT_CHUNK_RPM', 240),
    jobsRpm: envInt('RATE_LIMIT_JOBS_RPM', 30),
  },
  cache: {
    /** Seconds — public_read chunk binaries (immutable). */
    publicChunkMaxAge: envInt('CACHE_PUBLIC_CHUNK_MAX_AGE', 86400),
    /** Seconds — private chunk binaries. */
    privateChunkMaxAge: envInt('CACHE_PRIVATE_CHUNK_MAX_AGE', 120),
    /** Seconds — public catalog / series meta. */
    metaMaxAge: envInt('CACHE_META_MAX_AGE', 30),
  },
  seed: {
    // Use a real-looking domain — Zod + HTML email inputs reject `*@localhost`.
    adminEmail: env('SEED_ADMIN_EMAIL', 'admin@talaria.app'),
    adminPassword: env('SEED_ADMIN_PASSWORD', 'admin12345'),
    demo: envBool('SEED_DEMO', true),
  },
  cookieName: 'talaria_session',
} as const;

/**
 * Fail fast in production when secrets / cookies look like defaults.
 * Call once at process start.
 */
export function assertProductionConfig(): void {
  if (config.nodeEnv !== 'production') return;
  const problems: string[] = [];
  if (!config.sessionSecret || config.sessionSecret === DEV_SECRET) {
    problems.push('SESSION_SECRET must be set to a strong random value');
  }
  if (config.sessionSecret.length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters');
  }
  if (!config.secureCookies) {
    console.warn(
      '[config] SECURE_COOKIES=false in production — set true behind HTTPS',
    );
  }
  if (config.corsOrigins.some((o) => o.includes('127.0.0.1') || o.includes('localhost'))) {
    console.warn(
      '[config] CORS_ORIGIN includes localhost in production — confirm this is intentional',
    );
  }
  if (problems.length > 0) {
    throw new Error(`Unsafe production config:\n- ${problems.join('\n- ')}`);
  }
}
