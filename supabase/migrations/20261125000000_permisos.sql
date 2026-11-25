-- =====================================================================
-- Permisos explícitos sobre tablas (no depender de los privilegios por
-- defecto). RLS sigue filtrando las filas; esto solo habilita la tabla.
--  - anon: sin acceso a ninguna tabla (el enlace público usa el servidor).
--  - authenticated: CRUD sujeto a RLS.
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Tablas futuras: lo mismo por defecto.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Funciones internas usadas por triggers y políticas.
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
