// Prueba de punta a punta de la factura electrónica en modo demo:
// prefactura en USD → TRM de referencia → confirmar → emitida (simulada) con
// CUFE, PDF de LOGIKS en dólares y envío al cliente.
// Uso: npm run dev (en otra terminal) y luego  BASE_URL=... node e2e/facturacion-electronica.cjs
// eslint-disable-next-line @typescript-eslint/no-require-imports -- script CommonJS
const { chromium } = require('playwright');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- script CommonJS
const fs = require('node:fs');
const B = process.env.BASE_URL ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA;

let pagina;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  pagina = p;
  p.setDefaultTimeout(15000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const paso = (m) => console.log('✓', m);
  const foto = async (n) => SALIDA && p.screenshot({ path: `${SALIDA}/${n}.png`, fullPage: true });

  await p.goto(B + '/app');
  await p.getByRole('button', { name: 'Restablecer' }).click();
  await p.waitForLoadState('networkidle');

  // 1. La cotización pide los datos de Finppi.
  await p.goto(B + '/app/cotizaciones/nueva');
  await p.getByRole('heading', { name: 'Facturación electrónica' }).waitFor();
  await p.getByLabel('Cliente o prospecto').selectOption({ label: 'Agroindustrias del Oriente SAS' });
  await p.getByText(/Faltan \d+ datos? para Finppi/).waitFor();
  paso('la cotización muestra los datos que faltan para Finppi');
  await p.getByRole('button', { name: 'Completar' }).click();
  const d = p.locator('dialog[open]');
  await d.locator('[name=ciudad]').fill('RIONEGRO / Antioquia');
  await d.locator('[name=direccion]').fill('Km 2 vía Llanogrande');
  await d.locator('[name=celular]').fill('3001112233');
  await d.locator('[name=telefono]').fill('6045551111');
  await d.getByRole('button', { name: 'Guardar datos fiscales' }).click();
  await p.getByText('Cliente listo para factura electrónica').waitFor();
  paso('datos fiscales completados desde la cotización');
  await foto('1-cotizacion');

  // 2. Contabilidad genera la prefactura en USD de Flores La Montaña.
  await p.selectOption('select[name=usuario]', 'u-julian');
  await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForTimeout(2500);
  await p.goto(B + '/app/facturacion');
  const grupo = p.locator('div', { has: p.getByText('Flores La Montaña SAS', { exact: true }) }).filter({ has: p.getByRole('button', { name: /Generar prefactura/ }) }).last();
  await grupo.getByRole('button', { name: /Generar prefactura/ }).click();
  await p.waitForURL(/\/app\/facturacion\/[0-9a-f-]{36}$/);
  await p.getByText('Unitario COP').waitFor();
  paso('prefactura en USD con columna COP');

  // 3. TRM de referencia manual → vista USD → COP.
  await p.locator('[name=trmReferencia]').fill('4012.37');
  await p.getByRole('button', { name: 'Guardar condiciones' }).click();
  await p.getByText('Condiciones guardadas').waitFor();
  await p.getByText('TRM 4.012,37').first().waitFor();
  paso('TRM de referencia aplicada');
  await foto('2-prefactura');

  // 4a. Modo prueba (por defecto): el bot pulsa «Guardar» en Finppi.
  const facturaUrl = p.url();
  await p.getByRole('button', { name: 'Emitir factura electrónica' }).click();
  let m = p.locator('dialog[open]');
  await m.getByText('Va a la DIAN en').waitFor();
  await m.getByLabel(/Entiendo/).check();
  await m.getByRole('button', { name: 'Guardar en Finppi (prueba)' }).click();
  await p.getByText('Prueba: guardada en Finppi como borrador').waitFor();
  paso('modo prueba: guardada como borrador en Finppi, sin DIAN');
  await foto('3b-prueba');
  await p.getByRole('button', { name: 'Descartar prueba' }).click();
  await p.getByRole('button', { name: /Seguro\? Vuelve a prefactura/ }).click();
  await p.getByRole('button', { name: 'Emitir factura electrónica' }).waitFor();
  paso('prueba descartada: vuelve a prefactura');

  // 4b. El Administrador pasa a modo real.
  await p.selectOption('select[name=usuario]', 'u-diego');
  await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForTimeout(2500);
  await p.goto(B + '/app/configuracion/facturacion-electronica');
  await p.getByRole('radio', { name: /Real/ }).click();
  await p.getByRole('button', { name: 'Sí, pasar a real' }).click();
  await p.getByText('Modo real: las facturas irán a la DIAN').waitFor();
  paso('modo real activado');
  await p.selectOption('select[name=usuario]', 'u-julian');
  await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForTimeout(2500);
  await p.goto(facturaUrl);

  // 4c. Un clic: confirmar y emitir.
  await p.getByRole('button', { name: 'Emitir factura electrónica' }).click();
  m = p.locator('dialog[open]');
  await m.getByText('Va a la DIAN en').waitFor();
  await foto('3-confirmar');
  await m.getByLabel(/Entiendo/).check();
  await m.getByRole('button', { name: 'Emitir ahora' }).click();
  await p.getByText('Factura electrónica (simulada)').waitFor();
  await p.getByText('SETT1').first().waitFor();
  paso('emitida SETT1 con CUFE (simulación demo)');
  await foto('4-emitida');

  // 5. PDF de LOGIKS en dólares.
  const id = p.url().split('/').pop();
  const r = await p.request.get(`${B}/app/facturacion/${id}/pdf`);
  if (r.status() !== 200 || r.headers()['content-type'] !== 'application/pdf') throw new Error('PDF no disponible');
  if (SALIDA) fs.writeFileSync(`${SALIDA}/factura.pdf`, await r.body());
  paso('PDF de la factura generado');

  // 5b. El usuario elige qué monedas ve el cliente (por defecto solo USD).
  for (const [boton, nombre] of [['USD y COP', 'ambas'], ['Solo COP', 'cop'], ['Solo USD', 'usd']]) {
    await p.getByRole('radio', { name: new RegExp(boton) }).click();
    await p.getByRole('radio', { name: new RegExp(boton), checked: true }).waitFor();
    await p.waitForTimeout(800);
    const x = await p.request.get(`${B}/app/facturacion/${id}/pdf`);
    if (x.status() !== 200) throw new Error('PDF ' + nombre);
    if (SALIDA) fs.writeFileSync(`${SALIDA}/factura-${nombre}.pdf`, await x.body());
  }
  paso('presentación: solo USD, USD y COP, solo COP');

  // 6. Enviada al cliente (queda en su trazabilidad).
  await p.getByText(/Enviada al cliente/).waitFor();
  await p.getByRole('button', { name: 'Reenviar al cliente' }).click();
  await p.getByText(/Registrada para|Enviada a/).waitFor();
  paso('enviada al cliente');

  // 7. Configuración muestra el siguiente consecutivo.
  await p.selectOption('select[name=usuario]', 'u-diego');
  await p.getByRole('button', { name: 'Ver como' }).first().click();
  await p.waitForTimeout(2500);
  await p.goto(B + '/app/configuracion/facturacion-electronica');
  await p.getByText('SETT2').waitFor();
  paso('la conexión muestra la próxima factura SETT2');
  await foto('5-configuracion');

  if (errs.length) throw new Error('Errores en la página: ' + errs.join(' | '));
  console.log('\nTodo bien.');
  await b.close();
})().catch(async (e) => {
  console.error('✗', e.message.split('\n')[0]);
  if (SALIDA && pagina) await pagina.screenshot({ path: `${SALIDA}/error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
