# Supabase migrations

Two reviewed SQL batches are applied to the MapSilip Supabase project and recorded in remote migration history:

- `20261025081017_staff_authorization.sql` creates the staff authority/session foundation.
- `20261025081034_staff_security_probes.sql` creates fixed synthetic RLS marker tables and rows.

The files in this directory are exact copies of the approved review SQL. Their hashes match the corresponding files under `supabase/review/`. The Storage fixture remains unapplied. No Auth test identities, staff account mappings, executor password, or Storage resources have been provisioned. Staff Auth remains disabled.

The migration files keep local source history aligned with the remote migration versions returned by Supabase MCP. Do not reset, drop, truncate, or clean the permanent project. For future changes, create focused migration files with the supported Supabase workflow, validate them, and apply them only after exact approval. Docker is not required. Local SQL syntax validation was unavailable; the applied files were accepted by the hosted PostgreSQL migration service. Hosted Auth, positive RLS, session, concurrency, and Storage security tests remain incomplete.

Never commit credentials or service-role/secret keys.
