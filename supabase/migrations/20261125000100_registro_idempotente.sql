-- El primer ingreso puede disparar varias peticiones en paralelo: si el
-- usuario ya pertenece a una empresa, se devuelve esa en lugar de fallar.
create or replace function public.registrar_empresa(p_nit text, p_razon_social text, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticación requerida' using errcode = '42501';
  end if;
  -- Serializa los registros del mismo usuario.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select empresa_id into v_id from public.usuarios_empresa
    where usuario_id = auth.uid() and activo limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.empresas (nit, razon_social) values (p_nit, p_razon_social) returning id into v_id;
  insert into public.usuarios_empresa (empresa_id, usuario_id, roles, nombre)
    values (v_id, auth.uid(), '{admin}', p_nombre);
  insert into public.suscripciones (empresa_id, max_usuarios, max_do_mes) values (v_id, 3, 10);
  return v_id;
end $$;

revoke all on function public.registrar_empresa(text, text, text) from public, anon;
grant execute on function public.registrar_empresa(text, text, text) to authenticated;
