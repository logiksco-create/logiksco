-- Gestión de usuarios de la empresa (RF-54): correo visible para el admin
-- y búsqueda de un usuario existente por correo al invitarlo.

alter table public.usuarios_empresa add column if not exists correo text;

update public.usuarios_empresa ue set correo = u.email
from auth.users u where u.id = ue.usuario_id and ue.correo is null;

create or replace function public.registrar_empresa(p_nit text, p_razon_social text, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticación requerida' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select empresa_id into v_id from public.usuarios_empresa
    where usuario_id = auth.uid() and activo limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.empresas (nit, razon_social) values (p_nit, p_razon_social) returning id into v_id;
  insert into public.usuarios_empresa (empresa_id, usuario_id, roles, nombre, correo)
    values (v_id, auth.uid(), '{admin}', p_nombre, (select email from auth.users where id = auth.uid()));
  insert into public.suscripciones (empresa_id, max_usuarios, max_do_mes) values (v_id, 3, 10);
  return v_id;
end $$;
revoke all on function public.registrar_empresa(text, text, text) from public, anon;
grant execute on function public.registrar_empresa(text, text, text) to authenticated;

-- Solo el servidor (llave de servicio) puede buscar usuarios por correo.
create or replace function public.usuario_por_correo(p_correo text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_correo) limit 1;
$$;
revoke all on function public.usuario_por_correo(text) from public, anon, authenticated;
grant execute on function public.usuario_por_correo(text) to service_role;
