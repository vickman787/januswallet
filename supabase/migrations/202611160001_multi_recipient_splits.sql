-- Multi-recipient split payouts. Existing single-recipient splits remain unchanged.
begin;
alter table public.splits add column recipient_count integer not null default 1 check (recipient_count between 1 and 20);
create table public.split_payouts (
  split_id uuid not null,
  share_index integer not null,
  payout_index integer not null check (payout_index >= 0 and payout_index < 20),
  recipient_address text not null references public.wallet_associations(address),
  amount_raw numeric(78,0) not null check (amount_raw > 0),
  confirmed_tx_hash text,
  paid_at timestamptz,
  primary key (split_id, share_index, payout_index),
  foreign key (split_id, share_index) references public.split_participants(split_id, share_index) on delete cascade
);
create unique index split_payouts_confirmed_tx_unique
  on public.split_payouts(lower(confirmed_tx_hash)) where confirmed_tx_hash is not null;
create index split_payouts_split_idx on public.split_payouts(split_id, share_index);
alter table public.split_payouts enable row level security;
revoke all on public.split_payouts from anon, authenticated;
grant select, insert, update, delete on public.split_payouts to service_role;

-- The API verifies the on-chain transfer before calling this function. Lock the
-- share so concurrent confirmations cannot lose progress or release a partial share.
create function public.confirm_split_payout(
  p_split_id uuid, p_share_index integer, p_payout_index integer,
  p_profile_id uuid, p_wallet text, p_hash text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_remaining boolean;
begin
  select status into v_status from public.split_participants
    where split_id = p_split_id and share_index = p_share_index
      and profile_id = p_profile_id and wallet_address = p_wallet
    for update;
  if not found or v_status not in ('reserved', 'pending') then return null; end if;
  if exists(select 1 from public.split_participants where lower(confirmed_tx_hash) = lower(p_hash)) then return null; end if;
  update public.split_payouts
    set confirmed_tx_hash = lower(p_hash), paid_at = now()
    where split_id = p_split_id and share_index = p_share_index
      and payout_index = p_payout_index and confirmed_tx_hash is null;
  if not found then return null; end if;
  select exists(select 1 from public.split_payouts
    where split_id = p_split_id and share_index = p_share_index and confirmed_tx_hash is null)
    into v_remaining;
  update public.split_participants
    set status = case when v_remaining then 'pending' else 'paid' end,
        payer_address = p_wallet, reserved_until = null,
        paid_at = case when v_remaining then null else now() end
    where split_id = p_split_id and share_index = p_share_index;
  return not v_remaining;
end;
$$;
revoke all on function public.confirm_split_payout(uuid, integer, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_split_payout(uuid, integer, integer, uuid, text, text) to service_role;
commit;
