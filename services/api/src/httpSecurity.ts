import type { FastifyInstance } from 'fastify';
import { config } from './config.js';

/** Baseline hardening headers (no extra dependency). */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.nodeEnv === 'production' && config.secureCookies) {
      reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    // API is JSON/binary — do not claim XSS-unsafe HTML.
    if (!reply.getHeader('Content-Security-Policy')) {
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    return payload;
  });
}
