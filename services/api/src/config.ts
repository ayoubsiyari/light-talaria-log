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

export const config = {
  port: envInt('API_PORT', 8787),
  host: env('API_HOST', '0.0.0.0'),
  nodeEnv: env('NODE_ENV', 'development'),
  publicApiUrl: env('PUBLIC_API_URL', 'http://127.0.0.1:8787'),
  corsOrigin: env('CORS_ORIGIN', 'http://127.0.0.1:5173'),
  secureCookies: envBool('SECURE_COOKIES', false),
  sessionSecret: env('SESSION_SECRET', 'dev-only-change-me-32chars-minimum!!'),
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
  diskRoot: path.resolve(__dirname, '..', '..', '..', 'data', 'chunks'),
  quotas: {
    datasetsPerUser: envInt('QUOTA_DATASETS_PER_USER', 50),
    importBytesDay: envInt('QUOTA_IMPORT_BYTES_DAY', 2 * 1024 * 1024 * 1024),
    backtestHour: envInt('QUOTA_BACKTEST_HOUR', 30),
  },
  seed: {
    adminEmail: env('SEED_ADMIN_EMAIL', 'admin@localhost'),
    adminPassword: env('SEED_ADMIN_PASSWORD', 'admin12345'),
    demo: envBool('SEED_DEMO', true),
  },
  cookieName: 'talaria_session',
} as const;
