// Adaptador compartido para tiendas VTEX (Plaza Vea, Wong, Metro).
// Usa la API pública de catálogo de VTEX, la misma que usa el propio sitio
// para pintar resultados de búsqueda — no requiere login ni token.

const USER_AGENT = process.env.SCRAPER_USER_AGENT || "AhorraLimaBot/0.1";

export function makeVtexAdapter({ id, name, baseUrl, automated = true, automationNote = null }) {
  return {
    id,
    name,
    baseUrl,
    automated,
    automationNote,
    async search(query, limit = 5) {
      const url = `${baseUrl}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=0&_to=${limit - 1}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      // VTEX responde 206 (Partial Content) en búsquedas normales — no es un error.
      if (!res.ok && res.status !== 206) {
        throw new Error(`${name}: VTEX search devolvió ${res.status}`);
      }
      const data = await res.json();
      return data
        .map((prod) => {
          const item = prod.items && prod.items[0];
          const seller = item && item.sellers && item.sellers[0];
          const offer = seller && seller.commertialOffer;
          if (!offer) return null;
          const teaserGroups = [offer.Teasers, offer.PromotionTeasers, offer.DiscountHighLight];
          const teasers = teaserGroups
            .flat()
            .filter(Boolean)
            .map((t) => (typeof t === "string" ? t : t.name || t.Name || null))
            .filter(Boolean);
          return {
            name: prod.productName,
            brand: prod.brand,
            ean: item.ean || null,
            sku: item.itemId || null,
            price: typeof offer.Price === "number" ? offer.Price : null,
            listPrice: typeof offer.ListPrice === "number" ? offer.ListPrice : null,
            available: !!offer.IsAvailable && (offer.AvailableQuantity ?? 0) > 0,
            url: prod.link || null,
            // Campo pensado por VTEX para insignias tipo "2x1"/"3x2". En la práctica
            // muchas tiendas lo dejan vacío aunque sí tengan la promo activa — ver
            // src/promotions.js para el heurístico de respaldo por texto.
            teasers,
          };
        })
        .filter((x) => x && x.price != null);
    },
  };
}
