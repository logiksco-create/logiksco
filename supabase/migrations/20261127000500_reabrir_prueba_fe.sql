-- Modo prueba: una factura cuyo «Guardar» en Finppi quedó sin confirmar
-- (estado_desconocido / revision) vuelve a prefactura para reintentarla.
-- Nunca aplica a emisiones reales (las que pulsan «Enviar» a la DIAN).
create or replace function public.fe_reabrir_prueba(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.facturas;
  modo text;
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
    raise exception 'El bot está trabajando en esta factura: espera a que termine' using errcode = 'P0001';
  end if;
  select j.payload->>'modo' into modo from public.fe_jobs j
    where j.factura_id = p_factura and j.tipo = 'emitir' and not j.dry_run
    order by j.creado_el desc limit 1;
  if coalesce(modo, '') <> 'borrador' then
    raise exception 'Solo las pruebas (Guardar en Finppi) se pueden reabrir; una emisión real se verifica en Finppi' using errcode = 'P0001';
  end if;
  update public.fe_jobs set estado = 'cancelado', terminado_el = now()
    where factura_id = p_factura and tipo = 'reconciliar' and estado = 'en_cola';
  update public.facturas set estado = 'borrador', error = null, error_codigo = null where id = p_factura;
end $$;
revoke all on function public.fe_reabrir_prueba(uuid) from public, anon;
grant execute on function public.fe_reabrir_prueba(uuid) to authenticated;
