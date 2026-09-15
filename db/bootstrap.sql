-- Compatibility names preserve the audited domain migrations, without Supabase services.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if exists(select 1 from pg_roles where rolname='authenticated' and (rolsuper or rolbypassrls or rolcanlogin)) then raise exception 'authenticated must be a non-login role without RLS bypass'; end if;
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='authenticated') then raise exception 'authenticated must not inherit other roles'; end if;
  execute format('grant authenticated to %I', current_user);
end $$;
create schema if not exists auth;
create schema if not exists extensions;
revoke create on schema public from public;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text not null unique, clerk_id text not null unique);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,extensions to authenticated;
grant execute on function auth.uid() to authenticated;
revoke all on auth.users from public,anon,authenticated;
create table if not exists public.remember_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now());
revoke all on public.remember_migrations from public,anon,authenticated;
