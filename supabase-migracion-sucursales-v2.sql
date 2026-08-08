-- =========================================================
-- Migración: Multi-sucursal (Sucursal I / Sucursal II)
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz default now()
);

insert into sucursales (nombre)
select * from (values ('Sucursal I'), ('Sucursal II')) as v(nombre)
where not exists (select 1 from sucursales);

-- ---------- Agregar columna sucursal_id a todo lo operativo ----------
alter table perfiles add column if not exists sucursal_id uuid references sucursales(id);
alter table servicios add column if not exists sucursal_id uuid references sucursales(id);
alter table bebidas_snacks add column if not exists sucursal_id uuid references sucursales(id);
alter table inventario add column if not exists sucursal_id uuid references sucursales(id);
alter table lavadores add column if not exists sucursal_id uuid references sucursales(id);
alter table registros add column if not exists sucursal_id uuid references sucursales(id);
alter table gastos add column if not exists sucursal_id uuid references sucursales(id);

-- ---------- Todo lo que ya existía se asigna a la primera sucursal (para no perder nada) ----------
do $$
declare v_primera uuid;
begin
  select id into v_primera from sucursales order by created_at limit 1;
  update servicios set sucursal_id = v_primera where sucursal_id is null;
  update bebidas_snacks set sucursal_id = v_primera where sucursal_id is null;
  update inventario set sucursal_id = v_primera where sucursal_id is null;
  update lavadores set sucursal_id = v_primera where sucursal_id is null;
  update registros set sucursal_id = v_primera where sucursal_id is null;
  update gastos set sucursal_id = v_primera where sucursal_id is null;
end $$;

-- ---------- Función auxiliar: sucursal asignada al usuario actual (solo aplica a Cajero) ----------
create or replace function mi_sucursal()
returns uuid
language sql
security definer
stable
as $$
  select sucursal_id from perfiles where id = auth.uid();
$$;

-- ---------- RLS de sucursales ----------
alter table sucursales enable row level security;
drop policy if exists "sucursales_select_auth" on sucursales;
create policy "sucursales_select_auth" on sucursales for select using (auth.role() = 'authenticated');
drop policy if exists "sucursales_write_dueno" on sucursales;
create policy "sucursales_write_dueno" on sucursales for all using (is_dueno()) with check (is_dueno());

-- =========================================================
-- IMPORTANTE: la página de Registro ahora exige login para
-- TODOS (antes era pública). Por eso quitamos las políticas
-- "select_publico" / "insert_publico" viejas y las cambiamos
-- por políticas que exigen sesión + sucursal correcta.
-- =========================================================

drop policy if exists "servicios_select_publico" on servicios;
drop policy if exists "bebidas_snacks_select_publico" on bebidas_snacks;
drop policy if exists "inventario_select_publico" on inventario;
drop policy if exists "lavadores_select_publico" on lavadores;
drop policy if exists "registros_insert_publico" on registros;
drop policy if exists "registros_select_hoy_o_admin" on registros;
drop policy if exists "registros_update_hoy_o_admin" on registros;

drop policy if exists "servicios_select_por_sucursal" on servicios;
create policy "servicios_select_por_sucursal" on servicios for select
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "bebidas_select_por_sucursal" on bebidas_snacks;
create policy "bebidas_select_por_sucursal" on bebidas_snacks for select
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "inventario_select_por_sucursal" on inventario;
create policy "inventario_select_por_sucursal" on inventario for select
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "lavadores_select_por_sucursal" on lavadores;
create policy "lavadores_select_por_sucursal" on lavadores for select
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "registros_insert_por_sucursal" on registros;
create policy "registros_insert_por_sucursal" on registros for insert
  with check (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "registros_select_por_sucursal" on registros;
create policy "registros_select_por_sucursal" on registros for select
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

drop policy if exists "registros_update_por_sucursal" on registros;
create policy "registros_update_por_sucursal" on registros for update
  using (is_dueno_o_gerente() or sucursal_id = mi_sucursal());

-- =========================================================
-- Para renombrar las sucursales a como se llamen de verdad:
--
-- update sucursales set nombre = 'Nombre real 1' where nombre = 'Sucursal I';
-- update sucursales set nombre = 'Nombre real 2' where nombre = 'Sucursal II';
--
-- Para asignarle sucursal a un Cajero ya existente:
--
-- update perfiles set sucursal_id = (select id from sucursales where nombre = 'Sucursal I')
-- where email = 'correo_del_cajero@ejemplo.com';
-- =========================================================
