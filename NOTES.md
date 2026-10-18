# Engineering Notes & Architectural Decisions

## Key Architectural Decisions

### 1. Workspace Scoping & Tenant Isolation (Rule 1, F1.6, Q2)
- Every table includes a `workspace_id` column.
- All database queries must route through the `createScopedDAL(workspaceId)` data access layer.
- Identifiers in URLs (such as `/api/contacts/[id]`) are always scoped by `workspaceId: session.workspaceId` to prevent ID guessing attacks.

### 2. Permissions as Rows (Rule 2, F1.2, F1.3, F1.5)
- Permissions are stored as individual rows in the `permissions` table, with keys like `crm.view`, `crm.create`, `crm.edit`, `crm.delete`, `crm.export`, `crm.opportunity_value`, `assignment.manage`, `integrations.manage`, `audit.view`.
- Server-side middleware `requirePermission(session, action)` validates permissions on all API endpoints.
- Role `OWNER` has full administrative powers. `ADMIN` has high privileges but CANNOT edit or delete the `OWNER` record.

### 3. Treatment of Acknowledged vs. Unacknowledged Leads on Absence (F3.6)
- **Unacknowledged Leads:** Reassigned immediately when an employee is set to `ON_LEAVE` or `OFFLINE`. This ensures inbound customer requests never sit idle without an active rep.
- **Acknowledged Leads:** Remain assigned to the current employee to preserve relationship continuity and avoid confusing existing customers. When viewed in the UI, an absence indicator alerts team members that the owner is away.

### 4. Database-Backed Escalation vs Memory Timers (Rule 3, Rule 4, F3.5, F3.8, Q5)
- **No `setTimeout`:** In-memory timers perish on server restarts and cannot coordinate across scaled instances.
- Each lead stores `owner_id`, `assigned_at`, `ack_deadline`, and `escalation_level`.
- An escalation worker queries the database with `FOR UPDATE SKIP LOCKED`, atomically claiming and advancing expired leads in the same transaction.

### 5. Idempotency & Webhook Deduplication (Rule 5, I1.8, I2.4)
- Twilio webhooks are deduplicated using a unique constraint on `provider_message_id` (`MessageSid`).
- Stripe webhooks are deduplicated using a unique constraint on `provider_event_id` (`event.id`).
- Repeated webhooks delivered by the provider fail harmlessly and return an acknowledgment without creating duplicate records.

### 6. Raw Body Signature Verification (Rule 6, I1.2, I2.3)
- Frameworks like Next.js parse request bodies if `req.json()` is invoked. Both Twilio's HMAC-SHA1 validator and Stripe's `constructEvent` require the exact raw bytes.
- All webhook handlers read `await req.text()` before any parsing.
- A single `PUBLIC_BASE_URL` environment variable is used to compute the exact URL Twilio called.

### 7. Unified Metric Definitions (Rule 7, F5.2, Q12)
- All metric definitions from Section 7 of the specification are centralized in `src/server/metrics/dashboard-metrics.ts`.
- The dashboard overview and drill-down endpoints both call this module so calculations never disagree.

### 8. Secret Protection (Rule 8, I5.3)
- API keys, OAuth tokens, and webhook secrets are stored encrypted with AES-256-GCM using `src/server/crypto/encryption.ts`.
- The `/api/integrations` status endpoint returns only masked credentials (e.g. `sk_test_...1234`).
