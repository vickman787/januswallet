-- Run in Supabase SQL Editor after 202611140002_purchase_deadline_reminders.sql.
-- Replace the placeholder with the same high-entropy CRON_SECRET configured on Vercel.
-- Enable the pg_cron and pg_net extensions in Supabase Dashboard first.
select vault.create_secret('REPLACE_WITH_CRON_SECRET', 'janus_purchase_reminder_cron_secret');
select cron.schedule(
  'janus-purchase-deadline-reminders',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://januswallet.xyz/api/cron/purchase-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'janus_purchase_reminder_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $$
);
