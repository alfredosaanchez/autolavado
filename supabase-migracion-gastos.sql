-- =========================================================
-- Migración: Gastos del negocio
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists gastos (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  descripcion text not null,
  categoria text default '',
  monto numeric not null default 0,
  moneda text not null default 'Bs',
  created_at timestamptz default now()
);

create index if not exists idx_gastos_fecha on gastos (fecha desc);

alter table gastos enable row level security;

-- Solo el panel admin (usuarios logueados) puede ver y gestionar gastos
create policy "gastos_all_admin" on gastos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
