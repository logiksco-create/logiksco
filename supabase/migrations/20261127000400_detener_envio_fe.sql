-- Detener un envío a Finppi que sigue en cola (el bot aún no lo tomó).
-- La factura vuelve a prefactura con la misma referencia, para corregir
-- datos y volver a enviarla. Si el bot ya la está trabajando, no se toca:
-- podría estar pasando el punto de no retorno.
create or replace function public.fe_detener_envio(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.facturas;
  n int;
begin
  select * into f from public.facturas where id = p_factura for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0002';
  end if;
  if not app.tiene_rol(f.empresa_id, '{contabilidad}') then
    raise exception 'Solo Contabilidad detiene envíos' using errcode = '42501';
  end if;
  if exists (select 1 from public.fe_jobs where factura_id = p_factura and estado = 'corriendo') then
    raise exception 'El bot ya está trabajando en esta factura: espera a que termine' using errcode = 'P0001';
  end if;
  update public.fe_jobs
    set estado = 'cancelado', terminado_el = now(), error = 'Detenido por ' || coalesce((select nombre from public.usuarios_empresa where usuario_id = auth.uid() and empresa_id = f.empresa_id), 'el usuario')
  where factura_id = p_factura and estado = 'en_cola' and not punto_no_retorno;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No hay un envío en cola para detener' using errcode = 'P0001';
  end if;
  if f.estado::text in ('en_cola', 'fallida') then
    update public.facturas set estado = 'borrador', error = null, error_codigo = null where id = p_factura;
  end if;
end $$;
revoke all on function public.fe_detener_envio(uuid) from public, anon;
grant execute on function public.fe_detener_envio(uuid) to authenticated;
