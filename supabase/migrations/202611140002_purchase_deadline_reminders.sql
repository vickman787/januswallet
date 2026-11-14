-- Background reminders use indexed deadline windows; chain state remains authoritative.
begin;
alter table public.purchases
  add column if not exists funding_deadline bigint,
  add column if not exists release_deadline bigint;
create index if not exists purchases_funding_deadline_idx on public.purchases(funding_deadline)
  where funding_deadline is not null;
create index if not exists purchases_release_deadline_idx on public.purchases(release_deadline)
  where release_deadline is not null;
commit;
