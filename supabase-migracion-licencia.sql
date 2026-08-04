-- =========================================================
-- Migración: Licencia / candado de pago
-- Ejecutar en: SQL Editor → New query → Run
-- Solo TÚ (rol 'dueno') puedes cambiar esto — ni Gerente ni
-- Cajero pueden verlo editable, y el cliente nunca entra a Supabase.
-- =========================================================

create table if not exists licencia (
  id int primary key default 1,
  activo boolean not null default true,
  fecha_vencimiento date not null default (current_date + interval '1 month'),
  dias_aviso int not null default 5,
  mensaje_bloqueo text not null default 'Este sistema está temporalmente desactivado. Contacta al proveedor para reactivarlo.',
  constraint licencia_solo_una_fila check (id = 1)
);

insert into licencia (id, activo, fecha_vencimiento, dias_aviso, mensaje_bloqueo)
values (1, true, current_date + interval '1 month', 5, 'Este sistema está temporalmente desactivado. Contacta al proveedor para reactivarlo.')
on conflict (id) do nothing;

alter table licencia enable row level security;

-- Lectura pública: la app necesita consultarlo SIN login (incluso en la página de Registro)
create policy "licencia_select_publico" on licencia for select using (true);

-- Solo el Dueño (tú) puede cambiarlo. Gerente y Cajero no pueden, aunque estén logueados.
create policy "licencia_update_dueno" on licencia for update
  using (is_dueno()) with check (is_dueno());

-- =========================================================
-- Para renovar cuando el cliente pague, corre esto (ajusta la fecha):
--
-- update licencia set fecha_vencimiento = '2026-12-01', activo = true where id = 1;
--
-- Para bloquear el sistema manualmente en cualquier momento:
--
-- update licencia set activo = false where id = 1;
-- =========================================================
