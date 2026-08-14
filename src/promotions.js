// Detección de promociones.
//
// Lo confiable: el descuento numérico (price vs listPrice) — siempre disponible.
// Lo NO confiable: la etiqueta "2x1"/"3x2" como dato estructurado. Verificado en
// vivo contra Wong: el campo que VTEX diseñó para esto (Teasers/PromotionTeasers)
// venía vacío en productos que sí tenían descuento activo, y la propia colección
// "/2x1" del sitio resultó ser una búsqueda de texto libre, no una lista curada
// (un producto de esa lista no tenía "2x1" en ningún lado de su página).
//
// Por eso esto es un heurístico de mejor esfuerzo, no una fuente de verdad.
// Se marca siempre con su nivel de confianza para que el frontend pueda
// decidir si mostrarlo como badge fuerte o como nota secundaria.

const KEYWORD_PATTERNS = [
  { label: "2x1", pattern: /\b2\s*x\s*1\b/i },
  { label: "3x2", pattern: /\b3\s*x\s*2\b/i },
  { label: "2da unidad con descuento", pattern: /segunda unidad|2d[ao]\s*unidad/i },
  { label: "Lleva más, paga menos", pattern: /lleva\s*\d+.*paga\s*\d+/i },
  { label: "Remate", pattern: /\bremate\b/i },
];

/**
 * @param {{name:string, listPrice?:number, price:number, teasers?:string[]}} candidate
 * @returns {{label: string, source: 'teaser'|'nombre', confidence: 'alta'|'media'} | null}
 */
export function detectPromotion(candidate) {
  // Confianza alta: vino en el campo que la propia tienda diseñó para esto.
  if (candidate.teasers && candidate.teasers.length > 0) {
    return { label: candidate.teasers[0], source: "teaser", confidence: "alta" };
  }

  // Confianza media: coincidencia de palabra clave en el nombre del producto.
  for (const { label, pattern } of KEYWORD_PATTERNS) {
    if (pattern.test(candidate.name || "")) {
      return { label, source: "nombre", confidence: "media" };
    }
  }

  return null;
}

export function discountPercent(price, listPrice) {
  if (!listPrice || !price || listPrice <= price) return 0;
  return Math.round((1 - price / listPrice) * 100);
}
