-- =====================================================================
-- Facturación vía Megafoco (RF-45 a RF-50)
--  - La llave de API de Megafoco de cada empresa se guarda cifrada en
--    Supabase Vault; el navegador nunca la ve y solo el servidor (llave de
--    servicio) puede leerla.
-- =====================================================================

alter table public.facturas add column if not exists enviada_el timestamptz;

-- Guarda o reemplaza la llave (solo Administrador de esa empresa).
create or replace function public.guardar_llave_megafoco(p_empresa uuid, p_llave text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.tiene_rol(p_empresa, '{admin}') then
    raise exception 'Solo el Administrador puede conectar Megafoco' using errcode = '42501';
  end if;
  if length(coalesce(p_llave, '')) < 16 then
    raise exception 'La llave de Megafoco no es válida' using errcode = 'P0001';
  end if;
  select megafoco_secret_id into v_id from public.empresas where id = p_empresa;
  if v_id is null then
    v_id := vault.create_secret(p_llave, 'megafoco_' || p_empresa::text, 'Llave API de Megafoco');
    update public.empresas set megafoco_secret_id = v_id where id = p_empresa;
  else
    perform vault.update_secret(v_id, p_llave);
  end if;
end $$;
revoke all on function public.guardar_llave_megafoco(uuid, text) from public, anon;
grant execute on function public.guardar_llave_megafoco(uuid, text) to authenticated;

-- Solo el servidor puede leer la llave descifrada.
create or replace function public.llave_megafoco(p_empresa uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join public.empresas e on e.megafoco_secret_id = s.id
  where e.id = p_empresa;
$$;
revoke all on function public.llave_megafoco(uuid) from public, anon, authenticated;
grant execute on function public.llave_megafoco(uuid) to service_role;
