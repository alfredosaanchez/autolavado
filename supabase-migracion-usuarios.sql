-- =========================================================
-- Migración: Usuarios con jerarquía (Dueño / Gerente / Cajero)
-- Ejecutar en: SQL Editor → New query → Run
-- =========================================================

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text default '',
  rol text not null default 'cajero',       -- 'cajero' | 'gerente' | 'dueno'
  estado text not null default 'pendiente', -- 'pendiente' | 'activo' | 'rechazado'
  created_at timestamptz default now()
);

alter table perfiles enable row level security;

-- Función auxiliar: ¿el usuario actual es Dueño activo? (evita recursión en RLS)
create or replace function is_dueno()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'dueno' and estado = 'activo'
  );
$$;

-- Cada quien ve su propio perfil; el Dueño ve todos
create policy "perfiles_select" on perfiles for select
  using (auth.uid() = id or is_dueno());

-- Solo el Dueño puede aprobar/cambiar nivel/rechazar
create policy "perfiles_update_dueno" on perfiles for update
  using (is_dueno()) with check (is_dueno());

-- Trigger: al crear una cuenta nueva (signup), se crea su perfil automáticamente
-- en estado "pendiente", esperando aprobación del Dueño.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.perfiles (id, email, nombre, rol, estado)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''), 'cajero', 'pendiente');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================================
-- IMPORTANTE: activa tu propio perfil como Dueño (una sola vez).
-- Si nunca has iniciado sesión con esa cuenta, hazlo primero
-- (te va a salir la pantalla de "pendiente"), y LUEGO corre esto:
-- =========================================================
update perfiles
set rol = 'dueno', estado = 'activo'
where email = 'alfredojsanchezss@gmail.com';
