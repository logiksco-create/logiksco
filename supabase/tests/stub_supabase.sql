-- Simula lo mínimo de Supabase (auth.users, auth.uid(), roles) para probar
-- la migración en un Postgres puro. No se usa en Supabase real.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Storage mínimo (buckets y objetos) para probar las políticas de archivos.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to service_role;

-- Vault mínimo (sin cifrado real) para probar las funciones de llaves.
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), secret text, name text, description text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(s text, n text default null, d text default null) returns uuid
  language sql as $$ insert into vault.secrets (secret, name, description) values (s, n, d) returning id $$;
create or replace function vault.update_secret(i uuid, s text) returns void
  language sql as $$ update vault.secrets set secret = s where id = i $$;
