import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  Copy,
  FileSignature,
  Mail,
  Receipt,
  ShieldCheck,
  Ship,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/marca";
import { clasesBoton } from "@/components/ui";
import { cn } from "@/lib/formato";

const pilares = [
  {
    icono: Copy,
    titulo: "Cotiza en minutos",
    texto: "Duplica cualquier cotización y cambia lo que quieras, incluso el cliente. Utilidad y margen se calculan mientras escribes, en COP y USD.",
  },
  {
    icono: ShieldCheck,
    titulo: "Circular 170 integrada",
    texto: "El cliente acepta en línea y diligencia su formulario 170 en el mismo paso. Recordatorios de actualización a 30, 15 y 5 días.",
  },
  {
    icono: BellRing,
    titulo: "Tarifas que no se vencen a escondidas",
    texto: "Alerta automática si el booking sale después de la vigencia de la tarifa del proveedor. Re-cotiza antes de perder margen.",
  },
  {
    icono: Mail,
    titulo: "Todo correo, con respaldo",
    texto: "Cada mensaje queda ligado a la cotización o al DO en una línea de tiempo inmutable. Ante un reclamo, la evidencia está a un clic.",
  },
  {
    icono: Ship,
    titulo: "Operaciones bajo control",
    texto: "DO con hitos configurables, notificaciones al cliente con plantillas y utilidad real frente a la cotizada.",
  },
  {
    icono: Receipt,
    titulo: "Factura sin digitar dos veces",
    texto: "La prefactura viaja a Megafoco y se emite electrónicamente. Ingresos propios y para terceros, separados desde el origen.",
  },
];

const pasos = [
  ["Cotiza", "Duplica, ajusta y envía con un enlace seguro."],
  ["El cliente acepta", "En línea, con evidencia de nombre, correo, fecha e IP."],
  ["Circular 170", "Si no está vigente, la diligencia en ese momento."],
  ["Abre el DO", "Hitos, alertas y novedades al cliente."],
  ["Factura", "Directo a contabilidad y factura electrónica."],
];

const planes = [
  { nombre: "Básico", para: "Operador pequeño", usuarios: "Hasta 3 usuarios", dos: "30 DO al mes", destacado: false, incluye: ["Cotizador y duplicar", "Circular 170 en línea", "Operaciones y alertas", "Portal del cliente", "Facturación vía Megafoco"] },
  { nombre: "Profesional", para: "Agente de carga en crecimiento", usuarios: "Hasta 10 usuarios", dos: "150 DO al mes", destacado: true, incluye: ["Todo lo del Básico", "CRM y seguimiento", "Marca blanca y subdominio", "Correo entrante por DO", "Reportes avanzados"] },
  { nombre: "Empresarial", para: "Operador mediano", usuarios: "Usuarios ilimitados", dos: "DO ilimitados", destacado: false, incluye: ["Todo lo del Profesional", "Otros software contables", "Integraciones a la medida", "Soporte prioritario"] },
];

export default function Inicio() {
  return (
    <div className="bg-bg">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#070b17] text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="pointer-events-none absolute -top-48 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,107,255,0.35),transparent)]" />
        <div className="pointer-events-none absolute top-40 -right-40 size-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(20,200,180,0.18),transparent)]" />

        <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo claro />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white">
              Ingresar
            </Link>
            <Link href="/registro" className={cn(clasesBoton({ tamano: "sm" }), "bg-white text-[#0a0f1f] hover:bg-white/90")}>
              Crear cuenta
            </Link>
          </nav>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 text-center sm:px-6 sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Sparkles className="size-3.5 text-[#14c8b4]" /> Hecho para Colombia: NIT, RUT, pesos, dólares y DIAN
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            El sistema operativo de tu{" "}
            <span className="bg-gradient-to-r from-[#8da0ff] via-[#6a83ff] to-[#14c8b4] bg-clip-text text-transparent">
              operación logística
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60 text-pretty">
            Cotiza en minutos, haz que tu cliente acepte y cumpla la Circular 170 en línea, y no pierdas el rastro de
            una carga ni de un correo. De la cotización a la factura, en un solo lugar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/app" className={cn(clasesBoton({ tamano: "lg" }), "w-full sm:w-auto")}>
              Explorar la demo <ArrowRight />
            </Link>
            <Link
              href="/registro"
              className={cn(clasesBoton({ tamano: "lg", variante: "fantasma" }), "w-full text-white/80 ring-1 ring-white/15 hover:bg-white/5 hover:text-white sm:w-auto")}
            >
              Prueba gratis 14 días
            </Link>
          </div>

          {/* Vista previa */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="absolute -inset-x-10 -inset-y-6 rounded-[32px] bg-gradient-to-b from-[#3b5bfd]/20 to-transparent blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur">
              <div className="rounded-xl bg-[#0d1326] p-5 text-left sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs text-white/40">COT-2026-0042 · v1</p>
                    <p className="mt-1 text-lg font-semibold">Ningbo → Rionegro · 2×40HC</p>
                  </div>
                  <span className="rounded-full bg-[#14c8b4]/15 px-2.5 py-1 text-xs font-medium text-[#5eead4]">Aceptada</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Total al cliente", "$ 43.366.800"],
                    ["Utilidad", "$ 5.377.100"],
                    ["Circular 170", "Vigente ✓"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/5">
                      <p className="text-xs text-white/40">{k}</p>
                      <p className="mt-1 font-semibold tabular">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-2.5">
                  {[
                    ["Carga lista", 100, "#14c8b4"],
                    ["Booking", 100, "#14c8b4"],
                    ["En tránsito", 55, "#6a83ff"],
                  ].map(([k, w, c]) => (
                    <div key={k as string} className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-white/50">{k}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: c as string }} />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-start gap-3 rounded-lg border border-[#ff5d6c]/25 bg-[#ff5d6c]/10 p-3 text-xs text-[#ffb3ba]">
                  <BellRing className="mt-px size-4 shrink-0" />
                  La tarifa del flete vence el 27 nov y el booking sale el 1 dic. Pide actualización al proveedor.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-brand-fg">Todo en un solo lugar</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Adiós a Excel, WhatsApp y buzones personales
          </h2>
          <p className="mt-4 text-muted">
            Para agentes de carga, operadores logísticos, agencias de aduanas y operadores multimodales de 2 a 50 personas.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pilares.map(({ icono: Icono, titulo, texto }) => (
            <div key={titulo} className="group rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-pop">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white shadow-[0_6px_16px_-6px_var(--brand)]">
                <Icono className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">{titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flujo */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">De la cotización a la factura</h2>
          <ol className="mt-12 grid gap-6 sm:grid-cols-5">
            {pasos.map(([t, d], i) => (
              <li key={t} className="relative text-center">
                {i < pasos.length - 1 && (
                  <span className="absolute top-5 left-[calc(50%+28px)] hidden h-px w-[calc(100%-56px)] bg-gradient-to-r from-border-strong to-border sm:block" />
                )}
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-fg ring-4 ring-surface">
                  {i + 1}
                </span>
                <p className="mt-4 font-medium">{t}</p>
                <p className="mt-1 text-[13px] text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Planes */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Planes que crecen contigo</h2>
          <p className="mt-4 text-muted">Empieza con 14 días gratis y todas las funciones. Pago mensual o anual en pesos, con tarjeta o PSE.</p>
        </div>
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {planes.map((p) => (
            <div
              key={p.nombre}
              className={cn(
                "relative rounded-2xl border p-7",
                p.destacado ? "border-brand bg-surface shadow-pop ring-1 ring-brand" : "border-border bg-surface shadow-card",
              )}
            >
              {p.destacado && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">Recomendado</span>
              )}
              <p className="text-lg font-semibold">{p.nombre}</p>
              <p className="text-sm text-muted">{p.para}</p>
              <p className="mt-6 text-sm font-medium">{p.usuarios}</p>
              <p className="text-sm text-muted">{p.dos}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.incluye.map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
              <Link href="/registro" className={cn(clasesBoton({ variante: p.destacado ? "primario" : "secundario" }), "mt-8 w-full")}>
                Empezar prueba
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-subtle">Precios por definir durante el piloto.</p>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0a0f1f] px-6 py-16 text-center text-white">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,107,255,0.4),transparent)]" />
          <FileSignature className="relative mx-auto size-8 text-[#14c8b4]" />
          <h2 className="relative mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-balance">
            Registra tu empresa y envía tu primera cotización en menos de 30 minutos
          </h2>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro" className={cn(clasesBoton({ tamano: "lg" }), "bg-white text-[#0a0f1f] hover:bg-white/90")}>
              Crear cuenta gratis <ArrowRight />
            </Link>
            <Link href="/app" className="text-sm font-medium text-white/70 hover:text-white">
              o explora la demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} LOGIKS.CO · Hecho en Colombia</p>
        </div>
      </footer>
    </div>
  );
}
