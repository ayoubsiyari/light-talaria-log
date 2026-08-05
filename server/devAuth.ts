/**
 * Cookie-session auth for the Vite `/api/v1` disk stub.
 * Same cookie name as Level-2 SaaS (`talaria_session`) so the SPA client is shared.
 * Users persist to `data/dev-auth-users.json`; sessions are in-memory (restart clears them).
 */
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Connect } from 'vite';

export const COOKIE_NAME = 'talaria_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const USERS_PATH = path.resolve(process.cwd(), 'data', 'dev-auth-users.json');

export interface DevUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'user' | 'admin';
}

export type PublicDevUser = Pick<DevUser, 'id' | 'email' | 'displayName' | 'role'>;

interface SessionRow {
  userId: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionRow>();
let users: DevUser[] = [];
let seeded = false;

function cryptoRandomUuid(): string {
  return randomUUID();
}

function hashToken(token: string): string {
  return createHash('sha256').update(`talaria-dev-stub:${token}`).digest('hex');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1]!;
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function loadUsers(): void {
  if (existsSync(USERS_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(USERS_PATH, 'utf8')) as Array<
        Partial<DevUser> & { email?: string }
      >;
      if (Array.isArray(raw)) {
        users = raw
          .filter((u) => u && typeof u.email === 'string' && u.passwordHash)
          .map((u) => ({
            id: String(u.id ?? randomUUID()),
            email: String(u.email).toLowerCase(),
            displayName: String(u.displayName ?? u.email!.split('@')[0]),
            passwordHash: String(u.passwordHash),
            role: u.role === 'admin' ? 'admin' : 'user',
          }));
      }
    } catch {
      users = [];
    }
  }
}

function saveUsers(): void {
  mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function ensureSeededUser(
  email: string,
  password: string,
  displayName: string,
  id: string,
): void {
  const lower = email.toLowerCase();
  const existing = users.find((u) => u.email === lower);
  if (existing) {
    existing.role = 'admin';
    existing.displayName = displayName;
    existing.passwordHash = hashPassword(password);
    return;
  }
  users.push({
    id,
    email: lower,
    displayName,
    passwordHash: hashPassword(password),
    role: 'admin',
  });
}

function ensureSeedUser(): void {
  if (seeded) return;
  seeded = true;
  loadUsers();
  // Local stub: only seed an admin when env provides credentials — never hardcode passwords.
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || password.length < 16) {
    if (users.length === 0) {
      console.warn(
        '[devAuth] No admin seed — set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (≥16) in .env',
      );
    }
    return;
  }
  const before = JSON.stringify(users);
  ensureSeededUser(
    email,
    password,
    'Admin',
    '00000000-0000-4000-8000-000000000099',
  );
  if (JSON.stringify(users) !== before) saveUsers();
}

export function toPublicUser(user: DevUser): PublicDevUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function parseCookies(req: Connect.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setCookie(
  res: Connect.ServerResponse,
  name: string,
  value: string,
  maxAgeSec: number,
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  const prev = res.getHeader('Set-Cookie');
  const next = `${parts.join('; ')}`;
  if (!prev) {
    res.setHeader('Set-Cookie', next);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, next]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), next]);
  }
}

function clearCookie(res: Connect.ServerResponse, name: string): void {
  setCookie(res, name, '', 0);
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  sessions.set(hashToken(token), {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  sessions.delete(hashToken(token));
}

export function userFromRequest(req: Connect.IncomingMessage): DevUser | null {
  ensureSeedUser();
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = sessions.get(hashToken(token));
  if (!row || row.expiresAt < Date.now()) {
    if (row) sessions.delete(hashToken(token));
    return null;
  }
  return users.find((u) => u.id === row.userId) ?? null;
}

export function setSessionCookie(res: Connect.ServerResponse, token: string): void {
  setCookie(res, COOKIE_NAME, token, Math.floor(SESSION_TTL_MS / 1000));
}

export function clearSessionCookie(res: Connect.ServerResponse): void {
  clearCookie(res, COOKIE_NAME);
}

/** Soft Origin check for cookie-mutating routes (CSRF guard for browsers). */
export function originAllowed(req: Connect.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations / non-browser
  try {
    const u = new URL(origin);
    const host = req.headers.host;
    if (!host) return false;
    return u.host === host;
  } catch {
    return false;
  }
}

export function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): { ok: true; user: DevUser } | { ok: false; status: number; error: string } {
  ensureSeedUser();
  const email = input.email.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !/^[^\s@]+@localhost$/i.test(email)
  ) {
    return { ok: false, status: 400, error: 'Invalid registration payload' };
  }
  if (input.password.length < 8 || input.password.length > 128) {
    return { ok: false, status: 400, error: 'Invalid registration payload' };
  }
  if (users.some((u) => u.email === email)) {
    return { ok: false, status: 409, error: 'Email already registered' };
  }
  const displayName =
    (input.displayName?.trim() || email.split('@')[0] || 'User').slice(0, 80);
  const user: DevUser = {
    id: cryptoRandomUuid(),
    email,
    displayName,
    passwordHash: hashPassword(input.password),
    role: 'user',
  };
  users.push(user);
  saveUsers();
  return { ok: true, user };
}

export function loginUser(
  emailRaw: string,
  password: string,
): { ok: true; user: DevUser } | { ok: false; status: number; error: string } {
  ensureSeedUser();
  const email = emailRaw.trim().toLowerCase();
  const user = users.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, status: 401, error: 'Invalid email or password' };
  }
  return { ok: true, user };
}

export function listPublicUsers(): PublicDevUser[] {
  ensureSeedUser();
  return users
    .map(toPublicUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function setUserRole(
  userId: string,
  role: 'user' | 'admin',
): { ok: true; user: DevUser } | { ok: false; status: number; error: string } {
  ensureSeedUser();
  const target = users.find((u) => u.id === userId);
  if (!target) return { ok: false, status: 404, error: 'User not found' };
  if (target.role === 'admin' && role === 'user') {
    const adminCount = users.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return { ok: false, status: 400, error: 'Cannot demote the last admin' };
    }
  }
  target.role = role;
  saveUsers();
  return { ok: true, user: target };
}

export function adminUserCount(): number {
  ensureSeedUser();
  return users.length;
}

export function adminCountByRole(): { admins: number; users: number } {
  ensureSeedUser();
  let admins = 0;
  let regular = 0;
  for (const u of users) {
    if (u.role === 'admin') admins += 1;
    else regular += 1;
  }
  return { admins, users: regular };
}
