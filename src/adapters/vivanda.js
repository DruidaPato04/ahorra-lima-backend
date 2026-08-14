// Vivanda es un caso especial: su robots.txt prohíbe explícitamente rastrear
// /api/ ("Disallow: /api/"), y su sitio no expone los datos de precio en el
// HTML inicial (no usa Next.js SSR con __NEXT_DATA__ ni JSON-LD de producto),
// así que la única forma de leer un precio es haciendo que un navegador
// ejecute JS y llame a esa misma API — justo lo que piden no hacer.
//
// Decisión: no automatizar Vivanda en contra de su política declarada.
// Este adaptador en su lugar lee de un archivo mantenido a mano
// (data/vivanda-manual-prices.json) para que la app pueda seguir mostrando
// Vivanda, dejando claro que ese precio no se verifica automáticamente.
//
// Alternativas reales a mediano plazo:
//   1. Escribir a Vivanda / InRetail (son el mismo grupo que Plaza Vea) pidiendo
//      acceso a un feed de precios — es la vía correcta y la más estable.
//   2. Actualizar data/vivanda-manual-prices.json a mano cada cierto tiempo.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANUAL_FILE = path.join(__dirname, "..", "..", "data", "vivanda-manual-prices.json");

let cache = null;
async function loadManualData() {
  if (cache) return cache;
  try {
    const raw = await readFile(MANUAL_FILE, "utf-8");
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache;
}

export default {
  id: "vivanda",
  name: "Vivanda",
  automated: false,
  automationNote:
    "robots.txt de vivanda.com.pe prohíbe /api/. No se automatiza por política del sitio; precios cargados a mano desde data/vivanda-manual-prices.json.",
  async search(query, limit, productId) {
    const data = await loadManualData();
    const entry = productId ? data[productId] : null;
    if (!entry) return [];
    return [
      {
        name: entry.name || query,
        brand: entry.brand || null,
        ean: null,
        sku: null,
        price: entry.price,
        listPrice: entry.listPrice ?? entry.price,
        available: entry.available !== false,
        url: entry.url || null,
        manualUpdatedAt: entry.updatedAt || null,
      },
    ];
  },
};
