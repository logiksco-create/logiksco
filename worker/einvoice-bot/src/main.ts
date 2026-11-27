import { config } from "./config.ts";
import * as db from "./db.ts";
import { ADAPTER_VERSION } from "./adapters/finppi/selectors.ts";
import { ErrorBot, debePausar, type CodigoError } from "./logica.ts";
import { ReintentoProgramado, emitir, healthcheck, reconciliar, sincronizarProductos } from "./flujos.ts";
import { cerrarNavegador } from "./navegador.ts";

/**
 * Bucle del bot: latido, reclamar un trabajo (uno por empresa a la vez,
 * respetando la pausa global), ejecutarlo y registrar el resultado.
 * Corre en un servidor propio (Railway, Fly.io o VPS), nunca en Vercel.
 */

const ultimos: (CodigoError | null)[] = [];
let detener = false;

async function procesar(job: db.Job) {
  const inicio = Date.now();
  try {
    if (job.tipo === "healthcheck") await healthcheck(job);
    else if (job.tipo === "emitir") await emitir(job);
    else if (job.tipo === "productos") await sincronizarProductos(job);
    else await reconciliar(job);
    await db.actualizarJob(job.id, { estado: "ok", terminado_el: new Date().toISOString(), adapter_version: ADAPTER_VERSION });
    ultimos.push(null);
  } catch (e) {
    if (e instanceof ReintentoProgramado) return;
    const codigo = e instanceof ErrorBot ? e.codigo : null;
    const estado = (e as { estadoJob?: string }).estadoJob ?? "fallido";
    await db.actualizarJob(job.id, {
      estado,
      terminado_el: new Date().toISOString(),
      error_codigo: codigo,
      error: e instanceof Error ? e.message.slice(0, 500) : "Error",
      adapter_version: ADAPTER_VERSION,
    });
    ultimos.push(codigo);
    // Circuit breaker (§7): dos selectores perdidos seguidos pausan todo.
    if (debePausar(ultimos)) {
      await db.pausarSistema("Dos SELECTOR_NOT_FOUND seguidos: Finppi pudo haber cambiado. Revisar selectors.ts.");
      console.error("[bot] PAUSA GLOBAL por selectores");
    }
  } finally {
    ultimos.splice(0, Math.max(0, ultimos.length - 5));
    console.log(`[bot] ${job.tipo} ${job.id.slice(0, 8)} en ${Math.round((Date.now() - inicio) / 1000)} s`);
  }
}

async function main() {
  console.log(`[bot] ${config.unaVez ? "bajo demanda · " : ""}${config.workerId} · adaptador ${ADAPTER_VERSION} · emisión real ${config.permitirEmision ? "HABILITADA" : "deshabilitada (solo pruebas)"}`);
  const inicio = Date.now();
  while (!detener) {
    try {
      const activo = await db.latido(ADAPTER_VERSION);
      const job = activo ? await db.reclamarJob() : null;
      if (job) {
        await procesar(job);
        continue;
      }
      // Bajo demanda (GitHub Actions): vacía la cola y se apaga. Si hay un
      // trabajo programado para dentro de poco (p. ej. una verificación), lo espera.
      if (config.unaVez) {
        const pronto = activo ? await db.trabajosProximos(3 * 60_000) : 0;
        if (!pronto || Date.now() - inicio > config.maxMinutos * 60_000) {
          console.log(`[bot] cola vacía${pronto ? " (tiempo máximo alcanzado)" : ""}: me apago`);
          break;
        }
      }
    } catch (e) {
      console.error("[bot]", e instanceof Error ? e.message : e);
      if (config.unaVez && Date.now() - inicio > config.maxMinutos * 60_000) break;
    }
    await new Promise((r) => setTimeout(r, config.unaVez ? 10_000 : config.intervaloMs));
  }
  await cerrarNavegador();
}

for (const s of ["SIGINT", "SIGTERM"] as const) {
  process.on(s, () => {
    // Termina el trabajo en curso antes de salir (nunca a mitad de «Enviar»).
    detener = true;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
