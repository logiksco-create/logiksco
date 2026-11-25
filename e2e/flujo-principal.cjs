// Prueba de punta a punta del flujo principal en modo demo.
// Uso: npm run dev  (en otra terminal)  y luego  npm run e2e
// eslint-disable-next-line @typescript-eslint/no-require-imports -- script CommonJS
const { chromium } = require('playwright');
const B = process.env.BASE_URL ?? 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(12000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const paso = m => console.log('✓', m); 
  await p.goto(B + '/app'); await p.getByRole('button', { name: 'Restablecer' }).click(); await p.waitForLoadState('networkidle');

  // 1. Cliente acepta COT-0004 (Textiles, sin 170)
  await p.goto(B + '/c/demo-q-4-enlace');
  await p.getByLabel(/Acepto la cotización/).check();
  await p.getByRole('button', { name: 'Aceptar cotización' }).click();
  await p.getByText('Conocimiento del cliente · Circular 170').waitFor();
  paso('aceptación → se pide el formulario 170');
  const f = { domicilio: 'Cra 50 # 10-20', ciudad: 'Rionegro', actividadEconomica: 'Fabricación textil', capitalSocial: '500000000', origenRecursos: 'Ventas', entidadFinanciera: 'Bancolombia, Rionegro', rlNombre: 'Mateo Zapata', rlDocumento: 'CC 1.036.000.000', beneficiarios: 'Accionistas', razonSocial: 'Textiles Rionegro SAS', nit: '900.777.888-9', firma: 'Mateo Zapata' };
  for (const [k, v] of Object.entries(f)) await p.locator(`[name=${k}]`).fill(v);
  await p.locator('[name=autorizaDatos]').check();
  await p.getByRole('button', { name: 'Firmar y enviar' }).click();
  await p.getByText(/Formulario enviado|Formulario en revisión/).first().waitFor(); paso('formulario 170 enviado');

  // 2. Diego intenta abrir DO → bloqueado
  await p.goto(B + '/app/cotizaciones/q-4');
  await p.getByText('Falta la Circular 170 del cliente').waitFor(); paso('DO bloqueado sin 170 aprobada');

  // 3. Camila (cumplimiento) aprueba
  await p.goto(B + '/app/cumplimiento');
  await p.selectOption('select[name=usuario]', 'u-camila'); await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForLoadState('networkidle');
  const tarjeta = p.locator('li', { hasText: 'Textiles Rionegro SAS' }).first();
  await tarjeta.getByRole('button', { name: 'Aprobar' }).click();
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(800);
  paso('Cumplimiento aprobó');

  // 4. Diego abre DO
  await p.selectOption('select[name=usuario]', 'u-diego'); await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForLoadState('networkidle');
  await p.goto(B + '/app/cotizaciones/q-4');
  await p.getByRole('button', { name: 'Abrir DO' }).click();
  await p.waitForURL(/\/app\/operaciones\//);
  console.log('✓ DO abierto:', await p.locator('h1').innerText());
  await p.getByText('Bienvenido a su operación').waitFor(); paso('correo de bienvenida en trazabilidad');

  // 5. Marcar hito y notificar
  await p.getByRole('button', { name: 'Carga lista', exact: true }).click();
  await p.getByRole('button', { name: 'Enviar al cliente' }).click();
  await p.getByText('Enviado y registrado').waitFor(); paso('novedad enviada al cliente');

  // 6. Duplicar COT-0001 para otro cliente
  await p.goto(B + '/app/cotizaciones/q-1');
  await p.getByLabel('Cliente destino').selectOption('t-muebles');
  await p.getByRole('button', { name: 'Duplicar' }).click();
  await p.waitForURL(/editar\?duplicada/);
  await p.getByText(/Cotización duplicada de COT/).waitFor();
  console.log('✓ duplicada; cliente =', await p.getByLabel('Cliente o prospecto').evaluate(s => s.options[s.selectedIndex].text));
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await p.waitForURL(/\/app\/cotizaciones\/[^/]+$/);
  paso('duplicado guardado: ' + (await p.locator('h1').innerText()).replace(/\n/g, ' '));

  // 7. Enviar borrador → enlace
  await p.getByRole('button', { name: 'Enviar al cliente' }).click();
  await p.getByText(/enlace seguro de aceptación/i).waitFor(); paso('enviada con enlace');
  // 8. Nueva cotización
  await p.goto(B + '/app/cotizaciones/nueva');
  await p.getByLabel('Cliente o prospecto').selectOption('t-agro');
  await p.getByPlaceholder('Ningbo, China').fill('Miami (MIA)');
  await p.getByPlaceholder('Rionegro, Antioquia').fill('Rionegro (MDE)');
  await p.getByPlaceholder('Maquinaria agrícola').fill('Repuestos');
  await p.getByLabel('Descripción', { exact: true }).last().fill('Flete aéreo MIA → MDE');
  
  await p.getByRole('button', { name: 'Crear cotización' }).click();
  await p.waitForURL(/\/app\/cotizaciones\/[^/]+$/); paso('cotización nueva creada');
  if (errs.length) { console.error('errores de página:', errs); process.exitCode = 1; }
  await b.close();
})().catch(async e => { process.exitCode = 1;  console.error('FALLO', e.message.split('\n')[0]); process.exit(1); });
