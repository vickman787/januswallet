# Initialize JANUS Arc Supabase

Use only the new JANUS Arc project. The Monad application's database is separate.

1. Open this project's SQL Editor in the Supabase dashboard and choose New query.
2. Copy all of setup-janus.sql into the editor and run the whole script once.
3. Report success or the error message. Keep credentials out of screenshots.
4. The agent can then verify the expected tables through the configured Data API.

The bundle combines the two migrations in one transaction. It creates 12 tables,
enables RLS and revokes anonymous/authenticated client grants. The account API
uses the server key and performs its own verified-subject authorization.
Existing objects cause an error and rollback instead of an overwrite. Do not
rerun after success. The bundle contains no database password or API key.

The owner reported running this through SQL Editor on 19 October 2026. Read-only Data API checks confirmed all 12 tables and the wallet challenge RPC are available. RLS flags and SQL grants cannot be independently inspected through that Data API check; run verify-janus.sql in SQL Editor to verify those separately.
The server secret key is for the Data API; it cannot execute arbitrary DDL SQL.
Applying this through SQL Editor does not record CLI migration history. Before
adopting a CLI migration workflow, reconcile its history for these two migrations
rather than attempting to create the same objects again.
