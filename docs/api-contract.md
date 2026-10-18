# Unified Business Management Platform - API Contract

**Author:** Abdul Rehman Haider (Backend)  
**Consumer:** Frontend Team (App Shell, CRM UI, Lead Board, Integrations, Dashboard)  
**Base URL:** `http://localhost:3000/api` (or production HTTPS deployment)  
**Standard Error Envelope:**
```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable explanation of what went wrong",
    "fields": {
      "fieldName": ["Validation error message"]
    }
  }
}
```

---

## 1. Authentication & Session

### `POST /api/auth/signup`
Creates a new workspace, assigns first user as `OWNER`, creates default pipeline and stages, and sets httpOnly session cookie.
- **Request Body:**
```json
{
  "companyName": "Acme Corp",
  "workspaceSlug": "acme",
  "name": "Alice Owner",
  "email": "owner@acme.com",
  "password": "Password123!"
}
```
- **Response (201):**
```json
{
  "success": true,
  "workspace": { "id": "cuid...", "name": "Acme Corp", "slug": "acme" },
  "user": { "id": "cuid...", "email": "owner@acme.com", "name": "Alice Owner", "role": "OWNER" }
}
```
- **Cookie set:** `fast_crm_session` (httpOnly, SameSite=Lax, 7 days)

### `POST /api/auth/login`
Rate limited (5 attempts per 15 min per IP/email).
- **Request Body:**
```json
{
  "email": "owner@acme.com",
  "password": "Password123!"
}
```
- **Response (200):**
```json
{
  "success": true,
  "workspace": { "id": "...", "name": "Acme Corp", "slug": "acme" },
  "user": {
    "id": "...",
    "email": "owner@acme.com",
    "name": "Alice Owner",
    "role": "OWNER",
    "permissions": ["crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export", "crm.opportunity_value", "assignment.manage", "integrations.manage", "audit.view"]
  }
}
```

### `POST /api/auth/logout`
Destroys session in database and clears session cookie.
- **Response (200):** `{ "success": true, "message": "Logged out successfully" }`

### `GET /api/auth/me`
Returns current user profile, workspace, and row-based permissions.
- **Response (200):**
```json
{
  "user": {
    "id": "...",
    "email": "owner@acme.com",
    "name": "Alice Owner",
    "role": "OWNER",
    "availabilityStatus": "AVAILABLE",
    "maxOpenLeads": 20,
    "telegramDestination": "@alice_owner",
    "permissions": ["crm.view", ...]
  },
  "workspace": { "id": "...", "name": "Acme Corp", "slug": "acme", "settings": {} }
}
```

---

## 2. Users & RBAC

### `GET /api/users`
List team members in current workspace. Requires authentication.

### `POST /api/users`
Invite / create team member. Requires `OWNER` or `ADMIN`.
- **Request Body:**
```json
{
  "name": "Charlie Sales",
  "email": "charlie@acme.com",
  "password": "Password123!",
  "role": "USER",
  "availabilityStatus": "AVAILABLE",
  "maxOpenLeads": 5,
  "telegramDestination": "@charlie_sales",
  "permissions": ["crm.view", "crm.create", "crm.edit"]
}
```

### `PATCH /api/users/[id]`
Update user status or availability.
- **Rule Enforced:** Admin CANNOT modify Owner (returns 403 `FORBIDDEN_OWNER_IMMUTABLE`).
- **Rule Enforced:** Setting an employee to `ON_LEAVE` or `OFFLINE` immediately reassigns their unacknowledged leads (F3.6).
- **Request Body:**
```json
{
  "availabilityStatus": "ON_LEAVE"
}
```
- **Response (200):**
```json
{
  "success": true,
  "user": { ... },
  "reassignedLeadsOnAbsence": 3
}
```

### `PUT /api/users/[id]/permissions`
Sets row-based permissions for user. Requires `OWNER` or `ADMIN`.
- **Request Body:**
```json
{
  "permissions": ["crm.view", "crm.create", "crm.edit", "crm.opportunity_value"]
}
```

---

## 3. CRM Core (Contacts, Companies, Opportunities, Pipelines)

### `GET /api/contacts?q={search}&limit=50&offset=0`
List contacts with search filtering and pagination.

### `POST /api/contacts`
Create a new contact.
- **Request Body:**
```json
{
  "companyId": "optional_company_cuid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@doe.com",
  "phone": "+14155550199",
  "optOut": false
}
```

### `GET /api/contacts/[id]`
Complete Customer 360 View (F2.8): returns contact details, company, linked opportunities, leads, conversations, messages, appointments, payments, and activity timeline.

### `PATCH /api/contacts/[id]`
Update contact or mark as `optOut: true` (disallows messaging).

### `GET /api/pipelines`
Returns all pipelines with ordered stages and custom fields.

### `POST /api/pipelines/[id]/stages`
Add a stage to a pipeline.
- **Request Body:**
```json
{
  "name": "Proposal Sent",
  "order": 3,
  "isWon": false,
  "isLost": false,
  "requiredFields": ["deal_budget", "proposal_doc"]
}
```

### `DELETE /api/pipelines/[id]/stages/[stageId]`
Safe delete stage (F2.5). If stage contains any opportunities, returns 400 `STAGE_NOT_EMPTY`.

### `GET /api/custom-fields?pipelineId={id}`
Returns custom field definitions scoped per pipeline (F2.2, F2.3).

### `POST /api/custom-fields`
Create a custom field without code.
- **Request Body:**
```json
{
  "pipelineId": "pipeline_cuid",
  "name": "Client Tier",
  "key": "client_tier",
  "type": "DROPDOWN",
  "options": ["Tier 1", "Tier 2", "Tier 3"],
  "isRequired": false
}
```

### `GET /api/opportunities?stageId={id}`
Returns opportunities. If user does NOT have `crm.opportunity_value` permission, the `value` is automatically masked (`value: null, _valueMasked: true`) (F1.4).

### `PATCH /api/opportunities/[id]`
Update opportunity or move stage.
- **Optimistic Concurrency:** `version` is REQUIRED. If version does not match database, returns 409 `CONFLICT_CONCURRENT_EDIT` (Q4).
- **Stage-Required-Field Check:** If moving to a stage requiring specific fields and they are missing, returns 400 `STAGE_REQUIRED_FIELDS_MISSING` (F2.4).
- **Request Body:**
```json
{
  "stageId": "stage_meeting_scheduled",
  "version": 1,
  "customFields": {
    "deal_budget": 50000
  }
}
```

### `GET /api/saved-lists` & `POST /api/saved-lists`
Create and fetch saved multi-criteria filter lists (at least 3 criteria: stage, owner, date, minAmount, tags) (F2.6, Q9).

---

## 4. Lead Engine & Escalation

### `GET /api/leads`
Returns leads with accountable owner, remaining ack window deadline, and escalation level.

### `POST /api/leads`
Manual lead creation. Assigns via Round-Robin among `AVAILABLE` employees under max open leads capacity.
- **Request Body:**
```json
{
  "title": "Referral from Partner",
  "contactId": "contact_cuid",
  "source": "manual"
}
```

### `POST /api/leads/public?workspace={slug}`
Public web form endpoint (unauthenticated). Matches or creates contact and triggers automatic round-robin assignment with configured ack window (F3.1).
- **Request Body:**
```json
{
  "title": "Website Inquiry",
  "firstName": "Alex",
  "lastName": "Rivera",
  "email": "alex@example.com",
  "phone": "+14155550188"
}
```

### `POST /api/leads/[id]/ack`
Acknowledges lead. Halts escalation timer, records timestamp and activity log (F3.4).

### `GET /api/leads/recovery-queue?idleHours=24`
Returns leads needing manager intervention with explicit `recoveryReason` (F3.7):
- Expired beyond ack window
- Escalated multiple times (Level >= 2)
- Untouched for configured idle period

### `GET /api/leads/events`
Server-Sent Events (SSE) endpoint (Q11). Streams real-time events:
- `LEAD_CREATED`
- `LEAD_ACKNOWLEDGED`
- `LEAD_ESCALATED`

---

## 5. Third-Party Integrations

### `POST /api/integrations/twilio/webhook`
Twilio inbound WhatsApp / SMS webhook.
- Verifies `X-Twilio-Signature` on raw request body against `PUBLIC_BASE_URL` (Rule 6).
- Deduplicates using unique constraint on `provider_message_id` (`MessageSid`) (Rule 5).
- Matches known contact by phone or creates new contact + assigned lead (I1.5).

### `POST /api/integrations/twilio/status`
Twilio status callback webhook. Updates message delivery status: `QUEUED`, `SENT`, `DELIVERED`, `FAILED` (I1.4).

### `POST /api/integrations/twilio/send`
Sends WhatsApp / SMS reply to contact.
- Blocks sending if contact `optOut === true` with clear explanation (I1.9).
- Retains failed message state with reason for manual retry (I1.7).
- **Request Body:**
```json
{
  "contactId": "contact_cuid",
  "body": "Hello! Thank you for reaching out to Acme Corp."
}
```

### `POST /api/integrations/stripe/checkout`
Creates a Stripe Checkout Session from an opportunity (I2.1, I2.7).
- **Request Body:**
```json
{
  "opportunityId": "opp_cuid",
  "amount": 2500,
  "currency": "usd",
  "description": "Onboarding deposit"
}
```
- **Response (200):**
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### `POST /api/integrations/stripe/webhook`
Stripe payment webhook.
- Verifies `stripe-signature` on raw body using webhook secret (Rule 6).
- Deduplicates on `event.id` (Rule 5).
- Updates payment status: `PAID`, `EXPIRED`, `REFUNDED`, `FAILED` (I2.2, I2.5).

### `GET /api/integrations/google/auth-url`
Returns Google OAuth 2.0 consent URL (I3.1).

### `GET /api/integrations/google/freebusy?timeMin=...&timeMax=...&timeZone=...`
Checks host busy times on Google Calendar to prevent scheduling conflicts (I3.4).

### `POST /api/appointments`
Books appointment in CRM and creates Google Calendar event in UTC with IANA timezone (I3.3, I3.5).
- **Request Body:**
```json
{
  "hostUserId": "user_cuid",
  "contactId": "contact_cuid",
  "title": "Product Demo",
  "startTime": "2026-10-20T14:00:00.000Z",
  "endTime": "2026-10-20T14:45:00.000Z",
  "timeZone": "America/New_York"
}
```

### `PATCH /api/appointments/[id]`
Reschedules or cancels appointment (`status: "CANCELLED"`), removing/updating the Google Calendar event (I3.6).

### `GET /api/integrations`
Central integrations status overview showing status (`CONNECTED`, `DISCONNECTED`, `ERROR`), last worked timestamp, recent errors, and provider limitations (I5.1, I5.6). Secrets are masked (I5.3).

### `POST /api/integrations/config`
Save encrypted workspace integration credentials (I5.2, I5.3).

---

## 6. Dashboard & Audit History

### `GET /api/dashboard`
Live Operational Dashboard metrics computed using ONE unified definitions module (F5.1 - F5.4, Q12):
- `newLeadsToday`
- `openPipelineValueByStage`
- `totalOpenPipelineValue` (masked if unauthorized)
- `averageTimeToFirstResponseSeconds`
- `recoveryQueueCount`
- `escalationsLast24Hours`
- `employeeAvailability` (Available, Busy, On leave, Offline counts + Available user list)
- `upcomingAppointmentsCount`
- `paymentsReceivedThisMonth` (Collected vs Projected revenue)

### `GET /api/dashboard/drill-down?metric={metric_name}&stageId={id}`
Drill-down endpoint returning underlying records for dashboard figures (F5.3).

### `GET /api/audit?eventType=...&actorId=...&startDate=...&endDate=...`
Tamper-resistant append-only audit trail. Requires `audit.view` permission (F4.1, F4.2). No update or delete endpoints exist (F4.3).
