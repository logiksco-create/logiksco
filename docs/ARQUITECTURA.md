# Arquitectura

## Principios

1. **Multiempresa desde la base de datos.** Toda tabla de negocio lleva `empresa_id` y una política RLS. La app nunca es la única barrera: aunque una consulta olvide filtrar, Postgres no devuelve filas de otra empresa. `supabase/tests/rls_aislamiento.sql` lo comprueba.
2. **El dominio no depende de nada.** `src/domain/` son funciones puras y probadas: utilidad y margen con TRM, duplicación, estados de la cotización, situación de la 170, motor de alertas y hitos. Cambiar de base de datos o de framework no las toca.
3. **Un contrato de datos y varias implementaciones.** `Repositorio` (`src/server/datos/repositorio.ts`) tiene dos implementaciones: `DemoRepositorio` (memoria) y `SupabaseRepositorio` (RLS). Agregar otra, por ejemplo con caché o para pruebas, no cambia las pantallas.
4. **Lo específico de cada cliente va a configuración, nunca a código.** Esto incluye consecutivos, vigencia de la 170, bloqueo de DO, hitos por tipo de operación y términos.
5. **La evidencia es inmutable.** `auditoria`, `aceptaciones` y `comunicaciones` rechazan UPDATE y DELETE por trigger. Formularios 170 y DO no se borran.

## Capas

```
Navegador ──► Server Components (lectura) ─┐
          └─► Server Actions (escritura) ──┼─► contexto() ─► Repositorio ─► Supabase (RLS)
                                            │                    └──────► Demo (memoria)
                                            └─► dominio (reglas puras)
```

- **Server Actions** (`src/server/acciones/`): cada una resuelve el contexto en el servidor, valida con Zod (mensajes en español), verifica el rol y delega al repositorio. Los errores de negocio (`ErrorNegocio`) llegan al usuario; los inesperados se registran y se muestran genéricos.
- **Operaciones atómicas** como guardar una cotización con sus conceptos o abrir un DO con conceptos e hitos se hacen en funciones SQL (`guardar_cotizacion`, `abrir_operacion`) en una transacción y con `security invoker`, así que RLS sigue aplicando.
- **Consecutivos** sin huecos y seguros ante concurrencia (`app.siguiente_consecutivo`, `insert … on conflict do update`).

## Seguridad

| Tema | Implementación |
| --- | --- |
| Aislamiento | RLS en todas las tablas; funciones `security definer` con `search_path` vacío para `es_miembro` y `tiene_rol` |
| Roles | Lectura para miembros y escritura por rol; la revisión de la 170 solo la hace Cumplimiento (trigger) y los soportes solo los ven Cumplimiento y Admin |
| Enlace público | Token aleatorio de 192 bits; en la base solo se guarda su hash SHA-256; vence a los 30 días; `noindex` y `no-referrer` |
| Sesión | `@supabase/ssr` con cookies; el `proxy.ts` refresca la sesión y la validación real se hace con `getClaims()` en el servidor |
| Redirecciones | Solo rutas internas `/app…` tras el login |
| Cabeceras | HSTS, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy` |
| Llaves de terceros | La llave de Megafoco está prevista en Supabase Vault (`megafoco_secret_id`), nunca en texto plano; la integración aún no está escrita |

## Cómo ampliar

- **Nuevo módulo** (por ejemplo, facturación): tipos en `domain/types.ts`, reglas en `domain/<modulo>.ts` con pruebas, métodos en `Repositorio` y sus dos implementaciones, migración SQL con `select app.politicas_tenant('<tabla>', '{roles}')`, acciones y pantallas.
- **Nueva alerta:** agrega un caso en `domain/alertas.ts` y una prueba. La tabla `alertas` (con clave de idempotencia) existe para que un job programado las persista y envíe correos.
- **Correo:** las acciones ya registran cada comunicación. Falta conectar el envío real (Resend) en un worker que lea `comunicaciones` pendientes.

## Qué está probado

- Dominio: 25 pruebas unitarias (`npm test`): utilidad, duplicado, 170, alertas, archivos, reportes, facturación, portal.
- SQL: migraciones y 6 suites de seguridad contra Postgres 16 (`npm run test:sql`): aislamiento entre empresas, RPC, archivos por rol, inmutabilidad de correos, llave de Megafoco y portal sin acceso directo.
- Flujo completo en modo demo con Playwright (`npm run e2e`).
- Contra el Supabase real (con datos de prueba borrados al final): registro, terceros, cotización, PDF, envío, aceptación, 170 con soporte en Storage, aprobación, DO con documento en Storage, hitos y estado, prefactura, reportes CSV, llave de Megafoco en Vault y portal del cliente.

**Sin probar contra el servicio real:** envío con Resend (no hay llave), conector de Megafoco (no hay API ni contrato definitivo) e invitaciones por correo (se evitó enviar correos a direcciones de prueba).

## Integraciones

| Integración | Cómo se activa | Estado |
| --- | --- | --- |
| Correo (Resend) | `RESEND_API_KEY`, `CORREO_REMITENTE` (dominio verificado con SPF/DKIM) y webhook con `RESEND_WEBHOOK_SECRET` | Implementado; sin llave solo registra |
| Megafoco | `MEGAFOCO_API_URL` + `MEGAFOCO_WEBHOOK_SECRET`; cada empresa pega su llave en Configuración (Vault) | Implementado contra el contrato borrador del PRD |
| TRM del día | Automática desde datos.gov.co (Superintendencia Financiera), caché de 1 h; `TRM_RESPALDO` si no responde | Activa |
| Tarea diaria | Vercel Cron 7:00 a. m. Colombia → `/api/tareas/diaria` con `CRON_SECRET` | Activa: guarda alertas; resúmenes y recordatorios salen cuando haya Resend |
| Buzón por DO | Proveedor de correo entrante → `/api/correo-entrante` firmado con `CORREO_ENTRANTE_SECRET`; MX del dominio en `CORREO_ENTRANTE_DOMINIO` | Implementado; falta elegir proveedor y DNS |
| Plantillas de correo de Supabase | Requieren SMTP propio en el plan gratuito; mientras tanto las invitaciones se canjean en `/auth/invitacion` | Pendiente de SMTP |

## Estado frente al PRD (MVP)

| Módulo | Estado |
| --- | --- |
| Cotizador RF-01 a RF-06 | Hecho: PDF y TRM oficial del día |
| Duplicar RF-08 a RF-10 | Hecho |
| Aceptación y 170 RF-12 a RF-20 | Hecho; campos de la 170 configurables por empresa pendientes |
| DO RF-23 a RF-29 | Hecho: hitos propios por empresa, solicitudes a proveedores, aviso al responsable, costos reales |
| Alertas RF-30 a RF-32 | Hecho: acciones en la alerta de tarifa, tarea diaria con resumen por rol y recordatorios 170 (salen con Resend) |
| Dashboard RF-33 y RF-34 | Hecho |
| Portal del cliente RF-35 y RF-36 | Hecho |
| Trazabilidad RF-38 a RF-40 | Hecho: buzón entrante por DO y PDF de la línea de tiempo |
| CRM RF-41 y RF-42 | Hecho: contactos con cumpleaños y acuerdos editables |
| Facturación RF-45 a RF-50 | Hecho salvo notas crédito/débito |
| Reportes RF-53 | Hecho |
| Configuración RF-54 | Hecho: empresa, usuarios, catálogos, hitos, términos, Megafoco |
| Registro y arranque | Hecho: asistente de 4 pasos y catálogos base |
| Planes y cobro, superadmin, 2FA | Pendiente |
