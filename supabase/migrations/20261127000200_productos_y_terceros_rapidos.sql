-- Productos (catálogo «producto_finppi»): los crea y edita también Comercial y
-- Contabilidad, desde la cotización. Un código no se repite en la empresa.
create policy "comercial y contabilidad crean productos" on public.catalogos
  for insert with check (tipo = 'producto_finppi' and app.tiene_rol(empresa_id, '{comercial,contabilidad}'));
create policy "comercial y contabilidad editan productos" on public.catalogos
  for update using (tipo = 'producto_finppi' and app.tiene_rol(empresa_id, '{comercial,contabilidad}'))
  with check (tipo = 'producto_finppi' and app.tiene_rol(empresa_id, '{comercial,contabilidad}'));

create unique index if not exists catalogos_codigo_producto on public.catalogos (empresa_id, codigo)
  where tipo = 'producto_finppi' and codigo is not null;
