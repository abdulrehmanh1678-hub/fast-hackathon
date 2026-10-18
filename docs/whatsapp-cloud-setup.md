# WhatsApp Cloud API setup

The Conversations page uses Meta WhatsApp Cloud API directly. The access token and App Secret stay on the server; the browser only calls the authenticated CRM send endpoint.

## Local environment

The supplied Phone Number ID, WhatsApp Business Account ID, and access token are in the ignored local `.env`. `.env.example` contains placeholders only. The current local configuration uses the seeded workspace slug `acme`; change `WHATSAPP_WORKSPACE_SLUG` to the slug used by your workspace if it differs.

Add the Meta App Secret from **Meta for Developers → App settings → Basic** to `WHATSAPP_APP_SECRET`. The access token is not the App Secret. Restart the Next.js server after changing environment variables.

## Webhook in Meta

Set the Callback URL to `https://YOUR_PUBLIC_DOMAIN/api/integrations/whatsapp/webhook`. It must be publicly reachable over HTTPS; localhost cannot receive Meta webhooks. Set the Verify Token to the value of `WHATSAPP_VERIFY_TOKEN` in local `.env`, then subscribe the app to the `messages` webhook field. The GET route handles Meta's verification challenge. The POST route validates `X-Hub-Signature-256` against the raw request body using the App Secret before processing events.

Inbound messages are deduplicated by Meta message ID, saved to the workspace conversation, and matched to a contact by phone number. Unknown senders create a contact and a lead. Delivery status updates are saved to the same message record.

## Sending

The inbox calls `POST /api/integrations/whatsapp/send` with `{ "contactId": "…", "body": "…" }`. It requires an authenticated user with `crm.create` permission and a contact with a phone number that has not opted out. Meta must grant the token `whatsapp_business_messaging` access for the supplied phone number. The current UI sends text messages; Meta-approved templates are not yet implemented, so use an approved template to initiate messages outside the customer service window.

To configure a workspace-specific integration instead of environment fallback, an authenticated integrations manager can save provider `WHATSAPP_CLOUD` at `POST /api/integrations/config` with credentials `accessToken`, `appSecret`, and `verifyToken`, and public config `phoneNumberId`, `businessAccountId`, and optional `graphApiVersion`. Credentials are encrypted before persistence.
