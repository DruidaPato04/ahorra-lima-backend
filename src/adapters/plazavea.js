import { makeVtexAdapter } from "./vtex.js";

// Verificado en vivo: robots.txt de plazavea.com.pe solo bloquea /checkout.
// Ejemplo real probado: "leche gloria" -> Leche Entera UHT GLORIA Caja 946ml, S/ 6.20.
export default makeVtexAdapter({
  id: "plazavea",
  name: "Plaza Vea",
  baseUrl: "https://www.plazavea.com.pe",
});
