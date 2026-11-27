-- Nuevo trabajo del bot: «productos» = leer (solo lectura) el listado de
-- productos y servicios de Finppi y cargarlos en el catálogo de LOGIKS.
alter table public.fe_jobs drop constraint if exists fe_jobs_tipo_check;
alter table public.fe_jobs add constraint fe_jobs_tipo_check
  check (tipo in ('emitir', 'healthcheck', 'reconciliar', 'productos'));

create or replace function public.fe_sincronizar_productos(p_empresa uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_job uuid;
begin
  if not app.tiene_rol(p_empresa, '{admin,contabilidad}') then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fe_cuentas where empresa_id = p_empresa and estado = 'activa') then
    raise exception 'Primero conecta y verifica tu cuenta de Finppi' using errcode = 'P0001';
  end if;
  select id into v_job from public.fe_jobs
    where empresa_id = p_empresa and tipo = 'productos' and estado in ('en_cola', 'corriendo') limit 1;
  if v_job is null then
    insert into public.fe_jobs (empresa_id, tipo, prioridad, creado_por)
      values (p_empresa, 'productos', 1, auth.uid()) returning id into v_job;
  end if;
  return v_job;
end $$;
revoke all on function public.fe_sincronizar_productos(uuid) from public, anon;
grant execute on function public.fe_sincronizar_productos(uuid) to authenticated;
