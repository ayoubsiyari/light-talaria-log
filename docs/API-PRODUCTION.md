# Talaria API — Production readiness (multi-user safe)

Goal: many users open the same symbols at once without melting Postgres or a single Node process.

**North star:** CDN/object storage = candles · Postgres = people/meta · Browser = IDB + ≤2500 bars.

---

## How concurrent users stay smooth

| Layer | Role under load |
|---|---|
| Browser | ≤2500 paint bars; IDB sliding window; pan/play tops up ~1–2 chunks |
| API | Auth, ACL, chunk **index** (JSON), optional origin for private binaries |
| CDN / S3 | Serve immutable `.bin` chunks for `public_read` (hot path) |
| Postgres | Meta + ACL only — never row-per-bar OHLC |
| Redis | Distributed rate limits + job queue |
| Quotas | Per-user import / download / backtest caps |

Many users reading EURUSD share the **same static chunk files**. That is cheap once a CDN is warm.

---

## What this repo implements

### Security & abuse
- [x] Session cookies (`httpOnly`, `sameSite`, optional `secure`)
- [x] ACL on every dataset / chunk / file route
- [x] Global + per-route rate limits (auth / publish / chunks / jobs)
- [x] Redis-backed rate limit store when Redis is up (memory fallback)
- [x] Security headers (`X-Content-Type-Options`, `X-Frame-Options`, CSP, HSTS when secure)
- [x] CORS allowlist (comma-separated `CORS_ORIGIN`)
- [x] Production fail-fast on default `SESSION_SECRET`
- [x] Chunk PUT size + 28-byte alignment checks
- [x] Timeframe / UUID validation

### Bandwidth & concurrency
- [x] `MAX_CHUNKS_PER_QUERY` paging (`truncated` + `nextFromTime`)
- [x] Client follows pages on warm-cache / range ingest
- [x] Soft daily **download** quota for private authenticated GETs
- [x] Import byte quota on publish
- [x] Cache-Control + ETag / 304 on chunk binaries
- [x] `CDN_PUBLIC_BASE` → public_read chunk URLs skip API for bytes

### Ops
- [x] `/api/v1/health` + `/api/v1/ready` (Postgres + Redis probe)
- [x] Env knobs documented in `.env.example`
- [ ] External CDN / Cloudflare in front of S3 (ops — not code)
- [ ] Uptime monitor + log aggregation (ops)
- [ ] Nightly Postgres backups (ops)

---

## Recommended production topology

```
Users → CDN (SPA assets)
      → CDN (public chunk .bin)  ←── S3/R2 origin
      → API replicas (N)         ←── Postgres + Redis
```

1. Set `CDN_PUBLIC_BASE=https://chunks.yourcdn.com`
2. Point CDN origin at S3 bucket prefix `datasets/` **or** at API `/api/v1/files/datasets/`
3. Keep private datasets on API URLs (cookies + ACL)
4. `SECURE_COOKIES=true`, strong `SESSION_SECRET`, real `CORS_ORIGIN`
5. Run `npm run saas:migrate` (applies `sql/001_*.sql` + `002_download_quota.sql`)

---

## Env cheat sheet

See repo-root `.env.example`. Critical for multi-user:

| Var | Why |
|---|---|
| `CDN_PUBLIC_BASE` | Offload hot chunk GETs |
| `RATE_LIMIT_*` | Stop scrape / login floods |
| `MAX_CHUNKS_PER_QUERY` | Cap meta fan-out per request |
| `QUOTA_DOWNLOAD_BYTES_DAY` | Soft private bandwidth guard |
| `QUOTA_IMPORT_BYTES_DAY` | Publish abuse guard |

---

## Smoke (multi-user)

1. Publish a `public_read` dataset (or seed demo).
2. Two browsers / users: Create Session → Start → chart ≤2500.
3. With `CDN_PUBLIC_BASE` set, Network tab shows chunk hosts on the CDN.
4. Hammer login → expect 429 after `RATE_LIMIT_AUTH_RPM`.
5. `/api/v1/ready` → `{ ok: true, postgres: true }`.

---

## What still hurts if you skip CDN

Serving every `.bin` from a single VPS disk/API process works for demos and small teams. At hundreds of concurrent cold opens, put chunks behind a CDN — the API was designed for that path (`publicFileUrl` + Cache-Control).
