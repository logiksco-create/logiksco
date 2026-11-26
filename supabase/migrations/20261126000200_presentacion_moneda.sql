-- Monedas que ve el cliente en el PDF de LOGIKS de una factura en USD:
-- 'usd' (solo dólares), 'ambas' (dólares y pesos) o 'cop' (solo pesos).
-- Por defecto de la empresa en fe_cuentas; cada factura puede cambiarlo.
-- No afecta lo que va a la DIAN (siempre en pesos).
alter table public.fe_cuentas add column if not exists presentacion text not null default 'usd'
  check (presentacion in ('usd', 'ambas', 'cop'));
alter table public.facturas add column if not exists presentacion text
  check (presentacion in ('usd', 'ambas', 'cop'));

create or replace function public.fe_guardar_presentacion(p_empresa uuid, p_presentacion text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.tiene_rol(p_empresa, '{admin,contabilidad}') then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  if p_presentacion not in ('usd', 'ambas', 'cop') then
    raise exception 'Presentación no válida' using errcode = 'P0001';
  end if;
  insert into public.fe_cuentas (empresa_id, presentacion) values (p_empresa, p_presentacion)
  on conflict (empresa_id) do update set presentacion = excluded.presentacion, actualizado_el = now();
end $$;
revoke all on function public.fe_guardar_presentacion(uuid, text) from public, anon;
grant execute on function public.fe_guardar_presentacion(uuid, text) to authenticated;
