import "server-only";
import { createHash } from "node:crypto";
import type { PayloadEmision } from "@/domain/einvoice";
import type {
  AcuerdoComercial,
  Archivo,
  Comunicacion,
  Contacto,
  Cotizacion,
  Datos170,
  EntradaCatalogo,
  EstadoCotizacion,
  Factura,
  DatosFiscales,
  EstadoBotFe,
  TrabajoFe,
  IvaFinppi,
  Presentacion,
  Formulario170,
  Hito,
  Rol,
  Tercero,
  TipoCatalogo,
  Usuario,
} from "@/domain/types";
import {
  duplicarCotizacion,
  formatearConsecutivo,
  puedeTransicionar,
  requiereNuevaVersion,
} from "@/domain/cotizacion";
import { crearOperacion, estadoSegunHitos, hitosDe } from "@/domain/operacion";
import { catalogoBase } from "@/domain/catalogo";
import { habilitadoParaDO, situacion170, vigenciaAlAprobar } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import { crearSemilla, type EstadoDemo } from "./semilla";
import { esImagenValida, validarArchivo, validarLogo } from "@/domain/archivos";
import { cotizacionParaCliente, operacionParaCliente, visibleParaCliente } from "@/domain/portal";
import type { ArchivoDemo } from "./semilla";
import type {
  CambiosEmpresa,
  Descarga,
  MetaArchivo,
  NuevoArchivo,
  DatosCotizacion,
  DecisionCliente,
  NuevoTercero,
  Repositorio,
  RepositorioPortal,
  RepositorioPublico,
  VistaPublica,
} from "../repositorio";
import { ErrorNegocio } from "../errores";
import { esTokenFirmado, verificarTokenFirmado } from "../../enlace-firmado";

/**
 * Repositorio en memoria. El estado vive en `globalThis` para sobrevivir a la
 * recarga en caliente; se reinicia al reiniciar el servidor.
 */
const g = globalThis as unknown as { __logiksDemo?: EstadoDemo };
function estado(): EstadoDemo {
  return (g.__logiksDemo ??= crearSemilla());
}

export function reiniciarDemo() {
  g.__logiksDemo = crearSemilla();
}

const id = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();

export class DemoRepositorio implements Repositorio {
  constructor(readonly usuario: Usuario) {}

  get empresa() {
    return estado().empresa;
  }

  async usuarios() {
    return estado().usuarios.filter((u) => u.activo !== false);
  }

  async accesosPortal(terceroId: string) {
    return estado().accesosPortal.filter((a) => a.terceroId === terceroId);
  }

  async invitarAlPortal(terceroId: string, d: { nombre: string; correo: string }) {
    if (!this.usuario.roles.some((r) => r === "comercial" || r === "admin")) {
      throw new ErrorNegocio("Solo Comercial puede invitar clientes al portal");
    }
    const s = estado();
    if (s.accesosPortal.some((a) => a.terceroId === terceroId && a.correo.toLowerCase() === d.correo.toLowerCase())) {
      throw new ErrorNegocio("Ese correo ya tiene acceso al portal");
    }
    s.accesosPortal.push({ terceroId, usuarioId: id(), ...d });
  }

  async prepararSubidaLogo() {
    return null; // en demo el logo llega por el servidor
  }

  async guardarLogo(a: { bytes?: Uint8Array; mime: string; tamano: number }) {
    this.exigirAdmin();
    const error = validarLogo(a);
    if (error) throw new ErrorNegocio(error);
    const tipo = a.bytes && esImagenValida(a.bytes);
    if (!tipo) throw new ErrorNegocio("El archivo no es una imagen PNG o JPG válida");
    estado().empresa.logoUrl = `data:${tipo};base64,${Buffer.from(a.bytes!).toString("base64")}`;
  }

  async quitarLogo() {
    this.exigirAdmin();
    estado().empresa.logoUrl = undefined;
  }

  async catalogo(tipo?: TipoCatalogo) {
    return [...catalogoBase(), ...estado().catalogoPropio].filter((e) => !tipo || e.tipo === tipo);
  }

  async agregarCatalogo(e: Omit<EntradaCatalogo, "id" | "base">) {
    this.exigirAdmin();
    const todos = await this.catalogo(e.tipo);
    if (todos.some((x) => x.nombre.toLowerCase() === e.nombre.toLowerCase())) throw new ErrorNegocio("Ya existe en el catálogo");
    estado().catalogoPropio.push({ ...e, id: id(), base: false });
  }

  async eliminarCatalogo(catId: string) {
    this.exigirAdmin();
    const s = estado();
    s.catalogoPropio = s.catalogoPropio.filter((x) => x.id !== catId);
  }

  private exigirAdmin() {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador puede cambiar la configuración");
  }

  async actualizarEmpresa(cambios: CambiosEmpresa) {
    this.exigirAdmin();
    Object.assign(estado().empresa, cambios);
  }

  async invitarUsuario(d: { correo: string; nombre: string; roles: Rol[] }) {
    this.exigirAdmin();
    const s = estado();
    if (s.usuarios.some((u) => u.correo.toLowerCase() === d.correo.toLowerCase() && u.activo !== false)) {
      throw new ErrorNegocio("Ese correo ya pertenece a la empresa");
    }
    s.usuarios.push({ id: id(), nombre: d.nombre, correo: d.correo, roles: d.roles });
  }

  async cambiarRoles(usuarioId: string, roles: Rol[]) {
    this.exigirAdmin();
    const u = estado().usuarios.find((x) => x.id === usuarioId);
    if (!u) throw new ErrorNegocio("Usuario no encontrado");
    if (u.id === this.usuario.id && !roles.includes("admin")) {
      throw new ErrorNegocio("No puedes quitarte el rol de Administrador");
    }
    u.roles = roles;
  }

  async desactivarUsuario(usuarioId: string) {
    this.exigirAdmin();
    if (usuarioId === this.usuario.id) throw new ErrorNegocio("No puedes desactivarte a ti mismo");
    const u = estado().usuarios.find((x) => x.id === usuarioId);
    if (u) u.activo = false;
  }

  /* ---------------- Terceros ---------------- */

  async terceros(tipo?: Tercero["tipo"]) {
    return estado().terceros.filter((t) => !tipo || t.tipo === tipo);
  }

  async tercero(terceroId: string) {
    return estado().terceros.find((t) => t.id === terceroId) ?? null;
  }

  async crearTercero(datos: NuevoTercero) {
    const s = estado();
    if (s.terceros.some((t) => t.nit === datos.nit && t.tipo === datos.tipo)) {
      throw new ErrorNegocio(`Ya existe un ${datos.tipo} con NIT ${datos.nit}`);
    }
    const nuevo: Tercero = {
      id: id(),
      empresaId: s.empresa.id,
      tipo: datos.tipo,
      nit: datos.nit,
      razonSocial: datos.razonSocial,
      ciudad: datos.ciudad,
      contactos: datos.contacto ? [{ id: id(), ...datos.contacto }] : [],
    };
    s.terceros.push(nuevo);
    return nuevo;
  }

  private exigirComercial() {
    if (!this.usuario.roles.some((r) => r === "comercial" || r === "contabilidad" || r === "admin")) {
      throw new ErrorNegocio("Tu rol no permite editar clientes");
    }
  }

  async guardarAcuerdo(terceroId: string, acuerdo: AcuerdoComercial) {
    this.exigirComercial();
    const t = await this.tercero(terceroId);
    if (!t) throw new ErrorNegocio("El tercero no existe");
    t.acuerdo = acuerdo;
  }

  async guardarContacto(terceroId: string, c: Omit<Contacto, "id"> & { id?: string }) {
    this.exigirComercial();
    const t = await this.tercero(terceroId);
    if (!t) throw new ErrorNegocio("El tercero no existe");
    if (c.id) {
      const k = t.contactos.find((x) => x.id === c.id);
      if (!k) throw new ErrorNegocio("El contacto no existe");
      Object.assign(k, c);
    } else {
      t.contactos.push({ ...c, id: id() });
    }
  }

  async eliminarContacto(terceroId: string, contactoId: string) {
    this.exigirComercial();
    const t = await this.tercero(terceroId);
    if (t) t.contactos = t.contactos.filter((k) => k.id !== contactoId);
  }

  /* ---------------- Cotizaciones ---------------- */

  async cotizaciones() {
    return [...estado().cotizaciones].sort((a, b) =>
      b.consecutivo.localeCompare(a.consecutivo),
    );
  }

  async cotizacion(cotId: string) {
    return estado().cotizaciones.find((q) => q.id === cotId) ?? null;
  }

  private siguienteConsecutivo(tipo: "cotizacion" | "do") {
    const s = estado();
    const n = ++s.secuencias[tipo];
    const prefijo = tipo === "do" ? s.empresa.prefijoDO : s.empresa.prefijoCotizacion;
    return formatearConsecutivo(prefijo, Number(hoyISO().slice(0, 4)), n);
  }

  async guardarCotizacion(datos: DatosCotizacion, cotId?: string) {
    const s = estado();
    const conceptos = datos.conceptos.map((c) => ({ ...c, id: id() }));
    const evento = (accion: string) => ({ fecha: ahora(), usuario: this.usuario.nombre, accion });

    if (!cotId) {
      const q: Cotizacion = {
        ...datos,
        conceptos,
        id: id(),
        empresaId: s.empresa.id,
        consecutivo: this.siguienteConsecutivo("cotizacion"),
        version: 1,
        comercialId: this.usuario.id,
        fechaEmision: hoyISO(),
        estado: "borrador",
        tokenPublico: id(),
        historial: [evento("Creada")],
      };
      s.cotizaciones.push(q);
      return q;
    }

    const actual = await this.cotizacion(cotId);
    if (!actual) throw new ErrorNegocio("La cotización no existe");
    if (actual.estado === "aceptada") {
      throw new ErrorNegocio("Una cotización aceptada no se edita: duplícala.");
    }
    const nuevaVersion = requiereNuevaVersion(actual.estado);
    Object.assign(actual, datos, {
      conceptos,
      version: nuevaVersion ? actual.version + 1 : actual.version,
      estado: "borrador",
      historial: [
        ...actual.historial,
        evento(nuevaVersion ? `Editada: versión ${actual.version + 1}` : "Borrador editado"),
      ],
    });
    return actual;
  }

  async duplicarCotizacion(cotId: string, clienteId?: string) {
    const s = estado();
    const origen = await this.cotizacion(cotId);
    if (!origen) throw new ErrorNegocio("La cotización no existe");
    const cliente = clienteId ? await this.tercero(clienteId) : undefined;
    const res = duplicarCotizacion(origen, {
      id: id(),
      consecutivo: this.siguienteConsecutivo("cotizacion"),
      tokenPublico: id(),
      comercialId: this.usuario.id,
      hoy: hoyISO(),
      vigenciaDias: 15,
      cliente: cliente ?? undefined,
      generarIdConcepto: id,
    });
    res.cotizacion.historial[0].usuario = this.usuario.nombre;
    s.cotizaciones.push(res.cotizacion);
    return res;
  }

  async cambiarEstadoCotizacion(cotId: string, nuevo: EstadoCotizacion, accion: string) {
    const q = await this.cotizacion(cotId);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    if (!puedeTransicionar(q.estado, nuevo)) {
      throw new ErrorNegocio(`No se puede pasar de ${q.estado} a ${nuevo}`);
    }
    q.estado = nuevo;
    q.historial.push({ fecha: ahora(), usuario: this.usuario.nombre, accion });
  }

  async emitirEnlace(cotId: string) {
    const q = await this.cotizacion(cotId);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    return q.tokenPublico;
  }

  /* ---------------- Circular 170 ---------------- */

  async formularios170(terceroId?: string) {
    return estado().formularios.filter((f) => !terceroId || f.terceroId === terceroId);
  }

  async revisarFormulario170(
    formId: string,
    decision: "aprobado" | "devuelto" | "rechazado",
    observaciones?: string,
  ) {
    if (!this.usuario.roles.some((r) => r === "cumplimiento" || r === "admin")) {
      throw new ErrorNegocio("Solo Cumplimiento puede revisar formularios 170");
    }
    const f = estado().formularios.find((x) => x.id === formId);
    if (!f) throw new ErrorNegocio("El formulario no existe");
    if (f.estado !== "en_revision") throw new ErrorNegocio("El formulario no está en revisión");
    f.estado = decision;
    f.revisor = this.usuario.nombre;
    f.observaciones = observaciones;
    if (decision === "aprobado") {
      f.aprobadoEl = hoyISO();
      f.vigenteHasta = vigenciaAlAprobar(f.aprobadoEl, estado().empresa.vigencia170Meses);
    }
  }

  /* ---------------- Operaciones ---------------- */

  async operaciones() {
    return [...estado().operaciones].sort((a, b) =>
      b.consecutivo.localeCompare(a.consecutivo),
    );
  }

  async operacion(opId: string) {
    return estado().operaciones.find((o) => o.id === opId) ?? null;
  }

  async abrirOperacion(cotizacionId: string) {
    const s = estado();
    const q = await this.cotizacion(cotizacionId);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    if (s.operaciones.some((o) => o.cotizacionId === q.id)) {
      throw new ErrorNegocio("Esta cotización ya tiene un DO abierto");
    }
    const sit = situacion170(await this.formularios170(q.clienteId), hoyISO());
    if (s.empresa.bloquearDOSin170 && !habilitadoParaDO(sit)) {
      throw new ErrorNegocio(
        "El cliente no tiene la Circular 170 vigente y aprobada. Solicita la actualización antes de abrir el DO.",
      );
    }
    const op = crearOperacion(q, {
      hitos: hitosDe(q.tipoServicio, s.empresa.hitosPorTipo),
      id: id(),
      consecutivo: this.siguienteConsecutivo("do"),
      responsableId: s.usuarios.find((u) => u.roles.includes("operaciones"))?.id ?? this.usuario.id,
      hoy: hoyISO(),
      generarId: id,
    });
    s.operaciones.push(op);
    return op;
  }

  async actualizarHito(opId: string, cambio: Pick<Hito, "id" | "real" | "estimada" | "nota">) {
    const op = await this.operacion(opId);
    const h = op?.hitos.find((x) => x.id === cambio.id);
    if (!op || !h) throw new ErrorNegocio("Hito no encontrado");
    Object.assign(h, cambio);
    op.estado = estadoSegunHitos(op);
  }

  async registrarCostoReal(opId: string, conceptoId: string, costoTotal: number | null) {
    if (!this.usuario.roles.some((r) => r === "operaciones" || r === "contabilidad" || r === "admin")) {
      throw new ErrorNegocio("Tu rol no permite registrar costos");
    }
    const op = await this.operacion(opId);
    if (!op || !op.conceptos.some((c) => c.id === conceptoId)) throw new ErrorNegocio("Concepto no encontrado");
    const costos = { ...(op.costosReales ?? {}) };
    if (costoTotal === null) delete costos[conceptoId];
    else costos[conceptoId] = costoTotal;
    op.costosReales = costos;
  }

  /* ---------------- Archivos ---------------- */

  async documentosDO(operacionId: string) {
    return listarArchivos("do", operacionId);
  }

  async soportes170(formularioId: string) {
    return listarArchivos("170", formularioId);
  }

  async prepararSubidaDO() {
    return null; // en demo los bytes llegan por el servidor
  }

  async registrarDocumentoDO(operacionId: string, a: NuevoArchivo) {
    if (!(await this.operacion(operacionId))) throw new ErrorNegocio("El DO no existe");
    guardarArchivo("do", operacionId, a);
  }

  async descargarArchivo(clase: "do" | "170", archivoId: string): Promise<Descarga> {
    if (clase === "170" && !this.usuario.roles.some((r) => r === "cumplimiento" || r === "admin")) {
      throw new ErrorNegocio("Solo Cumplimiento puede ver los soportes de la 170");
    }
    const a = estado().archivos.find((x) => x.id === archivoId && x.clase === clase);
    if (!a) throw new ErrorNegocio("Archivo no encontrado");
    return { bytes: a.bytes, mime: a.mime, nombre: a.nombre };
  }

  /* ---------------- Facturación ---------------- */

  private exigirContabilidad() {
    if (!this.usuario.roles.some((r) => r === "contabilidad" || r === "admin")) {
      throw new ErrorNegocio("Solo Contabilidad puede gestionar facturas");
    }
  }

  async facturas() {
    return [...estado().facturas].sort((a, b) => b.creadoEl.localeCompare(a.creadoEl));
  }

  async factura(facturaId: string) {
    return estado().facturas.find((f) => f.id === facturaId) ?? null;
  }

  async crearPrefactura(f: Omit<Factura, "id" | "empresaId" | "estado" | "creadoEl">) {
    this.exigirContabilidad();
    const nueva: Factura = { ...f, id: id(), empresaId: estado().empresa.id, estado: "borrador", creadoEl: ahora() };
    estado().facturas.push(nueva);
    return nueva;
  }

  async actualizarLineas(facturaId: string, lineas: Factura["lineas"]) {
    this.exigirContabilidad();
    const f = await this.factura(facturaId);
    if (!f) throw new ErrorNegocio("La prefactura no existe");
    if (!["borrador", "aprobada", "fallida", "rechazada"].includes(f.estado)) throw new ErrorNegocio("La factura ya está en proceso o emitida");
    f.lineas = lineas;
  }

  async actualizarFactura(facturaId: string, cambios: Partial<Factura>) {
    const f = await this.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    Object.assign(f, cambios);
  }

  /* ---------------- Facturación electrónica (simulada) ---------------- */

  async verificarAceptacion(cotizacionId: string) {
    const q = await this.cotizacion(cotizacionId);
    if (!q || q.estado !== "aceptada") throw new ErrorNegocio("No se pudo marcar la verificación");
    q.aceptacionVerificadaEl = ahora();
    q.historial.push({ fecha: ahora(), usuario: this.usuario.nombre, accion: "Aceptación verificada" });
  }

  async guardarDatosFiscales(terceroId: string, fiscal: DatosFiscales) {
    if (!this.usuario.roles.some((r) => r === "comercial" || r === "contabilidad" || r === "admin" || r === "cumplimiento")) {
      throw new ErrorNegocio("Tu rol no permite editar clientes");
    }
    const t = await this.tercero(terceroId);
    if (!t) throw new ErrorNegocio("El cliente no existe");
    t.fiscal = { ...fiscal };
  }

  async cuentaFe() {
    return estado().cuentaFe ?? null;
  }

  async guardarCredencialesFe(usuario: string, _clave: string, version: string) {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador puede conectar Finppi");
    const s = estado();
    s.cuentaFe = {
      estado: "pendiente",
      tieneCredenciales: true,
      usuarioPista: `${usuario.slice(0, 2)}***${usuario.slice(usuario.indexOf("@"))}`,
      consentimientoEl: ahora(),
      consentimientoVersion: version,
      instantanea: s.cuentaFe?.instantanea ?? {},
      resolucion: s.cuentaFe?.resolucion,
      condiciones: s.cuentaFe?.condiciones,
      presentacion: s.cuentaFe?.presentacion,
      modoEmision: s.cuentaFe?.modoEmision,
    };
    this.healthcheckSimulado();
  }

  async desconectarFe() {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador puede desconectar Finppi");
    const c = estado().cuentaFe;
    if (c) Object.assign(c, { estado: "desconectada", tieneCredenciales: false, usuarioPista: undefined });
  }

  async probarConexionFe() {
    if (!estado().cuentaFe?.tieneCredenciales) throw new ErrorNegocio("Primero guarda las credenciales de Finppi");
    this.healthcheckSimulado();
  }

  async guardarProducto(p: { id?: string; nombre: string; codigo: string; iva: IvaFinppi }) {
    if (!this.usuario.roles.some((r) => r === "admin" || r === "comercial" || r === "contabilidad")) {
      throw new ErrorNegocio("Tu rol no permite crear productos");
    }
    const s = estado();
    const otros = s.catalogoPropio.filter((e) => e.tipo === "producto_finppi" && e.id !== p.id);
    if (otros.some((e) => e.codigo === p.codigo || e.nombre.toLowerCase() === p.nombre.toLowerCase())) {
      throw new ErrorNegocio(`Ya existe un producto con el código ${p.codigo} o ese nombre`);
    }
    const actual = p.id ? s.catalogoPropio.find((e) => e.id === p.id) : undefined;
    if (actual) {
      Object.assign(actual, { nombre: p.nombre, codigo: p.codigo, datos: { ...actual.datos, iva: p.iva } });
      return actual;
    }
    const nuevo: EntradaCatalogo = { id: id(), tipo: "producto_finppi", nombre: p.nombre, codigo: p.codigo, base: false, datos: { iva: p.iva, enFinppi: false, origen: "logiks" } };
    s.catalogoPropio.push(nuevo);
    return nuevo;
  }

  async sincronizarProductosFe() {
    const s = estado();
    if (s.cuentaFe?.estado !== "activa") throw new ErrorNegocio("Primero conecta y verifica tu cuenta de Finppi");
    // Simulación: «Finppi» tiene estos productos; se cargan los que falten.
    const finppi = [
      { codigo: "SRV-MAN", nombre: "Agenciamiento y manejo de carga" },
      { codigo: "SRV-FLT", nombre: "Flete internacional" },
      { codigo: "TER-REE", nombre: "Reembolso de gastos a terceros" },
      { codigo: "SRV-ADU", nombre: "Agenciamiento aduanero" },
      { codigo: "SRV-SEG", nombre: "Seguro de carga" },
    ];
    const ya = new Set(s.catalogoPropio.filter((e) => e.tipo === "producto_finppi").map((e) => e.codigo));
    const nuevos = finppi.filter((p) => !ya.has(p.codigo));
    for (const p of nuevos) s.catalogoPropio.push({ id: id(), tipo: "producto_finppi", nombre: p.nombre, codigo: p.codigo, base: false, datos: {} });
    const t = ahora();
    s.trabajosFe.unshift({
      id: id(),
      tipo: "productos",
      estado: "ok",
      dryRun: false,
      creadoEl: t,
      terminadoEl: t,
      resultado: { leidos: finppi.length, nuevos: nuevos.length },
      logs: [
        { paso: "productos", nivel: "info", mensaje: "Leyendo el listado de productos y servicios de Finppi… (simulado)", creadoEl: t },
        { paso: "productos", nivel: "info", mensaje: `${finppi.length} productos leídos en Finppi: ${nuevos.length} nuevos en el catálogo de LOGIKS, ${finppi.length - nuevos.length} ya estaban.`, creadoEl: t },
      ],
    });
  }

  async guardarModoEmisionFe(m: "borrador" | "real") {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador cambia el modo de emisión");
    const s = estado();
    s.cuentaFe ??= { estado: "desconectada", tieneCredenciales: false, instantanea: {} };
    s.cuentaFe.modoEmision = m;
  }

  async descartarPruebaFe(facturaId: string) {
    this.exigirContabilidad();
    const f = await this.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    if (!f.simulada) throw new ErrorNegocio("Solo se descartan facturas de prueba");
    Object.assign(f, {
      estado: "borrador",
      simulada: false,
      numero: undefined,
      numeroEsperado: undefined,
      referencia: undefined,
      cufe: undefined,
      fechaValidacion: undefined,
      enviadaClienteEl: undefined,
      error: undefined,
    } satisfies Partial<Factura>);
  }

  async verificarPruebaFe(facturaId: string) {
    this.exigirContabilidad();
    const f = await this.factura(facturaId);
    if (!f || (f.estado !== "estado_desconocido" && f.estado !== "revision")) throw new ErrorNegocio("La factura no está pendiente de verificación");
    Object.assign(f, { estado: "emitida", simulada: true, error: undefined, fechaValidacion: ahora() });
  }

  async reabrirPruebaFe(facturaId: string) {
    this.exigirContabilidad();
    const f = await this.factura(facturaId);
    if (!f || (f.estado !== "estado_desconocido" && f.estado !== "revision")) throw new ErrorNegocio("La factura no está pendiente de verificación");
    Object.assign(f, { estado: "borrador", error: undefined });
  }

  async detenerEnvioFe(facturaId: string) {
    this.exigirContabilidad();
    const s = estado();
    if (s.trabajosFe.some((j) => j.facturaId === facturaId && j.estado === "corriendo")) {
      throw new ErrorNegocio("El bot ya está trabajando en esta factura: espera a que termine");
    }
    const cola = s.trabajosFe.filter((j) => j.facturaId === facturaId && j.estado === "en_cola");
    if (!cola.length) throw new ErrorNegocio("No hay un envío en cola para detener");
    for (const j of cola) Object.assign(j, { estado: "cancelado", terminadoEl: ahora(), error: `Detenido por ${this.usuario.nombre}` });
    const f = await this.factura(facturaId);
    if (f && (f.estado === "en_cola" || f.estado === "fallida")) Object.assign(f, { estado: "borrador", error: undefined });
  }

  async guardarPresentacionFe(p: Presentacion) {
    const s = estado();
    s.cuentaFe ??= { estado: "desconectada", tieneCredenciales: false, instantanea: {} };
    s.cuentaFe.presentacion = p;
  }

  async guardarTextosFe(t: { resolucion: string; condiciones: string }) {
    const s = estado();
    s.cuentaFe ??= { estado: "desconectada", tieneCredenciales: false, instantanea: {} };
    s.cuentaFe.resolucion = t.resolucion;
    s.cuentaFe.condiciones = t.condiciones;
  }

  /** En el demo no hay bot: el resultado se simula al instante. */
  private healthcheckSimulado() {
    const s = estado();
    const c = s.cuentaFe!;
    const leido = ahora();
    Object.assign(c, {
      estado: "activa",
      ultimoLoginOk: leido,
      instantanea: {
        razonSocial: s.empresa.razonSocial,
        nit: s.empresa.nit.replace(/[^0-9]/g, "").slice(0, 9),
        proximaFactura: `SETT${s.ultimoConsecutivoFe + 1}`,
        leidoEl: leido,
        clientes: 3,
        productos: 3,
      },
    });
    s.trabajosFe.unshift({
      id: id(),
      tipo: "healthcheck",
      estado: "ok",
      dryRun: false,
      creadoEl: leido,
      terminadoEl: leido,
      resultado: { simulado: true },
      logs: [
        { paso: "login", nivel: "info", mensaje: "Conectando con Finppi… (simulado)", creadoEl: leido },
        { paso: "empresa", nivel: "info", mensaje: `Empresa verificada: ${s.empresa.razonSocial}`, creadoEl: leido },
        { paso: "consecutivo", nivel: "info", mensaje: `Tu próxima factura será la SETT${s.ultimoConsecutivoFe + 1}`, creadoEl: leido },
      ],
    });
  }

  async encolarEmision(facturaId: string, d: { payload: PayloadEmision; dryRun: boolean; enviarAlEmitir: boolean }) {
    this.exigirContabilidad();
    const s = estado();
    const f = await this.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    if (!["borrador", "aprobada", "fallida", "rechazada"].includes(f.estado)) {
      throw new ErrorNegocio("Esta factura ya está en proceso o emitida");
    }
    if (s.cuentaFe?.estado !== "activa") {
      throw new ErrorNegocio("Conecta y verifica tu cuenta de Finppi en Configuración antes de emitir");
    }
    const t = ahora();
    const numero = `SETT${s.ultimoConsecutivoFe + 1}`;
    const p = d.payload;
    const logs: TrabajoFe["logs"] = [
      { paso: "login", nivel: "info", mensaje: "Sesión iniciada en Finppi (simulado)", creadoEl: t },
      { paso: "empresa", nivel: "info", mensaje: `NIT ${p.nitEmisor} verificado`, creadoEl: t },
      { paso: "consecutivo", nivel: "info", mensaje: `Finppi ofrece ${numero}: es el siguiente esperado`, creadoEl: t },
      { paso: "cliente", nivel: "info", mensaje: `Cliente ${p.cliente.nombres} (${p.cliente.numeroDocumento})`, creadoEl: t },
      { paso: "items", nivel: "info", mensaje: `${p.items.length} ítems cargados en COP con TRM ${p.original.trmReferencia}`, creadoEl: t },
      { paso: "totales", nivel: "info", mensaje: `Totales de Finppi = aprobados (${p.totales.total.toLocaleString("es-CO")} COP)`, creadoEl: t },
    ];
    if (d.dryRun) {
      logs.push({ paso: "dry_run", nivel: "info", mensaje: "Prueba sin emitir: se detuvo antes de «Enviar». Nada se emitió.", creadoEl: t });
      s.trabajosFe.unshift({ id: id(), facturaId, tipo: "emitir", estado: "ok", dryRun: true, creadoEl: t, terminadoEl: t, resultado: { numeroOfrecido: numero }, logs });
      return;
    }
    if (p.modo !== "real") {
      // Modo prueba: «Guardar» en Finppi; el borrador no consume consecutivo.
      logs.push(
        { paso: "guardar", nivel: "info", mensaje: "Modo prueba: se pulsa «Guardar» (borrador). No va a la DIAN. (simulado)", creadoEl: t },
        { paso: "resultado", nivel: "info", mensaje: `Guardada en Finppi como borrador ${numero}`, creadoEl: t },
        { paso: "consecutivo", nivel: "info", mensaje: `El borrador NO consumió consecutivo: Finppi sigue ofreciendo ${numero}`, creadoEl: t },
      );
      Object.assign(f, {
        estado: "emitida",
        simulada: true,
        referencia: f.referencia ?? p.referencia,
        numeroEsperado: numero,
        fechaValidacion: t,
        totalCop: p.totales.total,
        error: undefined,
        errorCodigo: undefined,
      } satisfies Partial<Factura>);
      s.trabajosFe.unshift({ id: id(), facturaId, tipo: "emitir", estado: "ok", dryRun: false, creadoEl: t, terminadoEl: t, resultado: { borrador: true, numero }, logs });
      return;
    }
    s.ultimoConsecutivoFe += 1;
    const cufe = createHash("sha384").update(`${p.referencia}|${numero}|${p.totales.total}|demo`).digest("hex");
    logs.push(
      { paso: "enviar", nivel: "info", mensaje: "Punto de no retorno: «Enviar» (simulado)", creadoEl: t },
      { paso: "resultado", nivel: "info", mensaje: `${numero} aceptada · CUFE ${cufe.slice(0, 12)}… (ficticio)`, creadoEl: t },
    );
    Object.assign(f, {
      estado: "emitida",
      referencia: f.referencia ?? p.referencia,
      numero,
      numeroEsperado: numero,
      cufe,
      fechaValidacion: t,
      totalCop: p.totales.total,
      simulada: true,
      error: undefined,
      errorCodigo: undefined,
    } satisfies Partial<Factura>);
    if (s.cuentaFe) s.cuentaFe.instantanea.proximaFactura = `SETT${s.ultimoConsecutivoFe + 1}`;
    s.trabajosFe.unshift({ id: id(), facturaId, tipo: "emitir", estado: "ok", dryRun: false, creadoEl: t, terminadoEl: t, resultado: { numero, cufe }, logs });
  }

  async trabajosFe(facturaId?: string) {
    return estado().trabajosFe.filter((j) => (facturaId ? j.facturaId === facturaId : j.tipo === "healthcheck" || j.tipo === "productos"));
  }

  async estadoBotFe(): Promise<EstadoBotFe> {
    return { latidoEl: ahora(), pausado: false };
  }

  async descargarArchivoFe() {
    return null; // en el demo no hay PDF original de Finppi
  }

  async marcarFacturaEnviada(facturaId: string) {
    const f = await this.factura(facturaId);
    if (f) f.enviadaClienteEl = ahora();
  }

  async megafocoConectado() {
    return !!estado().llaveMegafoco;
  }

  async guardarLlaveMegafoco(llave: string) {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador puede conectar Megafoco");
    estado().llaveMegafoco = llave;
  }

  async llaveMegafoco() {
    return estado().llaveMegafoco ?? null;
  }

  /* ---------------- Comunicaciones ---------------- */

  async comunicaciones(entidad: Comunicacion["entidad"], entidadId: string) {
    return estado()
      .comunicaciones.filter((c) => c.entidad === entidad && c.entidadId === entidadId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async registrarComunicacion(c: Omit<Comunicacion, "id" | "empresaId" | "fecha">) {
    const s = estado();
    s.comunicaciones.push({ ...c, id: id(), empresaId: s.empresa.id, fecha: ahora() });
  }
}

function listarArchivos(clase: "do" | "170", entidadId: string): Archivo[] {
  return estado()
    .archivos.filter((a) => a.clase === clase && a.entidadId === entidadId)
    .map(({ bytes: _b, clase: _c, entidadId: _e, ...a }) => a);
}

function guardarArchivo(clase: "do" | "170", entidadId: string, a: NuevoArchivo) {
  const error = validarArchivo(a);
  if (error) throw new ErrorNegocio(error);
  if (!a.bytes) throw new ErrorNegocio("Falta el contenido del archivo");
  const nuevo: ArchivoDemo = {
    id: id(),
    clase,
    entidadId,
    tipo: a.tipo,
    nombre: a.nombre,
    mime: a.mime,
    tamano: a.tamano,
    creadoEl: ahora(),
    bytes: a.bytes,
  };
  estado().archivos.push(nuevo);
}

/* ------------------------------------------------------------------ */
/* Acceso público por token (enlace de aceptación)                      */
/* ------------------------------------------------------------------ */

export class DemoRepositorioPublico implements RepositorioPublico {
  async cotizacionPorToken(token: string): Promise<VistaPublica | null> {
    const s = estado();
    const firmado = esTokenFirmado(token) ? verificarTokenFirmado(token) : null;
    const cotizacion = firmado
      ? s.cotizaciones.find((q) => q.id === firmado.id && q.version === firmado.version && q.vigenteHasta >= hoyISO())
      : s.cotizaciones.find((q) => q.tokenPublico === token);
    if (!cotizacion) return null;
    const cliente = s.terceros.find((t) => t.id === cotizacion.clienteId)!;
    return {
      cotizacion,
      empresa: s.empresa,
      cliente,
      formularios: s.formularios.filter((f) => f.terceroId === cliente.id),
    };
  }

  async marcarVista(token: string) {
    const v = await this.cotizacionPorToken(token);
    if (v && v.cotizacion.estado === "enviada") {
      v.cotizacion.estado = "vista";
      v.cotizacion.historial.push({ fecha: ahora(), usuario: "Cliente", accion: "Abierta por el cliente" });
    }
  }

  async registrarDecision(token: string, d: DecisionCliente) {
    const v = await this.cotizacionPorToken(token);
    if (!v) throw new ErrorNegocio("Enlace inválido");
    const q = v.cotizacion;
    if (!puedeTransicionar(q.estado, d.decision)) {
      throw new ErrorNegocio("Esta cotización ya no admite respuesta");
    }
    q.estado = d.decision;
    if (d.decision === "aceptada") {
      q.aceptacion = {
        nombre: d.nombre,
        cargo: d.cargo,
        documento: d.documento,
        correo: d.correo,
        canal: esTokenFirmado(token) ? "pdf" : "enlace",
        fecha: ahora(),
        ip: d.ip,
      };
      q.aceptacionVerificadaEl = undefined;
    }
    q.historial.push({
      fecha: ahora(),
      usuario: `${d.nombre} (${d.cargo})`,
      accion:
        d.decision === "aceptada"
          ? `Aceptada ${esTokenFirmado(token) ? "desde el PDF" : "en línea"} por ${d.correo}${d.documento ? ` (doc. ${d.documento})` : ""} desde ${d.ip ?? "IP no disponible"}`
          : `Rechazada por ${d.correo}: ${d.motivo ?? "sin motivo"}`,
    });
  }

  async enviarFormulario170(token: string, datos: Datos170) {
    const s = estado();
    const v = await this.cotizacionPorToken(token);
    if (!v) throw new ErrorNegocio("Enlace inválido");
    const previos = s.formularios.filter((f) => f.terceroId === v.cliente.id);
    const form: Formulario170 = {
      id: id(),
      empresaId: s.empresa.id,
      terceroId: v.cliente.id,
      version: previos.reduce((m, f) => Math.max(m, f.version), 0) + 1,
      estado: "en_revision",
      diligenciadoEl: ahora(),
      datos,
    };
    s.formularios.push(form);
  }

  private async formularioActual(token: string) {
    const v = await this.cotizacionPorToken(token);
    if (!v) throw new ErrorNegocio("Enlace inválido");
    const f = [...v.formularios].sort((a, b) => b.version - a.version)[0];
    if (!f || (f.estado !== "en_revision" && f.estado !== "devuelto" && f.estado !== "pendiente")) {
      throw new ErrorNegocio("Primero envía el formulario 170");
    }
    return f;
  }

  async prepararSoporte170(_token: string, _a: MetaArchivo) {
    return null;
  }

  async registrarSoporte170(token: string, a: NuevoArchivo) {
    const f = await this.formularioActual(token);
    guardarArchivo("170", f.id, a);
  }

  async soportesPorToken(token: string) {
    const v = await this.cotizacionPorToken(token);
    const f = v && [...v.formularios].sort((a, b) => b.version - a.version)[0];
    return f ? listarArchivos("170", f.id) : [];
  }
}


/* ------------------------------------------------------------------ */
/* Portal del cliente                                                   */
/* ------------------------------------------------------------------ */

export function accesosDemo() {
  return estado().accesosPortal;
}

export class DemoRepositorioPortal implements RepositorioPortal {
  readonly cliente: Tercero;
  readonly usuario: { id: string; nombre: string; correo: string };

  constructor(acceso: { terceroId: string; usuarioId: string; nombre: string; correo: string }) {
    this.cliente = estado().terceros.find((t) => t.id === acceso.terceroId)!;
    this.usuario = { id: acceso.usuarioId, nombre: acceso.nombre, correo: acceso.correo };
  }

  get empresa() {
    return estado().empresa;
  }

  async cotizaciones() {
    return estado()
      .cotizaciones.filter((q) => q.clienteId === this.cliente.id && visibleParaCliente(q))
      .sort((a, b) => b.consecutivo.localeCompare(a.consecutivo))
      .map(cotizacionParaCliente);
  }

  async cotizacion(cotId: string) {
    return (await this.cotizaciones()).find((q) => q.id === cotId) ?? null;
  }

  async operaciones() {
    return estado()
      .operaciones.filter((o) => o.clienteId === this.cliente.id)
      .sort((a, b) => b.consecutivo.localeCompare(a.consecutivo))
      .map(operacionParaCliente);
  }

  async operacion(opId: string) {
    return (await this.operaciones()).find((o) => o.id === opId) ?? null;
  }

  async novedades(opId: string) {
    if (!(await this.operacion(opId))) return [];
    return estado()
      .comunicaciones.filter((c) => c.entidad === "operacion" && c.entidadId === opId && c.direccion === "saliente")
      .filter((c) => c.para.some((p) => this.cliente.contactos.some((k) => k.correo === p)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async documentos(opId: string) {
    if (!(await this.operacion(opId))) return [];
    return listarArchivos("do", opId);
  }

  async descargarDocumento(archivoId: string): Promise<Descarga> {
    const a = estado().archivos.find((x) => x.id === archivoId && x.clase === "do");
    const op = a && (await this.operacion(a.entidadId));
    if (!a || !op) throw new ErrorNegocio("Archivo no encontrado");
    return { bytes: a.bytes, mime: a.mime, nombre: a.nombre };
  }

  async facturas() {
    return estado().facturas.filter((f) => f.clienteId === this.cliente.id && f.estado === "emitida");
  }

  async formularios170() {
    return estado().formularios.filter((f) => f.terceroId === this.cliente.id);
  }

  async enviarFormulario170(datos: Datos170) {
    const s = estado();
    const previos = await this.formularios170();
    if (previos.some((f) => f.estado === "en_revision")) throw new ErrorNegocio("Ya tienes un formulario en revisión");
    s.formularios.push({
      id: id(),
      empresaId: s.empresa.id,
      terceroId: this.cliente.id,
      version: previos.reduce((m, f) => Math.max(m, f.version), 0) + 1,
      estado: "en_revision",
      diligenciadoEl: ahora(),
      datos,
    });
  }
}
