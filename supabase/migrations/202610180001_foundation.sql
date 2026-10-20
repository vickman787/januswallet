-- Unexecuted database foundation. Review before applying to a new Supabase project.
-- Fail closed: no client policies or grants until a verified auth integration exists.
begin;
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null unique,
  username text not null unique check (username ~ '^[a-z0-9_]{1,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.wallet_associations (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  profile_id uuid not null references public.profiles(id),
  verified_at timestamptz not null,
  chain_id bigint not null
);
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id),
  profile_id uuid not null references public.profiles(id),
  role text not null check (role in ('organizer', 'member')),
  status text not null check (status in ('invited','accepted','declined')),
  primary key (group_id, profile_id)
);
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  recipient_address text not null references public.wallet_associations(address),
  chain_id bigint not null,
  amount_raw numeric(78,0) not null check (amount_raw > 0),
  description text not null default '',
  status text not null default 'unpaid' check (status in ('unpaid','pending','paid','cancelled','expired')),
  confirmed_tx_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.splits (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  group_id uuid references public.groups(id),
  recipient_address text not null references public.wallet_associations(address),
  kind text not null check (kind in ('named','open')),
  total_raw numeric(78,0) not null check (total_raw > 0),
  share_count integer not null check (share_count between 1 and 1000),
  title text not null,
  chain_id bigint not null,
  created_at timestamptz not null default now()
);
create table public.split_participants (
  split_id uuid not null references public.splits(id),
  share_index integer not null check (share_index >= 0),
  wallet_address text references public.wallet_associations(address),
  amount_raw numeric(78,0) not null check (amount_raw > 0),
  confirmed_tx_hash text,
  primary key (split_id, share_index)
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  onchain_id text not null check (onchain_id ~ '^0x[0-9a-f]{64}$'),
  organizer_id uuid not null references public.profiles(id),
  group_id uuid references public.groups(id),
  title text not null,
  description text not null default '',
  creation_tx_hash text not null,
  unique (chain_id, contract_address, onchain_id)
  -- State, amounts, policies and deadlines must be reconciled with chain truth.
);
create table public.activity (
  chain_id bigint not null,
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null,
  event_type text not null,
  from_address text not null,
  to_address text not null,
  amount_raw numeric(78,0) not null check (amount_raw >= 0),
  primary key (chain_id, tx_hash, log_index)
);
create table public.purchase_contributions (
  purchase_id uuid not null references public.purchases(id),
  chain_id bigint not null,
  tx_hash text not null,
  log_index integer not null,
  contributor_address text not null,
  amount_raw numeric(78,0) not null check (amount_raw > 0),
  primary key (chain_id, tx_hash, log_index),
  foreign key (chain_id, tx_hash, log_index) references public.activity(chain_id, tx_hash, log_index)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  event_key text not null,
  kind text not null,
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);
do $$
declare relation text;
begin
  foreach relation in array array['profiles','wallet_associations','groups','group_members',
    'payment_requests','splits','split_participants','purchases','activity','purchase_contributions','notifications']
  loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from anon, authenticated', relation);
  end loop;
end $$;
commit;
