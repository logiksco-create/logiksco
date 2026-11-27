// worker/einvoice-bot/src/adapters/finppi/selectors.ts
// Extraído en vivo de app.finppi.com (nov 2026). ÚNICO lugar permitido para selectores.
// Si Finppi cambia, se corrige aquí y se sube ADAPTER_VERSION.
// Los id react-select-N-input CAMBIAN en cada carga: nunca fijarlos.

export const ADAPTER_VERSION = '2026.11.27-1';

export const URLS = {
  login: 'https://app.finppi.com/',
  list: 'https://app.finppi.com/income/invoice', // factura, NC y ND comparten ruta
  products: 'https://app.finppi.com/products',
};

// El modo vive en localStorage -> persist:root -> invoice.view
export const MODE = { invoice: 'default', creditNote: 'creditNote', debitNote: 'debitNote' } as const;
export const PAGE_TITLE = {
  invoice: 'Factura de venta',
  creditNote: 'Nota de crédito',
  debitNote: 'Nota de débito',
};

export const LOGIN = {
  email: 'input[placeholder="Email"]',
  password: 'input[placeholder="Contraseña"]',
  submit: 'button[type="submit"]:has-text("Ingresar")',
};

export const MENU = {
  incomeCategory: '.sidebar__category:has-text("Ingresos")',
  // con el menú colapsado: clic en el icono de Ingresos y luego en el texto
  invoices: 'text="Facturas de venta"',
  creditNotes: 'text="Notas crédito"',
  debitNotes: 'text="Notas débito"',
};

export const LIST = {
  createBtn: 'main button.btn:has-text("Crear")',
  search: 'input.table__search-input',
  resultsText: 'text=/\\d+ resultados? encontrados?/',
  rows: 'main tbody tr',
  // columnas: 0 #, 1 Prefijo, 2 Nota, 3 Cliente, 4 Fecha, 5 Estado, 6 Total, 7 Opciones
  // iconos en Opciones (orden fijo): 0 XML, 1 PDF, 2 Duplicar (NO USAR), 3 Reenviar (NO USAR)
  optionIcon: { xml: 0, pdf: 1 },
  statusAccepted: 'Aceptada',
  statusDraft: 'Borrador',
};

export const FORM = {
  clientId: 'input[name="clientnationalID"]',
  clientAddress: 'input[name="clientaddress"]',
  clientPhone: 'input[name="clientnumber"]',
  seller: 'input[name="seller"]',
  date: 'input[name="date"]',
  expiration: 'input[name="expiration"]',
  orderId: 'input[name="orderID"]',
  item: (n: number) => ({
    description: `input[name="items.${n}.comment"]`,
    unitPrice: `input[name="items.${n}.unitPrice"]`,
    quantity: `input[name="items.${n}.quantity"]`,
    discountPct: `input[name="items.${n}.discountPercentage"]`,
  }),
  newClientBtn: '#TooltipSearchInvoice-newCliente',
  resolutionsBtn: '#TooltipSearchInvoice-resolutions',
  send: 'button[type="submit"]:has-text("Enviar")', // PUNTO DE NO RETORNO
  save: 'button[type="submit"]:has-text("Guardar")', // no usar en el flujo de emisión
  // Presentes SOLO en modo nota:
  noteNumberLabel: 'text="Número de Nota"',
  noteConceptLabel: 'text="Concepto de Nota"',
};

// react-select: localizar por etiqueta visible, no por id.
export const SELECT_LABELS = {
  number: 'Número',
  invoiceType: 'Tipo de factura',
  currency: 'Moneda',
  client: 'Cliente',
  paymentType: 'Tipo de pago',
  operationType: 'Tipo de operación',
  paymentMethod: 'Método de pago',
  noteNumber: 'Número de Nota',
  noteConcept: 'Concepto de Nota',
  reteIva: 'Rete IVA',
  reteIca: 'Rete ICA',
};
// Verificado en vivo (27-nov-2026): cada react-select del formulario trae un
// <input type="hidden" name="…"> estable. Es la forma preferida de ubicarlos.
export const SELECT_NAMES = {
  number: 'invoiceNumber',
  invoiceType: 'national',
  currency: 'currency',
  client: 'invoiceClientId',
  paymentType: 'paymentWay',
  operationType: 'invoiceOperationTypeId',
  paymentMethod: 'invoicePaymentMethodId',
  reteIva: 'reteIVA',
  reteIca: 'reteICA',
} as const;
export const ITEM_SELECT_NAMES = (n: number) => ({
  product: `items.${n}.productServiceID`,
  withholding: `items.${n}.retentionPercentage`,
  vat: `items.${n}.vatPercentage`,
  inc: `items.${n}.incPercentage`,
});
/** Control del react-select cuyo input oculto tiene ese name. */
export const SELECT_BY_NAME = (name: string) => `[class*="-container"]:has(> input[name="${name}"]) [class*="-control"]`;
/** Etiquetas visibles: en Finppi son <span class="form__form-group-label">, no <label>. */
export const LABEL_TAGS = ['span.form__form-group-label', 'label'];

// Selects dentro de la tabla de ítems (por orden de columna): Producto, Retención, IVA, INC
export const ITEM_SELECT_ORDER = ['product', 'withholding', 'vat', 'inc'] as const;
export const REACT_SELECT = {
  control: '[class*="-control"]',
  option: '[id^="react-select-"][id*="-option-"]',
};

export const TOTALS_LABELS = [
  'Subtotal', 'Descuento detalle (-)', 'Descuentos globales (-)', 'Subtotal base gravable',
  'INC (+)', 'IVA (+)', 'Retención en la Fuente (-)', 'Rete IVA (-)', 'Rete ICA (-)', 'Total',
]; // si algún valor contiene "NaN" => VALUES_MISMATCH

export const CLIENT_PANEL = {
  nationalId: 'input[name="nationalID"]',
  name: 'input[name="name"]',
  lastname: 'input[name="lastname"]',
  email: 'input[name="contacts[0].email"]',
  phone: 'input[name="contacts[0].phoneNumber.number"]',
  locationName: 'input[name="locations.0.name"]',
  address1: 'input[name="locations.0.address.address_line1"]',
  address2: 'input[name="locations.0.address.address_line2"]',
  submit: 'button[type="submit"]:has-text("Crear")',
  selectLabels: {
    personType: 'Tipo de persona', docType: 'Tipo de documento', regime: 'Régimen',
    fiscalResponsibility: 'Responsabilidad fiscal', country: 'País', city: 'Ciudad',
  },
};

// ---- Clientes (/customers) ----
export const CUSTOMERS_LIST = {
  url: 'https://app.finppi.com/customers',
  search: 'input[placeholder="Buscar cliente..."]', // SÍ filtra por identificación (comprobado)
  createBtn: 'main button:has-text("Crear")',
  // columnas: 0 #, 1 Nombre, 2 Identificacion, 3 Teléfono, 4 Email, 5 Opciones (ver / eliminar -> NUNCA usar eliminar)
  rows: 'main tbody tr',
};

// ---- Productos (/products y /products/edit) ----
export const PRODUCTS_LIST = {
  url: 'https://app.finppi.com/products',
  createBtn: 'main button:has-text("Crear")',
  // columnas: 0 #, 1 Nombre, 2 Código, 3 Tipo, 4 Precio, 5 Descripción, 6 Opciones
  rows: 'main tbody tr',
};
export const PRODUCT_FORM = {
  name: 'input[name="name"]',
  code: 'input[name="code"]',
  description: 'textarea[name="description"]',
  priceName: (i: number) => `input[name="prices[${i}].name"]`,
  priceValue: (i: number) => `input[name="prices.${i}.value"]`,
  addPriceBtn: 'button:has-text("Agregar precio")',
  taxIncludedToggle: 'button:has-text("Impuesto incluido")', // leer estado antes de guardar
  submit: 'button[type="submit"]:has-text("Crear")', // PUNTO DE NO RETORNO
  // react-select por etiqueta: 'Tipo de ítem' (Producto|Servicio), 'Unidad de medida' (1094 opciones, def. 'Unidad'), 'IVA' (def. IVA-0), 'INC'
  selectLabels: { type: 'Tipo de ítem', unit: 'Unidad de medida', vat: 'IVA', inc: 'INC' },
};

// ---- Healthcheck rápido (§9D) ----
// Etapa A: login -> menú Ingresos > Facturas de venta -> Crear -> leer cabecera (razón social, NIT)
//          y la única opción del desplegable "Número" (= próximo consecutivo) -> salir SIN guardar.
// Etapa B: Notas crédito > Crear: opciones de "Número de Nota"; Notas débito > Crear: ¿vacío?;
//          opciones IVA/Retención/Rete IVA/Rete ICA; conteos "1 al N de N" en /customers y /products.
// Al terminar: restablecer invoice.view = 'default' (entrando por Ingresos > Facturas de venta) y cerrar sesión.
export const PAGINATION_TEXT = /\d+ al? \d+ de (\d+)/;
