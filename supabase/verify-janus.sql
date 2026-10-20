-- Read-only verification. Run in the new JANUS Arc project's SQL Editor.
-- Expect 13 rows: rls_enabled=true, anon_has_table_grant=false,
-- authenticated_has_table_grant=false. No user records are selected.
select tablename,
       rowsecurity as rls_enabled,
       has_table_privilege('anon', format('%I.%I', schemaname, tablename),
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_has_table_grant,
       has_table_privilege('authenticated', format('%I.%I', schemaname, tablename),
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_has_table_grant
from pg_tables
where schemaname = 'public'
  and tablename = any(array['profiles','wallet_associations','groups','group_members',
    'payment_requests','splits','split_participants','purchases','activity',
    'purchase_contributions','purchase_participants','notifications','wallet_challenges'])
order by tablename;

-- Expect both false, and service_role=true.
select has_function_privilege('anon', 'public.consume_wallet_challenge(uuid,text)', 'EXECUTE') as anon_can_consume,
       has_function_privilege('authenticated', 'public.consume_wallet_challenge(uuid,text)', 'EXECUTE') as authenticated_can_consume,
       has_function_privilege('service_role', 'public.consume_wallet_challenge(uuid,text)', 'EXECUTE') as service_can_consume;
