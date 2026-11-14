-- Add Web Push subscriptions and per-device delivery deduplication.
-- Apply after 202610200001_purchase_invitations.sql.
begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions(profile_id);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (subscription_id, event_key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions, public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.push_deliveries to service_role;

commit;
