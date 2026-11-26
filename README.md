# LOGIKS.CO

Plataforma SaaS multiempresa para operadores logísticos y agentes de carga en Colombia: cotización, aceptación en línea, Circular 170 de la DIAN, operaciones (DO), alertas, trazabilidad de correos y factura electrónica en USD o COP con un clic (bot sobre Finppi, ver `worker/einvoice-bot`).

> Cliente piloto: Oikor Colombia SAS. El PRD completo está en el documento «PRD — LOGIKS.CO».

## Arranque rápido (modo demo)

Sin variables de entorno, la app arranca en **modo demo**: datos del piloto en memoria y sin login. Desde el menú lateral puedes cambiar de usuario (Comercial, Operaciones, Cumplimiento) para ver cada rol.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. La landing está en `/` y la aplicación en `/app`.

## En producción

- App: https://logiksco.vercel.app (Vercel, despliegue automático en cada push a `main`).
- Base de datos: proyecto Supabase `nicwbwpymmakdtclmynx`, con las migraciones de `supabase/migrations/` aplicadas.

## Con Supabase (otro entorno)

1. Crea un proyecto en Supabase y aplica las migraciones de `supabase/migrations/` (`supabase db push` o el editor SQL, en orden).
2. Copia `.env.example` a `.env.local` y completa las llaves.
3. En Supabase Auth activa la verificación de correo. Al primer ingreso se crea la empresa con los datos del registro.
4. Despliega en Vercel con las mismas variables.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas del dominio (utilidad, duplicar, 170, alertas) |
| `npm run typecheck` / `npm run lint` | Tipos y estilo |
| `npm run test:sql` | Migraciones + pruebas de aislamiento RLS en un Postgres (`DATABASE_URL`) |
| `npm run e2e` | Flujo completo en el navegador contra `npm run dev` (requiere Playwright) |

## Estructura

```
src/
  domain/          Reglas de negocio puras (sin framework ni base de datos)
  server/
    datos/         Contrato Repositorio + implementaciones demo y Supabase
    acciones/      Server Actions: validación (Zod) + rol + repositorio
    contexto.ts    Resuelve usuario y empresa de la petición
  components/      Sistema de diseño (ui/) y componentes de pantalla
  app/             Rutas: / (landing), /app (privado), /c/[token] (cliente), /login, /registro
supabase/
  migrations/      Esquema, RLS, auditoría y RPC transaccionales
  tests/           Pruebas SQL de aislamiento entre empresas
docs/ARQUITECTURA.md
```

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
