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

-- Archivos: A (admin) sube y lee documentos de su DO; B no los ve ni puede
-- subir en la carpeta de A. Soportes 170: solo Cumplimiento/Admin.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into storage.objects (bucket_id, name) values ('documentos', :'empresa_a' || '/do/' || :'op' || '/bl.pdf');
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'A no ve su documento'; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from storage.objects) <> 0 then raise exception 'FUGA: B ve documentos de A'; end if;
end $$;
\set ON_ERROR_STOP off
insert into storage.objects (bucket_id, name) values ('documentos', :'empresa_a' || '/do/x/intruso.pdf');
\set ON_ERROR_STOP on
reset role;
insert into storage.objects (bucket_id, name) values ('documentos', :'empresa_a' || '/170/f/rut.pdf');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from storage.objects) <> 0 then raise exception 'FUGA: B ve soportes 170 de A'; end if;
end $$;
\echo 'OK: archivos aislados por empresa y rol'

-- Comunicaciones: solo se permite registrar entrega/apertura.
reset role;
insert into public.comunicaciones (empresa_id, direccion, de, para, asunto) values (:'empresa_a', 'saliente', 'a@x.co', '{b@x.co}', 'Prueba') ;
update public.comunicaciones set abierto_el = now() where asunto = 'Prueba';
\set ON_ERROR_STOP off
update public.comunicaciones set asunto = 'Alterado' where asunto = 'Prueba';
delete from public.comunicaciones where asunto = 'Prueba';
\set ON_ERROR_STOP on
do $$ begin
  if (select count(*) from public.comunicaciones where asunto = 'Prueba' and abierto_el is not null) <> 1 then
    raise exception 'comunicación alterada o sin acuse';
  end if;
end $$;
\echo 'OK: trazabilidad inmutable salvo acuses'

-- Llave de Megafoco: el admin la guarda; nadie autenticado la lee; B no
-- puede guardarla en la empresa de A.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.guardar_llave_megafoco(:'empresa_a', 'llave-secreta-de-prueba-123');
\set ON_ERROR_STOP off
select public.llave_megafoco(:'empresa_a');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.guardar_llave_megafoco(:'empresa_a', 'llave-del-intruso-1234567');
\set ON_ERROR_STOP on
reset role;
set role service_role;
do $$ begin
  if (select public.llave_megafoco(id) from public.empresas where nit = '901234567') <> 'llave-secreta-de-prueba-123' then
    raise exception 'llave alterada o ilegible por el servidor';
  end if;
end $$;
reset role;
\echo 'OK: llave de Megafoco protegida'

-- Portal: un usuario del cliente no ve ninguna tabla de la empresa.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000c', 'cliente@x.co');
insert into public.usuarios_cliente (empresa_id, tercero_id, usuario_id, nombre, correo)
  values (:'empresa_a', :'cliente_a', '00000000-0000-0000-0000-00000000000c', 'Cliente', 'cliente@x.co');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if (select count(*) from public.cotizaciones) + (select count(*) from public.cotizacion_conceptos)
     + (select count(*) from public.terceros) + (select count(*) from public.operaciones)
     + (select count(*) from public.facturas) + (select count(*) from public.formularios_170) <> 0 then
    raise exception 'FUGA: el usuario del portal lee tablas de la empresa';
  end if;
  if (select count(*) from public.usuarios_cliente) <> 1 then raise exception 'el cliente no ve su acceso'; end if;
end $$;
reset role;
\echo 'OK: portal sin acceso directo a datos de la empresa'

-- Contactos: el comercial de A borra; B no puede borrar los de A.
reset role;
insert into public.contactos (empresa_id, tercero_id, nombre) values (:'empresa_a', :'cliente_a', 'Contacto A');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
delete from public.contactos where nombre = 'Contacto A';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.contactos where nombre = 'Contacto A') <> 1 then raise exception 'FUGA: B borró un contacto de A'; end if;
end $$;
delete from public.contactos where nombre = 'Contacto A';
do $$ begin
  if (select count(*) from public.contactos where nombre = 'Contacto A') <> 0 then raise exception 'A no pudo borrar su contacto'; end if;
end $$;
reset role;
\echo 'OK: contactos solo los borra su empresa'
