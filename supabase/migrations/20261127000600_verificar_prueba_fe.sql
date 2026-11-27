-- Modo prueba: pide al bot que busque (solo lectura) el borrador que dejó un
-- «Guardar» sin confirmar. Si lo encuentra, la factura queda como prueba guardada.
create or replace function public.fe_verificar_prueba(p_factura uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  f public.facturas;
  modo text;
  v_job uuid;
begin
  select * into f from public.facturas where id = p_factura for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0002';
  end if;
  if not app.tiene_rol(f.empresa_id, '{contabilidad}') then
    raise exception 'Solo Contabilidad puede hacerlo' using errcode = '42501';
  end if;
  if f.estado::text not in ('estado_desconocido', 'revision') then
    raise exception 'La factura no está pendiente de verificación' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fe_jobs where factura_id = p_factura and estado in ('en_cola', 'corriendo')) then
    raise exception 'El bot ya está trabajando en esta factura' using errcode = 'P0001';
  end if;
  select j.payload->>'modo' into modo from public.fe_jobs j
    where j.factura_id = p_factura and j.tipo = 'emitir' and not j.dry_run
    order by j.creado_el desc limit 1;
  if coalesce(modo, '') <> 'borrador' then
    raise exception 'Solo aplica a pruebas (Guardar en Finppi)' using errcode = 'P0001';
  end if;
  insert into public.fe_jobs (empresa_id, factura_id, tipo, prioridad, creado_por)
    values (f.empresa_id, p_factura, 'reconciliar', 2, auth.uid()) returning id into v_job;
  update public.facturas set estado = 'estado_desconocido', error = null where id = p_factura;
  return v_job;
end $$;
revoke all on function public.fe_verificar_prueba(uuid) from public, anon;
grant execute on function public.fe_verificar_prueba(uuid) to authenticated;
