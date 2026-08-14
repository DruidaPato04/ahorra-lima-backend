import { makeVtexAdapter } from "./vtex.js";

// Verificado en vivo: robots.txt de wong.pe no bloquea /api/.
// Ejemplo real probado: "leche gloria" -> Crema de Leche Gloria 946ml, S/ 28.80.
export default makeVtexAdapter({
  id: "wong",
  name: "Wong",
  baseUrl: "https://www.wong.pe",
});
