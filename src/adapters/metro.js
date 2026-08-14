import { makeVtexAdapter } from "./vtex.js";

// Verificado en vivo: robots.txt de metro.pe no bloquea /api/.
// Ejemplo real probado: "leche gloria" -> Crema de Leche Gloria 946ml, S/ 26.40.
export default makeVtexAdapter({
  id: "metro",
  name: "Metro",
  baseUrl: "https://www.metro.pe",
});
