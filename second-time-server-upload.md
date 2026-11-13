# Second-Time (Update) Server Deploy Guide

Steps for pushing an update to an **already-running** server — assumes the server was already set up once (Postgres database exists and is reachable, env vars are already configured, the Super Admin account already exists). This is not the first-time setup guide.

## 0. What this app actually is, before you deploy it anywhere

- **Not a serverless app.** `server.ts` is a custom Node server that runs Next.js *and* Socket.IO (live chat + live notifications) on the same port, in one long-running process. It needs a host that runs a persistent process — a VM, a container, a platform like Railway/Render/a bare EC2/Droplet — **not** Vercel's serverless functions (the README's default "Deploy on Vercel" section does not apply to this app as it stands).
- **Single process, single instance.** Socket.IO's state is in-memory (`src/lib/socket.ts` says this explicitly) — don't run 2+ replicas behind a load balancer without adding a shared adapter (e.g. Redis) first, or chat/notifications will randomly miss people connected to the other instance.
- **Production mode matters.** `npm run dev` runs Next in dev mode (slow, unoptimized, recompiles on the fly). Real traffic should run `npm run start`, which sets `NODE_ENV=production` and expects a build to already exist.

## 1. Before you touch the server

- [ ] Confirm what's changing: `git log <deployed-commit>..HEAD --oneline` — especially whether any file under `migrations/` is new (you'll need step 4).
- [ ] If the update includes schema changes, consider whether a quick `pg_dump` backup of the production database is warranted first. Non-destructive migrations (new column, new index) are low-risk; anything that drops/renames a column is not — check the migration files themselves.

## 2. Pull and install

```bash
git pull origin main
npm ci
```

`npm ci` (not `npm install`) — installs exactly what `package-lock.json` pins, no surprise version drift on a server you're not actively developing on.

## 3. Run pending migrations

```bash
npm run migrate
```

Safe to run every deploy, even with nothing new — `scripts/migrate.ts` tracks which migrations already ran and only applies new ones. Watch the output: it logs which migration files it actually applied.

## 4. Build

```bash
npm run build
```

This runs `next build`. If it fails, **stop here** — do not restart the running server with a broken build sitting on disk.

## 5. Restart the process

How you do this depends on what's actually running the process (not something this repo configures — no `pm2`/`systemd`/`Dockerfile` is checked in as of this writing). Whatever it is, the restart needs to run:

```bash
npm run start
```

which is `NODE_ENV=production tsx server.ts` — verify the process that comes back up is actually running with `NODE_ENV=production` (dev mode silently "works" too, just slow — easy to not notice you're serving production traffic in dev mode).

Common cases:
- **systemd:** `sudo systemctl restart <service-name>`
- **pm2:** `pm2 restart <app-name>` (or `pm2 reload <app-name>` for a zero-downtime restart if running in cluster mode — note cluster mode would violate the single-instance Socket.IO constraint above unless you've since added a Redis adapter)
- **plain foreground process in a tmux/screen session:** kill it, re-run `npm run start`

## 6. Smoke-test

- [ ] Load the app, confirm you can log in.
- [ ] Open a page that hits the database (e.g. `/leads` or `/dashboard`) and confirm it renders with data, not an error.
- [ ] If the update touched chat/notifications, open two sessions and confirm a message/notification actually arrives live (confirms the socket server came back up correctly).

## 7. If something's wrong

- Build succeeded but the app errors at runtime → check the process's logs first (`journalctl -u <service> -f`, `pm2 logs <app-name>`, or whatever your setup uses).
- A migration failed partway → `scripts/migrate.ts` exits non-zero and doesn't mark the failed migration as applied; fix the SQL file and re-run `npm run migrate` — it'll retry only that one.
- Need to roll back → re-deploy the previous commit (steps 2–5 again on the old `HEAD`). There's no automated rollback for migrations here; a destructive one (dropped column, etc.) would need a hand-written reverse migration — there are none of those in `migrations/` currently, since nothing destructive has shipped yet.

## Reference: environment variables this process reads

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres connection string (`src/lib/db.ts`) |
| `NODE_ENV` | `production` vs dev mode (`server.ts`) |
| `PORT` | HTTP port, defaults to `3000` |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` | session cookie config |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | email announcements delivery |

`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_NAME`/`SUPER_ADMIN_PASSWORD` are only read by the one-time `npm run seed:admin` script — not needed for a repeat deploy, only the very first one.
