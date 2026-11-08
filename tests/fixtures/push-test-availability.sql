-- Isolated test database ONLY. Actual push_runtime row remains false.
-- Mock infrastructure availability, never introduce a production environment bypass.
create schema mapsilip_test;
create table mapsilip_test.availability(available boolean not null);
insert into mapsilip_test.availability values(true);
create or replace function mapsilip_private.push_is_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select (select available from mapsilip_test.availability) and coalesce(current_setting('mapsilip_test.push_paused',true),'false') <> 'true'
$$;
