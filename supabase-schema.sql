-- =========================================================
-- AutoLavado — Script de base de datos para Supabase
-- Ejecutar completo en: SQL Editor → New query → Run
-- =========================================================

-- Extensión para generar UUIDs e IDs
create extension if not exists "pgcrypto";

-- ---------- Tabla: servicios ----------
create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text default '',
  precio_bs numeric default 0,
  precio_usd numeric default 0,
  created_at timestamptz default now()
);

-- ---------- Tabla: lavadores ----------
create table if not exists lavadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz default now()
);

-- ---------- Tabla: bebidas_precios ----------
create table if not exists bebidas_precios (
  tipo text primary key, -- 'cerveza' | 'refresco' | 'energizante'
  precio_bs numeric default 0,
  precio_usd numeric default 0
);

-- ---------- Tabla: registros ----------
create table if not exists registros (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  estado text not null default 'PENDIENTE', -- PAGADO | PENDIENTE
  cliente jsonb not null,       -- { nombre, telefono }
  carro jsonb not null,         -- { modelo, color }
  servicio jsonb not null,      -- { id, nombre }
  bebidas jsonb not null,       -- { cerveza, refresco, energizante }
  periquitos jsonb default '{"descripcion":"","monto":0,"moneda":"Bs"}',
  pago jsonb not null,          -- { metodo, moneda, monto, referencia }
  lavador jsonb not null,       -- { id, nombre }
  porcentaje_lavador numeric default 0,
  propina jsonb not null,       -- { monto, moneda, referencia }
  created_at timestamptz default now()
);

create index if not exists idx_registros_fecha on registros (fecha desc);
create index if not exists idx_registros_estado on registros (estado);

-- ---------- Semillas (solo si las tablas están vacías) ----------
insert into servicios (nombre, descripcion, precio_bs, precio_usd)
select * from (values
  ('Serv1', 'Lavado básico', 0, 0),
  ('Serv2', 'Lavado + aspirado', 0, 0),
  ('Serv3', 'Lavado premium', 0, 0)
) as v(nombre, descripcion, precio_bs, precio_usd)
where not exists (select 1 from servicios);

insert into lavadores (nombre)
select * from (values ('Lavador 1'), ('Lavador 2')) as v(nombre)
where not exists (select 1 from lavadores);

insert into bebidas_precios (tipo, precio_bs, precio_usd) values
  ('cerveza', 0, 0),
  ('refresco', 0, 0),
  ('energizante', 0, 0)
on conflict (tipo) do nothing;

-- =========================================================
-- SEGURIDAD (Row Level Security)
-- Registro (sin login) puede: leer config, crear tickets,
-- leer/actualizar SOLO los tickets de HOY.
-- Panel Admin (con login) puede: todo, sin restricción.
-- =========================================================

alter table servicios enable row level security;
alter table lavadores enable row level security;
alter table bebidas_precios enable row level security;
alter table registros enable row level security;

-- Servicios: lectura pública, escritura solo admin (logueado)
create policy "servicios_select_publico" on servicios for select using (true);
create policy "servicios_write_admin" on servicios for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Lavadores: lectura pública, escritura solo admin
create policy "lavadores_select_publico" on lavadores for select using (true);
create policy "lavadores_write_admin" on lavadores for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bebidas: lectura pública, escritura solo admin
create policy "bebidas_select_publico" on bebidas_precios for select using (true);
create policy "bebidas_write_admin" on bebidas_precios for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Registros: público puede crear e insertar
create policy "registros_insert_publico" on registros for insert with check (true);

-- Registros: público solo ve/edita los de HOY; admin ve/edita todo
create policy "registros_select_hoy_o_admin" on registros for select
  using (
    fecha >= date_trunc('day', now())
    or auth.role() = 'authenticated'
  );

create policy "registros_update_hoy_o_admin" on registros for update
  using (
    fecha >= date_trunc('day', now())
    or auth.role() = 'authenticated'
  );

-- Solo admin puede borrar registros
create policy "registros_delete_admin" on registros for delete
  using (auth.role() = 'authenticated');

-- =========================================================
-- Listo. Ahora ve a Authentication → Users → Add user
-- para crear tu(s) usuario(s) administrador(es).
-- =========================================================
