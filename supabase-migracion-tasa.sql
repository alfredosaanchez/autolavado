-- =========================================================
-- Migración: Tasa de cambio (configuración global)
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists configuracion (
  id int primary key default 1,
  tasa_usd_bs numeric not null default 1,
  updated_at timestamptz default now(),
  constraint configuracion_solo_una_fila check (id = 1)
);

insert into configuracion (id, tasa_usd_bs)
values (1, 1)
on conflict (id) do nothing;

alter table configuracion enable row level security;

-- Cualquiera puede leer la tasa (se muestra en la página de Registro)
create policy "configuracion_select_publico" on configuracion for select using (true);

-- Solo el panel admin (logueado) puede cambiarla
create policy "configuracion_update_admin" on configuracion for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
