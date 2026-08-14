// Prueba rápida y sin base de datos: corre el matching real contra las tiendas
// para un puñado de productos, para validar que todo sigue funcionando antes
// de conectar Supabase. Uso: npm run test-adapters
import "dotenv/config";
import { CATALOG } from "./catalog.js";
import { matchProduct } from "./matching.js";
import { detectPromotion, discountPercent } from "./promotions.js";
import plazavea from "./adapters/plazavea.js";
import wong from "./adapters/wong.js";
import metro from "./adapters/metro.js";
import tottus from "./adapters/tottus.js";

const ADAPTERS = [plazavea, wong, metro, tottus];
const sampleIds = ["leche-gloria-entera-1l", "coca-cola-zero-1.5l", "cerveza-pilsen-callao-620ml", "pollo-entero-san-fernando-kg"];

async function run() {
  for (const id of sampleIds) {
    const product = CATALOG.find((p) => p.id === id);
    console.log(`\n=== ${product.name} (${product.presentation}) ===`);
    for (const adapter of ADAPTERS) {
      try {
        const candidates = await adapter.search(product.searchTerms[0], 5, product.id);
        const match = matchProduct(product, candidates);
        if (match) {
          const pct = discountPercent(match.candidate.price, match.candidate.listPrice);
          const promo = detectPromotion(match.candidate);
          const promoTxt = promo ? `  [${promo.label} · confianza ${promo.confidence}]` : "";
          console.log(
            `  ${adapter.name.padEnd(10)} OK   S/ ${match.candidate.price.toFixed(2)}${pct ? ` (-${pct}%)` : ""}  (match ${(match.score * 100).toFixed(0)}%)  -> "${match.candidate.name}"${promoTxt}`
          );
        } else {
          console.log(`  ${adapter.name.padEnd(10)} SIN MATCH  (${candidates.length} candidatos, ninguno confiable)`);
        }
      } catch (err) {
        console.log(`  ${adapter.name.padEnd(10)} ERROR  ${err.message}`);
      }
    }
  }
  if (typeof tottus.close === "function") await tottus.close();
}

run();
