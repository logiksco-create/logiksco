-- =====================================================================
-- Logo de la empresa (RF-54): bucket público de solo imágenes pequeñas.
-- Es público para que se vea en correos; solo el Administrador de la
-- empresa sube o borra en su carpeta <empresa_id>/.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1024 * 1024, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "logos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and app.tiene_rol(app.empresa_de_ruta(name), '{admin}'));
create policy "logos: ver los propios" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and app.es_miembro(app.empresa_de_ruta(name)));
create policy "logos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and app.tiene_rol(app.empresa_de_ruta(name), '{admin}'));
