-- =====================================================================
-- LOGIKS.CO · Esquema inicial multiempresa
--
-- Regla central: toda tabla con datos de negocio lleva `empresa_id` y una
-- política RLS que solo expone las filas de las empresas del usuario.
-- Nada operativo se borra físicamente: los expedientes se conservan.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type app.rol as enum ('admin', 'comercial', 'operaciones', 'cumplimiento', 'contabilidad');
create type app.moneda as enum ('COP', 'USD');
create type app.tipo_tercero as enum ('cliente', 'prospecto', 'proveedor');
create type app.tipo_servicio as enum ('aereo', 'maritimo_fcl', 'maritimo_lcl', 'terrestre', 'aduana', 'seguro', 'multimodal');
create type app.estado_cotizacion as enum ('borrador', 'enviada', 'vista', 'aceptada', 'rechazada', 'vencida');
create type app.bloque_concepto as enum ('origen', 'flete', 'destino', 'terrestre', 'aduana', 'seguro', 'otros');
create type app.unidad as enum ('contenedor', 'kg', 'm3', 'embarque');
create type app.estado_170 as enum ('pendiente', 'en_revision', 'devuelto', 'aprobado', 'rechazado');
create type app.estado_do as enum ('abierto', 'en_transito', 'en_destino', 'entregado', 'cerrado');
create type app.estado_factura as enum ('borrador', 'aprobada', 'en_cola', 'emitida', 'rechazada');
create type app.estado_suscripcion as enum ('prueba', 'activa', 'en_gracia', 'solo_lectura', 'cancelada');

-- ---------------------------------------------------------------------
-- Tenants y membresías
-- ---------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nit text not null unique,
  razon_social text not null,
  ciudad text,
  logo_path text,
  color_primario text not null default '#3b5bfd',
  prefijo_cotizacion text not null default 'COT',
  prefijo_do text not null default 'DO',
  vigencia_170_meses int not null default 12 check (vigencia_170_meses between 1 and 60),
  bloquear_do_sin_170 boolean not null default true,
  conservacion_anios int not null default 5 check (conservacion_anios >= 5),
  -- Llave de API de Megafoco cifrada con Supabase Vault (id del secreto).
  megafoco_secret_id uuid,
  creado_el timestamptz not null default now()
);

create table public.usuarios_empresa (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  roles app.rol[] not null default '{comercial}',
  nombre text not null,
  activo boolean not null default true,
  creado_el timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);
create index on public.usuarios_empresa (usuario_id);

-- ---------------------------------------------------------------------
-- Funciones de seguridad (security definer: evitan recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function app.es_miembro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_empresa
    where empresa_id = p_empresa and usuario_id = auth.uid() and activo
  );
$$;

create or replace function app.tiene_rol(p_empresa uuid, p_roles app.rol[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_empresa
    where empresa_id = p_empresa and usuario_id = auth.uid() and activo
      and (roles && p_roles or 'admin' = any (roles))
  );
$$;

-- Marca de actualización
create or replace function app.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_el := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Terceros (clientes, prospectos, proveedores) y CRM
-- ---------------------------------------------------------------------
create table public.terceros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  tipo app.tipo_tercero not null,
  nit text not null,
  razon_social text not null,
  ciudad text,
  direccion text,
  correo_facturacion text,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  unique (empresa_id, nit, tipo)
);
create index on public.terceros (empresa_id, tipo);

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  tercero_id uuid not null references public.terceros (id),
  nombre text not null,
  cargo text,
  correo text,
  telefono text,
  cumpleanos date
);
create index on public.contactos (tercero_id);

create table public.acuerdos_comerciales (
  tercero_id uuid primary key references public.terceros (id),
  empresa_id uuid not null references public.empresas (id),
  dia_corte int check (dia_corte between 1 and 31),
  plazo_pago_dias int not null default 30,
  moneda app.moneda not null default 'COP',
  condiciones text
);

-- ---------------------------------------------------------------------
-- Consecutivos por empresa (sin huecos, a prueba de concurrencia)
-- ---------------------------------------------------------------------
create table public.consecutivos (
  empresa_id uuid not null references public.empresas (id),
  tipo text not null check (tipo in ('cotizacion', 'do', 'prefactura')),
  anio int not null,
  ultimo int not null default 0,
  primary key (empresa_id, tipo, anio)
);

create or replace function app.siguiente_consecutivo(p_empresa uuid, p_tipo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_anio int := extract(year from now() at time zone 'America/Bogota');
  v_num int;
  v_prefijo text;
begin
  if not app.es_miembro(p_empresa) then
    raise exception 'sin acceso a la empresa' using errcode = '42501';
  end if;
  insert into public.consecutivos (empresa_id, tipo, anio, ultimo)
  values (p_empresa, p_tipo, v_anio, 1)
  on conflict (empresa_id, tipo, anio)
  do update set ultimo = public.consecutivos.ultimo + 1
  returning ultimo into v_num;

  select case p_tipo when 'do' then prefijo_do when 'cotizacion' then prefijo_cotizacion else 'PF' end
    into v_prefijo from public.empresas where id = p_empresa;
  return v_prefijo || '-' || v_anio || '-' || lpad(v_num::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Cotizaciones (RF-01 a RF-13)
-- ---------------------------------------------------------------------
create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  consecutivo text not null,
  version int not null default 1,
  cliente_id uuid not null references public.terceros (id),
  contacto_id uuid references public.contactos (id),
  comercial_id uuid not null references auth.users (id),
  tipo_servicio app.tipo_servicio not null,
  incoterm text not null,
  origen text not null,
  destino text not null,
  mercancia jsonb not null default '{}',
  trm numeric(12, 2) not null check (trm > 0),
  moneda_presentacion app.moneda not null default 'COP',
  fecha_emision date not null default (now() at time zone 'America/Bogota')::date,
  vigente_hasta date not null,
  estado app.estado_cotizacion not null default 'borrador',
  terminos text not null default '',
  origen_id uuid references public.cotizaciones (id),
  -- Token del enlace público: se guarda solo el hash (RNF enlaces públicos).
  token_hash text unique,
  token_vence_el timestamptz,
  vista_el timestamptz,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  unique (empresa_id, consecutivo, version)
);
create index on public.cotizaciones (empresa_id, estado);
create index on public.cotizaciones (cliente_id);
create trigger tocar before update on public.cotizaciones
  for each row execute function app.tocar_actualizado();

create table public.cotizacion_conceptos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  orden int not null default 0,
  bloque app.bloque_concepto not null,
  descripcion text not null,
  proveedor_id uuid references public.terceros (id),
  moneda app.moneda not null,
  unidad app.unidad not null,
  cantidad numeric(14, 3) not null check (cantidad > 0),
  costo_unitario numeric(16, 2) not null check (costo_unitario >= 0),
  venta_unitaria numeric(16, 2) not null check (venta_unitaria >= 0),
  vigencia_tarifa date,
  para_terceros boolean not null default false
);
create index on public.cotizacion_conceptos (cotizacion_id);

-- Evidencia de aceptación o rechazo (RF-12, RF-13). Solo inserción.
create table public.aceptaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  cotizacion_id uuid not null references public.cotizaciones (id),
  decision text not null check (decision in ('aceptada', 'rechazada')),
  canal text not null check (canal in ('enlace', 'manual')),
  nombre text not null,
  cargo text,
  correo text not null,
  motivo text,
  ip inet,
  user_agent text,
  evidencia_path text,
  hash_documento text,
  creado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Circular 170 (RF-14 a RF-22)
-- ---------------------------------------------------------------------
create table public.formularios_170 (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  tercero_id uuid not null references public.terceros (id),
  version int not null,
  estado app.estado_170 not null default 'pendiente',
  datos jsonb not null default '{}',
  diligenciado_el timestamptz,
  firma jsonb, -- nombre, correo verificado, ip, hash del documento
  revisor_id uuid references auth.users (id),
  observaciones text,
  aprobado_el date,
  vigente_hasta date,
  pdf_path text,
  creado_el timestamptz not null default now(),
  unique (tercero_id, version)
);
create index on public.formularios_170 (empresa_id, estado);

create table public.formulario_170_soportes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  formulario_id uuid not null references public.formularios_170 (id),
  tipo text not null, -- rut, camara_comercio, cedula_rl, cert_bancaria, estados_financieros...
  storage_path text not null,
  creado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Operaciones / DO (RF-23 a RF-29)
-- ---------------------------------------------------------------------
create table public.operaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  consecutivo text not null,
  cotizacion_id uuid not null references public.cotizaciones (id),
  cliente_id uuid not null references public.terceros (id),
  responsable_id uuid references auth.users (id),
  tipo app.tipo_servicio not null,
  origen text not null,
  destino text not null,
  estado app.estado_do not null default 'abierto',
  trm numeric(12, 2) not null,
  buzon text unique, -- do-0001@empresa.logiks.co (RF-39)
  abierto_el date not null default (now() at time zone 'America/Bogota')::date,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  unique (empresa_id, consecutivo)
);
create index on public.operaciones (empresa_id, estado);
create trigger tocar before update on public.operaciones
  for each row execute function app.tocar_actualizado();

create table public.do_conceptos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  operacion_id uuid not null references public.operaciones (id),
  concepto_cotizado_id uuid references public.cotizacion_conceptos (id),
  bloque app.bloque_concepto not null,
  descripcion text not null,
  proveedor_id uuid references public.terceros (id),
  moneda app.moneda not null,
  cantidad numeric(14, 3) not null,
  costo_cotizado numeric(16, 2) not null,
  venta numeric(16, 2) not null,
  costo_real numeric(16, 2),
  vigencia_tarifa date,
  para_terceros boolean not null default false
);
create index on public.do_conceptos (operacion_id);

create table public.do_hitos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  operacion_id uuid not null references public.operaciones (id),
  orden int not null,
  nombre text not null,
  estimada date,
  real date,
  nota text
);
create index on public.do_hitos (operacion_id);

create table public.do_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  operacion_id uuid not null references public.operaciones (id),
  tipo text not null, -- bl, awb, factura_comercial, lista_empaque, declaracion, certificado
  nombre text not null,
  storage_path text not null,
  visible_cliente boolean not null default true,
  subido_por uuid references auth.users (id),
  creado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Comunicaciones (RF-38 a RF-40) · línea de tiempo inmutable
-- ---------------------------------------------------------------------
create table public.comunicaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  cotizacion_id uuid references public.cotizaciones (id),
  operacion_id uuid references public.operaciones (id),
  tercero_id uuid references public.terceros (id),
  direccion text not null check (direccion in ('saliente', 'entrante')),
  de text not null,
  para text[] not null,
  cc text[] not null default '{}',
  asunto text not null,
  cuerpo_html text,
  adjuntos jsonb not null default '[]',
  proveedor_id_mensaje text, -- id de Resend
  entregado_el timestamptz,
  abierto_el timestamptz,
  creado_el timestamptz not null default now()
);
create index on public.comunicaciones (empresa_id, operacion_id);
create index on public.comunicaciones (empresa_id, cotizacion_id);

-- ---------------------------------------------------------------------
-- Alertas persistidas (las calcula un job; la UI también las deriva)
-- ---------------------------------------------------------------------
create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  clave text not null, -- idempotencia: tipo + entidad
  tipo text not null,
  severidad text not null check (severidad in ('alta', 'media', 'baja')),
  titulo text not null,
  detalle text,
  entidad text not null,
  entidad_id uuid not null,
  responsable_id uuid references auth.users (id),
  estado text not null default 'abierta' check (estado in ('abierta', 'atendida', 'descartada')),
  creado_el timestamptz not null default now(),
  unique (empresa_id, clave)
);

-- ---------------------------------------------------------------------
-- Facturación vía Megafoco (RF-45 a RF-52)
-- ---------------------------------------------------------------------
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  cliente_id uuid not null references public.terceros (id),
  tipo text not null default 'factura' check (tipo in ('factura', 'nota_credito', 'nota_debito')),
  factura_ref_id uuid references public.facturas (id),
  estado app.estado_factura not null default 'borrador',
  moneda app.moneda not null,
  trm numeric(12, 2),
  conceptos jsonb not null, -- [{descripcion, propio|terceros, cantidad, valor, impuestos}]
  operaciones uuid[] not null default '{}',
  idempotency_key uuid not null default gen_random_uuid() unique,
  megafoco_id text,
  numero text,
  cufe text,
  pdf_url text,
  xml_url text,
  error text,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now()
);
create trigger tocar before update on public.facturas
  for each row execute function app.tocar_actualizado();

-- ---------------------------------------------------------------------
-- Catálogos (globales con empresa_id nulo, o propios de la empresa)
-- ---------------------------------------------------------------------
create table public.catalogos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas (id),
  tipo text not null, -- concepto, puerto, aeropuerto, ciudad, contenedor, hito
  codigo text,
  nombre text not null,
  datos jsonb not null default '{}',
  activo boolean not null default true
);
create index on public.catalogos (tipo, empresa_id);

-- ---------------------------------------------------------------------
-- Suscripciones SaaS
-- ---------------------------------------------------------------------
create table public.suscripciones (
  empresa_id uuid primary key references public.empresas (id),
  plan text not null default 'prueba' check (plan in ('prueba', 'basico', 'profesional', 'empresarial')),
  estado app.estado_suscripcion not null default 'prueba',
  prueba_hasta date not null default ((now() at time zone 'America/Bogota')::date + 14),
  max_usuarios int,
  max_do_mes int,
  actualizado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Auditoría inmutable (RNF Auditoría)
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid,
  tabla text not null,
  registro_id text,
  accion text not null,
  usuario_id uuid default auth.uid(),
  antes jsonb,
  despues jsonb,
  creado_el timestamptz not null default now()
);
create index on public.auditoria (empresa_id, tabla, registro_id);

create or replace function app.auditar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.auditoria (empresa_id, tabla, registro_id, accion, antes, despues)
  values (
    (v_row ->> 'empresa_id')::uuid,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'tercero_id'),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function app.prohibir_cambios()
returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % es inmutable: no se permite %', tg_table_name, tg_op
    using errcode = '42501';
end $$;

-- Tablas de evidencia: ni UPDATE ni DELETE, para nadie (RF-20, RF-40).
create trigger inmutable before update or delete on public.auditoria
  for each row execute function app.prohibir_cambios();
create trigger inmutable before update or delete on public.aceptaciones
  for each row execute function app.prohibir_cambios();
create trigger inmutable before update or delete on public.comunicaciones
  for each row execute function app.prohibir_cambios();

-- Los formularios 170 nunca se borran; una corrección es una versión nueva.
create trigger sin_borrado before delete on public.formularios_170
  for each row execute function app.prohibir_cambios();
create trigger sin_borrado before delete on public.operaciones
  for each row execute function app.prohibir_cambios();

do $$
declare t text;
begin
  foreach t in array array[
    'empresas', 'usuarios_empresa', 'terceros', 'acuerdos_comerciales', 'cotizaciones',
    'cotizacion_conceptos', 'formularios_170', 'operaciones', 'do_conceptos', 'do_hitos',
    'do_documentos', 'facturas', 'suscripciones'
  ] loop
    execute format(
      'create trigger auditar after insert or update or delete on public.%I
         for each row execute function app.auditar()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.empresas enable row level security;
alter table public.usuarios_empresa enable row level security;
alter table public.suscripciones enable row level security;
alter table public.auditoria enable row level security;
alter table public.catalogos enable row level security;
alter table public.consecutivos enable row level security;

create policy "miembros ven su empresa" on public.empresas
  for select using (app.es_miembro(id));
create policy "admin edita su empresa" on public.empresas
  for update using (app.tiene_rol(id, '{admin}')) with check (app.tiene_rol(id, '{admin}'));

create policy "ver mis membresías y las de mi empresa" on public.usuarios_empresa
  for select using (usuario_id = auth.uid() or app.es_miembro(empresa_id));
create policy "admin gestiona usuarios" on public.usuarios_empresa
  for all using (app.tiene_rol(empresa_id, '{admin}')) with check (app.tiene_rol(empresa_id, '{admin}'));

create policy "ver suscripción" on public.suscripciones
  for select using (app.es_miembro(empresa_id));

create policy "admin ve auditoría" on public.auditoria
  for select using (app.tiene_rol(empresa_id, '{admin,cumplimiento}'));

create policy "catálogos globales y propios" on public.catalogos
  for select using (empresa_id is null or app.es_miembro(empresa_id));
create policy "admin edita catálogos" on public.catalogos
  for all using (app.tiene_rol(empresa_id, '{admin}')) with check (app.tiene_rol(empresa_id, '{admin}'));

-- Política estándar: lectura para miembros; escritura según roles.
create or replace function app.politicas_tenant(p_tabla text, p_roles_escritura app.rol[])
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format(
    'create policy "tenant: leer" on public.%I for select using (app.es_miembro(empresa_id))', p_tabla);
  execute format(
    'create policy "tenant: crear" on public.%I for insert with check (app.tiene_rol(empresa_id, %L))',
    p_tabla, p_roles_escritura);
  execute format(
    'create policy "tenant: editar" on public.%I for update using (app.tiene_rol(empresa_id, %L)) with check (app.tiene_rol(empresa_id, %L))',
    p_tabla, p_roles_escritura, p_roles_escritura);
end $$;

select app.politicas_tenant('terceros', '{comercial,operaciones,cumplimiento}');
select app.politicas_tenant('contactos', '{comercial,operaciones}');
select app.politicas_tenant('acuerdos_comerciales', '{comercial,contabilidad}');
select app.politicas_tenant('cotizaciones', '{comercial}');
select app.politicas_tenant('cotizacion_conceptos', '{comercial}');
select app.politicas_tenant('aceptaciones', '{comercial}');
select app.politicas_tenant('formularios_170', '{cumplimiento,comercial}');
select app.politicas_tenant('operaciones', '{operaciones}');
select app.politicas_tenant('do_conceptos', '{operaciones,contabilidad}');
select app.politicas_tenant('do_hitos', '{operaciones}');
select app.politicas_tenant('do_documentos', '{operaciones}');
select app.politicas_tenant('comunicaciones', '{comercial,operaciones,cumplimiento,contabilidad}');
select app.politicas_tenant('alertas', '{comercial,operaciones,cumplimiento,contabilidad}');
select app.politicas_tenant('facturas', '{contabilidad}');

-- Conceptos de cotización: se borran al editar un borrador.
create policy "tenant: borrar" on public.cotizacion_conceptos
  for delete using (app.tiene_rol(empresa_id, '{comercial}'));

-- Soportes de la 170: confidenciales, solo Cumplimiento y Administrador (RNF Documentos).
alter table public.formulario_170_soportes enable row level security;
create policy "cumplimiento ve soportes" on public.formulario_170_soportes
  for select using (app.tiene_rol(empresa_id, '{cumplimiento}'));
create policy "cumplimiento carga soportes" on public.formulario_170_soportes
  for insert with check (app.tiene_rol(empresa_id, '{cumplimiento}'));

-- Revisión de la 170 solo por Cumplimiento: el comercial puede crearla
-- pero no aprobarla.
create or replace function app.validar_revision_170()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado
     and new.estado in ('aprobado', 'rechazado', 'devuelto')
     and auth.uid() is not null
     and not app.tiene_rol(new.empresa_id, '{cumplimiento}') then
    raise exception 'Solo Cumplimiento puede revisar formularios 170' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger validar_revision before update on public.formularios_170
  for each row execute function app.validar_revision_170();

-- ---------------------------------------------------------------------
-- Registro de empresa (onboarding RF: < 30 minutos)
-- ---------------------------------------------------------------------
create or replace function public.registrar_empresa(p_nit text, p_razon_social text, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticación requerida' using errcode = '42501';
  end if;
  insert into public.empresas (nit, razon_social) values (p_nit, p_razon_social) returning id into v_id;
  insert into public.usuarios_empresa (empresa_id, usuario_id, roles, nombre)
    values (v_id, auth.uid(), '{admin}', p_nombre);
  insert into public.suscripciones (empresa_id, max_usuarios, max_do_mes) values (v_id, 3, 10);
  return v_id;
end $$;

revoke all on function public.registrar_empresa(text, text, text) from public, anon;
grant execute on function public.registrar_empresa(text, text, text) to authenticated;
revoke all on function app.siguiente_consecutivo(uuid, text) from public, anon;
grant usage on schema app to authenticated;
grant execute on function app.siguiente_consecutivo(uuid, text) to authenticated;
grant execute on function app.es_miembro(uuid), app.tiene_rol(uuid, app.rol[]) to authenticated;
