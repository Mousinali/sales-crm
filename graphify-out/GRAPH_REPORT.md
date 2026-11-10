# Graph Report - sales-crm  (2026-11-05)

## Corpus Check
- 268 files · ~128,733 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: .example 1, (none) 1, .log 1)

## Summary
- 1199 nodes · 3619 edges · 92 communities (67 shown, 25 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.82)
- Token cost: 0 input · 538,620 output

## Community Hubs (Navigation)
- User Account Reset/Patch API
- Calendar Event API
- Dashboard Shell & Layout UI
- Services Admin API
- Lead Creation Schema & Config
- Email Announcement Retry API
- Socket.IO Realtime Server
- Marketing Head Test Fixtures
- Lead Activity/Assign API
- Task Patch/List API
- Auth Login/Password Tests
- Password Change & Login API
- Announcement Route Tests
- Lead Visibility & Detail View
- Dev Dependencies
- Lead Action Endpoints (Activity/Assign/Transfer/Visit)
- Visit Conflict & Patch API
- Dashboard Page UI
- Lead Review & Bulk Transfer
- Session & Login Flow
- Lead Duplicate Check API
- Lead Detail View Actions
- Frontend Component Tests
- TypeScript Config
- Announcements View UI
- Route Test Fixtures (generic)
- User Creation Tests
- req.md Dashboards & Role Sections
- Notification & Visit API
- User Admin Actions & Audit Log
- Runtime Dependencies
- req.md Lead Review/Transfer Plan
- Lead List API & Filters
- Email Announcement Pipeline
- Deployment Docs & Server Setup
- Lead Export (CSV)
- Lead Detail/Activity API Routes
- Chat View UI
- req.md Lead Management & Services API
- Superpowers Implementation Plans
- Dashboard Aggregation Functions
- Route Test Fixtures (generic)
- Leads List View Actions
- API Conventions & Role Enum
- Email Announcement Spec & Env Config
- Email/Task API Routes
- Lead Create/Dedupe Logic
- Tasks View UI
- User Management Permission Logic
- Seed Script & Test Setup
- npm Scripts
- Change Password & Chat Pages
- req.md Chat (Planned) & Out of Scope
- Root Layout & Fonts
- Migration Script & Vite Config
- ESLint Config
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- User Route Test
- Route Test Fixtures (generic)
- Route Test Fixtures (generic)
- Next.js Agent-Rules Boilerplate
- Logout Flow
- Notifications Bell UI
- Leads Table & Super Admin Dashboard
- Change Password API
- Login API
- Logout API
- Lead Duplicates Endpoint
- Lead Patch Endpoint
- Users List Endpoint
- Role Type Definition
- Creatable Roles Helper
- User Error Types
- Lead Error Types
- Lead Row/Type Definitions
- Notifications Table
- Generic File Icon Asset
- Generic Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Generic Window Icon Asset
- create-next-app Boilerplate Text
- req.md Acceptance Criteria
- req.md Key Product Decisions
- req.md Project Overview
- req.md UI/UX Requirements
- req.md User Management Spec

## God Nodes (most connected - your core abstractions)
1. `pool` - 101 edges
2. `vitest` - 80 edges
3. `getCurrentUserFromRequest()` - 77 edges
4. `runMigrations()` - 57 edges
5. `next` - 56 edges
6. `seedSuperAdmin()` - 56 edges
7. `createUser()` - 56 edges
8. `pg` - 35 edges
9. `createLead()` - 34 edges
10. `createSession()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `recordAuditLog` --semantically_similar_to--> `recordLeadActivity`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-10-23-sales-crm-phase2-user-management.md → docs/superpowers/plans/2026-10-26-sales-crm-phase3-leads.md
- `Deploy on Vercel section` --conceptually_related_to--> `Deploying sales-crm to an Ubuntu server (guide)`  [AMBIGUOUS]
  README.md → server-upload.md
- `Socket.IO websocket (chat/notifications)` --conceptually_related_to--> `req.md §19 Internal Chat (Planned)`  [AMBIGUOUS]
  server-upload.md → req.md
- `setUserStatus` --shares_data_with--> `getSessionUser`  [INFERRED]
  docs/superpowers/plans/2026-10-23-sales-crm-phase2-user-management.md → docs/superpowers/plans/2026-10-23-sales-crm-phase1-foundation.md
- `requireRole` --calls--> `getCurrentUser`  [AMBIGUOUS]
  docs/superpowers/plans/2026-10-23-sales-crm-phase2-user-management.md → docs/superpowers/plans/2026-10-23-sales-crm-phase1-foundation.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server-side authorization guard functions** — docs_superpowers_plans_2026_10_23_sales_crm_phase1_foundation_getcurrentuser, docs_superpowers_plans_2026_10_23_sales_crm_phase2_user_management_requirerole, docs_superpowers_plans_2026_10_26_sales_crm_phase3_leads_assertleadvisible, docs_superpowers_plans_2026_10_23_sales_crm_phase2_user_management_assertmanageable [INFERRED 0.85]
- **Append-only history/audit tables pattern reused across phases** — docs_superpowers_plans_2026_10_23_sales_crm_phase2_user_management_auditlogstable, docs_superpowers_plans_2026_10_26_sales_crm_phase3_leads_leadassignmentstable, docs_superpowers_plans_2026_10_26_sales_crm_phase4_transfers_visits_leadtransferhistorytable [EXTRACTED 1.00]
- **Phase 6 audit and readiness documents** — docs_superpowers_plans_phase6_permission_matrix, docs_superpowers_plans_phase6_production_readiness, docs_superpowers_plans_phase6_security_review [EXTRACTED 1.00]
- **Lead ownership mutation flow (assign/transfer/bulk-transfer)** — api_leads_assign, api_leads_transfer, api_leads_transfer_bulk, api_leadrow [INFERRED 0.80]
- **Client visit scheduling conflict-detection flow** — api_visits_post, api_visits_conflicts, api_visits_patch, api_visitrow [INFERRED 0.80]
- **Cross-document phase-completion tracking (req.md/TODO.md/API.md)** — req_implementation_plan, todo_phase_6_testing_and_deployment, api_not_yet_documented_section [EXTRACTED 1.00]

## Communities (92 total, 25 thin omitted)

### Community 0 - "User Account Reset/Patch API"
Cohesion: 0.07
Nodes (41): pg, POST(), resetAccess(), PATCH(), patchSchema, patchUser(), createUserSchema, GET() (+33 more)

### Community 1 - "Calendar Event API"
Cohesion: 0.08
Nodes (41): PATCH(), respondSchema, DELETE(), PATCH(), patchSchema, createSchema, GET(), listQuerySchema (+33 more)

### Community 2 - "Dashboard Shell & Layout UI"
Cohesion: 0.08
Nodes (30): AppToaster(), Brand(), DashboardShell(), DashboardLayout(), MobileNav(), NavGroup(), NavItem, NavLinks() (+22 more)

### Community 3 - "Services Admin API"
Cohesion: 0.09
Nodes (31): PATCH(), patchSchema, patchService(), createServiceSchema, GET(), listQuerySchema, POST(), getServices() (+23 more)

### Community 4 - "Lead Creation Schema & Config"
Cohesion: 0.10
Nodes (34): nextConfig, next, react, createLeadSchema, listQuerySchema, LEAD_PRIORITY_BADGE_CLASSES, LEAD_PRIORITY_LABELS, LEAD_STATUS_BADGE_CLASSES (+26 more)

### Community 5 - "Email Announcement Retry API"
Cohesion: 0.11
Nodes (28): nodemailer, POST(), postRetry(), createAnnouncementSchema, GET(), POST(), recipientGroupSchema, getAnnouncements() (+20 more)

### Community 6 - "Socket.IO Realtime Server"
Cohesion: 0.11
Nodes (22): socket.io@^4.8.4, socket.io, app, handle, SocketUser, GET(), GET(), POST() (+14 more)

### Community 7 - "Marketing Head Test Fixtures"
Cohesion: 0.09
Nodes (22): vitest, createdEmails, leadIds, createdEmails, leadIds, serviceIds, createdEmails, leadIds (+14 more)

### Community 8 - "Lead Activity/Assign API"
Cohesion: 0.17
Nodes (21): zod, GET(), postActivitySchema, getActivities(), assignSchema, GET(), getLead(), updateLeadSchema (+13 more)

### Community 9 - "Task Patch/List API"
Cohesion: 0.12
Nodes (25): PATCH(), patchSchema, patchTask(), createTaskSchema, GET(), listQuerySchema, POST(), getTasks() (+17 more)

### Community 10 - "Auth Login/Password Tests"
Cohesion: 0.14
Nodes (15): createdEmails, sessionUserIds, pool, createdEmails, leadIds, createdEmails, leadIds, createdEmails (+7 more)

### Community 11 - "Password Change & Login API"
Cohesion: 0.15
Nodes (21): changePasswordSchema, POST(), changePasswordRequest(), loginSchema, POST(), changePassword(), generateTempPassword(), hashPassword() (+13 more)

### Community 12 - "Announcement Route Tests"
Cohesion: 0.13
Nodes (19): allUserIds, POST(), announcementIds, createdEmails, sessionUserIds, createdEmails, sessionUserIds, createdEmails (+11 more)

### Community 13 - "Lead Visibility & Detail View"
Cohesion: 0.13
Nodes (26): canManage, assertLeadVisible, assignLead, lead_activities table, lead_assignments table, LeadDetailView, leadDisplay.ts badge/label maps, GET/PATCH /api/leads/[id] (+18 more)

### Community 14 - "Dev Dependencies"
Cohesion: 0.10
Nodes (26): devDependencies, jsdom@^29.1.1, tailwindcss@^4, @tailwindcss/turbopack@^4, tsx@^4.23.15, @types/node@^22.20.5, @types/nodemailer@^8.0.2, @types/pg@^8.23.1 (+18 more)

### Community 15 - "Lead Action Endpoints (Activity/Assign/Transfer/Visit)"
Cohesion: 0.11
Nodes (22): POST(), postActivity(), POST(), postAssign(), POST(), postTransfer(), POST(), postVisit() (+14 more)

### Community 16 - "Visit Conflict & Patch API"
Cohesion: 0.21
Nodes (20): conflictsQuerySchema, GET(), getConflicts(), PATCH(), patchSchema, patchVisit(), VisitActionNotAllowedError, VisitConflictError (+12 more)

### Community 17 - "Dashboard Page UI"
Cohesion: 0.18
Nodes (17): BreakdownList(), DashboardPage(), StatTile(), WelcomeCard(), initialsOf(), ROLE_BADGE_CLASSES, ROLE_LABELS, ConfirmAction (+9 more)

### Community 18 - "Lead Review & Bulk Transfer"
Cohesion: 0.22
Nodes (18): POST(), reviewSchema, postReview(), bulkTransferSchema, POST(), recordLeadActivity(), assertActiveUserWithRole(), assignLead() (+10 more)

### Community 19 - "Session & Login Flow"
Cohesion: 0.10
Nodes (18): createSession, (dashboard) layout shell, getCurrentUser, getSessionUser, hashPassword, LoginForm, POST /api/auth/login, runMigrations (+10 more)

### Community 20 - "Lead Duplicate Check API"
Cohesion: 0.19
Nodes (14): duplicatesQuerySchema, GET(), getDuplicates(), PATCH(), patchLead(), findPotentialDuplicates(), extractDomain(), normalizeCompanyName() (+6 more)

### Community 21 - "Lead Detail View Actions"
Cohesion: 0.22
Nodes (18): LeadDetailView(), cancelVisitAction(), closeVisitAction(), confirmReviewPrompt(), handleActivitySubmit(), handleAssignSubmit(), handleScheduleVisitSubmit(), handleTransferSubmit() (+10 more)

### Community 22 - "Frontend Component Tests"
Cohesion: 0.11
Nodes (13): @testing-library/react@^16.3.3, @testing-library/react, lead, push, refresh, pendingLead, sampleVisit, push (+5 more)

### Community 23 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 24 - "Announcements View UI"
Cohesion: 0.16
Nodes (11): Announcement, AnnouncementsView(), handleSend(), refetchAnnouncements(), retryFailed(), GROUP_BUTTONS, parseErrorMessage(), RecipientGroupType (+3 more)

### Community 25 - "Route Test Fixtures (generic)"
Cohesion: 0.17
Nodes (10): createdEmails, serviceIds, sessionUserIds, createdEmails, serviceIds, sessionUserIds, createdEmails, serviceIds (+2 more)

### Community 26 - "User Creation Tests"
Cohesion: 0.19
Nodes (10): createdEmails, makeMarketingHead(), leadIds, serviceIds, createUser(), createdEmails, createdEmails, makeMarketingHead() (+2 more)

### Community 27 - "req.md Dashboards & Role Sections"
Cohesion: 0.14
Nodes (14): req.md §11 Dashboards and Reports, req.md §3.2 HR, req.md §3.3 Marketing Head, req.md §11.2 Marketing Head dashboard, req.md §16 Phase 5 - Emails, tasks, and reports, req.md §3.4 Pre-sales, req.md §11.3 Pre-sales dashboard, req.md §3.5 Salesperson (+6 more)

### Community 28 - "Notification & Visit API"
Cohesion: 0.18
Nodes (13): NotificationRow, GET /api/notifications, PATCH /api/notifications/[id], VisitRow, GET /api/visits/conflicts, GET /api/leads/[id]/visits, PATCH /api/visits/[id], POST /api/leads/[id]/visits (+5 more)

### Community 29 - "User Admin Actions & Audit Log"
Cohesion: 0.19
Nodes (14): assertManageable, audit_logs table, createUser, generateTempPassword, listUsers, users.must_change_password column, recordAuditLog, POST /api/users/[id]/reset-access (+6 more)

### Community 30 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, argon2@^0.45.1, exceljs@^4.4.0, next@16.4.2, nodemailer@^10.2.1, pg@^8.23.1, react@19.3.0, react-dom@19.3.0 (+6 more)

### Community 31 - "req.md Lead Review/Transfer Plan"
Cohesion: 0.15
Nodes (14): req.md §6.2 Assignment rules, req.md §16 Implementation Plan, req.md §6 Lead Review and Assignment, req.md §7 Lead Transfer, req.md §16 Phase 1 - Project foundation, req.md §16 Phase 3 - Leads and review, req.md §16 Phase 6 - Testing and deployment, req.md §6.1 Review workflow (+6 more)

### Community 32 - "Lead List API & Filters"
Cohesion: 0.24
Nodes (11): GET(), getLeads(), LeadsPage(), buildLeadsWhere(), LeadFilters, listLeadsPage(), MAX_PAGE_SIZE, PagedResult (+3 more)

### Community 33 - "Email Announcement Pipeline"
Cohesion: 0.18
Nodes (13): db pool/query (src/lib/db.ts), AnnouncementsView, createAnnouncement, email_announcements table, email_logs table, email_recipients table, retryFailedRecipients, sendEmail (+5 more)

### Community 34 - "Deployment Docs & Server Setup"
Cohesion: 0.17
Nodes (13): Deploy on Vercel section, req.md §13 Authentication and Security, req.md §2 Technology Stack, HTTPS via certbot, Deploying sales-crm to an Ubuntu server (guide), Deploying an update later workflow, server.ts (custom Node server), sales-crm.service systemd unit (+5 more)

### Community 35 - "Lead Export (CSV)"
Cohesion: 0.29
Nodes (9): exportQuerySchema, GET(), csvEscape(), EXPORT_COLUMNS, LeadExportRow, leadsToCsv(), leadsToXlsxBuffer(), neutralizeFormula() (+1 more)

### Community 36 - "Lead Detail/Activity API Routes"
Cohesion: 0.27
Nodes (10): LeadActivityRow, LeadRow, GET /api/leads/[id]/activities, POST /api/leads/[id]/activities, POST /api/leads/[id]/assign, GET /api/leads/[id], GET /api/leads, POST /api/leads/[id]/review (+2 more)

### Community 37 - "Chat View UI"
Cohesion: 0.22
Nodes (8): socket.io-client@^4.8.4, socket.io-client, ChatView(), Conversation, formatMessageTime(), Message, MessageTicks(), RosterUser

### Community 38 - "req.md Lead Management & Services API"
Cohesion: 0.24
Nodes (9): POST /api/leads, ServiceRow, POST /api/services, GET /api/services, PATCH /api/services/[id], req.md §5.2 Lead actions, req.md §5.1 Lead creation, req.md §5 Lead Management (+1 more)

### Community 39 - "Superpowers Implementation Plans"
Cohesion: 0.33
Nodes (8): Phase 1: Project Foundation Plan, Phase 2: User Management Plan, Phase 3: Leads and Review Plan, Phase 4: Transfers, Visits, and Notifications Plan, Phase 5: Email Announcements, Tasks, and Dashboards Plan, Phase 6: Testing and Deployment Plan, Permission matrix — Phase 6 audit, Production readiness checklist — Phase 6

### Community 40 - "Dashboard Aggregation Functions"
Cohesion: 0.24
Nodes (10): listLeads, createTask, getMarketingHeadDashboard, getPreSalesDashboard, getSalespersonDashboard, listTasks, tasks table, TasksView (+2 more)

### Community 41 - "Route Test Fixtures (generic)"
Cohesion: 0.20
Nodes (6): announcementIds, createdEmails, sessionUserIds, createdEmails, leadIds, sessionUserIds

### Community 42 - "Leads List View Actions"
Cohesion: 0.27
Nodes (5): LeadsView(), confirmBulkTransfer(), handleFilterSubmit(), refetch(), parseErrorMessage()

### Community 43 - "API Conventions & Role Enum"
Cohesion: 0.22
Nodes (8): API.md Conventions, Role names enum (SUPER_ADMIN|HR|MARKETING_HEAD|PRE_SALES|SALESPERSON), UserRow, req.md §16 Phase 4 - Transfers and visits, nginx reverse proxy config, Socket.IO websocket (chat/notifications), docs/superpowers/plans/2026-10-26-sales-crm-phase4-transfers-visits.md, TODO Phase 4 - Transfers and visits

### Community 44 - "Email Announcement Spec & Env Config"
Cohesion: 0.22
Nodes (7): POST /api/email-announcements, req.md §9 Email and Team Announcements, req.md §9.1 Email composition, req.md §9.3 Email delivery requirements, req.md §9.2 Email use cases, .env.local configuration (DATABASE_URL, SMTP_*, SESSION_*), src/lib/db.ts (pg Pool)

### Community 45 - "Email/Task API Routes"
Cohesion: 0.25
Nodes (9): GET /api/email-announcements, POST /api/email-announcements/[id]/retry, EmailAnnouncementRow, TaskRow, POST /api/tasks, GET /api/tasks, PATCH /api/tasks/[id], req.md §10 Activities, Tasks, and Follow-ups (+1 more)

### Community 46 - "Lead Create/Dedupe Logic"
Cohesion: 0.25
Nodes (9): createLead, extractDomain, findPotentialDuplicates, GET/POST /api/leads, LeadsView, normalizeCompanyName, normalizePhone, findConflictingVisit (+1 more)

### Community 47 - "Tasks View UI"
Cohesion: 0.36
Nodes (7): Pagination(), parseErrorMessage(), TasksView(), handleCreateSubmit(), handleFilterSubmit(), refetch(), setStatus()

### Community 48 - "User Management Permission Logic"
Cohesion: 0.29
Nodes (7): canManage() role hierarchy (src/lib/auth/roles.ts), POST /api/users, PATCH /api/users/[id], POST /api/users/[id]/reset-access, req.md §16 Phase 2 - User management, TODO Phase 2 - User management, revokeAllSessions()

### Community 49 - "Seed Script & Test Setup"
Cohesion: 0.29
Nodes (6): dotenv@^18.0.9, @testing-library/jest-dom@^7.0.1, dotenv, @testing-library/jest-dom, main(), requireEnv()

### Community 50 - "npm Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, migrate, seed:admin, start, test

### Community 51 - "Change Password & Chat Pages"
Cohesion: 0.39
Nodes (4): ChangePasswordForm(), ChangePasswordPage(), ChatPage(), requireUser()

### Community 52 - "req.md Chat (Planned) & Out of Scope"
Cohesion: 0.33
Nodes (7): API.md "Not yet documented here" section, req.md §19.4 Out of scope for first chat release, req.md §19.1 Who can chat with whom, req.md §19 Internal Chat (Planned), req.md §19.2 Message fields, req.md §15 Out of Scope for This Release, TODO Phase 7 - Internal chat (planned, not implemented)

### Community 53 - "Root Layout & Fonts"
Cohesion: 0.29
Nodes (4): remixicon@^4.9.1, remixicon, inter, metadata

### Community 54 - "Migration Script & Vite Config"
Cohesion: 0.29
Nodes (3): @vitejs/plugin-react@^6.1.2, @vitejs/plugin-react, __dirname

### Community 55 - "ESLint Config"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.4.2, eslint, eslint-config-next

### Community 56 - "Route Test Fixtures (generic)"
Cohesion: 0.40
Nodes (4): createdEmails, leadIds, serviceIds, sessionUserIds

### Community 57 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 58 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 59 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 60 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 61 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 62 - "User Route Test"
Cohesion: 0.67
Nodes (3): POST(), createdEmails, postUsers()

### Community 63 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 64 - "Route Test Fixtures (generic)"
Cohesion: 0.50
Nodes (3): createdEmails, leadIds, sessionUserIds

### Community 66 - "Logout Flow"
Cohesion: 0.67
Nodes (3): POST /api/auth/logout, revokeSession, SignOutButton

### Community 67 - "Notifications Bell UI"
Cohesion: 0.67
Nodes (3): listNotifications, markNotificationRead, NotificationsBell

## Ambiguous Edges - Review These
- `getCurrentUser` → `requireRole`  [AMBIGUOUS]
  docs/superpowers/plans/2026-10-23-sales-crm-phase2-user-management.md · relation: calls
- `Deploy on Vercel section` → `Deploying sales-crm to an Ubuntu server (guide)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Role names enum (SUPER_ADMIN|HR|MARKETING_HEAD|PRE_SALES|SALESPERSON)` → `LeadRow`  [AMBIGUOUS]
  API.md · relation: shares_data_with
- `req.md §11 Dashboards and Reports` → `req.md §19.3 Chat requirements`  [AMBIGUOUS]
  req.md · relation: conceptually_related_to
- `req.md §19 Internal Chat (Planned)` → `Socket.IO websocket (chat/notifications)`  [AMBIGUOUS]
  server-upload.md · relation: conceptually_related_to

## Knowledge Gaps
- **102 isolated node(s):** `ROLES / Role type`, `verifyPassword`, `revokeSession`, `LoginForm`, `(dashboard) layout shell` (+97 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 397 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Marketing Head Test Fixtures` to `User Account Reset/Patch API`, `Calendar Event API`, `Dashboard Shell & Layout UI`, `Services Admin API`, `Lead Creation Schema & Config`, `Email Announcement Retry API`, `Socket.IO Realtime Server`, `Auth Login/Password Tests`, `Password Change & Login API`, `Announcement Route Tests`, `Dev Dependencies`, `Visit Conflict & Patch API`, `Lead Review & Bulk Transfer`, `Lead Duplicate Check API`, `Frontend Component Tests`, `Route Test Fixtures (generic)`, `User Creation Tests`, `Lead Export (CSV)`, `Route Test Fixtures (generic)`, `Seed Script & Test Setup`, `Migration Script & Vite Config`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`, `User Route Test`, `Route Test Fixtures (generic)`, `Route Test Fixtures (generic)`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **What connects `ROLES / Role type`, `verifyPassword`, `revokeSession` to the rest of the system?**
  _102 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `User Account Reset/Patch API` be split into smaller, more focused modules?**
  _Cohesion score 0.0689484126984127 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Lead Creation Schema & Config` to `User Account Reset/Patch API`, `Calendar Event API`, `Dashboard Shell & Layout UI`, `Services Admin API`, `Email Announcement Retry API`, `Socket.IO Realtime Server`, `Lead Activity/Assign API`, `Task Patch/List API`, `Password Change & Login API`, `Announcement Route Tests`, `Dev Dependencies`, `Lead Action Endpoints (Activity/Assign/Transfer/Visit)`, `Visit Conflict & Patch API`, `Dashboard Page UI`, `Lead Review & Bulk Transfer`, `Lead Duplicate Check API`, `Announcements View UI`, `Runtime Dependencies`, `Lead List API & Filters`, `Lead Export (CSV)`, `Root Layout & Fonts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `Calendar Event API` be split into smaller, more focused modules?**
  _Cohesion score 0.08080808080808081 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `getCurrentUser` and `requireRole`?**
  _Edge tagged AMBIGUOUS (relation: calls) - confidence is low._
- **What is the exact relationship between `Deploy on Vercel section` and `Deploying sales-crm to an Ubuntu server (guide)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._