import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { query } from './db.js';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(`${config.sessionSecret}:${token}`).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions_auth (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expires.toISOString()],
  );
  return token;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await query(`DELETE FROM sessions_auth WHERE token_hash = $1`, [hashToken(token)]);
}

export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await query<{
    id: string;
    email: string;
    display_name: string;
    role: 'user' | 'admin';
  }>(
    `SELECT u.id, u.email, u.display_name, u.role
     FROM sessions_auth s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(config.cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, { path: '/' });
}

export async function attachUser(req: FastifyRequest): Promise<void> {
  const token = req.cookies[config.cookieName];
  req.user = await userFromToken(token);
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!req.user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }
  return req.user;
}

export function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
