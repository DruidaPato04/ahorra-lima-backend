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
    const tol = ta.length <= 4 ? 1 : 2;
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

// Puntúa cada candidato contra el producto canónico. Se usa tanto para el
// match real como para diagnóstico (ver src/diagnose-matching.js).
export function scoreCandidates(canonical, candidates) {
  const canonTokens = tokenize(`${canonical.brand} ${canonical.name}`);
  const canonSize = extractSize(canonical.presentation);
  const canonIsPack = looksLikePack(canonical.presentation) || (canonical.qty > 1 && canonical.unit === "unidad");

  return candidates.map((c) => {
    const candTokens = tokenize(`${c.brand || ""} ${c.name}`);
    let score = tokenSetScore(canonTokens, candTokens);
    const parts = { tokenScore: score };

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

    if (canonIsPack !== looksLikePack(c.name)) {
      score -= 0.5;
      parts.packMismatch = -0.5;
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
