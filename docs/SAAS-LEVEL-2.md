# Talaria-Log — Level 2 SaaS Launch (Full)

**Goal:** Multi-user SaaS that can serve ~1k active chart users without putting full OHLC into Postgres or the browser paint path.

**North star (unchanged):** CDN/object storage = candles · Postgres = people/meta · Browser = IDB cache + ≤2500 viewport.

---

## 1. What Level 2 includes

| Capability | Status in this repo |
|---|---|
| Production API (`services/api`) | Implemented |
| Postgres schema (users, ACL, datasets, chunks meta, sessions, drawings, trades, journal, jobs) | Implemented (`sql/001_init.sql`) |
| Auth (register / login / logout / session cookie) | Implemented |
| Object storage (MinIO S3) + disk fallback | Implemented |
| Redis job queue (ingest + backtest stub worker) | Implemented |
| Rate limits + health/ready | Implemented |
| Docker Compose (Postgres + Redis + MinIO + API) | Implemented |
| Vite proxy to real API when SaaS is up | Implemented |
| Client Import-from-API → IDB → chart ≤2500 | Already shipped |
| Billing / SSO / HA multi-region | Deferred (Level 3) |

---

## 2. Target architecture

```
Browser (React + Canvas ≤2500)
    │  HTTPS
    ▼
Nginx / Caddy (TLS, static SPA)
    │
    ├─ /api/v1/*  → API (stateless, N replicas)
    │                 ├─ Postgres (meta, auth, ACL, jobs)
    │                 ├─ Redis (sessions optional + BullMQ)
    │                 └─ S3/MinIO (chunk .bin files)
    │
    └─ /assets/*  → SPA + CDN

Browser after import:
  IndexedDB range cache → viewport loader → Canvas
```

---

## 3. Data path (production)

1. **Ingest (admin / job)** — CSV/feed → pack 28-byte bars → upload chunks to S3 → write `datasets` + `dataset_chunks` rows.
2. **User import** — `GET /datasets` → `GET .../chunks` → `GET` binaries → `putChunk` / `putSeriesMeta` in IndexedDB → catalog `source: 'remote'`.
3. **Chart** — session open → load ≤2500 bars from IDB → pan prefetch / LOD → paint. VPS mostly idle after warm cache.
4. **Backtest** — interactive: client Worker; heavy: `POST /jobs/backtest` → Redis worker → persist `backtest_runs` + `trades`.

---

## 4. Capacity planning (~1k monthly actives)

Assumptions: ~100 concurrent chart sessions peak; each opens 1–2 datasets; 70% IDB cache hits after first week.

| Resource | Recommendation | Why |
|---|---|---|
| API | 2× 1–2 vCPU / 2 GB | Stateless JSON + auth |
| Postgres | 1× 2 vCPU / 4 GB | Meta only (GBs, not TBs) |
| Redis | 1× 1 GB | Jobs + rate limit |
| Object storage | S3/R2/MinIO 100–500 GB | Chunk binaries |
| CDN | Cloudflare / R2 public | Offload GETs |
| Bandwidth | ~50–200 GB/mo early | First imports dominate |

### Rough monthly cost (USD, ballpark)

| Stack | ~Cost / month |
|---|---|
| Single VPS all-in-one (4 vCPU / 8 GB) + backups | $40–80 |
| Managed: Fly/Render API + Neon Postgres + Upstash Redis + R2 | $60–150 |
| With CDN + monitoring (Sentry/Better Stack) | +$20–40 |

**Chart concurrency is not the bottleneck** if chunks are on CDN and the browser stays ≤2500 bars. Backtest workers scale separately.

---

## 5. Launch checklist

### A. Infrastructure
- [ ] DNS + TLS (Caddy/Nginx or platform)
- [ ] `docker compose -f docker-compose.yml up -d` (or managed equivalents)
- [ ] Persistent volumes for Postgres + MinIO
- [ ] Nightly Postgres backups + S3 versioning
- [ ] Secrets in env / vault (never commit `.env`)

### B. Security
- [ ] Change `JWT_SECRET` / `SESSION_SECRET` (32+ random bytes)
- [ ] Change default MinIO + Postgres passwords
- [ ] HTTPS only in production (`SECURE_COOKIES=true`)
- [ ] CORS allowlist = real SPA origin
- [ ] Rate limits on auth + import endpoints
- [ ] ACL enforced on every dataset/chunk route

### C. Data
- [ ] Run migrations (`npm run saas:migrate`)
- [ ] Seed admin user + demo dataset (`npm run saas:seed`)
- [ ] Upload real symbol packs (1m + pre-agg TFs)
- [ ] Verify Import → Create Session → chart ≤2500

### D. App
- [ ] Build SPA (`npm run build`) → serve static
- [ ] `VITE_API_BASE` / proxy points at production API
- [ ] Smoke: register, login, import, pan, backtest, journal
- [ ] Mobile ~390px pass

### E. Ops
- [ ] `/api/v1/health` + `/api/v1/ready` in uptime monitor
- [ ] Log aggregation + error tracking
- [ ] Alert on API 5xx, Postgres disk, queue depth
- [ ] Runbook: rotate secrets, restore backup, purge bad dataset

### F. Product gates before public
- [ ] Terms + privacy
- [ ] Soft launch invite list
- [ ] Quota: max datasets / import bytes per user (env knobs)
- [ ] Status page

---

## 6. Local SaaS mode (developers)

**Requires Docker Desktop** (or compatible engine) for Postgres / Redis / MinIO.

```bash
# 0) One-time
cp .env.example .env
npm run saas:install

# 1) Start Postgres + Redis + MinIO
npm run saas:up

# 2) Migrate + seed demo dataset (disk or S3 per STORAGE_DRIVER)
npm run saas:migrate
npm run saas:seed

# 3) API process
npm run saas:api

# 4) Vite with proxy → real API (keeps Dukascopy plugin)
npm run saas:dev
```

- SPA: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787/api/v1/health  
- MinIO console: http://127.0.0.1:9001 (when `STORAGE_DRIVER=s3`)

**Disk-only API (no MinIO):** set `STORAGE_DRIVER=disk` in `.env`, still need Postgres (+ Redis optional; jobs degrade to stub complete).

**Zero-Docker chart work still works:** `npm run dev` uses the Vite disk stub (`server/apiPlugin.ts`) — no Postgres required.

---

## 7. Quotas (defaults)

| Limit | Default | Env |
|---|---|---|
| Datasets per user | 50 | `QUOTA_DATASETS_PER_USER` |
| Import bytes / day | 2 GB | `QUOTA_IMPORT_BYTES_DAY` |
| Backtest jobs / hour | 30 | `QUOTA_BACKTEST_HOUR` |
| Max bars / interactive backtest (client) | 50_000 | `MAX_BACKTEST_BARS` (client) |

---

## 8. Level 3 (later — not in this drop)

- Org / team tenancy + SSO (SAML/OIDC)
- Audit log export
- Multi-region HA + read replicas
- Billing (Stripe)
- Dedicated worker fleet autoscaling
- SOC2-oriented controls

---

## 9. Success metrics

| Metric | Target |
|---|---|
| p95 chart open (warm IDB) | < 300 ms to first paint |
| p95 pan hitch | No IDB stall mid-buffer; edge refill async |
| API p95 meta | < 100 ms |
| Chunk GET cache hit (CDN) | > 80% after week 1 |
| Heap in tab | Flat while panning (≤2500 bars × panes) |

---

## 10. File map

| Path | Role |
|---|---|
| `docs/SAAS-LEVEL-2.md` | This plan |
| `docker-compose.yml` | Postgres, Redis, MinIO, API |
| `.env.example` | Secrets template |
| `services/api/` | Production Fastify API |
| `services/api/sql/001_init.sql` | Schema |
| `vite.config.ts` | Optional proxy to `:8787` |
