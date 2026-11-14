# Web push alerts

JANUS supports optional browser and phone alerts for new group invitations, accepted group members, named split shares, and shared purchase invitations. Alerts are tied to the signed-in JANUS profile and the browser installation. The Inbox remains the source of truth; push delivery is best effort and does not confirm a payment or change an on-chain state.

## Enable in a deployment

1. Apply `supabase/migrations/202611140001_web_push.sql` in the Supabase SQL editor for the same project used by the JANUS API. It creates private `push_subscriptions` and `push_deliveries` tables. Do not expose the service-role key to the browser.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as server environment variables in the API deployment. Keep the private key secret and keep the same pair across deployments; rotating it invalidates existing browser subscriptions.
3. Redeploy the API and website. Sign in, open Settings, and select **Enable alerts** on each device that should receive notifications. Allow the browser permission prompt. Settings shows a server-setup message until both keys and the migration are present.
4. Test on HTTPS using two JANUS accounts. Enable alerts for the invitee; create a group invite, named split, or shared purchase from the other account. The invitee should receive an alert and find the item in Inbox. Accept a group invitation to check that existing accepted members receive the join alert.

The server accepts subscriptions only for authenticated profiles and only from recognized browser push endpoints. It stores the browser endpoint and encryption keys in Supabase, with access limited to the server role. Signing out from Settings unsubscribes this browser. Turning off alerts also unsubscribes it. A stale subscription is removed after the push provider reports it gone.

## Background purchase deadline reminders

The background worker checks Arc purchase state before sending an alert. It reminds invited participants who have not contributed when the funding deadline enters the 24-hour and one-hour windows. Once fully funded, it reminds the organizer when the release deadline enters those windows. It never sends a reminder after the relevant deadline, after settlement, or after a participant has contributed. Push delivery is best effort, and the scheduler runs every five minutes, so alerts are approximate rather than exact-time guarantees. Browser notification permission and an active subscription are required.

To activate the worker:

1. Apply `supabase/migrations/202611140002_purchase_deadline_reminders.sql` in the same Supabase project as JANUS. The worker backfills purchase deadlines from Arc in small batches.
2. Configure a high-entropy `CRON_SECRET` as a **server-only** Vercel production environment variable. The value must match the secret stored in Supabase Vault. Never put it in a `VITE_` variable or commit it. The local machine's ignored `.env.server` and `supabase/purchase_deadline_cron_setup.local.sql` contain the prepared secret.
3. In the Supabase dashboard, enable the `pg_cron` and `pg_net` extensions. Run the ignored `supabase/purchase_deadline_cron_setup.local.sql` in SQL Editor. It stores the secret in Vault and schedules an authenticated POST to the JANUS API every five minutes. The checked-in `supabase/purchase_deadline_cron_setup.sql` is a template without the secret.
4. Deploy the API with the migration in place. Check Supabase Cron run history and the Vercel function logs, then test with a short-lived test purchase and an opted-in second browser. A reminder only sends if on-chain state says the purchase still needs action.

The scheduled endpoint is `POST /api/cron/purchase-reminders`. It accepts only the configured bearer secret. Push delivery keys prevent repeats when the job runs more than once in the same window. Vercel Hobby cron alone cannot provide a reliable five-minute schedule, which is why Supabase runs the timer.