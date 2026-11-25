import "server-only";
import type {
  Comunicacion,
  Cotizacion,
  Datos170,
  EstadoCotizacion,
  Formulario170,
  Hito,
  Tercero,
  Usuario,
} from "@/domain/types";
import {
  duplicarCotizacion,
  formatearConsecutivo,
  puedeTransicionar,
  requiereNuevaVersion,
} from "@/domain/cotizacion";
import { crearOperacion } from "@/domain/operacion";
import { habilitadoParaDO, situacion170, vigenciaAlAprobar } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import { crearSemilla, type EstadoDemo } from "./semilla";
import type {
  DatosCotizacion,
  DecisionCliente,
  NuevoTercero,
  Repositorio,
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
    return estado().usuarios;
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
    if (op.estado === "abierto" && op.hitos.some((x) => x.nombre === "Salida" && x.real)) {
      op.estado = "en_transito";
    }
    if (op.hitos.some((x) => x.nombre === "Arribo" && x.real) && op.estado === "en_transito") {
      op.estado = "en_destino";
    }
    if (op.hitos.some((x) => (x.nombre === "Entrega" || x.nombre === "Cumplido") && x.real)) {
      op.estado = "entregado";
    }
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
}
