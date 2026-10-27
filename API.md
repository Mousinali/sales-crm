# Sales CRM — API Documentation

**Status:** reflects `main`, including Phase 4 (transfers, visits, notifications). See `TODO.md` for what's implemented vs. planned.

## Conventions

- **Base path:** all endpoints are under `/api`.
- **Auth:** session-based, via an HTTP-only cookie (`SESSION_COOKIE_NAME`, set by `POST /api/auth/login`). No separate API key or bearer token. Every endpoint except `/api/auth/login` and `/api/auth/logout` requires a valid session.
- **The standard auth preamble.** Every endpoint below runs the same two checks before anything else, in order, and they're not re-listed per endpoint:
  1. No valid session → `401 { "error": "Unauthorized" }`
  2. Valid session but the account must change its password first (`mustChangePassword`) → `403 { "error": "Forbidden" }`

  Only errors *beyond* this preamble are listed under each endpoint.
- **Request bodies:** JSON, validated with Zod. A body that fails validation (wrong type, missing required field, empty string where `min(1)` is required) → `400 { "error": "Invalid input" }` (or `"Invalid query"` for GET query-param validation).
- **IDs:** path segments like `[id]` must parse as an integer; a non-integer value → `400 { "error": "Invalid id" }`.
- **Role names:** `SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON`.
- **Response field casing:** when an endpoint returns a full database row (a lead or a user), the fields are the raw DB column names — **snake_case** (`company_name`, `created_at`, `pre_sales_owner_id`, ...). When an endpoint returns a purpose-built, non-row shape (e.g. the minimal duplicates projection), fields are **camelCase**. This is called out per endpoint below.

---

## Authentication

### `POST /api/auth/login`

No session required.

**Body:**
```json
{ "email": "string, required", "password": "string, required" }
```

**Success:** `200 { "ok": true }` — sets the session cookie.

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid credentials" }` | malformed body |
| 401 | `{ "error": "Invalid credentials" }` | no such user, user not `ACTIVE`, or wrong password — same message in every case, so a failed login never reveals which part was wrong |
| 429 | `{ "error": "Too many attempts. Try again later." }` | 5 attempts within 15 minutes for this `email` — a successful login resets the count |

### `POST /api/auth/logout`

No session required (no-op if there isn't one).

**Body:** none.

**Success:** `200 { "ok": true }` — clears the cookie and revokes the session server-side.

### `POST /api/auth/change-password`

Requires a session (this is the one endpoint the `mustChangePassword` check does **not** block — it's how that flag gets cleared).

**Body:**
```json
{ "currentPassword": "string, required unless mustChangePassword is true", "password": "string, min 8 chars" }
```

**Success:** `200 { "ok": true }` — revokes every *other* session for the user (this one's session cookie stays valid).

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Password must be at least 8 characters" }` | new password too short |
| 403 | `{ "error": "Current password is incorrect" }` | `currentPassword` missing (when required) or wrong |
| 429 | `{ "error": "Too many attempts. Try again later." }` | 5 wrong-`currentPassword` guesses within 15 minutes for this user (only once `mustChangePassword` is false — that's the one case `currentPassword` is actually checked); a correct guess resets the count |

---

## Users (Team)

### `POST /api/users`

Create an account. Who can create which role is enforced server-side (`canManage` in `src/lib/auth/roles.ts`):

| Creator role | May create |
|---|---|
| `SUPER_ADMIN` | `HR`, `MARKETING_HEAD` |
| `HR` | `MARKETING_HEAD`, `PRE_SALES`, `SALESPERSON` |
| `MARKETING_HEAD` | `PRE_SALES`, `SALESPERSON` |
| `PRE_SALES`, `SALESPERSON` | nothing |

**Body:**
```json
{ "role": "one of the Role names", "name": "string, required", "email": "string, valid email" }
```

**Success:** `201`
```json
{ "id": 123, "email": "new.user@example.com", "tempPassword": "shown once, never again" }
```
The new account must change this password on first login (`mustChangePassword` is set).

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | the creator's role can't create the requested role |
| 409 | `{ "error": "Email already in use" }` | email already taken |

### `GET /api/users`

List/search accounts. Caller role must be `SUPER_ADMIN`, `HR`, or `MARKETING_HEAD` — anyone else gets a 403 here (unlike most GETs, this one *does* have an extra route-level role gate, not just a visibility filter).

**Query params (all optional):** `role`, `status` (`ACTIVE`|`INACTIVE`), `q` (search string).

**Success:** `200 { "users": [UserRow, ...] }` — see [UserRow](#userrow) below.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller role isn't `SUPER_ADMIN`/`HR`/`MARKETING_HEAD` |

### `PATCH /api/users/[id]`

Edit a user's profile and/or activate/deactivate them. Requires at least one field. Manageability (who can edit whom) is the same `canManage` hierarchy as creation, checked against the *target's current role*.

**Body (≥1 key):**
```json
{ "name": "string, optional", "email": "string, optional, valid email", "status": "ACTIVE | INACTIVE, optional" }
```

**Success:** `200 { "ok": true }`

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | no fields given, or bad shape |
| 403 | `{ "error": "Forbidden" }` | caller can't manage the target |
| 404 | `{ "error": "Not found" }` | target id doesn't exist |
| 409 | `{ "error": "Email already in use" }` | email already taken by someone else |

Setting `status: "INACTIVE"` revokes all of that user's sessions immediately.

### `POST /api/users/[id]/reset-access`

Issue a fresh one-time temporary password for a user (same manageability rule as PATCH). No body.

**Success:** `200 { "tempPassword": "shown once" }` — revokes all of the target's existing sessions and sets `mustChangePassword`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller can't manage the target |
| 404 | `{ "error": "Not found" }` | target id doesn't exist |

---

## Leads

Visibility is role **and ownership** scoped, enforced inside the library functions (`listLeads`/`assertLeadVisible`), not just at the route:

| Role | Sees |
|---|---|
| `SUPER_ADMIN`, `MARKETING_HEAD` | every lead |
| `PRE_SALES` | leads they created, or whose `pre_sales_owner_id` is them |
| `SALESPERSON` | leads whose `salesperson_owner_id` is them |
| `HR` | none — `GET /api/leads` returns `[]`; every per-lead route 404s |

### `POST /api/leads`

Create a lead. Only `PRE_SALES` and `MARKETING_HEAD` may create one.

**Body:**
```json
{
  "companyName": "string, required",
  "phone": "string, required",
  "serviceIds": "number[], required, at least 1 — see Services below",
  "serviceRequirements": "string, optional — legacy free-text, superseded by serviceIds",
  "leadSource": "WEBSITE_ENQUIRY | REFERRAL | COLD_OUTREACH | EXISTING_CLIENT | OTHER, required",
  "contactPerson": "string, optional",
  "designation": "string, optional",
  "email": "string, optional, valid email",
  "website": "string, optional",
  "industry": "string, optional",
  "businessType": "string, optional",
  "location": "string, optional",
  "address": "string, optional",
  "state": "string, optional",
  "pincode": "string, optional",
  "country": "string, optional, default \"India\"",
  "estimatedBudget": "number, optional",
  "priority": "LOW | MEDIUM | HIGH, optional, default MEDIUM",
  "notes": "string, optional",
  "whatsappNumber": "string, optional",
  "remarks": "string, optional"
}
```

**Success:** `201 <LeadRow & { services: ServiceRow[] }>` — see [LeadRow](#leadrow)/[ServiceRow](#servicerow). Status always starts at `PENDING_REVIEW`. If the creator is `PRE_SALES`, `pre_sales_owner_id` defaults to them.

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | `serviceIds` missing/empty, or any other validation failure |
| 403 | `{ "error": "Forbidden" }` | creator role isn't `PRE_SALES`/`MARKETING_HEAD` |

### `GET /api/leads`

List/search/filter leads (scoped per the visibility table above — no extra role gate at the route).

**Query params (all optional):**

| Param | Type |
|---|---|
| `status` | `NEW\|PENDING_REVIEW\|MORE_INFO_REQUIRED\|QUALIFIED\|CONVERTED\|REJECTED\|ON_HOLD\|CLOSED_WON\|CLOSED_LOST` |
| `source` | same values as `leadSource` above |
| `priority` | `LOW\|MEDIUM\|HIGH` |
| `ownerId` | number — matches either owner column |
| `dateFrom` | date string — leads created on/after this day |
| `dateTo` | date string — leads created on/before the end of this day |
| `q` | string — matches company name, phone, email, or website |
| `includeArchived` | `"true"` to include archived leads (default: excluded) |

**Success:** `200 { "leads": [LeadRow, ...] }`

### `GET /api/leads/duplicates`

Advisory duplicate check — call before creating a lead. Restricted to `PRE_SALES`/`MARKETING_HEAD` (the same roles that can create a lead); everyone else, including `SUPER_ADMIN`, gets 403.

**Query params:** `companyName` (required), `phone`, `email`, `website` (all optional — the check uses whichever are present).

**Success:** `200 { "duplicates": [{ "id": 1, "companyName": "Acme Corp", "status": "PENDING_REVIEW" }, ...] }` — **note the camelCase here**: this is a minimal, purpose-built projection, not a raw `LeadRow`. It deliberately excludes every other field (service requirements, notes, contact info) so the check can't be used to read another lead's details. Matching is normalized (case/punctuation-insensitive) with a minimum-usefulness bar per field — a placeholder value like `"N/A"` or a too-short phone fragment never matches.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller role isn't `PRE_SALES`/`MARKETING_HEAD` |
| 400 | `{ "error": "Invalid query" }` | `companyName` missing |

### `GET /api/leads/[id]`

Fetch one lead.

**Success:** `200 <LeadRow & { services: ServiceRow[] }>` — `services` is the lead's current "service interested" selection.

**Errors:**
| Status | Body | When |
|---|---|---|
| 404 | `{ "error": "Not found" }` | the id doesn't exist, **or** it exists but the caller can't see it — both cases return 404, deliberately, so a 403 never confirms a lead's existence to someone who shouldn't know about it |

### `PATCH /api/leads/[id]`

Edit a lead's fields, or archive it. `SALESPERSON` and `HR` can never edit; `PRE_SALES` only if they created it or are its current `pre_sales_owner_id`; `MARKETING_HEAD` always.

**Body (≥1 key):** any of `companyName`, `contactPerson`, `designation`, `phone`, `whatsappNumber`, `email`, `website`, `industry`, `businessType`, `location`, `address`, `state`, `pincode`, `country`, `serviceRequirements`, `serviceIds` (number[], min 1 if given — **replaces** the lead's full service selection, not a merge), `estimatedBudget` (number), `priority`, `nextFollowUpAt` (date), `notes`, `remarks` — plus:
```json
{ "archived": true }
```
`archived` only accepts the literal `true`. Archiving is **one-way** — there is no `archived: false` to reverse it.

**Success:** `200 { "ok": true }` (unlike every other lead-mutation endpoint, this one does **not** return the updated row — fetch `GET /api/leads/[id]` afterward if you need it).

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | wrong role, or a Pre-sales caller who isn't the owner/creator |
| 404 | `{ "error": "Not found" }` | lead doesn't exist |

### `GET /api/leads/[id]/activities`

The lead's activity timeline (visibility = same rule as the lead itself).

**Success:** `200 { "activities": [LeadActivityRow, ...] }`, newest first — see [LeadActivityRow](#leadactivityrow).

**Errors:** `404 { "error": "Not found" }` (not found or not visible).

### `POST /api/leads/[id]/activities`

Log a manual activity (a call, meeting, or note). Anyone who can *see* the lead may log one — there's no extra role gate beyond visibility, so an assigned `SALESPERSON` can log activities on their own lead.

**Body:**
```json
{ "type": "NOTE | CALL | MEETING | OTHER", "notes": "string, optional" }
```
`STATUS_CHANGE` and `ASSIGNMENT` are system-only activity types — they can't be posted here; they're written automatically by the review and assign endpoints below.

**Success:** `201 { "ok": true }` (no row returned — re-fetch the activities list if needed).

**Errors:** `404 { "error": "Not found" }`.

### `POST /api/leads/[id]/review`

Qualify, reject, or send a lead back for more information. `MARKETING_HEAD` only, and only on a lead currently `PENDING_REVIEW` or `MORE_INFO_REQUIRED`.

**Body:**
```json
{ "action": "QUALIFY | REJECT | RETURN", "reason": "string, required for REJECT and RETURN" }
```

**Success:** `200 <LeadRow>` (the updated lead). Also writes a `STATUS_CHANGE` activity automatically.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller isn't `MARKETING_HEAD`, or the lead isn't in a reviewable status |
| 400 | `{ "error": "A reason is required to reject a lead" }` (or `"...return a lead"`) | `reason` missing/empty on `REJECT`/`RETURN` |
| 404 | `{ "error": "Not found" }` | lead doesn't exist |

### `POST /api/leads/[id]/assign`

Set the lead's Pre-sales owner and/or Salesperson. `MARKETING_HEAD` only.

**Body (≥1 key):**
```json
{ "salespersonId": "number, optional", "preSalesOwnerId": "number, optional" }
```

**Business rules**, all enforced as a `403` (not a separate status code):
- The target user must exist, be `ACTIVE`, and hold the matching role (`SALESPERSON` for `salespersonId`, `PRE_SALES` for `preSalesOwnerId`).
- Setting `salespersonId` additionally requires the lead's own status be `QUALIFIED` or `CONVERTED`. **`preSalesOwnerId` has no such restriction** — the Pre-sales owner can be changed at any status, including `PENDING_REVIEW`.

**Success:** `200 <LeadRow>` (the updated lead). Also writes an `ASSIGNMENT` activity automatically and records history in `lead_assignments` (a full ownership snapshot per change, not just the field that changed).

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | neither field given |
| 403 | `{ "error": "Forbidden" }` | wrong caller role, invalid/inactive/wrong-role target, or a Salesperson assignment attempted on a non-qualified lead |
| 404 | `{ "error": "Not found" }` | lead doesn't exist |

### `POST /api/leads/[id]/transfer`

Transfer a lead's Pre-sales owner and/or Salesperson to someone else. `MARKETING_HEAD` only.

**Body:**
```json
{ "newPreSalesOwnerId": "number, optional", "newSalespersonOwnerId": "number, optional", "reason": "string, required" }
```

**Business rules**, all enforced as a `403` (not a separate status code) except the reason, which is `400`:
- `reason` must be non-empty (unlike assign, a transfer always requires one).
- Same active/role validation on each target id as `assign` above.
- Setting `newSalespersonOwnerId` requires the lead's status be `QUALIFIED` or `CONVERTED` — the exact same gate `assign` enforces, closing the same hole a transfer would otherwise open around it.
- If the Salesperson owner actually changes, the lead's upcoming visits (`SCHEDULED`/`RESCHEDULED` rows in `client_visits`) are reassigned to the new Salesperson in the same transaction.

**Success:** `200 <LeadRow>`. Writes a `TRANSFER` activity and a `lead_transfer_history` row (previous + new owners, transferred-by, reason, timestamp), and notifies both the previous and new owner of whichever field(s) changed (`LEAD_TRANSFERRED`).

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "A reason is required to transfer a lead" }` | `reason` missing/empty |
| 403 | `{ "error": "Forbidden" }` | wrong caller role, invalid/inactive/wrong-role target, or a Salesperson transfer attempted on a non-qualified lead |
| 404 | `{ "error": "Not found" }` | lead doesn't exist |

### `POST /api/leads/transfer-bulk`

Same as single transfer, applied to several leads in one request. `MARKETING_HEAD` only. All leads succeed or none do — one transaction for the whole batch.

**Body:**
```json
{ "leadIds": "number[], min 1", "newPreSalesOwnerId": "number, optional", "newSalespersonOwnerId": "number, optional", "reason": "string, required" }
```

**Success:** `200 { "leads": [LeadRow, ...] }` — one entry per transferred lead, same order as `leadIds`.

**Errors:** same as single transfer — if any lead in the batch fails a check (not visible, not qualified when required, etc.), the whole call fails and nothing is written.

---

## Client Visits

### `GET /api/leads/[id]/visits`

List a lead's visits, ordered by date/time. Visibility = same rule as the lead itself (no extra ownership layer — if you can see the lead, you can see its visits).

**Success:** `200 { "visits": [VisitRow, ...] }` — see [VisitRow](#visitrow).

**Errors:** `403`/`404` per the lead-visibility rule.

### `POST /api/leads/[id]/visits`

Schedule a client visit. `MARKETING_HEAD` only, for any `ACTIVE` `SALESPERSON` (not necessarily the lead's current owner).

**Body:**
```json
{
  "salespersonId": "number, required",
  "visitDate": "string (YYYY-MM-DD), required",
  "startTime": "string (HH:MM), required",
  "expectedDurationMinutes": "number, optional",
  "location": "string, optional",
  "objective": "string, required",
  "preparationNotes": "string, optional",
  "confirmConflict": "boolean, optional, default false"
}
```

**Success:** `200 <VisitRow>`. Writes a `CLIENT_VISIT` activity and notifies the Salesperson (`VISIT_SCHEDULED`).

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | wrong caller role, or `salespersonId` isn't an active Salesperson |
| 404 | `{ "error": "Not found" }` | lead doesn't exist |
| 409 | `{ "error": "...", "conflict": true }` | the Salesperson already has another `SCHEDULED`/`RESCHEDULED` visit at that exact date+time, and `confirmConflict` wasn't `true` — advisory, not a hard block: resend the same body with `confirmConflict: true` to proceed anyway |

### `GET /api/visits/conflicts`

Check for a same-slot conflict before scheduling (what the UI calls on submit to decide whether to show the confirm-anyway prompt). `MARKETING_HEAD` only.

**Query params:** `salespersonId` (number, required), `visitDate` (required), `startTime` (required).

**Success:** `200 { "conflict": true | false }`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid query" }` | a required param missing/malformed |
| 403 | `{ "error": "Forbidden" }` | caller isn't `MARKETING_HEAD` |

### `PATCH /api/visits/[id]`

Reschedule, cancel, or record the outcome of a visit — one endpoint, three actions.

**Body — one of:**
```json
{ "action": "RESCHEDULE", "visitDate": "string, required", "startTime": "string, required", "confirmConflict": "boolean, optional" }
{ "action": "CANCEL" }
{ "action": "RECORD_OUTCOME", "outcome": "COMPLETED | MISSED", "outcomeNotes": "string, optional", "nextAction": "string, optional" }
```

**Who may call which action:**
| Action | Caller | Extra rule |
|---|---|---|
| `RESCHEDULE` | `MARKETING_HEAD` | visit must currently be `SCHEDULED`/`RESCHEDULED`; re-validates the assigned Salesperson is still `ACTIVE`; same 409-conflict behavior as scheduling |
| `CANCEL` | `MARKETING_HEAD` | visit must currently be `SCHEDULED`/`RESCHEDULED` — cancelling an already Completed/Cancelled/Missed visit is rejected, not a no-op |
| `RECORD_OUTCOME` | the visit's assigned `SALESPERSON` only (not `MARKETING_HEAD`) | visit must currently be `SCHEDULED`/`RESCHEDULED` |

**Success:** `200 <VisitRow>`. `RESCHEDULE` writes a `CLIENT_VISIT` activity and notifies the Salesperson (`VISIT_RESCHEDULED`); `CANCEL` does the same (`VISIT_CANCELLED`). `RECORD_OUTCOME` writes no activity or notification — it just updates the visit row.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | wrong caller role for the action, or (for `RECORD_OUTCOME`) a Salesperson who isn't the one assigned to this visit |
| 404 | `{ "error": "Not found" }` | visit doesn't exist |
| 409 | `{ "error": "...", "conflict": true }` | (`RESCHEDULE` only) same-slot conflict, `confirmConflict` not set |

---

## Notifications

In-app only. Real email delivery exists for Marketing Head/Super Admin announcements (see [Email Announcements](#email-announcements)), not for assignment/transfer/visit notifications — those stay in-app-only per the Phase 5 plan's scoping.

### `GET /api/notifications`

List the caller's own notifications, newest first.

**Query params (optional):** `unread` — `"true"` to return only unread notifications.

**Success:** `200 { "notifications": [NotificationRow, ...] }` — see [NotificationRow](#notificationrow).

### `PATCH /api/notifications/[id]`

Mark one of the caller's own notifications read. No body.

**Success:** `200 { "ok": true }`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 404 | `{ "error": "Not found" }` | the notification doesn't exist, or belongs to someone else (ownership is enforced as a 404, same reasoning as leads — never confirm another user's notification exists) |

---

## Services

The master list leads pick from for "Service interested" (§5.1).

### `GET /api/services`

List services. A non-`SUPER_ADMIN` caller always gets only `ACTIVE` ones — passing `?status=INACTIVE` (or any other value) as a non-Super-Admin does **not** bypass this; the role, not the query, decides.

**Query params (optional):** `status` — `ACTIVE` | `INACTIVE`. Only a `SUPER_ADMIN` can actually widen the result with it.

**Success:** `200 { "services": [ServiceRow, ...] }`, alphabetical by name.

### `POST /api/services`

Create a service. `SUPER_ADMIN` only.

**Body:**
```json
{ "name": "string, required", "description": "string, optional" }
```

**Success:** `201 <ServiceRow>` — starts `ACTIVE`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller isn't `SUPER_ADMIN` |
| 409 | `{ "error": "A service named \"...\" already exists" }` | name already in use (case-sensitive unique) |

### `PATCH /api/services/[id]`

Edit a service's name, description, and/or status. `SUPER_ADMIN` only.

**Body (≥1 key):**
```json
{ "name": "string, optional", "description": "string, optional", "status": "ACTIVE | INACTIVE, optional" }
```

**Success:** `200 <ServiceRow>`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 403 | `{ "error": "Forbidden" }` | caller isn't `SUPER_ADMIN` |
| 404 | `{ "error": "Not found" }` | service doesn't exist |
| 409 | `{ "error": "A service named \"...\" already exists" }` | renamed to a name already in use |

---

## Email Announcements

`MARKETING_HEAD`/`SUPER_ADMIN` only (§9.3). Recipients are always resolved to the active, eligible set at send time — a caller-supplied `userId`/`userIds` is filtered the same way `ALL_PRE_SALES`/`ALL_SALESPEOPLE` are, never trusted as-is.

### `POST /api/email-announcements`

Compose and send an announcement. Sending is synchronous — one SMTP attempt per recipient happens inside this request before it returns.

**Body:**
```json
{
  "subject": "string, required",
  "body": "string, required",
  "recipientGroup":
    { "type": "USER", "userId": "number" } |
    { "type": "USERS", "userIds": "number[], min 1" } |
    { "type": "ALL_PRE_SALES" } |
    { "type": "ALL_SALESPEOPLE" }
}
```

**Success:** `201 <EmailAnnouncementRow & { recipientStatusCounts: Record<string, number> }>` — see [EmailAnnouncementRow](#emailannouncementrow). A recipient id that isn't an active `PRE_SALES`/`SALESPERSON` is silently dropped, not an error; a `USERS`/group resolving to zero eligible recipients still creates the announcement with no recipients.

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | missing/malformed body |
| 403 | `{ "error": "Forbidden" }` | caller isn't `MARKETING_HEAD`/`SUPER_ADMIN` |

### `GET /api/email-announcements`

List announcements. `SUPER_ADMIN` sees every announcement; `MARKETING_HEAD` sees only their own.

**Success:** `200 { "announcements": [EmailAnnouncementRow & { recipientStatusCounts }, ...] }`, newest first.

### `POST /api/email-announcements/[id]/retry`

Re-attempt every `FAILED` recipient of this announcement, up to a bounded attempt count. Already-`SENT` rows are never touched; the claim step is atomic, so two concurrent retries on the same announcement can't both resend the same row. A recipient no longer an active `PRE_SALES`/`SALESPERSON` is marked `FAILED` again without resending.

**Success:** `200 { "retried": number, "stillFailed": number }`.

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid id" }` | id isn't a number |
| 403 | `{ "error": "Forbidden" }` | caller isn't `MARKETING_HEAD`/`SUPER_ADMIN`, or is a `MARKETING_HEAD` who didn't send this announcement |
| 404 | `{ "error": "Not found" }` | announcement doesn't exist |

---

## Tasks

Personal follow-ups (§10's Task half). Any role may create a task for themselves. Only `MARKETING_HEAD`/`SUPER_ADMIN` may assign a task to someone else, and only to an active `PRE_SALES`/`SALESPERSON`. An optional linked lead is checked against the creator's own lead visibility — the same rule `leads`/`visits` already use, not a separate one.

### `POST /api/tasks`

**Body:**
```json
{
  "assignedUserId": "number, required",
  "title": "string, required",
  "description": "string, optional",
  "dueAt": "ISO timestamp, required",
  "priority": "LOW | MEDIUM | HIGH, optional, default MEDIUM",
  "leadId": "number, optional"
}
```

**Success:** `201 <TaskRow>` — see [TaskRow](#taskrow).

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | missing/malformed body |
| 400 | `{ "error": "Referenced user or lead does not exist" }` | `assignedUserId`/`leadId` doesn't reference a real row (FK violation) |
| 403 | `{ "error": "..." }` | non-`MARKETING_HEAD`/`SUPER_ADMIN` assigning to someone else; assignee isn't an active `PRE_SALES`/`SALESPERSON`; or the creator can't see the linked lead |
| 404 | `{ "error": "..." }` | `leadId` doesn't exist |

### `GET /api/tasks`

List tasks. `MARKETING_HEAD`/`SUPER_ADMIN` see every task; everyone else sees only tasks assigned to them.

**Query params (optional):** `status` — one of `PENDING | IN_PROGRESS | COMPLETED | CANCELLED`. `dueWithin` — `OVERDUE | TODAY | UPCOMING`, computed against the database's current time at query time; a `COMPLETED`/`CANCELLED` task is excluded from all three buckets.

**Success:** `200 { "tasks": [TaskRow, ...] }`, ordered by `due_at`.

### `PATCH /api/tasks/[id]`

Update a task's status, title, description, due date, and/or priority. Only the assigned user may call this — not the creator, not `MARKETING_HEAD`/`SUPER_ADMIN` (see Deferred in `TODO.md`).

**Body (≥1 key):**
```json
{ "status": "...", "title": "...", "description": "...", "dueAt": "...", "priority": "..." }
```

**Success:** `200 <TaskRow>` — setting `status: "COMPLETED"` stamps `completed_at`; moving off `COMPLETED` does not clear it (see Deferred in `TODO.md`).

**Errors:**
| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Invalid input" }` | missing/malformed body |
| 403 | `{ "error": "Forbidden" }` | caller isn't the task's assigned user |
| 404 | `{ "error": "Not found" }` | task doesn't exist |

---

## Data shapes

### UserRow

```ts
{
  id: number;
  role: "SUPER_ADMIN" | "HR" | "MARKETING_HEAD" | "PRE_SALES" | "SALESPERSON";
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  created_by: number | null;
  created_at: string; // ISO timestamp
  updated_at: string;
}
```

### LeadRow

```ts
{
  id: number;
  company_name: string;
  company_name_normalized: string; // internal — used for duplicate matching
  contact_person: string | null;
  designation: string | null;
  phone: string;
  phone_normalized: string; // internal
  email: string | null;
  website: string | null;
  website_domain: string | null; // internal
  industry: string | null;
  business_type: string | null;
  location: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  country: string; // NOT NULL, defaults to "India"
  service_requirements: string | null; // legacy free-text, nullable, superseded by the `services` array (see ServiceRow) — not written by current create/edit forms
  estimated_budget: string | null; // NUMERIC column — returned as a string, not a number
  lead_source: "WEBSITE_ENQUIRY" | "REFERRAL" | "COLD_OUTREACH" | "EXISTING_CLIENT" | "OTHER";
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "NEW" | "PENDING_REVIEW" | "MORE_INFO_REQUIRED" | "QUALIFIED" | "CONVERTED" | "REJECTED" | "ON_HOLD" | "CLOSED_WON" | "CLOSED_LOST";
  status_reason: string | null; // set by reject/return
  pre_sales_owner_id: number | null;
  salesperson_owner_id: number | null;
  next_follow_up_at: string | null;
  notes: string | null;
  whatsapp_number: string | null;
  remarks: string | null;
  archived_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}
```

### LeadActivityRow

```ts
{
  id: number;
  lead_id: number;
  actor_user_id: number;
  type: "NOTE" | "CALL" | "MEETING" | "OTHER" | "STATUS_CHANGE" | "ASSIGNMENT" | "TRANSFER" | "CLIENT_VISIT";
  notes: string | null;
  created_at: string;
}
```

### VisitRow

```ts
{
  id: number;
  lead_id: number;
  salesperson_id: number;
  visit_date: string; // YYYY-MM-DD — kept as a plain string, not parsed to a JS Date server-side
  start_time: string; // HH:MM:SS
  expected_duration_minutes: number | null;
  location: string | null;
  objective: string;
  preparation_notes: string | null;
  status: "SCHEDULED" | "COMPLETED" | "RESCHEDULED" | "CANCELLED" | "MISSED";
  outcome_notes: string | null;
  next_action: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}
```

### ServiceRow

```ts
{
  id: number;
  name: string; // unique
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
}
```

### NotificationRow

```ts
{
  id: number;
  recipient_user_id: number;
  type: "LEAD_ASSIGNED" | "LEAD_TRANSFERRED" | "VISIT_SCHEDULED" | "VISIT_RESCHEDULED" | "VISIT_CANCELLED";
  lead_id: number | null;
  message: string;
  read_at: string | null;
  created_at: string;
}
```

### EmailAnnouncementRow

```ts
{
  id: number;
  sender_user_id: number;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}
// GET/POST responses attach a derived field, not a real column:
// recipientStatusCounts: Record<"PENDING" | "SENT" | "FAILED" | "RETRYING", number>
```

### TaskRow

```ts
{
  id: number;
  lead_id: number | null;
  assigned_user_id: number;
  title: string;
  description: string | null;
  due_at: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  created_by: number;
  created_at: string;
  completed_at: string | null;
}
```

---

## Not yet documented here

All six planned phases (`req.md` §16) are implemented and merged. Phase 7 (internal chat, `req.md` §19) has no plan doc yet — see `TODO.md`.
