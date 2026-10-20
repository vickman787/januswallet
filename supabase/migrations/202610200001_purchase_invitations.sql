-- Add purchase invitations for username-based participant discovery.
-- Apply after 202610190001_product_flows.sql.
begin;

create table if not exists public.purchase_participants (
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','dismissed')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (purchase_id, profile_id)
);

create index if not exists purchase_participants_profile_status_idx
  on public.purchase_participants(profile_id, status, created_at desc);

alter table public.purchase_participants enable row level security;
revoke all on public.purchase_participants from anon, authenticated;
grant select, insert, update, delete on public.purchase_participants to service_role;

commit;
