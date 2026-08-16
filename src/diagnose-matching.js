// Script de diagnóstico (no forma parte del cron diario). Corre una muestra
// del catálogo contra Plaza Vea, Wong y Metro, y para cada "sin match"
// muestra el mejor candidato descartado y por qué — para calibrar el
// algoritmo con datos reales en vez de adivinar.
import { CATALOG } from "./catalog.js";
import { scoreCandidates } from "./matching.js";
import plazavea from "./adapters/plazavea.js";
import wong from "./adapters/wong.js";
import metro from "./adapters/metro.js";
import makro from "./adapters/makro.js";

const ADAPTERS = [plazavea, wong, metro, makro];
const sampleSize = Number(process.argv[2] || 25);
const sample = CATALOG.slice(0, sampleSize);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let noMatchCount = 0;
  let total = 0;

  for (const product of sample) {
    for (const adapter of ADAPTERS) {
      total++;
      let candidates;
      try {
        candidates = await adapter.search(product.searchTerms[0], 10, product.id);
      } catch (err) {
        console.log(`[${adapter.name}] ${product.name}: ERROR ${err.message}`);
        continue;
      }
      if (!candidates || candidates.length === 0) {
        console.log(`[${adapter.name}] ${product.name}: 0 candidatos devueltos por la búsqueda`);
        noMatchCount++;
        continue;
      }
      const scored = scoreCandidates(product, candidates).sort((a, b) => b.score - a.score);
      const top = scored[0];
      if (top.score < 0.55) {
        noMatchCount++;
        console.log(
          `[${adapter.name}] "${product.name}" (${product.presentation}) SIN MATCH — mejor candidato descartado (score ${top.score.toFixed(2)}):`
        );
        console.log(`    -> "${top.candidate.name}"  partes: ${JSON.stringify(top.parts)}`);
      }
      await sleep(300);
    }
  }

  console.log(`\nResumen muestra: ${noMatchCount}/${total} sin match (${((noMatchCount / total) * 100).toFixed(0)}%)`);
}

main();
