# Internal Sales CRM --- Requirements Specification

**Document:** `req.md`\
**Version:** 1.0\
**Status:** Initial requirements\
**Scope:** Internal CRM for one company\
**Excluded:** Website scraping, automated business discovery, LinkedIn
scraping, and AI-based prospect discovery.

------------------------------------------------------------------------

## 1. Project Overview

Build an internal Sales CRM for a single company to manage users, client
leads, service requirements, lead qualification, salesperson
assignments, lead transfers, client visits, team emails, and activity
history.

The system will be built with **Next.js and PostgreSQL using raw SQL**.
No ORM will be used.

The application is for internal company use, not a multi-tenant SaaS
product.

### Primary objectives

-   Centralize client and lead information.
-   Allow two or more Marketing Heads to work with the same Pre-sales
    and Sales teams.
-   Let Pre-sales users record client details and service requirements.
-   Allow Marketing Heads to qualify leads, assign salespeople, schedule
    client visits, and transfer leads.
-   Allow Marketing Heads to send emails to individual users or groups.
-   Let users message each other directly inside the app for day-to-day
    coordination (planned — see §19).
-   Maintain a reliable history of lead assignments, transfers, visits,
    activities, and important changes.

------------------------------------------------------------------------

## 2. Technology Stack

-   **Framework:** Next.js App Router
-   **Language:** TypeScript
-   **Backend:** Next.js Route Handlers / server-side application logic
-   **Database:** PostgreSQL
-   **Database access:** `pg` / node-postgres with parameterized raw SQL
-   **ORM:** None
-   **Validation:** Zod
-   **UI:** Tailwind CSS, light theme, responsive layout
-   **Icons:** Remix Icons
-   **Authentication:** Secure server-managed sessions and HTTP-only
    cookies
-   **Email:** SMTP provider or transactional email service
-   **Deployment:** Company-approved VPS or hosting environment

Do not introduce Prisma, Drizzle, Sequelize, or another ORM.

------------------------------------------------------------------------

## 3. User Roles and Access Rules

There are five roles:

1.  Super Admin
2.  HR
3.  Marketing Head
4.  Pre-sales
5.  Salesperson

### 3.1 Super Admin

Super Admin has platform-wide access within this company.

Permissions:

-   Create, edit, activate, and deactivate HR accounts.
-   Create, edit, activate, and deactivate Marketing Head accounts
    directly (in addition to HR's own ability to create them).
-   View all users and leads.
-   View company-wide activity, assignment, transfer, visit, and email
    logs.
-   Review audit logs.
-   Correct assignments or access issues when necessary.
-   Manage general system settings.

Super Admin is the only role that can create HR accounts. Marketing Head
accounts can be created by Super Admin or by HR.

### 3.2 HR

HR sits between Super Admin and the Marketing Head / Pre-sales / Sales
teams for account creation and lifecycle management.

Permissions:

-   Create, edit, activate, and deactivate Marketing Head accounts.
-   Create, edit, activate, and deactivate Pre-sales accounts.
-   Create, edit, activate, and deactivate Salesperson accounts.
-   View and manage the same shared team list a Marketing Head sees.

HR's scope is user/account management only. HR has no lead, assignment,
visit, or email-announcement permissions — those remain with Marketing
Head as described below. If a future release needs HR involved in those
workflows, that is a separate requirements decision.

### 3.3 Marketing Head

There may be multiple Marketing Heads. The company currently has two,
but the system must not hard-code this limit.

Permissions:

-   Create, edit, activate, and deactivate Pre-sales accounts.
-   Create, edit, activate, and deactivate Salesperson accounts.
-   View all company leads and all shared Pre-sales and Sales users.
-   Review and qualify leads.
-   Return leads for more information or mark them as rejected.
-   Assign qualified leads to any active Salesperson.
-   Assign or change the Pre-sales owner where needed.
-   Transfer leads between authorized Pre-sales users and Salespeople.
-   Schedule, reschedule, and cancel client visits.
-   Record or review visit outcomes.
-   Send emails to individual users, selected users, all active
    Pre-sales users, or all active Salespeople.
-   View company-wide sales activity and team reports.

Marketing Heads share the same company workspace. Users created by one
Marketing Head must be available to both Marketing Heads. Do not create
isolated teams for each head.

### 3.4 Pre-sales

Permissions:

-   Sign in and access their dashboard.
-   Create leads and record client information.
-   Record service requirements, budget information, notes, and lead
    source.
-   View and update leads they are authorized to access.
-   Add research notes, calls, and other activities.
-   View their assigned tasks and follow-ups.
-   View lead status and assignment details.
-   Update permitted qualification information.

Pre-sales users cannot create or manage user accounts and cannot
transfer lead ownership unless this permission is explicitly added
later.

### 3.5 Salesperson

Permissions:

-   Sign in and access their dashboard.
-   View leads assigned to them and any explicitly shared records.
-   View client information and service requirements necessary for sales
    work.
-   Record calls, meetings, notes, follow-ups, and client-visit
    outcomes.
-   View their scheduled client visits.
-   Update permitted sales-stage fields.
-   View their own activity and pipeline summary.

Salespeople cannot create user accounts or transfer lead ownership
unless explicitly authorized later.

### 3.6 Server-side authorization

-   Enforce authorization in every protected server action and API
    route.
-   Do not rely only on hiding UI controls.
-   Validate both the user's role and the specific record they are
    attempting to access.
-   Deactivated users must not be able to sign in or use existing
    sessions.
-   Record important permission-sensitive changes in the audit log.

------------------------------------------------------------------------

## 4. User Management

### 4.1 User creation

-   Super Admin creates HR accounts, and may also create Marketing Head
    accounts directly.
-   HR creates Marketing Head, Pre-sales, and Salesperson accounts.
-   Marketing Heads create Pre-sales and Salesperson accounts.
-   Pre-sales and Salespeople cannot create user accounts.
-   HR and Marketing Heads create users for the shared company
    workspace.
-   Email address must be unique.
-   Store role, name, email, account status, creator, creation
    timestamp, and last update timestamp.
-   Use a secure account activation or temporary-password flow.
-   Never store plaintext passwords.

### 4.2 User management actions

-   List and search users.
-   Filter users by role and status.
-   Edit permitted profile fields.
-   Activate or deactivate accounts.
-   Reset account access securely.
-   Display the account creator and creation date.
-   Preserve historical records when a user is deactivated.

Do not hard-delete users who are referenced by leads, visits,
activities, or audit records.

------------------------------------------------------------------------

## 5. Lead Management

### 5.1 Lead creation

Pre-sales users are the primary lead-entry users. Marketing Heads may
also create leads when needed.

Lead fields:

-   Lead ID
-   Company or client name (required)
-   Contact person
-   Designation
-   Phone number (required by default; make the requirement configurable
    if needed)
-   Email address
-   Company website
-   Industry
-   Location
-   Service requirements (required)
-   Estimated budget (optional)
-   Lead source
-   Priority
-   Lead status
-   Pre-sales owner
-   Salesperson owner, if assigned
-   Created by
-   Created at
-   Updated at
-   Next follow-up date and time
-   General notes

Lead source options for the first version:

-   Website enquiry
-   Referral
-   Cold outreach
-   Existing client
-   Other

The website enquiry option is a manually selected source; this
requirement does not include website scraping or automated discovery.

### 5.2 Lead actions

-   Create, view, edit, and archive leads.
-   Search by client name, company, phone, email, or website.
-   Filter by status, source, priority, owner, and date range.
-   Detect likely duplicates using normalized company name, domain,
    phone, and email.
-   Show validation errors before saving.
-   Preserve creator and timestamp information.
-   Display a complete activity timeline.
-   Support CSV/Excel import and export only if approved for the first
    release; imports must validate rows and identify duplicates.

### 5.3 Suggested lead statuses

-   New
-   Pending Review
-   More Information Required
-   Qualified
-   Converted
-   Rejected
-   On Hold
-   Closed --- Won
-   Closed --- Lost

**Status definitions:**

-   **New:** lead has been recorded.
-   **Pending Review:** awaiting Marketing Head review.
-   **More Information Required:** needs additional details.
-   **Qualified:** suitable for sales follow-up.
-   **Converted:** accepted into the active sales opportunity workflow.
-   **Rejected:** not suitable, with a reason recorded.
-   **On Hold:** temporarily paused.
-   **Closed --- Won:** the business outcome was successful.
-   **Closed --- Lost:** the opportunity ended without a sale, with a
    reason recorded.

Lead conversion is not the same as winning a sale. A qualified lead can
be converted before a visit, quotation, or purchase occurs.

------------------------------------------------------------------------

## 6. Lead Review and Assignment

### 6.1 Review workflow

1.  Pre-sales records a lead.
2.  The lead is immediately visible to both Marketing Heads with status
    `Pending Review`.
3.  A Marketing Head reviews the information.
4.  The Marketing Head may qualify it, reject it with a reason, or
    return it for more information.
5.  A qualified/converted lead can be assigned to any active
    Salesperson.
6.  The assigned Salesperson receives an in-app notification and email
    notification when email delivery is configured.
7.  The Salesperson records progress and follow-up activities.

### 6.2 Assignment rules

-   Both Marketing Heads can assign any eligible company lead.
-   Both Marketing Heads can select any active Salesperson.
-   Both Marketing Heads can change the Pre-sales owner when needed.
-   A lead may have a Pre-sales owner and a Salesperson owner.
-   Store assignment history instead of silently overwriting the
    previous assignment.
-   Assignment must record who made the change and when.
-   Notify the new owner and, where appropriate, the previous owner.
-   Use a database transaction to update the current assignment and
    assignment history together.

------------------------------------------------------------------------

## 7. Lead Transfer

Marketing Heads can transfer leads between authorized Pre-sales users
and Salespeople.

### 7.1 Transfer actions

-   Transfer a lead to another Pre-sales user.
-   Transfer a lead to another Salesperson.
-   Change the assigned Salesperson for an ongoing opportunity or
    upcoming visit.
-   Perform a bulk transfer only with a clear confirmation step.
-   Require a transfer reason.
-   Notify the new owner and the previous owner by email when
    configured.
-   Preserve the lead's notes, activities, visits, follow-ups,
    quotations, invoices, and other related records.
-   Maintain a complete transfer history.

### 7.2 Transfer history fields

-   Transfer ID
-   Lead ID
-   Previous owner
-   New owner
-   Transferred by
-   Transfer reason
-   Transfer timestamp

A transfer and current-assignment update must occur in one PostgreSQL
transaction. Prevent transfers to inactive users.

------------------------------------------------------------------------

## 8. Client Visit Management

Marketing Heads can schedule client visits for any active Salesperson.

### 8.1 Visit fields

-   Visit ID
-   Lead ID
-   Client/company
-   Assigned Salesperson
-   Visit date
-   Start time
-   Expected duration (optional)
-   Visit address or location
-   Visit objective
-   Preparation notes
-   Status
-   Outcome notes
-   Next action
-   Created by
-   Created at
-   Updated at

### 8.2 Visit statuses

-   Scheduled
-   Completed
-   Rescheduled
-   Cancelled
-   Missed

### 8.3 Visit workflow

1.  Marketing Head opens a lead and schedules a visit.
2.  Marketing Head selects the Salesperson, date, time, location, and
    objective.
3.  The system saves the visit and notifies the Salesperson.
4.  The Salesperson sees the visit on their dashboard and visit list.
5.  The Salesperson records the outcome after the visit.
6.  If the visit is rescheduled or cancelled, the relevant users are
    notified.
7.  The visit remains in the lead's activity history.

Prevent accidental duplicate visits and show conflicts when a
Salesperson already has another visit at the same time. A conflict
warning should require confirmation or a revised schedule.

------------------------------------------------------------------------

## 9. Email and Team Announcements

Marketing Heads can send emails to:

-   One Pre-sales user
-   One Salesperson
-   Selected Pre-sales and Sales users
-   All active Pre-sales users
-   All active Salespeople

### 9.1 Email composition

Fields:

-   Recipients
-   Subject
-   Message body
-   Sender
-   Created timestamp
-   Send status

Use a plain-text or safely rendered HTML message. Do not allow untrusted
HTML to execute scripts.

### 9.2 Email use cases

-   Team announcements
-   Campaign instructions
-   Urgent notices
-   Lead assignment notifications
-   Lead transfer notifications
-   Client visit scheduling, rescheduling, and cancellation
-   Optional follow-up reminders

### 9.3 Email delivery requirements

-   Send email from server-side code only.
-   Store delivery attempt and result for each recipient.
-   Support pending, sent, failed, and retrying states.
-   Retry temporary failures with bounded retry attempts.
-   Avoid duplicate emails when jobs are retried.
-   Validate recipient addresses and apply reasonable rate limits.
-   Restrict announcement sending to Marketing Heads and Super Admin.
-   Do not expose SMTP credentials in browser code or public environment
    variables.
-   The first release requires one-way announcements; replies can go to
    the configured sender address through normal email. In-app reply
    threads are out of scope unless added later.

Email status should distinguish a successful provider/API acceptance
from confirmed delivery where the provider supplies that information.

------------------------------------------------------------------------

## 10. Activities, Tasks, and Follow-ups

Activity types:

-   Call
-   Email
-   Meeting
-   Client visit
-   Note
-   Status change
-   Assignment
-   Transfer
-   Other

Each activity should include the lead, actor, type, timestamp, notes,
and any relevant linked visit or task.

Task fields:

-   Task ID
-   Lead ID
-   Assigned user
-   Title
-   Description
-   Due date and time
-   Priority
-   Status
-   Created by
-   Completed at

Task statuses:

-   Pending
-   In Progress
-   Completed
-   Cancelled

Provide today's tasks, upcoming follow-ups, and overdue tasks on
role-appropriate dashboards.

------------------------------------------------------------------------

## 11. Dashboards and Reports

### 11.1 Super Admin dashboard

-   Total active users by role
-   Total leads by status
-   Leads created over time
-   Assignment and transfer activity
-   Upcoming and completed visits
-   Team activity summary
-   Email delivery failures
-   Audit-log overview

### 11.2 Marketing Head dashboard

-   Total leads and leads awaiting review
-   Leads by status, source, and priority
-   Qualified and converted leads
-   Leads by assigned Pre-sales user and Salesperson
-   Upcoming visits and missed visits
-   Overdue follow-ups
-   Transfer history
-   Team activity and conversion summary

### 11.3 Pre-sales dashboard

-   Leads created by the user
-   Leads awaiting review or more information
-   Follow-ups due today
-   Upcoming tasks
-   Recently updated leads

### 11.4 Salesperson dashboard

-   Leads assigned to the user
-   Upcoming client visits
-   Today's and overdue follow-ups
-   Recent activities
-   Lead pipeline by status
-   Won/lost totals where applicable

Reports must respect role-based access. Super Admin and Marketing Heads
can see company-wide reports; other roles see only authorized records.

------------------------------------------------------------------------

## 12. PostgreSQL Data Model

Use raw SQL migrations and PostgreSQL constraints. Suggested tables:

1.  `users`
2.  `leads`
3.  `lead_assignments`
4.  `lead_transfer_history`
5.  `client_visits`
6.  `activities`
7.  `tasks`
8.  `email_announcements`
9.  `email_recipients`
10. `email_logs`
11. `audit_logs`
12. `sessions` (if using database-backed sessions)

### Database requirements

-   Use primary keys and foreign keys.
-   Add unique constraints for user email and other appropriate
    identifiers.
-   Add indexes for common filters, including lead status, owner,
    created date, and visit date.
-   Use `TIMESTAMPTZ` for timestamps and consistently handle time zones.
-   Use transactions for assignments, transfers, and other multi-table
    operations.
-   Use parameterized queries (`$1`, `$2`, etc.) for all user-supplied
    values.
-   Use soft deletion or archive status for business records that need
    historical retention.
-   Define retention and deletion rules for personal information.
-   Keep schema changes in versioned SQL migration files.
-   Do not use an ORM.

------------------------------------------------------------------------

## 13. Authentication and Security

-   Secure sign-in and sign-out.
-   Store password hashes using Argon2id or bcrypt with an appropriate
    work factor.
-   Use secure, HTTP-only, SameSite cookies.
-   Use HTTPS in production.
-   Implement session expiration and revocation.
-   Rate-limit login and sensitive operations.
-   Validate and sanitize all incoming data.
-   Use parameterized SQL to prevent SQL injection.
-   Apply server-side authorization checks on every protected operation.
-   Protect state-changing operations against CSRF as appropriate to the
    session architecture.
-   Prevent open redirects and validate file uploads if uploads are
    added.
-   Keep secrets in server-side environment variables.
-   Do not log passwords, session tokens, or sensitive credentials.
-   Record security-sensitive changes in audit logs.
-   Back up the database and test restoration.

------------------------------------------------------------------------

## 14. UI and UX Requirements

-   Light theme for all content areas (no user-facing dark-mode toggle);
    the navigation sidebar uses a dark rail for visual structure, not a
    full dark theme.
-   Responsive desktop and mobile layouts.
-   Clean internal business dashboard.
-   Sidebar navigation on desktop.
-   Mobile-friendly navigation.
-   Searchable and filterable lead/user tables.
-   Clear status badges and priority indicators.
-   Forms with inline validation and helpful error messages.
-   Confirmation dialogs for transfers, deactivation, cancellation, and
    bulk actions.
-   Toast feedback for successful and failed operations.
-   Empty states and loading states.
-   Accessible labels, keyboard navigation, and clear focus states.
-   Use Remix Icons for interface icons.

Suggested navigation:

-   Dashboard
-   Leads
-   Lead Review
-   Assignments
-   Client Visits
-   Tasks & Follow-ups
-   Team
-   Email Announcements
-   Reports
-   Audit Logs
-   Settings

Show only the navigation items allowed for the signed-in user's role.

------------------------------------------------------------------------

## 15. Out of Scope for This Release

Explicitly exclude:

-   Website scraping or crawling
-   Automated business discovery
-   LinkedIn scraping or automated profile extraction
-   AI-generated business research
-   AI lead scoring
-   Subscription plans and multi-tenant SaaS functionality
-   Public customer self-service portal
-   In-app email reply threads (internal chat between users is a
    separate, now-planned requirement — see §19)
-   Advanced marketing automation
-   Automatic cold-email campaigns
-   Mobile native applications
-   Complex external accounting integrations beyond a separately
    approved future requirement

The system should remain designed so a lead-research module can be added
later without restructuring the core CRM.

------------------------------------------------------------------------

## 16. Implementation Plan

### Phase 1 --- Project foundation

-   Initialize Next.js App Router with TypeScript.
-   Configure PostgreSQL and `pg`.
-   Create SQL migration workflow.
-   Implement authentication, sessions, and role checks.
-   Build the shared dashboard layout.

### Phase 2 --- User management

-   Super Admin creates HR accounts (and may create Marketing Head
    accounts directly).
-   HR creates Marketing Head, Pre-sales, and Salesperson accounts.
-   Marketing Heads create Pre-sales and Salesperson users.
-   Implement user list, edit, activation/deactivation, and secure
    access reset.
-   Verify that both Marketing Heads share the same team.

### Phase 3 --- Leads and review

-   Build lead creation and editing.
-   Implement search, filters, duplicate warnings, and activity history.
-   Add lead review and qualification statuses.
-   Implement assignment and assignment history.

### Phase 4 --- Transfers and visits

-   Implement lead transfer with reason and history.
-   Implement client visit scheduling and outcomes.
-   Add assignment, transfer, and visit notifications.

### Phase 5 --- Emails, tasks, and reports

-   Implement Marketing Head email announcements.
-   Add delivery logs and safe retry handling.
-   Add tasks, follow-ups, and reminders.
-   Build role-specific dashboards and reports.

### Phase 6 --- Testing and deployment

-   Test role and record-level permissions.
-   Test concurrent assignment and transfer operations.
-   Test email failure and retry behavior.
-   Test form validation and duplicate detection.
-   Configure production environment variables, HTTPS, backups, and
    monitoring.
-   Perform a security review before company use.

------------------------------------------------------------------------

## 17. Acceptance Criteria

The first release is acceptable when all of the following work:

1.  Super Admin can create HR accounts, and can also create Marketing
    Head accounts directly.
2.  HR can create Marketing Head, Pre-sales, and Salesperson accounts.
3.  Marketing Heads can create Pre-sales and Salesperson accounts.
4.  Both Marketing Heads can access the same active team and shared
    leads.
5.  Pre-sales can record complete client and service requirement
    information.
6.  Newly created leads appear in the Marketing Heads' review queue.
7.  Marketing Heads can qualify, reject, or return leads for more
    information.
8.  Marketing Heads can assign leads to any active Salesperson.
9.  Marketing Heads can transfer leads between authorized users, with a
    required reason and preserved history.
10. Marketing Heads can schedule, reschedule, and cancel client visits.
11. Salespeople can view their assigned visits and record visit
    outcomes.
12. Marketing Heads can send individual and group emails to authorized
    team members.
13. Email attempts and failures are visible in logs, with safe retries.
14. Activities, tasks, and follow-ups are visible to the appropriate
    users.
15. Unauthorized users cannot access protected data by directly calling
    API routes.
16. Important changes are auditable.
17. All database operations use parameterized raw SQL; no ORM is
    installed or used.
18. No scraping or automated business discovery is present in this
    release.

------------------------------------------------------------------------

## 18. Key Product Decisions

-   The CRM serves one company and uses one shared workspace.
-   There can be multiple Marketing Heads; the current count of two is
    not hard-coded.
-   Super Admin alone creates HR accounts; Super Admin may also create
    Marketing Head accounts directly, and HR may create them too.
-   HR creates Marketing Head, Pre-sales, and Salesperson accounts. HR's
    permissions are limited to user/account management — no lead,
    assignment, visit, or email-announcement access.
-   Marketing Heads create Pre-sales and Salesperson accounts.
-   Both Marketing Heads can use all active Pre-sales users and
    Salespeople.
-   Leads are shared company records with explicit owners and assignment
    history.
-   Marketing Heads can assign and transfer leads.
-   Marketing Heads can schedule client visits and send team emails.
-   Lead conversion is distinct from closing a sale.
-   PostgreSQL is accessed using raw SQL through `pg`, without an ORM.
-   Website scraping and lead discovery are excluded from this release.

------------------------------------------------------------------------

## 19. Internal Chat (Planned)

Let users message each other directly inside the app, as a faster,
lighter-weight alternative to email (§9) for day-to-day coordination.
Not yet scheduled into a phase in §16 — added here as a requirement for
future planning.

### 19.1 Who can chat with whom

-   Any active user can start a direct (one-to-one) conversation with
    any other active user visible to them under §3's visibility rules.
-   A conversation can optionally be linked to a specific lead, so its
    messages appear alongside that lead's activity history.
-   Group conversations are supported for team coordination (e.g. a
    Marketing Head with their Pre-sales and Sales team).

### 19.2 Message fields

-   Conversation ID
-   Participants
-   Sender
-   Message body (plain text)
-   Lead ID (optional, when the conversation is lead-linked)
-   Sent timestamp
-   Read status per participant

### 19.3 Requirements

-   Messages are stored in PostgreSQL via raw SQL, consistent with the
    rest of the CRM — no third-party chat service.
-   A user only sees conversations they are a participant in.
-   A new message generates an in-app notification (§8's `notifications`
    mechanism) for participants not actively viewing the conversation.
-   Chat is an append-only log in the first release — no message editing
    or deletion, consistent with the CRM's audit-first approach elsewhere.
-   Real-time delivery (websockets or similar) is a later enhancement;
    the first release may poll for new messages.

### 19.4 Out of scope for the first chat release

-   File or image attachments
-   Voice or video calls
-   Message reactions, threading, or editing
-   External (customer-facing) chat

This section is a first pass to capture the requirement; detailed design
(schema, UI, exact notification wiring) happens when a phase plan for it
is written, the same way Phases 1-6 were each planned before being built.
