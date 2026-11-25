import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Comunicacion,
  Concepto,
  Cotizacion,
  Datos170,
  Empresa,
  EstadoCotizacion,
  Formulario170,
  Hito,
  Operacion,
  Tercero,
  Usuario,
} from "@/domain/types";
import { duplicarCotizacion, puedeTransicionar } from "@/domain/cotizacion";
import { HITOS_POR_TIPO } from "@/domain/operacion";
import { habilitadoParaDO, situacion170, vigenciaAlAprobar } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import type {
  DatosCotizacion,
  DecisionCliente,
  NuevoTercero,
  Repositorio,
  RepositorioPublico,
  VistaPublica,
} from "../repositorio";
import { ErrorNegocio } from "../errores";

/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipos generados */
type Fila = Record<string, any>;

/* ------------------------------------------------------------------ */
/* Mapeo fila ↔ dominio                                                */
/* ------------------------------------------------------------------ */

export const mapEmpresa = (r: Fila): Empresa => ({
  id: r.id,
  nit: r.nit,
  razonSocial: r.razon_social,
  ciudad: r.ciudad ?? "",
  colorPrimario: r.color_primario,
  prefijoCotizacion: r.prefijo_cotizacion,
  prefijoDO: r.prefijo_do,
  vigencia170Meses: r.vigencia_170_meses,
  bloquearDOSin170: r.bloquear_do_sin_170,
});

const mapTercero = (r: Fila): Tercero => ({
  id: r.id,
  empresaId: r.empresa_id,
  tipo: r.tipo,
  nit: r.nit,
  razonSocial: r.razon_social,
  ciudad: r.ciudad ?? "",
  contactos: (r.contactos ?? []).map((k: Fila) => ({
    id: k.id,
    nombre: k.nombre,
    cargo: k.cargo ?? "",
    correo: k.correo ?? "",
    telefono: k.telefono ?? undefined,
  })),
  acuerdo: r.acuerdos_comerciales
    ? {
        diaCorte: r.acuerdos_comerciales.dia_corte,
        plazoPagoDias: r.acuerdos_comerciales.plazo_pago_dias,
        moneda: r.acuerdos_comerciales.moneda,
        condiciones: r.acuerdos_comerciales.condiciones ?? undefined,
      }
    : undefined,
});

const mapConcepto = (r: Fila): Concepto => ({
  id: r.id,
  bloque: r.bloque,
  descripcion: r.descripcion,
  proveedorId: r.proveedor_id ?? undefined,
  proveedorNombre: r.proveedor?.razon_social ?? undefined,
  moneda: r.moneda,
  unidad: r.unidad ?? "embarque",
  cantidad: Number(r.cantidad),
  costoUnitario: Number(r.costo_unitario ?? r.costo_cotizado),
  ventaUnitaria: Number(r.venta_unitaria ?? r.venta),
  vigenciaTarifa: r.vigencia_tarifa ?? undefined,
  paraTerceros: r.para_terceros,
});

const mapCotizacion = (r: Fila): Cotizacion => ({
  id: r.id,
  empresaId: r.empresa_id,
  consecutivo: r.consecutivo,
  version: r.version,
  clienteId: r.cliente_id,
  contactoId: r.contacto_id ?? undefined,
  comercialId: r.comercial_id,
  tipoServicio: r.tipo_servicio,
  incoterm: r.incoterm,
  origen: r.origen,
  destino: r.destino,
  mercancia: { descripcion: "", piezas: 0, pesoKg: 0, volumenM3: 0, ...r.mercancia },
  conceptos: [...(r.cotizacion_conceptos ?? [])]
    .sort((a: Fila, b: Fila) => a.orden - b.orden)
    .map(mapConcepto),
  trm: Number(r.trm),
  monedaPresentacion: r.moneda_presentacion,
  fechaEmision: r.fecha_emision,
  vigenteHasta: r.vigente_hasta,
  estado: r.estado,
  terminos: r.terminos,
  origenId: r.origen_id ?? undefined,
  tokenPublico: "", // solo se conoce al emitir el enlace
  historial: (r.historial ?? []).map((h: Fila) => ({
    fecha: h.creado_el,
    usuario: h.usuario ?? "Sistema",
    accion: h.accion,
  })),
});

const mapFormulario = (r: Fila): Formulario170 => ({
  id: r.id,
  empresaId: r.empresa_id,
  terceroId: r.tercero_id,
  version: r.version,
  estado: r.estado,
  diligenciadoEl: r.diligenciado_el ?? undefined,
  aprobadoEl: r.aprobado_el ?? undefined,
  vigenteHasta: r.vigente_hasta ?? undefined,
  revisor: r.revisor_id ?? undefined,
  observaciones: r.observaciones ?? undefined,
  datos: r.datos,
});

const mapOperacion = (r: Fila): Operacion => ({
  id: r.id,
  empresaId: r.empresa_id,
  consecutivo: r.consecutivo,
  cotizacionId: r.cotizacion_id,
  clienteId: r.cliente_id,
  responsableId: r.responsable_id,
  tipo: r.tipo,
  origen: r.origen,
  destino: r.destino,
  estado: r.estado,
  abiertoEl: r.abierto_el,
  trm: Number(r.trm),
  conceptos: (r.do_conceptos ?? []).map(mapConcepto),
  costosReales: Object.fromEntries(
    (r.do_conceptos ?? [])
      .filter((c: Fila) => c.costo_real !== null)
      .map((c: Fila) => [c.id, Number(c.costo_real) * Number(c.cantidad)]),
  ),
  hitos: [...(r.do_hitos ?? [])]
    .sort((a: Fila, b: Fila) => a.orden - b.orden)
    .map((h: Fila) => ({
      id: h.id,
      nombre: h.nombre,
      estimada: h.estimada ?? undefined,
      real: h.real ?? undefined,
      nota: h.nota ?? undefined,
    })),
});

const aFilaCotizacion = (d: DatosCotizacion) => ({
  cliente_id: d.clienteId,
  contacto_id: d.contactoId ?? "",
  tipo_servicio: d.tipoServicio,
  incoterm: d.incoterm,
  origen: d.origen,
  destino: d.destino,
  mercancia: d.mercancia,
  trm: d.trm,
  moneda_presentacion: d.monedaPresentacion,
  vigente_hasta: d.vigenteHasta,
  terminos: d.terminos,
  conceptos: d.conceptos.map((c) => ({
    bloque: c.bloque,
    descripcion: c.descripcion,
    proveedor_id: c.proveedorId ?? "",
    moneda: c.moneda,
    unidad: c.unidad,
    cantidad: c.cantidad,
    costo_unitario: c.costoUnitario,
    venta_unitaria: c.ventaUnitaria,
    vigencia_tarifa: c.vigenciaTarifa ?? "",
    para_terceros: c.paraTerceros ?? false,
  })),
});

function falla(error: { message: string; code?: string } | null): void {
  if (!error) return;
  // Errores lanzados a propósito por las funciones SQL (P0001/P0002).
  if (error.code === "P0001" || error.code === "P0002") throw new ErrorNegocio(error.message);
  if (error.code === "42501") throw new ErrorNegocio("No tienes permiso para esta acción");
  throw new Error(error.message);
}

const SELECT_TERCERO = "*, contactos(*), acuerdos_comerciales(*)";
const SELECT_COTIZACION = "*, cotizacion_conceptos(*, proveedor:terceros(razon_social))";
const SELECT_OPERACION = "*, do_conceptos(*), do_hitos(*)";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/* ------------------------------------------------------------------ */
/* Repositorio autenticado (RLS)                                       */
/* ------------------------------------------------------------------ */

export class SupabaseRepositorio implements Repositorio {
  constructor(
    private readonly db: SupabaseClient,
    readonly empresa: Empresa,
    readonly usuario: Usuario,
  ) {}

  async usuarios(): Promise<Usuario[]> {
    const { data, error } = await this.db
      .from("usuarios_empresa")
      .select("usuario_id, nombre, roles")
      .eq("empresa_id", this.empresa.id)
      .eq("activo", true);
    falla(error);
    return (data ?? []).map((r) => ({ id: r.usuario_id, nombre: r.nombre, correo: "", roles: r.roles }));
  }

  async terceros(tipo?: Tercero["tipo"]) {
    let q = this.db.from("terceros").select(SELECT_TERCERO).eq("empresa_id", this.empresa.id);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, error } = await q.order("razon_social");
    falla(error);
    return (data ?? []).map(mapTercero);
  }

  async tercero(id: string) {
    const { data, error } = await this.db.from("terceros").select(SELECT_TERCERO).eq("id", id).maybeSingle();
    falla(error);
    return data ? mapTercero(data) : null;
  }

  async crearTercero(d: NuevoTercero) {
    const { data, error } = await this.db
      .from("terceros")
      .insert({ empresa_id: this.empresa.id, tipo: d.tipo, nit: d.nit, razon_social: d.razonSocial, ciudad: d.ciudad })
      .select("id")
      .single();
    if (error?.code === "23505") throw new ErrorNegocio(`Ya existe un ${d.tipo} con NIT ${d.nit}`);
    falla(error);
    if (d.contacto) {
      const { error: e2 } = await this.db
        .from("contactos")
        .insert({ empresa_id: this.empresa.id, tercero_id: data!.id, ...d.contacto });
      falla(e2);
    }
    return (await this.tercero(data!.id))!;
  }

  async cotizaciones() {
    const { data, error } = await this.db
      .from("cotizaciones")
      .select(SELECT_COTIZACION)
      .eq("empresa_id", this.empresa.id)
      .order("creado_el", { ascending: false })
      .limit(500);
    falla(error);
    return (data ?? []).map(mapCotizacion);
  }

  async cotizacion(id: string) {
    const { data, error } = await this.db.from("cotizaciones").select(SELECT_COTIZACION).eq("id", id).maybeSingle();
    falla(error);
    if (!data) return null;
    const q = mapCotizacion(data);
    q.historial = await this.historial("cotizaciones", id);
    return q;
  }

  /**
   * Historial legible a partir de la auditoría (solo visible para Admin y
   * Cumplimiento por RLS; para otros roles queda vacío).
   */
  private async historial(tabla: string, id: string) {
    const [{ data }, usuarios] = await Promise.all([
      this.db
        .from("auditoria")
        .select("accion, creado_el, usuario_id, antes, despues")
        .eq("tabla", tabla)
        .eq("registro_id", id)
        .order("creado_el"),
      this.usuarios(),
    ]);
    const nombre = (uid: string | null) =>
      uid ? (usuarios.find((u) => u.id === uid)?.nombre ?? "Usuario") : "Cliente o sistema";
    const etiquetas: Record<string, string> = {
      enviada: "Enviada al cliente",
      vista: "Abierta por el cliente",
      aceptada: "Aceptada",
      rechazada: "Rechazada",
      vencida: "Vencida",
      borrador: "Vuelve a borrador",
    };
    const eventos = [];
    for (const r of data ?? []) {
      const a = (r.antes ?? {}) as Fila;
      const d = (r.despues ?? {}) as Fila;
      let accion: string | null = null;
      if (r.accion === "insert") accion = d.origen_id ? "Creada como duplicado" : "Creada";
      else if (a.version !== d.version) accion = `Editada: versión ${d.version}`;
      else if (a.estado !== d.estado) accion = etiquetas[d.estado] ?? `Estado: ${d.estado}`;
      else if (a.token_hash !== d.token_hash) accion = "Enlace de aceptación emitido";
      if (accion) eventos.push({ fecha: r.creado_el, usuario: nombre(r.usuario_id), accion });
    }
    return eventos;
  }

  async guardarCotizacion(d: DatosCotizacion, id?: string) {
    const { data, error } = await this.db.rpc("guardar_cotizacion", {
      p_empresa: this.empresa.id,
      p_datos: aFilaCotizacion(d),
      p_id: id ?? null,
    });
    falla(error);
    return (await this.cotizacion(data as string))!;
  }

  async duplicarCotizacion(id: string, clienteId?: string) {
    const origen = await this.cotizacion(id);
    if (!origen) throw new ErrorNegocio("La cotización no existe");
    const cliente = clienteId ? await this.tercero(clienteId) : null;
    // La lógica de copia vive en el dominio; aquí solo se persiste el resultado.
    const { cotizacion, advertencias } = duplicarCotizacion(origen, {
      id: "",
      consecutivo: "",
      tokenPublico: "",
      comercialId: this.usuario.id,
      hoy: hoyISO(),
      vigenciaDias: 15,
      cliente: cliente ?? undefined,
      generarIdConcepto: () => "",
    });
    const { data, error } = await this.db.rpc("guardar_cotizacion", {
      p_empresa: this.empresa.id,
      p_datos: aFilaCotizacion(cotizacion),
      p_origen_id: origen.id,
    });
    falla(error);
    return { cotizacion: (await this.cotizacion(data as string))!, advertencias };
  }

  async cambiarEstadoCotizacion(id: string, estado: EstadoCotizacion) {
    const q = await this.cotizacion(id);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    if (!puedeTransicionar(q.estado, estado)) {
      throw new ErrorNegocio(`No se puede pasar de ${q.estado} a ${estado}`);
    }
    const { error } = await this.db.from("cotizaciones").update({ estado }).eq("id", id);
    falla(error);
  }

  async emitirEnlace(id: string) {
    const token = randomBytes(24).toString("base64url");
    const vence = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { error } = await this.db
      .from("cotizaciones")
      .update({ token_hash: hashToken(token), token_vence_el: vence })
      .eq("id", id);
    falla(error);
    return token;
  }

  async formularios170(terceroId?: string) {
    let q = this.db.from("formularios_170").select("*").eq("empresa_id", this.empresa.id);
    if (terceroId) q = q.eq("tercero_id", terceroId);
    const { data, error } = await q.order("version");
    falla(error);
    return (data ?? []).map(mapFormulario);
  }

  async revisarFormulario170(id: string, decision: "aprobado" | "devuelto" | "rechazado", observaciones?: string) {
    const hoy = hoyISO();
    const { error } = await this.db
      .from("formularios_170")
      .update({
        estado: decision,
        observaciones,
        revisor_id: this.usuario.id,
        ...(decision === "aprobado"
          ? { aprobado_el: hoy, vigente_hasta: vigenciaAlAprobar(hoy, this.empresa.vigencia170Meses) }
          : {}),
      })
      .eq("id", id)
      .eq("estado", "en_revision");
    falla(error);
  }

  async operaciones() {
    const { data, error } = await this.db
      .from("operaciones")
      .select(SELECT_OPERACION)
      .eq("empresa_id", this.empresa.id)
      .order("creado_el", { ascending: false })
      .limit(500);
    falla(error);
    return (data ?? []).map(mapOperacion);
  }

  async operacion(id: string) {
    const { data, error } = await this.db.from("operaciones").select(SELECT_OPERACION).eq("id", id).maybeSingle();
    falla(error);
    return data ? mapOperacion(data) : null;
  }

  async abrirOperacion(cotizacionId: string) {
    const q = await this.cotizacion(cotizacionId);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    const sit = situacion170(await this.formularios170(q.clienteId), hoyISO());
    if (this.empresa.bloquearDOSin170 && !habilitadoParaDO(sit)) {
      throw new ErrorNegocio(
        "El cliente no tiene la Circular 170 vigente y aprobada. Solicita la actualización antes de abrir el DO.",
      );
    }
    const responsable = (await this.usuarios()).find((u) => u.roles.includes("operaciones"))?.id ?? this.usuario.id;
    const { data, error } = await this.db.rpc("abrir_operacion", {
      p_cotizacion: cotizacionId,
      p_responsable: responsable,
      p_hitos: HITOS_POR_TIPO[q.tipoServicio],
    });
    falla(error);
    return (await this.operacion(data as string))!;
  }

  async actualizarHito(operacionId: string, h: Pick<Hito, "id" | "real" | "estimada" | "nota">) {
    const { error } = await this.db
      .from("do_hitos")
      .update({ real: h.real ?? null, estimada: h.estimada ?? null, nota: h.nota ?? null })
      .eq("id", h.id)
      .eq("operacion_id", operacionId);
    falla(error);
  }

  async comunicaciones(entidad: Comunicacion["entidad"], id: string) {
    const columna = { cotizacion: "cotizacion_id", operacion: "operacion_id", tercero: "tercero_id" }[entidad];
    const { data, error } = await this.db
      .from("comunicaciones")
      .select("*")
      .eq(columna, id)
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(
      (r): Comunicacion => ({
        id: r.id,
        empresaId: r.empresa_id,
        entidad,
        entidadId: id,
        direccion: r.direccion,
        asunto: r.asunto,
        para: r.para,
        resumen: (r.cuerpo_html ?? "").replace(/<[^>]+>/g, " ").slice(0, 240),
        fecha: r.creado_el,
        abiertoEl: r.abierto_el ?? undefined,
      }),
    );
  }

  async registrarComunicacion(c: Omit<Comunicacion, "id" | "empresaId" | "fecha">) {
    const columna = { cotizacion: "cotizacion_id", operacion: "operacion_id", tercero: "tercero_id" }[c.entidad];
    const { error } = await this.db.from("comunicaciones").insert({
      empresa_id: this.empresa.id,
      [columna]: c.entidadId,
      direccion: c.direccion,
      de: this.usuario.correo || "notificaciones@logiks.co",
      para: c.para,
      asunto: c.asunto,
      cuerpo_html: c.resumen,
    });
    falla(error);
  }
}

/* ------------------------------------------------------------------ */
/* Repositorio público (cliente de servicio + token validado)           */
/* ------------------------------------------------------------------ */

export class SupabaseRepositorioPublico implements RepositorioPublico {
  constructor(private readonly db: SupabaseClient) {}

  private async porToken(token: string) {
    const { data, error } = await this.db
      .from("cotizaciones")
      .select(SELECT_COTIZACION)
      .eq("token_hash", hashToken(token))
      .gt("token_vence_el", new Date().toISOString())
      .maybeSingle();
    falla(error);
    return data;
  }

  async cotizacionPorToken(token: string): Promise<VistaPublica | null> {
    const fila = await this.porToken(token);
    if (!fila) return null;
    const [emp, cli, forms] = await Promise.all([
      this.db.from("empresas").select("*").eq("id", fila.empresa_id).single(),
      this.db.from("terceros").select(SELECT_TERCERO).eq("id", fila.cliente_id).single(),
      this.db.from("formularios_170").select("*").eq("tercero_id", fila.cliente_id),
    ]);
    falla(emp.error ?? cli.error ?? forms.error);
    const cotizacion = mapCotizacion(fila);
    cotizacion.tokenPublico = token;
    return {
      cotizacion,
      empresa: mapEmpresa(emp.data!),
      cliente: mapTercero(cli.data!),
      formularios: (forms.data ?? []).map(mapFormulario),
    };
  }

  async marcarVista(token: string) {
    await this.db
      .from("cotizaciones")
      .update({ estado: "vista", vista_el: new Date().toISOString() })
      .eq("token_hash", hashToken(token))
      .eq("estado", "enviada");
  }

  async registrarDecision(token: string, d: DecisionCliente) {
    const fila = await this.porToken(token);
    if (!fila) throw new ErrorNegocio("Enlace inválido o vencido");
    if (!puedeTransicionar(fila.estado, d.decision)) {
      throw new ErrorNegocio("Esta cotización ya no admite respuesta");
    }
    const ev = await this.db.from("aceptaciones").insert({
      empresa_id: fila.empresa_id,
      cotizacion_id: fila.id,
      decision: d.decision,
      canal: "enlace",
      nombre: d.nombre,
      cargo: d.cargo,
      correo: d.correo,
      motivo: d.motivo,
      ip: d.ip ?? null,
      user_agent: d.userAgent ?? null,
    });
    falla(ev.error);
    const { error } = await this.db
      .from("cotizaciones")
      // El token es de un solo propósito: se invalida tras la decisión.
      .update({ estado: d.decision, token_vence_el: d.decision === "rechazada" ? new Date().toISOString() : fila.token_vence_el })
      .eq("id", fila.id);
    falla(error);
  }

  async enviarFormulario170(token: string, datos: Datos170) {
    const fila = await this.porToken(token);
    if (!fila) throw new ErrorNegocio("Enlace inválido o vencido");
    const { data: previos } = await this.db
      .from("formularios_170")
      .select("version")
      .eq("tercero_id", fila.cliente_id)
      .order("version", { ascending: false })
      .limit(1);
    const { error } = await this.db.from("formularios_170").insert({
      empresa_id: fila.empresa_id,
      tercero_id: fila.cliente_id,
      version: (previos?.[0]?.version ?? 0) + 1,
      estado: "en_revision",
      datos,
      diligenciado_el: new Date().toISOString(),
    });
    falla(error);
  }
}
