import { z } from "zod";

// Mensajes de validación en español para todo el servidor.
z.config(z.locales.es());

export { z };
