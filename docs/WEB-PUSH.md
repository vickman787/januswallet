# Web push alerts

JANUS supports optional browser and phone alerts for new group invitations, accepted group members, named split shares, and shared purchase invitations. Alerts are tied to the signed-in JANUS profile and the browser installation. The Inbox remains the source of truth; push delivery is best effort and does not confirm a payment or change an on-chain state.

## Enable in a deployment

1. Apply `supabase/migrations/202611140001_web_push.sql` in the Supabase SQL editor for the same project used by the JANUS API. It creates private `push_subscriptions` and `push_deliveries` tables. Do not expose the service-role key to the browser.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as server environment variables in the API deployment. Keep the private key secret and keep the same pair across deployments; rotating it invalidates existing browser subscriptions.
3. Redeploy the API and website. Sign in, open Settings, and select **Enable alerts** on each device that should receive notifications. Allow the browser permission prompt. Settings shows a server-setup message until both keys and the migration are present.
4. Test on HTTPS using two JANUS accounts. Enable alerts for the invitee; create a group invite, named split, or shared purchase from the other account. The invitee should receive an alert and find the item in Inbox. Accept a group invitation to check that existing accepted members receive the join alert.

The server accepts subscriptions only for authenticated profiles and only from recognized browser push endpoints. It stores the browser endpoint and encryption keys in Supabase, with access limited to the server role. Signing out from Settings unsubscribes this browser. Turning off alerts also unsubscribes it. A stale subscription is removed after the push provider reports it gone.

## Deadline reminders

Purchase deadline notices currently appear when Inbox refreshes. This release does not send background deadline push reminders. Those need a scheduled server job plus verified purchase state checks, and scheduling frequency depends on the deployment plan. Do not promise an exact-time reminder until that job is deployed and tested.
