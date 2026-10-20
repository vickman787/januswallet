-- Apply after 202610180001_foundation.sql. Server credentials only.
begin;
create table public.wallet_challenges (
  id uuid primary key,
  owner_subject text not null,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  message text not null,
  expires_at timestamptz not null
);
alter table public.wallet_challenges enable row level security;
revoke all on public.wallet_challenges from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.wallet_associations, public.wallet_challenges to service_role;

create function public.consume_wallet_challenge(challenge_id uuid, subject_id text)
returns setof public.wallet_challenges
language sql security invoker set search_path = '' as $$
  delete from public.wallet_challenges
  where id = challenge_id and owner_subject = subject_id and expires_at > now()
  returning *;
$$;
revoke all on function public.consume_wallet_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_wallet_challenge(uuid, text) to service_role;
-- Run periodic cleanup: delete from public.wallet_challenges where expires_at < now();
commit;
