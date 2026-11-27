-- Aprobación desde el PDF de la cotización (enlace firmado) y verificación
-- interna de las aceptaciones en línea.
alter table public.aceptaciones add column if not exists documento text;
alter table public.aceptaciones drop constraint if exists aceptaciones_canal_check;
alter table public.aceptaciones add constraint aceptaciones_canal_check check (canal in ('enlace', 'manual', 'pdf'));

-- Quién del equipo verificó la aceptación (tarea que genera la aceptación en línea).
alter table public.cotizaciones
  add column if not exists aceptacion_verificada_el timestamptz,
  add column if not exists aceptacion_verificada_por uuid references auth.users (id);
