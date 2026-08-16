-- Ahorra Lima — esquema de base de datos (Postgres / Supabase)
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
-- Es seguro volver a correr este archivo completo: todo usa "if not exists".

create extension if not exists "pgcrypto";

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists supermarkets (
  id text primary key,              -- 'plazavea' | 'wong' | 'metro' | 'tottus' | 'vivanda'
  name text not null,
  base_url text not null,
  color text not null,
  automated boolean not null default true,   -- false para cadenas sin scraping automático (ver Vivanda)
  automation_note text
);

create table if not exists stores (
  id text primary key,
  supermarket_id text not null references supermarkets(id),
  name text not null,
  place text,
  district text,
  lat double precision,
  lng double precision
);

create table if not exists products (
  id text primary key,              -- mismo id usado en el catálogo del frontend
  name text not null,
  brand_id uuid references brands(id),
  category_id uuid references categories(id),
  presentation text,
  qty numeric,
  unit text,                        -- 'L' | 'ml' | 'kg' | 'g' | 'unidad'
  ean text,
  search_terms text[] not null default '{}'
);

-- Estado ACTUAL de precio por producto+supermercado (lo que consume el frontend)
create table if not exists product_prices (
  product_id text not null references products(id),
  supermarket_id text not null references supermarkets(id),
  price numeric,
  list_price numeric,
  promo_price numeric,
  discount_pct numeric,             -- % de descuento real (price vs list_price), siempre confiable
  promo_label text,                 -- ej. "2x1" — heurístico, ver promo_confidence
  promo_source text,                -- 'teaser' (lo dio la tienda) | 'nombre' (detectado por texto)
  promo_confidence text,            -- 'alta' | 'media' — nunca tratar como 100% garantizado
  available boolean not null default false,
  match_score numeric,              -- confianza del matching (0-1), null si no se encontró
  matched_name text,                -- nombre exacto que devolvió la tienda (auditoría)
  source_url text,
  verified_at timestamptz,          -- última vez que se pudo confirmar el precio con éxito
  last_attempt_at timestamptz,      -- última vez que se INTENTÓ (haya funcionado o no)
  last_error text,                  -- si el último intento falló, por qué
  primary key (product_id, supermarket_id)
);

-- Por si ya tenías esta tabla creada antes de agregar las columnas de promoción:
alter table product_prices add column if not exists discount_pct numeric;
alter table product_prices add column if not exists promo_label text;
alter table product_prices add column if not exists promo_source text;
alter table product_prices add column if not exists promo_confidence text;

-- Historial: una fila por cada vez que el precio cambia (no una fila por día)
create table if not exists price_history (
  id bigint generated always as identity primary key,
  product_id text not null references products(id),
  supermarket_id text not null references supermarkets(id),
  price numeric not null,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_price_history_lookup on price_history(product_id, supermarket_id, recorded_at desc);

-- Entidades del lado de la app (no las toca el actualizador de precios, pero completan el modelo).
-- users.id es el MISMO id que genera Supabase Auth (auth.users.id) — no uno
-- propio — así una fila acá siempre corresponde 1 a 1 con una sesión real.
-- (La migración de una sola vez que recreaba estas tablas ya se ejecutó —
-- ver el historial de git si hace falta repetirla. Ya hay cuentas reales
-- usando esto, así que de aquí en adelante todo es "if not exists".)

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  product_id text not null references products(id),
  qty integer not null default 1,
  unique (shopping_list_id, product_id)
);

create table if not exists favorites (
  user_id uuid not null references users(id) on delete cascade,
  product_id text not null references products(id),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Semilla de las 5 cadenas
insert into supermarkets (id, name, base_url, color, automated, automation_note) values
  ('plazavea', 'Plaza Vea', 'https://www.plazavea.com.pe', '#C9483A', true, null),
  ('wong',     'Wong',      'https://www.wong.pe',          '#2F8F52', true, null),
  ('metro',    'Metro',     'https://www.metro.pe',          '#D98A2B', true, null),
  ('makro',    'Makro',     'https://www.makro.plazavea.com.pe', '#00529B', true, null),
  ('tottus',   'Tottus',    'https://www.tottus.com.pe',     '#A6488B', true, 'Requiere navegador headless (Cloudflare). Más frágil que las VTEX.'),
  ('vivanda',  'Vivanda',   'https://www.vivanda.com.pe',    '#3B7DC4', false, 'robots.txt de Vivanda prohíbe expresamente /api/. No se automatiza; requiere carga manual o acuerdo con InRetail.')
on conflict (id) do nothing;

-- ============================================================
-- Seguridad (Row Level Security)
-- ============================================================
-- El actualizador de precios usa la "service_role key" (solo en GitHub
-- Actions, nunca en el navegador), que siempre puede leer y escribir sin
-- importar estas reglas. Lo de abajo es lo que puede hacer cualquier
-- visitante de la app, que solo tiene la llave pública ("anon").

alter table brands enable row level security;
alter table categories enable row level security;
alter table supermarkets enable row level security;
alter table stores enable row level security;
alter table products enable row level security;
alter table product_prices enable row level security;
alter table price_history enable row level security;
alter table users enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table favorites enable row level security;

-- Catálogo y precios: cualquiera puede LEER (la app los necesita para
-- mostrar precios), nadie puede escribir con la llave pública.
drop policy if exists "Lectura pública" on brands;
create policy "Lectura pública" on brands for select using (true);
drop policy if exists "Lectura pública" on categories;
create policy "Lectura pública" on categories for select using (true);
drop policy if exists "Lectura pública" on supermarkets;
create policy "Lectura pública" on supermarkets for select using (true);
drop policy if exists "Lectura pública" on stores;
create policy "Lectura pública" on stores for select using (true);
drop policy if exists "Lectura pública" on products;
create policy "Lectura pública" on products for select using (true);
drop policy if exists "Lectura pública" on product_prices;
create policy "Lectura pública" on product_prices for select using (true);
drop policy if exists "Lectura pública" on price_history;
create policy "Lectura pública" on price_history for select using (true);

-- users / shopping_lists / shopping_list_items / favorites: cada quien
-- puede leer y escribir SOLO lo suyo, identificado por auth.uid() (el id
-- de la sesión, que Supabase valida a partir del token del usuario que
-- inició sesión). Sin sesión iniciada, auth.uid() es null y estas tablas
-- quedan completamente cerradas — igual que antes de tener login.
drop policy if exists "Cada quien ve y edita su propio perfil" on users;
create policy "Cada quien ve y edita su propio perfil" on users
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Cada quien ve y edita sus propias listas" on shopping_lists;
create policy "Cada quien ve y edita sus propias listas" on shopping_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Cada quien ve y edita items de sus propias listas" on shopping_list_items;
create policy "Cada quien ve y edita items de sus propias listas" on shopping_list_items
  for all using (
    exists (select 1 from shopping_lists sl where sl.id = shopping_list_id and sl.user_id = auth.uid())
  ) with check (
    exists (select 1 from shopping_lists sl where sl.id = shopping_list_id and sl.user_id = auth.uid())
  );

drop policy if exists "Cada quien ve y edita sus propios favoritos" on favorites;
create policy "Cada quien ve y edita sus propios favoritos" on favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
