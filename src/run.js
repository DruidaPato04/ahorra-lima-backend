// Orquestador del actualizador diario de precios.
// Recorre el catálogo × las 5 cadenas, con una regla simple:
// si una cadena falla en un producto, se registra el error y se sigue con
// las demás — nunca debe tumbar la corrida completa (ver spec original,
// sección "Actualización automática de precios").

import "dotenv/config";
import { CATALOG } from "./catalog.js";
import { matchProduct } from "./matching.js";
import { ensureBrand, ensureCategory, upsertProduct, saveResult } from "./db.js";
import plazavea from "./adapters/plazavea.js";
import wong from "./adapters/wong.js";
import metro from "./adapters/metro.js";
import tottus from "./adapters/tottus.js";
import vivanda from "./adapters/vivanda.js";

const ADAPTERS = [plazavea, wong, metro, tottus, vivanda];
const DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveOneChain(adapter, product) {
  for (const term of product.searchTerms) {
    let candidates;
    try {
      candidates = await adapter.search(term, 5, product.id);
    } catch (err) {
      return { matched: false, error: `${adapter.name}: ${err.message}` };
    }
    if (!candidates || candidates.length === 0) continue;

    const match = matchProduct(product, candidates);
    if (match) {
      return {
        matched: true,
        price: match.candidate.price,
        listPrice: match.candidate.listPrice ?? match.candidate.price,
        available: match.candidate.available !== false,
        matchScore: match.score,
        matchedName: match.candidate.name,
        url: match.candidate.url || null,
        teasers: match.candidate.teasers || [],
      };
    }
  }
  return { matched: false, error: "sin match de confianza suficiente en ningún término de búsqueda" };
}

async function main() {
  const startedAt = Date.now();
  const summary = Object.fromEntries(ADAPTERS.map((a) => [a.id, { ok: 0, noMatch: 0, error: 0 }]));

  console.log(`Ahorra Lima — actualización de precios · ${CATALOG.length} productos × ${ADAPTERS.length} cadenas`);

  for (const product of CATALOG) {
    const brandId = await ensureBrand(product.brand);
    const categoryId = await ensureCategory(product.category);
    await upsertProduct(product, brandId, categoryId);

    for (const adapter of ADAPTERS) {
      const result = await resolveOneChain(adapter, product);
      await saveResult(product.id, adapter.id, result);

      if (result.matched) summary[adapter.id].ok++;
      else if (result.error?.startsWith(adapter.name)) summary[adapter.id].error++;
      else summary[adapter.id].noMatch++;

      if (adapter.automated) await sleep(DELAY_MS);
    }
  }

  if (typeof tottus.close === "function") await tottus.close();

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nListo en ${seconds}s.\n`);
  console.table(
    Object.fromEntries(
      ADAPTERS.map((a) => [
        a.name,
        { encontrados: summary[a.id].ok, sin_match: summary[a.id].noMatch, errores: summary[a.id].error },
      ])
    )
  );
}

main().catch((err) => {
  console.error("Falla no controlada en el actualizador:", err);
  process.exit(1);
});
