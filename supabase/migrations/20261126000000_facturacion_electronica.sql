-- =====================================================================
-- Facturación electrónica con Finppi (bot) — USD con TRM de referencia
--  - Datos fiscales del cliente y condiciones de facturación desde la
--    cotización; producto de Finppi e IVA por concepto.
--  - Cuenta de Finppi por empresa: credenciales en Supabase Vault, solo
--    el worker (service_role) las lee. Consentimiento con versión.
--  - Cola de trabajos del bot: un trabajo corriendo por empresa y una
--    emisión activa por factura (índices únicos). Reclamo con SKIP LOCKED.
--  - Libro de consecutivos (cero saltos) y estado global del worker.
--  - Los campos que certifican la emisión (número, CUFE, archivos) solo los
--    escribe el servidor/worker: un usuario no puede «emitir» por PostgREST.
-- =====================================================================

-- ---------- Datos para Finppi en clientes, cotizaciones y conceptos ----------
alter table public.terceros add column if not exists fiscal jsonb not null default '{}';
alter table public.cotizaciones add column if not exists facturacion jsonb;

alter table public.cotizacion_conceptos
  add column if not exists producto_finppi text,
  add column if not exists iva_finppi text check (iva_finppi in ('Ninguno', 'IVA-0', 'IVA-5', 'IVA-19'));
alter table public.do_conceptos
  add column if not exists producto_finppi text,
  add column if not exists iva_finppi text check (iva_finppi in ('Ninguno', 'IVA-0', 'IVA-5', 'IVA-19'));

-- El catálogo de productos y servicios de Finppi usa catalogos con
-- tipo = 'producto_finppi' (código exacto como aparece en Finppi).

-- ---------- Estados y campos de la factura electrónica ----------
alter type app.estado_factura add value if not exists 'enviando';
alter type app.estado_factura add value if not exists 'fallida';
alter type app.estado_factura add value if not exists 'estado_desconocido';
alter type app.estado_factura add value if not exists 'revision';

alter table public.facturas
  add column if not exists trm_referencia numeric(12, 2) check (trm_referencia > 0),
  add column if not exists tipo_pago text check (tipo_pago in ('Contado', 'Crédito')),
  add column if not exists metodo_pago text,
  add column if not exists tipo_operacion text,
  add column if not exists vencimiento date,
  add column if not exists referencia text,
  add column if not exists numero_esperado text,
  add column if not exists fecha_validacion timestamptz,
  add column if not exists total_cop numeric(18, 2),
  add column if not exists pdf_finppi_path text,
  add column if not exists pdf_finppi_sha256 text,
  add column if not exists xml_path text,
  add column if not exists error_codigo text,
  add column if not exists enviar_al_emitir boolean not null default true,
  add column if not exists enviada_cliente_el timestamptz,
  add column if not exists simulada boolean not null default false;

create unique index if not exists facturas_referencia_unica on public.facturas (empresa_id, referencia) where referencia is not null;
create unique index if not exists facturas_cufe_unico on public.facturas (cufe) where cufe is not null;
create unique index if not exists facturas_numero_unico on public.facturas (empresa_id, numero) where numero is not null;

-- Lo que certifica la emisión solo lo escribe el servidor (service_role) o
-- una función del sistema. Desde el navegador no se puede marcar emitida.
create or replace function app.proteger_factura_electronica()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.numero is distinct from old.numero
     or new.cufe is distinct from old.cufe
     or new.fecha_validacion is distinct from old.fecha_validacion
     or new.pdf_finppi_path is distinct from old.pdf_finppi_path
     or new.pdf_finppi_sha256 is distinct from old.pdf_finppi_sha256
     or new.xml_path is distinct from old.xml_path
     or new.numero_esperado is distinct from old.numero_esperado
     or new.referencia is distinct from old.referencia
     or new.simulada is distinct from old.simulada
     or new.enviada_cliente_el is distinct from old.enviada_cliente_el
     or (new.estado is distinct from old.estado
         and new.estado::text not in ('borrador', 'aprobada', 'en_cola', 'rechazada'))
     or (old.estado::text in ('en_cola', 'enviando', 'emitida', 'estado_desconocido', 'revision')
         and old.referencia is not null
         and (new.conceptos is distinct from old.conceptos
              or new.trm_referencia is distinct from old.trm_referencia
              or new.cliente_id is distinct from old.cliente_id
              or new.estado is distinct from old.estado))
  then
    raise exception 'Estos datos de la factura electrónica solo los registra el sistema' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists proteger_fe on public.facturas;
create trigger proteger_fe before update on public.facturas
  for each row execute function app.proteger_factura_electronica();

-- ---------- Cuenta de Finppi ----------
create table if not exists public.fe_cuentas (
  empresa_id uuid primary key references public.empresas (id),
  proveedor text not null default 'finppi',
  -- Solo una pista del usuario (lu***@dominio.com); el valor vive en Vault.
  usuario_pista text,
  tiene_credenciales boolean not null default false,
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'activa', 'credenciales_invalidas', 'bloqueada', 'empresa_distinta', 'desconectada')),
  consentimiento_el timestamptz,
  consentimiento_por uuid references auth.users (id),
  consentimiento_version text,
  ultimo_login_ok timestamptz,
  -- Lectura del healthcheck: razón social, NIT, próxima factura, opciones.
  instantanea jsonb not null default '{}',
  -- Texto de la resolución DIAN para el PDF de LOGIKS (opcional).
  resolucion text,
  actualizado_el timestamptz not null default now()
);
alter table public.fe_cuentas enable row level security;
create policy "tenant: leer" on public.fe_cuentas for select using (app.es_miembro(empresa_id));
revoke insert, update, delete on public.fe_cuentas from authenticated;
grant all on public.fe_cuentas to service_role;

-- El id del secreto de Vault vive fuera del esquema expuesto por la API.
create table if not exists app.fe_secretos (
  empresa_id uuid primary key references public.empresas (id),
  secreto_id uuid not null
);
revoke all on app.fe_secretos from public, anon, authenticated;

create trigger auditar after insert or update or delete on public.fe_cuentas
  for each row execute function app.auditar();

-- ---------- Cola de trabajos del bot ----------
create table if not exists public.fe_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  factura_id uuid references public.facturas (id),
  tipo text not null check (tipo in ('emitir', 'healthcheck', 'reconciliar')),
  estado text not null default 'en_cola' check (estado in (
    'en_cola', 'corriendo', 'ok', 'fallido', 'desconocido', 'revision', 'cancelado')),
  prioridad int not null default 5,
  dry_run boolean not null default false,
  -- Valores aprobados (snapshot): el bot transcribe exactamente esto.
  payload jsonb not null default '{}',
  resultado jsonb not null default '{}',
  punto_no_retorno boolean not null default false,
  intentos int not null default 0,
  error_codigo text,
  error text,
  worker text,
  adapter_version text,
  disponible_el timestamptz not null default now(),
  creado_por uuid references auth.users (id),
  creado_el timestamptz not null default now(),
  tomado_el timestamptz,
  terminado_el timestamptz
);
create index if not exists fe_jobs_cola on public.fe_jobs (estado, prioridad, creado_el);
create index if not exists fe_jobs_factura on public.fe_jobs (factura_id);
create unique index if not exists fe_jobs_uno_corriendo on public.fe_jobs (empresa_id) where estado = 'corriendo';
create unique index if not exists fe_jobs_una_emision on public.fe_jobs (factura_id)
  where tipo in ('emitir', 'reconciliar') and estado in ('en_cola', 'corriendo') and not dry_run;
alter table public.fe_jobs enable row level security;
create policy "tenant: leer" on public.fe_jobs for select using (app.es_miembro(empresa_id));
revoke insert, update, delete on public.fe_jobs from authenticated;
grant all on public.fe_jobs to service_role;

create table if not exists public.fe_job_logs (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.fe_jobs (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  paso text not null,
  nivel text not null default 'info' check (nivel in ('info', 'aviso', 'error')),
  mensaje text not null,
  creado_el timestamptz not null default now()
);
create index if not exists fe_job_logs_job on public.fe_job_logs (job_id, id);
alter table public.fe_job_logs enable row level security;
create policy "tenant: leer" on public.fe_job_logs for select using (app.es_miembro(empresa_id));
revoke insert, update, delete on public.fe_job_logs from authenticated;
grant all on public.fe_job_logs to service_role;

-- ---------- Libro de consecutivos (§5A) ----------
create table if not exists public.fe_consecutivos (
  empresa_id uuid not null references public.empresas (id),
  numero text not null,
  prefijo text not null,
  seq int not null,
  estado text not null check (estado in ('emitido', 'en_vuelo', 'desconocido', 'externo', 'salto')),
  factura_id uuid references public.facturas (id),
  origen text not null default 'logiks' check (origen in ('logiks', 'externo')),
  cufe text,
  visto_el timestamptz not null default now(),
  primary key (empresa_id, numero)
);
alter table public.fe_consecutivos enable row level security;
create policy "tenant: leer" on public.fe_consecutivos for select using (app.es_miembro(empresa_id));
revoke insert, update, delete on public.fe_consecutivos from authenticated;
grant all on public.fe_consecutivos to service_role;

-- ---------- Estado global del worker ----------
create table if not exists public.fe_sistema (
  id int primary key default 1 check (id = 1),
  pausado boolean not null default false,
  motivo text,
  latido_el timestamptz,
  adapter_version text,
  worker text
);
insert into public.fe_sistema (id) values (1) on conflict do nothing;
alter table public.fe_sistema enable row level security;
create policy "todos: leer" on public.fe_sistema for select to authenticated using (true);
revoke insert, update, delete on public.fe_sistema from authenticated;
grant all on public.fe_sistema to service_role;

-- =====================================================================
-- Funciones
-- =====================================================================

-- Guarda credenciales (Administrador), registra el consentimiento y
-- encola de inmediato un healthcheck de prioridad máxima (§9D).
create or replace function public.fe_guardar_credenciales(
  p_empresa uuid, p_usuario text, p_clave text, p_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_secreto text;
  v_pista text;
  v_job uuid;
begin
  if not app.tiene_rol(p_empresa, '{admin}') then
    raise exception 'Solo el Administrador puede conectar Finppi' using errcode = '42501';
  end if;
  if coalesce(p_usuario, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(coalesce(p_clave, '')) < 4 then
    raise exception 'Escribe el correo y la contraseña de Finppi' using errcode = 'P0001';
  end if;
  if coalesce(p_version, '') = '' then
    raise exception 'Debes aceptar la autorización' using errcode = 'P0001';
  end if;
  v_secreto := jsonb_build_object('usuario', p_usuario, 'clave', p_clave)::text;
  v_pista := left(p_usuario, 2) || '***' || substr(p_usuario, position('@' in p_usuario));

  select secreto_id into v_id from app.fe_secretos where empresa_id = p_empresa for update;
  if v_id is null then
    v_id := vault.create_secret(v_secreto, 'finppi_' || p_empresa::text || '_' || extract(epoch from now())::bigint,
      'Credenciales de Finppi');
    insert into app.fe_secretos (empresa_id, secreto_id) values (p_empresa, v_id);
  else
    perform vault.update_secret(v_id, v_secreto);
  end if;

  insert into public.fe_cuentas as c (empresa_id, usuario_pista, tiene_credenciales, estado,
    consentimiento_el, consentimiento_por, consentimiento_version, actualizado_el)
  values (p_empresa, v_pista, true, 'pendiente', now(), auth.uid(), p_version, now())
  on conflict (empresa_id) do update set
    usuario_pista = excluded.usuario_pista, tiene_credenciales = true, estado = 'pendiente',
    consentimiento_el = now(), consentimiento_por = auth.uid(), consentimiento_version = p_version,
    actualizado_el = now();

  -- Los trabajos en pausa por credenciales vuelven a la cola.
  update public.fe_jobs set estado = 'cancelado', terminado_el = now(), error = 'Reemplazado por un nuevo healthcheck'
    where empresa_id = p_empresa and tipo = 'healthcheck' and estado = 'en_cola';
  insert into public.fe_jobs (empresa_id, tipo, prioridad, creado_por)
    values (p_empresa, 'healthcheck', 0, auth.uid()) returning id into v_job;
  return v_job;
end $$;
revoke all on function public.fe_guardar_credenciales(uuid, text, text, text) from public, anon;
grant execute on function public.fe_guardar_credenciales(uuid, text, text, text) to authenticated;

-- Borra las credenciales y cancela lo pendiente (Administrador).
create or replace function public.fe_desconectar(p_empresa uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.tiene_rol(p_empresa, '{admin}') then
    raise exception 'Solo el Administrador puede desconectar Finppi' using errcode = '42501';
  end if;
  select secreto_id into v_id from app.fe_secretos where empresa_id = p_empresa for update;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
    delete from app.fe_secretos where empresa_id = p_empresa;
  end if;
  update public.fe_cuentas set tiene_credenciales = false, usuario_pista = null, estado = 'desconectada',
    actualizado_el = now() where empresa_id = p_empresa;
  update public.fe_jobs set estado = 'cancelado', terminado_el = now(), error = 'Cuenta de Finppi desconectada'
    where empresa_id = p_empresa and estado = 'en_cola';
end $$;
revoke all on function public.fe_desconectar(uuid) from public, anon;
grant execute on function public.fe_desconectar(uuid) to authenticated;

-- Probar conexión de nuevo (Administrador o Contabilidad).
create or replace function public.fe_probar_conexion(p_empresa uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_job uuid;
begin
  if not app.tiene_rol(p_empresa, '{admin,contabilidad}') then
    raise exception 'No tienes permiso para probar la conexión' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fe_cuentas where empresa_id = p_empresa and tiene_credenciales) then
    raise exception 'Primero guarda las credenciales de Finppi' using errcode = 'P0001';
  end if;
  select id into v_job from public.fe_jobs
    where empresa_id = p_empresa and tipo = 'healthcheck' and estado in ('en_cola', 'corriendo') limit 1;
  if v_job is null then
    insert into public.fe_jobs (empresa_id, tipo, prioridad, creado_por)
      values (p_empresa, 'healthcheck', 0, auth.uid()) returning id into v_job;
  end if;
  return v_job;
end $$;
revoke all on function public.fe_probar_conexion(uuid) from public, anon;
grant execute on function public.fe_probar_conexion(uuid) to authenticated;

create or replace function public.fe_guardar_resolucion(p_empresa uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.tiene_rol(p_empresa, '{admin,contabilidad}') then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  insert into public.fe_cuentas (empresa_id, resolucion) values (p_empresa, left(p_texto, 600))
  on conflict (empresa_id) do update set resolucion = excluded.resolucion, actualizado_el = now();
end $$;
revoke all on function public.fe_guardar_resolucion(uuid, text) from public, anon;
grant execute on function public.fe_guardar_resolucion(uuid, text) to authenticated;

-- Confirmación del usuario («un clic»): congela los valores aprobados y
-- encola la emisión (o la prueba sin emitir). Contabilidad o Administrador.
create or replace function public.fe_encolar_emision(
  p_factura uuid, p_payload jsonb, p_dry_run boolean, p_referencia text, p_total_cop numeric,
  p_enviar_al_emitir boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  f public.facturas;
  v_job uuid;
begin
  select * into f from public.facturas where id = p_factura for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0002';
  end if;
  if not app.tiene_rol(f.empresa_id, '{contabilidad}') then
    raise exception 'Solo Contabilidad emite facturas' using errcode = '42501';
  end if;
  if f.estado::text not in ('borrador', 'aprobada', 'fallida', 'rechazada') then
    raise exception 'Esta factura ya está en proceso o emitida' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.fe_cuentas where empresa_id = f.empresa_id and estado = 'activa'
                 and consentimiento_el is not null) then
    raise exception 'Conecta y verifica tu cuenta de Finppi en Configuración antes de emitir' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fe_jobs where factura_id = p_factura and estado in ('en_cola', 'corriendo')) then
    raise exception 'Ya hay un trabajo en curso para esta factura' using errcode = 'P0001';
  end if;
  if (select pausado from public.fe_sistema where id = 1) and not p_dry_run then
    raise exception 'La emisión automática está en pausa por seguridad. Intenta más tarde.' using errcode = 'P0001';
  end if;

  insert into public.fe_jobs (empresa_id, factura_id, tipo, dry_run, payload, prioridad, creado_por)
    values (f.empresa_id, p_factura, 'emitir', p_dry_run, p_payload, case when p_dry_run then 3 else 5 end, auth.uid())
    returning id into v_job;

  if not p_dry_run then
    update public.facturas set estado = 'en_cola', referencia = coalesce(referencia, p_referencia),
      total_cop = p_total_cop, enviar_al_emitir = p_enviar_al_emitir, error = null, error_codigo = null,
      enviada_el = now()
    where id = p_factura;
  end if;
  return v_job;
end $$;
revoke all on function public.fe_encolar_emision(uuid, jsonb, boolean, text, numeric, boolean) from public, anon;
grant execute on function public.fe_encolar_emision(uuid, jsonb, boolean, text, numeric, boolean) to authenticated;

-- ---------- Solo el worker (service_role) ----------
create or replace function public.fe_credenciales(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret::jsonb from vault.decrypted_secrets s
  join app.fe_secretos c on c.secreto_id = s.id
  where c.empresa_id = p_empresa;
$$;
revoke all on function public.fe_credenciales(uuid) from public, anon, authenticated;
grant execute on function public.fe_credenciales(uuid) to service_role;

-- Toma el siguiente trabajo: respeta la pausa global y un trabajo por empresa.
create or replace function public.fe_reclamar_job(p_worker text)
returns setof public.fe_jobs language plpgsql security definer set search_path = '' as $$
begin
  if (select pausado from public.fe_sistema where id = 1) then
    return;
  end if;
  return query
  update public.fe_jobs j set estado = 'corriendo', tomado_el = now(), worker = p_worker, intentos = j.intentos + 1
  where j.id = (
    select c.id from public.fe_jobs c
    where c.estado = 'en_cola' and c.disponible_el <= now()
      and not exists (select 1 from public.fe_jobs r where r.empresa_id = c.empresa_id and r.estado = 'corriendo')
      and (c.tipo = 'healthcheck' or exists (
        select 1 from public.fe_cuentas a where a.empresa_id = c.empresa_id and a.estado = 'activa'))
    order by c.prioridad, c.creado_el
    for update skip locked
    limit 1
  )
  returning j.*;
end $$;
revoke all on function public.fe_reclamar_job(text) from public, anon, authenticated;
grant execute on function public.fe_reclamar_job(text) to service_role;

create or replace function public.fe_latido(p_worker text, p_version text)
returns boolean language sql security definer set search_path = '' as $$
  update public.fe_sistema set latido_el = now(), worker = p_worker, adapter_version = p_version
  where id = 1 returning not pausado;
$$;
revoke all on function public.fe_latido(text, text) from public, anon, authenticated;
grant execute on function public.fe_latido(text, text) to service_role;

-- =====================================================================
-- Cotización y DO llevan las condiciones y el producto de Finppi
-- =====================================================================
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
      terminos, origen_id, facturacion
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
      p_origen_id,
      p_datos -> 'facturacion'
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
      facturacion = p_datos -> 'facturacion',
      -- RF-06: editar una cotización ya enviada genera una versión nueva.
      version = case when v_estado = 'borrador' then version else version + 1 end,
      estado = 'borrador'
    where id = v_id;
    delete from public.cotizacion_conceptos where cotizacion_id = v_id;
  end if;

  insert into public.cotizacion_conceptos (
    empresa_id, cotizacion_id, orden, bloque, descripcion, proveedor_id, moneda, unidad,
    cantidad, costo_unitario, venta_unitaria, vigencia_tarifa, para_terceros,
    producto_finppi, iva_finppi
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
    coalesce((c.v ->> 'para_terceros')::boolean, false),
    nullif(c.v ->> 'producto_finppi', ''),
    nullif(c.v ->> 'iva_finppi', '')
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
    moneda, cantidad, costo_cotizado, venta, vigencia_tarifa, para_terceros,
    producto_finppi, iva_finppi
  )
  select q.empresa_id, v_id, c.id, c.bloque, c.descripcion, c.proveedor_id, c.moneda,
    c.cantidad, c.costo_unitario, c.venta_unitaria, c.vigencia_tarifa, c.para_terceros,
    c.producto_finppi, c.iva_finppi
  from public.cotizacion_conceptos c where c.cotizacion_id = q.id order by c.orden;

  insert into public.do_hitos (empresa_id, operacion_id, orden, nombre)
  select q.empresa_id, v_id, (h.ord - 1)::int, h.nombre
  from unnest(p_hitos) with ordinality as h(nombre, ord);

  return v_id;
end $$;

