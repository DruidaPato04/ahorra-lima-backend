# Ahorra Lima — Backend de precios reales

Actualiza automáticamente, todos los días, los precios de ~80 productos en
Plaza Vea, Wong, Metro y Tottus (Vivanda es un caso aparte, ver más abajo).

## Qué se verificó en vivo antes de escribir este código

- **Plaza Vea, Wong, Metro** corren sobre **VTEX** y exponen una API pública de
  catálogo (`/api/catalog_system/pub/products/search`) que devuelve precio,
  stock, EAN y marca en JSON. Ninguna de las tres bloquea `/api/` en su
  `robots.txt`. Es la fuente más simple y confiable de las cinco.
- **Tottus** usa la plataforma propia de Falabella y está detrás de
  Cloudflare (challenge JS activo). Necesita un navegador real (Playwright),
  no una petición simple. Es la más frágil de las cuatro automatizadas.
- **Vivanda** prohíbe expresamente `/api/` en su `robots.txt`. No se
  automatiza — ver la sección "Vivanda" abajo.

## 1. Requisitos

- Cuenta gratuita en [supabase.com](https://supabase.com) (o cualquier Postgres — el código usa el cliente de Supabase por simplicidad, pero es Postgres estándar)
- Cuenta de GitHub (para correr el cron gratis con GitHub Actions)
- Node.js 18+

## 2. Base de datos

1. Crea un proyecto nuevo en Supabase.
2. Ve a **SQL Editor** y pega el contenido de [`db/schema.sql`](db/schema.sql). Ejecútalo una vez.
3. Ve a **Settings → API** y copia `Project URL` y `service_role key` (no la `anon key` — el actualizador necesita permisos de escritura).

## 3. Probar en tu máquina

```bash
cd ahorra-lima-backend
npm install
npx playwright install --with-deps chromium   # solo necesario para el adaptador de Tottus
cp .env.example .env
# edita .env con tu SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
```

Primero, una prueba rápida que **no** toca la base de datos, solo valida que
las tiendas responden y el matching encuentra los productos correctos:

```bash
npm run test-adapters
```

Si eso se ve bien, corre la actualización real (esta sí escribe en Supabase):

```bash
npm run update-prices
```

## 4. Dejarlo corriendo solo, todos los días (gratis)

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, agrega:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Listo. El workflow en [`.github/workflows/update-prices.yml`](.github/workflows/update-prices.yml)
   corre todos los días a las 8:15 a.m. hora de Lima. También puedes lanzarlo a mano desde
   la pestaña **Actions → Actualizar precios diarios → Run workflow**.

GitHub Actions da 2,000 minutos gratis al mes en repos privados (ilimitado en
públicos) — esta corrida toma unos pocos minutos, así que no debería costarte nada.

## 5. Vivanda — por qué no está automatizado

El `robots.txt` de `vivanda.com.pe` dice explícitamente `Disallow: /api/`, y
a diferencia de las otras cuatro, su sitio no expone el precio en el HTML
inicial ni en datos estructurados — solo se puede leer ejecutando su JS y
llamando a esa misma API que piden no tocar. En vez de ignorar esa política,
el adaptador de Vivanda lee de [`data/vivanda-manual-prices.json`](data/vivanda-manual-prices.json),
que se actualiza a mano.

Dos caminos reales para resolverlo de verdad:

1. **Escribir a Vivanda / InRetail** pidiendo acceso a un feed de precios —
   son el mismo grupo que Plaza Vea, así que no es descabellado.
2. Mientras tanto, actualizar el JSON manualmente cada cierto tiempo, o dejar
   que la app muestre Vivanda como "precio no verificado automáticamente"
   (la app ya tiene ese badge de frescura de datos).

## 6. Cómo se conecta esto con el frontend

Hoy el frontend (el artefacto de Ahorra Lima) usa datos de ejemplo generados
en el navegador. El siguiente paso, cuando quieras, es reemplazar esa capa de
datos por una API pequeña (puede ser Supabase directamente desde el
frontend, con Row Level Security de solo lectura) que lea de las tablas
`product_prices` y `price_history` que este actualizador va llenando.

## 7. Sé un buen ciudadano con estos sitios

Este proyecto está pensado para ser respetuoso, no agresivo:

- Solo ~80 productos × 5 cadenas × 1 vez al día — un footprint mínimo.
- `REQUEST_DELAY_MS` espacia las peticiones (por defecto 1.2s entre cada una).
- `SCRAPER_USER_AGENT` identifica honestamente al bot (cámbialo por algo con
  tu contacto real antes de ponerlo en producción — no finjas ser un navegador).
- Vivanda no se toca porque lo pidieron explícitamente.

Si esto crece más allá de un proyecto personal/MVP, lo correcto es escribirle
a cada cadena y pedir una vía oficial en vez de depender solo de scraping.
