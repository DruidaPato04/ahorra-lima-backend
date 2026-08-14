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

// Extrae algo como "1 l", "620 ml", "750g" del texto para comparar tamaños.
function extractSize(str) {
  const m = normalize(str).match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un|und|unidad|unidades)\b/);
  return m ? `${m[1]}${m[2]}` : null;
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

  const canonTokens = tokenize(`${canonical.brand} ${canonical.name}`);
  const canonSize = extractSize(canonical.presentation);

  let best = null;
  for (const c of candidates) {
    const candTokens = tokenize(`${c.brand || ""} ${c.name}`);
    let score = tokenSetScore(canonTokens, candTokens);

    // Bono si coincide marca exacta
    if (c.brand && normalize(c.brand) === normalize(canonical.brand)) score += 0.15;

    // Bono/penalización por tamaño: si ambos declaran tamaño y coincide, sube;
    // si ambos lo declaran y NO coincide, es probablemente otra presentación del mismo
    // producto (ej. 1L vs 500ml) — penaliza fuerte para no confundir precios.
    const candSize = extractSize(c.name);
    if (canonSize && candSize) {
      score += canonSize === candSize ? 0.15 : -0.35;
    }

    score = Math.max(0, Math.min(1, score));
    if (!best || score > best.score) best = { candidate: c, score };
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best;
}
