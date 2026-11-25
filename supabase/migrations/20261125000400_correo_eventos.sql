-- La trazabilidad de correos es inmutable, salvo los acuses del proveedor:
-- se permite registrar entrega y apertura, nada más.
create or replace function app.proteger_comunicacion()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La tabla comunicaciones es inmutable: no se permite DELETE' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'entregado_el' - 'abierto_el') <> (to_jsonb(old) - 'entregado_el' - 'abierto_el') then
    raise exception 'La tabla comunicaciones es inmutable: solo se registran entrega y apertura' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists inmutable on public.comunicaciones;
create trigger inmutable before update or delete on public.comunicaciones
  for each row execute function app.proteger_comunicacion();

create index if not exists comunicaciones_proveedor on public.comunicaciones (proveedor_id_mensaje);
