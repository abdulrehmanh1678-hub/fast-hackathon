-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'STAGE_CHANGE', 'ASSIGNMENT', 'ACKNOWLEDGEMENT', 'ESCALATION', 'REASSIGNMENT', 'FIELD_EDIT', 'MESSAGE', 'PAYMENT', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('TWILIO', 'STRIPE', 'GOOGLE_CALENDAR', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "IntegrationEventResult" AS ENUM ('SUCCESS', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "max_open_leads" INTEGER NOT NULL DEFAULT 10,
    "telegram_destination" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "required_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stage_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "company_id" TEXT,
    "owner_id" TEXT,
    "custom_fields" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contact_id" TEXT,
    "source" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "owner_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "ack_deadline" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "last_escalated_at" TIMESTAMP(3),
    "custom_fields" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "lead_id" TEXT,
    "actor_id" TEXT,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "event_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "assigned_user_id" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "contact_id" TEXT,
    "requested_by_user_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_checkout_session_id" TEXT,
    "provider_payment_intent_id" TEXT,
    "provider_event_id" TEXT,
    "checkout_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "host_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "time_zone" TEXT NOT NULL,
    "google_event_id" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "credentials_encrypted" TEXT,
    "config" JSONB,
    "last_worked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "event_type" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "result" "IntegrationEventResult" NOT NULL,
    "reference" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_workspace_id_idx" ON "users"("workspace_id");

-- CreateIndex
CREATE INDEX "users_workspace_id_availability_status_idx" ON "users"("workspace_id", "availability_status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_workspace_id_user_id_idx" ON "sessions"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "permissions_workspace_id_user_id_idx" ON "permissions"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_workspace_id_user_id_action_key" ON "permissions"("workspace_id", "user_id", "action");

-- CreateIndex
CREATE INDEX "companies_workspace_id_idx" ON "companies"("workspace_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_idx" ON "contacts"("workspace_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_phone_idx" ON "contacts"("workspace_id", "phone");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_email_idx" ON "contacts"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "pipelines_workspace_id_idx" ON "pipelines"("workspace_id");

-- CreateIndex
CREATE INDEX "stages_workspace_id_pipeline_id_idx" ON "stages"("workspace_id", "pipeline_id");

-- CreateIndex
CREATE INDEX "custom_fields_workspace_id_idx" ON "custom_fields"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_workspace_id_key_pipeline_id_key" ON "custom_fields"("workspace_id", "key", "pipeline_id");

-- CreateIndex
CREATE INDEX "opportunities_workspace_id_idx" ON "opportunities"("workspace_id");

-- CreateIndex
CREATE INDEX "opportunities_workspace_id_stage_id_idx" ON "opportunities"("workspace_id", "stage_id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_idx" ON "leads"("workspace_id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_status_idx" ON "leads"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "leads_workspace_id_owner_id_idx" ON "leads"("workspace_id", "owner_id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_ack_deadline_idx" ON "leads"("workspace_id", "ack_deadline");

-- CreateIndex
CREATE INDEX "activities_workspace_id_idx" ON "activities"("workspace_id");

-- CreateIndex
CREATE INDEX "activities_workspace_id_contact_id_idx" ON "activities"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "activities_workspace_id_opportunity_id_idx" ON "activities"("workspace_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "activities_workspace_id_lead_id_idx" ON "activities"("workspace_id", "lead_id");

-- CreateIndex
CREATE INDEX "audit_log_workspace_id_idx" ON "audit_log"("workspace_id");

-- CreateIndex
CREATE INDEX "audit_log_workspace_id_event_type_idx" ON "audit_log"("workspace_id", "event_type");

-- CreateIndex
CREATE INDEX "audit_log_workspace_id_actor_id_idx" ON "audit_log"("workspace_id", "actor_id");

-- CreateIndex
CREATE INDEX "audit_log_workspace_id_created_at_idx" ON "audit_log"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_idx" ON "conversations"("workspace_id");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_contact_id_idx" ON "conversations"("workspace_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_provider_message_id_key" ON "messages"("provider_message_id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_idx" ON "messages"("workspace_id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_conversation_id_idx" ON "messages"("workspace_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_checkout_session_id_key" ON "payments"("provider_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_event_id_key" ON "payments"("provider_event_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_idx" ON "payments"("workspace_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_status_idx" ON "payments"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_google_event_id_key" ON "appointments"("google_event_id");

-- CreateIndex
CREATE INDEX "appointments_workspace_id_idx" ON "appointments"("workspace_id");

-- CreateIndex
CREATE INDEX "appointments_workspace_id_host_user_id_idx" ON "appointments"("workspace_id", "host_user_id");

-- CreateIndex
CREATE INDEX "integrations_workspace_id_idx" ON "integrations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspace_id_provider_key" ON "integrations"("workspace_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_provider_event_id_key" ON "integration_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "integration_events_workspace_id_idx" ON "integration_events"("workspace_id");

-- CreateIndex
CREATE INDEX "integration_events_workspace_id_provider_idx" ON "integration_events"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "integration_events_workspace_id_created_at_idx" ON "integration_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "saved_lists_workspace_id_user_id_idx" ON "saved_lists"("workspace_id", "user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
