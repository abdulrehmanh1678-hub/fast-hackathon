# Unified Business Management Platform - Backend

A high-reliability, multi-tenant CRM and Lead Engine backend built with **Next.js (App Router)**, **TypeScript**, **PostgreSQL**, **Prisma**, **Zod**, and **Argon2**, featuring integrations with **Twilio**, **Stripe**, and **Google Calendar**.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** >= 18 (Tested on v24.16.0)
- **PostgreSQL** >= 14 (or local Docker container / cloud PostgreSQL like Railway, Render, Supabase, Neon)

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: Secret key for session encryption.
- `ENCRYPTION_KEY`: 32-byte hex key for encrypting stored integration tokens (AES-256-GCM).
- `PUBLIC_BASE_URL`: Base URL (needed for Twilio webhook signature verification).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `TELEGRAM_BOT_TOKEN`: Bot token for instant lead escalation alerts.

### 4. Database Migration & Seed
Run Prisma migrations and seed the demo workspace:
```bash
# Push schema or apply migrations
npm run prisma:generate
npx prisma db push

# Seed demo workspace, Owner, Admin, users, pipeline, stages, and leads
npm run prisma:seed
```

### 5. Start Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

### 6. Run Background Escalation Worker
The lead escalation engine does **not** rely on ephemeral `setTimeout` timers. Run the database-backed worker:
```bash
npm run worker
```
The worker polls the database every 5 seconds using `SELECT ... FOR UPDATE SKIP LOCKED` inside atomic transactions to claim and reassign expired leads without race conditions or double escalations.

---

## 🏛 Architecture & Ownership

| Folder / File | Owner | Purpose |
| :--- | :--- | :--- |
| `/prisma` | Backend | Database schema, migrations, seed data |
| `/src/server/**` | Backend | DAL, RBAC, Lead Engine, worker, integration services |
| `/src/app/api/**` | Backend | Next.js API route handlers, webhooks |
| `/src/shared/**` | Shared | Zod validation schemas, unified error envelope, shared types |
| `/docs/api-contract.md` | Shared | Comprehensive API documentation for frontend consumer |
| `NOTES.md` | Shared | Architectural decisions and rules log |

---

## 🛡 Design Rules Implemented

1. **Workspace Scoped Queries (Rule 1, F1.6, Q2):** Every database query routes through `createScopedDAL(workspaceId)`, ensuring 100% tenant isolation even against guessed IDs.
2. **Row-Based Permissions (Rule 2, F1.3, F1.5):** Permissions are stored as rows in the `permissions` table and checked server-side via `requirePermission(session, action)`. Admins cannot modify or delete the Owner.
3. **Database-Backed Escalation (Rule 3, Rule 4, F3.5, F3.8):** Escalation status is persisted in the database. No `setTimeout` is used. Worker polls with `FOR UPDATE SKIP LOCKED`.
4. **Idempotency by Unique Constraint (Rule 5, I1.8, I2.4):** Provider event IDs (`Twilio MessageSid`, `Stripe event.id`) are enforced with unique database indexes.
5. **Raw Body Signature Checks (Rule 6, I1.2, I2.3):** Webhooks read `await req.text()` before parsing to prevent signature verification failure.
6. **Append-Only Audit History (F4.1, F4.3):** Audit entries record actor, timestamp, event type, target, and before/after values. No update or delete endpoints exist.
7. **Unified Metrics Definitions (F5.2, Q12):** All metrics for overview and drill-down share a single calculation module in `src/server/metrics/dashboard-metrics.ts`.
8. **AES-256-GCM Secret Encryption (Rule 8, I5.3):** Provider tokens and secrets are stored encrypted and displayed only masked in the UI.

---

## 🎬 6 Core Demo Flows Supported

1. **Inbound WhatsApp Message:** Phone sends message to Twilio sandbox -> Webhook authenticates signature -> Contact matched or created -> Lead created and assigned via round-robin.
2. **Lead Escalation on Ack Window Expiry:** Lead assigned with countdown deadline -> Ack window expires -> Worker claims lead via `SKIP LOCKED` -> Reassigned to next eligible peer/manager -> Telegram notification dispatched -> Dashboard updates live via SSE.
3. **Immediate Reassignment on Absence:** Employee status set to `ON_LEAVE` or `OFFLINE` -> Unacknowledged leads immediately reassigned to available peers.
4. **Stripe Checkout & Revenue Update:** Create checkout session from opportunity -> Customer completes test payment with card `4242 ... 4242` -> Stripe webhook updates payment status to `PAID` -> Collected revenue increments.
5. **Google Calendar Appointment:** Check host freebusy times -> Prevent overlaps -> Book appointment -> Event created on Google Calendar and customer activity timeline in UTC + IANA timezone.
6. **Server-Side Authorization & Tamper-Proof Audit:** Direct API call by unauthorized user is rejected with 403 `FORBIDDEN` -> Event recorded in tamper-proof append-only audit trail.