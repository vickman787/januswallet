-- Additive JANUS product-flow migration.
-- Apply after 202610180002_wallet_verification.sql.
-- Existing profiles and verified wallets are preserved.
begin;

alter table public.payment_requests
  add column if not exists payer_id uuid references public.profiles(id),
  add column if not exists paid_by_address text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.splits
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  add column if not exists updated_at timestamptz not null default now();

alter table public.split_participants
  add column if not exists profile_id uuid references public.profiles(id),
  add column if not exists status text not null default 'unclaimed'
    check (status in ('unclaimed','reserved','pending','paid')),
  add column if not exists reserved_until timestamptz,
  add column if not exists payer_address text,
  add column if not exists paid_at timestamptz;

alter table public.purchases
  add column if not exists created_at timestamptz not null default now();

create index if not exists payment_requests_payer_status_idx
  on public.payment_requests(payer_id, status, created_at desc);
create index if not exists payment_requests_requester_idx
  on public.payment_requests(requester_id, created_at desc);
create index if not exists group_members_profile_status_idx
  on public.group_members(profile_id, status);
create index if not exists split_participants_profile_status_idx
  on public.split_participants(profile_id, status);
create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);

create unique index if not exists payment_requests_confirmed_tx_unique
  on public.payment_requests(lower(confirmed_tx_hash)) where confirmed_tx_hash is not null;
create unique index if not exists split_participants_confirmed_tx_unique
  on public.split_participants(lower(confirmed_tx_hash)) where confirmed_tx_hash is not null;

-- All product data remains server-only. The browser receives data through the
-- Privy-token-verified JANUS API and never receives a Supabase credential.
do $$
declare relation text;
begin
  foreach relation in array array[
    'groups','group_members','payment_requests','splits','split_participants',
    'purchases','activity','purchase_contributions','notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from anon, authenticated', relation);
    execute format('grant select, insert, update, delete on public.%I to service_role', relation);
  end loop;
end $$;

commit;