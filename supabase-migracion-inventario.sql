-- =========================================================
-- Migración: Inventario (Periquitos) con descuento de stock
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists inventario (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  descripcion text not null,
  cantidad int not null default 0,
  precio_compra_usd numeric not null default 0,
  precio_venta_usd numeric not null default 0,
  precio_compra_bs numeric not null default 0,
  precio_venta_bs numeric not null default 0,
  created_at timestamptz default now()
);

alter table inventario enable row level security;

-- Función auxiliar: ¿el usuario actual es Dueño o Gerente activo?
create or replace function is_dueno_o_gerente()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('dueno', 'gerente') and estado = 'activo'
  );
$$;

-- Lectura pública (la necesita la página de Registro para mostrar artículos y precios)
create policy "inventario_select_publico" on inventario for select using (true);

-- Solo Dueño/Gerente pueden crear, editar o eliminar artículos
create policy "inventario_write_dueno_gerente" on inventario for all
  using (is_dueno_o_gerente()) with check (is_dueno_o_gerente());

-- Función segura para descontar stock al vender (la usa Registro, sin login).
-- No permite editar nada más del artículo, solo restar cantidad, y nunca por debajo de 0.
create or replace function vender_articulo_inventario(p_id uuid, p_cantidad int)
returns void
language plpgsql
security definer
as $$
begin
  update inventario set cantidad = greatest(cantidad - p_cantidad, 0) where id = p_id;
end;
$$;
