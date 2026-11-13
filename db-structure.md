# Sales CRM — Database Structure

Postgres, accessed via a single shared `pg.Pool` (`src/lib/db.ts`) — no ORM, hand-written SQL.
Schema is built up by the numbered files in `migrations/` (0001 → 0033), run in order by `npm run migrate` (`scripts/migrate.ts` → `src/lib/migrate.ts`), which tracks what's already applied so re-running it is a no-op for existing migrations. This doc reflects the schema **after all 33 migrations** — i.e. the current shape of each table, not the history of how it got there (see the migration file names for that).

All `id` columns are `BIGSERIAL`. All foreign keys default to `ON DELETE RESTRICT`'s implicit Postgres behavior (blocks the delete) **except where explicitly noted** (`ON DELETE CASCADE` / `SET NULL`).

---

## Auth & Users

### `users`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| role | TEXT | `CHECK IN ('SUPER_ADMIN','HR','MARKETING_HEAD','PRE_SALES','SALESPERSON')` |
| name | TEXT NOT NULL | |
| email | TEXT NOT NULL UNIQUE | |
| password_hash | TEXT NOT NULL | argon2 |
| status | TEXT NOT NULL DEFAULT `'ACTIVE'` | `CHECK IN ('ACTIVE','INACTIVE')` |
| created_by | BIGINT → users.id | nullable (the super admin seed has none) |
| must_change_password | BOOLEAN NOT NULL DEFAULT false | set on account creation / password reset |
| employee_id, phone, whatsapp_number, avatar_url | TEXT | profile fields |
| designation | TEXT | free-text, shown instead of the role badge when set |
| archived_at | TIMESTAMPTZ | soft-delete; restored via `POST /api/users/[id]/restore` |
| created_at, updated_at | TIMESTAMPTZ | |

**Indexes:** `role`, `status`.

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| user_id | BIGINT NOT NULL → users.id | |
| token_hash | TEXT NOT NULL UNIQUE | the session cookie stores the raw token; only its hash is persisted |
| created_at, expires_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | set on logout, password change (other sessions), deactivation |

**Indexes:** `user_id`, `expires_at`.

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| actor_user_id | BIGINT → users.id | nullable |
| action | TEXT NOT NULL | free-text action name |
| target_table, target_id | TEXT, BIGINT | what was acted on |
| details | JSONB | arbitrary extra context |
| created_at | TIMESTAMPTZ | |

**Indexes:** `actor_user_id`, `created_at`.

---

## Leads

### `leads`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| company_name, company_name_normalized | TEXT NOT NULL | normalized = lowercased/punctuation-stripped, used for dedup matching and the Companies rollup |
| contact_person, designation | TEXT | |
| phone, phone_normalized | TEXT NOT NULL | |
| email, website, website_domain | TEXT | |
| industry, business_type, location | TEXT | |
| address, state, pincode | TEXT | |
| country | TEXT NOT NULL DEFAULT `'India'` | |
| gst_number | TEXT | |
| service_requirements | TEXT, nullable | legacy free-text, superseded by `lead_services` |
| estimated_budget | NUMERIC | |
| budget_type | TEXT | `CHECK IN ('ONE_TIME','MONTHLY','PART_PAYMENT','ADVANCE')`, nullable |
| lead_source | TEXT NOT NULL | `CHECK IN ('WEBSITE_ENQUIRY','GOOGLE_SEARCH','GOOGLE_ADS','GOOGLE_MAPS','FACEBOOK','INSTAGRAM','LINKEDIN','YOUTUBE','SMS_CAMPAIGN','REFERRAL','COLD_OUTREACH','WALK_IN','EXISTING_CLIENT','OTHER')` |
| priority | TEXT NOT NULL DEFAULT `'MEDIUM'` | `CHECK IN ('LOW','MEDIUM','HIGH')` |
| status | TEXT NOT NULL DEFAULT `'PENDING_REVIEW'` | `CHECK IN ('NEW','PENDING_REVIEW','MORE_INFO_REQUIRED','QUALIFIED','CONVERTED','REJECTED','ON_HOLD','CLOSED_WON','CLOSED_LOST')` |
| status_reason | TEXT | set by reject/return |
| pre_sales_owner_id, salesperson_owner_id | BIGINT → users.id | |
| next_follow_up_at | TIMESTAMPTZ | |
| notes, remarks, whatsapp_number | TEXT | |
| youtube_url, facebook_url, instagram_url, linkedin_url | TEXT | |
| archived_at | TIMESTAMPTZ | soft-delete, one-way via the API (no un-archive endpoint for leads themselves — archiving happens at the **company** level, see below) |
| created_by | BIGINT NOT NULL → users.id | |
| created_at, updated_at | TIMESTAMPTZ | |

**Indexes:** `status`, `pre_sales_owner_id`, `salesperson_owner_id`, `created_at`, `company_name_normalized`, `phone_normalized`, `website_domain`, `archived_at`.

> **Companies aren't a table.** `/api/companies` is a rollup computed by grouping `leads` on `company_name_normalized` (`src/lib/companies/list.ts`) — archiving/restoring a "company" sets/clears `archived_at` on every lead sharing that normalized name.

### `lead_activities`
Timeline entries per lead (notes, calls, meetings, and system-written entries for status changes/assignments/transfers/visits).
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| lead_id | BIGINT NOT NULL → leads.id | |
| actor_user_id | BIGINT NOT NULL → users.id | |
| type | TEXT NOT NULL | `CHECK IN ('NOTE','CALL','MEETING','OTHER','STATUS_CHANGE','ASSIGNMENT','TRANSFER','CLIENT_VISIT')` |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

**Indexes:** `lead_id`.

### `lead_assignments`
A full ownership snapshot written every time a lead's owners change (via assign or transfer) — history, not current state (current state lives on `leads` itself).
| Column | Type |
|---|---|
| id | BIGSERIAL PK |
| lead_id | BIGINT NOT NULL → leads.id |
| pre_sales_owner_id, salesperson_owner_id | BIGINT → users.id |
| changed_by | BIGINT NOT NULL → users.id |
| changed_at | TIMESTAMPTZ |

**Indexes:** `lead_id`.

### `lead_transfer_history`
Previous + new owners, reason, and who/when, for every transfer (distinct from `lead_assignments`, which also covers plain assign).
| Column | Type |
|---|---|
| id | BIGSERIAL PK |
| lead_id | BIGINT NOT NULL → leads.id |
| previous_pre_sales_owner_id, previous_salesperson_owner_id, new_pre_sales_owner_id, new_salesperson_owner_id | BIGINT → users.id |
| transferred_by | BIGINT NOT NULL → users.id |
| reason | TEXT NOT NULL |
| transferred_at | TIMESTAMPTZ |

**Indexes:** `lead_id`.

### `client_visits`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| lead_id | BIGINT NOT NULL → leads.id | |
| salesperson_id | BIGINT NOT NULL → users.id | |
| visit_date | DATE NOT NULL | |
| start_time | TIME NOT NULL | |
| expected_duration_minutes | INTEGER | |
| location, objective, preparation_notes, outcome_notes, next_action | TEXT | `objective` required |
| status | TEXT NOT NULL DEFAULT `'SCHEDULED'` | `CHECK IN ('SCHEDULED','COMPLETED','RESCHEDULED','CANCELLED','MISSED')` |
| created_by | BIGINT NOT NULL → users.id | |
| created_at, updated_at | TIMESTAMPTZ | |

**Indexes:** `(salesperson_id, visit_date, start_time)` — same-slot conflict checks; `lead_id`.

---

## Services

### `services`
Master list leads/sales pick "service interested" from.
| Column | Type |
|---|---|
| id | BIGSERIAL PK |
| name | TEXT NOT NULL UNIQUE |
| description | TEXT |
| status | TEXT NOT NULL DEFAULT `'ACTIVE'`, `CHECK IN ('ACTIVE','INACTIVE')` |
| created_at, updated_at | TIMESTAMPTZ |

### `lead_services` / `sale_services`
Pure join tables, identical shape:
| Column | Type |
|---|---|
| lead_id / sale_id | BIGINT NOT NULL → leads.id / sales.id |
| service_id | BIGINT NOT NULL → services.id |
| **PK** | `(lead_id, service_id)` / `(sale_id, service_id)` |

**Indexes:** `service_id` on each.

---

## Sales & Payments

### `sales`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| lead_id | BIGINT → leads.id | nullable — a sale can be created standalone, not just from a converted lead |
| company_name, contact_person, phone, email, address | TEXT | company_name required |
| budget_amount | NUMERIC NOT NULL | |
| budget_type | TEXT NOT NULL | `CHECK IN ('ONE_TIME','MONTHLY','PART_PAYMENT','ADVANCE')` |
| sale_date | DATE NOT NULL DEFAULT `CURRENT_DATE` | |
| sold_by_type | TEXT NOT NULL | `CHECK IN ('SELF','CUSTOM','PRE_SALES','SALESPERSON')` |
| sold_by_user_id | BIGINT → users.id | set when `sold_by_type` is `PRE_SALES`/`SALESPERSON` |
| sold_by_custom_name | TEXT | set when `sold_by_type` is `CUSTOM` |
| sale_number | TEXT UNIQUE | human-readable sequence number, per financial year (`src/lib/sales/saleNumber.ts`) |
| notes | TEXT | |
| created_by | BIGINT NOT NULL → users.id | |
| created_at, updated_at | TIMESTAMPTZ | |

**Indexes:** `lead_id`, `created_by`, `sold_by_user_id`, `sale_date`.

### `sale_payments`
Every payment received against a sale — reconciled against `sales.budget_amount` to compute paid/remaining.
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| sale_id | BIGINT NOT NULL → sales.id | |
| amount | NUMERIC NOT NULL | `CHECK (amount > 0)` |
| payment_method | TEXT NOT NULL | `CHECK IN ('CASH','CHEQUE','UPI','BANK_TRANSFER','CARD','OTHER')` |
| payment_date | DATE NOT NULL DEFAULT `CURRENT_DATE` | |
| payment_number | TEXT UNIQUE | human-readable sequence number, per financial year (`src/lib/sales/paymentNumber.ts`) |
| receipt_number, account_number | TEXT | |
| notes | TEXT | |
| recorded_by | BIGINT NOT NULL → users.id | |
| created_at | TIMESTAMPTZ | |

**Indexes:** `sale_id`, `payment_date`.

> Both `sale_number` and `payment_number` are generated inside a `BEGIN ... pg_advisory_xact_lock(...) ... COMMIT` transaction (one advisory lock per financial year, not a global lock), so two concurrent creates never collide on the same number.

---

## Calendar

### `calendar_events`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| title | TEXT NOT NULL | |
| description | TEXT | |
| type | TEXT NOT NULL DEFAULT `'MEETING'` | `CHECK IN ('MEETING','FOLLOW_UP','OTHER')` |
| starts_at | TIMESTAMPTZ NOT NULL | |
| created_by | BIGINT NOT NULL → users.id | |
| created_at | TIMESTAMPTZ | |

**Indexes:** `starts_at`.

### `calendar_event_attendees`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| event_id | BIGINT NOT NULL → calendar_events.id **ON DELETE CASCADE** | |
| user_id | BIGINT NOT NULL → users.id **ON DELETE CASCADE** | |
| status | TEXT NOT NULL DEFAULT `'PENDING'` | `CHECK IN ('PENDING','COMPLETED')` — the attendee's own completion state |
| remarks | TEXT | |
| **UNIQUE** | `(event_id, user_id)` | |

**Indexes:** `event_id`, `user_id`.

---

## Chat

### `direct_messages`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| sender_id, recipient_id | BIGINT NOT NULL → users.id | `CHECK (sender_id != recipient_id)` |
| body | TEXT NOT NULL | |
| reply_to_message_id | BIGINT → direct_messages.id **ON DELETE SET NULL** | quoted-reply target |
| read_at, delivered_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Indexes:** `(sender_id, created_at)`, `(recipient_id, created_at)`.

> No `conversations` table — a conversation is just "every `direct_messages` row between these two user ids," grouped in `src/lib/chat/crud.ts`'s `listConversations`.

---

## Notifications

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| recipient_user_id | BIGINT NOT NULL → users.id **ON DELETE CASCADE** | |
| type | TEXT NOT NULL | `CHECK IN ('LEAD_ASSIGNED','LEAD_TRANSFERRED','VISIT_SCHEDULED','VISIT_RESCHEDULED','VISIT_CANCELLED','CALENDAR_EVENT','CHAT_MESSAGE')` |
| lead_id | BIGINT → leads.id | nullable |
| related_user_id | BIGINT → users.id **ON DELETE SET NULL** | deep-link target (e.g. "whose chat message") |
| message | TEXT NOT NULL | |
| read_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Indexes:** `(recipient_user_id, read_at)`.

---

## Tasks

### `tasks`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| lead_id | BIGINT → leads.id | nullable — optional link |
| assigned_user_id | BIGINT NOT NULL → users.id | |
| title | TEXT NOT NULL | |
| description | TEXT | |
| due_at | TIMESTAMPTZ NOT NULL | |
| priority | TEXT NOT NULL DEFAULT `'MEDIUM'` | `CHECK IN ('LOW','MEDIUM','HIGH')` |
| status | TEXT NOT NULL DEFAULT `'PENDING'` | `CHECK IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')` |
| created_by | BIGINT NOT NULL → users.id | |
| created_at, completed_at | TIMESTAMPTZ | |

**Indexes:** `(assigned_user_id, due_at)`.

---

## Email Announcements

### `email_announcements`
| Column | Type |
|---|---|
| id | BIGSERIAL PK |
| sender_user_id | BIGINT NOT NULL → users.id |
| subject, body | TEXT NOT NULL |
| created_at | TIMESTAMPTZ |

*(No `updated_at` — announcements are never edited after sending.)*

### `email_recipients`
| Column | Type |
|---|---|
| id | BIGSERIAL PK |
| announcement_id | BIGINT NOT NULL → email_announcements.id |
| recipient_user_id | BIGINT NOT NULL → users.id |

**Indexes:** `announcement_id`.

### `email_logs`
Delivery status, one row per recipient (joined 1:1 to `email_recipients` by `recipient_id`).
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| recipient_id | BIGINT NOT NULL → email_recipients.id | |
| status | TEXT NOT NULL DEFAULT `'PENDING'` | `CHECK IN ('PENDING','SENT','FAILED','RETRYING')` |
| attempt_count | INTEGER NOT NULL DEFAULT 0 | |
| last_error | TEXT | |
| sent_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ NOT NULL | |

**Indexes:** `recipient_id`, `status`.

---

## Entity-relationship summary

```
users ──┬── sessions
         ├── leads (created_by, pre_sales_owner_id, salesperson_owner_id)
         │     ├── lead_activities
         │     ├── lead_assignments
         │     ├── lead_transfer_history
         │     ├── lead_services ── services
         │     └── client_visits
         ├── sales (created_by, sold_by_user_id, lead_id → leads)
         │     ├── sale_services ── services
         │     └── sale_payments
         ├── tasks (assigned_user_id, created_by, lead_id → leads)
         ├── calendar_events (created_by)
         │     └── calendar_event_attendees (user_id)
         ├── direct_messages (sender_id, recipient_id)
         ├── notifications (recipient_user_id, related_user_id, lead_id → leads)
         ├── email_announcements (sender_user_id)
         │     └── email_recipients (recipient_user_id)
         │           └── email_logs
         └── audit_logs (actor_user_id)
```

"Companies" has no table — it's `leads` grouped by `company_name_normalized`.
