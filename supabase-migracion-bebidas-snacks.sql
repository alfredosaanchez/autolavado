-- =========================================================
-- Migración: Bebidas y Snacks configurables (con emoji)
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists bebidas_snacks (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  emoji text not null default '🥤',
  precio_bs numeric default 0,
  precio_usd numeric default 0,
  created_at timestamptz default now()
);

alter table bebidas_snacks enable row level security;

create policy "bebidas_snacks_select_publico" on bebidas_snacks for select using (true);
create policy "bebidas_snacks_write_admin" on bebidas_snacks for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Semilla inicial (solo si la tabla está vacía)
insert into bebidas_snacks (nombre, emoji, precio_bs, precio_usd)
select * from (values
  ('Cerveza', '🍺', 0, 0),
  ('Refresco', '🥤', 0, 0),
  ('Energizante', '⚡', 0, 0)
) as v(nombre, emoji, precio_bs, precio_usd)
where not exists (select 1 from bebidas_snacks);

-- La tabla vieja "bebidas_precios" ya no se usa, la puedes borrar si quieres:
-- drop table if exists bebidas_precios;
