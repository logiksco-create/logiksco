import "server-only";
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
    if (f.estado !== "borrador") throw new ErrorNegocio("Solo se edita una prefactura en borrador");
    f.lineas = lineas;
  }

  async actualizarFactura(facturaId: string, cambios: Partial<Factura>) {
    const f = await this.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    Object.assign(f, cambios);
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
    const cotizacion = s.cotizaciones.find((q) => q.tokenPublico === token);
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
    q.historial.push({
      fecha: ahora(),
      usuario: `${d.nombre} (${d.cargo})`,
      accion:
        d.decision === "aceptada"
          ? `Aceptada en línea por ${d.correo} desde ${d.ip ?? "IP no disponible"}`
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
