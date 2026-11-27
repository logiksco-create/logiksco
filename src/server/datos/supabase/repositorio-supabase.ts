import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcuerdoComercial,
  Archivo,
  Comunicacion,
  Contacto,
  Concepto,
  Cotizacion,
  Datos170,
  Empresa,
  EntradaCatalogo,
  EstadoCotizacion,
  Factura,
  CuentaFe,
  DatosFiscales,
  EstadoBotFe,
  TrabajoFe,
  IvaFinppi,
  Presentacion,
  Formulario170,
  Hito,
  Operacion,
  Rol,
  Tercero,
  TipoCatalogo,
  Usuario,
} from "@/domain/types";
import type { PayloadEmision } from "@/domain/einvoice";
import { duplicarCotizacion, puedeTransicionar } from "@/domain/cotizacion";
import { estadoSegunHitos, hitosDe } from "@/domain/operacion";
import { habilitadoParaDO, situacion170, vigenciaAlAprobar } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import { esImagenValida, rutaArchivo, rutaPertenece, validarArchivo, validarLogo } from "@/domain/archivos";
import { cotizacionParaCliente, operacionParaCliente } from "@/domain/portal";
import { correo } from "../../correo";
import { esTokenFirmado, verificarTokenFirmado } from "../../enlace-firmado";
import { plantillaCorreo } from "../../correo/plantilla";
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
  hitosPorTipo: r.hitos_por_tipo ?? {},
  terminos: r.terminos ?? undefined,
  servicios: r.servicios ?? [],
  configurada: r.configurada ?? true,
  logoUrl: r.logo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${r.logo_path}`
    : undefined,
});

const mapTercero = (r: Fila): Tercero => ({
  id: r.id,
  empresaId: r.empresa_id,
  tipo: r.tipo,
  nit: r.nit,
  razonSocial: r.razon_social,
  ciudad: r.ciudad ?? "",
  fiscal: r.fiscal && Object.keys(r.fiscal).length ? r.fiscal : undefined,
  contactos: (r.contactos ?? []).map((k: Fila) => ({
    id: k.id,
    nombre: k.nombre,
    cargo: k.cargo ?? "",
    correo: k.correo ?? "",
    telefono: k.telefono ?? undefined,
    cumpleanos: k.cumpleanos ?? undefined,
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
  productoFinppi: r.producto_finppi ?? undefined,
  ivaFinppi: r.iva_finppi ?? undefined,
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
  facturacion: r.facturacion ?? undefined,
  aceptacion: (() => {
    const a = [...(r.aceptaciones ?? [])]
      .filter((x: Fila) => x.decision === "aceptada")
      .sort((x: Fila, y: Fila) => String(y.creado_el).localeCompare(String(x.creado_el)))[0];
    return a
      ? { nombre: a.nombre, cargo: a.cargo ?? undefined, documento: a.documento ?? undefined, correo: a.correo, canal: a.canal, fecha: a.creado_el, ip: a.ip ?? undefined }
      : undefined;
  })(),
  aceptacionVerificadaEl: r.aceptacion_verificada_el ?? undefined,
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
  buzon: r.buzon ?? undefined,
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
  facturacion: d.facturacion ?? null,
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
    producto_finppi: c.productoFinppi ?? "",
    iva_finppi: c.ivaFinppi ?? "",
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
const SELECT_COTIZACION =
  "*, cotizacion_conceptos(*, proveedor:terceros(razon_social)), aceptaciones(nombre, cargo, correo, documento, canal, ip, creado_el, decision)";
const SELECT_OPERACION = "*, do_conceptos(*), do_hitos(*)";

const BUCKET = "documentos";

const mapFactura = (r: Fila): Factura => ({
  id: r.id,
  empresaId: r.empresa_id,
  clienteId: r.cliente_id,
  estado: r.estado,
  moneda: r.moneda,
  trm: Number(r.trm ?? 1),
  lineas: r.conceptos ?? [],
  operaciones: r.operaciones ?? [],
  creadoEl: r.creado_el,
  megafocoId: r.megafoco_id ?? undefined,
  numero: r.numero ?? undefined,
  cufe: r.cufe ?? undefined,
  pdfUrl: r.pdf_url ?? undefined,
  xmlUrl: r.xml_url ?? undefined,
  error: r.error ?? undefined,
  trmReferencia: r.trm_referencia != null ? Number(r.trm_referencia) : undefined,
  tipoPago: r.tipo_pago ?? undefined,
  metodoPago: r.metodo_pago ?? undefined,
  tipoOperacion: r.tipo_operacion ?? undefined,
  vencimiento: r.vencimiento ?? undefined,
  referencia: r.referencia ?? undefined,
  numeroEsperado: r.numero_esperado ?? undefined,
  fechaValidacion: r.fecha_validacion ?? undefined,
  totalCop: r.total_cop != null ? Number(r.total_cop) : undefined,
  pdfFinppiRuta: r.pdf_finppi_path ?? undefined,
  pdfFinppiSha256: r.pdf_finppi_sha256 ?? undefined,
  xmlRuta: r.xml_path ?? undefined,
  errorCodigo: r.error_codigo ?? undefined,
  enviadaClienteEl: r.enviada_cliente_el ?? undefined,
  enviarAlEmitir: r.enviar_al_emitir ?? true,
  simulada: r.simulada ?? false,
  presentacion: r.presentacion ?? undefined,
});

const mapTrabajo = (r: Fila): TrabajoFe => ({
  id: r.id,
  facturaId: r.factura_id ?? undefined,
  tipo: r.tipo,
  estado: r.estado,
  dryRun: r.dry_run,
  creadoEl: r.creado_el,
  terminadoEl: r.terminado_el ?? undefined,
  errorCodigo: r.error_codigo ?? undefined,
  error: r.error ?? undefined,
  resultado: r.resultado ?? {},
  logs: [...(r.fe_job_logs ?? [])]
    .sort((a: Fila, b: Fila) => a.id - b.id)
    .map((l: Fila) => ({ paso: l.paso, nivel: l.nivel, mensaje: l.mensaje, creadoEl: l.creado_el })),
});

const mapArchivo = (r: Fila): Archivo => ({
  id: r.id,
  tipo: r.tipo,
  nombre: r.nombre ?? r.storage_path?.split("/").pop() ?? "archivo",
  mime: r.mime ?? "application/octet-stream",
  tamano: Number(r.tamano ?? 0),
  creadoEl: r.creado_el,
});

function exigirValido(a: MetaArchivo) {
  const error = validarArchivo(a);
  if (error) throw new ErrorNegocio(error);
}

/**
 * Invita a un usuario y devuelve su id. Con correo propio (Resend) envía la
 * invitación con la marca de la empresa y un enlace verificable en el
 * servidor; si no, usa el correo de Supabase (canje en /auth/invitacion).
 * Si el correo ya tiene cuenta, solo devuelve su id.
 */
async function invitarCuenta(
  sv: SupabaseClient,
  d: { correo: string; nombre: string; empresa: Empresa; urlApp: string; portal?: boolean },
): Promise<string> {
  const datos = { nombre: d.nombre, ...(d.portal ? { portal: true } : {}) };
  if (correo().activo) {
    const { data, error } = await sv.auth.admin.generateLink({
      type: "invite",
      email: d.correo,
      options: { data: datos, redirectTo: `${d.urlApp}/auth/confirmar` },
    });
    if (data?.user && data.properties?.hashed_token) {
      const enlace = `${d.urlApp}/auth/confirmar?token_hash=${data.properties.hashed_token}&type=invite`;
      await correo().enviar({
        para: [d.correo],
        asunto: `${d.empresa.razonSocial} te invitó a ${d.portal ? "su portal de clientes" : "LOGIKS.CO"}`,
        nombreRemitente: d.empresa.razonSocial,
        html: plantillaCorreo({
          empresa: d.empresa.razonSocial,
          color: d.empresa.colorPrimario,
          logoUrl: d.empresa.logoUrl,
          titulo: `Hola ${d.nombre.split(" ")[0]}, te invitaron`,
          parrafos: [
            d.portal
              ? "Desde el portal verás tus cotizaciones, el seguimiento de tus cargas, documentos y facturas."
              : `${d.empresa.razonSocial} te invitó a trabajar en LOGIKS.CO.`,
            "Acepta la invitación y define tu contraseña. El enlace vence pronto y solo sirve una vez.",
          ],
          boton: { texto: "Aceptar invitación", url: enlace },
        }),
      });
      return data.user.id;
    }
    if (error && !/already|registered|exists/i.test(error.message)) throw new Error(error.message);
  } else {
    const inv = await sv.auth.admin.inviteUserByEmail(d.correo, {
      redirectTo: `${d.urlApp}/auth/invitacion`,
      data: datos,
    });
    if (inv.data?.user) return inv.data.user.id;
  }
  const { data } = await sv.rpc("usuario_por_correo", { p_correo: d.correo });
  if (!data) throw new ErrorNegocio("No se pudo enviar la invitación. Revisa el correo.");
  return data as string;
}

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
    /** Cliente con llave de servicio, solo para invitar usuarios. */
    private readonly servicio: () => SupabaseClient,
    private readonly urlApp: string,
  ) {}

  async usuarios(): Promise<Usuario[]> {
    const { data, error } = await this.db
      .from("usuarios_empresa")
      .select("usuario_id, nombre, roles, correo")
      .eq("empresa_id", this.empresa.id)
      .eq("activo", true)
      .order("nombre");
    falla(error);
    return (data ?? []).map((r) => ({ id: r.usuario_id, nombre: r.nombre, correo: r.correo ?? "", roles: r.roles }));
  }

  async accesosPortal(terceroId: string) {
    const { data, error } = await this.db
      .from("usuarios_cliente")
      .select("usuario_id, nombre, correo")
      .eq("empresa_id", this.empresa.id)
      .eq("tercero_id", terceroId)
      .eq("activo", true);
    falla(error);
    return (data ?? []).map((r) => ({ usuarioId: r.usuario_id, nombre: r.nombre, correo: r.correo }));
  }

  async invitarAlPortal(terceroId: string, d: { nombre: string; correo: string }) {
    if (!this.usuario.roles.some((r) => r === "comercial" || r === "admin")) {
      throw new ErrorNegocio("Solo Comercial puede invitar clientes al portal");
    }
    const t = await this.tercero(terceroId);
    if (!t || t.tipo === "proveedor") throw new ErrorNegocio("El cliente no existe");
    const usuarioId = await invitarCuenta(this.servicio(), {
      ...d,
      empresa: this.empresa,
      urlApp: this.urlApp,
      portal: true,
    });
    const { error } = await this.db.from("usuarios_cliente").upsert(
      {
        empresa_id: this.empresa.id,
        tercero_id: terceroId,
        usuario_id: usuarioId,
        nombre: d.nombre,
        correo: d.correo,
        activo: true,
        invitado_por: this.usuario.id,
      },
      { onConflict: "empresa_id,tercero_id,usuario_id" },
    );
    falla(error);
  }

  async prepararSubidaLogo(a: { nombre: string; mime: string; tamano: number }) {
    this.exigirAdmin();
    const error = validarLogo(a);
    if (error) throw new ErrorNegocio(error);
    const ext = a.mime === "image/png" ? "png" : "jpg";
    const ruta = `${this.empresa.id}/logo-${randomBytes(6).toString("hex")}.${ext}`;
    const { data, error: e } = await this.db.storage.from("logos").createSignedUploadUrl(ruta);
    if (e) throw new ErrorNegocio("No tienes permiso para cambiar el logo");
    return { ruta, token: data.token };
  }

  async guardarLogo(a: { ruta?: string; mime: string; tamano: number }) {
    this.exigirAdmin();
    const partes = a.ruta?.split("/") ?? [];
    if (partes.length !== 2 || partes[0] !== this.empresa.id || !/^logo-[0-9a-f]{12}\.(png|jpg)$/.test(partes[1])) {
      throw new ErrorNegocio("Ruta de logo inválida");
    }
    // Verifica que lo subido sea de verdad una imagen PNG/JPG.
    const { data: archivo } = await this.db.storage.from("logos").download(a.ruta!);
    const bytes = archivo ? new Uint8Array(await archivo.arrayBuffer()) : null;
    if (!bytes || !esImagenValida(bytes)) {
      await this.db.storage.from("logos").remove([a.ruta!]);
      throw new ErrorNegocio("El archivo no es una imagen PNG o JPG válida");
    }
    const { data: anterior } = await this.db.from("empresas").select("logo_path").eq("id", this.empresa.id).single();
    const { error } = await this.db.from("empresas").update({ logo_path: a.ruta }).eq("id", this.empresa.id);
    falla(error);
    if (anterior?.logo_path && anterior.logo_path !== a.ruta) await this.db.storage.from("logos").remove([anterior.logo_path]);
  }

  async quitarLogo() {
    this.exigirAdmin();
    const { data: anterior } = await this.db.from("empresas").select("logo_path").eq("id", this.empresa.id).single();
    const { error } = await this.db.from("empresas").update({ logo_path: null }).eq("id", this.empresa.id);
    falla(error);
    if (anterior?.logo_path) await this.db.storage.from("logos").remove([anterior.logo_path]);
  }

  async catalogo(tipo?: TipoCatalogo) {
    let q = this.db.from("catalogos").select("*").eq("activo", true).or(`empresa_id.is.null,empresa_id.eq.${this.empresa.id}`);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, error } = await q.order("nombre").limit(2000);
    falla(error);
    return (data ?? []).map(
      (r): EntradaCatalogo => ({
        id: r.id,
        tipo: r.tipo,
        nombre: r.nombre,
        codigo: r.codigo ?? undefined,
        base: r.empresa_id === null,
        datos: r.datos ?? {},
      }),
    );
  }

  async agregarCatalogo(e: Omit<EntradaCatalogo, "id" | "base">) {
    this.exigirAdmin();
    const { error } = await this.db.from("catalogos").insert({
      empresa_id: this.empresa.id,
      tipo: e.tipo,
      nombre: e.nombre,
      codigo: e.codigo ?? null,
      datos: e.datos,
    });
    if (error?.code === "23505") throw new ErrorNegocio("Ya existe en el catálogo");
    falla(error);
  }

  async eliminarCatalogo(id: string) {
    this.exigirAdmin();
    const { error } = await this.db.from("catalogos").update({ activo: false }).eq("id", id).eq("empresa_id", this.empresa.id);
    falla(error);
  }

  private exigirAdmin() {
    if (!this.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador puede cambiar la configuración");
  }

  async actualizarEmpresa(c: CambiosEmpresa) {
    this.exigirAdmin();
    const fila: Fila = {
      razon_social: c.razonSocial,
      ciudad: c.ciudad,
      color_primario: c.colorPrimario,
      prefijo_cotizacion: c.prefijoCotizacion,
      prefijo_do: c.prefijoDO,
      vigencia_170_meses: c.vigencia170Meses,
      bloquear_do_sin_170: c.bloquearDOSin170,
      hitos_por_tipo: c.hitosPorTipo,
      terminos: c.terminos,
      servicios: c.servicios,
      configurada: c.configurada,
    };
    for (const k of Object.keys(fila)) if (fila[k] === undefined) delete fila[k];
    const { error } = await this.db.from("empresas").update(fila).eq("id", this.empresa.id);
    falla(error);
  }

  async invitarUsuario(d: { correo: string; nombre: string; roles: Rol[] }) {
    this.exigirAdmin();
    const usuarioId = await invitarCuenta(this.servicio(), { ...d, empresa: this.empresa, urlApp: this.urlApp });
    const { error } = await this.db.from("usuarios_empresa").upsert(
      { empresa_id: this.empresa.id, usuario_id: usuarioId, nombre: d.nombre, correo: d.correo, roles: d.roles, activo: true },
      { onConflict: "empresa_id,usuario_id" },
    );
    falla(error);
  }

  async cambiarRoles(usuarioId: string, roles: Rol[]) {
    this.exigirAdmin();
    if (usuarioId === this.usuario.id && !roles.includes("admin")) {
      throw new ErrorNegocio("No puedes quitarte el rol de Administrador");
    }
    const { error } = await this.db
      .from("usuarios_empresa")
      .update({ roles })
      .eq("empresa_id", this.empresa.id)
      .eq("usuario_id", usuarioId);
    falla(error);
  }

  async desactivarUsuario(usuarioId: string) {
    this.exigirAdmin();
    if (usuarioId === this.usuario.id) throw new ErrorNegocio("No puedes desactivarte a ti mismo");
    const { error } = await this.db
      .from("usuarios_empresa")
      .update({ activo: false })
      .eq("empresa_id", this.empresa.id)
      .eq("usuario_id", usuarioId);
    falla(error);
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

  async guardarAcuerdo(terceroId: string, a: AcuerdoComercial) {
    const { error } = await this.db.from("acuerdos_comerciales").upsert(
      {
        tercero_id: terceroId,
        empresa_id: this.empresa.id,
        dia_corte: a.diaCorte,
        plazo_pago_dias: a.plazoPagoDias,
        moneda: a.moneda,
        condiciones: a.condiciones ?? null,
      },
      { onConflict: "tercero_id" },
    );
    falla(error);
  }

  async guardarContacto(terceroId: string, c: Omit<Contacto, "id"> & { id?: string }) {
    const fila = {
      empresa_id: this.empresa.id,
      tercero_id: terceroId,
      nombre: c.nombre,
      cargo: c.cargo || null,
      correo: c.correo || null,
      telefono: c.telefono || null,
      cumpleanos: c.cumpleanos || null,
    };
    const { error } = c.id
      ? await this.db.from("contactos").update(fila).eq("id", c.id).eq("tercero_id", terceroId)
      : await this.db.from("contactos").insert(fila);
    falla(error);
  }

  async eliminarContacto(terceroId: string, contactoId: string) {
    const { error } = await this.db.from("contactos").delete().eq("id", contactoId).eq("tercero_id", terceroId);
    falla(error);
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
      p_hitos: hitosDe(q.tipoServicio, this.empresa.hitosPorTipo),
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
    const op = await this.operacion(operacionId);
    if (op) {
      const estado = estadoSegunHitos(op);
      if (estado !== op.estado) {
        const { error: e2 } = await this.db.from("operaciones").update({ estado }).eq("id", operacionId);
        falla(e2);
      }
    }
  }

  async documentosDO(operacionId: string) {
    const { data, error } = await this.db
      .from("do_documentos")
      .select("*")
      .eq("operacion_id", operacionId)
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(mapArchivo);
  }

  async soportes170(formularioId: string) {
    // RLS: solo Cumplimiento y Admin ven filas.
    const { data, error } = await this.db
      .from("formulario_170_soportes")
      .select("*")
      .eq("formulario_id", formularioId)
      .order("creado_el");
    falla(error);
    return (data ?? []).map(mapArchivo);
  }

  async prepararSubidaDO(operacionId: string, a: MetaArchivo) {
    exigirValido(a);
    if (!(await this.operacion(operacionId))) throw new ErrorNegocio("El DO no existe");
    const ruta = rutaArchivo(this.empresa.id, "do", operacionId, randomBytes(8).toString("hex"), a.nombre);
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUploadUrl(ruta);
    if (error) throw new ErrorNegocio("No tienes permiso para subir documentos a este DO");
    return { ruta, token: data.token };
  }

  async registrarDocumentoDO(operacionId: string, a: NuevoArchivo) {
    exigirValido(a);
    if (!a.ruta || !rutaPertenece(a.ruta, this.empresa.id, "do", operacionId)) {
      throw new ErrorNegocio("Ruta de archivo inválida");
    }
    const { error } = await this.db.from("do_documentos").insert({
      empresa_id: this.empresa.id,
      operacion_id: operacionId,
      tipo: a.tipo,
      nombre: a.nombre,
      storage_path: a.ruta,
      mime: a.mime,
      tamano: a.tamano,
      subido_por: this.usuario.id,
    });
    falla(error);
  }

  async descargarArchivo(clase: "do" | "170", id: string): Promise<Descarga> {
    const tabla = clase === "do" ? "do_documentos" : "formulario_170_soportes";
    const { data, error } = await this.db.from(tabla).select("storage_path, nombre").eq("id", id).maybeSingle();
    falla(error);
    if (!data) throw new ErrorNegocio("Archivo no encontrado o sin permiso");
    const firmado = await this.db.storage
      .from(BUCKET)
      .createSignedUrl(data.storage_path, 60, { download: data.nombre ?? true });
    if (firmado.error) throw new ErrorNegocio("No se pudo generar el enlace de descarga");
    return { url: firmado.data.signedUrl };
  }

  async registrarCostoReal(operacionId: string, conceptoId: string, costoTotal: number | null) {
    const { data: c } = await this.db
      .from("do_conceptos")
      .select("cantidad")
      .eq("id", conceptoId)
      .eq("operacion_id", operacionId)
      .maybeSingle();
    if (!c) throw new ErrorNegocio("Concepto no encontrado");
    // Se guarda por unidad, igual que el costo cotizado.
    const unitario = costoTotal === null ? null : costoTotal / Number(c.cantidad);
    const { error } = await this.db.from("do_conceptos").update({ costo_real: unitario }).eq("id", conceptoId);
    falla(error);
  }

  async facturas() {
    const { data, error } = await this.db
      .from("facturas")
      .select("*")
      .eq("empresa_id", this.empresa.id)
      .order("creado_el", { ascending: false })
      .limit(500);
    falla(error);
    return (data ?? []).map(mapFactura);
  }

  async factura(id: string) {
    const { data, error } = await this.db.from("facturas").select("*").eq("id", id).maybeSingle();
    falla(error);
    return data ? mapFactura(data) : null;
  }

  async crearPrefactura(f: Omit<Factura, "id" | "empresaId" | "estado" | "creadoEl">) {
    const { data, error } = await this.db
      .from("facturas")
      .insert({
        empresa_id: this.empresa.id,
        cliente_id: f.clienteId,
        moneda: f.moneda,
        trm: f.trm,
        conceptos: f.lineas,
        operaciones: f.operaciones,
      })
      .select("*")
      .single();
    falla(error);
    return mapFactura(data!);
  }

  async actualizarLineas(id: string, lineas: Factura["lineas"]) {
    const { data, error } = await this.db
      .from("facturas")
      .update({ conceptos: lineas })
      .eq("id", id)
      .in("estado", ["borrador", "aprobada", "fallida", "rechazada"])
      .select("id");
    falla(error);
    if (!data?.length) throw new ErrorNegocio("Solo se edita una prefactura en borrador");
  }

  async actualizarFactura(id: string, c: Partial<Factura>) {
    const fila: Fila = {
      estado: c.estado,
      trm_referencia: c.trmReferencia,
      tipo_pago: c.tipoPago,
      metodo_pago: c.metodoPago,
      tipo_operacion: c.tipoOperacion,
      vencimiento: c.vencimiento,
      presentacion: c.presentacion,
      megafoco_id: c.megafocoId,
      numero: c.numero,
      cufe: c.cufe,
      pdf_url: c.pdfUrl,
      xml_url: c.xmlUrl,
      error: c.error,
      ...(c.estado === "en_cola" ? { enviada_el: new Date().toISOString() } : {}),
    };
    for (const k of Object.keys(fila)) if (fila[k] === undefined) delete fila[k];
    const { error } = await this.db.from("facturas").update(fila).eq("id", id);
    falla(error);
  }

  /* ---------- Facturación electrónica (Finppi) ---------- */

  async verificarAceptacion(cotizacionId: string) {
    const { data, error } = await this.db
      .from("cotizaciones")
      .update({ aceptacion_verificada_el: new Date().toISOString(), aceptacion_verificada_por: this.usuario.id })
      .eq("id", cotizacionId)
      .eq("empresa_id", this.empresa.id)
      .eq("estado", "aceptada")
      .select("id");
    falla(error);
    if (!data?.length) throw new ErrorNegocio("No se pudo marcar la verificación");
  }

  async guardarDatosFiscales(terceroId: string, fiscal: DatosFiscales) {
    const { data, error } = await this.db
      .from("terceros")
      .update({ fiscal, direccion: fiscal.direccion })
      .eq("id", terceroId)
      .eq("empresa_id", this.empresa.id)
      .select("id");
    falla(error);
    if (!data?.length) throw new ErrorNegocio("No tienes permiso para editar este cliente");
  }

  async cuentaFe(): Promise<CuentaFe | null> {
    const { data, error } = await this.db.from("fe_cuentas").select("*").eq("empresa_id", this.empresa.id).maybeSingle();
    falla(error);
    if (!data) return null;
    return {
      estado: data.estado,
      tieneCredenciales: data.tiene_credenciales,
      usuarioPista: data.usuario_pista ?? undefined,
      consentimientoEl: data.consentimiento_el ?? undefined,
      consentimientoVersion: data.consentimiento_version ?? undefined,
      ultimoLoginOk: data.ultimo_login_ok ?? undefined,
      instantanea: data.instantanea ?? {},
      resolucion: data.resolucion ?? undefined,
      condiciones: data.condiciones ?? undefined,
      presentacion: data.presentacion ?? undefined,
      modoEmision: data.modo_emision ?? "borrador",
    };
  }

  async guardarCredencialesFe(usuario: string, clave: string, version: string) {
    const { error } = await this.db.rpc("fe_guardar_credenciales", {
      p_empresa: this.empresa.id,
      p_usuario: usuario,
      p_clave: clave,
      p_version: version,
    });
    falla(error);
  }

  async desconectarFe() {
    const { error } = await this.db.rpc("fe_desconectar", { p_empresa: this.empresa.id });
    falla(error);
  }

  async probarConexionFe() {
    const { error } = await this.db.rpc("fe_probar_conexion", { p_empresa: this.empresa.id });
    falla(error);
  }

  async guardarProducto(p: { id?: string; nombre: string; codigo: string; iva: IvaFinppi }) {
    let datos: EntradaCatalogo["datos"] = { iva: p.iva, enFinppi: false, origen: "logiks" };
    if (p.id) {
      // Al editar se conserva lo que ya se sabe de Finppi (enFinppi, origen…).
      const { data: actual } = await this.db.from("catalogos").select("datos").eq("id", p.id).maybeSingle();
      datos = { ...(actual?.datos ?? {}), iva: p.iva };
    }
    const fila = { nombre: p.nombre, codigo: p.codigo, datos };
    const { data, error } = p.id
      ? await this.db
          .from("catalogos")
          .update(fila)
          .eq("id", p.id)
          .eq("empresa_id", this.empresa.id)
          .eq("tipo", "producto_finppi")
          .select("*")
          .single()
      : await this.db
          .from("catalogos")
          .insert({ ...fila, empresa_id: this.empresa.id, tipo: "producto_finppi" })
          .select("*")
          .single();
    if (error?.code === "23505") throw new ErrorNegocio(`Ya existe un producto con el código ${p.codigo} o ese nombre`);
    if (error?.code === "42501") throw new ErrorNegocio("Tu rol no permite crear productos");
    falla(error);
    return { id: data!.id, tipo: "producto_finppi", nombre: data!.nombre, codigo: data!.codigo, base: false, datos: data!.datos } as EntradaCatalogo;
  }

  async sincronizarProductosFe() {
    const { error } = await this.db.rpc("fe_sincronizar_productos", { p_empresa: this.empresa.id });
    falla(error);
  }

  async guardarModoEmisionFe(m: "borrador" | "real") {
    const { error } = await this.db.rpc("fe_guardar_modo", { p_empresa: this.empresa.id, p_modo: m });
    falla(error);
  }

  async descartarPruebaFe(facturaId: string) {
    const { error } = await this.db.rpc("fe_descartar_prueba", { p_factura: facturaId });
    falla(error);
  }

  async verificarPruebaFe(facturaId: string) {
    const { error } = await this.db.rpc("fe_verificar_prueba", { p_factura: facturaId });
    falla(error);
  }

  async reabrirPruebaFe(facturaId: string) {
    const { error } = await this.db.rpc("fe_reabrir_prueba", { p_factura: facturaId });
    falla(error);
  }

  async detenerEnvioFe(facturaId: string) {
    const { error } = await this.db.rpc("fe_detener_envio", { p_factura: facturaId });
    falla(error);
  }

  async guardarPresentacionFe(p: Presentacion) {
    const { error } = await this.db.rpc("fe_guardar_presentacion", { p_empresa: this.empresa.id, p_presentacion: p });
    falla(error);
  }

  async guardarTextosFe(t: { resolucion: string; condiciones: string }) {
    const { error } = await this.db.rpc("fe_guardar_textos", { p_empresa: this.empresa.id, p_resolucion: t.resolucion, p_condiciones: t.condiciones });
    falla(error);
  }

  async encolarEmision(facturaId: string, d: { payload: PayloadEmision; dryRun: boolean; enviarAlEmitir: boolean }) {
    const { error } = await this.db.rpc("fe_encolar_emision", {
      p_factura: facturaId,
      p_payload: d.payload,
      p_dry_run: d.dryRun,
      p_referencia: d.payload.referencia,
      p_total_cop: d.payload.totales.total,
      p_enviar_al_emitir: d.enviarAlEmitir,
    });
    if (error?.code === "23505") throw new ErrorNegocio("Ya hay un trabajo en curso para esta factura");
    falla(error);
  }

  async trabajosFe(facturaId?: string) {
    let q = this.db
      .from("fe_jobs")
      .select("*, fe_job_logs(*)")
      .eq("empresa_id", this.empresa.id)
      .order("creado_el", { ascending: false })
      .limit(20);
    q = facturaId ? q.eq("factura_id", facturaId) : q.in("tipo", ["healthcheck", "productos"]);
    const { data, error } = await q;
    falla(error);
    return (data ?? []).map(mapTrabajo);
  }

  async estadoBotFe(): Promise<EstadoBotFe> {
    const { data } = await this.db.from("fe_sistema").select("*").eq("id", 1).maybeSingle();
    return { latidoEl: data?.latido_el ?? undefined, pausado: data?.pausado ?? false, motivo: data?.motivo ?? undefined };
  }

  async descargarArchivoFe(facturaId: string, tipo: "pdf" | "xml"): Promise<Descarga | null> {
    const f = await this.factura(facturaId);
    const ruta = tipo === "pdf" ? f?.pdfFinppiRuta : f?.xmlRuta;
    if (!f || !ruta) return null;
    if (!ruta.startsWith(`${this.empresa.id}/fe/${f.id}/`)) throw new ErrorNegocio("Archivo no válido");
    const { data, error } = await this.servicio().storage.from(BUCKET).download(ruta);
    if (error || !data) throw new ErrorNegocio("No se pudo descargar el archivo de Finppi");
    const bytes = new Uint8Array(await data.arrayBuffer());
    return {
      nombre: `${f.numero ?? "factura"}${tipo === "pdf" ? ".pdf" : ".xml"}`,
      mime: tipo === "pdf" ? "application/pdf" : "application/xml",
      bytes,
    };
  }

  async marcarFacturaEnviada(facturaId: string) {
    const { error } = await this.servicio()
      .from("facturas")
      .update({ enviada_cliente_el: new Date().toISOString() })
      .eq("id", facturaId)
      .eq("empresa_id", this.empresa.id);
    falla(error);
  }

  async megafocoConectado() {
    const { data } = await this.db.from("empresas").select("megafoco_secret_id").eq("id", this.empresa.id).single();
    return !!data?.megafoco_secret_id;
  }

  async guardarLlaveMegafoco(llave: string) {
    const { error } = await this.db.rpc("guardar_llave_megafoco", { p_empresa: this.empresa.id, p_llave: llave });
    falla(error);
  }

  async llaveMegafoco() {
    const { data, error } = await this.servicio().rpc("llave_megafoco", { p_empresa: this.empresa.id });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
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
        entregadoEl: r.entregado_el ?? undefined,
        idProveedor: r.proveedor_id_mensaje ?? undefined,
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
      proveedor_id_mensaje: c.idProveedor ?? null,
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
    // Enlace firmado del PDF: válido para esa versión y hasta su vigencia.
    if (esTokenFirmado(token)) {
      const f = verificarTokenFirmado(token);
      if (!f) return null;
      const { data, error } = await this.db
        .from("cotizaciones")
        .select(SELECT_COTIZACION)
        .eq("id", f.id)
        .eq("version", f.version)
        .gte("vigente_hasta", hoyISO())
        .maybeSingle();
      falla(error);
      return data;
    }
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
    if (esTokenFirmado(token)) {
      const fila = await this.porToken(token);
      if (fila) await this.db.from("cotizaciones").update({ estado: "vista", vista_el: new Date().toISOString() }).eq("id", fila.id).eq("estado", "enviada");
      return;
    }
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
      canal: esTokenFirmado(token) ? "pdf" : "enlace",
      nombre: d.nombre,
      cargo: d.cargo,
      correo: d.correo,
      documento: d.documento ?? null,
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

  private async formularioActual(token: string) {
    const fila = await this.porToken(token);
    if (!fila) throw new ErrorNegocio("Enlace inválido o vencido");
    const { data } = await this.db
      .from("formularios_170")
      .select("id, estado, empresa_id")
      .eq("tercero_id", fila.cliente_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || !["en_revision", "devuelto", "pendiente"].includes(data.estado)) {
      throw new ErrorNegocio("Primero envía el formulario 170");
    }
    return data as { id: string; empresa_id: string };
  }

  async prepararSoporte170(token: string, a: MetaArchivo) {
    exigirValido(a);
    const f = await this.formularioActual(token);
    const ruta = rutaArchivo(f.empresa_id, "170", f.id, randomBytes(8).toString("hex"), a.nombre);
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUploadUrl(ruta);
    if (error) throw new Error(error.message);
    return { ruta, token: data.token };
  }

  async registrarSoporte170(token: string, a: NuevoArchivo) {
    exigirValido(a);
    const f = await this.formularioActual(token);
    if (!a.ruta || !rutaPertenece(a.ruta, f.empresa_id, "170", f.id)) {
      throw new ErrorNegocio("Ruta de archivo inválida");
    }
    // El objeto debe existir realmente en Storage antes de registrarlo.
    const carpeta = a.ruta.split("/").slice(0, 3).join("/");
    const { data: objetos } = await this.db.storage.from(BUCKET).list(carpeta, { search: a.ruta.split("/")[3] });
    if (!objetos?.length) throw new ErrorNegocio("El archivo no terminó de subir");
    const { error } = await this.db.from("formulario_170_soportes").insert({
      empresa_id: f.empresa_id,
      formulario_id: f.id,
      tipo: a.tipo,
      nombre: a.nombre,
      storage_path: a.ruta,
      mime: a.mime,
      tamano: a.tamano,
    });
    falla(error);
  }

  async soportesPorToken(token: string) {
    const fila = await this.porToken(token);
    if (!fila) return [];
    const { data: f } = await this.db
      .from("formularios_170")
      .select("id")
      .eq("tercero_id", fila.cliente_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!f) return [];
    const { data } = await this.db.from("formulario_170_soportes").select("*").eq("formulario_id", f.id);
    return (data ?? []).map(mapArchivo);
  }
}


/* ------------------------------------------------------------------ */
/* Portal del cliente: cliente de servicio, siempre filtrado por        */
/* (empresa, cliente) y sin costos. El usuario ya fue autenticado.      */
/* ------------------------------------------------------------------ */

export class SupabaseRepositorioPortal implements RepositorioPortal {
  constructor(
    private readonly db: SupabaseClient,
    readonly empresa: Empresa,
    readonly cliente: Tercero,
    readonly usuario: { id: string; nombre: string; correo: string },
  ) {}

  async cotizaciones() {
    const { data, error } = await this.db
      .from("cotizaciones")
      .select(SELECT_COTIZACION)
      .eq("empresa_id", this.empresa.id)
      .eq("cliente_id", this.cliente.id)
      .neq("estado", "borrador")
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(mapCotizacion).map(cotizacionParaCliente);
  }

  async cotizacion(id: string) {
    return (await this.cotizaciones()).find((q) => q.id === id) ?? null;
  }

  async operaciones() {
    const { data, error } = await this.db
      .from("operaciones")
      .select(SELECT_OPERACION)
      .eq("empresa_id", this.empresa.id)
      .eq("cliente_id", this.cliente.id)
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(mapOperacion).map(operacionParaCliente);
  }

  async operacion(id: string) {
    const { data, error } = await this.db
      .from("operaciones")
      .select(SELECT_OPERACION)
      .eq("id", id)
      .eq("empresa_id", this.empresa.id)
      .eq("cliente_id", this.cliente.id)
      .maybeSingle();
    falla(error);
    return data ? operacionParaCliente(mapOperacion(data)) : null;
  }

  async novedades(operacionId: string) {
    if (!(await this.operacion(operacionId))) return [];
    const { data, error } = await this.db
      .from("comunicaciones")
      .select("*")
      .eq("empresa_id", this.empresa.id)
      .eq("operacion_id", operacionId)
      .eq("direccion", "saliente")
      // Solo lo enviado al cliente: nunca las solicitudes a proveedores.
      .overlaps("para", this.cliente.contactos.map((k) => k.correo).filter(Boolean).concat(["__sin_contactos__"]))
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(
      (r): Comunicacion => ({
        id: r.id,
        empresaId: r.empresa_id,
        entidad: "operacion",
        entidadId: operacionId,
        direccion: "saliente",
        asunto: r.asunto,
        para: [],
        resumen: (r.cuerpo_html ?? "").replace(/<[^>]+>/g, " ").slice(0, 600),
        fecha: r.creado_el,
      }),
    );
  }

  async documentos(operacionId: string) {
    if (!(await this.operacion(operacionId))) return [];
    const { data, error } = await this.db
      .from("do_documentos")
      .select("*")
      .eq("empresa_id", this.empresa.id)
      .eq("operacion_id", operacionId)
      .eq("visible_cliente", true)
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(mapArchivo);
  }

  async descargarDocumento(id: string): Promise<Descarga> {
    const { data } = await this.db
      .from("do_documentos")
      .select("storage_path, nombre, operacion_id, visible_cliente")
      .eq("id", id)
      .eq("empresa_id", this.empresa.id)
      .maybeSingle();
    if (!data || !data.visible_cliente || !(await this.operacion(data.operacion_id))) {
      throw new ErrorNegocio("Archivo no encontrado");
    }
    const f = await this.db.storage.from(BUCKET).createSignedUrl(data.storage_path, 60, { download: data.nombre ?? true });
    if (f.error) throw new ErrorNegocio("No se pudo generar el enlace de descarga");
    return { url: f.data.signedUrl };
  }

  async facturas() {
    const { data, error } = await this.db
      .from("facturas")
      .select("*")
      .eq("empresa_id", this.empresa.id)
      .eq("cliente_id", this.cliente.id)
      .eq("estado", "emitida")
      .order("creado_el", { ascending: false });
    falla(error);
    return (data ?? []).map(mapFactura);
  }

  async formularios170() {
    const { data, error } = await this.db
      .from("formularios_170")
      .select("*")
      .eq("empresa_id", this.empresa.id)
      .eq("tercero_id", this.cliente.id)
      .order("version");
    falla(error);
    return (data ?? []).map(mapFormulario);
  }

  async enviarFormulario170(datos: Datos170) {
    const previos = await this.formularios170();
    if (previos.some((f) => f.estado === "en_revision")) throw new ErrorNegocio("Ya tienes un formulario en revisión");
    const { error } = await this.db.from("formularios_170").insert({
      empresa_id: this.empresa.id,
      tercero_id: this.cliente.id,
      version: previos.reduce((m, f) => Math.max(m, f.version), 0) + 1,
      estado: "en_revision",
      datos,
      diligenciado_el: new Date().toISOString(),
      firma: { usuario: this.usuario.id, correo: this.usuario.correo, fecha: new Date().toISOString() },
    });
    falla(error);
  }
}

/** Resuelve el acceso al portal del usuario autenticado (o null). */
export async function repositorioPortalDe(
  db: SupabaseClient,
  servicio: SupabaseClient,
  uid: string,
  terceroPreferido?: string,
): Promise<SupabaseRepositorioPortal | null> {
  // RLS: el usuario solo ve sus propios accesos.
  const { data: accesos } = await db
    .from("usuarios_cliente")
    .select("empresa_id, tercero_id, nombre, correo")
    .eq("usuario_id", uid)
    .eq("activo", true);
  if (!accesos?.length) return null;
  const a = accesos.find((x) => x.tercero_id === terceroPreferido) ?? accesos[0];
  const [emp, ter] = await Promise.all([
    servicio.from("empresas").select("*").eq("id", a.empresa_id).single(),
    servicio.from("terceros").select(SELECT_TERCERO).eq("id", a.tercero_id).eq("empresa_id", a.empresa_id).single(),
  ]);
  if (!emp.data || !ter.data) return null;
  return new SupabaseRepositorioPortal(servicio, mapEmpresa(emp.data), mapTercero(ter.data), {
    id: uid,
    nombre: a.nombre,
    correo: a.correo,
  });
}
