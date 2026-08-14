import { createClient } from "@supabase/supabase-js";
import { detectPromotion, discountPercent } from "./promotions.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env y complétalo.");
}

export const supabase = createClient(url, key);

export async function ensureBrand(name) {
  if (!name) return null;
  const { data, error } = await supabase.from("brands").upsert({ name }, { onConflict: "name" }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function ensureCategory(name) {
  if (!name) return null;
  const { data, error } = await supabase.from("categories").upsert({ name }, { onConflict: "name" }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function upsertProduct(product, brandId, categoryId) {
  const { error } = await supabase.from("products").upsert(
    {
      id: product.id,
      name: product.name,
      brand_id: brandId,
      category_id: categoryId,
      presentation: product.presentation,
      qty: product.qty,
      unit: product.unit,
      ean: product.ean,
      search_terms: product.searchTerms,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

/**
 * Guarda el resultado de un intento de precio. Si el precio cambió respecto
 * al que ya teníamos, agrega una fila en price_history.
 */
export async function saveResult(productId, supermarketId, result) {
  const now = new Date().toISOString();

  if (!result.matched) {
    await supabase
      .from("product_prices")
      .upsert(
        {
          product_id: productId,
          supermarket_id: supermarketId,
          available: false,
          last_attempt_at: now,
          last_error: result.error || "sin match de confianza suficiente",
        },
        { onConflict: "product_id,supermarket_id" }
      );
    return { changed: false };
  }

  const { data: prev } = await supabase
    .from("product_prices")
    .select("price")
    .eq("product_id", productId)
    .eq("supermarket_id", supermarketId)
    .maybeSingle();

  const priceChanged = prev?.price == null || Number(prev.price) !== Number(result.price);

  const promo = detectPromotion({ name: result.matchedName, teasers: result.teasers });

  const { error } = await supabase.from("product_prices").upsert(
    {
      product_id: productId,
      supermarket_id: supermarketId,
      price: result.price,
      list_price: result.listPrice,
      promo_price: result.listPrice && result.price < result.listPrice ? result.price : null,
      discount_pct: discountPercent(result.price, result.listPrice),
      promo_label: promo?.label ?? null,
      promo_source: promo?.source ?? null,
      promo_confidence: promo?.confidence ?? null,
      available: result.available,
      match_score: result.matchScore,
      matched_name: result.matchedName,
      source_url: result.url,
      verified_at: now,
      last_attempt_at: now,
      last_error: null,
    },
    { onConflict: "product_id,supermarket_id" }
  );
  if (error) throw error;

  if (priceChanged) {
    const { error: histError } = await supabase.from("price_history").insert({
      product_id: productId,
      supermarket_id: supermarketId,
      price: result.price,
      recorded_at: now,
    });
    if (histError) throw histError;
  }

  return { changed: priceChanged };
}
