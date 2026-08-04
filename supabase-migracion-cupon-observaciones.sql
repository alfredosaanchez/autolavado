-- =========================================================
-- Migración: Cupón 50% y Observaciones en registros
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

alter table registros add column if not exists cupon_aplicado boolean not null default false;
alter table registros add column if not exists observaciones text not null default '';
