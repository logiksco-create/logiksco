-- Modo de emisión por empresa:
--   'borrador' (PRUEBA, por defecto): el bot hace todo el proceso y pulsa
--              «Guardar» en Finppi. Nada va a la DIAN. La factura queda en
--              LOGIKS como prueba (simulada = true, sin CUFE).
--   'real':    el bot pulsa «Enviar» (DIAN). Además el servidor del bot debe
--              tener FE_PERMITIR_EMISION=si.
alter table public.fe_cuentas add column if not exists modo_emision text not null default 'borrador'
  check (modo_emision in ('borrador', 'real'));

create or replace function public.fe_guardar_modo(p_empresa uuid, p_modo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.tiene_rol(p_empresa, '{admin}') then
    raise exception 'Solo el Administrador cambia el modo de emisión' using errcode = '42501';
  end if;
  if p_modo not in ('borrador', 'real') then
    raise exception 'Modo no válido' using errcode = 'P0001';
  end if;
  insert into public.fe_cuentas (empresa_id, modo_emision) values (p_empresa, p_modo)
  on conflict (empresa_id) do update set modo_emision = excluded.modo_emision, actualizado_el = now();
end $$;
revoke all on function public.fe_guardar_modo(uuid, text) from public, anon;
grant execute on function public.fe_guardar_modo(uuid, text) to authenticated;

-- Una factura de PRUEBA (simulada, sin CUFE) vuelve a prefactura para poder
-- emitirla de verdad. Nunca toca una factura con CUFE.
create or replace function public.fe_descartar_prueba(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.facturas;
begin
  select * into f from public.facturas where id = p_factura for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0002';
  end if;
  if not app.tiene_rol(f.empresa_id, '{contabilidad}') then
    raise exception 'Solo Contabilidad gestiona facturas' using errcode = '42501';
  end if;
  if not f.simulada or f.cufe is not null then
    raise exception 'Solo se descartan facturas de prueba' using errcode = 'P0001';
  end if;
  update public.facturas set estado = 'borrador', simulada = false, numero = null, numero_esperado = null,
    referencia = null, fecha_validacion = null, pdf_finppi_path = null, pdf_finppi_sha256 = null, xml_path = null,
    enviada_cliente_el = null, error = null, error_codigo = null
  where id = p_factura;
end $$;
revoke all on function public.fe_descartar_prueba(uuid) from public, anon;
grant execute on function public.fe_descartar_prueba(uuid) to authenticated;
