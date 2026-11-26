# Bot de facturación electrónica (Finppi)

Transcribe en Finppi las facturas que Contabilidad confirma en LOGIKS.CO y
trae de vuelta el número, el CUFE y el PDF/XML originales. **Corre en un
servidor propio** (Railway, Fly.io o un VPS), nunca en Vercel: necesita un
navegador Chromium que viva mientras haya trabajos.

```
LOGIKS (Vercel) ──encola──▶ fe_jobs (Supabase) ◀──reclama── bot (Playwright) ──▶ app.finppi.com
        ▲                                                     │
        └──────── POST /api/fe/notificar (firmado HMAC) ◀─────┘
```

## Reglas que el código garantiza

- **Valores aprobados**: el bot no calcula nada. Escribe exactamente el
  `payload` congelado al confirmar (precios en COP con la TRM de referencia)
  y compara los totales de Finppi con tolerancia de $1; `NaN` o diferencia →
  `VALUES_MISMATCH` sin emitir.
- **Punto de no retorno**: antes del clic definitivo marca
  `punto_no_retorno = true` y espera la escritura. Si algo falla después, la
  factura queda `estado_desconocido` y se encola `reconciliar`, que **solo
  busca** por número o referencia. Nunca se re-emite.
- **Cero saltos**: el consecutivo ofrecido debe ser el siguiente del libro
  `fe_consecutivos`; si no, bloquea (`CONSECUTIVE_GAP`) y pide revisión.
- **Un trabajo por empresa** y **una emisión activa por factura** (índices
  únicos en la base). Pausa global con 2 `SELECTOR_NOT_FOUND` seguidos.
- **Modo prueba por defecto**: mientras `FE_PERMITIR_EMISION` no sea `si`,
  toda emisión se detiene antes de «Enviar».
- Nunca usa «Guardar», «Duplicar», «Reenviar» ni «Eliminar» de Finppi.
- Las credenciales viven en Supabase Vault; solo `fe_credenciales()` con la
  llave de servicio las lee. Los logs enmascaran correos y claves.
- Todos los selectores están en `src/adapters/finppi/selectors.ts`.

## Desplegar

1. Variables (ver `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `LOGIKS_URL`, `FE_WORKER_SECRET` (el mismo valor en Vercel),
   `FE_PERMITIR_EMISION=no`.
2. Construir desde la raíz del repositorio:
   `docker build -f worker/einvoice-bot/Dockerfile -t logiks-einvoice-bot .`
3. Ejecutar una sola réplica para empezar.

## Fase 0 (antes de `FE_PERMITIR_EMISION=si`)

Con una **cuenta de pruebas** de Finppi (no la de un cliente):

1. Guardar credenciales en LOGIKS → el healthcheck debe mostrar NIT y próxima factura.
2. «Probar sin emitir» en varias facturas: los totales deben coincidir y el
   consecutivo no debe cambiar.
3. Confirmar lo marcado como pendiente en el PRD (A.10): modal tras «Enviar»,
   formato de fechas, si «Número de orden» es buscable, que el PDF trae CUFE.
4. Solo entonces habilitar la emisión real y emitir una factura piloto.
