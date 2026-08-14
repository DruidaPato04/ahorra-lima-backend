// Tottus NO es VTEX (es la plataforma propia de Falabella) y está detrás de
// Cloudflare con un challenge JS activo (lo confirmamos en vivo: las peticiones
// simples devuelven 503 "no healthy upstream" incluso después de que el script
// de Cloudflare corre). Por eso este adaptador usa un navegador real (Playwright)
// en vez de fetch() directo.
//
// IMPORTANTE: no pude verificar en vivo la estructura exacta de la página de
// resultados (el servicio de búsqueda de Tottus devolvió error durante las
// pruebas). Este adaptador intenta primero datos estructurados JSON-LD
// (schema.org/Product), que es el método más confiable si existen, y si no,
// cae a un heurístico de selectores CSS que hay que validar y ajustar contra
// el sitio real antes de confiar en él en producción. Diseñado para fallar
// limpio: si algo cambia, este adaptador reporta 0 resultados en vez de
// romper el resto del pipeline.

import { chromium } from "playwright";

const USER_AGENT = process.env.SCRAPER_USER_AGENT || "AhorraLimaBot/0.1";
const SEARCH_URL = (q) => `https://www.tottus.com.pe/tottus-pe/search?q=${encodeURIComponent(q)}`;

async function extractFromJsonLd(page) {
  const blocks = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => n.textContent)
  );
  const results = [];
  for (const raw of blocks) {
    try {
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const products = item["@type"] === "ItemList" ? (item.itemListElement || []).map((e) => e.item || e) : [item];
        for (const prod of products) {
          if (!prod || (prod["@type"] !== "Product" && !prod.offers)) continue;
          const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
          if (!offer || offer.price == null) continue;
          results.push({
            name: prod.name,
            brand: typeof prod.brand === "object" ? prod.brand?.name : prod.brand,
            ean: prod.gtin13 || prod.gtin || null,
            sku: prod.sku || null,
            price: Number(offer.price),
            listPrice: Number(offer.price),
            available: /InStock/i.test(offer.availability || ""),
            url: prod.url || null,
          });
        }
      }
    } catch {
      // bloque JSON-LD malformado o irrelevante, se ignora
    }
  }
  return results;
}

// Heurístico de respaldo: busca tarjetas de producto por atributos comunes.
// AJUSTAR estos selectores mirando el DOM real de tottus.com.pe antes de usar en producción.
async function extractFromDomHeuristic(page) {
  return page.$$eval('[data-testid*="product"], [class*="product-card" i]', (cards) =>
    cards
      .map((card) => {
        const name = card.querySelector('[class*="name" i], [data-testid*="name" i]')?.textContent?.trim();
        const priceText = card.querySelector('[class*="price" i], [data-testid*="price" i]')?.textContent || "";
        const price = parseFloat(priceText.replace(/[^\d.,]/g, "").replace(",", "."));
        const link = card.querySelector("a")?.href || null;
        return name && !Number.isNaN(price) ? { name, brand: null, ean: null, sku: null, price, listPrice: price, available: true, url: link } : null;
      })
      .filter(Boolean)
  );
}

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    // Si el lanzamiento falla, se limpia el caché para que el próximo
    // producto pueda reintentar en vez de quedar con una promesa
    // rechazada para siempre (eso fue lo que causó el crash del proceso).
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export default {
  id: "tottus",
  name: "Tottus",
  automated: true,
  automationNote:
    "Requiere Playwright (Cloudflare). Selectores CSS de respaldo no verificados en vivo — validar antes de confiar en ellos.",
  async search(query) {
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    try {
      await page.goto(SEARCH_URL(query), { waitUntil: "networkidle", timeout: 20000 });
      // deja correr el challenge de Cloudflare y la hidratación del front
      await page.waitForTimeout(2500);

      let results = await extractFromJsonLd(page);
      if (results.length === 0) results = await extractFromDomHeuristic(page);
      return results;
    } finally {
      await context.close();
    }
  },
  async close() {
    if (browserPromise) {
      const b = await browserPromise;
      await b.close();
      browserPromise = null;
    }
  },
};
