import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "./config.ts";

/**
 * Chromium precalentado: un proceso siempre abierto; cada trabajo usa un
 * contexto limpio (sin cookies ni tokens de trabajos anteriores, §9D).
 */
let navegador: Browser | null = null;

export async function contextoLimpio(): Promise<BrowserContext> {
  if (!navegador?.isConnected()) {
    navegador = await chromium.launch({ headless: config.headless, executablePath: process.env.CHROMIUM_PATH || undefined });
  }
  const ctx = await navegador.newContext({ acceptDownloads: true, locale: "es-CO", timezoneId: "America/Bogota" });
  // Sin imágenes, fuentes ni chats de soporte: más rápido y menos ruido.
  await ctx.route("**/*", (r) => {
    const t = r.request().resourceType();
    const u = r.request().url();
    if (t === "image" || t === "font" || t === "media" || /tawk|hotjar|google-analytics|googletagmanager/.test(u)) return r.abort();
    return r.continue();
  });
  return ctx;
}

export async function cerrarNavegador() {
  await navegador?.close().catch(() => undefined);
  navegador = null;
}
