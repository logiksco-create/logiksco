import type {
  Comunicacion,
  Concepto,
  Cotizacion,
  Datos170,
  Empresa,
  Factura,
  Formulario170,
  Operacion,
  Tercero,
  Usuario,
} from "@/domain/types";
import { HITOS_POR_TIPO } from "@/domain/operacion";
import { fechaLegible, hoyISO, sumarDias, sumarMeses } from "@/domain/fechas";

/**
 * Datos de demostración basados en el flujo del piloto (Oikor Colombia SAS).
 * Las fechas son relativas a hoy para que las alertas siempre tengan sentido.
 * Los NIT y personas de los clientes son ficticios.
 */

export interface EstadoDemo {
  empresa: Empresa;
  usuarios: Usuario[];
  terceros: Tercero[];
  cotizaciones: Cotizacion[];
  formularios: Formulario170[];
  operaciones: Operacion[];
  comunicaciones: Comunicacion[];
  secuencias: { cotizacion: number; do: number };
  archivos: ArchivoDemo[];
  facturas: Factura[];
  llaveMegafoco?: string;
  accesosPortal: { terceroId: string; usuarioId: string; nombre: string; correo: string }[];
}

export interface ArchivoDemo {
  id: string;
  clase: "do" | "170";
  entidadId: string;
  tipo: string;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEl: string;
  bytes: Uint8Array;
}

export function crearSemilla(hoy = hoyISO()): EstadoDemo {
  const d = (n: number) => sumarDias(hoy, n);
  const anio = Number(hoy.slice(0, 4));

  const empresa: Empresa = {
    id: "emp-oikor",
    nit: "901.456.789-1",
    razonSocial: "Oikor Colombia SAS",
    ciudad: "Rionegro, Antioquia",
    colorPrimario: "#3b5bfd",
    prefijoCotizacion: "COT",
    prefijoDO: "OIK",
    vigencia170Meses: 12,
    bloquearDOSin170: true,
  };

  const usuarios: Usuario[] = [
    { id: "u-diego", nombre: "Diego Restrepo", correo: "diego@oikor.co", roles: ["admin", "comercial"] },
    { id: "u-daniela", nombre: "Daniela Gómez", correo: "daniela@oikor.co", roles: ["operaciones"] },
    { id: "u-camila", nombre: "Camila Ríos", correo: "camila@oikor.co", roles: ["cumplimiento"] },
    { id: "u-julian", nombre: "Julián Mejía", correo: "julian@oikor.co", roles: ["contabilidad"] },
  ];

  const t = (
    id: string,
    tipo: Tercero["tipo"],
    nit: string,
    razonSocial: string,
    ciudad: string,
    contacto?: [string, string, string],
    acuerdo?: Tercero["acuerdo"],
  ): Tercero => ({
    id,
    empresaId: empresa.id,
    tipo,
    nit,
    razonSocial,
    ciudad,
    contactos: contacto
      ? [{ id: `${id}-k1`, nombre: contacto[0], cargo: contacto[1], correo: contacto[2], telefono: "+57 300 000 0000" }]
      : [],
    acuerdo,
  });

  const corteCercano = Math.min(28, Number(hoy.slice(8, 10)) + 1);

  const terceros: Tercero[] = [
    t("t-agro", "cliente", "900.111.222-3", "Agroindustrias del Oriente SAS", "Rionegro", ["Laura Ospina", "Jefe de comercio exterior", "laura@agrooriente.co"], { diaCorte: 25, plazoPagoDias: 30, moneda: "COP" }),
    t("t-flores", "cliente", "800.333.444-5", "Flores La Montaña SAS", "La Ceja", ["Andrés Vélez", "Gerente de exportaciones", "andres@floreslamontana.co"], { diaCorte: corteCercano, plazoPagoDias: 15, moneda: "USD" }),
    t("t-muebles", "cliente", "901.555.666-7", "Muebles Antioquia SAS", "Envigado", ["Sara Londoño", "Compras internacionales", "sara@mueblesantioquia.co"], { diaCorte: 30, plazoPagoDias: 45, moneda: "COP" }),
    t("t-textiles", "cliente", "900.777.888-9", "Textiles Rionegro SAS", "Rionegro", ["Mateo Zapata", "Director de logística", "mateo@textilesrionegro.co"], { diaCorte: 20, plazoPagoDias: 30, moneda: "COP" }),
    t("t-tecno", "prospecto", "901.999.000-1", "Tecnomédica Andina SAS", "Medellín", ["Valentina Arango", "Gerente general", "valentina@tecnomedica.co"]),
    t("p-maersk", "proveedor", "860.000.001-1", "Maersk Line Colombia", "Cartagena"),
    t("p-avianca", "proveedor", "860.000.002-2", "Avianca Cargo", "Rionegro"),
    t("p-retiro", "proveedor", "860.000.003-3", "Transportes El Retiro SAS", "El Retiro"),
    t("p-ningbo", "proveedor", "CN-91330200", "Ningbo Global Logistics", "Ningbo"),
    t("p-agencia", "proveedor", "860.000.004-4", "Agencia de Aduanas Nexo SAS", "Medellín"),
  ];

  let cid = 0;
  const c = (p: Partial<Concepto> & Pick<Concepto, "bloque" | "descripcion" | "costoUnitario" | "ventaUnitaria">): Concepto => ({
    id: `c-${++cid}`,
    moneda: "USD",
    unidad: "embarque",
    cantidad: 1,
    ...p,
  });

  const fclConceptos = (vigFlete: string): Concepto[] => [
    c({ bloque: "origen", descripcion: "Gastos en origen (THC, documentación)", proveedorId: "p-ningbo", proveedorNombre: "Ningbo Global Logistics", costoUnitario: 320, ventaUnitaria: 380, vigenciaTarifa: d(40) }),
    c({ bloque: "flete", descripcion: "Flete marítimo 40HC Ningbo → Cartagena", proveedorId: "p-maersk", proveedorNombre: "Maersk Line Colombia", unidad: "contenedor", cantidad: 2, costoUnitario: 2850, ventaUnitaria: 3250, vigenciaTarifa: vigFlete }),
    c({ bloque: "destino", descripcion: "Gastos en destino (liberación BL, THC)", proveedorId: "p-maersk", proveedorNombre: "Maersk Line Colombia", moneda: "COP", unidad: "contenedor", cantidad: 2, costoUnitario: 1_150_000, ventaUnitaria: 1_150_000, paraTerceros: true }),
    c({ bloque: "terrestre", descripcion: "Transporte Cartagena → Rionegro", proveedorId: "p-retiro", proveedorNombre: "Transportes El Retiro SAS", moneda: "COP", unidad: "contenedor", cantidad: 2, costoUnitario: 5_400_000, ventaUnitaria: 6_200_000, vigenciaTarifa: d(30) }),
    c({ bloque: "aduana", descripcion: "Agenciamiento aduanero", proveedorId: "p-agencia", proveedorNombre: "Agencia de Aduanas Nexo SAS", moneda: "COP", costoUnitario: 900_000, ventaUnitaria: 1_250_000 }),
  ];

  const aereoConceptos = (): Concepto[] => [
    c({ bloque: "origen", descripcion: "Manejo en finca y documentación", moneda: "COP", costoUnitario: 180_000, ventaUnitaria: 260_000 }),
    c({ bloque: "flete", descripcion: "Flete aéreo MDE → MIA", proveedorId: "p-avianca", proveedorNombre: "Avianca Cargo", unidad: "kg", cantidad: 1200, costoUnitario: 1.45, ventaUnitaria: 1.78, vigenciaTarifa: d(6) }),
    c({ bloque: "otros", descripcion: "Certificado fitosanitario ICA", moneda: "COP", costoUnitario: 95_000, ventaUnitaria: 95_000, paraTerceros: true }),
  ];

  const terminos =
    "Tarifas sujetas a disponibilidad de espacio y equipo. No incluye impuestos, almacenajes ni demoras. Valores en USD se liquidan a la TRM del día de facturación.";

  const q = (p: Partial<Cotizacion> & Pick<Cotizacion, "id" | "consecutivo" | "clienteId" | "estado" | "conceptos">): Cotizacion => ({
    empresaId: empresa.id,
    version: 1,
    comercialId: "u-diego",
    tipoServicio: "maritimo_fcl",
    incoterm: "FOB",
    origen: "Ningbo, China",
    destino: "Rionegro, Antioquia",
    mercancia: { descripcion: "Maquinaria agrícola", piezas: 24, pesoKg: 18_400, volumenM3: 132, contenedores: [{ tipo: "40HC", cantidad: 2 }] },
    trm: 3985,
    monedaPresentacion: "COP",
    fechaEmision: d(-10),
    vigenteHasta: d(5),
    terminos,
    tokenPublico: `demo-${p.id}-enlace`,
    historial: [{ fecha: `${d(-10)}T14:00:00.000Z`, usuario: "Diego Restrepo", accion: "Creada" }],
    contactoId: `${p.clienteId}-k1`,
    ...p,
  });

  const C = (n: number) => `COT-${anio}-${String(n).padStart(4, "0")}`;

  const cotizaciones: Cotizacion[] = [
    q({ id: "q-1", consecutivo: C(1), clienteId: "t-agro", estado: "aceptada", conceptos: fclConceptos(d(3)), fechaEmision: d(-28), vigenteHasta: d(-13) }),
    q({ id: "q-2", consecutivo: C(2), clienteId: "t-flores", estado: "aceptada", tipoServicio: "aereo", incoterm: "FCA", origen: "Rionegro (MDE)", destino: "Miami (MIA)", mercancia: { descripcion: "Flores frescas cortadas", piezas: 80, pesoKg: 1200, volumenM3: 7.2 }, conceptos: aereoConceptos(), monedaPresentacion: "USD", fechaEmision: d(-20), vigenteHasta: d(-12) }),
    q({ id: "q-3", consecutivo: C(3), clienteId: "t-muebles", estado: "aceptada", tipoServicio: "maritimo_lcl", origen: "Shanghái, China", destino: "Envigado, Antioquia", mercancia: { descripcion: "Herrajes y componentes para muebles", piezas: 40, pesoKg: 3200, volumenM3: 14 }, conceptos: fclConceptos(d(60)).map((x) => (x.bloque === "flete" ? { ...x, descripcion: "Flete LCL Shanghái → Cartagena", unidad: "m3", cantidad: 14, costoUnitario: 62, ventaUnitaria: 85 } : x)), fechaEmision: d(-40), vigenteHasta: d(-30) }),
    q({ id: "q-4", consecutivo: C(4), clienteId: "t-textiles", estado: "vista", conceptos: fclConceptos(d(25)), mercancia: { descripcion: "Telares industriales", piezas: 6, pesoKg: 21_000, volumenM3: 118, contenedores: [{ tipo: "40HC", cantidad: 2 }] }, fechaEmision: d(-6), vigenteHasta: d(2), historial: [{ fecha: `${d(-6)}T15:00:00.000Z`, usuario: "Diego Restrepo", accion: "Creada" }, { fecha: `${d(-6)}T15:10:00.000Z`, usuario: "Diego Restrepo", accion: "Enviada a mateo@textilesrionegro.co" }, { fecha: `${d(-5)}T13:22:00.000Z`, usuario: "Cliente", accion: "Abierta por el cliente" }] }),
    q({ id: "q-5", consecutivo: C(5), clienteId: "t-tecno", estado: "enviada", tipoServicio: "aereo", incoterm: "EXW", origen: "Hamburgo (HAM)", destino: "Rionegro (MDE)", mercancia: { descripcion: "Equipos médicos", piezas: 12, pesoKg: 640, volumenM3: 4.1 }, conceptos: aereoConceptos().map((x) => (x.bloque === "flete" ? { ...x, descripcion: "Flete aéreo HAM → MDE", cantidad: 640, costoUnitario: 3.9, ventaUnitaria: 4.6 } : x)), fechaEmision: d(-3), vigenteHasta: d(12) }),
    q({ id: "q-6", consecutivo: C(6), clienteId: "t-agro", estado: "borrador", tipoServicio: "terrestre", incoterm: "DAP", origen: "Buenaventura", destino: "Rionegro, Antioquia", mercancia: { descripcion: "Fertilizantes en big bags", piezas: 40, pesoKg: 32_000, volumenM3: 48 }, conceptos: [c({ bloque: "terrestre", descripcion: "Tractomula Buenaventura → Rionegro", proveedorId: "p-retiro", proveedorNombre: "Transportes El Retiro SAS", moneda: "COP", unidad: "embarque", cantidad: 2, costoUnitario: 6_800_000, ventaUnitaria: 7_900_000, vigenciaTarifa: d(20) })], fechaEmision: d(0), vigenteHasta: d(15) }),
    q({ id: "q-7", consecutivo: C(7), clienteId: "t-muebles", estado: "rechazada", conceptos: fclConceptos(d(-5)), fechaEmision: d(-35), vigenteHasta: d(-20) }),
    q({ id: "q-8", consecutivo: C(8), clienteId: "t-flores", estado: "aceptada", tipoServicio: "aereo", incoterm: "FCA", origen: "Rionegro (MDE)", destino: "Ámsterdam (AMS)", mercancia: { descripcion: "Hortensias", piezas: 60, pesoKg: 900, volumenM3: 5.4 }, conceptos: aereoConceptos().map((x) => (x.bloque === "flete" ? { ...x, descripcion: "Flete aéreo MDE → AMS", cantidad: 900, costoUnitario: 2.4, ventaUnitaria: 2.95 } : x)), monedaPresentacion: "USD", fechaEmision: d(-15), vigenteHasta: d(-5) }),
  ];

  const datos = (tr: Tercero): Datos170 => ({
    razonSocial: tr.razonSocial,
    nit: tr.nit,
    domicilio: "Calle 50 # 40-20",
    ciudad: tr.ciudad,
    actividadEconomica: "Comercio al por mayor",
    capitalSocial: 850_000_000,
    origenRecursos: "Actividad comercial ordinaria",
    formaPago: "Transferencia electrónica",
    entidadFinanciera: "Bancolombia, Medellín",
    representantes: [{ nombre: tr.contactos[0]?.nombre ?? "", documento: "CC 43.000.000", cargo: "Representante legal" }],
    beneficiarios: "Accionistas registrados en cámara de comercio",
    esPEP: false,
    autorizaDatos: true,
  });

  const T = (id: string) => terceros.find((x) => x.id === id)!;
  const f = (id: string, terceroId: string, aprobadoEl: string, extra: Partial<Formulario170> = {}): Formulario170 => ({
    id,
    empresaId: empresa.id,
    terceroId,
    version: 1,
    estado: "aprobado",
    diligenciadoEl: `${sumarDias(aprobadoEl, -2)}T16:00:00.000Z`,
    aprobadoEl,
    vigenteHasta: sumarMeses(aprobadoEl, 12),
    revisor: "Camila Ríos",
    datos: datos(T(terceroId)),
    ...extra,
  });

  const formularios: Formulario170[] = [
    f("f-agro", "t-agro", d(-120)),
    f("f-flores", "t-flores", sumarMeses(d(12), -12)),
    f("f-muebles", "t-muebles", sumarMeses(d(-8), -12)),
    { ...f("f-muebles-2", "t-muebles", d(0)), version: 2, estado: "en_revision", aprobadoEl: undefined, vigenteHasta: undefined, revisor: undefined, diligenciadoEl: `${d(-1)}T18:30:00.000Z` },
  ];

  const hitos = (tipo: Operacion["tipo"], fechas: Record<string, { e?: string; r?: string }>) =>
    HITOS_POR_TIPO[tipo].map((nombre, i) => ({
      id: `h-${tipo}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      nombre,
      estimada: fechas[nombre]?.e,
      real: fechas[nombre]?.r,
    }));

  const O = (n: number) => `OIK-${anio}-${String(n).padStart(4, "0")}`;
  const deQ = (id: string) => cotizaciones.find((x) => x.id === id)!;

  const operaciones: Operacion[] = [
    {
      id: "o-1", empresaId: empresa.id, consecutivo: O(1), cotizacionId: "q-1", clienteId: "t-agro", responsableId: "u-daniela",
      tipo: "maritimo_fcl", origen: "Ningbo, China", destino: "Rionegro, Antioquia", estado: "abierto", abiertoEl: d(-12), trm: 3985,
      conceptos: deQ("q-1").conceptos,
      // La tarifa del flete vence en 3 días, pero el booking quedó para dentro de 7: alerta RF-30.
      hitos: hitos("maritimo_fcl", { "Carga lista": { e: d(-1), r: d(-1) }, Booking: { e: d(7) }, ETD: { e: d(9) }, ETA: { e: d(42) } }),
    },
    {
      id: "o-2", empresaId: empresa.id, consecutivo: O(2), cotizacionId: "q-2", clienteId: "t-flores", responsableId: "u-daniela",
      tipo: "aereo", origen: "Rionegro (MDE)", destino: "Miami (MIA)", estado: "en_transito", abiertoEl: d(-9), trm: 3985,
      conceptos: deQ("q-2").conceptos,
      hitos: hitos("aereo", { "Carga lista": { e: d(-4), r: d(-4) }, Booking: { e: d(-4), r: d(-4) }, ETD: { e: d(-2), r: d(-2) }, Salida: { e: d(-2), r: d(-2) }, ETA: { e: d(1) } }),
      costosReales: {},
    },
    {
      id: "o-3", empresaId: empresa.id, consecutivo: O(3), cotizacionId: "q-3", clienteId: "t-muebles", responsableId: "u-daniela",
      tipo: "maritimo_lcl", origen: "Shanghái, China", destino: "Envigado, Antioquia", estado: "en_destino", abiertoEl: d(-35), trm: 3985,
      conceptos: deQ("q-3").conceptos,
      hitos: hitos("maritimo_lcl", { "Carga lista": { e: d(-33), r: d(-32) }, Booking: { e: d(-31), r: d(-31) }, ETD: { e: d(-28), r: d(-27) }, Salida: { e: d(-27), r: d(-27) }, ETA: { e: d(-3), r: d(-2) }, Arribo: { e: d(-2), r: d(-2) }, "Desconsolidación": { e: d(-1) }, "Nacionalización": { e: d(2) } }),
    },
    {
      id: "o-4", empresaId: empresa.id, consecutivo: O(4), cotizacionId: "q-8", clienteId: "t-flores", responsableId: "u-daniela",
      tipo: "aereo", origen: "Rionegro (MDE)", destino: "Ámsterdam (AMS)", estado: "entregado", abiertoEl: d(-14), trm: 3985,
      conceptos: deQ("q-8").conceptos,
      hitos: hitos("aereo", { "Carga lista": { r: d(-12) }, Booking: { r: d(-12) }, ETD: { r: d(-11) }, Salida: { r: d(-11) }, ETA: { r: d(-10) }, Arribo: { r: d(-10) }, "Nacionalización": { r: d(-8) }, Entrega: { r: d(-7) } }),
    },
  ];

  const comunicaciones: Comunicacion[] = [
    { id: "m-1", empresaId: empresa.id, entidad: "operacion", entidadId: "o-1", direccion: "saliente", asunto: `Bienvenido a su operación ${O(1)}`, para: ["laura@agrooriente.co"], resumen: "Correo automático de bienvenida con número de DO y responsable operativo.", fecha: `${d(-12)}T15:02:00.000Z`, abiertoEl: `${d(-12)}T16:40:00.000Z` },
    { id: "m-2", empresaId: empresa.id, entidad: "operacion", entidadId: "o-1", direccion: "saliente", asunto: "Solicitud de booking 2x40HC Ningbo → Cartagena", para: ["ops@ningbogl.cn"], resumen: "Solicitud al agente en origen con datos de la carga y fecha estimada de carga lista.", fecha: `${d(-11)}T13:10:00.000Z` },
    { id: "m-3", empresaId: empresa.id, entidad: "operacion", entidadId: "o-1", direccion: "entrante", asunto: "RE: Solicitud de booking 2x40HC", para: ["do-0001@oikor.logiks.co"], resumen: `El agente confirma carga lista el ${fechaLegible(d(-1))} y booking para el ${fechaLegible(d(7))}.`, fecha: `${d(-2)}T09:45:00.000Z` },
    { id: "m-4", empresaId: empresa.id, entidad: "operacion", entidadId: "o-1", direccion: "saliente", asunto: `Novedad ${O(1)}: carga lista`, para: ["laura@agrooriente.co"], resumen: `Su proveedor indica carga lista el ${fechaLegible(d(-1))}; booking para el ${fechaLegible(d(7))}.`, fecha: `${d(-1)}T14:20:00.000Z`, abiertoEl: `${d(-1)}T15:01:00.000Z` },
    { id: "m-5", empresaId: empresa.id, entidad: "operacion", entidadId: "o-2", direccion: "saliente", asunto: `Novedad ${O(2)}: carga en vuelo`, para: ["andres@floreslamontana.co"], resumen: "La carga salió en el vuelo AV-1234; ETA Miami mañana.", fecha: `${d(-2)}T22:00:00.000Z`, abiertoEl: `${d(-2)}T22:15:00.000Z` },
    { id: "m-6", empresaId: empresa.id, entidad: "cotizacion", entidadId: "q-4", direccion: "saliente", asunto: `Cotización ${C(4)} · Telares industriales`, para: ["mateo@textilesrionegro.co"], resumen: "Envío de cotización con enlace de aceptación en línea.", fecha: `${d(-6)}T15:10:00.000Z`, abiertoEl: `${d(-5)}T13:22:00.000Z` },
  ];

  return {
    empresa,
    usuarios,
    terceros,
    cotizaciones,
    formularios,
    operaciones,
    comunicaciones,
    secuencias: { cotizacion: cotizaciones.length, do: operaciones.length },
    archivos: [],
    facturas: [],
    accesosPortal: [
      { terceroId: "t-agro", usuarioId: "c-laura", nombre: "Laura Ospina", correo: "laura@agrooriente.co" },
      { terceroId: "t-flores", usuarioId: "c-andres", nombre: "Andrés Vélez", correo: "andres@floreslamontana.co" },
    ],
  };
}
