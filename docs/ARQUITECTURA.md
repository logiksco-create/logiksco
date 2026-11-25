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

- Dominio: 15 pruebas unitarias (`npm test`).
- SQL: migraciones, RLS y RPC contra Postgres 16 (`npm run test:sql`). Supabase se simula con un stub mínimo de `auth`.
- Flujo completo en modo demo con Playwright (`npm run e2e`).
- `SupabaseRepositorio`: flujo completo probado contra el proyecto Supabase real con un usuario y una empresa de prueba (luego borrados): registro de empresa en el primer ingreso, terceros, cotización, edición, envío, enlace público, aceptación, 170, aprobación, DO, hitos, novedad y duplicado.

## Estado frente al PRD (MVP)

| Módulo | Estado |
| --- | --- |
| Cotizador RF-01 a RF-06 (conceptos por bloque, utilidad, vigencias, estados, versiones) | Hecho (PDF pendiente) |
| Duplicar RF-08 a RF-10 | Hecho |
| Aceptación en línea y 170 RF-12 a RF-19 | Hecho (carga de soportes y PDF firmado pendientes) |
| DO RF-23 a RF-27, RF-29 | Hecho (documentos y solicitudes a proveedores, solo la interfaz) |
| Alertas RF-30 y RF-31 | Hecho en la app (correos por job pendientes) |
| Dashboard RF-33 y RF-34 | Hecho |
| Trazabilidad RF-38 y RF-40 | Registro hecho (envío real y correo entrante pendientes) |
| CRM RF-41 y RF-42 | Básico hecho |
| Facturación RF-45 a RF-50 | Esquema listo; integración con Megafoco pendiente |
| Portal del cliente con login RF-35 y RF-36 | Pendiente (hoy el cliente usa el enlace) |
| Reportes RF-53 y configuración RF-54 | Pendiente |
