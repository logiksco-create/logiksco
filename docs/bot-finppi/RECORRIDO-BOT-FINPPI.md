# Bot de facturación electrónica en Finppi — recorrido completo

**Versión del adaptador:** `2026.11.27-1` · **Estado:** modo prueba («Guardar» en Finppi) validado de punta a punta contra una cuenta real el 27-nov-2026.

Este documento describe exactamente lo que hace el bot de LOGIKS.CO en Finppi, con los selectores reales y todo lo que se corrigió al probarlo en vivo. Sirve para montar el mismo bot en otra plataforma (MEGAFOCO) sin repetir los errores. El código fuente de referencia va en el paquete `bot-finppi-referencia.zip`.

---

## 1. Cómo está armado

```
Plataforma (web)                  Base de datos                     Bot (Playwright)
────────────────                  ─────────────                     ────────────────
Usuario confirma  ──► RPC encolar ──► fe_jobs (cola)  ◄── reclamar ── Worker (GitHub Actions
la factura             (congela el    fe_job_logs         (1 por        bajo demanda, o un
                        payload)      fe_consecutivos     empresa)      servidor propio)
                                      facturas                │
                  ◄── aviso firmado (HMAC) ─────────────────── ┘  abre Finppi, llena, guarda/envía
```

- **El bot nunca corre en el servidor web.** Corre aparte: en este proyecto, un workflow de GitHub Actions que la plataforma despierta con `workflow_dispatch` al confirmar. También hay una revisión programada cada 2 horas que sale de inmediato si no hay trabajo.
- **La cola vive en la base de datos.** El job lleva el *payload congelado*, es decir, los valores aprobados en el momento de confirmar. El bot transcribe exactamente eso. Si el usuario corrige algo después, debe **detener el envío** y volver a enviarlo (ver §7).
- **Un trabajo por empresa a la vez**, garantizado con un índice único (`estado = 'corriendo'`) y `for update skip locked` al reclamar.
- **Credenciales de Finppi:** cifradas (Vault) y solo legibles por el bot (`service_role`). En los logs se enmascaran el usuario, la clave y los correos.

### Tipos de trabajo
| Tipo | Qué hace | ¿Escribe en Finppi? |
|---|---|---|
| `healthcheck` | Login, verifica NIT, lee el próximo consecutivo y **lee las listas del panel de cliente** | No |
| `productos` | Lee todo el listado de productos y servicios (paginado) | No |
| `emitir` | El recorrido completo (§4) | Sí |
| `reconciliar` | Después de un resultado dudoso, busca la factura o el borrador en el listado | No |

---

## 2. Regla de monedas (obligatoria)

- **En la plataforma todo se ve en USD**: prefactura, borrador de prueba y factura emitida. El PDF propio se genera en dólares; por defecto solo USD, y el usuario puede elegir «USD y COP» o «solo COP».
- **A Finppi y la DIAN todo va en COP.** Contabilidad escribe una **TRM de referencia** en cada factura.
- Conversión por línea: `precioCOP = redondear(precioUSD × TRM, 2)`, `subtotal = redondear(precioCOP × cantidad, 2)`. El IVA se calcula sobre el subtotal COP de la línea.
- Al comparar con Finppi se acepta una diferencia de **hasta $1 COP**.
- La moneda del acuerdo del cliente **no** cambia la factura a pesos. Ese error ya ocurrió: una factura de US$2 salió en $7.261,78 COP.

---

## 3. Lo que recibe el bot (payload)

```jsonc
{
  "referencia": "LG-787BPB",            // única; va en «Número de orden» de Finppi
  "modo": "borrador",                    // "borrador" = Guardar (prueba) · "real" = Enviar (DIAN)
  "nitEmisor": "902125487",              // el bot verifica que la cuenta sea de esta empresa
  "tipoFactura": "Factura de venta nacional",
  "moneda": "COP - Peso colombiano",     // texto EXACTO de la opción de Finppi
  "fecha": "2026-11-27", "vencimiento": "2026-11-27",
  "tipoPago": "Contado", "tipoOperacion": "Estándar", "metodoPago": "Acuerdo mutuo",
  "crearCliente": true,
  "cliente": {
    "tipoPersona": "Natural", "tipoDocumento": "Nit", "numeroDocumento": "1017000111",
    "nombres": "Ana María", "apellidos": "Gómez Ruiz",
    "email": "…", "celular": "…", "telefono": "…",
    "regimen": "No responsable de iva",
    "responsabilidadFiscal": "No aplica (ninguna de las anteriores)",
    "pais": "Colombia", "ciudad": "MEDELLÍN / Antioquia", "direccion": "…"
  },
  "productosNuevos": [],                 // productos creados en la plataforma que quizá no existen en Finppi
  "items": [{ "producto": "OIK09", "descripcion": "Flete marítimo LCL · OIK-2026-0006",
              "precio": 7261.78, "cantidad": 1, "iva": "IVA-0" }],      // YA en COP
  "totales": { "subtotal": 7261.78, "iva": 0, "total": 7261.78, "terceros": 0 },
  "original": { "moneda": "USD", "trmReferencia": 3630.89, "totales": { … } }  // solo informativo
}
```

**Valores que deben ser el texto exacto de Finppi.** La plataforma ya los trae fijos de la cuenta real (archivo `finppi-listas.ts` del paquete):
- **Tipo de persona (2):** `Natural`, `Juridica` (sin tilde).
- **Tipo de documento (11):** `Nit`, `Cédula de ciudadanía`, `Cédula de extranjería`, `Pasaporte`, `Documento de identificación extranjero`, `Nit de otro pais / sin identificación del exterior (43 medios magneticos)`, `Nuip`, `Permiso especial de permanencia`, `Registro civil`, `Tarjeta de extranjería`, `Tarjeta de identidad`.
- **Régimen (2):** `No responsable de iva`, `Responsable de iva`.
- **Responsabilidad fiscal (5):** `No aplica (ninguna de las anteriores)`, `Agente de retención de iva`, `Autoretenedor`, `Gran contribuyente`, `Régimen simple de tributación`.
- **Ciudad (1128):** formato `MUNICIPIO / Departamento` en mayúsculas y con tildes, p. ej. `MEDELLÍN / Antioquia`, `BOGOTÁ / Bogotá`. **Ojo:** `RIONEGRO` existe en Antioquia y en Santander.
- **IVA:** `Ninguno`, `IVA-0`, `IVA-5`, `IVA-19` · **INC:** `No aplica`.

**Persona natural:** nombres y apellidos van **separados**. Si el apellido es igual al nombre, la plataforma bloquea la emisión; si no, Finppi crearía «Ana María Gómez Ruiz Ana María Gómez Ruiz». Al pasar a Natural, el formulario separa solo nombres y apellidos: los dos últimos términos son los apellidos.

---

## 4. Recorrido paso a paso

> ✅ = verificado en vivo contra Finppi · 🟡 = implementado y probado en simulador, falta verlo en vivo

### Paso 0 — Antes de abrir Finppi
1. Si el job está en `modo: "real"` pero el servidor del bot no tiene `FE_PERMITIR_EMISION=si`, se ejecuta como **prueba en seco** (llena y no envía). Es un seguro adicional.
2. La factura pasa a `enviando`.

### Paso 1 — Iniciar sesión ✅
- `https://app.finppi.com/` → `input[placeholder="Email"]`, `input[placeholder="Contraseña"]`, botón `button[type="submit"]:has-text("Ingresar")`.
- Se considera éxito cuando aparece el menú lateral (`.sidebar__category:has-text("Ingresos")`).
- **Un solo intento**, para no bloquear la cuenta. Si falla, el bot lee el aviso de Finppi y clasifica: `INVALID_CREDENTIALS` o `ACCOUNT_LOCKED_OR_CHALLENGE` (cuando el texto trae captcha, verificación, código o bloqueo).
- Diálogos del navegador: solo se acepta «salir de la página»; cualquier otro se cancela.

### Paso 2 — Productos nuevos (si los hay) 🟡
- Lee todo el listado `/products` (paginado). Si el código no existe: «Crear», escribe nombre y código, Tipo de ítem = `Servicio`, IVA, precio 0. Lee de vuelta los valores, pulsa «Crear» y confirma que el producto aparece en el listado.
- **Nunca duplica:** si el código ya existe, lo deja como está.

### Paso 3 — ¿El cliente ya existe en Finppi? ✅ (clave para no duplicar)
- Va a `https://app.finppi.com/customers`, escribe el documento en `input[placeholder="Buscar cliente..."]` y lee las filas. Columnas: 0 #, 1 Nombre, 2 Identificación…
- **Este buscador SÍ filtra por identificación.** El de la factura **NO**: filtra solo por nombre.
- Guarda el nombre con el que está registrado («Ana María Gómez Ruiz»). Si el documento ya existe, **jamás se crea otra vez**, aunque en la plataforma tenga otro nombre.

### Paso 4 — Abrir el formulario y verificar la empresa ✅
- Menú Ingresos → «Facturas de venta» → botón `main button.btn:has-text("Crear")` → ruta `/income/invoice/edit`.
- La cabecera del formulario muestra razón social y `NIT-902125487`: los dígitos deben contener el NIT de la empresa. Si no, `WRONG_COMPANY`.

### Paso 5 — Consecutivo (cero saltos) ✅
- El desplegable «Número» (input oculto `invoiceNumber`) tiene **una sola opción**, que es el próximo consecutivo (p. ej. `FEOC2`). Si tiene más de una, se detiene.
- Se compara con el **libro de consecutivos** de la plataforma: debe ser el último emitido + 1.
  - En **modo real**, un salto es `CONSECUTIVE_GAP` y la factura pasa a revisión.
  - En **modo prueba**, solo se registra un aviso.

### Paso 6 — Elegir o crear el cliente ✅
1. En el desplegable «Cliente» (input oculto `invoiceClientId`) se escribe **primero el documento** y luego **el nombre** (el registrado, luego `nombres + apellidos`, luego `nombres`).
   - Se elige la opción cuyo texto contiene el documento; si no, la que coincide con el nombre, sin importar tildes ni mayúsculas.
   - Si hay **dos clientes con el mismo nombre**, se detiene.
2. Si no aparece y el **Paso 3** dijo que existe: se detiene sin crear nada.
3. Si no existe y está autorizado: botón `#TooltipSearchInvoice-newCliente` (el «+»), que abre un panel lateral «Crear Cliente». Cada desplegable se ubica por el **name de su input oculto** (verificado en vivo):

| Campo | Selector / name | Notas |
|---|---|---|
| Tipo de persona | `personType` | `Natural` / `Juridica` |
| Tipo de documento | `customerIdTypeId` | |
| Número de documento | `input[name="nationalID"]` | sin puntos ni DV |
| Nombres | `input[name="name"]` (placeholder «Nombres») | en jurídica: campo de razón social; se busca por name o por la etiqueta visible |
| Apellidos | `input[name="lastname"]` | solo persona natural |
| Email | `input[name="contacts[0].email"]` | |
| Celular | `input[name="contacts[0].phoneNumber.number"]` | el indicativo +57 viene por defecto |
| Régimen | `customerRegimenTypeId` | **la etiqueta dice «Regimen» sin tilde** |
| Responsabilidad fiscal | `customerFiscalResponsabilityId` | |
| Nombre ubicación | `input[name="locations.0.name"]` | «Oficina principal» |
| País | `locations.0.address.country` | `Colombia` por defecto: si ya lo tiene, no se toca |
| Ciudad | `locations.0.address.cityCode` | ver «Cómo elegir opciones» abajo |
| Dirección | `input[name="locations.0.address.address_line1"]` | |
| Teléfono ubicación | `input[name="locations[0].phoneNumbers[0].number"]` | |
| Crear | `button[type="submit"]:has-text("Crear")` | |

   - Antes de «Crear» se lee de vuelta lo escrito (documento, nombre, email).
   - Si después de «Crear» el panel sigue abierto **con mensajes de error**, se reportan textualmente. Si no hay mensajes, se cierra con Escape y la búsqueda del punto 1 confirma.
   - Después de crearlo, se vuelve a buscar en la factura (reintentos a 0, 2 y 5 s).
4. **Identificación autocompletada** (`input[name="clientnationalID"]`): se le da hasta 5 s a Finppi para llenarla.
   - Si la llena, debe coincidir con el documento; nunca se sobrescribe.
   - **A los clientes recién creados Finppi NO les autocompleta** identificación, dirección ni teléfono (visto en vivo). En ese caso, solo si el cliente elegido es sin duda el correcto (el que el listado asocia a ese documento, o el recién creado), el bot llena `clientnationalID`, `clientaddress` y `clientnumber`.

### Paso 7 — Llenar la factura ✅
Encabezado, cada desplegable por su input oculto:

| Campo | name | Valor |
|---|---|---|
| Tipo de factura | `national` | `Factura de venta nacional` |
| Moneda | `currency` | `COP - Peso colombiano` |
| Tipo de pago | `paymentWay` | `Contado` / `Crédito` |
| Fecha / Expiración | `input[name="date"]`, `input[name="expiration"]` | se lee el formato del campo antes de escribir (en vivo: `2026-11-27`) |
| Tipo de operación | `invoiceOperationTypeId` | `Estándar` |
| Método de pago | `invoicePaymentMethodId` | `Acuerdo mutuo`, etc. |
| Número de orden | `input[name="orderID"]` | **la referencia única** (sirve para encontrarla después) |

Ítems (fila `n`, desde 0). Desde la segunda fila se pulsa el botón «Añadir».
- **Producto:** `items.n.productServiceID`. Se escribe el código y se elige la opción que empieza por `CÓDIGO - ` (en vivo: `OIK09 - Radiación BL`). Al elegirlo, Finppi pone la cantidad en 0 y su precio de lista, así que se llena todo después.
- **Descripción:** `input[name="items.n.comment"]`.
- **Cantidad:** `items.n.quantity` · **Precio:** `items.n.unitPrice` (en COP) · **Descuento:** `items.n.discountPercentage` = 0.
- **IVA:** `items.n.vatPercentage`. Retención e INC se dejan en `Ninguno` y `No aplica`.

### Paso 8 — Comparar totales ✅
- Se leen **por posición en pantalla**: para cada etiqueta visible (`Subtotal`, `IVA (+)`, `Total`…) se toma el texto con forma de dinero que está **en la misma fila, a la derecha**.
- **Leer «el siguiente elemento del HTML» NO funciona en Finppi** (devolvía NaN).
- Finppi muestra los valores en formato `$7,261.78` (coma de miles, punto decimal).
- Se lee varias veces hasta que Subtotal, IVA y Total no sean NaN y dos lecturas seguidas coincidan (máx. ~15 s).
- Si alguno difiere más de $1 del aprobado: `VALUES_MISMATCH` (antes de guardar o enviar; no se escribe nada).

### Paso 9A — Modo prueba: «Guardar» ✅
1. Se marca el **punto de no retorno** en la base de datos y luego se pulsa `button[type="submit"]:has-text("Guardar")`.
   - Si aparece una confirmación que habla de DIAN, emitir o enviar, se cancela.
   - Se registra lo que respondió Finppi (avisos o errores y la página donde quedó).
2. Se busca el borrador en el listado `/income/invoice`. **Así aparece en Finppi (captura real):**

   | # | Prefijo | Nota | Cliente | Fecha | Estado | Total | Opciones |
   |---|---|---|---|---|---|---|---|
   | 1 | `BORR9341226` | x | `Ana María Gómez R...` | 2026-11-27 | **Borrador** | $7,261.78 | 🗑️ papelera · 📄 ver · ✏️ editar |

   - El borrador **tiene su propio número `BORR…`**: no consume el consecutivo FEOC.
   - **El nombre del cliente sale cortado con «...»**: se compara por prefijo.
   - **El buscador del listado conserva el texto al volver al listado:** hay que **borrarlo** antes de leer las filas. Si no, la tabla sale vacía.
   - **En la fila de un borrador el PRIMER ícono es la PAPELERA.** El bot no toca ningún ícono de un borrador.
3. La factura queda en la plataforma como **«Borrador de prueba»**, con el número `BORR…`. **Nunca se muestra como «Emitida»**, no aparece en el portal del cliente y el DO sigue pendiente de facturar.

### Paso 9B — Modo real: «Enviar» 🟡 (falta validar en vivo)
1. Se marca el punto de no retorno, se registra el consecutivo en el libro como `en_vuelo` y se pulsa `button[type="submit"]:has-text("Enviar")`.
2. Si aparece un modal de confirmación: debe mostrar el **número esperado**. Si no lo muestra, se pulsa «No, Cancelar» y no se envía nada. Si lo muestra, se pulsa «Continuar/Sí».
3. Se espera la fila **`Aceptada`** con ese número en el listado.
4. Se descargan PDF y XML por los íconos de «Opciones»: en **facturas aceptadas** el orden documentado es 0 XML, 1 PDF, 2 Duplicar (**NO USAR**), 3 Reenviar (**NO USAR**). **Hay que confirmarlo en vivo** antes de confiar en el orden, porque en los borradores es distinto.
5. Del PDF se extrae el **CUFE** (SHA-384 de 96 caracteres en hexadecimal; en el PDF puede venir partido en varias líneas). Se valida el número y el NIT, y la factura queda `emitida`.

### Paso 10 — Avisar a la plataforma
- POST firmado (HMAC-SHA256 con secreto compartido) a `/api/fe/notificar`. La plataforma envía la factura al cliente si así se pidió (no aplica a pruebas).

---

## 5. Cómo elegir opciones en Finppi (react-select) — lo que funcionó

1. **Ubicar el control por el `name` de su input oculto**: `[class*="-container"]:has(> input[name="…"]) [class*="-control"]`.
   - De respaldo, por la etiqueta visible (`span.form__form-group-label`, que **no** es un `<label>`; puede terminar en `*`).
   - **Nunca usar los id `react-select-N-input`**: cambian en cada carga.
2. Si el control **ya muestra el valor**, no se toca.
3. Clic, escribir para filtrar y leer las opciones (`[id^="react-select-"][id*="-option-"]`).
4. Elegir la opción **idéntica**. Si no la hay, la que coincide **sin tildes ni mayúsculas** («Medellin» = «MEDELLÍN»).
5. Si al escribir no aparece, **borrar lo escrito y buscar en la lista completa**: el filtro de Finppi puede no ignorar tildes.
6. Exigir **una sola** coincidencia. Si no la hay, el error dice **qué opciones mostró Finppi**.

---

## 6. Errores y qué hace el bot

| Código | Cuándo | Antes de Guardar/Enviar | Después |
|---|---|---|---|
| `TIMEOUT` | Red o tiempo | Reintenta solo a 1, 5 y 30 min | Estado desconocido → reconciliar |
| `SELECTOR_NOT_FOUND` | Finppi no mostró algo esperado | Falla sin reintento + **diagnóstico** | Estado desconocido |
| `PLATFORM_VALIDATION_ERROR` | Opción inexistente, cliente duplicado, error de Finppi | Falla + diagnóstico | Estado desconocido |
| `VALUES_MISMATCH` | Totales o identificación no cuadran | Falla + diagnóstico | Estado desconocido |
| `CONSECUTIVE_GAP` | El número no sigue el libro | Revisión (solo modo real) | — |
| `WRONG_COMPANY` | La cuenta es de otro NIT | Falla | — |
| `PDF_INVALID` | El PDF no trae CUFE o número | — | Revisión |

- **Punto de no retorno:** después de pulsar Guardar o Enviar **nunca se reintenta**. Solo se busca el resultado («reconciliar»).
- **Freno de emergencia:** dos `SELECTOR_NOT_FOUND` seguidos pausan todo el sistema (Finppi pudo cambiar).
- **Diagnóstico automático:** en cada fallo de selector, validación o valores se guarda una **captura de pantalla** y la **estructura de la página**: etiquetas, nombres de campos, botones, desplegables y el HTML del bloque de totales. Así se corrigieron todos los selectores de este documento sin adivinar.
- Un error de Playwright del tipo «esperando un elemento» se convierte en `SELECTOR_NOT_FOUND`; reintentar no lo arregla.

---

## 7. Acciones del usuario sobre una factura en proceso

| Situación | Acción | Regla |
|---|---|---|
| En cola, quiere corregir datos | **Detener envío** | Solo si el bot no la ha tomado. Vuelve a prefactura con la **misma referencia** |
| Falló antes de Guardar/Enviar | **Reintentar emisión** | Arma un payload nuevo con los datos actuales |
| Prueba con «Guardar» sin confirmar | **Verificar en Finppi** | El bot solo busca el borrador (no guarda nada) y, si está, la deja como prueba guardada |
| Prueba que no quedó en Finppi | **Volver a prefactura (prueba)** | La base de datos lo **impide si fue un envío real** |
| Prueba guardada, ahora va en serio | **Descartar prueba** → emitir en modo real | Borrar el borrador en Finppi si sobra |

---

## 8. Lecciones del 27-nov-2026 (cada una fue un fallo real, ya corregido)

1. El runner `ubuntu-latest` de GitHub (26.04) no es compatible con Playwright 1.56: se fijó `ubuntu-24.04`.
2. El repositorio de Microsoft del runner respondió 403 y rompía `apt-get`: hay que **quitarlo antes de `playwright install --with-deps`**.
3. tsx/esbuild inyecta `__name` en las funciones; lo que se ejecute en el navegador (`page.evaluate`) debe ir como **texto**, no como función.
4. Las etiquetas de Finppi son `span.form__form-group-label`, no `<label>`: ubicar por name de input oculto.
5. Persona jurídica y natural tienen campos distintos en el panel de cliente.
6. La etiqueta es **«Regimen»** sin tilde.
7. Ciudades con tildes y mayúsculas: comparar normalizado y usar la lista exacta de Finppi.
8. El buscador de clientes **de la factura filtra por nombre**; el del **listado de Clientes, por identificación**. Así se evita duplicar.
9. Clientes recién creados: Finppi **no autocompleta** identificación, dirección ni teléfono.
10. Totales: leer **por posición en pantalla**, no por orden del HTML.
11. El listado **conserva el filtro del buscador**: borrarlo antes de leer.
12. El borrador se ve como `BORR…`, con el cliente **cortado con «...»** y la **papelera como primer ícono**.
13. Moneda: la factura debe ser USD en la plataforma; la moneda del acuerdo del cliente la estaba pasando a COP.
14. Un borrador de prueba **no es una factura emitida**: no debe verse así, ni contarse como facturado, ni salir en el portal del cliente.

---

## 9. Pendiente de validar en vivo (antes de emitir de verdad)

- [ ] Modal de «Enviar»: texto, si muestra el número y nombre exacto de los botones.
- [ ] Fila **Aceptada**: orden real de los íconos XML/PDF. **No** usar Duplicar ni Reenviar.
- [ ] CUFE en el PDF real de Finppi.
- [ ] Creación de producto nuevo en Finppi (formulario `/products/edit`).
- [ ] Encontrar el borrador justo después de «Guardar» en el flujo normal. Ya funcionó con «Verificar», que usa la misma búsqueda.

**Recomendación:** primera emisión real con una factura pequeña, mirando el seguimiento paso a paso.

---

## 10. Contenido del paquete `bot-finppi-referencia.zip`

| Archivo | Para qué |
|---|---|
| `worker/einvoice-bot/src/adapters/finppi/selectors.ts` | **Todos** los selectores (único lugar donde viven) |
| `worker/einvoice-bot/src/adapters/finppi/finppi.ts` | Acciones en Finppi: login, cliente, factura, totales, guardar, enviar, listado |
| `worker/einvoice-bot/src/flujos.ts` | Orquestación de emitir, healthcheck, productos, reconciliar y diagnóstico |
| `worker/einvoice-bot/src/logica.ts` | Reglas puras: errores, reintentos, NIT, fechas, normalizar |
| `worker/einvoice-bot/src/main.ts`, `db.ts`, `config.ts`, `navegador.ts`, `pdf.ts` | Bucle, cola, configuración, navegador y lectura de PDF |
| `worker/einvoice-bot/test/finppi-simulado.html` | **Simulador de Finppi** con todas las particularidades de §8 |
| `worker/einvoice-bot/test/*.test.ts` | Pruebas: 12 de punta a punta contra el simulador + 9 de reglas puras |
| `src/domain/einvoice.ts` | Payload, conversión USD→COP, validaciones fiscales, CUFE, consecutivos |
| `src/domain/finppi-listas.ts` | Listas exactas de Finppi (1128 ciudades, documentos, regímenes…) |
| `.github/workflows/bot-finppi.yml` | Bot bajo demanda en GitHub Actions |
| `supabase/migrations/*fe*`, `*factur*`, `*prueba*`, `*envio*` | Cola, credenciales cifradas, libro de consecutivos y RPC (encolar, detener, verificar, reabrir) |

**Variables del bot** (en el servidor del bot, nunca en el código): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOGIKS_URL`, `FE_WORKER_SECRET`, `FE_PERMITIR_EMISION` (`si` solo cuando se valide el modo real), `BOT_UNA_VEZ`, `BOT_MAX_MINUTOS`.
