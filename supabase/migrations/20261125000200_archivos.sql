-- =====================================================================
-- Archivos: documentos del DO (RF-28) y soportes de la Circular 170 (RF-16)
-- en un bucket PRIVADO. Ruta: <empresa_id>/<do|170>/<entidad_id>/<archivo>
--  - Documentos del DO: los ven los miembros; los sube Operaciones.
--  - Soportes 170: solo Cumplimiento (y Admin); los sube el cliente por el
--    enlace público, desde el servidor con la llave de servicio.
-- Descargas siempre con URL firmada de corta duración.
-- =====================================================================

alter table public.do_documentos add column if not exists mime text;
alter table public.do_documentos add column if not exists tamano bigint;
alter table public.formulario_170_soportes add column if not exists nombre text;
alter table public.formulario_170_soportes add column if not exists mime text;
alter table public.formulario_170_soportes add column if not exists tamano bigint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false, 15 * 1024 * 1024,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword', 'text/csv', 'application/xml', 'text/xml'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Empresa dueña del objeto según la ruta, o null si la ruta no es válida.
create or replace function app.empresa_de_ruta(p_nombre text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (string_to_array(p_nombre, '/'))[1]::uuid;
exception when others then
  return null;
end $$;

create policy "documentos del DO: leer" on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (string_to_array(name, '/'))[2] = 'do'
    and app.es_miembro(app.empresa_de_ruta(name))
  );

create policy "documentos del DO: subir" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (string_to_array(name, '/'))[2] = 'do'
    and app.tiene_rol(app.empresa_de_ruta(name), '{operaciones}')
  );

create policy "soportes 170: leer" on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (string_to_array(name, '/'))[2] = '170'
    and app.tiene_rol(app.empresa_de_ruta(name), '{cumplimiento}')
  );

grant execute on function app.empresa_de_ruta(text) to authenticated;
