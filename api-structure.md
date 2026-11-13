# Sales CRM — API Structure

**45 route files, 62 total endpoints** (method+path combinations — e.g. `GET /api/leads` and `POST /api/leads` are 2 of the 62, both living in one `route.ts`).

## Architecture: modular monolith

This is a **modular monolith**, not microservices — one deployable process, one database, no API gateway, no separate backend service.

- **Single process.** `server.ts` runs the Next.js HTTP server *and* Socket.IO on the same port, in one Node process.
- **Single database.** One Postgres `Pool` (`src/lib/db.ts`), shared by every route and every page, raw SQL via `pg` — no ORM, no per-domain database.
- **Domain-organized internally, not service-split.** `src/lib/<domain>/` (leads, sales, users, payments, chat, calendar, audit, ...) mirrors `src/app/api/<domain>/` 1:1. Each `lib` domain folder holds the real business logic (`create.ts`, `update.ts`, `list.ts`, `types.ts`, ...) — a vertical-slice/feature-folder layout, not the classic horizontal `controllers/ services/ models/` split.
- **Route handlers are thin.** Each `route.ts` below just does: auth check → validate with Zod → call the matching `src/lib` function → serialize the response. The actual logic lives in `lib`, never in the route file.
- **REST-style, resource-oriented.** Plain HTTP verbs over noun routes, no GraphQL, no RPC framework.
- **Two entry points into the same logic.** Server Components (`page.tsx` files) call `src/lib` functions **directly, in-process**, for the initial SSR render — no HTTP round-trip. Client Components call the *same* logic through these `/api/...` routes for interactive work (search, pagination, mutations). The API isn't the only door into the business logic; it's the door client-side JS uses.

**Why this, instead of something else:**
- **Why not microservices:** this is a single internal sales CRM with one team and one deploy target — microservices would add network hops, deployment complexity, and distributed-transaction problems (e.g. the sale-number/payment-number advisory-lock logic in `src/lib/sales/`) for zero benefit at this scale. A monolith keeps one transaction, one connection pool, one place to look.
- **Why domain-folders instead of horizontal layers:** a horizontal split (`controllers/`, `services/`, `models/` each containing every domain) means touching "leads" requires editing three far-apart directories. Vertical slices (`src/lib/leads/`, `src/lib/sales/`, ...) keep everything about one domain in one place — easier to review, easier for a new file to find its home.
- **Why thin route handlers instead of logic-in-the-route:** keeping business logic in `src/lib` (not in `route.ts`) is what lets Server Components call it directly without going through HTTP at all — a route file with real logic inlined would force every SSR page to make a network call to itself.
- **Why raw SQL instead of an ORM:** direct control over the exact query (critical for the advisory-lock transactions and visibility-filtered list queries scattered through `src/lib`), and one less abstraction layer to learn/debug in a codebase this size.
- **The tradeoff this doesn't solve for free:** horizontal scaling. One process means one event-loop core for rendering/JSON work, and Socket.IO's in-memory state means you can't just run multiple replicas without adding a shared adapter (Redis) first — see `second-time-server-upload.md`. Fine for this app's actual scale; worth knowing if that changes.

---

Every listing below is a `route.ts` under `src/app/api/`. See **`API.md`** for full request/response bodies, error tables, and data shapes on the subset it documents (Auth, Users, Leads, Visits, Notifications, Services, Email Announcements, Tasks) — this file's job is a complete index with purpose, including the routes `API.md` doesn't cover yet (Sales, Payments, Companies, Calendar, Chat, Dashboard, Audit Logs, the rest of Users).

**Conventions** (same as `API.md`): base path `/api`, session cookie auth, every route requires a valid session except `POST /api/auth/login`; a valid session whose `mustChangePassword` is true gets `403` on everything except `POST /api/auth/change-password`. Route handlers are thin — they validate with Zod, call a `src/lib/<domain>` function, and serialize the result; the function is also what Server Components call directly (no HTTP) for SSR.

---

## Auth — `src/app/api/auth/`

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` | Authenticate with email+password, set the session cookie. Rate-limited (5 attempts / 15 min per email). |
| `POST /api/auth/logout` | Clear the session cookie and revoke the session server-side. |
| `POST /api/auth/change-password` | Set a new password. The one route `mustChangePassword` doesn't block — it's how that flag gets cleared. Revokes every *other* session. |

## Users — `src/app/api/users/`

| Method & path | Purpose |
|---|---|
| `POST /api/users` | Create an account (role-hierarchy gated — who can create which role lives in `canManage`, `src/lib/auth/roles.ts`). |
| `GET /api/users` | List/search accounts. `SUPER_ADMIN`/`HR`/`MARKETING_HEAD` only. |
| `PATCH /api/users/[id]` | Edit a user's profile, and/or activate/deactivate (deactivating revokes their sessions). |
| `POST /api/users/[id]/reset-access` | Issue a fresh one-time temp password; revokes the target's sessions. |
| `POST /api/users/[id]/restore` | Un-archive a soft-deleted user (clears `archived_at`). |
| `GET /api/users/me` *(implicit — see `PATCH`)* | *(no GET; profile is read via the session/layout, not this route)* |
| `PATCH /api/users/me` | Caller edits their own `phone`/`whatsappNumber`. |
| `PATCH /api/users/me/avatar` | Caller sets/clears their own avatar (base64 data URL, capped at ~400KB, client-compressed first). |
| `GET /api/users/roster` | Minimal `{id, name, role, avatar_url}` picker list for **any** authenticated user (capped at 50, narrow with `q`) — used by Calendar's attendee picker and Chat's contact picker, since `/api/users` itself is admin-only. |

## Leads — `src/app/api/leads/`

| Method & path | Purpose |
|---|---|
| `POST /api/leads` | Create a lead. `PRE_SALES`/`MARKETING_HEAD` only. |
| `GET /api/leads` | List/search/filter leads, scoped to what the caller's role+ownership can see. |
| `GET /api/leads/duplicates` | Advisory pre-create duplicate check (company/phone/email/website, normalized matching). `PRE_SALES`/`MARKETING_HEAD` only. |
| `GET /api/leads/export` | Export the (filtered) lead list as CSV or XLSX. |
| `POST /api/leads/transfer-bulk` | Transfer several leads' owners in one request/transaction. `MARKETING_HEAD` only. |
| `GET /api/leads/[id]` | Fetch one lead (+ its selected services). 404s identically whether it doesn't exist or isn't visible to the caller. |
| `PATCH /api/leads/[id]` | Edit a lead's fields, or archive it (`{ archived: true }`, one-way). |
| `GET /api/leads/[id]/activities` | The lead's activity timeline. |
| `POST /api/leads/[id]/activities` | Log a manual activity (note/call/meeting) — anyone who can see the lead. |
| `POST /api/leads/[id]/review` | Qualify / reject / return-for-info a `PENDING_REVIEW`/`MORE_INFO_REQUIRED` lead. `MARKETING_HEAD` only. |
| `POST /api/leads/[id]/assign` | Set the lead's Pre-sales owner and/or Salesperson. `MARKETING_HEAD` only. |
| `POST /api/leads/[id]/transfer` | Reassign a lead's owner(s) to someone else, with a required reason; reassigns its upcoming visits too. `MARKETING_HEAD` only. |
| `GET /api/leads/[id]/visits` | List a lead's scheduled/past client visits. |
| `POST /api/leads/[id]/visits` | Schedule a client visit for a Salesperson (with a same-slot conflict warning). `MARKETING_HEAD` only. |

## Client Visits — `src/app/api/visits/`

| Method & path | Purpose |
|---|---|
| `GET /api/visits/conflicts` | Pre-submit same-slot conflict check (what the UI calls before showing "schedule anyway?"). `MARKETING_HEAD` only. |
| `PATCH /api/visits/[id]` | Reschedule, cancel, or record the outcome of a visit — one endpoint, three `action` values, different caller per action (Marketing Head for reschedule/cancel, the assigned Salesperson for recording the outcome). |

## Companies — `src/app/api/companies/`

A **computed rollup** over `leads` (grouped by `company_name_normalized`), not its own table.

| Method & path | Purpose |
|---|---|
| `GET /api/companies` | List companies (one row per distinct normalized company name, aggregated from its leads). `SUPER_ADMIN`/`MARKETING_HEAD` only; `?archived=true` (fully-archived companies, i.e. every lead for that name is archived) is further restricted to `SUPER_ADMIN`. |
| `GET /api/companies/[name]` | Fetch one company's rollup + its leads. |
| `DELETE /api/companies/[name]` | Archive a company — sets `archived_at` on every one of its (currently active) leads. |
| `PATCH /api/companies/[name]` | Restore an archived company — clears `archived_at` on every one of its archived leads. |

## Sales — `src/app/api/sales/`

| Method & path | Purpose |
|---|---|
| `POST /api/sales` | Create a sale, optionally from a lead (converts it) or standalone, with an optional initial payment recorded in the same call. |
| `GET /api/sales` | List/search sales, scoped to what the caller can see (mirrors leads' ownership rule). |
| `GET /api/sales/[id]` | Fetch one sale + its services + its payments + computed `paid_amount`. |
| `POST /api/sales/[id]/payments` | Record a payment against a sale (generates a per-financial-year `payment_number` under an advisory lock). |
| `GET /api/sales/[id]/payments` | List a sale's payments. |

## Payments — `src/app/api/payments/`

| Method & path | Purpose |
|---|---|
| `GET /api/payments` | Cross-sale payment list/search — every payment the caller can see (joined with its sale's company/budget), not scoped to one sale like `GET /api/sales/[id]/payments` is. `SUPER_ADMIN`, `MARKETING_HEAD`, `PRE_SALES`, `SALESPERSON` (HR gets none). |

## Services — `src/app/api/services/`

| Method & path | Purpose |
|---|---|
| `GET /api/services` | List services (the "service interested" picklist). Non-Super-Admins only ever see `ACTIVE` ones. |
| `POST /api/services` | Create a service. `SUPER_ADMIN` only. |
| `PATCH /api/services/[id]` | Edit a service's name/description/status. `SUPER_ADMIN` only. |

## Calendar — `src/app/api/calendar/`

| Method & path | Purpose |
|---|---|
| `POST /api/calendar` | Create a calendar event, with optional invited attendees. |
| `GET /api/calendar` | List events, optionally bounded by `from`/`to`. |
| `PATCH /api/calendar/[id]` | Edit the event itself (title/description/type/time/attendee list) — not restricted to attendees. |
| `DELETE /api/calendar/[id]` | Delete an event (and its attendee rows, cascade). |
| `PATCH /api/calendar/[id]/respond` | An invited attendee's own response: completion status + remarks on the event they're attending. |

## Chat — `src/app/api/chat/`

Real-time delivery goes over Socket.IO (`message:send` etc. in `server.ts`), which calls the same `src/lib/chat/crud.ts` functions as these routes — the HTTP routes are history-load + a REST fallback for sending, not the primary path.

| Method & path | Purpose |
|---|---|
| `GET /api/chat/conversations` | List the caller's conversations (one per counterpart, with last message/unread count). |
| `GET /api/chat/messages` | Load message history with one other user (`?with=<userId>`). |
| `POST /api/chat/messages` | Send a message (REST fallback to the socket path) — also records a `CHAT_MESSAGE` notification for the recipient. |
| `POST /api/chat/read` | Mark every message from one counterpart as read; emits `messages:read` to that counterpart's socket room. |

## Notifications — `src/app/api/notifications/`

| Method & path | Purpose |
|---|---|
| `GET /api/notifications` | List the caller's own notifications (`?unread=true` to filter). |
| `PATCH /api/notifications/[id]` | Mark one of the caller's own notifications read (404s if it belongs to someone else — never confirms another user's notification exists). |
| `DELETE /api/notifications/[id]` | Delete one of the caller's own notifications (same ownership-as-404 rule). |

## Email Announcements — `src/app/api/email-announcements/`

| Method & path | Purpose |
|---|---|
| `POST /api/email-announcements` | Compose and send an announcement synchronously (one SMTP attempt per resolved recipient). `MARKETING_HEAD`/`SUPER_ADMIN` only. |
| `GET /api/email-announcements` | List announcements (`SUPER_ADMIN` sees all; `MARKETING_HEAD` sees their own). |
| `POST /api/email-announcements/[id]/retry` | Re-send to every currently-`FAILED` recipient of one announcement (atomic claim, so concurrent retries can't double-send a row). |

## Tasks — `src/app/api/tasks/`

| Method & path | Purpose |
|---|---|
| `POST /api/tasks` | Create a personal follow-up task; assigning it to someone else requires `MARKETING_HEAD`/`SUPER_ADMIN`. |
| `GET /api/tasks` | List tasks (`MARKETING_HEAD`/`SUPER_ADMIN` see everyone's; everyone else sees only tasks assigned to them). |
| `PATCH /api/tasks/[id]` | Update a task's status/title/description/due date/priority — only the assigned user may call this. |

## Dashboard — `src/app/api/dashboard/`

Client-side data for the dashboard's charts/tiles (the page itself is server-rendered; these back the parts that re-fetch on a period/metric toggle without a full page reload).

| Method & path | Purpose |
|---|---|
| `GET /api/dashboard/entries-series` | Time-series points for the "entries" chart (`?metric=LEADS\|SALES&period=TODAY\|WEEK\|MONTH`). |
| `GET /api/dashboard/super-admin-summary` | Period-scoped summary tiles for Super Admin: total sales, total leads, total companies, total payments received (`?period=...`). `SUPER_ADMIN` only. |

## Audit Logs — `src/app/api/audit-logs/`

| Method & path | Purpose |
|---|---|
| `GET /api/audit-logs` | List/search the audit trail. `SUPER_ADMIN` only. |

---

## Not an HTTP endpoint, but part of the API surface

- **Socket.IO** (`server.ts`, same port as the HTTP server): live chat message delivery/read receipts and live notification push. In-memory, single-process only — see `second-time-server-upload.md` for why that matters when deploying.
