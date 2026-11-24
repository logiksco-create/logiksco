-- Prueba: una empresa nunca ve ni modifica datos de otra (RNF Aislamiento).
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'diego@oikor.co'),
  ('00000000-0000-0000-0000-00000000000b', 'ana@otra.co');

-- Cada usuario registra su empresa.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.registrar_empresa('901234567', 'Oikor Colombia SAS', 'Diego') as empresa_a \gset
insert into public.terceros (empresa_id, tipo, nit, razon_social) values (:'empresa_a', 'cliente', '800111', 'Cliente de Oikor');
select app.siguiente_consecutivo(:'empresa_a', 'cotizacion') as c1;
select app.siguiente_consecutivo(:'empresa_a', 'cotizacion') as c2;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.registrar_empresa('900999888', 'Otra Logística SAS', 'Ana') as empresa_b \gset

-- B no ve los terceros ni la empresa de A.
do $$ begin
  if (select count(*) from public.terceros) <> 0 then raise exception 'FUGA: B ve terceros de A'; end if;
  if (select count(*) from public.empresas) <> 1 then raise exception 'FUGA: B ve empresas ajenas'; end if;
end $$;

-- B no puede escribir en la empresa de A: ambas sentencias DEBEN fallar
-- (los ERROR de RLS / "sin acceso a la empresa" en la salida son esperados).
\set ON_ERROR_STOP off
insert into public.terceros (empresa_id, tipo, nit, razon_social) values (:'empresa_a', 'cliente', '1', 'intruso');
select app.siguiente_consecutivo(:'empresa_a', 'cotizacion');
\set ON_ERROR_STOP on

-- A sigue viendo solo lo suyo y su consecutivo no fue tocado por B.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.terceros) <> 1 then raise exception 'A debería ver 1 tercero'; end if;
  if (select ultimo from public.consecutivos) <> 2 then raise exception 'consecutivo alterado'; end if;
end $$;

-- La auditoría es inmutable: el UPDATE DEBE fallar.
reset role;
\set ON_ERROR_STOP off
update public.auditoria set accion = 'x';
\set ON_ERROR_STOP on
select count(*) as filas_auditoria from public.auditoria;
\echo 'OK: aislamiento entre empresas verificado'

-- RPC transaccionales: cotización con conceptos → aceptada → DO con hitos.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select id as cliente_a from public.terceros limit 1 \gset
select public.guardar_cotizacion(:'empresa_a', jsonb_build_object(
  'cliente_id', :'cliente_a', 'tipo_servicio', 'aereo', 'incoterm', 'FCA',
  'origen', 'MDE', 'destino', 'MIA', 'trm', 3985, 'moneda_presentacion', 'USD',
  'vigente_hasta', '2030-01-01',
  'conceptos', jsonb_build_array(
    jsonb_build_object('bloque', 'flete', 'descripcion', 'Flete', 'moneda', 'USD', 'unidad', 'kg',
      'cantidad', 100, 'costo_unitario', 1.5, 'venta_unitaria', 2)))) as cot \gset
select public.guardar_cotizacion(:'empresa_a', jsonb_build_object(
  'cliente_id', :'cliente_a', 'tipo_servicio', 'aereo', 'incoterm', 'FCA',
  'origen', 'MDE', 'destino', 'MIA', 'trm', 3985, 'moneda_presentacion', 'USD',
  'vigente_hasta', '2030-01-01', 'conceptos', '[]'::jsonb), :'cot');
update public.cotizaciones set estado = 'aceptada' where id = :'cot';
select public.abrir_operacion(:'cot', '00000000-0000-0000-0000-00000000000a', array['Booking', 'ETD', 'ETA']) as op \gset
do $$ begin
  if (select count(*) from public.do_hitos) <> 3 then raise exception 'faltan hitos'; end if;
  if (select consecutivo from public.operaciones) <> 'DO-' || extract(year from now() at time zone 'America/Bogota') || '-0001' then
    raise exception 'consecutivo DO inesperado';
  end if;
end $$;
-- B no puede abrir DO sobre la cotización de A (DEBE fallar).
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\set ON_ERROR_STOP off
select public.abrir_operacion(:'cot', '00000000-0000-0000-0000-00000000000b', array['x']);
\set ON_ERROR_STOP on
\echo 'OK: RPC transaccionales verificadas'
