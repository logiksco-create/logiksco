-- =====================================================================
-- Portal del cliente (RF-35, RF-36)
-- Los usuarios del cliente NO son miembros de la empresa: las políticas
-- tenant no les dan acceso a ninguna tabla. El portal lee en el servidor,
-- con la llave de servicio, filtrando por (empresa, cliente) y sin costos.
-- =====================================================================
create table public.usuarios_cliente (
  empresa_id uuid not null references public.empresas (id),
  tercero_id uuid not null references public.terceros (id),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null,
  correo text not null,
  activo boolean not null default true,
  invitado_por uuid references auth.users (id),
  creado_el timestamptz not null default now(),
  primary key (empresa_id, tercero_id, usuario_id)
);
create index on public.usuarios_cliente (usuario_id);

alter table public.usuarios_cliente enable row level security;
create policy "cliente ve su acceso" on public.usuarios_cliente
  for select using (usuario_id = auth.uid() or app.es_miembro(empresa_id));
create policy "comercial gestiona accesos" on public.usuarios_cliente
  for insert with check (app.tiene_rol(empresa_id, '{comercial}'));
create policy "comercial edita accesos" on public.usuarios_cliente
  for update using (app.tiene_rol(empresa_id, '{comercial}')) with check (app.tiene_rol(empresa_id, '{comercial}'));

grant select, insert, update on public.usuarios_cliente to authenticated;
grant all on public.usuarios_cliente to service_role;

create trigger auditar after insert or update or delete on public.usuarios_cliente
  for each row execute function app.auditar();
