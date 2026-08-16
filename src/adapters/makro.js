import { makeVtexAdapter } from "./vtex.js";

// Makro Perú corre en el mismo VTEX que Plaza Vea (mismo grupo, InRetail).
// Verificado en vivo: robots.txt de makro.plazavea.com.pe no bloquea /api/.
// Ejemplo real probado: "leche" -> Leche Entera UHT LAIVE Bolsa 800ml.
export default makeVtexAdapter({
  id: "makro",
  name: "Makro",
  baseUrl: "https://www.makro.plazavea.com.pe",
});
