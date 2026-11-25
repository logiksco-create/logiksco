-- CRM (RF-41): el comercial puede eliminar contactos de sus clientes.
create policy "tenant: borrar" on public.contactos
  for delete using (app.tiene_rol(empresa_id, '{comercial}'));

-- Buzón por DO (RF-39): do-<12 hex del id>, único. Se asigna al crear el DO.
create or replace function app.asignar_buzon()
returns trigger language plpgsql as $$
begin
  if new.buzon is null then
    new.buzon := 'do-' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  return new;
end $$;
create trigger asignar_buzon before insert on public.operaciones
  for each row execute function app.asignar_buzon();
update public.operaciones set buzon = 'do-' || substr(replace(id::text, '-', ''), 1, 12) where buzon is null;

-- Alertas persistidas por la tarea diaria (RF-31): enlace a la pantalla y
-- entidad opcional (algunas alertas son del cliente, no de un registro).
alter table public.alertas alter column entidad drop not null;
alter table public.alertas alter column entidad_id drop not null;
alter table public.alertas add column if not exists href text;
alter table public.alertas add column if not exists actualizado_el timestamptz not null default now();
