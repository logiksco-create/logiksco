-- Textos del PDF de la factura: información tributaria/resolución (encabezado)
-- y condiciones de pago/notas legales (pie). Administrador o Contabilidad.
alter table public.fe_cuentas add column if not exists condiciones text;

create or replace function public.fe_guardar_textos(p_empresa uuid, p_resolucion text, p_condiciones text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.tiene_rol(p_empresa, '{admin,contabilidad}') then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  insert into public.fe_cuentas (empresa_id, resolucion, condiciones)
  values (p_empresa, left(p_resolucion, 1000), left(p_condiciones, 1500))
  on conflict (empresa_id) do update set resolucion = excluded.resolucion, condiciones = excluded.condiciones,
    actualizado_el = now();
end $$;
revoke all on function public.fe_guardar_textos(uuid, text, text) from public, anon;
grant execute on function public.fe_guardar_textos(uuid, text, text) to authenticated;
