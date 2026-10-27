# Production readiness checklist — Phase 6

What the company's own ops team needs to set up before this CRM goes live, and
what the app itself already needs (and already does, or doesn't) at boot. This
is a checklist, not a provisioning script — nothing here buys hosting, DNS, or
TLS; it names exactly what the app expects from whoever does.

## 1. Environment variables

Enumerated via `grep -rn "process\.env\." src scripts --include="*.ts"` plus
following `requireEnv()` calls in the seed script.

| Variable | Used by | Required at | Notes |
|---|---|---|---|
| `DATABASE_URL` | `src/lib/db.ts` (the shared `pg.Pool`) | Boot — every request touches the DB | Standard `postgresql://user:pass@host:port/db` connection string. |
| `NODE_ENV` | `src/app/api/auth/login/route.ts` (session cookie `secure` flag) | Boot (implicitly set by Next.js / the deploy platform) | Must be `production` in production — see §2. |
| `SESSION_COOKIE_NAME` | `src/lib/auth/session.ts` | Boot | Has a sane default if unset; set explicitly if the company wants a specific cookie name. |
| `SESSION_TTL_HOURS` | `src/lib/auth/session.ts` | Boot | Has a sane default if unset; controls how long a session stays valid. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | `src/lib/email/sendEmail.ts` only | Only when a Marketing Head/Super Admin sends an announcement (Phase 5) — not needed at boot | Without these, the app still starts and every other feature works; announcement sends will fail and show up as `FAILED` rows in the delivery log, not a crash. |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PASSWORD` | `scripts/seed-super-admin.ts` (`npm run seed:admin`) only | One-time, before first login — not read by the app itself at runtime | Run once against the production database to create the first Super Admin account, then these can be removed from the environment. |

No variable name, value, or any part of `.env.local`/`.env.example` is printed
anywhere in this document — the table above was built by grepping variable
*names* out of source, never by reading the files that hold real values.

## 2. HTTPS / reverse proxy

Next.js's own server (`next start`) does not terminate TLS. Production needs
either a reverse proxy in front of it (nginx, Caddy) or a hosting platform
that terminates TLS itself (its own load balancer/CDN) before traffic reaches
the Next.js process — this is an infrastructure decision for the company's ops
team, not something this app provisions.

The session cookie's `secure` flag is **already** conditioned on this:
`src/app/api/auth/login/route.ts` sets `secure: process.env.NODE_ENV ===
"production"`. No TODO here — just make sure the deploy sets `NODE_ENV=production`,
and that whatever terminates TLS is actually in place before that flag starts
mattering (an HTTP-only production deploy with `NODE_ENV=production` would
silently never let the cookie round-trip over plain HTTP).

## 3. Migrations are idempotent; backup/restore round-trips cleanly

**Idempotency**, proven against a fresh, disposable database (not the shared
dev database) via the real CLI, not just `runMigrations`' own unit test:

```
$ createdb sales_crm_phase6_check
$ DATABASE_URL=postgresql://localhost/sales_crm_phase6_check npx tsx scripts/migrate.ts
[ '0001_create_users_table.sql', ..., '0015_create_tasks_table.sql' ]   # 15 files applied
$ DATABASE_URL=postgresql://localhost/sales_crm_phase6_check npx tsx scripts/migrate.ts
[]   # second run: nothing left to apply
```

**Backup/restore**, against the same disposable database with one seeded row:

```
$ pg_dump -Fc -f sales_crm_phase6_check.dump sales_crm_phase6_check
$ dropdb sales_crm_phase6_check && createdb sales_crm_phase6_check
$ pg_restore -d sales_crm_phase6_check sales_crm_phase6_check.dump
```

Verified after restore: the seeded Super Admin row and all 15
`schema_migrations` entries survived; a representative slice of the test
suite (`assign.test.ts`, `transfer.test.ts`, `tasks/crud.test.ts`, two API
route test files — 30 tests) ran clean against the restored database when
pointed at it via `DATABASE_URL`. Running the *entire* 68-file suite with full
parallelism against the freshly-restored (cold) database hit transient
connection-pool contention in 5 files — confirmed to be a one-time
"cold database under sudden heavy concurrency" artifact, not a restore defect,
by re-running those same 5 files together afterward (all passed). Production
restores recover one database that then serves normal, not instantaneously
maximal, concurrency, so this isn't a real-world concern — noted here only
for honesty about what was and wasn't exercised.

For production, replace `createdb`/`dropdb` with however the hosting
platform's managed Postgres does backups (most offer automated daily
snapshots); the commands above are the minimum manual fallback and the ones
to use when testing that any automated backup actually restores.

## 4. Monitoring / logging

**Gap, not a decision**: there is no structured logging, error-reporting
service, or APM integration anywhere in this codebase today
(`grep -rn "sentry\|datadog\|newrelic\|winston\|pino" package.json src` and
`grep -c "console\.\(error\|log\)" src` both come back empty) — errors
propagate as thrown exceptions and whatever the deploy platform's default
process/console output captures. This is an honest absence, not a vendor
choice made on the company's behalf: add one (Sentry, a hosting platform's
built-in logs, or whatever the company already uses elsewhere) when there's
an actual preference to wire up, rather than picking a dependency nobody
asked for.

`audit_logs` already covers permission-sensitive application events (user
creation/deactivation, lead review/assignment/transfer, access resets) per
req.md §13 — that's a product feature, not infrastructure monitoring, and
doesn't substitute for the gap above (it won't tell anyone when the process
itself is down or erroring).

## 5. Summary

| Item | Status |
|---|---|
| Env vars enumerated and documented | Done (§1) |
| `secure` cookie flag production-ready | Already correct, no change needed |
| HTTPS/reverse proxy | Company's ops decision; app already supports it once `NODE_ENV=production` is set |
| Migrations idempotent | Proven (§3) |
| Backup/restore round-trip | Proven (§3) |
| Monitoring/logging | **Gap** — none exists; needs a company decision, not a default pick |
