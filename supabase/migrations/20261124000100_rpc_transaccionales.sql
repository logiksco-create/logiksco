-- =====================================================================
-- Operaciones transaccionales expuestas por RPC. Corren con los permisos del
-- usuario (security invoker), así que RLS sigue aplicando a cada sentencia.
-- =====================================================================

-- Consecutivo accesible desde PostgREST (el esquema `app` no se expone).
create or replace function public.siguiente_consecutivo(p_empresa uuid, p_tipo text)
returns text language sql security invoker set search_path = '' as $$
  select app.siguiente_consecutivo(p_empresa, p_tipo);
$$;

-- Crea o edita una cotización con sus conceptos en una sola transacción.
-- p_datos: { cliente_id, contacto_id, tipo_servicio, incoterm, origen, destino,
--            mercancia, trm, moneda_presentacion, vigente_hasta, terminos,
--            conceptos: [ {bloque, descripcion, proveedor_id, moneda, unidad,
--                          cantidad, costo_unitario, venta_unitaria,
--                          vigencia_tarifa, para_terceros} ] }
create or replace function public.guardar_cotizacion(
  p_empresa uuid, p_datos jsonb, p_id uuid default null, p_origen_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_estado app.estado_cotizacion;
begin
  if v_id is null then
    insert into public.cotizaciones (
      empresa_id, consecutivo, cliente_id, contacto_id, comercial_id, tipo_servicio,
      incoterm, origen, destino, mercancia, trm, moneda_presentacion, vigente_hasta,
      terminos, origen_id
    ) values (
      p_empresa,
      public.siguiente_consecutivo(p_empresa, 'cotizacion'),
      (p_datos ->> 'cliente_id')::uuid,
      nullif(p_datos ->> 'contacto_id', '')::uuid,
      auth.uid(),
      (p_datos ->> 'tipo_servicio')::app.tipo_servicio,
      p_datos ->> 'incoterm',
      p_datos ->> 'origen',
      p_datos ->> 'destino',
      coalesce(p_datos -> 'mercancia', '{}'),
      (p_datos ->> 'trm')::numeric,
      (p_datos ->> 'moneda_presentacion')::app.moneda,
      (p_datos ->> 'vigente_hasta')::date,
      coalesce(p_datos ->> 'terminos', ''),
      p_origen_id
    ) returning id into v_id;
  else
    select estado into v_estado from public.cotizaciones
      where id = v_id and empresa_id = p_empresa for update;
    if not found then
      raise exception 'La cotización no existe' using errcode = 'P0002';
    end if;
    if v_estado = 'aceptada' then
      raise exception 'Una cotización aceptada no se edita: duplícala.' using errcode = 'P0001';
    end if;
    update public.cotizaciones set
      cliente_id = (p_datos ->> 'cliente_id')::uuid,
      contacto_id = nullif(p_datos ->> 'contacto_id', '')::uuid,
      tipo_servicio = (p_datos ->> 'tipo_servicio')::app.tipo_servicio,
      incoterm = p_datos ->> 'incoterm',
      origen = p_datos ->> 'origen',
      destino = p_datos ->> 'destino',
      mercancia = coalesce(p_datos -> 'mercancia', '{}'),
      trm = (p_datos ->> 'trm')::numeric,
      moneda_presentacion = (p_datos ->> 'moneda_presentacion')::app.moneda,
      vigente_hasta = (p_datos ->> 'vigente_hasta')::date,
      terminos = coalesce(p_datos ->> 'terminos', ''),
      -- RF-06: editar una cotización ya enviada genera una versión nueva.
      version = case when v_estado = 'borrador' then version else version + 1 end,
      estado = 'borrador'
    where id = v_id;
    delete from public.cotizacion_conceptos where cotizacion_id = v_id;
  end if;

  insert into public.cotizacion_conceptos (
    empresa_id, cotizacion_id, orden, bloque, descripcion, proveedor_id, moneda, unidad,
    cantidad, costo_unitario, venta_unitaria, vigencia_tarifa, para_terceros
  )
  select p_empresa, v_id, (c.ord - 1)::int,
    (c.v ->> 'bloque')::app.bloque_concepto,
    c.v ->> 'descripcion',
    nullif(c.v ->> 'proveedor_id', '')::uuid,
    (c.v ->> 'moneda')::app.moneda,
    (c.v ->> 'unidad')::app.unidad,
    (c.v ->> 'cantidad')::numeric,
    (c.v ->> 'costo_unitario')::numeric,
    (c.v ->> 'venta_unitaria')::numeric,
    nullif(c.v ->> 'vigencia_tarifa', '')::date,
    coalesce((c.v ->> 'para_terceros')::boolean, false)
  from jsonb_array_elements(coalesce(p_datos -> 'conceptos', '[]')) with ordinality as c(v, ord);

  return v_id;
end $$;

-- Abre un DO desde una cotización aceptada, con conceptos e hitos (RF-23).
create or replace function public.abrir_operacion(
  p_cotizacion uuid, p_responsable uuid, p_hitos text[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  q public.cotizaciones;
  v_id uuid;
  v_consecutivo text;
begin
  select * into q from public.cotizaciones where id = p_cotizacion for update;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;
  if q.estado <> 'aceptada' then
    raise exception 'Solo se abre un DO desde una cotización aceptada' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.operaciones where cotizacion_id = q.id) then
    raise exception 'Esta cotización ya tiene un DO abierto' using errcode = 'P0001';
  end if;

  v_consecutivo := public.siguiente_consecutivo(q.empresa_id, 'do');
  insert into public.operaciones (
    empresa_id, consecutivo, cotizacion_id, cliente_id, responsable_id, tipo,
    origen, destino, trm
  ) values (
    q.empresa_id, v_consecutivo, q.id, q.cliente_id, p_responsable, q.tipo_servicio,
    q.origen, q.destino, q.trm
  ) returning id into v_id;

  insert into public.do_conceptos (
    empresa_id, operacion_id, concepto_cotizado_id, bloque, descripcion, proveedor_id,
    moneda, cantidad, costo_cotizado, venta, vigencia_tarifa, para_terceros
  )
  select q.empresa_id, v_id, c.id, c.bloque, c.descripcion, c.proveedor_id, c.moneda,
    c.cantidad, c.costo_unitario, c.venta_unitaria, c.vigencia_tarifa, c.para_terceros
  from public.cotizacion_conceptos c where c.cotizacion_id = q.id order by c.orden;

  insert into public.do_hitos (empresa_id, operacion_id, orden, nombre)
  select q.empresa_id, v_id, (h.ord - 1)::int, h.nombre
  from unnest(p_hitos) with ordinality as h(nombre, ord);

  return v_id;
end $$;

revoke all on function public.siguiente_consecutivo(uuid, text) from public, anon;
revoke all on function public.guardar_cotizacion(uuid, jsonb, uuid, uuid) from public, anon;
revoke all on function public.abrir_operacion(uuid, uuid, text[]) from public, anon;
grant execute on function public.siguiente_consecutivo(uuid, text) to authenticated;
grant execute on function public.guardar_cotizacion(uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.abrir_operacion(uuid, uuid, text[]) to authenticated;
