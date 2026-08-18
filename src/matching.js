// Normaliza y compara nombres de producto entre nuestro catálogo canónico
// y lo que cada tienda devuelve, para decidir si son "el mismo producto".
//
// Regla del proyecto: nunca aceptar un match si hay mucha incertidumbre.
// Mejor marcar el precio como "no encontrado" que mezclar dos productos distintos.

const MATCH_THRESHOLD = 0.55;

export function normalize(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str) {
  return normalize(str).split(" ").filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function tokenSetScore(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  let hits = 0;
  for (const ta of tokensA) {
    let best = Infinity;
    for (const tb of tokensB) {
      if (Math.abs(ta.length - tb.length) > 3) continue;
      const d = levenshtein(ta, tb);
      if (d < best) best = d;
    }
    // Palabras muy cortas (<=4 letras) exigen coincidencia exacta: un solo
    // cambio de letra ahí suele producir una palabra totalmente distinta
    // ("oral" -> "coral" a distancia 1), y con nombres canónicos de 2-3
    // palabras un solo acierto de casualidad ya cruza el umbral de match.
    // Verificado en vivo: "Suero Oral" (rehidratación, ~S/3) hacía match
    // con un "Suero Labial ... Baby Coral" (cosmético, S/219) por esto.
    const tol = ta.length <= 4 ? 0 : 2;
    if (best <= tol) hits++;
  }
  return hits / tokensA.length;
}

// Extrae el tamaño de un texto y lo normaliza a una unidad comparable:
// kg/l se convierten a g/ml (misma escala, "volume-or-mass"), y un/unidad
// quedan aparte como "count". Así "1 L" y "1000 ml" se reconocen como el
// mismo tamaño en vez de compararse como texto literal distinto.
function extractSize(str) {
  const s = normalize(str);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un|und|unidad|unidades)\b/);
  if (m) {
    let value = parseFloat(m[1]);
    const unit = m[2];
    if (unit === "un" || unit === "und" || unit === "unidad" || unit === "unidades") {
      return { value, type: "count" };
    }
    if (unit === "kg" || unit === "l") value *= 1000;
    return { value, type: "volume-or-mass" };
  }
  const packMatch = s.match(/(?:pack\s*x?|paquete\s*x?|x)\s*(\d+)\b/);
  if (packMatch) return { value: parseFloat(packMatch[1]), type: "count" };
  return null;
}

function looksLikePack(text) {
  return /\bpack\b|\bpaquete\b/.test(normalize(text));
}

// "¿Es esto un pack/paquete de varias unidades?" — combina tres señales:
// la palabra "pack"/"paquete" en el texto, datos estructurados (qty>1 y
// unit="unidad" en nuestro catálogo), y el tamaño tipo "count" ya extraído
// (ej. "8un", "x6"). Antes solo se usaba la palabra literal para los
// candidatos de la tienda, y casi ninguna tienda peruana la escribe así
// (dicen "8un" directo) — eso rechazaba matches correctos por error.
function isPackLike(text, size, qty, unit) {
  if (unit === "unidad" && qty > 1) return true;
  if (looksLikePack(text)) return true;
  if (size && size.type === "count" && size.value > 1) return true;
  return false;
}

// Puntúa cada candidato contra el producto canónico. Se usa tanto para el
// match real como para diagnóstico (ver src/diagnose-matching.js).
export function scoreCandidates(canonical, candidates) {
  // Se dedupean para que la marca (repetida a propósito: una vez en
  // "brand", y de nuevo porque casi siempre también aparece dentro de
  // "name", ej. brand="Bella Holandesa" + name="Leche Bella Holandesa
  // Entera") no cuente doble como coincidencia — si no, dos palabras de
  // marca duplicadas ya cubren gran parte del token-set score sin que
  // ninguna palabra que describe el producto en sí haya coincidido.
  const canonTokens = [...new Set(tokenize(`${canonical.brand} ${canonical.name}`))];
  const brandTokens = new Set(tokenize(canonical.brand || ""));
  const canonDescriptorTokens = canonTokens.filter((t) => !brandTokens.has(t));
  const canonSize = extractSize(canonical.presentation);
  const canonIsPack = isPackLike(canonical.presentation, canonSize, canonical.qty, canonical.unit);

  return candidates.map((c) => {
    const candTokens = tokenize(`${c.brand || ""} ${c.name}`);
    let score = tokenSetScore(canonTokens, candTokens);
    const parts = { tokenScore: score };
    // Verificado en vivo: "Leche Bella Holandesa Entera" (1 L, leche
    // líquida) matcheaba con "Condensada BELLA HOLANDESA Lata 1Kg" (leche
    // condensada, producto totalmente distinto) con score 0.97 — las dos
    // coincidencias venían solo de "bella"/"holandesa" (la marca), y ni
    // "leche" ni "entera" (lo que de verdad describe el producto)
    // coincidían con nada. El bono de marca + el de tamaño (ambos ~1000
    // en la misma escala kg/L) alcanzaban igual el umbral. Si ninguna
    // palabra fuera de la marca coincide, jamás debería pasar el umbral
    // por más que marca y tamaño calcen — se limita el puntaje final más
    // abajo, después de sumar esos bonos.
    const noDescriptorMatch = canonDescriptorTokens.length > 0 && tokenSetScore(canonDescriptorTokens, candTokens) === 0;

    if (c.brand && normalize(c.brand) === normalize(canonical.brand)) {
      score += 0.15;
      parts.brandBonus = 0.15;
    }

    const candSize = extractSize(c.name);
    if (canonSize && candSize && canonSize.type === candSize.type) {
      const ratio = candSize.value / canonSize.value;
      const delta = ratio >= 0.85 && ratio <= 1.15 ? 0.15 : -0.6;
      score += delta;
      parts.sizeAdjust = delta;
      parts.canonSize = canonSize;
      parts.candSize = candSize;
    }

    if (canonIsPack !== isPackLike(c.name, candSize, null, null)) {
      score -= 0.5;
      parts.packMismatch = -0.5;
    }

    if (noDescriptorMatch) {
      score = Math.min(score, 0.3);
      parts.noDescriptorMatch = true;
    }

    return { candidate: c, score: Math.max(0, Math.min(1, score)), parts };
  });
}

/**
 * @param {object} canonical  producto de nuestro catálogo (name, brand, presentation, ean)
 * @param {Array<{name:string, brand?:string, ean?:string}>} candidates  resultados de la tienda
 * @returns {{candidate: object, score: number} | null}
 */
export function matchProduct(canonical, candidates) {
  if (!candidates || candidates.length === 0) return null;

  // 1. Si tenemos EAN y algún candidato lo comparte, es un match exacto.
  if (canonical.ean) {
    const exact = candidates.find((c) => c.ean && c.ean === canonical.ean);
    if (exact) return { candidate: exact, score: 1 };
  }

  const scored = scoreCandidates(canonical, candidates);
  const best = scored.reduce((a, b) => (!a || b.score > a.score ? b : a), null);

  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best;
}
